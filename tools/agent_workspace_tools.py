"""Ferramentas de Desenvolvimento Autônomo de Ferramentas, Scripts e Bancos de Dados por Agentes (Frugal AI)."""
import os
import json
import sqlite3
import logging
from typing import Type, Optional, List, Dict, Any
from pydantic import BaseModel, Field
from crewai.tools import BaseTool
from api.agent_workspace import (
    get_agent_workspace_dir,
    list_agent_workspace_files,
    get_workspace_file_content,
    save_workspace_file,
    delete_workspace_file,
    execute_workspace_script
)

logger = logging.getLogger(__name__)

# --- 1. CRIADOR / FORJADOR DE SCRIPTS PRÓPRIOS ---
class AgentScriptForgeInput(BaseModel):
    agent_id: str = Field(..., description="ID do agente proprietário (ex: 'agent-cfo-payable', 'agent-cfo-profit').")
    filename: str = Field(..., description="Nome do arquivo de script Python com extensão .py (ex: 'calcula_multas.py', 'filtro_vendas.py').")
    code_content: str = Field(..., description="Código-fonte Python completo a ser salvo e executado localmente.")
    description: Optional[str] = Field(None, description="Breve descrição da função do script e objetivo.")

class AgentScriptForgeTool(BaseTool):
    name: str = "agent_script_forge"
    description: str = (
        "Cria ou atualiza um script Python no workspace privado do agente. "
        "Use esta ferramenta para criar automações locais, rotinas de cálculo, filtros rápidos ou geradores de relatórios. "
        "Scripts locais executam cálculos determinísticos em milissegundos com CUSTO ZERO de tokens da API Gemini."
    )
    args_schema: Type[BaseModel] = AgentScriptForgeInput

    def _run(self, agent_id: str, filename: str, code_content: str, description: Optional[str] = None) -> str:
        clean_name = filename.strip()
        if not clean_name.endswith(".py"):
            clean_name += ".py"
        try:
            res = save_workspace_file(agent_id, clean_name, code_content, description)
            return (
                f"✅ Script '{clean_name}' forjado com sucesso no workspace de {agent_id}!\n"
                f"- Tamanho: {res['size_formatted']}\n"
                "- Para executar este script determinístico sem custo de tokens, use a ferramenta 'agent_script_execute'."
            )
        except Exception as e:
            return f"❌ Erro ao forjar script: {str(e)}"

# --- 2. EXECUTOR DE SCRIPTS PRÓPRIOS ---
class AgentScriptExecuteInput(BaseModel):
    agent_id: str = Field(..., description="ID do agente proprietário.")
    filename: str = Field(..., description="Nome do script Python a executar (ex: 'conciliador_contas.py').")
    args: Optional[List[str]] = Field(None, description="Argumentos de linha de comando opcionais passados para o script.")

class AgentScriptExecuteTool(BaseTool):
    name: str = "agent_script_execute"
    description: str = (
        "Executa localmente um script Python criado no workspace do agente. "
        "Retorna a saída padrão (stdout), mensagens de erro e tempo de processamento. "
        "Permite que o agente obtenha respostas exatas e estruturadas sem alucinações e economizando tokens."
    )
    args_schema: Type[BaseModel] = AgentScriptExecuteInput

    def _run(self, agent_id: str, filename: str, args: Optional[List[str]] = None) -> str:
        try:
            res = execute_workspace_script(agent_id, filename, args)
            status_emoji = "✅" if res["status"] == "success" else "⚠️"
            return (
                f"{status_emoji} Execução do Script '{filename}' ({res['duration_ms']}ms | ~{res.get('tokens_saved_this_run', 0)} tokens poupados):\n"
                f"--- SAÍDA DO SCRIPT ---\n{res['stdout']}\n"
                + (f"--- ERROS / AVISOS ---\n{res['stderr']}\n" if res.get('stderr') else "")
            )
        except Exception as e:
            return f"❌ Erro ao executar script '{filename}': {str(e)}"

# --- 3. GERENCIADOR DE BANCO DE DADOS LOCAL SQLITE ---
class AgentSQLiteInput(BaseModel):
    agent_id: str = Field(..., description="ID do agente proprietário.")
    db_name: str = Field("local.db", description="Nome do arquivo de banco SQLite (ex: 'contas.db', 'cache_kpis.db').")
    sql_query: str = Field(..., description="Comando SQL a ser executado (CREATE TABLE, INSERT, SELECT, UPDATE).")
    is_select: bool = Field(True, description="True se a query for uma consulta (SELECT) com retorno de linhas.")

class AgentSQLiteTool(BaseTool):
    name: str = "agent_sqlite_manager"
    description: str = (
        "Permite ao agente criar tabelas, armazenar registros históricos e fazer consultas SQL no seu banco de dados local SQLite. "
        "Ideal para manter estado entre execuções, tabelas de controle, logs de auditoria e caches permanentes."
    )
    args_schema: Type[BaseModel] = AgentSQLiteInput

    def _run(self, agent_id: str, db_name: str, sql_query: str, is_select: bool = True) -> str:
        workspace_dir = get_agent_workspace_dir(agent_id)
        clean_db = db_name if db_name.endswith(".db") else f"{db_name}.db"
        db_path = os.path.join(workspace_dir, os.path.basename(clean_db))

        try:
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.cursor()
                cur.execute(sql_query)

                if is_select or sql_query.strip().upper().startswith("SELECT"):
                    rows = cur.fetchall()
                    data = [dict(r) for r in rows[:20]]
                    total = len(rows)
                    return (
                        f"📊 SQLite '{clean_db}' - {total} registro(s) retornado(s):\n"
                        f"{json.dumps(data, indent=2, ensure_ascii=False)}"
                        + ("\n...(truncado nas primeiras 20 linhas)" if total > 20 else "")
                    )
                else:
                    conn.commit()
                    return f"✅ Comando SQL executado com sucesso no banco '{clean_db}' (Linhas afetadas: {cur.rowcount})."
        except Exception as e:
            return f"❌ Erro ao executar SQL em '{clean_db}': {str(e)}"

# --- 4. ARMAZENAMENTO DE ARQUIVOS, RELATÓRIOS E CACHE DE DADOS ---
class AgentDataStoreInput(BaseModel):
    agent_id: str = Field(..., description="ID do agente proprietário.")
    filename: str = Field(..., description="Nome do arquivo a ser salvo ou lido (ex: 'dre_outubro.json', 'relatorio.csv', 'resumo.md').")
    action: str = Field("read", description="'save' para gravar/atualizar, 'read' para ler o conteúdo existente.")
    content: Optional[str] = Field(None, description="Conteúdo textual a ser gravado (obrigatório se action='save').")
    description: Optional[str] = Field(None, description="Descrição opcional do conteúdo armazenado.")

class AgentDataStoreTool(BaseTool):
    name: str = "agent_data_store"
    description: str = (
        "Lê ou grava arquivos estruturados (JSON, CSV, Markdown, Texto) no espaço de armazenamento dedicado do agente. "
        "Use para guardar resumos para reutilização futura, caches de APIs externas ou relatórios compilados."
    )
    args_schema: Type[BaseModel] = AgentDataStoreInput

    def _run(self, agent_id: str, filename: str, action: str = "read", content: Optional[str] = None, description: Optional[str] = None) -> str:
        clean_name = os.path.basename(filename.strip())
        if action.lower() == "save":
            if content is None:
                return "❌ Erro: 'content' é obrigatório para salvar um arquivo."
            res = save_workspace_file(agent_id, clean_name, content, description)
            return f"💾 Arquivo '{clean_name}' armazenado com sucesso ({res['size_formatted']}) no workspace de {agent_id}."
        else:
            try:
                res = get_workspace_file_content(agent_id, clean_name)
                if res.get("type") == "database":
                    return f"📊 Banco de Dados SQLite: {json.dumps(res.get('database_info', {}), indent=2)}"
                return f"📄 Conteúdo de '{clean_name}':\n{res.get('content', '')}"
            except FileNotFoundError:
                return f"⚠️ Arquivo '{clean_name}' ainda não existe no workspace do agente."
            except Exception as e:
                return f"❌ Erro ao ler arquivo: {str(e)}"

# --- 5. LISTAGEM DO WORKSPACE ---
class AgentWorkspaceListInput(BaseModel):
    agent_id: str = Field(..., description="ID do agente a consultar.")

class AgentWorkspaceListTool(BaseTool):
    name: str = "agent_workspace_list"
    description: str = (
        "Lista todos os scripts, bancos de dados e arquivos salvos no workspace privado do agente, "
        "com seus tamanhos, datas e descrições. Útil para o agente saber quais ferramentas próprias ele já tem prontas."
    )
    args_schema: Type[BaseModel] = AgentWorkspaceListInput

    def _run(self, agent_id: str) -> str:
        try:
            info = list_agent_workspace_files(agent_id)
            if not info["files"]:
                return f"O workspace do agente {agent_id} está vazio no momento."
            
            lines = [f"📁 Workspace do Agente '{agent_id}' ({info['total_files']} arquivos | {info['total_size_formatted']}):"]
            for f in info["files"]:
                lines.append(f"- [{f['type'].upper()}] {f['name']} ({f['size_formatted']}) - {f['description']}")
            return "\n".join(lines)
        except Exception as e:
            return f"❌ Erro ao listar workspace: {str(e)}"


# --- 6. MEMÓRIA PERMANENTE DE REGRAS APRENDIDAS E FEEDBACKS (EVOLUÇÃO CONTÍNUA) ---
SHARED_RULES_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "REGRAS_APRENDIDAS_E_FEEDBACKS.md")
)


def get_learned_rules_content() -> str:
    """Retorna o conteúdo consolidado do arquivo REGRAS_APRENDIDAS_E_FEEDBACKS.md e da tabela SQLite."""
    os.makedirs(os.path.dirname(SHARED_RULES_FILE), exist_ok=True)
    if not os.path.exists(SHARED_RULES_FILE):
        company_name = os.getenv("COMPANY_NAME", "AI Board")
        default_header = (
            f"# 📚 REGRAS APRENDIDAS E FEEDBACKS DOS GESTORES — {company_name}\n\n"
            "Este documento registra permanentemente todas as correções, preferências e novas regras de negócio "
            "ensinadas pelos gestores via Chat ou Telegram.\n"
            "Todos os agentes da organização consultam e obedecem estritamente a estas regras em 100% das execuções.\n\n"
            "---\n"
        )
        try:
            with open(SHARED_RULES_FILE, "w", encoding="utf-8") as f:
                f.write(default_header)
        except Exception:
            pass

    try:
        with open(SHARED_RULES_FILE, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


class LearnedRulesMemoryInput(BaseModel):
    action: str = Field(
        "read",
        description="Ação: 'read' para consultar todas as regras aprendidas e feedbacks; 'add' para gravar permanentemente uma nova regra/correção do fundador."
    )
    rule_text: Optional[str] = Field(
        None,
        description="Texto claro da nova regra ou correção a ser gravada (obrigatório quando action='add'). Ex: 'A partir de hoje, envie boletos de energia também para X'."
    )
    context_or_department: Optional[str] = Field(
        "Global",
        description="Departamento ou contexto da regra (ex: 'COO / Operações', 'CFO / Financeiro', 'CMO / Marketing', 'CPO / RH', 'Global')."
    )
    agent_id: Optional[str] = Field(
        "c-level",
        description="ID ou cargo do agente que está registrando a regra."
    )


class LearnedRulesMemoryTool(BaseTool):
    name: str = "learned_rules_memory"
    description: str = (
        "Ferramenta de Memória de Regras Aprendidas e Evolução Contínua ('REGRAS_APRENDIDAS_E_FEEDBACKS.md'). "
        "SEMPRE que você receber uma correção, preferência ou nova exigência do fundador "
        "(ex.: 'A partir de hoje, envie boletos de energia também para X' ou 'Desconsidere o item Y na contagem'), "
        "use esta ferramenta com action='add' para registrar essa regra permanentemente no banco de dados, "
        "no arquivo REGRAS_APRENDIDAS_E_FEEDBACKS.md e sincronizá-la no Google Drive."
    )
    args_schema: Type[BaseModel] = LearnedRulesMemoryInput

    def _run(
        self,
        action: str = "read",
        rule_text: Optional[str] = None,
        context_or_department: Optional[str] = "Global",
        agent_id: Optional[str] = "c-level"
    ) -> str:
        from datetime import datetime
        act = (action or "read").strip().lower()

        if act in ("add", "save", "write", "append", "registrar"):
            if not rule_text or not rule_text.strip():
                return "❌ Erro: 'rule_text' é obrigatório para registrar uma nova regra aprendida."

            now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
            dept_str = (context_or_department or "Global").strip()
            ag_str = (agent_id or "C-Level").strip()
            clean_rule = rule_text.strip()

            # 1. Garante arquivo existente e adiciona a nova regra em Markdown
            current_md = get_learned_rules_content()
            entry_md = f"\n- **[{now_str}] [{dept_str}] (Registrado por `{ag_str}`)**: {clean_rule}\n"
            updated_md = current_md.rstrip() + "\n" + entry_md

            try:
                with open(SHARED_RULES_FILE, "w", encoding="utf-8") as f:
                    f.write(updated_md)
            except Exception as e:
                logger.error(f"Erro ao gravar REGRAS_APRENDIDAS_E_FEEDBACKS.md: {e}")

            # 2. Persiste também na tabela SQLite learned_business_rules e na memória do agente
            try:
                from api.tasks_queue import DB_PATH, get_agent_memory, save_agent_memory
                import time as _time
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS learned_business_rules (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            created_at REAL NOT NULL,
                            date_human TEXT NOT NULL,
                            department TEXT,
                            agent_id TEXT,
                            rule_text TEXT NOT NULL
                        )
                    """)
                    conn.execute(
                        "INSERT INTO learned_business_rules (created_at, date_human, department, agent_id, rule_text) VALUES (?, ?, ?, ?, ?)",
                        (_time.time(), now_str, dept_str, ag_str, clean_rule)
                    )
                    conn.commit()

                if ag_str and ag_str.startswith("agent-"):
                    mem = get_agent_memory(ag_str)
                    facts = list(mem.get("learned_facts") or [])
                    facts.append(f"[{now_str}] {clean_rule}")
                    save_agent_memory(ag_str, mem.get("memory_text", ""), facts, mem.get("name", ""), mem.get("role", ""))
            except Exception as e:
                logger.warning(f"Aviso ao sincronizar regra no SQLite: {e}")

            # 3. Sincroniza cópia de REGRAS_APRENDIDAS_E_FEEDBACKS.md no Google Drive (best-effort)
            drive_sync_msg = ""
            try:
                import base64
                from api.main import _call_drive_api, get_setting
                company_name = get_setting("company_name") or os.getenv("COMPANY_NAME", "AI Board")
                folder_name = get_setting("reports_drive_folder") or f"Boletins Executivos {company_name}"
                b64_content = base64.b64encode(updated_md.encode("utf-8")).decode("ascii")
                res_drive = _call_drive_api("POST", {
                    "action": "upload",
                    "name": "REGRAS_APRENDIDAS_E_FEEDBACKS.md",
                    "folderName": folder_name,
                    "mimeType": "text/markdown",
                    "base64Data": b64_content
                })
                if res_drive.get("id") or res_drive.get("url"):
                    drive_sync_msg = " e sincronizada no Google Drive (`REGRAS_APRENDIDAS_E_FEEDBACKS.md`)"
            except Exception:
                pass

            return (
                f"✅ Regra aprendida registrada permanentemente em `REGRAS_APRENDIDAS_E_FEEDBACKS.md`{drive_sync_msg}!\n"
                f"📌 Regra: [{now_str}] [{dept_str}] {clean_rule}\n"
                f"A partir de agora, todos os agentes aplicarão esta regra em 100% das execuções futuras."
            )

        content = get_learned_rules_content()
        return f"📚 CONTEÚDO ATUAL DE `REGRAS_APRENDIDAS_E_FEEDBACKS.md`:\n\n{content}"

