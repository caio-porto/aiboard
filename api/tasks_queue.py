import api.db_utils
"""Background Task Manager, Execution Queue, Topology/Memory Store, and User Access Control for CrewAI."""
import os
import time
import uuid
import json
import sqlite3
import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import requests

try:
    from crews.operational_crew import run_operational_crew
    from crews.financial_crew import run_financial_crew
except ImportError:
    run_operational_crew = None
    run_financial_crew = None

logger = logging.getLogger(__name__)

BRT = timezone(timedelta(hours=-3))
_ALERT_THROTTLE_CACHE: Dict[str, float] = {}

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "tasks.db")

ALLOWED_DOMAINS = [d.strip().lower().lstrip("@") for d in os.getenv("ALLOWED_GOOGLE_DOMAINS", "*").split(",") if d.strip()]

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        # Tabela de tarefas de background
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_tasks (
                task_id TEXT PRIMARY KEY,
                crew_name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                requester TEXT,
                telegram_chat_id TEXT,
                status TEXT NOT NULL,
                result TEXT,
                error TEXT,
                created_at REAL NOT NULL,
                started_at REAL,
                completed_at REAL,
                user_email TEXT,
                user_name TEXT
            )
        """)
        # Migração defensiva: adiciona colunas se tabela já existia
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(agent_tasks)")
        cols = [c[1] for c in cur.fetchall()]
        if "user_email" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN user_email TEXT")
        if "user_name" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN user_name TEXT")
        if "prompt_tokens" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN prompt_tokens INTEGER DEFAULT 0")
        if "completion_tokens" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN completion_tokens INTEGER DEFAULT 0")
        if "total_tokens" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN total_tokens INTEGER DEFAULT 0")
        if "cost_brl" not in cols:
            conn.execute("ALTER TABLE agent_tasks ADD COLUMN cost_brl REAL DEFAULT 0.0")

        # Tabela de Usuários e Níveis de Acesso ('admin' | 'user')
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                picture TEXT,
                role TEXT NOT NULL DEFAULT 'user',
                language TEXT DEFAULT 'en',
                created_at REAL NOT NULL,
                last_login REAL NOT NULL
            )
        """)
        try:
            conn.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'")
        except Exception:
            pass

        # Configurações do sistema
        conn.execute("""
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # 1. Topologia Visual do Studio (Nós, Arestas)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS canvas_topology (
                id TEXT PRIMARY KEY DEFAULT 'current',
                nodes_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # 2. Memória Individual de cada Agente
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_memories (
                agent_id TEXT PRIMARY KEY,
                name TEXT,
                role TEXT,
                memory_text TEXT NOT NULL,
                learned_facts TEXT,
                updated_at REAL NOT NULL
            )
        """)
        # 3. Personalidade de cada Agente
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_personalities (
                agent_id TEXT PRIMARY KEY,
                tone TEXT NOT NULL,
                guidelines TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # 4. Town Hall da Empresa (Objetivos e OKRs Globais)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS company_town_hall (
                id TEXT PRIMARY KEY DEFAULT 'current',
                vision TEXT NOT NULL,
                okrs TEXT NOT NULL,
                guidelines TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # 5. Mutex de Execução para proteção de topologia ativa
        conn.execute("""
            CREATE TABLE IF NOT EXISTS execution_mutex (
                id TEXT PRIMARY KEY DEFAULT 'current',
                is_locked INTEGER NOT NULL DEFAULT 0,
                current_task_id TEXT,
                snapshot_nodes TEXT,
                snapshot_edges TEXT,
                locked_at REAL
            )
        """)
        # 6. Cache persistente do último diagnóstico de ferramentas
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tools_health_cache (
                tool_id TEXT PRIMARY KEY,
                health_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # 7. Logs de Execução em Tempo Real
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agent_task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                level TEXT NOT NULL,
                agent_name TEXT,
                message TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_task_logs ON agent_task_logs(task_id, id);")

        # 8. Tabela de Ações Pendentes de Validação (Human-in-the-Loop)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pending_actions (
                action_id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                summary TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at REAL NOT NULL,
                resolved_at REAL,
                resolved_by TEXT,
                execution_result TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions (status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pending_actions_task ON pending_actions (task_id)")

        # 9. Tabela de Aprovadores do Telegram (Multi-Usuários)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telegram_approvers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT UNIQUE,
                username TEXT,
                name TEXT,
                role TEXT DEFAULT 'approver',
                can_approve INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1,
                added_at REAL NOT NULL,
                added_by TEXT,
                last_interaction_at REAL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tg_approvers_active ON telegram_approvers(is_active, can_approve)")

        # 10. Registro de Mensagens Enviadas aos Aprovadores para Sincronização em Tempo Real (Broadcast)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS action_approver_dispatches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_id TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                message_id INTEGER NOT NULL,
                dispatched_at REAL NOT NULL,
                UNIQUE(action_id, chat_id)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_act_dispatches ON action_approver_dispatches(action_id)")

        # 11. Tabelas do Meta-Agente Evolucionário e Arquiteto de Sistema (Antigravity Zero-Cost)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS evolution_tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                risk_level TEXT NOT NULL DEFAULT 'LOW',
                expected_impact TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                target_name TEXT,
                payload_json TEXT NOT NULL,
                execution_logs_json TEXT NOT NULL DEFAULT '[]',
                snapshot_id TEXT,
                tokens_cost INTEGER NOT NULL DEFAULT 0,
                estimated_savings_brl REAL NOT NULL DEFAULT 0.0,
                author TEXT NOT NULL DEFAULT 'Meta-Agente Antigravity',
                approved_by TEXT,
                rolled_back_by TEXT,
                created_at REAL NOT NULL,
                started_at REAL,
                completed_at REAL,
                rolled_back_at REAL,
                dedup_key TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS system_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                previous_state_json TEXT NOT NULL,
                new_state_json TEXT,
                created_at REAL NOT NULL,
                restored_at REAL,
                restored_by TEXT,
                is_restored INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS evolution_settings (
                id TEXT PRIMARY KEY DEFAULT 'global',
                full_auto_mode INTEGER NOT NULL DEFAULT 0,
                allowed_categories_json TEXT NOT NULL,
                max_auto_risk_level TEXT NOT NULL DEFAULT 'LOW',
                semantic_cache_enabled INTEGER NOT NULL DEFAULT 1,
                context_compression_enabled INTEGER NOT NULL DEFAULT 1,
                smart_model_routing_enabled INTEGER NOT NULL DEFAULT 1,
                zero_cost_antigravity_mode INTEGER NOT NULL DEFAULT 1,
                last_audit_at REAL,
                updated_at REAL NOT NULL,
                updated_by TEXT DEFAULT 'Sistema'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS evolution_live_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                step TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                details_json TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS semantic_prompt_cache (
                prompt_hash TEXT PRIMARY KEY,
                normalized_prompt TEXT NOT NULL,
                crew_name TEXT NOT NULL,
                response_text TEXT NOT NULL,
                hits INTEGER NOT NULL DEFAULT 0,
                tokens_saved INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            )
        """)

        now = time.time()
        # Limpa automaticamente tarefas órfãs e destrava mutex causados por reinicializações do servidor
        conn.execute("UPDATE execution_mutex SET is_locked = 0, current_task_id = NULL, locked_at = NULL WHERE is_locked = 1")
        conn.execute("""
            UPDATE agent_tasks 
            SET status = 'FAILED', 
                error = '⚠️ Execução interrompida por reinicialização do servidor. (Nenhum token gasto)', 
                completed_at = ? 
            WHERE status IN ('RUNNING', 'QUEUED')
        """, (now,))
        conn.commit()
        # Seed inicial apenas se a tabela de usuários estiver vazia e ADMIN_EMAIL estiver definido
        cur.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
            if admin_email:
                admin_name = os.getenv("ADMIN_NAME", "Administrador")
                conn.execute("""
                    INSERT INTO users (email, name, picture, role, created_at, last_login)
                    VALUES (?, ?, '', 'admin', ?, ?)
                """, (admin_email, admin_name, now, now))

        # Inicializa Town Hall padrão se vazio
        cur.execute("SELECT COUNT(*) FROM company_town_hall WHERE id = 'current'")
        if cur.fetchone()[0] == 0:
            conn.execute("""
                INSERT INTO company_town_hall (id, vision, okrs, guidelines, updated_at)
                VALUES (
                    'current',
                    'Ser a organização líder e referência em excelência operacional, inteligência de mercado e tomada de decisão autônoma.',
                    '1. Garantir eficiência operacional e saúde financeira contínua.\n2. Manter alta disponibilidade de serviços e satisfação de clientes.\n3. Entregar respostas imediatas e relatórios confiáveis para a diretoria.',
                    'Priorizar sempre a integridade dos dados, clareza nas conclusões e segurança operacional.',
                    ?
                )
            """, (now,))

        # Seed inicial de aprovadores Telegram se vazio
        cur.execute("SELECT COUNT(*) FROM telegram_approvers")
        if cur.fetchone()[0] == 0:
            cur.execute("SELECT value FROM system_settings WHERE key = 'telegram_default_chat_id'")
            row_set = cur.fetchone()
            def_chat = row_set[0] if (row_set and row_set[0]) else os.getenv("TELEGRAM_DEFAULT_CHAT_ID", "")
            if def_chat:
                conn.execute("""
                    INSERT OR IGNORE INTO telegram_approvers (chat_id, username, name, role, can_approve, is_active, added_at, added_by)
                    VALUES (?, 'AdminApprover', 'Administrador Principal', 'admin', 1, 1, ?, 'system')
                """, (def_chat, now))
        conn.commit()

init_db()

# --- GESTÃO DE USUÁRIOS E NÍVEIS DE ACESSO ---
def is_email_domain_valid(email: str) -> bool:
    email_clean = (email or "").strip().lower()
    raw_domains = get_setting("allowed_domains")
    domains = [d.strip().lower().lstrip("@") for d in raw_domains.split(",") if d.strip()] if raw_domains else ALLOWED_DOMAINS
    if not domains or "*" in domains:
        return True
    return any(email_clean.endswith(f"@{domain}") for domain in domains)

def get_user(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["language"] = d.get("language") or get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en")
        return d

def get_or_create_user(email: str, name: str, picture: str = "") -> Dict[str, Any]:
    email_clean = (email or "").strip().lower()
    if not is_email_domain_valid(email_clean):
        raise ValueError("Domínio de e-mail não autorizado a acessar a plataforma.")

    now = time.time()
    existing = get_user(email_clean)
    if existing:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                UPDATE users SET last_login = ?, name = coalesce(nullif(?, ''), name), picture = coalesce(nullif(?, ''), picture)
                WHERE lower(email) = lower(?)
            """, (now, name, picture, email_clean))
            conn.commit()
        existing["last_login"] = now
        if name:
            existing["name"] = name
        existing["language"] = existing.get("language") or get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en")
        return existing

    # Novo usuário: o primeiro usuário cadastrado ou ADMIN_EMAIL torna-se admin; demais recebem 'user'
    default_lang = get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en")
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        count = cur.fetchone()[0]
        admin_email_env = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
        role = "admin" if (count == 0 or (admin_email_env and email_clean == admin_email_env)) else "user"
        display_name = name or email_clean.split("@")[0].replace(".", " ").title()

        conn.execute("""
            INSERT INTO users (email, name, picture, role, language, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (email_clean, display_name, picture or "", role, default_lang, now, now))
        conn.commit()

        return {
            "email": email_clean,
            "name": display_name,
            "picture": picture or "",
            "role": role,
            "language": default_lang,
            "created_at": now,
            "last_login": now
        }

def list_users() -> List[Dict[str, Any]]:
    default_lang = get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en")
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT email, name, picture, role, language, created_at, last_login FROM users ORDER BY role DESC, name ASC")
        users = []
        for row in cur.fetchall():
            d = dict(row)
            d["language"] = d.get("language") or default_lang
            users.append(d)
        return users

def set_user_language(email: str, language: str) -> Optional[Dict[str, Any]]:
    if language not in ("en", "pt-BR", "es"):
        raise ValueError("Unsupported language. Use 'en', 'pt-BR', or 'es'.")
    email_clean = (email or "").strip().lower()
    if not email_clean:
        raise ValueError("Invalid email.")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE users SET language = ? WHERE lower(email) = lower(?)", (language, email_clean))
        conn.commit()
    return get_user(email_clean)

def set_user_role(target_email: str, new_role: str) -> Optional[Dict[str, Any]]:
    if new_role not in ("admin", "user"):
        raise ValueError("Nível de acesso inválido. Use 'admin' ou 'user'.")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE users SET role = ? WHERE lower(email) = lower(?)", (new_role, target_email.strip()))
        conn.commit()
    return get_user(target_email)

def add_user(email: str, name: Optional[str] = None, role: str = "user") -> Dict[str, Any]:
    email_clean = email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise ValueError("E-mail corporativo inválido.")
    if role not in ("admin", "user"):
        raise ValueError("Nível de acesso inválido. Use 'admin' ou 'user'.")
    
    clean_name = name.strip() if name and name.strip() else email_clean.split("@")[0].replace(".", " ").title()
    default_lang = get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en")
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO users (email, name, picture, role, language, created_at, last_login)
            VALUES (?, ?, '', ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                name = COALESCE(NULLIF(excluded.name, ''), users.name),
                role = excluded.role
        """, (email_clean, clean_name, role, default_lang, now, now))
        conn.commit()
    return get_user(email_clean)

def delete_user(target_email: str) -> bool:
    email_clean = target_email.strip().lower()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE lower(email) = lower(?)", (email_clean,))
        conn.commit()
        return cur.rowcount > 0

# --- TOPOLOGIA C-LEVEL PADRÃO & GESTÃO DO CANVAS ---
def get_default_c_level_topology() -> Dict[str, Any]:
    """Retorna o organograma padrão C-Level executivo corporativo."""
    # 1. Carrega do diretório data/ (customização privada do cliente)
    data_custom_path = os.path.join(os.path.dirname(__file__), "..", "data", "default_topology.json")
    if os.path.exists(data_custom_path):
        try:
            with open(data_custom_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Erro ao ler data/default_topology.json: {e}")

    # 2. Carrega do template genérico data.example/
    example_path = os.path.join(os.path.dirname(__file__), "..", "data.example", "default_topology.example.json")
    if os.path.exists(example_path):
        try:
            with open(example_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Erro ao ler data.example/default_topology.example.json: {e}")

    # 3. Fallback defensivo genérico
    return {
        "nodes": [
            {"id": "trig-telegram", "type": "trigger", "position": {"x": 740, "y": 30}, "data": {"label": "Bot do Telegram", "type": "telegram", "subtitle": "Escutando Comandos"}},
            {"id": "trig-web", "type": "trigger", "position": {"x": 1020, "y": 30}, "data": {"label": "Console Web", "type": "web", "subtitle": "Chat Executivo Corporativo"}},
            {"id": "agent-ceo", "type": "agent", "position": {"x": 880, "y": 160}, "data": {
                "role": "CEO - Diretor Geral & Orquestrador Executivo", "name": "Central Executiva & Estratégia",
                "goal": "Coordenar a diretoria executiva, consolidar diagnósticos e conduzir a governança corporativa da organização.",
                "model": "Gemini 3.8 Flash Medium", "isLead": True, "department": "executivo", "isCLevel": True, "toolsCount": 0
            }}
        ],
        "edges": [
            {"id": "e-trig1-ceo", "source": "trig-telegram", "sourceHandle": "trigger_out", "target": "agent-ceo", "targetHandle": "input"},
            {"id": "e-trig2-ceo", "source": "trig-web", "sourceHandle": "trigger_out", "target": "agent-ceo", "targetHandle": "input"}
        ],
        "updated_at": time.time()
    }

def save_tool_health(tool_id: str, health: Dict[str, Any]):
    now = time.time()
    h_data = dict(health)
    h_data["updated_at"] = now
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO tools_health_cache (tool_id, health_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(tool_id) DO UPDATE SET health_json = excluded.health_json, updated_at = excluded.updated_at
        """, (tool_id, json.dumps(h_data, ensure_ascii=False), now))
        conn.commit()

def save_all_tools_health(health_map: Dict[str, Any]):
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        for tid, h in health_map.items():
            h_data = dict(h)
            h_data["updated_at"] = now
            conn.execute("""
                INSERT INTO tools_health_cache (tool_id, health_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(tool_id) DO UPDATE SET health_json = excluded.health_json, updated_at = excluded.updated_at
            """, (tid, json.dumps(h_data, ensure_ascii=False), now))
        conn.commit()

def get_all_tools_health_cache() -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT tool_id, health_json FROM tools_health_cache")
        rows = cur.fetchall()
        result = {}
        for r in rows:
            try:
                result[r["tool_id"]] = json.loads(r["health_json"])
            except Exception:
                pass
        return result

def get_canvas_topology() -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT nodes_json, edges_json, updated_at FROM canvas_topology WHERE id = 'current'")
        row = cur.fetchone()
        if row:
            try:
                nodes_data = json.loads(row["nodes_json"])
                edges_data = json.loads(row["edges_json"])

                # Injeta apenas o status de saúde em cache para exibição das ferramentas (sem alterar o banco)
                cached_health = get_all_tools_health_cache()
                if cached_health:
                    for node in nodes_data:
                        if node.get("type") in ("tool", "trigger"):
                            nid = node.get("id")
                            ntype = f"tool-{node.get('data', {}).get('type')}"
                            trig_type = f"trig-{node.get('data', {}).get('type')}"
                            h = cached_health.get(nid) or cached_health.get(ntype) or cached_health.get(trig_type)
                            if h:
                                node.setdefault("data", {})
                                node["data"]["healthStatus"] = h.get("status")
                                node["data"]["healthLabel"] = h.get("status_label")
                                node["data"]["healthLatency"] = h.get("latency_ms")
                                node["data"]["healthDetails"] = h.get("details")
                                node["data"]["isConfigured"] = h.get("is_configured", True)
                                node["data"]["lastCheckedAt"] = h.get("updated_at")

                return {"nodes": nodes_data, "edges": edges_data, "updated_at": row["updated_at"]}
            except Exception as e:
                logger.error(f"Erro ao deserializar topologia do SQLite: {e}")
    return get_default_c_level_topology()


def compute_topology_diff(old_nodes: List[Dict], new_nodes: List[Dict], old_edges: List[Dict], new_edges: List[Dict]) -> Dict[str, Any]:
    old_nodes_map = {n.get("id"): n for n in (old_nodes or [])}
    new_nodes_map = {n.get("id"): n for n in (new_nodes or [])}

    added_nodes = []
    removed_nodes = []
    modified_nodes = []

    for nid, n in new_nodes_map.items():
        if nid not in old_nodes_map:
            added_nodes.append({
                "id": nid,
                "name": n.get("data", {}).get("name") or n.get("data", {}).get("role") or nid,
                "type": n.get("type")
            })
        else:
            old_n = old_nodes_map[nid]
            diff_fields = {}
            old_data = old_n.get("data", {})
            new_data = n.get("data", {})
            all_keys = set(old_data.keys()).union(new_data.keys())
            for k in all_keys:
                if k in ("healthLatency", "lastCheckedAt", "healthStatus", "healthLabel", "healthDetails"):
                    continue
                v_old = old_data.get(k)
                v_new = new_data.get(k)
                if v_old != v_new:
                    diff_fields[k] = {
                        "before": v_old,
                        "after": v_new
                    }
            if diff_fields:
                modified_nodes.append({
                    "id": nid,
                    "name": n.get("data", {}).get("name") or n.get("data", {}).get("role") or nid,
                    "changes": diff_fields
                })

    for nid, n in old_nodes_map.items():
        if nid not in new_nodes_map:
            removed_nodes.append({
                "id": nid,
                "name": n.get("data", {}).get("name") or n.get("data", {}).get("role") or nid,
                "type": n.get("type")
            })

    old_edges_set = {e.get("id") or f"{e.get('source')}->{e.get('target')}" for e in (old_edges or [])}
    new_edges_set = {e.get("id") or f"{e.get('source')}->{e.get('target')}" for e in (new_edges or [])}

    added_edges = list(new_edges_set - old_edges_set)
    removed_edges = list(old_edges_set - new_edges_set)

    summary_parts = []
    if added_nodes:
        summary_parts.append(f"+{len(added_nodes)} nó(s): " + ", ".join(x["name"] for x in added_nodes))
    if removed_nodes:
        summary_parts.append(f"-{len(removed_nodes)} nó(s): " + ", ".join(x["name"] for x in removed_nodes))
    if modified_nodes:
        summary_parts.append(f"~{len(modified_nodes)} nó(s) modificado(s): " + ", ".join(f"{x['name']} ({', '.join(x['changes'].keys())})" for x in modified_nodes))
    if added_edges:
        summary_parts.append(f"+{len(added_edges)} conexão(ões)")
    if removed_edges:
        summary_parts.append(f"-{len(removed_edges)} conexão(ões)")

    return {
        "summary": " | ".join(summary_parts) if summary_parts else "Nenhuma alteração estrutural",
        "added_nodes": added_nodes,
        "removed_nodes": removed_nodes,
        "modified_nodes": modified_nodes,
        "added_edges": added_edges,
        "removed_edges": removed_edges,
        "has_changes": bool(added_nodes or removed_nodes or modified_nodes or added_edges or removed_edges)
    }

def save_canvas_topology(nodes: List[Dict], edges: List[Dict], author: str = "Sistema", summary: str = None) -> Dict[str, Any]:
    now = time.time()
    cleaned_nodes = [{**n, "selected": False} for n in (nodes or [])]
    cleaned_edges = [{**e, "selected": False} for e in (edges or [])]

    old_nodes = []
    old_edges = []
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT nodes_json, edges_json FROM canvas_topology WHERE id = 'current'")
        row = cur.fetchone()
        if row:
            try:
                old_nodes = json.loads(row["nodes_json"])
                old_edges = json.loads(row["edges_json"])
            except Exception:
                pass

        diff = compute_topology_diff(old_nodes, cleaned_nodes, old_edges, cleaned_edges)
        auto_summary = summary or diff["summary"]

        nodes_str = json.dumps(cleaned_nodes, ensure_ascii=False)
        edges_str = json.dumps(cleaned_edges, ensure_ascii=False)

        conn.execute("""
            INSERT INTO canvas_topology (id, nodes_json, edges_json, updated_at)
            VALUES ('current', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET nodes_json = excluded.nodes_json, edges_json = excluded.edges_json, updated_at = excluded.updated_at
        """, (nodes_str, edges_str, now))

        if diff["has_changes"]:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS canvas_topology_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at REAL,
                    author TEXT,
                    summary TEXT,
                    diff_json TEXT,
                    nodes_json TEXT,
                    edges_json TEXT
                )
            """)
            conn.execute("""
                INSERT INTO canvas_topology_history (created_at, author, summary, diff_json, nodes_json, edges_json)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (now, author, auto_summary, json.dumps(diff, ensure_ascii=False), nodes_str, edges_str))

        conn.commit()
        return diff


def get_canvas_history(limit: int = 50) -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS canvas_topology_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at REAL,
                author TEXT,
                summary TEXT,
                diff_json TEXT,
                nodes_json TEXT,
                edges_json TEXT
            )
        """)
        cur.execute("""
            SELECT id, created_at, author, summary, diff_json
            FROM canvas_topology_history
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        rows = cur.fetchall()
        result = []
        for r in rows:
            try:
                diff = json.loads(r["diff_json"]) if r["diff_json"] else {}
            except Exception:
                diff = {}
            result.append({
                "id": r["id"],
                "created_at": r["created_at"],
                "author": r["author"],
                "summary": r["summary"],
                "diff": diff
            })
        return result

def rollback_canvas_history(history_id: int, author: str = "Admin (Rollback)") -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT nodes_json, edges_json, summary FROM canvas_topology_history WHERE id = ?", (history_id,))
        row = cur.fetchone()
        if not row:
            return None
        
        nodes = json.loads(row["nodes_json"])
        edges = json.loads(row["edges_json"])
        now = time.time()
        
        save_canvas_topology(nodes, edges, author=author, summary=f"Restaurado para a versão #{history_id} ('{row['summary'][:40]}')")
        return {"nodes": nodes, "edges": edges}

# --- TOWN HALL ---
DEFAULT_RESPONSE_FORMAT = (
    "1. Responda DIRETAMENTE ao que foi solicitado logo na primeira linha, sem enrolação ou preâmbulos.\n"
    "2. Se a pergunta solicitar dados, lista, nomes, horários ou tabelas (ex: colaboradores escalados, valores de venda, canais, estoque), apresente DIRETAMENTE a tabela/dados solicitados em Markdown limpo e bem formatado.\n"
    "3. É PROIBIDO gerar cabeçalhos burocráticos de comitê corporativo como '🏛️ BOLETIM EXECUTIVO — COMITÊ ESTRATÉGICO' ou 'De: CEO para Conselho'.\n"
    "4. É PROIBIDO incluir seções corporativas não solicitadas, tais como '1. Diagnóstico Consolidado e Números Oficiais' (especialmente com faturamento R$ 0,00 quando a pergunta não for financeira), '2. Decisão Estratégica do Comitê' ou '3. Ordens Executivas ao COO/CFO/CMO'.\n"
    "5. Entregue apenas a Resposta Executiva Direta e a tabela/dado pedido, com zero alucinação."
)

def get_town_hall() -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        try:
            conn.execute("ALTER TABLE company_town_hall ADD COLUMN response_format TEXT DEFAULT ''")
        except Exception:
            pass
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT vision, okrs, guidelines, response_format, updated_at FROM company_town_hall WHERE id = 'current'")
        row = cur.fetchone()
        if row:
            rf = row["response_format"] if "response_format" in row.keys() and row["response_format"] else DEFAULT_RESPONSE_FORMAT
            return {
                "vision": row["vision"],
                "okrs": row["okrs"],
                "guidelines": row["guidelines"],
                "response_format": rf,
                "updated_at": row["updated_at"]
            }
    return {
        "vision": "Excelência em gestão corporativa e inteligência de negócios.",
        "okrs": "Consistência financeira, estoque auditado e agilidade operacional.",
        "guidelines": "Decisões baseadas em dados reais e foco no cliente.",
        "response_format": DEFAULT_RESPONSE_FORMAT,
        "updated_at": 0
    }

def save_town_hall(vision: str, okrs: str, guidelines: str, response_format: str = ""):
    now = time.time()
    rf = response_format.strip() if response_format else DEFAULT_RESPONSE_FORMAT
    with sqlite3.connect(DB_PATH) as conn:
        try:
            conn.execute("ALTER TABLE company_town_hall ADD COLUMN response_format TEXT DEFAULT ''")
        except Exception:
            pass
        conn.execute("""
            INSERT INTO company_town_hall (id, vision, okrs, guidelines, response_format, updated_at)
            VALUES ('current', ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET vision = excluded.vision, okrs = excluded.okrs, guidelines = excluded.guidelines, response_format = excluded.response_format, updated_at = excluded.updated_at
        """, (vision, okrs, guidelines, rf, now))
        conn.commit()

# --- MEMÓRIAS INDIVIDUAIS DOS AGENTES ---
def get_agent_memory(agent_id: str) -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT name, role, memory_text, learned_facts, updated_at FROM agent_memories WHERE agent_id = ?", (agent_id,))
        row = cur.fetchone()
        if row:
            try:
                facts = json.loads(row["learned_facts"]) if row["learned_facts"] else []
            except Exception:
                facts = []
            return {
                "agent_id": agent_id,
                "name": row["name"],
                "role": row["role"],
                "memory_text": row["memory_text"],
                "learned_facts": facts,
                "updated_at": row["updated_at"]
            }
    return {
        "agent_id": agent_id,
        "name": "",
        "role": "",
        "memory_text": "O agente retém o histórico de consultas e métricas aprendidas nas interações recentes.",
        "learned_facts": [
            "Conhece os canais de venda New Choice ERP (Balcão, Delivery e Totem).",
            "Acompanha o fechamento de caixa e dados diários da loja."
        ],
        "updated_at": 0
    }

def save_agent_memory(agent_id: str, memory_text: str, learned_facts: List[str], name: str = "", role: str = ""):
    now = time.time()
    facts_str = json.dumps(learned_facts, ensure_ascii=False)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO agent_memories (agent_id, name, role, memory_text, learned_facts, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET 
                name = coalesce(nullif(excluded.name, ''), agent_memories.name),
                role = coalesce(nullif(excluded.role, ''), agent_memories.role),
                memory_text = excluded.memory_text,
                learned_facts = excluded.learned_facts,
                updated_at = excluded.updated_at
        """, (agent_id, name, role, memory_text, facts_str, now))
        conn.commit()

# --- PERSONALIDADES DOS AGENTES ---
def get_agent_personality(agent_id: str) -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT tone, guidelines, updated_at FROM agent_personalities WHERE agent_id = ?", (agent_id,))
        row = cur.fetchone()
        if row:
            return {
                "agent_id": agent_id,
                "tone": row["tone"],
                "guidelines": row["guidelines"],
                "updated_at": row["updated_at"]
            }
    return {
        "agent_id": agent_id,
        "tone": "Direto, analítico e focado em dados executivos",
        "guidelines": "Sempre responda de forma sucinta com números exatos. Formate tabelas em Markdown.",
        "updated_at": 0
    }

def save_agent_personality(agent_id: str, tone: str, guidelines: str):
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO agent_personalities (agent_id, tone, guidelines, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(agent_id) DO UPDATE SET tone = excluded.tone, guidelines = excluded.guidelines, updated_at = excluded.updated_at
        """, (agent_id, tone, guidelines, now))
        conn.commit()

# --- MUTEX DE EXECUÇÃO ---
def get_execution_mutex() -> Dict[str, Any]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT is_locked, current_task_id, locked_at FROM execution_mutex WHERE id = 'current'")
        row = cur.fetchone()
        if row:
            return {
                "is_locked": bool(row["is_locked"]),
                "current_task_id": row["current_task_id"],
                "locked_at": row["locked_at"]
            }
    return {"is_locked": False, "current_task_id": None, "locked_at": None}

def lock_execution_mutex(task_id: str) -> Dict[str, Any]:
    now = time.time()
    topo = get_canvas_topology()
    nodes_str = json.dumps(topo.get("nodes", []), ensure_ascii=False)
    edges_str = json.dumps(topo.get("edges", []), ensure_ascii=False)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO execution_mutex (id, is_locked, current_task_id, snapshot_nodes, snapshot_edges, locked_at)
            VALUES ('current', 1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET is_locked = 1, current_task_id = excluded.current_task_id,
                snapshot_nodes = excluded.snapshot_nodes, snapshot_edges = excluded.snapshot_edges, locked_at = excluded.locked_at
        """, (task_id, nodes_str, edges_str, now))
        conn.commit()
    return topo

def unlock_execution_mutex():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE execution_mutex SET is_locked = 0, current_task_id = NULL, locked_at = NULL WHERE id = 'current'
        """)
        conn.commit()

# --- CONFIGURAÇÕES ---
def get_setting(key: str, default: Any = None) -> Any:
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
            row = cur.fetchone()
            if row:
                return row[0]
    except Exception as e:
        logger.error(f"Erro ao ler configuracao {key}: {e}")
    return default

def set_setting(key: str, value: str):
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO system_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (key, str(value), now))
        conn.commit()
    if key == "gemini_model":
        os.environ["GEMINI_MODEL"] = str(value)
    elif key == "gemini_api_key":
        os.environ["GEMINI_API_KEY"] = str(value)


def is_daily_budget_exceeded() -> tuple[bool, float, float, int, int]:
    """Calcula o gasto acumulado nas últimas 24h com base em todas as tarefas e passos executados na API."""
    try:
        max_budget = float(get_setting("max_daily_budget_brl") or 5.00)
    except Exception:
        max_budget = 5.00

    one_day_ago = time.time() - 86400
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        # Todas as tarefas que chamaram a API (COMPLETED, FAILED, RUNNING) - exclui apenas BLOCKED
        cur.execute("""
            SELECT COUNT(*) FROM agent_tasks 
            WHERE created_at >= ? AND status != 'BLOCKED'
        """, (one_day_ago,))
        runs_today = cur.fetchone()[0] or 0

        # Contagem de interações de modelo registradas no log detalhado
        cur.execute("""
            SELECT COUNT(*) FROM agent_task_logs 
            WHERE timestamp >= ? AND level IN ('AGENT', 'SUCCESS', 'ERROR', 'TOOL')
        """, (one_day_ago,))
        steps_today = cur.fetchone()[0] or 0

        # Checa se há custos explícitos registrados por tokens
        cur.execute("PRAGMA table_info(agent_tasks)")
        cols = [c[1] for c in cur.fetchall()]
        recorded_tokens_cost = 0.0
        if "cost_brl" in cols:
            cur.execute("""
                SELECT COALESCE(SUM(cost_brl), 0) FROM agent_tasks 
                WHERE created_at >= ? AND status != 'BLOCKED' AND cost_brl > 0
            """, (one_day_ago,))
            recorded_tokens_cost = float(cur.fetchone()[0] or 0.0)

    # Cada execução CrewAI envolve múltiplos agentes e passos.
    # No incidente do dia 28, 180 execuções geraram 2.177 interações totalizando ~R$ 40 na fatura do Google Cloud.
    if recorded_tokens_cost > 0:
        estimated_cost_today = recorded_tokens_cost
    elif steps_today > 0:
        estimated_cost_today = max(runs_today * 0.225, steps_today * 0.0185)
    else:
        estimated_cost_today = runs_today * 0.225

    is_exceeded = estimated_cost_today >= max_budget
    return is_exceeded, round(estimated_cost_today, 2), max_budget, runs_today, steps_today


# --- WORKER & TAREFAS (COM REGISTRO DE USUÁRIO & CIRCUIT BREAKER) ---
def create_task(
    crew_name: str,
    prompt: str,
    requester: str = "web",
    telegram_chat_id: Optional[str] = None,
    user_email: Optional[str] = None,
    user_name: Optional[str] = None
) -> str:
    task_id = str(uuid.uuid4())[:8]
    now = time.time()

    # 1. Trava de Emergência: Kill Switch Ativo ou API Gemini desligada
    kill_switch = str(get_setting("kill_switch_active", "false")).lower() in ("true", "1", "yes")
    gemini_disabled = os.getenv("GEMINI_API_DISABLED", "false").lower() in ("true", "1", "yes")
    active_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")

    if kill_switch or gemini_disabled or not active_key.strip():
        reason = "Kill Switch Ativo" if kill_switch else "API Gemini Desligada / Chave Ausente"
        err_msg = f"🛑 Execução BLOQUEADA por segurança ({reason}). Nenhuma chamada ao Gemini é permitida."
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO agent_tasks (task_id, crew_name, prompt, requester, telegram_chat_id, status, error, created_at, completed_at, user_email, user_name)
                VALUES (?, ?, ?, ?, ?, 'BLOCKED', ?, ?, ?, ?, ?)
            """, (task_id, crew_name, prompt, requester, telegram_chat_id, err_msg, now, now, user_email, user_name))
            conn.commit()

        send_system_telegram_alert(
            title=f"Tentativa de Execução Bloqueada ({crew_name.upper()})",
            details=f"Motivo: {reason}\nID: {task_id}\nOrigem: {requester}\nPrompt: {prompt[:180]}",
            severity="WARNING",
            source=f"budget_guard:{requester}"
        )
        return task_id

    # 2. Trava de Teto Diário de Gastos (Hard Budget Limiter)
    budget_exceeded, cost_today, max_budget, runs_cnt, _ = is_daily_budget_exceeded()
    if budget_exceeded:
        err_msg = f"🛑 LIMITE DIÁRIO DE GASTO ATINGIDO (R$ {cost_today:.2f} / R$ {max_budget:.2f}). Execução bloqueada."
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO agent_tasks (task_id, crew_name, prompt, requester, telegram_chat_id, status, error, created_at, completed_at, user_email, user_name)
                VALUES (?, ?, ?, ?, ?, 'BLOCKED', ?, ?, ?, ?, ?)
            """, (task_id, crew_name, prompt, requester, telegram_chat_id, err_msg, now, now, user_email, user_name))
            conn.commit()

        send_system_telegram_alert(
            title="Teto Diário de Gastos Atingido",
            details=f"Gasto nas últimas 24h: R$ {cost_today:.2f}\nTeto configurado: R$ {max_budget:.2f}\nA tarefa {task_id} foi bloqueada para evitar cobranças na nuvem.",
            severity="CRITICAL",
            source="budget_circuit_breaker"
        )
        return task_id

    # 3. Enfileiramento e execução segura
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO agent_tasks (task_id, crew_name, prompt, requester, telegram_chat_id, status, created_at, user_email, user_name)
            VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)
        """, (task_id, crew_name, prompt, requester, telegram_chat_id, now, user_email, user_name))
        conn.commit()
    
    thread = threading.Thread(target=_worker_execute_task, args=(task_id, crew_name, prompt, telegram_chat_id, requester), daemon=True)
    thread.start()
    return task_id


def _notify_telegram(chat_id: str, message: str, reply_markup: Optional[Dict[str, Any]] = None, parse_mode: str = "HTML") -> Optional[int]:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not chat_id:
        return None
    try:
        from tools.telegram_tools import (
            format_markdown_for_telegram_html,
            split_telegram_html_chunks,
            format_markdown_for_plain_messaging,
        )
        formatted_msg = format_markdown_for_telegram_html(message) if parse_mode == "HTML" else str(message)
        chunks = split_telegram_html_chunks(formatted_msg, max_len=3800)
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        last_msg_id = None
        for idx, chunk in enumerate(chunks):
            payload = {
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": parse_mode,
                "disable_web_page_preview": True,
            }
            if reply_markup and idx == len(chunks) - 1:
                payload["reply_markup"] = reply_markup
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                last_msg_id = data.get("result", {}).get("message_id")
            else:
                logger.warning(f"Telegram API warning ({resp.status_code}): {resp.text[:150]}")
                plain_fb = format_markdown_for_plain_messaging(chunk)[:3900]
                fb_payload = {"chat_id": chat_id, "text": plain_fb}
                if reply_markup and idx == len(chunks) - 1:
                    fb_payload["reply_markup"] = reply_markup
                fb_resp = requests.post(url, json=fb_payload, timeout=10)
                if fb_resp.status_code == 200:
                    last_msg_id = fb_resp.json().get("result", {}).get("message_id")
        return last_msg_id
    except Exception as e:
        logger.error(f"Erro ao enviar notificação Telegram: {e}")
    return None


def _edit_telegram_message(chat_id: str, message_id: int, message: str, reply_markup: Optional[Dict[str, Any]] = None, parse_mode: str = "HTML") -> bool:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not chat_id or not message_id:
        return False
    try:
        from tools.telegram_tools import format_markdown_for_telegram_html
        formatted_msg = format_markdown_for_telegram_html(message) if parse_mode == "HTML" else str(message)
        url = f"https://api.telegram.org/bot{token}/editMessageText"
        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": formatted_msg[:4000],
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        resp = requests.post(url, json=payload, timeout=8)
        return resp.status_code == 200
    except Exception as e:
        logger.error(f"Erro ao editar mensagem Telegram {chat_id}/{message_id}: {e}")
        return False


# =====================================================================

def send_system_telegram_alert(
    title: str,
    details: str,
    severity: str = "ERROR",
    source: Optional[str] = None
) -> bool:
    """Dispara um alerta imediato de erro ou incidente crítico no sistema para o Telegram do administrador."""
    now = time.time()
    throttle_key = f"{severity}:{title}:{details[:80]}"
    last_sent = _ALERT_THROTTLE_CACHE.get(throttle_key, 0)
    # Suprime duplicações idênticas dentro de 180 segundos para não inundar o chat
    if now - last_sent < 180:
        logger.debug(f"Alerta suprimido por throttle: {title}")
        return False
    _ALERT_THROTTLE_CACHE[throttle_key] = now

    icon = "🚨" if severity.upper() in ("ERROR", "CRITICAL") else ("⚠️" if severity.upper() == "WARNING" else "ℹ️")
    ts_str = datetime.now(BRT).strftime("%d/%m/%Y %H:%M:%S")

    clean_title = str(title).replace("<", "&lt;").replace(">", "&gt;")
    clean_details = str(details).replace("<", "&lt;").replace(">", "&gt;")
    clean_source = str(source or "Sistema AI Board").replace("<", "&lt;").replace(">", "&gt;")

    msg = (
        f"{icon} <b>[ALERTA DE SISTEMA - AI BOARD]</b>\n"
        f"<b>Severidade:</b> <code>{severity.upper()}</code>\n"
        f"<b>Origem:</b> {clean_source}\n"
        f"<b>Horário:</b> {ts_str} (Brasília)\n\n"
        f"📌 <b>{clean_title}</b>\n\n"
        f"<code>{clean_details[:2500]}</code>"
    )

    sent_any = False
    default_chat = get_setting("telegram_default_chat_id") or os.getenv("TELEGRAM_DEFAULT_CHAT_ID")
    target_chats = set()
    if default_chat:
        target_chats.add(str(default_chat).strip())

    try:
        approvers = list_telegram_approvers()
        for a in approvers:
            if a.get("is_active") and a.get("chat_id"):
                target_chats.add(str(a["chat_id"]).strip())
    except Exception:
        pass

    for cid in target_chats:
        try:
            res = _notify_telegram(cid, msg, parse_mode="HTML")
            if res:
                sent_any = True
        except Exception as e:
            logger.error(f"Erro ao enviar alerta Telegram para {cid}: {e}")

    return sent_any


# SISTEMA DE APROVADORES MULTI-USUÁRIO (TELEGRAM)
# =====================================================================
def list_telegram_approvers() -> List[Dict[str, Any]]:
    """Lista todos os aprovadores cadastrados no sistema."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM telegram_approvers ORDER BY role DESC, added_at ASC")
        return [dict(r) for r in cur.fetchall()]


def add_or_update_telegram_approver(
    username: Optional[str] = None,
    chat_id: Optional[str] = None,
    name: Optional[str] = None,
    role: str = "approver",
    can_approve: bool = True,
    is_active: bool = True,
    added_by: str = "Admin"
) -> Dict[str, Any]:
    """Cadastra ou atualiza um usuário aprovador do Telegram."""
    now = time.time()
    clean_username = username.strip().lstrip('@') if username else None
    clean_chat_id = str(chat_id).strip() if chat_id else None
    clean_name = name.strip() if name else (f"@{clean_username}" if clean_username else f"ID {clean_chat_id}")

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        existing = None
        if clean_chat_id:
            cur.execute("SELECT id FROM telegram_approvers WHERE chat_id = ?", (clean_chat_id,))
            existing = cur.fetchone()
        if not existing and clean_username:
            cur.execute("SELECT id FROM telegram_approvers WHERE LOWER(username) = LOWER(?)", (clean_username,))
            existing = cur.fetchone()

        if existing:
            approver_id = existing[0]
            conn.execute("""
                UPDATE telegram_approvers
                SET username = COALESCE(?, username),
                    chat_id = COALESCE(?, chat_id),
                    name = COALESCE(?, name),
                    role = ?,
                    can_approve = ?,
                    is_active = ?
                WHERE id = ?
            """, (clean_username, clean_chat_id, clean_name, role, 1 if can_approve else 0, 1 if is_active else 0, approver_id))
        else:
            cur.execute("""
                INSERT INTO telegram_approvers (chat_id, username, name, role, can_approve, is_active, added_at, added_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (clean_chat_id, clean_username, clean_name, role, 1 if can_approve else 0, 1 if is_active else 0, now, added_by))
            approver_id = cur.lastrowid
        conn.commit()

    return {"status": "ok", "approver_id": approver_id, "username": clean_username, "chat_id": clean_chat_id, "name": clean_name}


def remove_telegram_approver(approver_id: int) -> bool:
    """Remove um aprovador pelo ID."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("DELETE FROM telegram_approvers WHERE id = ?", (approver_id,))
        conn.commit()
    return True


def toggle_telegram_approver(approver_id: int, field: str = "is_active") -> Optional[bool]:
    """Alterna estado de aprovação ou atividade de um aprovador."""
    col = "can_approve" if field == "can_approve" else "is_active"
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT {col} FROM telegram_approvers WHERE id = ?", (approver_id,))
        row = cur.fetchone()
        if not row:
            return None
        new_val = 0 if row[0] == 1 else 1
        conn.execute(f"UPDATE telegram_approvers SET {col} = ? WHERE id = ?", (new_val, approver_id))
        conn.commit()
        return bool(new_val)


def get_active_approver_chat_ids() -> List[str]:
    """Retorna lista de chat_ids ativos e autorizados a aprovar ações."""
    chat_ids = set()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT chat_id FROM telegram_approvers WHERE is_active = 1 AND can_approve = 1 AND chat_id IS NOT NULL AND chat_id != ''")
            for r in cur.fetchall():
                if r[0]:
                    chat_ids.add(str(r[0]))
    except Exception as e:
        logger.warning(f"Erro ao buscar approvers: {e}")

    default_chat = get_setting("telegram_default_chat_id")
    if default_chat and str(default_chat) not in chat_ids:
        chat_ids.add(str(default_chat))

    if not chat_ids:
        chat_ids.add("8396341860")
    return list(chat_ids)


def broadcast_action_resolution(action_id: str, resolved_by: str, status: str, message_feedback: str = ""):
    """Atualiza a mensagem em tempo real para todos os aprovadores do Telegram quando uma ação é decidida."""
    act = get_pending_action(action_id)
    if not act:
        return

    clean_target = str(act.get('target', '')).replace("<", "&lt;").replace(">", "&gt;")
    clean_summary = str(act.get('summary', '')).replace("<", "&lt;").replace(">", "&gt;")
    clean_resolved_by = str(resolved_by).replace("<", "&lt;").replace(">", "&gt;")
    clean_feed = str(message_feedback).replace("<", "&lt;").replace(">", "&gt;")

    if status == "executed":
        update_text = (
            f"✅ <b>AÇÃO APROVADA E EXECUTADA!</b>\n\n"
            f"👤 <b>Decidido por:</b> {clean_resolved_by}\n"
            f"📋 <b>Tarefa:</b> <code>{act.get('task_id')}</code>\n"
            f"🎯 <b>Canal:</b> {clean_target}\n"
            f"📌 <b>Objetivo:</b> {clean_summary}\n\n"
            f"🚀 <b>Resultado:</b> {clean_feed or 'Enviado com sucesso'}\n\n"
            f"ID: <code>{action_id}</code>"
        )
    else:
        update_text = (
            f"❌ <b>AÇÃO REJEITADA</b>\n\n"
            f"👤 <b>Decidido por:</b> {clean_resolved_by}\n"
            f"📋 <b>Tarefa:</b> <code>{act.get('task_id')}</code>\n"
            f"🎯 <b>Canal:</b> {clean_target}\n"
            f"📌 <b>Objetivo:</b> {clean_summary}\n\n"
            f"ℹ️ A ação <code>{action_id}</code> foi cancelada e não enviada.\n"
            f"ID: <code>{action_id}</code>"
        )

    dispatches = []
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT chat_id, message_id FROM action_approver_dispatches WHERE action_id = ?", (action_id,))
            dispatches = cur.fetchall()
    except Exception as e:
        logger.error(f"Erro ao buscar despachos para broadcast: {e}")

    for cid, mid in dispatches:
        try:
            _edit_telegram_message(cid, mid, update_text, reply_markup=None, parse_mode="HTML")
        except Exception as e:
            logger.debug(f"Falha ao editar mensagem Telegram {cid}/{mid}: {e}")


# =====================================================================
# SISTEMA DE VALIDAÇÃO DE AÇÕES (HUMAN-IN-THE-LOOP & AUTÔNOMO)
# =====================================================================
def is_action_approval_required() -> bool:
    """Verifica se a exigência de aprovação humana de ações está ativa (padrão: True)."""
    val = str(get_setting("require_action_approval", "true")).lower().strip()
    return val in ("true", "1", "yes", "active", "enabled")


def set_action_approval_required(required: bool) -> bool:
    """Ativa ou desativa a exigência de aprovação prévia para execução de ações dos agentes."""
    set_setting("require_action_approval", "true" if required else "false")
    return required


def create_pending_action(
    task_id: str,
    action_type: str,
    target: str,
    payload: Dict[str, Any],
    summary: str
) -> str:
    """Registra uma ação proposta pelo agente aguardando aprovação ou registro histórico."""
    action_id = f"act_{uuid.uuid4().hex[:8]}"
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        if action_type in ("intranetmall_sales_batch_sync", "intranetmall_sales_sync", "erp_weekly_nfe_inbound"):
            conn.execute("""
                UPDATE pending_actions
                SET status = 'superseded', resolved_at = ?, resolved_by = 'Sistema (Nova Varredura)'
                WHERE action_type = ? AND status = 'pending'
            """, (now, action_type))
        elif action_type == "chatwoot_reply" and target:
            conn.execute("""
                UPDATE pending_actions
                SET status = 'superseded', resolved_at = ?, resolved_by = 'Sistema (Novo Lote de Mensagens)'
                WHERE action_type = 'chatwoot_reply' AND target = ? AND status = 'pending'
            """, (now, target))
        conn.execute("""
            INSERT INTO pending_actions (action_id, task_id, action_type, target, payload_json, summary, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (action_id, task_id, action_type, target, json.dumps(payload, ensure_ascii=False), summary, now))
        conn.commit()
    return action_id


def get_pending_action(action_id: str) -> Optional[Dict[str, Any]]:
    """Consulta detalhes de uma ação pendente pelo ID."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM pending_actions WHERE action_id = ?", (action_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def list_pending_actions(status: Optional[str] = "pending", limit: int = 25) -> List[Dict[str, Any]]:
    """Lista ações com filtro de status ('pending', 'executed', 'rejected', 'all')."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        if status and status != "all":
            cur.execute("SELECT * FROM pending_actions WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit))
        else:
            cur.execute("SELECT * FROM pending_actions ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def execute_pending_action(action_id: str, resolved_by: str = "Admin") -> Dict[str, Any]:
    """Executa a ação proposta (ex: envio de mensagem no Chatwoot via API) e atualiza o status."""
    act = get_pending_action(action_id)
    if not act:
        return {"status": "error", "message": f"Ação '{action_id}' não encontrada."}

    if act["status"] in ("executed", "rejected"):
        return {
            "status": "ok",
            "already_resolved": True,
            "message": f"Esta ação já foi resolvida anteriormente como '{act['status']}' por {act.get('resolved_by') or 'outro usuário'}.",
            "action": act
        }

    now = time.time()
    action_type = act["action_type"]
    payload = json.loads(act["payload_json"]) if isinstance(act["payload_json"], str) else (act["payload_json"] or {})

    exec_result = {}
    success = False
    message_feedback = ""

    if action_type == "chatwoot_reply":
        cid = payload.get("conversation_id")
        content = payload.get("message") or payload.get("content") or ""
        private = bool(payload.get("private", False))

        if not cid or not content:
            exec_result = {"error": "Parâmetros conversation_id ou message ausentes no payload"}
            message_feedback = "Erro: Parâmetros de conversa ou mensagem ausentes."
        else:
            # Trava Anti-Colisão: verifica se um humano já respondeu na conversa após a criação desta sugestão
            human_already_replied = False
            try:
                from api.event_triggers import get_conversation_human_status
                human_st = get_conversation_human_status(int(cid))
                act_created = float(act.get("created_at") or 0.0)
                last_h_ts = float(human_st.get("last_human_reply_at") or 0.0)
                if human_st.get("already_answered") or (last_h_ts > 0 and act_created > 0 and last_h_ts >= act_created - 5.0):
                    human_already_replied = True
            except Exception as h_err:
                logger.debug(f"Erro ao verificar colisão humana na conversa #{cid}: {h_err}")

            if human_already_replied and not payload.get("force_send"):
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute("""
                        UPDATE pending_actions
                        SET status = 'rejected', resolved_at = ?, resolved_by = ?, execution_result = ?
                        WHERE action_id = ?
                    """, (
                        now,
                        "Anti-Colisão (Respondido por Humano)",
                        json.dumps({"superseded_by_human": True, "conversation_id": cid}, ensure_ascii=False),
                        action_id
                    ))
                    conn.commit()
                msg_abort = f"👨‍💼 Envio cancelado: Um operador humano já respondeu ao cliente na Conversa #{cid} no WhatsApp. Evitamos resposta duplicada!"
                log_task_event(act["task_id"], msg_abort, level="WARNING")
                try:
                    broadcast_action_resolution(action_id, "Operador Humano (WhatsApp)", "rejected", msg_abort)
                except Exception:
                    pass
                return {
                    "status": "error",
                    "success": False,
                    "superseded_by_human": True,
                    "message": msg_abort,
                    "action_id": action_id,
                    "new_status": "rejected"
                }

            try:
                from tools.telegram_tools import format_markdown_for_plain_messaging
                content = format_markdown_for_plain_messaging(content)
            except Exception:
                pass
            api_token = os.getenv("CHATWOOT_API_TOKEN", "")
            urls_to_try = [
                f"http://chatwoot-web:3000/api/v1/accounts/2/conversations/{cid}/messages",
                f"http://host.docker.internal:3050/api/v1/accounts/2/conversations/{cid}/messages",
                f"http://127.0.0.1:3050/api/v1/accounts/2/conversations/{cid}/messages"
            ]
            headers = {"api_access_token": api_token, "Content-Type": "application/json"}
            req_body = {
                "content": content,
                "message_type": "outgoing",
                "private": private
            }
            for u in urls_to_try:
                try:
                    resp = requests.post(u, json=req_body, headers=headers, timeout=10)
                    if resp.status_code in (200, 201):
                        data = resp.json()
                        success = True
                        exec_result = {"status_code": resp.status_code, "chatwoot_message_id": data.get("id"), "url": u}
                        message_feedback = f"Mensagem enviada com sucesso no Chatwoot (Conversa #{cid})!"
                        break
                    else:
                        exec_result = {"status_code": resp.status_code, "response": resp.text}
                except Exception as ex:
                    exec_result = {"exception": str(ex)}

            if not success:
                message_feedback = f"Falha ao enviar mensagem no Chatwoot: {exec_result}"
    elif action_type in ("intranetmall_sales_batch_sync", "intranetmall_sales_sync"):
        try:
            try:
                from custom_tools.intranetmall_tools import IntranetMallClient
            except ImportError:
                from tools.intranetmall_tools import IntranetMallClient
            weeks = payload.get("weeks", [])
            client = IntranetMallClient()
            batch_res = client.execute_batch_sales_sync(weeks)
            success = bool(batch_res.get("success", False))
            exec_result = batch_res
            message_feedback = batch_res.get("message", "Sincronização de vendas concluída na Intranet Mall.")
        except Exception as im_err:
            success = False
            exec_result = {"error": str(im_err)}
            message_feedback = f"Erro ao sincronizar vendas na Intranet Mall: {im_err}"
    elif action_type == "erp_weekly_nfe_inbound":
        try:
            try:
                from custom_tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
            except ImportError:
                from tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
            manager = ERPWeeklyNFeInboundManager()
            erp_res = manager.execute_approved_nfe_inbound(payload)
            success = bool(erp_res.get("success", False))
            exec_result = erp_res
            message_feedback = erp_res.get("message", "Entrada de Notas Fiscais concluída no New Choice ERP.")
        except Exception as erp_err:
            success = False
            exec_result = {"error": str(erp_err)}
            message_feedback = f"Erro ao processar entrada de Notas Fiscais no New Choice ERP: {erp_err}"
    else:
        success = True
        exec_result = {"status": "success", "note": "Ação executada com sucesso"}
        message_feedback = f"Ação '{action_type}' executada com sucesso."

    new_status = "executed" if success else "failed"
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE pending_actions 
            SET status = ?, resolved_at = ?, resolved_by = ?, execution_result = ?
            WHERE action_id = ?
        """, (new_status, now, resolved_by, json.dumps(exec_result, ensure_ascii=False), action_id))
        conn.commit()

    log_task_event(act["task_id"], f"Ação '{action_id}' ({action_type}) -> {new_status} por {resolved_by}: {message_feedback}", level="SUCCESS" if success else "ERROR")

    # Sincroniza em tempo real com todos os outros aprovadores do Telegram
    try:
        broadcast_action_resolution(action_id, resolved_by, new_status, message_feedback)
    except Exception as e:
        logger.error(f"Erro no broadcast de resolução de ação: {e}")

    return {
        "status": "ok" if success else "error",
        "success": success,
        "message": message_feedback,
        "action_id": action_id,
        "new_status": new_status,
        "execution_result": exec_result
    }


def reject_pending_action(action_id: str, resolved_by: str = "Admin") -> Dict[str, Any]:
    """Rejeita a ação proposta, cancelando seu envio."""
    act = get_pending_action(action_id)
    if not act:
        return {"status": "error", "message": f"Ação '{action_id}' não encontrada."}

    if act["status"] in ("executed", "rejected"):
        return {
            "status": "ok",
            "already_resolved": True,
            "message": f"Esta ação já foi resolvida anteriormente como '{act['status']}' por {act.get('resolved_by') or 'outro usuário'}.",
            "action": act
        }

    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE pending_actions 
            SET status = 'rejected', resolved_at = ?, resolved_by = ?
            WHERE action_id = ?
        """, (now, resolved_by, action_id))
        conn.commit()

    log_task_event(act["task_id"], f"Ação '{action_id}' rejeitada por {resolved_by}. Nenhuma mensagem enviada.", level="WARNING")

    # Sincroniza cancelamento em tempo real com todos os outros aprovadores do Telegram
    try:
        broadcast_action_resolution(action_id, resolved_by, "rejected", "Ação rejeitada e cancelada.")
    except Exception as e:
        logger.error(f"Erro no broadcast de rejeição: {e}")

    return {
        "status": "ok",
        "message": f"Ação '{action_id}' rejeitada por {resolved_by}.",
        "action_id": action_id,
        "new_status": "rejected"
    }


def extract_proposed_action(output: str, task: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Analisa o resultado do agente e detecta se há uma ação executável proposta (ex: resposta ao Chatwoot)."""
    import re
    if not output:
        return None

    # 1. Bloco JSON explícito: ```action { ... } ``` ou ```json { "action_type": ... } ```
    m_block = re.search(r"```(?:action|json)\s*(\{.*?\})\s*```", output, re.DOTALL)
    if m_block:
        try:
            data = json.loads(m_block.group(1))
            if "action_type" in data:
                return {
                    "action_type": data.get("action_type", "chatwoot_reply"),
                    "target": data.get("target") or f"Chatwoot Conversa #{data.get('conversation_id', '?')}",
                    "payload": data,
                    "summary": data.get("summary") or "Resposta/ação proposta pelo agente"
                }
        except Exception:
            pass

    # 2. Se a tarefa veio de gatilho do Chatwoot
    prompt = task.get("prompt", "")
    requester = task.get("requester", "")
    is_chatwoot = "chatwoot" in requester.lower() or "CHATWOOT" in prompt

    if is_chatwoot:
        cid_match = re.search(r"Conversa #(\d+)", prompt)
        cid = int(cid_match.group(1)) if cid_match else 8

        patterns = [
            r"\[(?:RESPOSTA SUGERIDA|AÇÃO SUGERIDA|RETORNO AO CHATWOOT)[^\]]*\]:?\s*\n*(.*?)(?:\n\n|\Z)",
            r"(?:Resposta sugerida para (?:o cliente|a cliente|a equipe)|Sugestão de resposta):?\s*[\"']?(.*?)[\"']?(?:\n\n|\Z)",
            r"Retorno ao Chatwoot:\s*[\"']?(.*?)[\"']?(?:\n\n|\Z)"
        ]
        for pat in patterns:
            m = re.search(pat, output, re.DOTALL | re.IGNORECASE)
            if m:
                raw_msg = m.group(1).strip().strip("\"'").strip()
                if len(raw_msg) > 15:
                    return {
                        "action_type": "chatwoot_reply",
                        "target": f"Chatwoot Conversa #{cid}",
                        "payload": {
                            "conversation_id": cid,
                            "message": raw_msg
                        },
                        "summary": f"Resposta à equipe/cliente na Conversa #{cid}"
                    }

    return None


def send_telegram_action_approval(action_id: str, chat_id: Optional[str] = None):
    """Envia notificação rica ao Telegram com botões inline de aprovação/rejeição a todos os aprovadores configurados."""
    act = get_pending_action(action_id)
    if not act:
        return

    payload = json.loads(act["payload_json"]) if isinstance(act["payload_json"], str) else (act["payload_json"] or {})
    proposed_msg = payload.get("message") or payload.get("content") or act["summary"]

    clean_target = str(act['target']).replace("<", "&lt;").replace(">", "&gt;")
    clean_summary = str(act['summary']).replace("<", "&lt;").replace(">", "&gt;")

    is_intranetmall = act.get("action_type") in ("intranetmall_sales_batch_sync", "intranetmall_sales_sync")
    is_erp_nfe_inbound = act.get("action_type") == "erp_weekly_nfe_inbound"
    if is_intranetmall:
        text = (
            f"🛍️ <b>CORREÇÃO / LANÇAMENTO DE VENDAS INTRANET MALL — AGUARDANDO APROVAÇÃO</b>\n\n"
            f"📋 <b>Tarefa:</b> <code>{act['task_id']}</code>\n"
            f"🎯 <b>Portal Alvo:</b> {clean_target}\n"
            f"📌 <b>Objetivo:</b> {clean_summary}\n"
            f"────────────────────\n\n"
            f"{proposed_msg}\n\n"
            f"────────────────────\n"
            f"⚖️ <b>Deseja aprovar o lançamento/retificação automática de todas essas semanas na Intranet Mall agora?</b>"
        )
        approve_btn_label = "✅ Aprovar e Lançar na Intranet Mall"
    elif is_erp_nfe_inbound:
        text = (
            f"📦 <b>ENTRADA SEMANAL DE NOTAS FISCAIS NO ERP — AGUARDANDO APROVAÇÃO</b>\n\n"
            f"📋 <b>Tarefa:</b> <code>{act['task_id']}</code>\n"
            f"🎯 <b>Portal Alvo:</b> {clean_target}\n"
            f"📌 <b>Objetivo:</b> {clean_summary}\n"
            f"────────────────────\n\n"
            f"{proposed_msg}\n\n"
            f"────────────────────\n"
            f"⚖️ <b>Deseja aprovar a entrada e movimentação de estoque dessas Notas Fiscais no New Choice ERP agora?</b>"
        )
        approve_btn_label = "✅ Aprovar e Dar Entrada no ERP"
    else:
        clean_msg = str(proposed_msg).replace("<", "&lt;").replace(">", "&gt;")
        text = (
            f"🛡️ <b>AÇÃO SUGERIDA PELO AGENTE — AGUARDANDO VALIDAÇÃO</b>\n\n"
            f"📋 <b>Tarefa:</b> <code>{act['task_id']}</code>\n"
            f"🎯 <b>Canal Alvo:</b> {clean_target}\n"
            f"📌 <b>Objetivo:</b> {clean_summary}\n\n"
            f"💬 <b>Mensagem Proposta para Envio:</b>\n"
            f"<i>\"{clean_msg}\"</i>\n\n"
            f"⚖️ <b>Deseja aprovar o envio imediato desta ação?</b>"
        )
        approve_btn_label = "✅ Aprovar e Enviar Agora"

    reply_markup = {
        "inline_keyboard": [
            [
                {"text": approve_btn_label, "callback_data": f"act_appr_{action_id}"},
                {"text": "❌ Rejeitar", "callback_data": f"act_rej_{action_id}"}
            ]
        ]
    }

    targets = [chat_id] if chat_id else get_active_approver_chat_ids()
    now = time.time()
    for cid in targets:
        if not cid:
            continue
        msg_id = _notify_telegram(str(cid), text, reply_markup=reply_markup, parse_mode="HTML")
        if msg_id:
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO action_approver_dispatches (action_id, chat_id, message_id, dispatched_at)
                        VALUES (?, ?, ?, ?)
                    """, (action_id, str(cid), msg_id, now))
                    conn.commit()
            except Exception as e:
                logger.debug(f"Erro ao salvar despacho de ação para chat {cid}: {e}")

# --- LOGS DE EXECUÇÃO EM TEMPO REAL ---
def log_task_event(task_id: str, message: str, level: str = "INFO", agent_name: Optional[str] = None):
    now = time.time()
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                INSERT INTO agent_task_logs (task_id, timestamp, level, agent_name, message)
                VALUES (?, ?, ?, ?, ?)
            """, (task_id, now, level, agent_name, message))
            conn.commit()
    except Exception as e:
        logger.warning(f"Erro ao gravar log da tarefa {task_id}: {e}")

def get_task_logs(task_id: str, after_id: int = 0) -> List[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            SELECT id, task_id, timestamp, level, agent_name, message
            FROM agent_task_logs
            WHERE task_id = ? AND id > ?
            ORDER BY id ASC
        """, (task_id, after_id))
        rows = cur.fetchall()
        return [dict(r) for r in rows]

def cancel_task(task_id: str) -> bool:
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT status FROM agent_tasks WHERE task_id = ?", (task_id,))
        row = cur.fetchone()
        if not row:
            return False
        
        conn.execute("""
            UPDATE agent_tasks 
            SET status = 'FAILED', 
                error = '⏹️ Execução cancelada manualmente pelo usuário.', 
                completed_at = ? 
            WHERE task_id = ?
        """, (now, task_id))
        
        conn.execute("UPDATE execution_mutex SET is_locked = 0, current_task_id = NULL, locked_at = NULL WHERE current_task_id = ?", (task_id,))
        conn.commit()

    log_task_event(task_id, "⏹️ Execução cancelada manualmente pelo usuário.", level="ERROR")
    return True

def _worker_execute_task(task_id: str, crew_name: str, prompt: str, telegram_chat_id: Optional[str] = None, requester: str = 'web'):
    started_at = time.time()
    topology_snapshot = lock_execution_mutex(task_id)

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE agent_tasks SET status = 'RUNNING', started_at = ? WHERE task_id = ?", (started_at, task_id))
        conn.commit()

    log_task_event(task_id, f"🚀 Início da execução: '{prompt[:120]}...'", level="INFO")

    def step_callback(step):
        try:
            agent = getattr(step, "agent", "") or getattr(step, "role", "") or ""
            action = getattr(step, "tool", "") or ""
            input_val = getattr(step, "tool_input", "") or ""
            thought = getattr(step, "thought", "") or getattr(step, "log", "") or str(step)
            if action:
                log_task_event(task_id, f"🔧 Chamando ferramenta '{action}': {str(input_val)[:150]}", level="TOOL", agent_name=str(agent))
            elif thought:
                clean_thought = thought.split("Action:")[0].strip()
                if clean_thought:
                    log_task_event(task_id, f"💭 {clean_thought[:200]}", level="AGENT", agent_name=str(agent))
        except Exception:
            pass

    def task_callback(task_output):
        try:
            agent = getattr(task_output, "agent", "") or ""
            output_str = getattr(task_output, "raw", "") or str(task_output)
            log_task_event(task_id, f"✅ Etapa concluída por {agent}: {output_str[:180]}...", level="SUCCESS", agent_name=str(agent))
        except Exception:
            pass

    try:
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

        def run_crew():
            prompt_low = (prompt or "").lower()
            req_low = (requester or "").lower()
            is_intranetmall_routine = (
                "task-coo-intranetmall" in req_low
                or (
                    "intranetmall_daily_audit" in prompt_low
                    and (
                        "[execução programada automática" in prompt_low
                        or "auditoria diária intranet mall" in prompt_low
                        or "fechamento semanal intranet mall" in prompt_low
                        or req_low.startswith("cron:")
                    )
                )
            )
            if is_intranetmall_routine:
                log_task_event(
                    task_id,
                    "⚡ [Fast-Path Determinístico Zero-Token] Executando auditoria 360º Intranet Mall + Conciliação Produção Diária ERP (0 tokens LLM)...",
                    level="TOOL",
                    agent_name="COO (Determinístico)",
                )
                try:
                    from custom_tools.intranetmall_tools import IntranetMallClient
                except ImportError:
                    from tools.intranetmall_tools import IntranetMallClient
                return IntranetMallClient().run_full_daily_audit(include_action_block=True)

            is_saturday_schedule_routine = (
                "task-cpo-saturday-schedule" in req_low
                or (
                    "marq_hr_schedule_validation" in prompt_low
                    and (
                        "[execução programada automática" in prompt_low
                        or "auditoria preventiva da escala" in prompt_low
                        or "análise preventiva da escala" in prompt_low
                        or req_low.startswith("cron:")
                    )
                )
            )
            if is_saturday_schedule_routine:
                log_task_event(
                    task_id,
                    "⚡ [Fast-Path Determinístico Zero-Token] Executando Auditoria Preventiva da Escala da Semana Seguinte no MarQ HR (0 tokens LLM)...",
                    level="TOOL",
                    agent_name="Auditor de DP & Gente/RH (Determinístico)",
                )
                try:
                    from custom_tools.marqhr_tools import MarQHRClient
                except ImportError:
                    from tools.marqhr_tools import MarQHRClient
                return MarQHRClient().format_upcoming_week_schedule_audit()

            is_saturday_nfe_inbound_routine = (
                "task-coo-saturday-nfe-inbound" in req_low
                or (
                    ("erp_weekly_nfe_inbound_audit" in prompt_low or "entrada semanal de notas fiscais" in prompt_low)
                    and (
                        "[execução programada automática" in prompt_low
                        or "auditoria e entrada semanal de nf-e" in prompt_low
                        or "fechamento semanal de notas fiscais" in prompt_low
                        or req_low.startswith("cron:")
                        or req_low.startswith("web:")
                        or req_low.startswith("telegram:")
                    )
                )
            )
            if is_saturday_nfe_inbound_routine:
                log_task_event(
                    task_id,
                    "⚡ [Fast-Path Determinístico Zero-Token] Executando Auditoria Semanal de NF-e Destinadas (SEFAZ) + Pré-Associação De-Para no New Choice ERP (0 tokens LLM)...",
                    level="TOOL",
                    agent_name="Gestor de Estoque, Insumos & Auditor do New Choice ERP (Determinístico)",
                )
                try:
                    from custom_tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
                except ImportError:
                    from tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
                return ERPWeeklyNFeInboundManager().audit_and_stage_weekly_nfe_inbound(
                    days_back=18,
                    include_action_block=True,
                )

            # 1. FinOps Cache Semântico (quando habilitado pelo Meta-Agente)
            import hashlib as _hashlib
            sem_cache_on = str(get_setting("semantic_cache_active", "false")).lower() in ("true", "1", "yes")
            norm_p = " ".join((prompt or "").strip().lower().split())
            p_hash = _hashlib.sha256(f"{crew_name}:{norm_p}".encode("utf-8")).hexdigest()[:32]
            if sem_cache_on and norm_p and not req_low.startswith("cron:"):
                try:
                    with sqlite3.connect(DB_PATH) as c_conn:
                        c_cur = c_conn.cursor()
                        c_cur.execute(
                            "SELECT response_text FROM semantic_prompt_cache WHERE prompt_hash = ? AND expires_at > ?",
                            (p_hash, time.time())
                        )
                        c_row = c_cur.fetchone()
                        if c_row and c_row[0]:
                            c_conn.execute(
                                "UPDATE semantic_prompt_cache SET hits = hits + 1, tokens_saved = tokens_saved + 4500 WHERE prompt_hash = ?",
                                (p_hash,)
                            )
                            c_conn.commit()
                            log_task_event(
                                task_id,
                                "⚡ [Cache Semântico FinOps Hit] Resposta recuperada instantaneamente do cache SQLite (0 tokens consumidos).",
                                level="SUCCESS",
                                agent_name="Meta-Agente FinOps Cache"
                            )
                            return c_row[0]
                except Exception:
                    pass

            effective_prompt = prompt or ""

            # 2. FinOps Compressão Automática de Contexto (`context_compression_max_chars`)
            try:
                max_chars = int(get_setting("context_compression_max_chars") or 0)
                if max_chars >= 2000 and len(effective_prompt) > max_chars:
                    half = max_chars // 2
                    saved_chars = len(effective_prompt) - max_chars
                    effective_prompt = (
                        effective_prompt[:half]
                        + f"\n\n[... {saved_chars} caracteres comprimidos pelo Motor FinOps Antigravity ...]\n\n"
                        + effective_prompt[-half:]
                    )
                    log_task_event(
                        task_id,
                        f"🗜️ [Compressão FinOps] Contexto comprimido em {saved_chars} chars (~{saved_chars // 4} tokens poupados).",
                        level="INFO",
                        agent_name="Meta-Agente FinOps"
                    )
            except Exception:
                pass

            # 3. Barramento de Sinergia 360º (`cross_channel_synergy_active`)
            synergy_on = str(get_setting("cross_channel_synergy_active", "false")).lower() in ("true", "1", "yes")
            if synergy_on and crew_name != "financial" and "[CONTEXTO 360" not in effective_prompt:
                try:
                    with sqlite3.connect(DB_PATH) as s_conn:
                        s_cur = s_conn.cursor()
                        s_cur.execute("SELECT COUNT(*) FROM pending_actions WHERE status = 'PENDING'")
                        pend_cnt = s_cur.fetchone()[0] or 0
                    effective_prompt = (
                        f"[CONTEXTO 360º SINERGIA ATIVO | Ações Pendentes de Validação: {pend_cnt}]\n"
                        f"{effective_prompt}"
                    )
                except Exception:
                    pass

            # 4. Radar Tecnológico: Classificador Dinâmico de Complexidade (`tech_radar_complexity_router`)
            active_topo = topology_snapshot
            router_on = str(get_setting("tech_radar_complexity_router", "false")).lower() in ("true", "1", "yes")
            if router_on and isinstance(active_topo, dict) and len(norm_p) < 220:
                complex_keywords = ("analise profunda", "auditoria completa", "planejamento estrategico", "reestruturacao", "dre completo")
                if not any(kw in norm_p for kw in complex_keywords):
                    try:
                        active_topo = json.loads(json.dumps(active_topo))
                        for node in active_topo.get("nodes", []):
                            if node.get("type") == "agent" and not node.get("data", {}).get("isCLevel"):
                                node.setdefault("data", {})["model"] = "Gemini 3.1 Flash-Lite"
                        log_task_event(
                            task_id,
                            "🧭 [RouteLLM Zero-Token Router] Consulta classificada como direta/operacional -> Agentes especialistas roteados para Gemini 3.1 Flash-Lite.",
                            level="INFO",
                            agent_name="Radar Tecnológico RouteLLM"
                        )
                    except Exception:
                        active_topo = topology_snapshot

            # 5. Malha de Segurança & Resiliência (`llm_auto_fallback_enabled` + `max_retry_attempts`)
            fallback_on = str(get_setting("llm_auto_fallback_enabled", "false")).lower() in ("true", "1", "yes")
            try:
                max_attempts = int(get_setting("max_retry_attempts") or (3 if fallback_on else 1))
            except Exception:
                max_attempts = 3 if fallback_on else 1
            max_attempts = max(1, min(max_attempts, 4))

            last_err = None
            res_out = None
            for attempt in range(1, max_attempts + 1):
                try:
                    if crew_name == "financial":
                        res_out = run_financial_crew(effective_prompt)
                    else:
                        res_out = run_operational_crew(
                            effective_prompt,
                            topology_snapshot=active_topo,
                            step_callback=step_callback,
                            task_callback=task_callback
                        )
                    break
                except Exception as crew_err:
                    last_err = crew_err
                    if attempt < max_attempts and fallback_on:
                        backoff_sec = 2 * attempt
                        log_task_event(
                            task_id,
                            f"🛡️ [Malha de Resiliência Antigravity] Tentativa {attempt}/{max_attempts} falhou ({str(crew_err)[:120]}). Acionando retry com fallback em {backoff_sec}s...",
                            level="WARNING",
                            agent_name="Guardrail de Resiliência"
                        )
                        time.sleep(backoff_sec)
                        # Na retentativa, força fallback de modelo leve para evitar 429/503
                        if isinstance(active_topo, dict):
                            try:
                                active_topo = json.loads(json.dumps(active_topo))
                                for node in active_topo.get("nodes", []):
                                    if node.get("type") == "agent":
                                        node.setdefault("data", {})["model"] = "Gemini 3.1 Flash-Lite"
                            except Exception:
                                pass
                    else:
                        raise last_err

            if sem_cache_on and norm_p and res_out:
                try:
                    ttl_sec = int(get_setting("semantic_cache_ttl_seconds") or 1800)
                    now_c = time.time()
                    with sqlite3.connect(DB_PATH) as c_conn:
                        c_conn.execute("""
                            INSERT INTO semantic_prompt_cache (prompt_hash, normalized_prompt, crew_name, response_text, hits, tokens_saved, created_at, expires_at)
                            VALUES (?, ?, ?, ?, 0, 0, ?, ?)
                            ON CONFLICT(prompt_hash) DO UPDATE SET response_text = excluded.response_text, expires_at = excluded.expires_at
                        """, (p_hash, norm_p[:500], crew_name, str(res_out), now_c, now_c + ttl_sec))
                        c_conn.commit()
                except Exception:
                    pass
            return res_out

        # Limite máximo de segurança configurável em Config & Status (padrão 300s) para evitar custo infinito
        try:
            MAX_TIMEOUT_SECONDS = int(get_setting("task_timeout_seconds") or 300)
        except Exception:
            MAX_TIMEOUT_SECONDS = 300
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(run_crew)
            try:
                output = future.result(timeout=MAX_TIMEOUT_SECONDS)
            except FuturesTimeoutError:
                raise TimeoutError(f"Tempo limite de execução excedido ({MAX_TIMEOUT_SECONDS}s). A tarefa foi abortada para evitar consumo excessivo de tokens e custos infinitos.")

        task_row = get_task(task_id) or {}
        actual_requester = requester or task_row.get("requester") or "web"
        task_info = {"task_id": task_id, "crew_name": crew_name, "prompt": prompt, "requester": actual_requester}
        proposed_act = extract_proposed_action(output, task_info)

        # Trava Pós-LLM Anti-Colisão WhatsApp/Chatwoot: se um humano respondeu enquanto o agente pensava, descarta a sugestão
        if proposed_act and proposed_act.get("action_type") == "chatwoot_reply":
            try:
                from api.event_triggers import get_conversation_human_status
                p_cid = (proposed_act.get("payload") or {}).get("conversation_id")
                if p_cid:
                    h_st = get_conversation_human_status(int(p_cid))
                    last_h = float(h_st.get("last_human_reply_at") or 0.0)
                    if h_st.get("already_answered") or h_st.get("should_pause") or (last_h > 0 and last_h >= started_at - 30.0):
                        log_task_event(
                            task_id,
                            f"👨‍💼 [ANTI-COLISÃO WHATSAPP]: Um operador humano já respondeu na Conversa #{p_cid} durante o processamento. "
                            f"Sugestão descartada para evitar que humano e agente respondam à mesma mensagem.",
                            level="WARNING"
                        )
                        proposed_act = None
            except Exception as col_err:
                logger.debug(f"Erro na verificação pós-LLM de colisão humana: {col_err}")

        # Remove o bloco técnico ```action ... ``` da saída visível antes de salvar/enviar
        import re as _re
        clean_visible_output = _re.sub(r"\n*```(?:action|json)\s*\{.*?\}\s*```\s*", "", str(output or ""), flags=_re.DOTALL).strip()

        completed_at = time.time()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                UPDATE agent_tasks 
                SET status = 'COMPLETED', result = ?, completed_at = ? 
                WHERE task_id = ?
            """, (clean_visible_output, completed_at, task_id))
            conn.commit()

        output = clean_visible_output
        log_task_event(task_id, f"🎉 Execução finalizada com sucesso em {int(completed_at - started_at)}s!", level="SUCCESS")

        # Notificação Telegram e Validação de Ações (Human-in-the-Loop vs Autônomo)
        target_tg_chat = telegram_chat_id or get_setting("telegram_default_chat_id")

        if proposed_act:
            act_id = create_pending_action(
                task_id=task_id,
                action_type=proposed_act["action_type"],
                target=proposed_act["target"],
                payload=proposed_act["payload"],
                summary=proposed_act["summary"]
            )
            if is_action_approval_required() or proposed_act.get("action_type") in ("erp_weekly_nfe_inbound", "intranetmall_sales_batch_sync", "intranetmall_sales_sync"):
                log_task_event(task_id, f"🛡️ Ação proposta aguardando validação humana: {proposed_act['summary']} (ID: {act_id})", level="WARNING")
                if target_tg_chat:
                    send_telegram_action_approval(act_id, target_tg_chat)
                else:
                    send_telegram_action_approval(act_id, None)
            else:
                exec_res = execute_pending_action(act_id, resolved_by="Modo Autônomo")
                log_task_event(task_id, f"⚡ Ação executada automaticamente no Modo Autônomo: {proposed_act['summary']}", level="SUCCESS")
                if target_tg_chat:
                    clean_target = str(proposed_act['target']).replace("<", "&lt;").replace(">", "&gt;")
                    clean_summary = str(proposed_act['summary']).replace("<", "&lt;").replace(">", "&gt;")
                    clean_status = str(exec_res.get('message', '')).replace("<", "&lt;").replace(">", "&gt;")
                    _notify_telegram(
                        target_tg_chat,
                        f"⚡ <b>Ação Executada Automaticamente (Modo Autônomo)</b>\n"
                        f"📋 <b>Tarefa:</b> <code>{task_id}</code>\n"
                        f"🎯 <b>Canal:</b> {clean_target}\n"
                        f"💬 <b>Ação:</b> {clean_summary}\n\n"
                        f"✅ <i>Status: {clean_status}</i>",
                        parse_mode="HTML"
                    )
        elif telegram_chat_id or (target_tg_chat and (
            actual_requester.startswith("cron:") or
            any(w in prompt.lower() for w in ["telegram", "alerta", "avise", "notifique", "mande"]) or
            any(w in output.lower() for w in ["[alerta", "🚨", "⚠️", "não paga", "vencid", "pendência", "urgente", "conta"])
        )):
            send_to_chat = telegram_chat_id or target_tg_chat
            duracao = int(completed_at - started_at)
            is_cron = actual_requester.startswith("cron:")
            header_icon = "⏰" if is_cron else "🤖"
            header_title = f"Rotina Agendada (CRON): {crew_name}" if is_cron else "Tarefa de Agente Concluída"
            
            _notify_telegram(
                send_to_chat,
                f"{header_icon} <b>{header_title}</b> (ID: <code>{task_id}</code>)\n"
                f"⏱ <b>Tempo:</b> {duracao}s\n"
                f"────────────────────\n\n"
                f"{output}",
                parse_mode="HTML"
            )

        # Se for a rotina de Fechamento Contábil JV Rio concluída com sucesso, persiste o estado determinístico de validação do mês
        if "task-cfo-jvrio-audit" in actual_requester or "fechamento contábil jv rio" in prompt.lower() or "fechamento contabil jv rio" in prompt.lower():
            try:
                from tools.google_workspace_tools import audit_jvrio_closing_folder
                jv_sync = audit_jvrio_closing_folder(persist_state=True)
                if jv_sync.get("is_100_validated"):
                    log_task_event(
                        task_id,
                        f"🔒 Competência {jv_sync.get('competencia')} confirmada 100% completa no Google Drive ({jv_sync.get('total_files')} arquivos). Próximas execuções automáticas deste mês serão poupadas.",
                        level="SUCCESS"
                    )
            except Exception as jv_err:
                logger.warning(f"Erro ao sincronizar trava mensal JV Rio pós-tarefa {task_id}: {jv_err}")

    except Exception as e:
        logger.exception(f"Erro na execução da tarefa {task_id}: {e}")
        err_msg = str(e)
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
            err_msg = "⚠️ Limite de cota diária do Google Gemini atingido na chave atual (Free Tier 20 req/dia). Para continuar executando, configure uma chave ativa em 'Config & Status'."
        elif "404" in err_msg and "not found" in err_msg.lower():
            err_msg = f"⚠️ O modelo selecionado não foi encontrado ou está descontinuado na API do Gemini. Detalhe: {err_msg[:200]}"
            
        completed_at = time.time()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                UPDATE agent_tasks 
                SET status = 'FAILED', error = ?, completed_at = ? 
                WHERE task_id = ?
            """, (err_msg, completed_at, task_id))
            conn.commit()

        log_task_event(task_id, f"❌ Erro na execução: {err_msg}", level="ERROR")

        # Dispara alerta imediato para o Telegram em QUALQUER falha de agente
        send_system_telegram_alert(
            title=f"Falha na Tarefa {task_id} ({crew_name.upper()})",
            details=f"Prompt: {prompt[:180]}\n\nErro: {err_msg}",
            severity="ERROR",
            source=f"agent_task:{task_id}"
        )
    finally:
        unlock_execution_mutex()

def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM agent_tasks WHERE task_id = ?", (task_id,))
        row = cur.fetchone()
        return dict(row) if row else None

def list_tasks(limit: int = 50, user_email: Optional[str] = None, is_admin: bool = False) -> List[Dict[str, Any]]:
    """Lista tarefas. Se is_admin for False e user_email fornecido, filtra estritamente pelo e-mail do usuário."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        if not is_admin and user_email:
            cur.execute("""
                SELECT * FROM agent_tasks 
                WHERE lower(user_email) = lower(?)
                ORDER BY created_at DESC LIMIT ?
            """, (user_email.strip(), limit))
        elif is_admin and user_email:
            cur.execute("""
                SELECT * FROM agent_tasks 
                WHERE lower(user_email) = lower(?)
                ORDER BY created_at DESC LIMIT ?
            """, (user_email.strip(), limit))
        else:
            cur.execute("SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT ?", (limit,))
        return [dict(row) for row in cur.fetchall()]

# --- MOTOR DE AGENDAMENTO CRON AUTÔNOMO ---
def is_cron_due(cron_expr: str, now_dt: datetime) -> bool:
    """Verifica se uma expressão cron padrão de 5 campos (minuto hora dia mês dia_da_semana) coincide com now_dt."""
    try:
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            return False
        
        m_str, h_str, dom_str, mon_str, dow_str = parts

        def match_part(val: int, expr: str, is_dow: bool = False) -> bool:
            if expr == "*":
                return True
            for segment in expr.split(","):
                if "/" in segment:
                    sub_parts = segment.split("/")
                    step = int(sub_parts[1])
                    if sub_parts[0] in ("*", ""):
                        if val % step == 0:
                            return True
                    else:
                        start = int(sub_parts[0])
                        if val >= start and (val - start) % step == 0:
                            return True
                elif "-" in segment:
                    start, end = map(int, segment.split("-"))
                    if start <= val <= end:
                        return True
                else:
                    if int(segment) == val:
                        return True
                    if is_dow and int(segment) == 7 and val == 0:
                        return True
            return False

        cron_dow = (now_dt.weekday() + 1) % 7

        return (
            match_part(now_dt.minute, m_str) and
            match_part(now_dt.hour, h_str) and
            match_part(now_dt.day, dom_str) and
            match_part(now_dt.month, mon_str) and
            match_part(cron_dow, dow_str, is_dow=True)
        )
    except Exception as e:
        logger.error(f"Erro ao avaliar cron '{cron_expr}': {e}")
        return False

_executed_cron_ticks = set()
_scheduler_started = False

def _cron_scheduler_loop():
    logger.info("Motor de agendamento CRON para agentes CrewAI inicializado.")
    while True:
        try:
            # Trava Mestra Global: suspende execução automática se cron_scheduler_enabled for 'false'
            cron_enabled = get_setting("cron_scheduler_enabled", "false")
            if str(cron_enabled).lower() in ("false", "0", "paused", "disabled", "no"):
                time.sleep(30)
                continue

            now_dt = datetime.now(BRT)
            current_minute_str = now_dt.strftime("%Y-%m-%d %H:%M")

            topo = get_canvas_topology()
            nodes = topo.get("nodes", [])
            for node in nodes:
                if node.get("type") != "agent":
                    continue
                tasks = node.get("data", {}).get("scheduledTasks", [])
                for t in tasks:
                    if not t.get("active", True):
                        continue
                    cron_expr = t.get("cron", "")
                    task_id = t.get("id", str(uuid.uuid4())[:6])
                    tick_key = f"{task_id}_{current_minute_str}"

                    if tick_key not in _executed_cron_ticks and is_cron_due(cron_expr, now_dt):
                        _executed_cron_ticks.add(tick_key)
                        agent_role = node.get("data", {}).get("role", "Agente")
                        task_title = t.get("title", "Rotina")

                        # Trava Anti-Redundância Mensal: pula a rotina JV Rio nos dias subsequentes se o mês já estiver 100% validado no Drive
                        if task_id == "task-cfo-jvrio-audit" or "jv rio" in task_title.lower():
                            try:
                                from tools.google_workspace_tools import is_jvrio_closing_already_validated
                                already_ok, reason_ok = is_jvrio_closing_already_validated(now_dt)
                                if already_ok:
                                    logger.info(f"⏭️ CRON IGNORADO: '{task_title}' ({task_id}) — {reason_ok}")
                                    continue
                            except Exception as chk_err:
                                logger.warning(f"Erro ao verificar trava mensal JV Rio no CRON: {chk_err}")

                        logger.info(f"CRON DISPARADO: '{task_title}' do agente '{agent_role}'")
                        create_task(
                            crew_name="operational",
                            prompt=f"[EXECUÇÃO PROGRAMADA AUTOMÁTICA - {task_title}]: {t.get('instruction')}",
                            requester=f"cron:{task_id}",
                            user_email=os.getenv("SYSTEM_EMAIL", "system@ai-board.local"),
                            user_name=f"CRON: {agent_role}"
                        )

            if len(_executed_cron_ticks) > 500:
                _executed_cron_ticks.clear()

        except Exception as e:
            logger.error(f"Erro no loop do scheduler CRON: {e}")

        time.sleep(20)

def start_cron_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    thread = threading.Thread(target=_cron_scheduler_loop, daemon=True)
    thread.start()

start_cron_scheduler()
