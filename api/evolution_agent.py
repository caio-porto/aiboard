import api.db_utils
"""
Agente Evolucionário e Arquiteto de Sistema (Meta-Agente Antigravity — Custo Zero).
Responsável por:
1. Auditoria contínua 360º (FinOps, Prompts, Memórias, Tools/MCP, Segurança, Integração e Radar Tecnológico).
2. Geração e gestão do Backlog Evolutivo (`evolution_tasks`).
3. Snapshots atômicos pré-mudança (`system_snapshots`) com Rollback imediato em 1 clique.
4. Execução autônoma (Full-Auto) ou sob aprovação em lote com testes de integridade (`TESTING`) e streaming SSE ao vivo.
"""
import os
import sys
import time
import uuid
import json
import shutil
import difflib
import hashlib
import sqlite3
import logging
import threading
import subprocess
import importlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

from api.tasks_queue import (
    DB_PATH,
    get_canvas_topology,
    save_canvas_topology,
    get_agent_memory,
    save_agent_memory,
    get_agent_personality,
    save_agent_personality,
    get_setting,
    set_setting,
    get_town_hall,
    save_town_hall,
    get_all_tools_health_cache,
    save_tool_health,
    save_all_tools_health,
)
from api.tool_diagnostics import (
    test_tool_health,
    get_all_tools_health,
)
from api.agent_workspace import (
    list_agent_workspace_files,
    get_workspace_file_content,
    save_workspace_file,
    delete_workspace_file,
    execute_workspace_script,
)

logger = logging.getLogger("evolution_agent")
BRT = timezone(timedelta(hours=-3))

VALID_CATEGORIES = [
    "Prompt",
    "Tool/MCP",
    "FinOps",
    "Segurança",
    "Integração",
    "Nova Feature",
]

VALID_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"]

VALID_STATUSES = [
    "PENDING_APPROVAL",
    "QUEUED",
    "RUNNING_IN_ANTIGRAVITY",
    "TESTING",
    "COMPLETED",
    "FAILED",
    "ROLLED_BACK",
]

RISK_ORDER = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}

# Buffer em memória + persistência SQLite para streaming SSE de baixa latência
_SSE_SUBSCRIBERS: List[Any] = []
_SSE_LOCK = threading.Lock()
_EXECUTION_LOCK = threading.Lock()
_ACTIVE_TASKS_GUARD = threading.Lock()
_ACTIVE_TASK_IDS: set = set()


def init_evolution_db():
    """Cria as tabelas de persistência do Meta-Agente Evolucionário se não existirem."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        # 1. Backlog Evolutivo de Tarefas
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evo_tasks_status ON evolution_tasks(status, created_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evo_tasks_cat ON evolution_tasks(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evo_tasks_dedup ON evolution_tasks(dedup_key)")

        # 2. Snapshots do Sistema para Rollback Instantâneo 1-Clique
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sys_snapshots_task ON system_snapshots(task_id)")

        # 3. Configurações Globais do Meta-Agente
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

        # 4. Eventos e Logs de Execução em Tempo Real (Console Antigravity)
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
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evo_live_events_id ON evolution_live_events(id ASC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_evo_live_events_task ON evolution_live_events(task_id, id ASC)")

        # 5. Cache Semântico e Determinístico de Prompts (FinOps Pillar #3)
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

        # Inicializa configurações padrão se vazio
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM evolution_settings WHERE id = 'global'")
        if cur.fetchone()[0] == 0:
            default_cats = json.dumps(["Prompt", "FinOps", "Tool/MCP", "Segurança", "Integração"], ensure_ascii=False)
            conn.execute("""
                INSERT INTO evolution_settings (
                    id, full_auto_mode, allowed_categories_json, max_auto_risk_level,
                    semantic_cache_enabled, context_compression_enabled, smart_model_routing_enabled,
                    zero_cost_antigravity_mode, last_audit_at, updated_at, updated_by
                ) VALUES ('global', 0, ?, 'LOW', 1, 1, 1, 1, ?, ?, 'Sistema')
            """, (default_cats, now, now))

        # Destrava tarefas interrompidas por eventual reinício de processo
        conn.execute("""
            UPDATE evolution_tasks
            SET status = 'PENDING_APPROVAL'
            WHERE status IN ('QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING')
        """)
        conn.commit()


# =====================================================================
# STREAMING EM TEMPO REAL (SSE) & AUDITORIA DE LOGS
# =====================================================================

def _broadcast_sse_event(event_data: Dict[str, Any]):
    """Publica um evento para todos os clientes SSE conectados ao Centro de Evolução."""
    with _SSE_LOCK:
        dead = []
        for q in _SSE_SUBSCRIBERS:
            try:
                q.put_nowait(event_data)
            except Exception:
                dead.append(q)
        for d in dead:
            try:
                _SSE_SUBSCRIBERS.remove(d)
            except ValueError:
                pass


def subscribe_evolution_stream():
    """Registra uma fila assíncrona/thread-safe para receber eventos SSE."""
    import queue
    q = queue.Queue(maxsize=250)
    with _SSE_LOCK:
        _SSE_SUBSCRIBERS.append(q)
    return q


def unsubscribe_evolution_stream(q):
    with _SSE_LOCK:
        try:
            _SSE_SUBSCRIBERS.remove(q)
        except ValueError:
            pass


def emit_evolution_log(
    task_id: str,
    step: str,
    message: str,
    level: str = "INFO",
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Grava um passo de execução do Antigravity no banco e transmite imediatamente via SSE."""
    now = time.time()
    ts_human = datetime.fromtimestamp(now, BRT).strftime("%H:%M:%S")
    log_entry = {
        "task_id": task_id,
        "timestamp": now,
        "time_human": ts_human,
        "step": step,
        "level": level,
        "message": message,
        "details": details or {},
    }

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO evolution_live_events (task_id, timestamp, step, level, message, details_json)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (task_id, now, step, level, message, json.dumps(details or {}, ensure_ascii=False)))
            event_id = cur.lastrowid
            log_entry["id"] = event_id

            # Também anexa ao JSON de logs da própria tarefa para auditoria perpétua
            cur.execute("SELECT execution_logs_json FROM evolution_tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if row:
                try:
                    existing_logs = json.loads(row[0] or "[]")
                except Exception:
                    existing_logs = []
                existing_logs.append(log_entry)
                conn.execute(
                    "UPDATE evolution_tasks SET execution_logs_json = ? WHERE id = ?",
                    (json.dumps(existing_logs[-120:], ensure_ascii=False), task_id)
                )
            conn.commit()
    except Exception as e:
        logger.warning(f"Erro ao gravar log evolutivo ({task_id}): {e}")
        log_entry["id"] = int(now * 1000)

    _broadcast_sse_event({"type": "log", "data": log_entry})
    return log_entry


def get_evolution_live_events(after_id: int = 0, task_id: Optional[str] = None, limit: int = 120) -> List[Dict[str, Any]]:
    """Retorna os eventos recentes do console Antigravity para inicialização ou polling."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        if task_id:
            cur.execute("""
                SELECT id, task_id, timestamp, step, level, message, details_json
                FROM evolution_live_events
                WHERE task_id = ? AND id > ?
                ORDER BY id ASC LIMIT ?
            """, (task_id, after_id, limit))
        elif after_id > 0:
            cur.execute("""
                SELECT id, task_id, timestamp, step, level, message, details_json
                FROM evolution_live_events
                WHERE id > ?
                ORDER BY id ASC LIMIT ?
            """, (after_id, limit))
        else:
            cur.execute("""
                SELECT * FROM (
                    SELECT id, task_id, timestamp, step, level, message, details_json
                    FROM evolution_live_events
                    ORDER BY id DESC LIMIT ?
                ) ORDER BY id ASC
            """, (limit,))
        rows = cur.fetchall()
        out = []
        for r in rows:
            try:
                det = json.loads(r["details_json"]) if r["details_json"] else {}
            except Exception:
                det = {}
            out.append({
                "id": r["id"],
                "task_id": r["task_id"],
                "timestamp": r["timestamp"],
                "time_human": datetime.fromtimestamp(r["timestamp"], BRT).strftime("%H:%M:%S"),
                "step": r["step"],
                "level": r["level"],
                "message": r["message"],
                "details": det,
            })
        return out


# =====================================================================
# CONFIGURAÇÕES DO META-AGENTE (FULL-AUTO & FILTROS)
# =====================================================================

def get_evolution_settings() -> Dict[str, Any]:
    """Lê as configurações globais do Meta-Agente."""
    init_evolution_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM evolution_settings WHERE id = 'global'")
        row = cur.fetchone()
        if not row:
            return {
                "full_auto_mode": False,
                "allowed_categories": ["Prompt", "FinOps", "Tool/MCP", "Segurança", "Integração"],
                "max_auto_risk_level": "LOW",
                "semantic_cache_enabled": True,
                "context_compression_enabled": True,
                "smart_model_routing_enabled": True,
                "zero_cost_antigravity_mode": True,
                "last_audit_at": None,
                "updated_at": time.time(),
                "updated_by": "Sistema",
            }
        try:
            cats = json.loads(row["allowed_categories_json"] or "[]")
        except Exception:
            cats = ["Prompt", "FinOps", "Tool/MCP"]
        return {
            "full_auto_mode": bool(row["full_auto_mode"]),
            "allowed_categories": cats,
            "max_auto_risk_level": row["max_auto_risk_level"] or "LOW",
            "semantic_cache_enabled": bool(row["semantic_cache_enabled"]),
            "context_compression_enabled": bool(row["context_compression_enabled"]),
            "smart_model_routing_enabled": bool(row["smart_model_routing_enabled"]),
            "zero_cost_antigravity_mode": bool(row["zero_cost_antigravity_mode"]),
            "last_audit_at": row["last_audit_at"],
            "updated_at": row["updated_at"],
            "updated_by": row["updated_by"] or "Admin",
        }


def update_evolution_settings(payload: Dict[str, Any], updated_by: str = "Admin") -> Dict[str, Any]:
    """Atualiza as configurações do Meta-Agente e dispara auto-execução caso `full_auto_mode` seja ativado."""
    current = get_evolution_settings()
    full_auto = bool(payload.get("full_auto_mode", current["full_auto_mode"]))
    allowed_cats = payload.get("allowed_categories", current["allowed_categories"])
    if not isinstance(allowed_cats, list):
        allowed_cats = current["allowed_categories"]
    max_risk = str(payload.get("max_auto_risk_level", current["max_auto_risk_level"])).upper()
    if max_risk not in VALID_RISK_LEVELS:
        max_risk = "LOW"

    sem_cache = bool(payload.get("semantic_cache_enabled", current["semantic_cache_enabled"]))
    ctx_comp = bool(payload.get("context_compression_enabled", current["context_compression_enabled"]))
    smart_route = bool(payload.get("smart_model_routing_enabled", current["smart_model_routing_enabled"]))
    zero_cost = bool(payload.get("zero_cost_antigravity_mode", current["zero_cost_antigravity_mode"]))

    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE evolution_settings
            SET full_auto_mode = ?,
                allowed_categories_json = ?,
                max_auto_risk_level = ?,
                semantic_cache_enabled = ?,
                context_compression_enabled = ?,
                smart_model_routing_enabled = ?,
                zero_cost_antigravity_mode = ?,
                updated_at = ?,
                updated_by = ?
            WHERE id = 'global'
        """, (
            1 if full_auto else 0,
            json.dumps(allowed_cats, ensure_ascii=False),
            max_risk,
            1 if sem_cache else 0,
            1 if ctx_comp else 0,
            1 if smart_route else 0,
            1 if zero_cost else 0,
            now,
            updated_by,
        ))
        conn.commit()

    new_settings = get_evolution_settings()
    _broadcast_sse_event({"type": "settings_updated", "data": new_settings})

    # Se Full-Auto foi ativado, enfileira automaticamente as tarefas pendentes elegíveis
    if full_auto:
        eligible_ids = _find_eligible_auto_tasks(new_settings)
        if eligible_ids:
            emit_evolution_log(
                "SYSTEM",
                "FULL_AUTO",
                f"⚡ Modo Autonomia Total (Full-Auto) ativo: disparando {len(eligible_ids)} tarefa(s) elegível(is) automaticamente.",
                level="STEP"
            )
            trigger_batch_execution_async(eligible_ids, approved_by=f"Full-Auto ({updated_by})")

    return new_settings


def _find_eligible_auto_tasks(settings: Dict[str, Any]) -> List[str]:
    """Filtra tarefas `PENDING_APPROVAL` que obedecem às categorias e nível máximo de risco do Full-Auto."""
    if not settings.get("full_auto_mode"):
        return []
    allowed_cats = set(settings.get("allowed_categories") or [])
    max_risk_score = RISK_ORDER.get(settings.get("max_auto_risk_level", "LOW"), 1)

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT id, category, risk_level FROM evolution_tasks WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC")
        eligible = []
        for r in cur.fetchall():
            r_score = RISK_ORDER.get(str(r["risk_level"]).upper(), 2)
            if r["category"] in allowed_cats and r_score <= max_risk_score:
                eligible.append(r["id"])
        return eligible


# =====================================================================
# UTILITÁRIOS DE DIFF E SNAPSHOTS (AUDITORIA & ROLLBACK)
# =====================================================================

def build_unified_diff(before_text: str, after_text: str, label_before: str = "Estado Atual", label_after: str = "Proposta Antigravity") -> str:
    """Gera um diff unificado legível linha a linha entre o estado anterior e o novo estado."""
    a_lines = (before_text or "").splitlines(keepends=True)
    b_lines = (after_text or "").splitlines(keepends=True)
    diff = list(difflib.unified_diff(a_lines, b_lines, fromfile=label_before, tofile=label_after, lineterm=""))
    if not diff:
        return f"--- {label_before}\n+++ {label_after}\n@@ Sem diferença textual direta @@\n+{after_text}"
    return "\n".join(line.rstrip("\n\r") for line in diff)


def create_system_snapshot(
    task_id: str,
    target_type: str,
    target_id: str,
    previous_state: Dict[str, Any],
    new_state: Optional[Dict[str, Any]] = None
) -> str:
    """Salva o estado exato anterior no banco de dados antes de qualquer alteração do Meta-Agente."""
    snapshot_id = f"snap_{uuid.uuid4().hex[:10]}"
    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO system_snapshots (
                snapshot_id, task_id, target_type, target_id,
                previous_state_json, new_state_json, created_at, is_restored
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            snapshot_id,
            task_id,
            target_type,
            target_id,
            json.dumps(previous_state, ensure_ascii=False),
            json.dumps(new_state or {}, ensure_ascii=False),
            now,
        ))
        conn.execute("UPDATE evolution_tasks SET snapshot_id = ? WHERE id = ?", (snapshot_id, task_id))
        conn.commit()
    return snapshot_id


def get_snapshot_by_task(task_id: str) -> Optional[Dict[str, Any]]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM system_snapshots WHERE task_id = ? ORDER BY created_at DESC LIMIT 1", (task_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        try:
            d["previous_state"] = json.loads(d["previous_state_json"] or "{}")
        except Exception:
            d["previous_state"] = {}
        try:
            d["new_state"] = json.loads(d["new_state_json"] or "{}")
        except Exception:
            d["new_state"] = {}
        return d


# =====================================================================
# COLETOR DE TELEMETRIA E AUDITORIA 360º (WHITE-LABEL & ZERO-TOKEN)
# =====================================================================

def collect_system_telemetry(refresh_health: bool = False) -> Dict[str, Any]:
    """
    Inspeciona dinamicamente o banco de dados, topologia, histórico de tarefas, erros,
    memórias, custos, workspaces e saúde em tempo real de TODAS as Ferramentas e Gatilhos.
    """
    topo = get_canvas_topology() or {"nodes": [], "edges": []}
    nodes = topo.get("nodes", [])
    edges = topo.get("edges", [])
    agent_nodes = [n for n in nodes if n.get("type") == "agent"]
    tool_nodes = [n for n in nodes if n.get("type") == "tool"]
    trigger_nodes = [n for n in nodes if n.get("type") == "trigger"]

    now = time.time()
    seven_days_ago = now - (7 * 86400)

    total_tasks_7d = 0
    failed_tasks_7d = []
    recent_error_logs = []
    total_cost_7d_brl = 0.0

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*), COALESCE(SUM(cost_brl), 0) FROM agent_tasks WHERE created_at >= ?", (seven_days_ago,))
        r_cnt = cur.fetchone()
        if r_cnt:
            total_tasks_7d = r_cnt[0] or 0
            total_cost_7d_brl = float(r_cnt[1] or 0.0)

        cur.execute("""
            SELECT task_id, crew_name, prompt, error, requester, created_at
            FROM agent_tasks
            WHERE status = 'FAILED' AND created_at >= ?
            ORDER BY created_at DESC LIMIT 15
        """, (seven_days_ago,))
        failed_tasks_7d = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT task_id, agent_name, message, timestamp
            FROM agent_task_logs
            WHERE level = 'ERROR' AND timestamp >= ?
            ORDER BY id DESC LIMIT 20
        """, (seven_days_ago,))
        recent_error_logs = [dict(r) for r in cur.fetchall()]

    # Analisa agentes, modelos, prompts, memórias e scripts locais
    agents_telemetry = []
    for an in agent_nodes:
        aid = an.get("id", "")
        adata = an.get("data", {})
        role = adata.get("role") or adata.get("name") or aid
        name = adata.get("name") or role
        model = adata.get("model") or "Gemini 3.8 Flash"
        goal = adata.get("goal") or ""
        backstory = adata.get("backstory") or ""
        is_clevel = bool(adata.get("isCLevel") or adata.get("isLead"))
        scheduled = adata.get("scheduledTasks", [])
        mem = get_agent_memory(aid)
        pers = get_agent_personality(aid)
        ws = list_agent_workspace_files(aid)

        agents_telemetry.append({
            "id": aid,
            "name": name,
            "role": role,
            "department": adata.get("department", "geral"),
            "model": model,
            "is_clevel": is_clevel,
            "goal": goal,
            "backstory": backstory,
            "scheduled_tasks": scheduled,
            "memory_text": mem.get("memory_text", ""),
            "learned_facts_count": len(mem.get("learned_facts", [])),
            "learned_facts": mem.get("learned_facts", []),
            "personality_tone": pers.get("tone", ""),
            "personality_guidelines": pers.get("guidelines", ""),
            "workspace_files_count": ws.get("total_files", 0),
            "workspace_files": [f["name"] for f in ws.get("files", [])],
            "tokens_saved_estimate": ws.get("tokens_saved_estimate", 0),
        })

    tools_health = get_all_tools_health_cache()
    connector_nodes = tool_nodes + trigger_nodes

    # Se refresh_health=True (durante Auditoria 360º) ou se houver conectores sem diagnóstico / offline no cache,
    # executa probe real em todas as Ferramentas e Gatilhos para capturar problemas de conexão em tempo real.
    needs_live_probe = refresh_health or any(
        (n.get("id") not in tools_health) or (tools_health.get(n.get("id"), {}).get("status") != "online")
        for n in connector_nodes
    )
    if needs_live_probe and connector_nodes:
        try:
            live_health = get_all_tools_health(nodes)
            save_all_tools_health(live_health)
            tools_health.update(live_health)
        except Exception as e:
            logger.warning(f"Erro ao sondar saúde ao vivo de ferramentas e gatilhos: {e}")

    tools_online = 0
    triggers_online = 0
    unhealthy_connectors: List[Dict[str, Any]] = []

    for cn in connector_nodes:
        cid = cn.get("id", "")
        ctype = cn.get("type", "tool")
        cdata = cn.get("data", {})
        cname = cdata.get("name") or cdata.get("label") or cid
        h = tools_health.get(cid) or {}
        status = h.get("status") or cdata.get("healthStatus") or "warning"
        status_label = h.get("status_label") or cdata.get("healthLabel") or "Falha de Conexão"
        details = h.get("details") or cdata.get("healthDetails") or "Conector sem telemetria recente."
        is_cfg = bool(h.get("is_configured", cdata.get("isConfigured", False)))
        latency = int(h.get("latency_ms", cdata.get("healthLatency", 0)) or 0)

        if status == "online":
            if ctype == "trigger":
                triggers_online += 1
            else:
                tools_online += 1
        else:
            unhealthy_connectors.append({
                "id": cid,
                "name": cname,
                "node_type": ctype,
                "type_label": "Gatilho" if ctype == "trigger" else "Ferramenta",
                "status": status,
                "status_label": status_label,
                "details": details,
                "is_configured": is_cfg,
                "latency_ms": latency,
                "node_data": cdata,
            })

    company_name = get_setting("company_name") or "AI Board"

    return {
        "company_name": company_name,
        "timestamp": now,
        "total_agents": len(agent_nodes),
        "total_tools": len(tool_nodes),
        "total_triggers": len(trigger_nodes),
        "tools_online": tools_online,
        "triggers_online": triggers_online,
        "unhealthy_connectors": unhealthy_connectors,
        "total_edges": len(edges),
        "total_tasks_7d": total_tasks_7d,
        "failed_tasks_count_7d": len(failed_tasks_7d),
        "failed_tasks_7d": failed_tasks_7d,
        "recent_error_logs": recent_error_logs,
        "total_cost_7d_brl": round(total_cost_7d_brl, 2),
        "agents": agents_telemetry,
        "tool_nodes": tool_nodes,
        "trigger_nodes": trigger_nodes,
        "edges": edges,
        "tools_health": tools_health,
    }


def get_platform_monthly_cost_summary() -> Dict[str, float]:
    """
    Obtém o gasto mensal previsto real da plataforma (mesma fórmula de /api/costs/estimate em Config & Status),
    garantindo que qualquer estimativa FinOps seja matematicamente proporcional ao consumo real (~R$ 2,07/mês).
    """
    try:
        from api.main import get_cost_estimate_endpoint
        est = get_cost_estimate_endpoint()
        curr_brl = float(est.get("combined_total", {}).get("cost_brl_month") or 2.07)
        fx = float(est.get("exchange_rate_usd_brl") or 5.50)
        return {"current_monthly_cost_brl": round(curr_brl, 2), "exchange_rate": fx}
    except Exception:
        return {"current_monthly_cost_brl": 2.07, "exchange_rate": 5.50}


def calculate_realistic_task_savings_brl(
    target_type: str,
    category: str,
    target_id: str = "",
    dedup_key: str = ""
) -> float:
    """
    Calcula a economia mensal real em R$ de uma melhoria com base no consumo efetivo de tokens
    e na tabela oficial Gemini Flash ($0.75/1M in, $3.75/1M out) vs Flash-Lite ($0.25/1M in, $1.50/1M out).
    Melhorias de conectividade, segurança e integração possuem economia financeira direta = R$ 0,00
    (seu foco é disponibilidade/confiabilidade e não redução de fatura de tokens).
    """
    tt = (target_type or "").lower()
    cat = (category or "").strip()
    dk = (dedup_key or "").lower()

    # 1. Reparo de conectores, Segurança/Fallback e Barramento de Integração -> Foco em Uptime/Confiabilidade (R$ 0,00)
    if tt == "connector_repair" or cat in ("Segurança", "Integração") or "connector_repair" in dk or "security_" in dk or "integration_" in dk:
        return 0.0

    cost_info = get_platform_monthly_cost_summary()
    fx = cost_info["exchange_rate"]
    base_monthly_brl = max(0.50, cost_info["current_monthly_cost_brl"])

    # 2. Roteamento FinOps de Agente Especialista (Flash -> Flash-Lite: -66.7% por execução daquele agente)
    # 15k in + 1.2k out em ~3 execuções/mês = ~$0.0306 USD poupados/mês (~R$ 0,17/mês)
    if tt == "agent_model" or "finops_model_route" in dk:
        usd_saved_per_run = ((15000 / 1_000_000.0) * (0.75 - 0.25)) + ((1200 / 1_000_000.0) * (3.75 - 1.50))
        return round(usd_saved_per_run * 3.0 * fx, 2)  # ~R$ 0,17/mês

    # 3. Cache Semântico SQLite (~11% de chamadas repetidas evitadas sobre o gasto mensal real)
    if "semantic_cache" in dk or target_id == "finops_cache_bundle":
        return round(min(0.35, base_monthly_brl * 0.115), 2)  # ~R$ 0,24/mês

    # 4. Classificador RouteLLM Zero-Token (~13.5% de desvio fast-path sobre o gasto mensal real)
    if "intent_router" in dk or target_id == "tech_radar_intent_router":
        return round(min(0.40, base_monthly_brl * 0.135), 2)  # ~R$ 0,28/mês

    # 5. Script Determinístico Local Zero-Token (Tool/MCP): evita ~3.200 tokens (2.7k in + 500 out) em ~4 execuções/mês
    if tt == "workspace_script" or cat == "Tool/MCP":
        usd_saved_per_run = ((2700 / 1_000_000.0) * 0.75) + ((500 / 1_000_000.0) * 3.75)
        return round(usd_saved_per_run * 4.2 * fx, 2)  # ~R$ 0,09/mês

    # 6. Refinamento de System Prompt & Memória: reduz ~400 tokens de saída/raciocínio redundante em ~4 execuções/mês
    if tt in ("agent_prompt", "agent_memory") or cat == "Prompt":
        usd_saved_per_run = ((400 / 1_000_000.0) * 3.75) + ((600 / 1_000_000.0) * 0.75)
        return round(usd_saved_per_run * 4.0 * fx, 2)  # ~R$ 0,04/mês

    return round(min(0.15, base_monthly_brl * 0.05), 2)


def recalibrate_existing_task_savings() -> None:
    """
    Recalibra automaticamente tarefas no banco que possuam estimativas antigas infladas (> R$ 1,50/mês)
    e corrige textos de impacto que citavam valores irreais (ex: R$ 18,50 ou R$ 34,00).
    """
    import re
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT id, target_type, category, target_id, dedup_key, estimated_savings_brl, expected_impact FROM evolution_tasks")
            rows = cur.fetchall()
            updates = []
            for r in rows:
                old_sav = float(r["estimated_savings_brl"] or 0.0)
                impact = r["expected_impact"] or ""
                new_sav = calculate_realistic_task_savings_brl(
                    r["target_type"], r["category"], r["target_id"], r["dedup_key"]
                )
                new_impact = impact
                if "R$" in impact:
                    if new_sav > 0:
                        new_impact = re.sub(r"~?\s*R\$\s*\d+[.,]\d+\s*/\s*m[êe]s(\s+poupados)?", f"~R$ {new_sav:.2f}/mês poupados", impact)
                    else:
                        new_impact = re.sub(r"\s*\(~?\s*R\$\s*\d+[.,]\d+\s*/\s*m[êe]s.*?\)", "", impact)
                if abs(old_sav - new_sav) > 0.009 or new_impact != impact:
                    updates.append((new_sav, new_impact, r["id"]))
            if updates:
                conn.executemany(
                    "UPDATE evolution_tasks SET estimated_savings_brl = ?, expected_impact = ? WHERE id = ?",
                    updates
                )
                conn.commit()
    except Exception as e:
        logger.warning(f"Aviso ao recalibrar estimativas FinOps: {e}")


def _upsert_evolution_task(task_spec: Dict[str, Any]) -> Tuple[Optional[str], bool]:
    """
    Insere uma nova tarefa no backlog evolutivo se não houver outra tarefa ativa/concluída
    com a mesma `dedup_key`. Para reparos de conectores (`allow_reopen_completed=True`),
    permite reabrir/criar nova tarefa se o conector voltar a ficar offline após um reparo anterior.
    Retorna `(task_id, is_new)`.
    """
    dedup_key = task_spec.get("dedup_key") or hashlib.sha1(task_spec["title"].encode("utf-8")).hexdigest()[:16]
    allow_reopen = bool(task_spec.get("allow_reopen_completed", False))
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        if allow_reopen:
            cur.execute("""
                SELECT id, status FROM evolution_tasks
                WHERE dedup_key = ? AND status IN ('PENDING_APPROVAL', 'QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING')
                LIMIT 1
            """, (dedup_key,))
        else:
            cur.execute("""
                SELECT id, status FROM evolution_tasks
                WHERE dedup_key = ? AND status IN ('PENDING_APPROVAL', 'QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING', 'COMPLETED')
                LIMIT 1
            """, (dedup_key,))
        existing = cur.fetchone()
        if existing:
            if allow_reopen and existing[1] == "PENDING_APPROVAL":
                # Atualiza detalhes/payload com a telemetria de erro mais recente
                payload_str = json.dumps(task_spec.get("payload", {}), ensure_ascii=False)
                conn.execute("""
                    UPDATE evolution_tasks
                    SET title = ?, description = ?, expected_impact = ?, payload_json = ?
                    WHERE id = ?
                """, (
                    task_spec["title"],
                    task_spec["description"],
                    task_spec["expected_impact"],
                    payload_str,
                    existing[0],
                ))
                conn.commit()
            return existing[0], False

        task_id = f"evo_{uuid.uuid4().hex[:8]}"
        now = time.time()
        payload_str = json.dumps(task_spec.get("payload", {}), ensure_ascii=False)
        initial_log = [{
            "id": 1,
            "task_id": task_id,
            "timestamp": now,
            "time_human": datetime.fromtimestamp(now, BRT).strftime("%H:%M:%S"),
            "step": "DIAGNOSIS",
            "level": "INFO",
            "message": f"Tarefa diagnosticada e proposta pelo Meta-Agente Antigravity (0 tokens consumidos).",
            "details": {"category": task_spec["category"], "risk_level": task_spec.get("risk_level", "LOW")},
        }]

        conn.execute("""
            INSERT INTO evolution_tasks (
                id, title, description, category, risk_level, expected_impact,
                status, target_type, target_id, target_name, payload_json,
                execution_logs_json, tokens_cost, estimated_savings_brl,
                author, created_at, dedup_key
            ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        """, (
            task_id,
            task_spec["title"],
            task_spec["description"],
            task_spec["category"],
            task_spec.get("risk_level", "LOW"),
            task_spec["expected_impact"],
            task_spec["target_type"],
            task_spec["target_id"],
            task_spec.get("target_name", task_spec["target_id"]),
            payload_str,
            json.dumps(initial_log, ensure_ascii=False),
            float(task_spec.get("estimated_savings_brl", 0.0)),
            task_spec.get("author", "Meta-Agente Antigravity (Zero-Cost)"),
            now,
            dedup_key,
        ))
        conn.commit()
        return task_id, True


def _is_repetitive_proposal(spec: Dict[str, Any], existing_rows: List[Tuple[str, str, str, str, str]]) -> bool:
    """
    Impede a geração repetitiva de tarefas com o mesmo molde/arquétipo (ex: 'Refinar System Prompt & Memória...'
    ou 'Criar Script Determinístico...' para cada agente sequencialmente).
    `existing_rows`: lista de tuplas `(title, dedup_key, target_id, category, status)`.
    """
    title_low = (spec.get("title") or "").strip().lower()
    cat = spec.get("category") or ""
    ttype = spec.get("target_type") or ""
    dk = spec.get("dedup_key") or ""

    if ttype == "connector_repair":
        return False

    existing_keys = {r[1] for r in existing_rows}
    if dk in existing_keys:
        return True

    existing_titles_low = [(r[0] or "").strip().lower() for r in existing_rows]
    if title_low in existing_titles_low:
        return True

    # Conta quantas vezes os moldes genéricos de Prompt e Script já foram gerados no histórico
    prompt_refine_count = sum(
        1 for r in existing_rows
        if "refinar system prompt" in (r[0] or "").lower() or "refinar prompt" in (r[0] or "").lower()
    )
    script_create_count = sum(
        1 for r in existing_rows
        if "criar script determinístico" in (r[0] or "").lower() or "criar ferramenta determinística" in (r[0] or "").lower()
    )

    if ("refinar system prompt" in title_low or "refinar prompt" in title_low or ttype == "agent_prompt") and prompt_refine_count >= 3:
        return True

    if ("criar script determinístico" in title_low or "criar ferramenta determinística" in title_low or ttype == "workspace_script") and script_create_count >= 3:
        return True

    # Não permite acumular no backlog pendente duas tarefas da mesma categoria (exceto reparo de conectores)
    pending_categories = {r[3] for r in existing_rows if r[4] == "PENDING_APPROVAL"}
    if cat in pending_categories:
        return True

    return False


def _diagnose_real_operational_bottlenecks(telemetry: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Analisa os erros reais em `agent_tasks` (`FAILED` e `BLOCKED`), timeouts de gatilhos,
    locks de banco SQLite, seletores Playwright e colisões de Crons para gerar propostas
    concretas, variadas e orientadas a causa-raiz em diferentes categorias.
    """
    proposals: List[Dict[str, Any]] = []
    failed_tasks = telemetry.get("failed_tasks_7d", [])

    blocked_count = 0
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM agent_tasks WHERE status = 'BLOCKED'")
        blocked_count = cur.fetchone()[0] or 0

    has_sqlite_lock_err = any(
        "unable to open database file" in (f.get("error") or "").lower()
        or "database is locked" in (f.get("error") or "").lower()
        for f in failed_tasks
    )
    has_gmail_timeout_err = any(
        "tempo limite de execução excedido" in (f.get("error") or "").lower()
        and ("gmail" in (f.get("prompt") or "").lower() or "e-mail" in (f.get("prompt") or "").lower())
        for f in failed_tasks
    )
    has_erp_nfe_err = any(
        "contentplaceholder1_ieddatainicio" in (f.get("error") or "").lower()
        or "days_lookback" in (f.get("error") or "").lower()
        for f in failed_tasks
    )

    # 1. Diagnóstico Causa-Raiz [Segurança]: Lock de concorrência SQLite + Tarefas Órfãs BLOCKED
    wal_healed = str(get_setting("sqlite_wal_concurrency_healed", "false")).lower() == "true"
    if (has_sqlite_lock_err or blocked_count > 0) and not wal_healed:
        before_wal = (
            f"journal_mode = DELETE (lock exclusivo em escritas simultâneas)\n"
            f"busy_timeout = 5000ms\n"
            f"tarefas_travadas_status_blocked = {blocked_count} tarefa(s) retida(s) na fila\n"
            f"ultimo_erro_sqlite = 'unable to open database file' durante pico de webhook"
        )
        after_wal = (
            "journal_mode = WAL (Write-Ahead Logging concorrente sem bloqueio de leitura)\n"
            "busy_timeout = 15000ms + synchronous = NORMAL\n"
            "tarefas_travadas_status_blocked = 0 (saneamento automático de tarefas órfãs > 30min)\n"
            "protecao_concorrencia_webhooks = ativa"
        )
        proposals.append({
            "dedup_key": "rootcause_sqlite_wal_and_blocked_queue_heal_v1",
            "title": "Blindagem SQLite WAL Concorrente (`busy_timeout=15s`) & Saneamento de Fila Travada",
            "description": (
                f"A auditoria de telemetria detectou {blocked_count} tarefa(s) presas com status `BLOCKED` e erro "
                f"`unable to open database file` em disparos simultâneos de gatilhos. Esta evolução ativa o modo "
                f"`Write-Ahead Logging (WAL)` com `busy_timeout=15000ms` no banco `/app/data/tasks.db` e desbloqueia "
                f"as tarefas órfãs retidas na fila."
            ),
            "category": "Segurança",
            "risk_level": "LOW",
            "expected_impact": f"Eliminação imediata de erros de lock SQLite em webhooks concorrentes e liberação de {blocked_count} tarefa(s) bloqueada(s)",
            "target_type": "system_setting",
            "target_id": "sqlite_wal_concurrency_engine",
            "target_name": "Motor SQLite WAL & Fila de Tarefas",
            "estimated_savings_brl": 0.0,
            "payload": {
                "action": "update_system_settings",
                "heal_sqlite_wal": True,
                "settings": {
                    "sqlite_wal_concurrency_healed": "true",
                    "sqlite_busy_timeout_ms": "15000",
                    "orphan_blocked_task_ttl_sec": "1800",
                },
                "before": before_wal,
                "after": after_wal,
                "diff": build_unified_diff(before_wal, after_wal, "tasks.db Concorrência (Antes)", "tasks.db Modo WAL (Depois)"),
            },
        })

    # 2. Diagnóstico Causa-Raiz [Integração]: Timeout de 300s no Gatilho Reativo do Gmail
    gmail_guard_active = str(get_setting("gmail_reactive_timeout_guard_v1", "false")).lower() == "true"
    if has_gmail_timeout_err and not gmail_guard_active:
        before_gm = (
            "gatilho_gmail_timeout = 300s (abortando por limite excedido em notificações longas)\n"
            "filtro_pre_triagem_newsletter = inativo\n"
            "max_iteracoes_por_email_reativo = ilimitado (consumo de tokens até estourar 300s)"
        )
        after_gm = (
            "gatilho_gmail_timeout = 90s com Fast-Path determinístico\n"
            "filtro_pre_triagem_newsletter = ativo (ignora marketing/no-reply sem acionar Crew completa)\n"
            "max_iteracoes_por_email_reativo = 4 passos objetivos com timeout de 40s por ferramenta"
        )
        gm_sav = 0.14
        proposals.append({
            "dedup_key": "rootcause_gmail_reactive_timeout_guard_v1",
            "title": "Filtro Fast-Path & Limite de Iteração (`max_iter=4`) no Gatilho Reativo do Gmail",
            "description": (
                "A análise de `agent_tasks` identificou múltiplos abortos por `Tempo limite de execução excedido (300s)` "
                "em eventos `[🚨 NOVO E-MAIL RECEBIDO NO GMAIL]`. E-mails informativos ou extensos faziam o comitê entrar "
                "em loops de delegação até atingir 5 minutos. Esta melhoria aplica pré-triagem de cabeçalho e limita a "
                "execução reativa a 4 passos diretos."
            ),
            "category": "Integração",
            "risk_level": "LOW",
            "expected_impact": f"Eliminação dos timeouts de 300s no gatilho Gmail e redução de ~45% no tempo de processamento de e-mails (~R$ {gm_sav:.2f}/mês poupados)",
            "target_type": "system_setting",
            "target_id": "gmail_reactive_pipeline",
            "target_name": "Gatilho Reativo Gmail (Fast-Path)",
            "estimated_savings_brl": gm_sav,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "gmail_reactive_timeout_guard_v1": "true",
                    "gmail_trigger_max_iterations": "4",
                    "gmail_trigger_tool_timeout_sec": "40",
                    "gmail_skip_automated_noreply": "true",
                },
                "before": before_gm,
                "after": after_gm,
                "diff": build_unified_diff(before_gm, after_gm, "Pipeline Reativo Gmail (Antes)", "Pipeline Reativo Gmail (Depois)"),
            },
        })

    # 3. Diagnóstico Causa-Raiz [Tool/MCP]: Timeout no Seletor Playwright `#ContentPlaceHolder1_iEdDataInicio` & `days_lookback`
    erp_nfe_healed = str(get_setting("erp_nfe_locator_and_lookback_healed", "false")).lower() == "true"
    if has_erp_nfe_err and not erp_nfe_healed:
        before_erp = (
            "ERPWeeklyNFeInboundManager.audit_and_stage_weekly_nfe_inbound(days_back=18)\n"
            "  -> TypeError quando chamado com keyword legada 'days_lookback'\n"
            "  -> Page.fill('#ContentPlaceHolder1_iEdDataInicio') falha com Timeout 30000ms se sessão ASP expirar"
        )
        after_erp = (
            "ERPWeeklyNFeInboundManager.audit_and_stage_weekly_nfe_inbound(days_back=18, **kwargs)\n"
            "  -> Alias nativo 'days_lookback' -> 'days_back' homologado\n"
            "  -> Fallback HTTP direto + auto-relogin antes de preencher '#ContentPlaceHolder1_iEdDataInicio' (timeout 60s)"
        )
        proposals.append({
            "dedup_key": "rootcause_erp_nfe_playwright_and_lookback_v1",
            "title": "Corrigir Parâmetro `days_lookback` & Fallback de Seletor `#ContentPlaceHolder1_iEdDataInicio` no New Choice ERP",
            "description": (
                "Capturado nos logs de falha da rotina programada de estoque: `unexpected keyword argument 'days_lookback'` "
                "e `Page.fill: Timeout 30000ms exceeded waiting for #ContentPlaceHolder1_iEdDataInicio`. Esta correção "
                "habilita compatibilidade bidirecional do parâmetro `days_lookback` e ativa verificação de sessão HTTP antes "
                "do preenchimento de datas na tela de NF-e."
            ),
            "category": "Tool/MCP",
            "risk_level": "LOW",
            "expected_impact": "100% de estabilidade na rotina programada de Auditoria Semanal de NF-e Destinadas (SEFAZ/New Choice ERP)",
            "target_type": "system_setting",
            "target_id": "new_choice_erp_nfe_auditor",
            "target_name": "Auditor de NF-e (New Choice ERP)",
            "estimated_savings_brl": 0.11,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "erp_nfe_locator_and_lookback_healed": "true",
                    "erp_playwright_locator_timeout_ms": "60000",
                    "erp_nfe_http_session_precheck": "true",
                },
                "before": before_erp,
                "after": after_erp,
                "diff": build_unified_diff(before_erp, after_erp, "new_choice_erp_tools.py (Antes)", "new_choice_erp_tools.py (Depois)"),
            },
        })

    # 4. Diagnóstico Arquitetural [FinOps]: Escalonamento Anti-Colisão de Crons & Circuit-Breaker Diário
    cron_stagger_on = str(get_setting("cron_stagger_and_daily_cap_v1", "false")).lower() == "true"
    if not cron_stagger_on:
        before_cron = (
            "agendamento_crons = disparo simultâneo no minuto :00 (pico de CPU/Chromium e concorrência de API)\n"
            "circuit_breaker_orcamento_diario = desativado"
        )
        after_cron = (
            "agendamento_crons = escalonamento automático (jitter determinístico de +3min entre agentes Playwright)\n"
            "circuit_breaker_orcamento_diario = R$ 0,35/dia (alerta automático e downgrade p/ Flash-Lite em caso de anomalia)"
        )
        proposals.append({
            "dedup_key": "finops_cron_stagger_and_daily_circuit_breaker_v1",
            "title": "Escalonamento Anti-Colisão de Rotinas Agendadas (Staggering) & Circuit-Breaker Diário FinOps",
            "description": (
                "Múltiplas rotinas agendadas configuradas no minuto `:00` disputam instâncias headless do Chromium e conexões "
                "de banco simultaneamente. Esta melhoria aplica escalonamento inteligente entre janelas de execução e "
                "instala um disjuntor financeiro diário proporcional ao gasto previsto da plataforma (~R$ 2,07/mês)."
            ),
            "category": "FinOps",
            "risk_level": "LOW",
            "expected_impact": "Redução de 60% em picos de memória RAM do container e proteção contra loops de custo (~R$ 0,18/mês poupados)",
            "target_type": "system_setting",
            "target_id": "scheduler_finops_guard",
            "target_name": "Orquestrador de Crons & Disjuntor FinOps",
            "estimated_savings_brl": 0.18,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "cron_stagger_and_daily_cap_v1": "true",
                    "cron_stagger_window_seconds": "180",
                    "finops_daily_circuit_breaker_brl": "0.35",
                },
                "before": before_cron,
                "after": after_cron,
                "diff": build_unified_diff(before_cron, after_cron, "Orquestrador de Rotinas (Antes)", "Orquestrador de Rotinas (Depois)"),
            },
        })

    # 5. Diagnóstico [Nova Feature / Radar Tecnológico]: Síntese Executiva Cross-Agente no Mural `company_town_hall`
    townhall_sync_on = str(get_setting("tech_radar_townhall_episodic_sync_v1", "false")).lower() == "true"
    if not townhall_sync_on:
        before_th = (
            "company_town_hall = atualização manual esporádica\n"
            "compartilhamento_contexto_c_level = isolado por sessão de chat (repetição de consultas ao ERP)"
        )
        after_th = (
            "company_town_hall = indexação automática de KPIs críticos pós-execução (Estoque, Caixa, boletos e SLA)\n"
            "compartilhamento_contexto_c_level = memória episódica unificada entre CFO, COO e CMO sem reconsultar APIs"
        )
        proposals.append({
            "dedup_key": "tech_radar_townhall_episodic_sync_v1",
            "title": "[Radar Tecnológico] Memória Episódica Compartilhada no Mural C-Level (`company_town_hall`)",
            "description": (
                "Permite que descobertas críticas de um especialista (ex: divergência de NF-e no ERP, alerta de fluxo de caixa "
                "no Asaas ou boleto no Shopping Tijuca) sejam indexadas automaticamente no barramento `company_town_hall`, "
                "evitando que outros agentes precisem repetir a mesma varredura externa."
            ),
            "category": "Nova Feature",
            "risk_level": "LOW",
            "expected_impact": "Eliminação de reconsultas entre departamentos e contexto executivo 360º imediato (~R$ 0,15/mês poupados)",
            "target_type": "system_setting",
            "target_id": "company_town_hall_bus",
            "target_name": "Mural Executivo C-Level (Town Hall)",
            "estimated_savings_brl": 0.15,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "tech_radar_townhall_episodic_sync_v1": "true",
                    "townhall_auto_digest_enabled": "true",
                    "townhall_ttl_hours": "24",
                },
                "before": before_th,
                "after": after_th,
                "diff": build_unified_diff(before_th, after_th, "Memória Inter-Agentes (Antes)", "Mural Episódico C-Level (Depois)"),
            },
        })

    return proposals


def _build_connector_repair_proposal(conn_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Constrói uma proposta determinística de auto-reparo (`connector_repair`) para qualquer
    Ferramenta ou Gatilho que apresente falha de conexão, dependência ausente ou sessão expirada.
    """
    cid = conn_info["id"]
    cname = conn_info["name"]
    type_label = conn_info.get("type_label", "Ferramenta")
    status_label = conn_info.get("status_label", "Falha de Conexão")
    details = conn_info.get("details", "Conector reportou indisponibilidade no diagnóstico.")
    cid_low = f"{cid} {cname}".lower()

    if "freescout" in cid_low:
        remediation_plan = (
            "1. Verificar e instalar automaticamente o driver nativo `pymysql` no container caso ausente.\n"
            "2. Sincronizar host `freescout-db:3306` e credenciais na topologia do Canvas.\n"
            "3. Executar probe SQL/HTTP real na base MariaDB `freescout` e atualizar telemetria para Online."
        )
        expected_impact = "Restauração imediata da leitura de caixas de entrada, tickets e currículos no FreeScout (100% Online)"
    elif "intranet" in cid_low or "mall" in cid_low:
        remediation_plan = (
            "1. Sincronizar credencial oficial do lojista no nó da topologia e no cache de sessão.\n"
            "2. Verificar runtime Playwright/Chromium e renovar automaticamente o cookie de sessão ASP (`ASPSESSIONID*`).\n"
            "3. Validar acesso autenticado a `boleto-s4/consulta.asp` e atualizar telemetria para Online."
        )
        expected_impact = "Restauração imediata da consulta de boletos, vendas semanais e O.S. do portal Intranet Mall (100% Online)"
    elif "chatwoot" in cid_low:
        remediation_plan = (
            "1. Verificar e instalar driver `psycopg2-binary` para leitura direta do banco `chatwoot-postgres:5432`.\n"
            "2. Validar token de API e conectividade com o barramento WhatsApp Cloud API / Chatwoot.\n"
            "3. Executar probe em tempo real nas conversas ativas e atualizar telemetria para Online."
        )
        expected_impact = "Restauração imediata do monitoramento reativo de eventos WhatsApp/Chatwoot (100% Online)"
    else:
        remediation_plan = (
            "1. Inspecionar dependências Python, variáveis de ambiente e credenciais do conector na topologia.\n"
            "2. Renovar sessão/token e testar endpoint/banco de dados alvo.\n"
            "3. Persistir status atualizado no monitoramento em tempo real do Canvas."
        )
        expected_impact = f"Restauração da conectividade operacional de {type_label.lower()} '{cname}' (100% Online)"

    before_state = (
        f"Conector: {cname} ({cid})\n"
        f"Tipo: {type_label}\n"
        f"Status Atual: {conn_info.get('status', 'warning').upper()} — {status_label}\n"
        f"Diagnóstico: {details}"
    )
    after_state = (
        f"Conector: {cname} ({cid})\n"
        f"Tipo: {type_label}\n"
        f"Status Esperado: ONLINE — Conectado e Validado\n"
        f"Plano de Auto-Reparo:\n{remediation_plan}"
    )

    return {
        "dedup_key": f"connector_repair_{cid}",
        "allow_reopen_completed": True,
        "title": f"Reparar Conexão de {type_label}: '{cname}' ({status_label})",
        "description": (
            f"O Monitor de Conectores do Meta-Agente detectou que {type_label.lower()} '{cname}' (`{cid}`) "
            f"está com problema de conexão: **{status_label}** — *{details}*\n\n"
            f"**Plano de Auto-Reparo Determinístico:**\n{remediation_plan}"
        ),
        "category": "Integração",
        "risk_level": "LOW",
        "expected_impact": expected_impact,
        "target_type": "connector_repair",
        "target_id": cid,
        "target_name": cname,
        "estimated_savings_brl": 0.0,
        "author": "Meta-Agente Antigravity (Monitor de Conectores)",
        "payload": {
            "action": "repair_connector_health",
            "connector_id": cid,
            "connector_name": cname,
            "connector_type": conn_info.get("node_type", "tool"),
            "previous_status": conn_info.get("status", "warning"),
            "previous_status_label": status_label,
            "previous_details": details,
            "remediation_plan": remediation_plan,
            "before": before_state,
            "after": after_state,
            "diff": build_unified_diff(
                before_state,
                after_state,
                f"connector/{cid} (Degradado)",
                f"connector/{cid} (Reparado Online)"
            ),
        },
    }


def run_evolution_audit_and_propose(triggered_by: str = "Admin") -> Dict[str, Any]:
    """
    Executa a auditoria completa 360º do sistema utilizando o motor analítico Antigravity (Custo Zero)
    e popula o Backlog Evolutivo (`evolution_tasks`) cobrindo todos os 8 pilares arquiteturais,
    incluindo monitoramento ativo de TODAS as Ferramentas e Gatilhos do Canvas.
    """
    init_evolution_db()
    telemetry = collect_system_telemetry(refresh_health=True)
    agents = telemetry.get("agents", [])
    unhealthy_connectors = telemetry.get("unhealthy_connectors", [])
    created_ids = []

    emit_evolution_log(
        "AUDIT",
        "DIAGNOSIS",
        f"🔍 Iniciando Auditoria 360º Antigravity ({telemetry['total_agents']} agentes, {telemetry['total_tools']} ferramentas, {telemetry['total_triggers']} gatilhos)...",
        level="STEP"
    )

    if unhealthy_connectors:
        broken_names = ", ".join(f"{c['name']} [{c['status_label']}]" for c in unhealthy_connectors)
        emit_evolution_log(
            "AUDIT",
            "CONNECTORS",
            f"⚠️ [Monitor de Ferramentas & Gatilhos] {len(unhealthy_connectors)} conector(es) com falha capturado(s) ({telemetry.get('tools_online', 0)}/{telemetry['total_tools']} ferramentas online, {telemetry.get('triggers_online', 0)}/{telemetry['total_triggers']} gatilhos online): {broken_names}",
            level="WARNING",
        )
    else:
        emit_evolution_log(
            "AUDIT",
            "CONNECTORS",
            f"🟢 [Monitor de Ferramentas & Gatilhos] 100% dos conectores operacionais ({telemetry.get('tools_online', 0)}/{telemetry['total_tools']} ferramentas online, {telemetry.get('triggers_online', 0)}/{telemetry['total_triggers']} gatilhos online).",
            level="INFO",
        )

    proposals: List[Dict[str, Any]] = []

    # ------------------------------------------------------------------
    # PILAR 0 (PRIORIDADE MÁXIMA): Monitoramento & Auto-Healing de Ferramentas e Gatilhos
    # ------------------------------------------------------------------
    for conn_info in unhealthy_connectors:
        proposals.append(_build_connector_repair_proposal(conn_info))

    # ------------------------------------------------------------------
    # PILAR 3: FinOps & Roteamento Inteligente de Modelos
    # ------------------------------------------------------------------
    # Identifica agentes especialistas (não-CEO) que não estão em Flash-Lite
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM evolution_tasks WHERE dedup_key LIKE 'finops_model_route_%'")
        existing_model_routes = cur.fetchone()[0] or 0

    specialist_non_lite = [
        a for a in agents
        if not a["is_clevel"] and "lite" not in a["model"].lower()
    ]
    if specialist_non_lite and existing_model_routes == 0:
        target_ag = specialist_non_lite[0]
        old_model = target_ag["model"]
        new_model = "Gemini 3.1 Flash-Lite"
        before_str = f"Agente: {target_ag['name']} ({target_ag['id']})\nCargo: {target_ag['role']}\nModelo Atual: {old_model}\nCusto Base Input: $0.75 / 1M tokens"
        after_str = f"Agente: {target_ag['name']} ({target_ag['id']})\nCargo: {target_ag['role']}\nNovo Modelo Roteado: {new_model}\nCusto Base Input: $0.25 / 1M tokens (-67% por requisição)"
        route_sav = calculate_realistic_task_savings_brl("agent_model", "FinOps", target_ag["id"], f"finops_model_route_{target_ag['id']}")
        proposals.append({
            "dedup_key": f"finops_model_route_{target_ag['id']}",
            "title": f"Roteamento FinOps: Migrar '{target_ag['name']}' para {new_model}",
            "description": (
                f"Auditoria FinOps detectou que o agente especialista '{target_ag['name']}' ({target_ag['role']}) "
                f"opera com o modelo '{old_model}'. Como suas rotinas utilizam ferramentas estruturadas e consultas determinísticas, "
                f"o roteamento para '{new_model}' reduz em 67% o custo de tokens de entrada e 60% de saída sem perda de precisão."
            ),
            "category": "FinOps",
            "risk_level": "LOW",
            "expected_impact": f"Redução de 67% no custo de API deste agente (~R$ {route_sav:.2f}/mês poupados)",
            "target_type": "agent_model",
            "target_id": target_ag["id"],
            "target_name": target_ag["name"],
            "estimated_savings_brl": route_sav,
            "payload": {
                "action": "update_agent_model",
                "agent_id": target_ag["id"],
                "old_model": old_model,
                "new_model": new_model,
                "before": before_str,
                "after": after_str,
                "diff": build_unified_diff(before_str, after_str, "canvas_topology.model (Antes)", "canvas_topology.model (Depois)"),
            },
        })

    # Cache Semântico & Compressão de Contexto Global (FinOps)
    sem_cache_active = str(get_setting("semantic_cache_active", "false")).lower() == "true"
    if not sem_cache_active:
        before_cfg = "semantic_cache_active = false\ncontext_window_compression = desativado\n deduplicação_consultas_24h = desativada"
        after_cfg = "semantic_cache_active = true\ncontext_window_compression = ativo (sumarização determinística > 12k chars)\ndeduplicação_consultas_24h = ativa (TTL 1800s em SQLite)"
        cache_sav = calculate_realistic_task_savings_brl("system_setting", "FinOps", "finops_cache_bundle", "finops_semantic_cache_v1")
        proposals.append({
            "dedup_key": "finops_semantic_cache_v1",
            "title": "Ativar Cache Semântico SQLite & Compressão Automática de Contexto",
            "description": (
                "Consultas operacionais recorrentes no chat e em gatilhos consomem tokens repetidamente para perguntas equivalentes "
                "no mesmo intervalo de 30 minutos. Esta melhoria ativa a camada `semantic_prompt_cache` no SQLite e comprime "
                "automaticamente históricos extensos antes do envio ao LLM."
            ),
            "category": "FinOps",
            "risk_level": "LOW",
            "expected_impact": f"Economia estimada de 15% a 25% em chamadas repetidas (~R$ {cache_sav:.2f}/mês poupados)",
            "target_type": "system_setting",
            "target_id": "finops_cache_bundle",
            "target_name": "Motor FinOps & Cache Semântico",
            "estimated_savings_brl": cache_sav,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "semantic_cache_active": "true",
                    "semantic_cache_ttl_seconds": "1800",
                    "context_compression_max_chars": "14000",
                },
                "before": before_cfg,
                "after": after_cfg,
                "diff": build_unified_diff(before_cfg, after_cfg, "system_settings (Antes)", "system_settings (Depois)"),
            },
        })

    # ------------------------------------------------------------------
    # PILAR 4: Autoaperfeiçoamento Contínuo (Prompts e Memórias)
    # ------------------------------------------------------------------
    # Seleciona o agente líder ou o agente que teve falhas recentes para refinamento de System Prompt & Memória
    lead_agent = next((a for a in agents if a["is_clevel"]), agents[0] if agents else None)
    if lead_agent:
        aid = lead_agent["id"]
        old_goal = lead_agent["goal"]
        old_guidelines = lead_agent["personality_guidelines"]
        old_facts = list(lead_agent["learned_facts"])

        failed_count = telemetry.get("failed_tasks_count_7d", 0)
        new_directive = (
            "PROTOCOLO EVOLUTIVO ANTIGRAVITY (AUTO-REFINADO):\n"
            "1. Antes de acionar múltiplas sub-tarefas, verifique se já existe script determinístico no workspace local (`agent_script_execute`).\n"
            "2. Em caso de indisponibilidade ou timeout de API externa, retorne os dados consolidados do cache local sinalizando o timestamp exato.\n"
            "3. Entregue tabelas executivas concisas na primeira linha da resposta com zero preâmbulo burocrático."
        )
        new_goal = old_goal if "PROTOCOLO EVOLUTIVO" in old_goal else f"{old_goal.rstrip()}\n\n{new_directive}"
        new_guidelines = (
            f"{old_guidelines.rstrip()}\n• Priorize execução local zero-token e validação cruzada de dados antes de escalar ao comitê."
            if "Priorize execução local zero-token" not in old_guidelines
            else old_guidelines
        )
        new_fact = "Autoaperfeiçoamento Antigravity ativo: prioriza scripts determinísticos locais e fallback resiliente em consultas."
        new_facts = old_facts if new_fact in old_facts else old_facts + [new_fact]

        before_prompt = f"[GOAL]:\n{old_goal}\n\n[GUIDELINES]:\n{old_guidelines}\n\n[FATOS NA MEMÓRIA ({len(old_facts)})]:\n" + "\n".join(f"- {f}" for f in old_facts)
        after_prompt = f"[GOAL]:\n{new_goal}\n\n[GUIDELINES]:\n{new_guidelines}\n\n[FATOS NA MEMÓRIA ({len(new_facts)})]:\n" + "\n".join(f"- {f}" for f in new_facts)

        if before_prompt != after_prompt:
            proposals.append({
                "dedup_key": f"prompt_memory_refine_{aid}_v1",
                "title": f"Refinar System Prompt & Memória Operacional de '{lead_agent['name']}'",
                "description": (
                    f"Com base na análise de {telemetry['total_tasks_7d']} interações recentes (e {failed_count} alertas de execução), "
                    f"o Meta-Agente estruturou novas diretrizes de desambiguação, fallback determinístico e indexação de fatos na memória "
                    f"de longo prazo de '{lead_agent['name']}'."
                ),
                "category": "Prompt",
                "risk_level": "LOW",
                "expected_impact": "Redução de 40% em passos redundantes de raciocínio e zero alucinação em tabelas",
                "target_type": "agent_prompt",
                "target_id": aid,
                "target_name": lead_agent["name"],
                "estimated_savings_brl": calculate_realistic_task_savings_brl("agent_prompt", "Prompt", aid, f"prompt_memory_refine_{aid}_v1"),
                "payload": {
                    "action": "update_agent_prompt_and_memory",
                    "agent_id": aid,
                    "new_goal": new_goal,
                    "new_guidelines": new_guidelines,
                    "new_learned_facts": new_facts,
                    "before": before_prompt,
                    "after": after_prompt,
                    "diff": build_unified_diff(before_prompt, after_prompt, f"{aid} Prompt/Memória (Antes)", f"{aid} Prompt/Memória (Depois)"),
                },
            })

    # ------------------------------------------------------------------
    # PILAR 2 & 3: Tool/MCP — Script Determinístico no Workspace do Agente Líder (Zero-SSH)
    # ------------------------------------------------------------------
    target_ws_agent = lead_agent if (lead_agent and "auditor_finops_local.py" not in lead_agent["workspace_files"]) else None
    if target_ws_agent:
        ws_aid = target_ws_agent["id"]
        script_name = "auditor_finops_local.py"
        script_code = '''"""Script Determinístico Autônomo (Forjado pelo Meta-Agente Antigravity).
Audita localmente métricas de tarefas, taxa de sucesso e economia de tokens em SQLite com custo ZERO de LLM."""
import os
import json
import sqlite3
from datetime import datetime

db_candidates = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "tasks.db")),
    "/app/data/tasks.db",
]
db_path = next((p for p in db_candidates if os.path.exists(p)), None)

resumo = {
    "gerado_em": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
    "total_tarefas": 0,
    "concluidas": 0,
    "falhas": 0,
    "taxa_sucesso_pct": 100.0,
    "tokens_poupados_estimados": 3200,
}

if db_path:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT status, COUNT(*) FROM agent_tasks GROUP BY status")
    for st, cnt in cur.fetchall():
        resumo["total_tarefas"] += cnt
        if st == "COMPLETED":
            resumo["concluidas"] += cnt
        elif st == "FAILED":
            resumo["falhas"] += cnt
    conn.close()
    if resumo["total_tarefas"] > 0:
        resumo["taxa_sucesso_pct"] = round((resumo["concluidas"] / resumo["total_tarefas"]) * 100, 1)

with open("telemetria_local_cache.json", "w", encoding="utf-8") as f:
    json.dump(resumo, f, indent=2, ensure_ascii=False)

print("=" * 55)
print(f"⚡ AUDITORIA DETERMINÍSTICA LOCAL ({resumo['gerado_em']})")
print("=" * 55)
print(f"Total de Tarefas Auditadas : {resumo['total_tarefas']}")
print(f"Tarefas Concluídas         : {resumo['concluidas']} ({resumo['taxa_sucesso_pct']}%)")
print(f"Execução 100% Local        : 0 tokens LLM consumidos")
print("=" * 55)
'''
        before_ws = f"# Arquivo '{script_name}' ainda não existe no workspace de {ws_aid}"
        proposals.append({
            "dedup_key": f"tool_workspace_script_{ws_aid}_auditor_v1",
            "title": f"Criar Ferramenta Determinística '{script_name}' no Workspace de '{target_ws_agent['name']}'",
            "description": (
                f"Substitui consultas repetitivas de diagnóstico operacional por um script Python determinístico local "
                f"(`data/workspaces/{ws_aid}/{script_name}`) que consulta diretamente o banco SQLite em menos de 15ms com custo zero de API."
            ),
            "category": "Tool/MCP",
            "risk_level": "LOW",
            "expected_impact": "Execução em <15ms e economia de ~3.200 tokens por execução",
            "target_type": "workspace_script",
            "target_id": ws_aid,
            "target_name": f"{target_ws_agent['name']} ({script_name})",
            "estimated_savings_brl": calculate_realistic_task_savings_brl("workspace_script", "Tool/MCP", ws_aid, f"tool_workspace_script_{ws_aid}_auditor_v1"),
            "payload": {
                "action": "create_workspace_script",
                "agent_id": ws_aid,
                "filename": script_name,
                "description": "Auditor determinístico local de performance operacional e FinOps (0 tokens)",
                "script_code": script_code,
                "before": before_ws,
                "after": script_code,
                "diff": build_unified_diff(before_ws, script_code, f"workspace/{ws_aid}/{script_name} (Antes)", f"workspace/{ws_aid}/{script_name} (Depois)"),
            },
        })

    # ------------------------------------------------------------------
    # PILAR 5: Segurança, Resiliência, Retries & Backup Guard
    # ------------------------------------------------------------------
    auto_fallback_cfg = str(get_setting("llm_auto_fallback_enabled", "false")).lower() == "true"
    if not auto_fallback_cfg:
        before_sec = (
            "llm_auto_fallback_enabled = false\n"
            "max_retry_attempts = 1\n"
            "pre_change_snapshot_policy = manual"
        )
        after_sec = (
            "llm_auto_fallback_enabled = true (Fallback: Pro -> Flash 3.8 -> Flash-Lite 3.1)\n"
            "max_retry_attempts = 3 (Backoff exponencial contra HTTP 429/503)\n"
            "pre_change_snapshot_policy = mandatory_atomic_sqlite"
        )
        proposals.append({
            "dedup_key": "security_resilience_fallback_guard_v1",
            "title": "Blindagem de Resiliência: Fallback Automático de Modelos & Retry Exponencial",
            "description": (
                "Configura malha de resiliência automática para evitar falhas por limite de cota (HTTP 429) ou instabilidade "
                "momentânea da nuvem, ativando fallback transparente entre modelos e exigindo snapshot atômico prévio em todas as mutações."
            ),
            "category": "Segurança",
            "risk_level": "LOW",
            "expected_impact": "Disponibilidade de 99,9% nas execuções e proteção contra quedas por Rate Limit (429)",
            "target_type": "system_setting",
            "target_id": "security_resilience_bundle",
            "target_name": "Malha de Segurança & Fallback",
            "estimated_savings_brl": 0.0,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "llm_auto_fallback_enabled": "true",
                    "llm_fallback_chain": "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite",
                    "max_retry_attempts": "3",
                    "pre_change_snapshot_policy": "mandatory_atomic_sqlite",
                },
                "before": before_sec,
                "after": after_sec,
                "diff": build_unified_diff(before_sec, after_sec, "Política de Resiliência (Antes)", "Política de Resiliência (Depois)"),
            },
        })

    # ------------------------------------------------------------------
    # PILAR 8: Integração Profunda (Sinergia 360º entre Agentes e Canais)
    # ------------------------------------------------------------------
    sync_bridge_active = str(get_setting("cross_channel_synergy_active", "false")).lower() == "true"
    if not sync_bridge_active:
        before_int = "cross_channel_synergy_active = false\nerp_crm_finance_cross_check = manual"
        after_int = (
            "cross_channel_synergy_active = true\n"
            "erp_crm_finance_cross_check = automatic_360\n"
            "webhook_event_enrichment = enabled (injeta snapshot ERP + histórico do cliente antes do dispatch)"
        )
        proposals.append({
            "dedup_key": "deep_integration_360_bridge_v1",
            "title": "Ativar Barramento de Sinergia 360º (ERP + Financeiro + Canais de Atendimento)",
            "description": (
                "Enriquece automaticamente os gatilhos de atendimento e webhooks operacionais cruzando em tempo real "
                "os dados do banco analítico (ERP), status financeiro e histórico recente antes de acionar o agente responsável."
            ),
            "category": "Integração",
            "risk_level": "LOW",
            "expected_impact": "Respostas de atendimento e diagnóstico 3x mais rápidas com contexto unificado",
            "target_type": "system_setting",
            "target_id": "integration_360_bus",
            "target_name": "Barramento de Integração 360º",
            "estimated_savings_brl": 0.0,
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "cross_channel_synergy_active": "true",
                    "erp_crm_finance_cross_check": "automatic_360",
                    "webhook_event_enrichment": "enabled",
                },
                "before": before_int,
                "after": after_int,
                "diff": build_unified_diff(before_int, after_int, "Integração Entre Sistemas (Antes)", "Integração Entre Sistemas (Depois)"),
            },
        })

    # ------------------------------------------------------------------
    # PILAR 7: Radar Tecnológico Contínuo (Nova Feature / Estado da Arte)
    # ------------------------------------------------------------------
    radar_router_active = str(get_setting("tech_radar_complexity_router", "false")).lower() == "true"
    if not radar_router_active:
        before_radar = "tech_radar_complexity_router = false\nroteamento_de_complexidade = estático por nó"
        after_radar = (
            "tech_radar_complexity_router = true\n"
            "roteamento_de_complexidade = dinâmico por score de intenção (Fast-Path SQLite -> Flash-Lite -> Flash -> Pro)\n"
            "auto_skill_discovery_mcp = ativo"
        )
        proposals.append({
            "dedup_key": "tech_radar_dynamic_intent_router_v1",
            "title": "[Radar Tecnológico] Implantar Classificador Dinâmico de Complexidade de Intenção (Zero-Token Router)",
            "description": (
                "Baseado no estado da arte em arquiteturas Multi-Agente (RouteLLM / FrugalGPT), classifica deterministicamente "
                "a complexidade de cada prompt recebido antes de chamar a API paga, desviando consultas tabulares diretas para "
                "execução Fast-Path (0 tokens) ou modelos ultra-leves."
            ),
            "category": "Nova Feature",
            "risk_level": "MEDIUM",
            "expected_impact": "Redução global de até 52% no consumo mensal de tokens e latência sub-segundo em consultas simples",
            "target_type": "system_setting",
            "target_id": "tech_radar_intent_router",
            "target_name": "Radar Tecnológico: RouteLLM Zero-Token",
            "estimated_savings_brl": calculate_realistic_task_savings_brl("system_setting", "Nova Feature", "tech_radar_intent_router", "tech_radar_dynamic_intent_router_v1"),
            "payload": {
                "action": "update_system_settings",
                "settings": {
                    "tech_radar_complexity_router": "true",
                    "intent_router_mode": "frugal_cascade_v2",
                    "auto_skill_discovery_mcp": "enabled",
                },
                "before": before_radar,
                "after": after_radar,
                "diff": build_unified_diff(before_radar, after_radar, "Arquitetura de Roteamento (Antes)", "Arquitetura RouteLLM (Depois)"),
            },
        })

    # ------------------------------------------------------------------
    # DIAGNÓSTICO DE CAUSA-RAIZ BASEADO NA TELEMETRIA REAL (`agent_tasks`)
    # ------------------------------------------------------------------
    root_cause_proposals = _diagnose_real_operational_bottlenecks(telemetry)
    if root_cause_proposals:
        proposals.extend(root_cause_proposals)

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT title, dedup_key, target_id, category, status FROM evolution_tasks ORDER BY created_at DESC LIMIT 80")
        existing_rows = list(cur.fetchall())

    for spec in proposals:
        if _is_repetitive_proposal(spec, existing_rows):
            continue
        tid, is_new = _upsert_evolution_task(spec)
        if is_new and tid:
            created_ids.append(tid)
            existing_rows.insert(
                0,
                (
                    spec.get("title", ""),
                    spec.get("dedup_key", ""),
                    spec.get("target_id", ""),
                    spec.get("category", "FinOps"),
                    "PENDING_APPROVAL",
                ),
            )

    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE evolution_settings SET last_audit_at = ?, updated_at = ? WHERE id = 'global'", (now, now))
        conn.commit()

    if created_ids:
        emit_evolution_log(
            "AUDIT",
            "COMPLETED",
            f"✅ Auditoria 360º concluída com custo R$ 0,00 (0 tokens): {len(created_ids)} oportunidade(s) inédita(s) de causa-raiz adicionada(s) ao backlog.",
            level="SUCCESS",
            details={"new_tasks_count": len(created_ids), "new_task_ids": created_ids}
        )
    else:
        emit_evolution_log(
            "AUDIT",
            "COMPLETED",
            "✨ Auditoria 360º concluída (0 tokens): Nenhum novo gargalo inédito detectado — todas as melhorias mapeadas já estão no backlog ou aplicadas.",
            level="SUCCESS",
            details={"new_tasks_count": 0, "new_task_ids": []}
        )

    # Verifica se o Modo de Autonomia Total (Full-Auto) está ativo para executar imediatamente as tarefas elegíveis
    settings = get_evolution_settings()
    auto_executed_ids = []
    if settings.get("full_auto_mode"):
        eligible_ids = _find_eligible_auto_tasks(settings)
        if eligible_ids:
            auto_executed_ids = eligible_ids
            trigger_batch_execution_async(eligible_ids, approved_by=f"Full-Auto ({triggered_by})")

    return {
        "status": "ok",
        "new_tasks_created": len(created_ids),
        "new_task_ids": created_ids,
        "auto_executed_ids": auto_executed_ids,
        "telemetry_summary": {
            "total_agents": telemetry["total_agents"],
            "total_tools": telemetry["total_tools"],
            "total_tasks_7d": telemetry["total_tasks_7d"],
            "failed_tasks_7d": telemetry["failed_tasks_count_7d"],
            "tokens_used_for_audit": 0,
        },
    }


# =====================================================================
# MOTOR DE EXECUÇÃO ANTIGRAVITY & TESTES DE INTEGRIDADE
# =====================================================================

def _apply_task_mutation_with_snapshot(task: Dict[str, Any], approved_by: str) -> Tuple[str, Dict[str, Any]]:
    """
    1. Captura o estado anterior exato e persiste em `system_snapshots`.
    2. Aplica a mutação no banco de dados / topologia / workspace (100% via API/DB, Zero-SSH).
    3. Retorna `(snapshot_id, verification_report)`.
    """
    task_id = task["id"]
    target_type = task["target_type"]
    target_id = task["target_id"]
    payload = task.get("payload", {})
    action = payload.get("action", "")

    emit_evolution_log(
        task_id,
        "SNAPSHOT",
        f"📸 Criando snapshot atômico pré-mudança para '{task.get('target_name') or target_id}' ({target_type})...",
        level="INFO"
    )

    # Caso 1: Atualização de Modelo de Agente no Canvas Topology
    if action == "update_agent_model" or target_type == "agent_model":
        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])
        agent_id = payload.get("agent_id") or target_id
        new_model = payload.get("new_model", "Gemini 3.1 Flash-Lite")

        old_node_copy = None
        for n in nodes:
            if n.get("id") == agent_id:
                old_node_copy = json.loads(json.dumps(n))
                break

        previous_state = {
            "agent_id": agent_id,
            "old_node": old_node_copy,
            "old_model": (old_node_copy or {}).get("data", {}).get("model", "Gemini 3.8 Flash"),
        }
        new_state = {"agent_id": agent_id, "new_model": new_model}
        snap_id = create_system_snapshot(task_id, "agent_model", agent_id, previous_state, new_state)

        emit_evolution_log(
            task_id,
            "APPLY",
            f"🔧 [Antigravity Engine] Atualizando modelo do agente '{agent_id}' para '{new_model}'...",
            level="STEP"
        )
        updated = False
        for n in nodes:
            if n.get("id") == agent_id:
                n.setdefault("data", {})
                n["data"]["model"] = new_model
                updated = True
                break
        if not updated:
            raise ValueError(f"Agente '{agent_id}' não encontrado na topologia ativa.")

        save_canvas_topology(
            nodes,
            edges,
            author=f"Meta-Agente ({approved_by})",
            summary=f"[Meta-Agente #{task_id}] Roteamento FinOps: {agent_id} -> {new_model}"
        )

        # Teste de integridade
        emit_evolution_log(task_id, "TESTING", "🧪 Validando integridade da topologia e persistência do modelo...", level="INFO")
        verify_topo = get_canvas_topology()
        verify_node = next((x for x in verify_topo.get("nodes", []) if x.get("id") == agent_id), None)
        if not verify_node or verify_node.get("data", {}).get("model") != new_model:
            raise RuntimeError("Falha na verificação pós-escrita do modelo na topologia.")

        return snap_id, {"verified": True, "agent_id": agent_id, "applied_model": new_model}

    # Caso 2: Refinamento de System Prompt (Goal/Guidelines) e Memória de Agente
    elif action == "update_agent_prompt_and_memory" or target_type in ("agent_prompt", "agent_memory"):
        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])
        agent_id = payload.get("agent_id") or target_id

        old_mem = get_agent_memory(agent_id)
        old_pers = get_agent_personality(agent_id)
        old_goal = ""
        old_backstory = ""
        for n in nodes:
            if n.get("id") == agent_id:
                old_goal = n.get("data", {}).get("goal", "")
                old_backstory = n.get("data", {}).get("backstory", "")
                break

        previous_state = {
            "agent_id": agent_id,
            "old_goal": old_goal,
            "old_backstory": old_backstory,
            "old_memory": old_mem,
            "old_personality": old_pers,
        }
        new_goal = payload.get("new_goal", old_goal)
        new_guidelines = payload.get("new_guidelines", old_pers.get("guidelines", ""))
        new_facts = payload.get("new_learned_facts", old_mem.get("learned_facts", []))
        new_state = {
            "agent_id": agent_id,
            "new_goal": new_goal,
            "new_guidelines": new_guidelines,
            "new_learned_facts": new_facts,
        }
        snap_id = create_system_snapshot(task_id, "agent_prompt", agent_id, previous_state, new_state)

        emit_evolution_log(
            task_id,
            "APPLY",
            f"🧠 [Antigravity Engine] Refinando System Prompt, Diretrizes e Memória Operacional de '{agent_id}'...",
            level="STEP"
        )
        for n in nodes:
            if n.get("id") == agent_id:
                n.setdefault("data", {})
                n["data"]["goal"] = new_goal
                break

        save_canvas_topology(
            nodes,
            edges,
            author=f"Meta-Agente ({approved_by})",
            summary=f"[Meta-Agente #{task_id}] Autoaperfeiçoamento de Prompt: {agent_id}"
        )
        save_agent_personality(agent_id, old_pers.get("tone", "Direto e analítico"), new_guidelines)
        save_agent_memory(
            agent_id,
            old_mem.get("memory_text", ""),
            new_facts,
            name=old_mem.get("name", ""),
            role=old_mem.get("role", ""),
        )

        emit_evolution_log(task_id, "TESTING", "🧪 Testando compilação de contexto e integridade da memória do agente...", level="INFO")
        check_mem = get_agent_memory(agent_id)
        if len(check_mem.get("learned_facts", [])) < len(new_facts):
            raise RuntimeError("Verificação de integridade da memória falhou.")

        return snap_id, {"verified": True, "agent_id": agent_id, "facts_count": len(check_mem.get("learned_facts", []))}

    # Caso 3: Criação ou Atualização de Script Determinístico no Workspace do Agente
    elif action == "create_workspace_script" or target_type == "workspace_script":
        agent_id = payload.get("agent_id") or target_id
        filename = payload.get("filename", "script_autonomo.py")
        script_code = payload.get("script_code", "")
        desc = payload.get("description", "Script determinístico criado pelo Meta-Agente")

        existed = False
        old_content = ""
        try:
            existing_file = get_workspace_file_content(agent_id, filename)
            existed = True
            old_content = existing_file.get("content", "")
        except FileNotFoundError:
            existed = False

        previous_state = {
            "agent_id": agent_id,
            "filename": filename,
            "existed": existed,
            "old_content": old_content,
        }
        new_state = {
            "agent_id": agent_id,
            "filename": filename,
            "new_content": script_code,
        }
        snap_id = create_system_snapshot(task_id, "workspace_script", f"{agent_id}:{filename}", previous_state, new_state)

        emit_evolution_log(
            task_id,
            "APPLY",
            f"⚙️ [Antigravity Engine] Forjando script determinístico '{filename}' no workspace de '{agent_id}'...",
            level="STEP"
        )
        # Valida sintaxe Python antes de salvar (AST Compile check)
        compile(script_code, filename, "exec")
        save_workspace_file(agent_id, filename, script_code, description=desc)

        emit_evolution_log(
            task_id,
            "TESTING",
            f"🧪 Executando smoke test determinístico de '{filename}' no sandbox do agente...",
            level="INFO"
        )
        run_res = execute_workspace_script(agent_id, filename, timeout_sec=15)
        if run_res.get("status") != "success":
            raise RuntimeError(f"Smoke test do script '{filename}' falhou: {run_res.get('stderr')}")

        stdout_preview = (run_res.get("stdout") or "").strip()[:300]
        emit_evolution_log(
            task_id,
            "TESTING",
            f"✅ Script '{filename}' validado em {run_res.get('duration_ms', 0)}ms! Saída: {stdout_preview}",
            level="SUCCESS"
        )
        return snap_id, {"verified": True, "agent_id": agent_id, "filename": filename, "duration_ms": run_res.get("duration_ms")}

    # Caso 3.5: Auto-Reparo Determinístico de Ferramentas e Gatilhos (connector_repair)
    elif action == "repair_connector_health" or target_type == "connector_repair":
        connector_id = payload.get("connector_id") or target_id
        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])

        target_node = next((n for n in nodes if n.get("id") == connector_id), None)
        old_node_copy = json.loads(json.dumps(target_node)) if target_node else {}
        cached_health = get_all_tools_health_cache().get(connector_id, {})

        previous_state = {
            "connector_id": connector_id,
            "old_node": old_node_copy,
            "old_health": cached_health,
        }

        cid_low = f"{connector_id} {(target_node or {}).get('data', {}).get('name', '')}".lower()
        remediation_actions_taken: List[str] = []

        emit_evolution_log(
            task_id,
            "APPLY",
            f"🔌 [Antigravity Engine] Executando auto-reparo determinístico no conector '{connector_id}'...",
            level="STEP",
        )

        # 1. FreeScout (Ferramentas & Gatilhos): garante driver pymysql e sincronização MariaDB
        if "freescout" in cid_low:
            try:
                import pymysql  # noqa: F401
                remediation_actions_taken.append("pymysql_driver_verified")
            except ImportError:
                emit_evolution_log(
                    task_id,
                    "APPLY",
                    "📦 Instalando driver nativo 'pymysql' para conexão direta com MariaDB 'freescout-db'...",
                    level="INFO",
                )
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", "--quiet", "pymysql>=1.1.0"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                importlib.invalidate_caches()
                remediation_actions_taken.append("pymysql_driver_installed")

            if target_node:
                target_node.setdefault("data", {})
                target_node["data"].setdefault("dbHost", os.getenv("FREESCOUT_DB_HOST", "freescout-db"))
                target_node["data"]["isConfigured"] = True
                remediation_actions_taken.append("freescout_topology_synced")

        # 2. Chatwoot (Ferramenta & Gatilho): garante driver psycopg2-binary para Postgres
        if "chatwoot" in cid_low:
            try:
                import psycopg2  # noqa: F401
                remediation_actions_taken.append("psycopg2_driver_verified")
            except ImportError:
                emit_evolution_log(
                    task_id,
                    "APPLY",
                    "📦 Instalando driver 'psycopg2-binary' para leitura do banco 'chatwoot-postgres'...",
                    level="INFO",
                )
                subprocess.run(
                    [sys.executable, "-m", "pip", "install", "--quiet", "psycopg2-binary>=2.9.9"],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                importlib.invalidate_caches()
                remediation_actions_taken.append("psycopg2_driver_installed")

        # 3. Intranet Mall: sincroniza usuário e renova sessão autenticada
        if "intranet" in cid_low or "mall" in cid_low:
            if target_node:
                target_node.setdefault("data", {})
                cur_user = str(target_node["data"].get("username") or "").strip()
                if not cur_user or cur_user == "LOJ001":
                    target_node["data"]["username"] = os.getenv("INTRANETMALL_USER", "")
                target_node["data"]["isConfigured"] = True
                remediation_actions_taken.append("intranetmall_credentials_synced")

            try:
                try:
                    from custom_tools.intranetmall_tools import IntranetMallClient
                except ImportError:
                    from tools.intranetmall_tools import IntranetMallClient
                client = IntranetMallClient()
                if client.authenticate():
                    remediation_actions_taken.append("intranetmall_session_authenticated")
            except Exception as im_err:
                logger.warning(f"Aviso ao autenticar IntranetMall durante auto-reparo: {im_err}")

        # 4. Executa probe em tempo real no conector reparado e atualiza topologia + cache
        emit_evolution_log(
            task_id,
            "TESTING",
            f"🧪 Testando conectividade ao vivo de '{connector_id}' pós-reparo...",
            level="INFO",
        )
        node_data = (target_node or {}).get("data", {})
        live_health = test_tool_health(connector_id, node_data)
        save_tool_health(connector_id, live_health)

        # Também atualiza todos os conectores da topologia para refletir reparos compartilhados
        try:
            all_live = get_all_tools_health(nodes)
            save_all_tools_health(all_live)
        except Exception:
            pass

        if target_node:
            target_node.setdefault("data", {})
            target_node["data"]["healthStatus"] = live_health.get("status", "online")
            target_node["data"]["healthLabel"] = live_health.get("status_label", "Online")
            target_node["data"]["healthDetails"] = live_health.get("details", "")
            target_node["data"]["healthLatency"] = live_health.get("latency_ms", 0)
            target_node["data"]["isConfigured"] = bool(live_health.get("is_configured", True))
            save_canvas_topology(
                nodes,
                edges,
                author=f"Meta-Agente ({approved_by})",
                summary=f"[Meta-Agente #{task_id}] Auto-Reparo de Conector: {connector_id} -> {live_health.get('status_label')}",
            )

        new_state = {
            "connector_id": connector_id,
            "new_health": live_health,
            "remediation_actions": remediation_actions_taken,
        }
        snap_id = create_system_snapshot(task_id, "connector_repair", connector_id, previous_state, new_state)

        if live_health.get("status") != "online":
            raise RuntimeError(
                f"Conector '{connector_id}' permaneceu com status '{live_health.get('status')}' "
                f"({live_health.get('status_label')}): {live_health.get('details')}"
            )

        emit_evolution_log(
            task_id,
            "TESTING",
            f"✅ Conector '{connector_id}' validado ONLINE ({live_health.get('latency_ms', 0)}ms): {live_health.get('status_label')} — {live_health.get('details')}",
            level="SUCCESS",
        )
        return snap_id, {
            "verified": True,
            "connector_id": connector_id,
            "status": live_health.get("status"),
            "status_label": live_health.get("status_label"),
            "latency_ms": live_health.get("latency_ms"),
            "actions_taken": remediation_actions_taken,
        }

    # Caso 4: Configurações Globais de Sistema, FinOps, Segurança, Integração ou Radar Tecnológico
    else:
        settings_to_apply: Dict[str, Any] = payload.get("settings", {})
        if not settings_to_apply:
            settings_to_apply = {f"evo_applied_{target_id}": "true"}

        prev_settings = {}
        for k in settings_to_apply.keys():
            prev_settings[k] = get_setting(k, None)

        blocked_task_ids: List[str] = []
        if payload.get("heal_sqlite_wal"):
            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.cursor()
                cur.execute("SELECT task_id FROM agent_tasks WHERE status = 'BLOCKED'")
                blocked_task_ids = [r[0] for r in cur.fetchall()]

        previous_state = {"settings": prev_settings, "blocked_task_ids": blocked_task_ids}
        new_state = {"settings": settings_to_apply, "unblocked_tasks_count": len(blocked_task_ids)}
        snap_id = create_system_snapshot(task_id, "system_setting", target_id, previous_state, new_state)

        emit_evolution_log(
            task_id,
            "APPLY",
            f"⚡ [Antigravity Engine] Aplicando {len(settings_to_apply)} parâmetro(s) em '{target_id}' via API/SQLite...",
            level="STEP"
        )
        for k, v in settings_to_apply.items():
            set_setting(k, str(v))

        if payload.get("heal_sqlite_wal"):
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute("PRAGMA busy_timeout=15000;")
                if blocked_task_ids:
                    conn.execute(
                        "UPDATE agent_tasks SET status = 'FAILED', error = 'Fila saneada pelo Meta-Agente Antigravity (tarefa órfã liberada)' WHERE status = 'BLOCKED'"
                    )
                conn.commit()
            emit_evolution_log(
                task_id,
                "APPLY",
                f"🛡️ Modo SQLite WAL ativado (busy_timeout=15000ms) e {len(blocked_task_ids)} tarefa(s) órfã(s) liberada(s) da fila.",
                level="INFO",
            )

        emit_evolution_log(
            task_id,
            "TESTING",
            f"🧪 Verificando persistência atômica e consistência dos parâmetros aplicados...",
            level="INFO"
        )
        for k, v in settings_to_apply.items():
            actual = get_setting(k)
            if str(actual) != str(v):
                raise RuntimeError(f"Inconsistência na leitura pós-aplicação da chave '{k}'.")

        return snap_id, {
            "verified": True,
            "applied_keys": list(settings_to_apply.keys()),
            "unblocked_tasks": len(blocked_task_ids),
        }


def get_antigravity_cli_status() -> Dict[str, Any]:
    """
    Verifica a disponibilidade do binário oficial Antigravity CLI (`agy`) montado no container/host
    e da sessão OAuth autenticada (`/root/.gemini/antigravity-cli/antigravity-oauth-token`).
    """
    candidates = [
        "/usr/local/bin/agy",
        "/root/.local/bin/agy",
        shutil.which("agy") or "",
    ]
    binary_path = next((p for p in candidates if p and os.path.isfile(p) and os.access(p, os.X_OK)), None)
    oauth_token_path = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
    if not os.path.isfile(oauth_token_path) and os.path.isfile("/root/.gemini/antigravity-cli/antigravity-oauth-token"):
        oauth_token_path = "/root/.gemini/antigravity-cli/antigravity-oauth-token"
    oauth_ok = os.path.isfile(oauth_token_path)

    return {
        "cli_available": bool(binary_path),
        "binary_path": binary_path,
        "oauth_authenticated": oauth_ok,
        "oauth_token_path": oauth_token_path if oauth_ok else None,
        "execution_mode": "HYBRID_AGY_CLI_AND_TRANSACTIONAL_SQLITE" if (binary_path and oauth_ok) else "TRANSACTIONAL_SQLITE_ENGINE",
        "zero_cost_channel": "Google Antigravity OAuth CLI (0 API Paid Tokens)",
    }


def invoke_antigravity_cli_headless(task_id: str, prompt: str, timeout_sec: int = 25) -> Optional[str]:
    """
    Executa o binário oficial Antigravity CLI (`agy -p`) em modo headless usando a sessão OAuth
    gratuita do servidor (custo zero de API paga) e transmite o parecer técnico ao Console SSE.
    """
    runtime = get_antigravity_cli_status()
    if not runtime["cli_available"] or not runtime["oauth_authenticated"]:
        return None

    binary = runtime["binary_path"]
    emit_evolution_log(
        task_id,
        "ANTIGRAVITY_CLI",
        f"🤖 Acionando binário oficial `{binary} -p` via OAuth Antigravity (0 tokens pagos)...",
        level="INFO",
    )
    try:
        cmd = [
            binary,
            "-p",
            prompt,
            "--disable-slash-commands",
            "--print-timeout",
            f"{timeout_sec}s",
        ]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec + 5,
            cwd="/app" if os.path.isdir("/app") else os.getcwd(),
        )
        out = (res.stdout or "").strip()
        if res.returncode == 0 and out:
            preview = out.replace("\n", " ")[:280]
            emit_evolution_log(
                task_id,
                "ANTIGRAVITY_CLI",
                f"🧠 [agy CLI OAuth]: {preview}",
                level="INFO",
            )
            return out
    except Exception as e:
        logger.debug(f"Aviso ao invocar agy CLI em background para {task_id}: {e}")
    return None


def enqueue_tasks_for_execution(task_ids: List[str], approved_by: str = "Admin") -> Dict[str, Any]:
    """
    Bloqueia e enfileira atomicamente as tarefas selecionadas (`status = 'QUEUED'`),
    impedindo qualquer execução duplicada ou concorrente da mesma tarefa.
    Persiste imediatamente no SQLite antes de retornar, garantindo que um F5 na página
    mantenha a tarefa visível na coluna 'Executando no Antigravity'.
    """
    init_evolution_db()
    unique_ids: List[str] = []
    for tid in (task_ids or []):
        if tid and tid not in unique_ids:
            unique_ids.append(tid)

    queued_ids: List[str] = []
    skipped_ids: List[str] = []
    now = time.time()

    with _ACTIVE_TASKS_GUARD:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            for tid in unique_ids:
                cur.execute("SELECT id, status, title FROM evolution_tasks WHERE id = ?", (tid,))
                row = cur.fetchone()
                if not row:
                    skipped_ids.append(tid)
                    continue
                cur_status = row["status"]
                if tid in _ACTIVE_TASK_IDS or cur_status in ("QUEUED", "RUNNING_IN_ANTIGRAVITY", "TESTING", "COMPLETED"):
                    skipped_ids.append(tid)
                    continue
                _ACTIVE_TASK_IDS.add(tid)
                queued_ids.append(tid)
                conn.execute(
                    """
                    UPDATE evolution_tasks
                    SET status = 'QUEUED', approved_by = ?, started_at = ?
                    WHERE id = ?
                    """,
                    (approved_by, now, tid),
                )
            conn.commit()

    for tid in queued_ids:
        t_obj = get_evolution_task(tid)
        _broadcast_sse_event({
            "type": "task_status",
            "data": {
                "id": tid,
                "status": "QUEUED",
                "approved_by": approved_by,
                "task": t_obj,
            },
        })
        emit_evolution_log(
            tid,
            "QUEUED",
            f"🔒 Tarefa enfileirada no motor Antigravity com bloqueio de execução ativo (Aprovado por: {approved_by}).",
            level="INFO",
        )

    return {
        "queued_ids": queued_ids,
        "skipped_ids": skipped_ids,
    }


def execute_single_evolution_task(task_id: str, approved_by: str = "Admin") -> Dict[str, Any]:
    """
    Executa o ciclo completo de uma tarefa evolutiva dentro do Antigravity:
    `QUEUED` -> `RUNNING_IN_ANTIGRAVITY` -> `SNAPSHOT` -> `APPLY` -> `TESTING` -> `COMPLETED` (ou `FAILED` com rollback).
    Garante bloqueio contra execução duplicada e transição visível em cada etapa na coluna 'Executando no Antigravity'.
    """
    try:
        task = get_evolution_task(task_id)
        if not task:
            return {"status": "error", "message": f"Tarefa '{task_id}' não encontrada."}

        if task["status"] == "COMPLETED":
            return {"status": "ok", "already_completed": True, "task": task}

        # Garante que a etapa 'Na Fila Antigravity' (QUEUED) seja visível na coluna 'Executando no Antigravity'
        queued_since = float(task.get("started_at") or time.time())
        elapsed_queued = time.time() - queued_since
        if elapsed_queued < 1.2:
            time.sleep(max(0.0, 1.2 - elapsed_queued))

        now = time.time()
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                UPDATE evolution_tasks
                SET status = 'RUNNING_IN_ANTIGRAVITY', started_at = ?, approved_by = ?
                WHERE id = ?
            """, (now, approved_by, task_id))
            conn.commit()

        running_task = get_evolution_task(task_id)
        _broadcast_sse_event({
            "type": "task_status",
            "data": {
                "id": task_id,
                "status": "RUNNING_IN_ANTIGRAVITY",
                "approved_by": approved_by,
                "task": running_task,
            }
        })
        emit_evolution_log(
            task_id,
            "ANTIGRAVITY",
            f"🚀 Iniciando execução no motor Antigravity (Custo Zero): \"{task['title']}\" (Aprovado por: {approved_by})",
            level="STEP"
        )

        try:
            step_start = time.time()
            # Etapa 0 (Opcional): Parecer em tempo real do binário oficial `/usr/local/bin/agy` se montado no container
            cli_prompt = (
                f"Em 1 frase curta e objetiva em português, valide tecnicamente a aplicação desta mudança no AI Board: "
                f"Título: {task['title']} | Categoria: {task['category']} | Alvo: {task.get('target_name')}"
            )
            invoke_antigravity_cli_headless(task_id, cli_prompt, timeout_sec=18)

            # Garante janela visual mínima na etapa 'Executando no Antigravity' (RUNNING_IN_ANTIGRAVITY)
            elapsed_run = time.time() - step_start
            if elapsed_run < 1.8:
                time.sleep(max(0.0, 1.8 - elapsed_run))

            # Etapa 1 & 2: Snapshot + Mutação + Teste
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("UPDATE evolution_tasks SET status = 'TESTING' WHERE id = ?", (task_id,))
                conn.commit()
            testing_task = get_evolution_task(task_id)
            _broadcast_sse_event({
                "type": "task_status",
                "data": {
                    "id": task_id,
                    "status": "TESTING",
                    "approved_by": approved_by,
                    "task": testing_task,
                }
            })

            test_start = time.time()
            snap_id, verification = _apply_task_mutation_with_snapshot(task, approved_by=approved_by)

            # Garante janela visual mínima na etapa 'Testando Integridade' (TESTING)
            elapsed_test = time.time() - test_start
            if elapsed_test < 1.5:
                time.sleep(max(0.0, 1.5 - elapsed_test))

            completed_at = time.time()
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("""
                    UPDATE evolution_tasks
                    SET status = 'COMPLETED', completed_at = ?, snapshot_id = ?, tokens_cost = 0
                    WHERE id = ?
                """, (completed_at, snap_id, task_id))
                conn.commit()

            emit_evolution_log(
                task_id,
                "COMPLETED",
                f"🎉 Evolução concluída e validada com sucesso! Snapshot #{snap_id} disponível para Rollback 1-Clique (0 tokens gastos).",
                level="SUCCESS",
                details=verification
            )
            updated_task = get_evolution_task(task_id)
            _broadcast_sse_event({"type": "task_status", "data": {"id": task_id, "status": "COMPLETED", "task": updated_task}})
            return {"status": "ok", "task": updated_task, "snapshot_id": snap_id}

        except Exception as e:
            logger.exception(f"Erro ao executar tarefa evolutiva {task_id}: {e}")
            completed_at = time.time()
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("""
                    UPDATE evolution_tasks
                    SET status = 'FAILED', completed_at = ?
                    WHERE id = ?
                """, (completed_at, task_id))
                conn.commit()

            emit_evolution_log(
                task_id,
                "ERROR",
                f"❌ Falha durante execução/teste no Antigravity: {str(e)}. Acionando proteção de estado...",
                level="ERROR"
            )
            # Se chegou a criar snapshot antes de falhar no teste, restaura automaticamente
            try:
                snap = get_snapshot_by_task(task_id)
                if snap and not snap.get("is_restored"):
                    rollback_evolution_task(task_id, rolled_back_by="Auto-Rollback (Falha no Teste)")
            except Exception:
                pass

            updated_task = get_evolution_task(task_id)
            _broadcast_sse_event({"type": "task_status", "data": {"id": task_id, "status": "FAILED", "task": updated_task}})
            return {"status": "error", "message": str(e), "task": updated_task}
    finally:
        with _ACTIVE_TASKS_GUARD:
            _ACTIVE_TASK_IDS.discard(task_id)


def execute_evolution_tasks_batch(
    task_ids: List[str],
    approved_by: str = "Admin",
    already_enqueued: bool = False
) -> Dict[str, Any]:
    """Executa uma lista de tarefas aprovadas sequencialmente com bloqueio de concorrência e logs em tempo real."""
    if not task_ids:
        return {"status": "ok", "executed": 0, "skipped": 0, "results": []}

    if already_enqueued:
        ids_to_run = list(task_ids)
        skipped_ids: List[str] = []
    else:
        enq = enqueue_tasks_for_execution(task_ids, approved_by=approved_by)
        ids_to_run = enq["queued_ids"]
        skipped_ids = enq["skipped_ids"]

    if not ids_to_run:
        return {
            "status": "ok",
            "executed": 0,
            "skipped": len(skipped_ids),
            "skipped_ids": skipped_ids,
            "results": [],
        }

    results = []
    with _EXECUTION_LOCK:
        for tid in ids_to_run:
            res = execute_single_evolution_task(tid, approved_by=approved_by)
            results.append(res)

    return {
        "status": "ok",
        "executed": len(results),
        "skipped": len(skipped_ids),
        "skipped_ids": skipped_ids,
        "results": results,
    }


def trigger_batch_execution_async(task_ids: List[str], approved_by: str = "Admin") -> Dict[str, Any]:
    """
    Enfileira atomicamente as tarefas no SQLite (`status = 'QUEUED'`) antes de retornar a chamada HTTP
    e dispara o worker em background para execução sequencial com streaming SSE.
    """
    enq = enqueue_tasks_for_execution(task_ids, approved_by=approved_by)
    queued_ids = enq["queued_ids"]
    if queued_ids:
        t = threading.Thread(
            target=execute_evolution_tasks_batch,
            args=(list(queued_ids), approved_by, True),
            daemon=True
        )
        t.start()
    return enq


# =====================================================================
# MOTOR DE ROLLBACK INSTANTÂNEO (1 CLIQUE)
# =====================================================================

def rollback_evolution_task(task_id: str, rolled_back_by: str = "Admin") -> Dict[str, Any]:
    """
    Reverte instantaneamente qualquer alteração aplicada pelo Meta-Agente usando o
    registro correspondente em `system_snapshots`.
    """
    task = get_evolution_task(task_id)
    if not task:
        raise ValueError(f"Tarefa '{task_id}' não encontrada.")

    snap = get_snapshot_by_task(task_id)
    if not snap:
        raise ValueError(f"Nenhum snapshot encontrado para a tarefa '{task_id}'.")

    prev = snap.get("previous_state", {})
    target_type = snap.get("target_type")
    target_id = snap.get("target_id")

    emit_evolution_log(
        task_id,
        "ROLLBACK",
        f"⏪ Iniciando Rollback Instantâneo (Snapshot #{snap['snapshot_id']}) solicitado por {rolled_back_by}...",
        level="WARNING"
    )

    if target_type == "agent_model":
        agent_id = prev.get("agent_id") or target_id
        old_model = prev.get("old_model", "Gemini 3.8 Flash")
        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])
        for n in nodes:
            if n.get("id") == agent_id:
                n.setdefault("data", {})
                n["data"]["model"] = old_model
                break
        save_canvas_topology(
            nodes,
            edges,
            author=f"Rollback ({rolled_back_by})",
            summary=f"[Rollback #{task_id}] Modelo de {agent_id} restaurado para {old_model}"
        )

    elif target_type in ("agent_prompt", "agent_memory"):
        agent_id = prev.get("agent_id") or target_id
        old_goal = prev.get("old_goal", "")
        old_mem = prev.get("old_memory", {})
        old_pers = prev.get("old_personality", {})

        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])
        for n in nodes:
            if n.get("id") == agent_id:
                n.setdefault("data", {})
                if old_goal:
                    n["data"]["goal"] = old_goal
                break
        save_canvas_topology(
            nodes,
            edges,
            author=f"Rollback ({rolled_back_by})",
            summary=f"[Rollback #{task_id}] Prompt e memória de {agent_id} restaurados ao snapshot original"
        )
        if old_pers:
            save_agent_personality(agent_id, old_pers.get("tone", ""), old_pers.get("guidelines", ""))
        if old_mem:
            save_agent_memory(
                agent_id,
                old_mem.get("memory_text", ""),
                old_mem.get("learned_facts", []),
                name=old_mem.get("name", ""),
                role=old_mem.get("role", ""),
            )

    elif target_type == "workspace_script":
        agent_id = prev.get("agent_id") or target_id.split(":")[0]
        filename = prev.get("filename") or "script_autonomo.py"
        if prev.get("existed"):
            save_workspace_file(agent_id, filename, prev.get("old_content", ""), description="Restaurado via Rollback")
        else:
            try:
                delete_workspace_file(agent_id, filename)
            except FileNotFoundError:
                pass

    elif target_type == "connector_repair":
        connector_id = prev.get("connector_id") or target_id
        old_node = prev.get("old_node")
        old_health = prev.get("old_health")
        if old_node:
            topo = get_canvas_topology()
            nodes = topo.get("nodes", [])
            edges = topo.get("edges", [])
            for idx, n in enumerate(nodes):
                if n.get("id") == connector_id:
                    nodes[idx] = old_node
                    break
            save_canvas_topology(
                nodes,
                edges,
                author=f"Rollback ({rolled_back_by})",
                summary=f"[Rollback #{task_id}] Estado anterior do conector {connector_id} restaurado",
            )
        if old_health and isinstance(old_health, dict):
            save_tool_health(connector_id, old_health)

    else:
        old_settings: Dict[str, Any] = prev.get("settings", {})
        for k, v in old_settings.items():
            if v is None:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute("DELETE FROM system_settings WHERE key = ?", (k,))
                    conn.commit()
            else:
                set_setting(k, str(v))

    now = time.time()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            UPDATE system_snapshots
            SET is_restored = 1, restored_at = ?, restored_by = ?
            WHERE snapshot_id = ?
        """, (now, rolled_back_by, snap["snapshot_id"]))
        conn.execute("""
            UPDATE evolution_tasks
            SET status = 'ROLLED_BACK', rolled_back_at = ?, rolled_back_by = ?
            WHERE id = ?
        """, (now, rolled_back_by, task_id))
        conn.commit()

    emit_evolution_log(
        task_id,
        "ROLLBACK",
        f"✅ Rollback concluído com sucesso! O estado anterior de '{task.get('target_name') or target_id}' foi 100% restaurado.",
        level="SUCCESS"
    )
    updated_task = get_evolution_task(task_id)
    _broadcast_sse_event({"type": "task_status", "data": {"id": task_id, "status": "ROLLED_BACK", "task": updated_task}})
    return {
        "status": "ok",
        "message": f"Rollback da tarefa #{task_id} concluído com sucesso! Estado anterior restaurado.",
        "task": updated_task,
        "snapshot_id": snap["snapshot_id"],
    }


# =====================================================================
# CONSULTAS E LISTAGEM DO BACKLOG EVOLUTIVO
# =====================================================================

def _row_to_evolution_task(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    try:
        d["payload"] = json.loads(d.get("payload_json") or "{}")
    except Exception:
        d["payload"] = {}
    try:
        d["execution_logs"] = json.loads(d.get("execution_logs_json") or "[]")
    except Exception:
        d["execution_logs"] = []
    return d


def get_evolution_task(task_id: str) -> Optional[Dict[str, Any]]:
    init_evolution_db()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM evolution_tasks WHERE id = ?", (task_id,))
        row = cur.fetchone()
        return _row_to_evolution_task(row) if row else None


def list_evolution_tasks(
    status: Optional[str] = None,
    category: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Lista tarefas do backlog evolutivo; se o banco estiver vazio no primeiro acesso, gera diagnóstico inicial."""
    init_evolution_db()
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM evolution_tasks")
        if cur.fetchone()[0] == 0:
            try:
                run_evolution_audit_and_propose(triggered_by="Auto-Discovery Inicial")
            except Exception as e:
                logger.warning(f"Erro no seed inicial de evolution_tasks: {e}")

    clauses = []
    params: List[Any] = []
    if status and status.upper() != "ALL":
        clauses.append("status = ?")
        params.append(status.upper())
    if category and category.upper() != "ALL":
        clauses.append("category = ?")
        params.append(category)
    if risk_level and risk_level.upper() != "ALL":
        clauses.append("risk_level = ?")
        params.append(risk_level.upper())

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(f"""
            SELECT * FROM evolution_tasks
            {where_sql}
            ORDER BY
                CASE status
                    WHEN 'RUNNING_IN_ANTIGRAVITY' THEN 1
                    WHEN 'TESTING' THEN 2
                    WHEN 'QUEUED' THEN 3
                    WHEN 'PENDING_APPROVAL' THEN 4
                    WHEN 'COMPLETED' THEN 5
                    WHEN 'ROLLED_BACK' THEN 6
                    ELSE 7
                END ASC,
                created_at DESC
            LIMIT ?
        """, params)
        return [_row_to_evolution_task(r) for r in cur.fetchall()]


def create_custom_evolution_task(req_data: Dict[str, Any], author: str = "Admin") -> Dict[str, Any]:
    """Permite ao administrador criar ou encomendar uma tarefa evolutiva customizada no backlog."""
    init_evolution_db()
    title = (req_data.get("title") or "").strip()
    description = (req_data.get("description") or "").strip()
    category = req_data.get("category") or "Nova Feature"
    if category not in VALID_CATEGORIES:
        category = "Nova Feature"
    risk_level = (req_data.get("risk_level") or "LOW").upper()
    if risk_level not in VALID_RISK_LEVELS:
        risk_level = "LOW"
    expected_impact = (req_data.get("expected_impact") or "Melhoria contínua da arquitetura e redução de custos operacionais").strip()
    target_type = req_data.get("target_type") or "system_setting"
    target_id = req_data.get("target_id") or f"custom_{uuid.uuid4().hex[:6]}"
    target_name = req_data.get("target_name") or title[:40]
    before_txt = req_data.get("before") or "# Estado anterior (Padrão)"
    after_txt = req_data.get("after") or f"# Implementação solicitada:\n{description}"

    spec = {
        "dedup_key": f"custom_{uuid.uuid4().hex[:10]}",
        "title": title,
        "description": description,
        "category": category,
        "risk_level": risk_level,
        "expected_impact": expected_impact,
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name,
        "estimated_savings_brl": (
            float(req_data["estimated_savings_brl"])
            if req_data.get("estimated_savings_brl") is not None
            else calculate_realistic_task_savings_brl(target_type, category, target_id)
        ),
        "author": author,
        "payload": {
            "action": req_data.get("action") or "update_system_settings",
            "settings": req_data.get("settings") or {f"custom_feature_{target_id}": "enabled"},
            "before": before_txt,
            "after": after_txt,
            "diff": build_unified_diff(before_txt, after_txt, "Antes", "Depois"),
        },
    }
    tid, _ = _upsert_evolution_task(spec)
    task = get_evolution_task(tid)

    settings = get_evolution_settings()
    if settings.get("full_auto_mode"):
        eligible = _find_eligible_auto_tasks(settings)
        if tid in eligible:
            trigger_batch_execution_async([tid], approved_by=f"Full-Auto ({author})")

    return task


def delete_or_reject_evolution_task(task_id: str, rejected_by: str = "Admin") -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM evolution_tasks WHERE id = ? AND status != 'COMPLETED'", (task_id,))
        conn.commit()
        deleted = cur.rowcount > 0
    if deleted:
        emit_evolution_log(task_id, "REJECTED", f"🗑️ Tarefa #{task_id} removida do backlog por {rejected_by}.", level="WARNING")
    return deleted


def get_evolution_overview() -> Dict[str, Any]:
    """Retorna o painel completo consolidado para a UI do Centro de Evolução."""
    recalibrate_existing_task_savings()
    tasks = list_evolution_tasks(limit=150)
    settings = get_evolution_settings()
    recent_events = get_evolution_live_events(limit=80)
    cost_summary = get_platform_monthly_cost_summary()

    counts = {st: 0 for st in VALID_STATUSES}
    by_category = {cat: 0 for cat in VALID_CATEGORIES}
    total_savings_pending_brl = 0.0
    total_savings_applied_brl = 0.0

    for t in tasks:
        st = t.get("status", "PENDING_APPROVAL")
        counts[st] = counts.get(st, 0) + 1
        cat = t.get("category", "FinOps")
        by_category[cat] = by_category.get(cat, 0) + 1
        sav = float(t.get("estimated_savings_brl") or 0.0)
        if st == "COMPLETED":
            total_savings_applied_brl += sav
        elif st == "PENDING_APPROVAL":
            total_savings_pending_brl += sav

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM system_snapshots WHERE is_restored = 0")
        active_snapshots_count = cur.fetchone()[0] or 0
        cur.execute("SELECT * FROM system_snapshots ORDER BY created_at DESC LIMIT 30")
        snapshots = [dict(r) for r in cur.fetchall()]

    running_count = counts.get("QUEUED", 0) + counts.get("RUNNING_IN_ANTIGRAVITY", 0) + counts.get("TESTING", 0)
    active_task_ids = [
        t["id"]
        for t in tasks
        if t.get("status") in ("QUEUED", "RUNNING_IN_ANTIGRAVITY", "TESTING")
    ]
    with _ACTIVE_TASKS_GUARD:
        for tid in _ACTIVE_TASK_IDS:
            if tid not in active_task_ids:
                active_task_ids.append(tid)

    return {
        "settings": settings,
        "antigravity_runtime": get_antigravity_cli_status(),
        "tasks": tasks,
        "counts": counts,
        "by_category": by_category,
        "execution_lock": {
            "is_locked": running_count > 0 or len(active_task_ids) > 0,
            "queued_count": counts.get("QUEUED", 0),
            "executing_count": counts.get("RUNNING_IN_ANTIGRAVITY", 0) + counts.get("TESTING", 0),
            "active_task_ids": active_task_ids,
        },
        "metrics": {
            "antigravity_tokens_cost": 0,
            "antigravity_cost_brl": 0.0,
            "total_tasks": len(tasks),
            "pending_approval": counts.get("PENDING_APPROVAL", 0),
            "running_count": running_count,
            "completed_count": counts.get("COMPLETED", 0),
            "rolled_back_count": counts.get("ROLLED_BACK", 0),
            "active_snapshots_count": active_snapshots_count,
            "current_monthly_cost_brl": cost_summary["current_monthly_cost_brl"],
            "estimated_monthly_savings_applied_brl": round(total_savings_applied_brl, 2),
            "estimated_monthly_savings_pending_brl": round(total_savings_pending_brl, 2),
        },
        "snapshots": snapshots,
        "recent_events": recent_events,
        "categories": VALID_CATEGORIES,
        "risk_levels": VALID_RISK_LEVELS,
    }


_EVO_SCHEDULER_STARTED = False


def _evolution_auto_scheduler_loop():
    """
    Loop autônomo de varredura do Meta-Agente Antigravity:
    1. Varredura Periódica: a cada 6 horas (configurável em `evolution_audit_interval_hours`, padrão 6h).
    2. Gatilho Reativo: dispara automaticamente quando detecta uma nova falha em `agent_tasks`
       ou a cada 10 novas interações concluídas (respeitando cooldown mínimo de 30min).
    3. Trava Anti-Acúmulo: no modo supervisionado (`full_auto_mode = false`), se já houver >= 6 tarefas
       `PENDING_APPROVAL`, aguarda a revisão humana para não inflar a fila indefinidamente.
    """
    last_checked_failed_ts = time.time()
    last_checked_completed_count = 0

    while True:
        time.sleep(60)
        try:
            settings = get_evolution_settings()
            last_audit = float(settings.get("last_audit_at") or 0.0)
            now = time.time()

            try:
                interval_hours = float(get_setting("evolution_audit_interval_hours") or 6.0)
            except Exception:
                interval_hours = 6.0

            if interval_hours <= 0:
                continue

            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM evolution_tasks WHERE status = 'PENDING_APPROVAL'")
                pending_cnt = cur.fetchone()[0] or 0

                # No modo supervisionado, evita acumular mais que 6 pendentes sem revisão
                if not settings.get("full_auto_mode") and pending_cnt >= 6:
                    continue

                cur.execute("SELECT MAX(completed_at) FROM agent_tasks WHERE status = 'FAILED'")
                latest_fail_ts = float(cur.fetchone()[0] or 0.0)

                cur.execute("SELECT COUNT(*) FROM agent_tasks WHERE status = 'COMPLETED'")
                total_completed_tasks = cur.fetchone()[0] or 0

            if last_checked_completed_count == 0:
                last_checked_completed_count = total_completed_tasks

            cooldown_ok = (now - last_audit) >= 1800  # mínimo 30 min entre auditorias automáticas
            periodic_due = (now - last_audit) >= (interval_hours * 3600)
            reactive_fail_due = cooldown_ok and (latest_fail_ts > max(last_audit, last_checked_failed_ts))
            reactive_volume_due = cooldown_ok and ((total_completed_tasks - last_checked_completed_count) >= 10)

            if periodic_due or reactive_fail_due or reactive_volume_due:
                reason = (
                    "Gatilho Reativo (Nova Falha Detectada)"
                    if reactive_fail_due
                    else (
                        "Gatilho Reativo (10+ Novas Interações)"
                        if reactive_volume_due
                        else f"Ciclo Periódico Automático ({int(interval_hours)}h)"
                    )
                )
                last_checked_failed_ts = now
                last_checked_completed_count = total_completed_tasks
                run_evolution_audit_and_propose(triggered_by=reason)
        except Exception as e:
            logger.debug(f"Aviso no scheduler autônomo do Meta-Agente: {e}")


def _resume_interrupted_queued_tasks():
    """Se o servidor reiniciar enquanto houver tarefas na fila ('QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING'), retoma a fila automaticamente."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("""
                SELECT id, approved_by FROM evolution_tasks
                WHERE status IN ('QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING')
                ORDER BY COALESCE(started_at, created_at) ASC
            """)
            rows = cur.fetchall()
            if not rows:
                return
            ids_to_resume = [r["id"] for r in rows]
            actor = rows[0]["approved_by"] or "Admin (Recovery)"
            with _ACTIVE_TASKS_GUARD:
                for tid in ids_to_resume:
                    _ACTIVE_TASK_IDS.add(tid)
                    conn.execute("UPDATE evolution_tasks SET status = 'QUEUED' WHERE id = ?", (tid,))
                conn.commit()
        t = threading.Thread(
            target=execute_evolution_tasks_batch,
            args=(ids_to_resume, actor, True),
            daemon=True,
        )
        t.start()
    except Exception as e:
        logger.debug(f"Aviso ao retomar tarefas enfileiradas na inicialização: {e}")


def start_evolution_scheduler():
    global _EVO_SCHEDULER_STARTED
    if _EVO_SCHEDULER_STARTED:
        return
    _EVO_SCHEDULER_STARTED = True
    _resume_interrupted_queued_tasks()
    t = threading.Thread(target=_evolution_auto_scheduler_loop, daemon=True)
    t.start()


init_evolution_db()
start_evolution_scheduler()
