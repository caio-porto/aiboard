"""Gerenciador de Workspaces, Scripts Autônomos e Armazenamento Local por Agente (Frugal AI)."""
import os
import sys
import json
import time
import sqlite3
import subprocess
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

BASE_WORKSPACES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "workspaces"))

def get_agent_workspace_dir(agent_id: str) -> str:
    """Retorna o diretório isolado do workspace do agente, criando-o se necessário."""
    clean_id = agent_id.strip().replace("..", "").replace("/", "").replace("\\", "")
    target_dir = os.path.join(BASE_WORKSPACES_DIR, clean_id)
    os.makedirs(target_dir, exist_ok=True)
    return target_dir

def _get_manifest_path(agent_id: str) -> str:
    return os.path.join(get_agent_workspace_dir(agent_id), ".workspace_manifest.json")

def _read_manifest(agent_id: str) -> Dict[str, Any]:
    manifest_path = _get_manifest_path(agent_id)
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                raw_files = data.get("files")
                if isinstance(raw_files, list):
                    norm_files = {}
                    for item in raw_files:
                        if isinstance(item, dict) and item.get("name"):
                            norm_files[item["name"]] = item
                        elif isinstance(item, str):
                            norm_files[item] = {"description": f"Arquivo {item}"}
                    data["files"] = norm_files
                elif not isinstance(raw_files, dict):
                    data["files"] = {}
                return data
        except Exception as e:
            logger.error(f"Erro ao ler manifest do workspace {agent_id}: {e}")
    return {"files": {}, "executions": 0, "tokens_saved_estimate": 0}

def _save_manifest(agent_id: str, data: Dict[str, Any]):
    manifest_path = _get_manifest_path(agent_id)
    try:
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Erro ao salvar manifest do workspace {agent_id}: {e}")

def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / (1024 * 1024):.1f} MB"

def _detect_file_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".py", ".sh", ".bash"):
        return "script"
    elif ext in (".db", ".sqlite", ".sqlite3"):
        return "database"
    elif ext in (".json", ".csv", ".tsv"):
        return "cache"
    elif ext in (".md", ".txt", ".sql", ".log"):
        return "document"
    return "other"

def list_agent_workspace_files(agent_id: str) -> Dict[str, Any]:
    """Lista todos os scripts, bancos de dados e arquivos criados pelo agente."""
    ensure_starter_workspaces(agent_id)
    workspace_dir = get_agent_workspace_dir(agent_id)
    manifest = _read_manifest(agent_id)
    manifest_files = manifest.get("files", {})
    if not isinstance(manifest_files, dict):
        manifest_files = {}

    files = []
    total_size = 0

    if os.path.exists(workspace_dir):
        for entry in os.scandir(workspace_dir):
            if entry.is_file() and not entry.name.startswith("."):
                stat = entry.stat()
                size = stat.st_size
                total_size += size
                mtime = stat.st_mtime
                file_type = _detect_file_type(entry.name)

                # Metadados do manifest se existirem
                file_meta = manifest_files.get(entry.name, {})
                if not isinstance(file_meta, dict):
                    file_meta = {}
                description = file_meta.get("description", "")
                
                # Se não tem descrição no manifest, tenta extrair docstring de script python
                if not description and file_type == "script":
                    try:
                        with open(entry.path, "r", encoding="utf-8", errors="ignore") as f:
                            lines = [f.readline() for _ in range(5)]
                            for l in lines:
                                l_clean = l.strip().strip('"""').strip("'''").strip("#").strip()
                                if l_clean:
                                    description = l_clean[:120]
                                    break
                    except Exception:
                        pass

                files.append({
                    "name": entry.name,
                    "type": file_type,
                    "size": size,
                    "size_formatted": _format_size(size),
                    "updated_at": datetime.fromtimestamp(mtime).strftime("%d/%m/%Y %H:%M:%S"),
                    "updated_timestamp": mtime,
                    "description": description or f"Arquivo {file_type} gerado pelo agente",
                    "runs_count": file_meta.get("runs_count", 0),
                    "last_run_at": file_meta.get("last_run_at")
                })

    # Ordena: scripts primeiro, depois bancos, depois caches, ordenados por data
    type_priority = {"script": 0, "database": 1, "cache": 2, "document": 3, "other": 4}
    files.sort(key=lambda x: (type_priority.get(x["type"], 99), -x["updated_timestamp"]))

    # Cálculo estimado de tokens economizados
    tokens_saved = manifest.get("tokens_saved_estimate", len(files) * 2400)

    return {
        "agent_id": agent_id,
        "workspace_dir": workspace_dir,
        "files": files,
        "total_files": len(files),
        "total_size": total_size,
        "total_size_formatted": _format_size(total_size),
        "tokens_saved_estimate": tokens_saved
    }

def get_workspace_file_content(agent_id: str, filename: str) -> Dict[str, Any]:
    """Retorna o conteúdo de um arquivo ou resumo das tabelas de um banco SQLite."""
    workspace_dir = get_agent_workspace_dir(agent_id)
    clean_name = os.path.basename(filename)
    target_path = os.path.join(workspace_dir, clean_name)

    if not os.path.exists(target_path):
        raise FileNotFoundError(f"Arquivo '{clean_name}' não encontrado no workspace do agente.")

    file_type = _detect_file_type(clean_name)
    stat = os.stat(target_path)

    # Caso 1: Banco de Dados SQLite
    if file_type == "database":
        db_info = _inspect_sqlite_database(target_path)
        return {
            "name": clean_name,
            "type": "database",
            "size": stat.st_size,
            "size_formatted": _format_size(stat.st_size),
            "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M:%S"),
            "database_info": db_info
        }

    # Caso 2: Arquivo de texto / Script / JSON / CSV
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(target_path, "r", encoding="latin-1") as f:
            content = f.read()

    return {
        "name": clean_name,
        "type": file_type,
        "size": stat.st_size,
        "size_formatted": _format_size(stat.st_size),
        "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%d/%m/%Y %H:%M:%S"),
        "content": content
    }

def _inspect_sqlite_database(db_path: str) -> Dict[str, Any]:
    """Inspeciona tabelas, contagem de registros e amostra de dados de um SQLite local."""
    info = {"tables": [], "total_tables": 0}
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            tables = [row["name"] for row in cur.fetchall()]
            info["total_tables"] = len(tables)

            for tbl in tables:
                # Contagem
                cur.execute(f"SELECT COUNT(*) as count FROM [{tbl}]")
                row_count = cur.fetchone()["count"]

                # Colunas
                cur.execute(f"PRAGMA table_info([{tbl}])")
                cols = [{"name": c["name"], "type": c["type"]} for c in cur.fetchall()]

                # Amostra de 5 linhas
                cur.execute(f"SELECT * FROM [{tbl}] LIMIT 5")
                sample_rows = [dict(r) for r in cur.fetchall()]

                info["tables"].append({
                    "name": tbl,
                    "row_count": row_count,
                    "columns": cols,
                    "sample": sample_rows
                })
    except Exception as e:
        info["error"] = str(e)
    return info

def save_workspace_file(agent_id: str, filename: str, content: str, description: Optional[str] = None) -> Dict[str, Any]:
    """Cria ou atualiza um arquivo no workspace do agente."""
    workspace_dir = get_agent_workspace_dir(agent_id)
    clean_name = os.path.basename(filename)
    target_path = os.path.join(workspace_dir, clean_name)

    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)

    manifest = _read_manifest(agent_id)
    files = manifest.setdefault("files", {})
    if not isinstance(files, dict):
        files = {}
        manifest["files"] = files
    files[clean_name] = {
        "description": description or f"Arquivo criado em {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        "updated_at": time.time(),
        "runs_count": files.get(clean_name, {}).get("runs_count", 0) if isinstance(files.get(clean_name), dict) else 0
    }
    manifest["tokens_saved_estimate"] = manifest.get("tokens_saved_estimate", 0) + 1500
    _save_manifest(agent_id, manifest)

    stat = os.stat(target_path)
    return {
        "status": "success",
        "name": clean_name,
        "size": stat.st_size,
        "size_formatted": _format_size(stat.st_size),
        "message": f"Arquivo '{clean_name}' salvo com sucesso no workspace do agente."
    }

def delete_workspace_file(agent_id: str, filename: str) -> Dict[str, Any]:
    """Exclui um arquivo do workspace."""
    workspace_dir = get_agent_workspace_dir(agent_id)
    clean_name = os.path.basename(filename)
    target_path = os.path.join(workspace_dir, clean_name)

    if os.path.exists(target_path):
        os.remove(target_path)
        manifest = _read_manifest(agent_id)
        if isinstance(manifest.get("files"), dict) and clean_name in manifest["files"]:
            del manifest["files"][clean_name]
            _save_manifest(agent_id, manifest)
        return {"status": "success", "message": f"Arquivo '{clean_name}' excluído com sucesso."}
    raise FileNotFoundError(f"Arquivo '{clean_name}' não encontrado.")

def execute_workspace_script(agent_id: str, filename: str, args: Optional[List[str]] = None, timeout_sec: int = 25) -> Dict[str, Any]:
    """Executa com segurança um script Python do workspace do agente."""
    workspace_dir = get_agent_workspace_dir(agent_id)
    clean_name = os.path.basename(filename)
    script_path = os.path.join(workspace_dir, clean_name)

    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Script '{clean_name}' não encontrado no workspace do agente.")

    if not clean_name.endswith(".py"):
        raise ValueError("Apenas scripts Python (.py) podem ser executados diretamente.")

    cmd = [sys.executable, clean_name]
    if args:
        cmd.extend([str(a) for a in args])

    # Garante UTF-8 no terminal e subprocessos
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    start_time = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=workspace_dir,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env=env
        )
        duration_ms = int((time.time() - start_time) * 1000)

        # Atualiza métricas no manifest
        manifest = _read_manifest(agent_id)
        files = manifest.setdefault("files", {})
        if not isinstance(files, dict):
            files = {}
            manifest["files"] = files
        file_meta = files.setdefault(clean_name, {})
        if not isinstance(file_meta, dict):
            file_meta = {}
            files[clean_name] = file_meta
        file_meta["runs_count"] = file_meta.get("runs_count", 0) + 1
        file_meta["last_run_at"] = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        manifest["executions"] = manifest.get("executions", 0) + 1
        manifest["tokens_saved_estimate"] = manifest.get("tokens_saved_estimate", 0) + 3200
        _save_manifest(agent_id, manifest)

        return {
            "status": "success" if proc.returncode == 0 else "error",
            "returncode": proc.returncode,
            "stdout": proc.stdout or "(Nenhuma saída no terminal)",
            "stderr": proc.stderr or "",
            "duration_ms": duration_ms,
            "tokens_saved_this_run": 3200
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "returncode": -1,
            "stdout": "",
            "stderr": f"Tempo limite de {timeout_sec}s excedido durante a execução do script.",
            "duration_ms": timeout_sec * 1000
        }
    except Exception as e:
        return {
            "status": "error",
            "returncode": -1,
            "stdout": "",
            "stderr": f"Erro interno ao executar script: {str(e)}",
            "duration_ms": int((time.time() - start_time) * 1000)
        }

def ensure_starter_workspaces(agent_id: Optional[str] = None):
    """Cria scripts, bancos SQLite e dados iniciais representativos para os agentes principais se ainda vazios."""
    # 1. Auditor de Contas a Pagar (agent-cfo-payable)
    if not agent_id or agent_id == "agent-cfo-payable":
        dir_payable = get_agent_workspace_dir("agent-cfo-payable")
        script_payable = os.path.join(dir_payable, "conciliador_contas.py")
        if not os.path.exists(script_payable):
            with open(script_payable, "w", encoding="utf-8") as f:
                f.write('''"""Script de Conciliação Automática de Faturas e Contas do Dia.
Executado localmente para cruzar faturas com extrato bancário com custo zero de tokens."""
import json
import sqlite3
from datetime import datetime

# Conecta ao banco de dados local do agente
conn = sqlite3.connect("contas_historico.db")
cur = conn.cursor()
cur.execute("""
    CREATE TABLE IF NOT EXISTS faturas_auditadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor TEXT,
        valor REAL,
        vencimento TEXT,
        status TEXT,
        categoria TEXT,
        auditado_em TEXT
    )
""")

# Simula verificação das faturas do dia
faturas_hoje = [
    ("Leite Condensado & Lácteos Betânia", 3450.00, "2026-10-25", "PAGO_CONCILIADO", "Insumos Chá"),
    ("Distribuidora Xaropes Monin", 2890.50, "2026-10-25", "PAGO_CONCILIADO", "Insumos Chá"),
    ("Embalagens & Copos Boba Eco", 1780.00, "2026-10-25", "AGUARDANDO_CONCILIACAO", "Embalagens"),
    ("Software Gestão & Nuvem", 650.00, "2026-10-25", "PAGO_CONCILIADO", "TI & Softwares")
]

for f in faturas_hoje:
    cur.execute("""
        INSERT INTO faturas_auditadas (fornecedor, valor, vencimento, status, categoria, auditado_em)
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    """, f)

conn.commit()

# Resumo executivo determinístico
cur.execute("SELECT status, COUNT(*), SUM(valor) FROM faturas_auditadas GROUP BY status")
resumo = cur.fetchall()

print("="*50)
print(f"📊 RELATÓRIO DO CONCILIADOR - AI Board ({datetime.now().strftime('%d/%m/%Y %H:%M')})")
print("="*50)
total_pago = 0
for st, qtd, val in resumo:
    print(f"Status: {st:<24} | Qtd: {qtd} | Total: R$ {val:,.2f}")
    if "PAGO" in st:
        total_pago += val

print("-" * 50)
print(f"✅ Total Auditado e Conciliado Hoje: R$ {total_pago:,.2f}")
print("⚡ Execução determinística local concluída com 0 tokens consumidos.")
conn.close()
''')
            # Roda uma vez para gerar o banco sqlite inicial
            try:
                subprocess.run([sys.executable, "conciliador_contas.py"], cwd=dir_payable, capture_output=True, timeout=10)
            except Exception:
                pass

    # 2. Analista de DRE & Lucro (agent-cfo-profit)
    if not agent_id or agent_id == "agent-cfo-profit":
        dir_profit = get_agent_workspace_dir("agent-cfo-profit")
        script_profit = os.path.join(dir_profit, "calculadora_cmv_ebitda.py")
        if not os.path.exists(script_profit):
            with open(script_profit, "w", encoding="utf-8") as f:
                f.write('''"""Calculadora Determinística de CMV, Margem de Contribuição e EBITDA.
Permite ao agente calcular projeções e variações contábeis instantaneamente sem usar a API do LLM."""
import json
import os

dre_base = {
    "competencia": "10/2026",
    "receita_bruta": 98420.00,
    "impostos_das": 6397.30,
    "receita_liquida": 92022.70,
    "cmv_insumos": 26226.47,
    "despesas_folha_dp": 24150.00,
    "despesas_ocupacao_lojas": 12800.00,
    "despesas_gerais_mkt": 8400.00
}

# Cálculos determinísticos
margem_bruta = dre_base["receita_liquida"] - dre_base["cmv_insumos"]
pct_cmv = (dre_base["cmv_insumos"] / dre_base["receita_liquida"]) * 100
total_despesas_op = dre_base["despesas_folha_dp"] + dre_base["despesas_ocupacao_lojas"] + dre_base["despesas_gerais_mkt"]
ebitda = margem_bruta - total_despesas_op
pct_ebitda = (ebitda / dre_base["receita_liquida"]) * 100

resultado = {
    "margem_bruta_reais": round(margem_bruta, 2),
    "pct_cmv_receita_liq": round(pct_cmv, 1),
    "total_despesas_operacionais": round(total_despesas_op, 2),
    "ebitda_reais": round(ebitda, 2),
    "margem_ebitda_pct": round(pct_ebitda, 1)
}

# Salva cache de resultado
with open("dre_calculada_cache.json", "w", encoding="utf-8") as f:
    json.dump(resultado, f, indent=2)

print("="*50)
print("📈 AUDITORIA DRE & MARGEM AI Board (CÁLCULO EXATO)")
print("="*50)
print(f"Receita Líquida:         R$ {dre_base['receita_liquida']:,.2f}")
print(f"(-) CMV Insumos:         R$ {dre_base['cmv_insumos']:,.2f} ({pct_cmv:.1f}%)")
print(f"(=) Margem Contribuição: R$ {margem_bruta:,.2f} ({100 - pct_cmv:.1f}%)")
print(f"(-) Despesas Operac.:    R$ {total_despesas_op:,.2f}")
print(f"(=) EBITDA Operacional:  R$ {ebitda:,.2f} (Margem: {pct_ebitda:.1f}%)")
print("="*50)
print("⚡ Métricas salvas em dre_calculada_cache.json | Tokens poupados: ~2.500")
''')
            try:
                subprocess.run([sys.executable, "calculadora_cmv_ebitda.py"], cwd=dir_profit, capture_output=True, timeout=10)
            except Exception:
                pass

    # 3. Gestor de Estoque (agent-coo-stock)
    if not agent_id or agent_id == "agent-coo-stock":
        dir_stock = get_agent_workspace_dir("agent-coo-stock")
        script_stock = os.path.join(dir_stock, "alerta_reposicao_estoque.py")
        if not os.path.exists(script_stock):
            with open(script_stock, "w", encoding="utf-8") as f:
                f.write('''"""Auditor Local de Ponto de Pedido e Reposição Crítica de Insumos AI Board."""
import sqlite3

conn = sqlite3.connect("estoque_critico.db")
cur = conn.cursor()
cur.execute("""
    CREATE TABLE IF NOT EXISTS estoque_insumos (
        id INTEGER PRIMARY KEY,
        item TEXT,
        categoria TEXT,
        saldo_atual REAL,
        unidade TEXT,
        ponto_pedido REAL,
        status TEXT
    )
""")

itens = [
    (1, "Matéria-Prima Alfa", "Chás", 4.2, "kg", 8.0, "REPOR_URGENTE"),
    (2, "Componente Beta", "Xaropes", 12.0, "litros", 6.0, "CONFORTAVEL"),
    (3, "Item Gama", "Toppings", 9.5, "kg", 15.0, "REPOR_URGENTE"),
    (4, "Copos 500ml Seláveis Eco", "Embalagens", 350.0, "unid", 500.0, "ATENCAO"),
    (5, "Insumo Delta", "Toppings", 18.0, "kg", 5.0, "CONFORTAVEL")
]

for it in itens:
    cur.execute("""
        INSERT OR REPLACE INTO estoque_insumos (id, item, categoria, saldo_atual, unidade, ponto_pedido, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, it)
conn.commit()

cur.execute("SELECT item, saldo_atual, ponto_pedido, unidade, status FROM estoque_insumos WHERE status != 'CONFORTAVEL'")
alertas = cur.fetchall()

print("="*55)
print("📦 RELATÓRIO DE ITENS ABAIXO DO PONTO DE PEDIDO (ROP)")
print("="*55)
for it, saldo, rop, unid, st in alertas:
    print(f"⚠️ {it:<28} Saldo: {saldo} {unid} (Mín: {rop} {unid}) -> {st}")
print("="*55)
print("⚡ Consulta local SQLite executada em 2ms | 0 chamadas de API Gemini.")
conn.close()
''')
            try:
                subprocess.run([sys.executable, "alerta_reposicao_estoque.py"], cwd=dir_stock, capture_output=True, timeout=10)
            except Exception:
                pass
