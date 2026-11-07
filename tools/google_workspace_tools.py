"""Google Workspace (Drive, Sheets, Gmail) Tools for CrewAI."""
import os
import json
import base64
import logging
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Type, Tuple, Dict, Any
import requests
from pydantic import BaseModel, Field
try:
    from crewai.tools import BaseTool
except ImportError:
    class BaseTool:
        def __init__(self, **kwargs):
            pass
        def run(self, **kwargs):
            return self._run(**kwargs)

logger = logging.getLogger(__name__)

# --- TOKENS & OAUTH NATIVO ---
def _find_tokens_file() -> Optional[str]:
    candidates = [
        os.getenv("GOOGLE_WORKSPACE_TOKENS_FILE"),
        "data/google_workspace_tokens.json",
        "/app/data/google_workspace_tokens.json",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "google_workspace_tokens.json"),
        "google_workspace_tokens.json"
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None

def get_workspace_access_token() -> Tuple[Optional[str], Optional[str]]:
    """Retorna (access_token, user_email). Se expirado, renova via refresh_token."""
    path = _find_tokens_file()
    if not path:
        return None, None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        tokens = data.get("tokens", {})
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        client_id = data.get("client_id")
        client_secret = data.get("client_secret")
        user_email = data.get("user", {}).get("email")

        # Testa token atual
        if access_token:
            resp = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=5
            )
            if resp.status_code == 200:
                return access_token, user_email

        # Renova via refresh_token
        if refresh_token and client_id and client_secret:
            refresh_resp = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token"
                },
                timeout=10
            )
            if refresh_resp.status_code == 200:
                new_tokens = refresh_resp.json()
                tokens["access_token"] = new_tokens["access_token"]
                data["tokens"] = tokens
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                return tokens["access_token"], user_email
    except Exception as e:
        logger.warning(f"Erro ao obter token do Google Workspace: {e}")
    return None, None

# --- FALLBACK: APPS SCRIPT WEBAPP ---
DEFAULT_DRIVE_URL = os.environ.get("GOOGLE_APPS_SCRIPT_DRIVE_URL", "")
DEFAULT_DRIVE_KEY = os.environ.get("DRIVE_APP_KEY", "")

def _call_drive_api(method: str, params_or_body: dict) -> dict:
    url = os.getenv("GOOGLE_APPS_SCRIPT_DRIVE_URL") or DEFAULT_DRIVE_URL
    key = os.getenv("DRIVE_APP_KEY") or DEFAULT_DRIVE_KEY
    if not url:
        return {"error": "GOOGLE_APPS_SCRIPT_DRIVE_URL não configurado e OAuth token indisponível."}
    data = dict(params_or_body)
    if key:
        data["key"] = key
    try:
        if method.upper() == "GET":
            resp = requests.get(url, params=data, timeout=30, allow_redirects=True)
        else:
            resp = requests.post(url, json=data, timeout=45, allow_redirects=True)
        if "accounts.google.com" in resp.url:
            return {"error": "Google Sign-In retornado. Permissao de implantacao precisa ser 'Anyone'."}
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"HTTP {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"error": str(e)}

# --- GOOGLE DRIVE TOOLS ---
class GoogleDriveSearchInput(BaseModel):
    query: str = Field(..., description="Termo de busca para arquivos ou pastas no Google Drive (ex: 'relatorio', 'estoque', 'ficha').")

class GoogleDriveSearchTool(BaseTool):
    name: str = "google_drive_search"
    description: str = "Pesquisa documentos, planilhas, PDFs e pastas no Google Drive da empresa."
    args_schema: Type[BaseModel] = GoogleDriveSearchInput
    default_folder_id: Optional[str] = None
    default_file_id: Optional[str] = None
    category_label: Optional[str] = None

    def _run(self, query: str) -> str:
        token, email = get_workspace_access_token()
        if token:
            try:
                clean_query = query.replace("'", "\\'")
                q_clauses = [f"name contains '{clean_query}'", "trashed = false"]
                if self.default_folder_id:
                    q_clauses.append(f"'{self.default_folder_id}' in parents")
                q_param = " and ".join(q_clauses)
                resp = requests.get(
                    "https://www.googleapis.com/drive/v3/files",
                    params={
                        "q": q_param,
                        "pageSize": 15,
                        "fields": "files(id, name, mimeType, webViewLink, modifiedTime)",
                        "orderBy": "modifiedTime desc",
                        "corpora": "allDrives",
                        "includeItemsFromAllDrives": "true",
                        "supportsAllDrives": "true"
                    },
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=15
                )
                if resp.status_code == 200:
                    files = resp.json().get("files", [])
                    # Se não achou dentro da pasta restrita, faz fallback global para garantir cobertura
                    if not files and self.default_folder_id:
                        resp_global = requests.get(
                            "https://www.googleapis.com/drive/v3/files",
                            params={
                                "q": f"name contains '{clean_query}' and trashed = false",
                                "pageSize": 15,
                                "fields": "files(id, name, mimeType, webViewLink, modifiedTime)",
                                "orderBy": "modifiedTime desc",
                                "corpora": "allDrives",
                                "includeItemsFromAllDrives": "true",
                                "supportsAllDrives": "true"
                            },
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=15
                        )
                        if resp_global.status_code == 200:
                            files = resp_global.json().get("files", [])
                    if not files:
                        return f"Nenhum arquivo encontrado no Google Drive para '{query}'."
                    out = []
                    for i, f in enumerate(files, 1):
                        out.append(f"[{i}] {f.get('name')} (Tipo: {f.get('mimeType')}, ID: {f.get('id')}, Modificado: {f.get('modifiedTime', '')})")
                    return "\n".join(out)
            except Exception as e:
                logger.warning(f"Erro na busca nativa do Drive, usando fallback: {e}")

        # Fallback WebApp
        res = _call_drive_api("GET", {"action": "search", "query": query, "limit": 10})
        if "error" in res:
            return f"Erro ao consultar Google Drive: {res['error']}"
        files = res.get("files") or res.get("results") or []
        if not files:
            return f"Nenhum arquivo encontrado no Google Drive para '{query}'."
        out = []
        for i, f in enumerate(files, 1):
            out.append(f"[{i}] {f.get('name')} (Tipo: {f.get('mimeType', 'desconhecido')}, ID: {f.get('id')}, URL: {f.get('url', '')})")
        return "\n".join(out)

class GoogleDriveReadFileInput(BaseModel):
    file_id_or_name: str = Field(..., description="ID ou nome exato do arquivo no Google Drive para extrair conteúdo.")
    sheet_filter: Optional[str] = Field(None, description="Opcional: nome do mês ou aba da planilha para filtrar (ex: 'Novembro', 'Outubro').")

class GoogleDriveReadFileTool(BaseTool):
    name: str = "google_drive_read_file"
    description: str = "Lê o conteúdo completo (incluindo todas as abas de planilhas Google Sheets e Excel .xlsx) de um documento ou planilha no Google Drive."
    args_schema: Type[BaseModel] = GoogleDriveReadFileInput
    default_file_id: Optional[str] = None

    def _run(self, file_id_or_name: str, sheet_filter: Optional[str] = None) -> str:
        token, email = get_workspace_access_token()
        fid = (file_id_or_name or self.default_file_id or "").strip()
        if token and fid:
            try:
                # Se não parecer um ID alfanumérico longo, pesquisa primeiro pelo nome
                if len(fid) < 20 or " " in fid or "." in fid:
                    clean_name = fid.replace("'", "\\'")
                    s_resp = requests.get(
                        "https://www.googleapis.com/drive/v3/files",
                        params={
                            "q": f"name contains '{clean_name}' and trashed = false",
                            "pageSize": 5,
                            "fields": "files(id, name, mimeType, modifiedTime)",
                            "orderBy": "modifiedTime desc",
                            "corpora": "allDrives",
                            "includeItemsFromAllDrives": "true",
                            "supportsAllDrives": "true"
                        },
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=10
                    )
                    if s_resp.status_code == 200:
                        flist = s_resp.json().get("files", [])
                        if flist:
                            fid = flist[0]["id"]

                # Pega metadados para saber o mimeType
                meta_resp = requests.get(
                    f"https://www.googleapis.com/drive/v3/files/{fid}",
                    params={"fields": "id, name, mimeType", "supportsAllDrives": "true"},
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10
                )
                if meta_resp.status_code == 200:
                    meta = meta_resp.json()
                    fname = meta.get("name", fid)
                    mtype = meta.get("mimeType", "")
                    # Google Docs -> Export text/plain
                    if mtype == "application/vnd.google-apps.document":
                        d_resp = requests.get(
                            f"https://www.googleapis.com/drive/v3/files/{fid}/export",
                            params={"mimeType": "text/plain"},
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=20
                        )
                        return f"=== DOCUMENTO: {fname} ===\n" + d_resp.text[:8000]
                    # Google Sheets -> Export xlsx para ler TODAS as abas, ou CSV se falhar
                    elif mtype == "application/vnd.google-apps.spreadsheet" or mtype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or fname.lower().endswith(".xlsx"):
                        if mtype == "application/vnd.google-apps.spreadsheet":
                            d_resp = requests.get(
                                f"https://www.googleapis.com/drive/v3/files/{fid}/export",
                                params={"mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
                                headers={"Authorization": f"Bearer {token}"},
                                timeout=25
                            )
                        else:
                            d_resp = requests.get(
                                f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media&supportsAllDrives=true",
                                headers={"Authorization": f"Bearer {token}"},
                                timeout=25
                            )
                        if d_resp.status_code == 200:
                            try:
                                import io, openpyxl, datetime
                                wb = openpyxl.load_workbook(io.BytesIO(d_resp.content), data_only=True)
                                out_lines = [f"=== PLANILHA: {fname} (ID: {fid}) | Abas: {', '.join(wb.sheetnames)} ==="]
                                sf = (sheet_filter or "").strip().lower()
                                target_sheets = [s for s in wb.sheetnames if not sf or sf in s.lower()] or wb.sheetnames
                                for sname in target_sheets:
                                    ws = wb[sname]
                                    out_lines.append(f"\n--- [ABA: {sname}] ---")
                                    # Detecta cabeçalhos de data/coluna na Linha 1 e dia da semana na Linha 2
                                    col_headers = {}
                                    col_weekdays = {}
                                    for c in range(1, min(38, ws.max_column + 1)):
                                        v1 = ws.cell(row=1, column=c).value
                                        v2 = ws.cell(row=2, column=c).value
                                        if isinstance(v1, (datetime.datetime, datetime.date)):
                                            col_headers[c] = v1.strftime("%d/%m/%Y")
                                        elif v1 is not None and str(v1).strip() != "":
                                            col_headers[c] = str(v1).strip()
                                        if v2 is not None and str(v2).strip() != "":
                                            col_weekdays[c] = str(v2).strip()

                                    is_schedule_matrix = len(col_headers) >= 5 and any("/202" in h for h in col_headers.values())
                                    rows_printed = 0
                                    for r in range(1, min(60, ws.max_row + 1)):
                                        if is_schedule_matrix and r in (1, 2):
                                            continue
                                        vals = []
                                        has_val = False
                                        for c in range(1, min(38, ws.max_column + 1)):
                                            v = ws.cell(row=r, column=c).value
                                            if v is not None and str(v).strip() != "":
                                                has_val = True
                                            if isinstance(v, (datetime.datetime, datetime.date)):
                                                cell_str = v.strftime("%d/%m/%Y")
                                            elif v is None:
                                                cell_str = ""
                                            else:
                                                cell_str = str(v).strip()
                                            if is_schedule_matrix and c in col_headers and cell_str != "":
                                                hdr = col_headers[c]
                                                wk = f" ({col_weekdays[c]})" if c in col_weekdays else ""
                                                vals.append(f"[{hdr}{wk}: {cell_str}]")
                                            else:
                                                vals.append(cell_str)
                                        if has_val:
                                            while vals and vals[-1] == "":
                                                vals.pop()
                                            out_lines.append(f"L{r:02d}: " + " | ".join([x for x in vals if x != ""]))
                                            rows_printed += 1
                                            if rows_printed >= 35:
                                                break
                                full_text = "\n".join(out_lines)
                                return full_text[:18000]
                            except Exception as ex:
                                logger.warning(f"Erro ao converter xlsx {fname} com openpyxl: {ex}")
                        # Fallback CSV para Google Sheets
                        if mtype == "application/vnd.google-apps.spreadsheet":
                            d_resp = requests.get(
                                f"https://www.googleapis.com/drive/v3/files/{fid}/export",
                                params={"mimeType": "text/csv"},
                                headers={"Authorization": f"Bearer {token}"},
                                timeout=20
                            )
                            return d_resp.text[:8000]
                    else:
                        # Arquivo binário/texto direto
                        d_resp = requests.get(
                            f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media&supportsAllDrives=true",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=20
                        )
                        return d_resp.text[:6000]
            except Exception as e:
                logger.warning(f"Erro na leitura nativa do Drive, usando fallback: {e}")

        # Fallback WebApp
        res = _call_drive_api("GET", {"action": "download", "name": file_id_or_name, "format": "text"})
        if "error" in res:
            return f"Erro ao ler arquivo do Drive: {res['error']}"
        content = res.get("content") or str(res)
        return str(content)[:6000]


# --- AUDITORIA DETERMINÍSTICA DE FECHAMENTO CONTÁBIL (GOOGLE DRIVE) ---
JVRIO_SHARED_DRIVE_ROOT_ID = os.getenv("ACCOUNTING_SHARED_DRIVE_ROOT_ID", "")
JVRIO_KNOWN_YEAR_FOLDERS = {
    "2026": os.getenv("ACCOUNTING_DRIVE_FOLDER_2026", ""),
}


def _norm_ascii(text: str) -> str:
    import unicodedata
    if not text:
        return ""
    return unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode("ascii").lower().strip()


def _iso_to_brt_str(iso_str: str) -> str:
    if not iso_str:
        return ""
    try:
        from datetime import datetime, timezone, timedelta
        brt = timezone(timedelta(hours=-3))
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00")).astimezone(brt)
        return dt.strftime("%d/%m/%Y %H:%M BRT")
    except Exception:
        return iso_str[:16]


def _resolve_jvrio_competencia(competencia: Optional[str] = None) -> Tuple[int, int, str, str]:
    """Retorna (year, month, 'YYYY.MM', 'YYYY_MM'). Padrão: mês anterior no fuso BRT."""
    import re
    from datetime import datetime, timezone, timedelta
    brt = timezone(timedelta(hours=-3))
    now_brt = datetime.now(brt)

    raw = (competencia or "").strip().lower()
    if raw and raw not in ("anterior", "auto", "mes_anterior", "mês anterior", "ultimo", "último"):
        m1 = re.search(r"(20\d{2})[.\-/_](\d{1,2})", raw)
        if m1:
            y, m = int(m1.group(1)), int(m1.group(2))
            if 1 <= m <= 12:
                return y, m, f"{y}.{m:02d}", f"{y}_{m:02d}"
        m2 = re.search(r"(\d{1,2})[.\-/_](20\d{2})", raw)
        if m2:
            m, y = int(m2.group(1)), int(m2.group(2))
            if 1 <= m <= 12:
                return y, m, f"{y}.{m:02d}", f"{y}_{m:02d}"

    if now_brt.month == 1:
        y, m = now_brt.year - 1, 12
    else:
        y, m = now_brt.year, now_brt.month - 1
    return y, m, f"{y}.{m:02d}", f"{y}_{m:02d}"


def _drive_list_children_raw(token: str, folder_id: str) -> list:
    resp = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        params={
            "q": f"'{folder_id}' in parents and trashed = false",
            "pageSize": 100,
            "fields": "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, shortcutDetails)",
            "orderBy": "name",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code == 200:
        return resp.json().get("files", [])
    raise RuntimeError(f"Drive API HTTP {resp.status_code}: {resp.text[:200]}")


def _build_drive_tree(token: str, folder_id: str, depth: int = 0, max_depth: int = 3) -> Tuple[list, list]:
    """Percorre recursivamente uma pasta do Drive retornando (tree_nodes, flat_files)."""
    if depth > max_depth:
        return [], []
    items = _drive_list_children_raw(token, folder_id)
    nodes = []
    flat_files = []
    for it in items:
        mtype = it.get("mimeType", "")
        shortcut_info = it.get("shortcutDetails") or {}
        is_shortcut = mtype == "application/vnd.google-apps.shortcut"
        target_mime = shortcut_info.get("targetMimeType", "")
        is_folder = (mtype == "application/vnd.google-apps.folder") or (
            is_shortcut and target_mime == "application/vnd.google-apps.folder"
        )
        target_folder_id = shortcut_info.get("targetId") if is_shortcut else it.get("id")
        raw_size = it.get("size")
        size_bytes = int(raw_size) if raw_size is not None and str(raw_size).isdigit() else None
        size_kb = round(size_bytes / 1024, 1) if size_bytes is not None else None

        node = {
            "id": it.get("id"),
            "name": it.get("name", ""),
            "mimeType": mtype,
            "is_folder": is_folder,
            "is_shortcut": is_shortcut,
            "size_bytes": size_bytes,
            "size_kb": size_kb,
            "created_brt": _iso_to_brt_str(it.get("createdTime", "")),
            "modified_brt": _iso_to_brt_str(it.get("modifiedTime", "")),
            "webViewLink": it.get("webViewLink", ""),
            "children": [],
            "descendant_files": [],
        }
        if is_folder and target_folder_id:
            child_nodes, child_files = _build_drive_tree(token, target_folder_id, depth + 1, max_depth)
            node["children"] = child_nodes
            node["descendant_files"] = child_files
            flat_files.extend(child_files)
        else:
            flat_files.append(node)
        nodes.append(node)
    return nodes, flat_files


def audit_jvrio_closing_folder(competencia: Optional[str] = None, persist_state: bool = False) -> Dict[str, Any]:
    """
    Audita de forma 100% determinística e recursiva a pasta mensal da contabilidade no Google Drive.
    Verifica as 7 subpastas/categorias obrigatórias e só retorna is_100_validated=True quando todas contêm arquivos válidos.
    """
    from datetime import datetime, timezone, timedelta
    brt = timezone(timedelta(hours=-3))
    now_brt_str = datetime.now(brt).strftime("%d/%m/%Y %H:%M:%S BRT")

    year, month, comp_dot, comp_key = _resolve_jvrio_competencia(competencia)
    token, email = get_workspace_access_token()
    if not token:
        return {
            "ok": False,
            "error": "Token OAuth do Google Workspace indisponível para auditar o Google Drive.",
            "competencia": comp_dot,
            "competencia_key": comp_key,
            "is_100_validated": False,
            "completion_pct": 0,
            "checked_at": now_brt_str,
        }

    try:
        # 1. Localiza pasta do ano (ex.: '2026')
        year_str = str(year)
        year_folder_id = JVRIO_KNOWN_YEAR_FOLDERS.get(year_str) or os.getenv(f"ACCOUNTING_DRIVE_FOLDER_{year_str}", "")
        if not year_folder_id:
            y_resp = requests.get(
                "https://www.googleapis.com/drive/v3/files",
                params={
                    "q": f"name = '{year_str}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                    "pageSize": 10,
                    "fields": "files(id, name, parents)",
                    "corpora": "allDrives",
                    "includeItemsFromAllDrives": "true",
                    "supportsAllDrives": "true",
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if y_resp.status_code == 200:
                y_files = y_resp.json().get("files", [])
                preferred = next((f for f in y_files if JVRIO_SHARED_DRIVE_ROOT_ID and JVRIO_SHARED_DRIVE_ROOT_ID in (f.get("parents") or [])), None)
                chosen = preferred or (y_files[0] if y_files else None)
                if chosen:
                    year_folder_id = chosen["id"]

        # 2. Localiza pasta da competência (ex.: '2026.10')
        month_folder = None
        if year_folder_id:
            m_resp = requests.get(
                "https://www.googleapis.com/drive/v3/files",
                params={
                    "q": f"'{year_folder_id}' in parents and name = '{comp_dot}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                    "pageSize": 5,
                    "fields": "files(id, name, webViewLink, createdTime, modifiedTime)",
                    "supportsAllDrives": "true",
                    "includeItemsFromAllDrives": "true",
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if m_resp.status_code == 200 and m_resp.json().get("files"):
                month_folder = m_resp.json()["files"][0]

        if not month_folder:
            m_global = requests.get(
                "https://www.googleapis.com/drive/v3/files",
                params={
                    "q": f"name = '{comp_dot}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                    "pageSize": 5,
                    "fields": "files(id, name, webViewLink, createdTime, modifiedTime)",
                    "corpora": "allDrives",
                    "includeItemsFromAllDrives": "true",
                    "supportsAllDrives": "true",
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=15,
            )
            if m_global.status_code == 200 and m_global.json().get("files"):
                month_folder = m_global.json()["files"][0]

        if not month_folder:
            result = {
                "ok": True,
                "competencia": comp_dot,
                "competencia_key": comp_key,
                "month_folder_found": False,
                "month_folder_id": None,
                "is_100_validated": False,
                "completion_pct": 0.0,
                "total_categories": 7,
                "completed_categories": 0,
                "total_files": 0,
                "categories": [],
                "missing_categories": [f"Pasta raiz da competência '{comp_dot}' ainda não foi criada no Google Drive"],
                "checked_at": now_brt_str,
            }
            if persist_state:
                _persist_jvrio_validation_setting(comp_key, result)
            return result

        month_folder_id = month_folder["id"]
        month_folder_link = month_folder.get("webViewLink") or f"https://drive.google.com/drive/folders/{month_folder_id}"

        # 3. Inspeção recursiva completa da árvore YYYY.MM
        tree_nodes, all_files = _build_drive_tree(token, month_folder_id, depth=0, max_depth=3)

        def is_non_empty_file(f_node: dict) -> bool:
            if f_node.get("is_folder"):
                return False
            # Google Docs/Sheets ou Shortcuts não trazem size em bytes na listagem simples
            if f_node.get("size_bytes") is not None and f_node["size_bytes"] <= 0:
                return False
            return True

        top_folders = [n for n in tree_nodes if n.get("is_folder")]

        def find_top_folder(keywords: list) -> Optional[dict]:
            for tf in top_folders:
                nn = _norm_ascii(tf["name"])
                if any(k in nn for k in keywords):
                    return tf
            return None

        saida_folder = find_top_folder(["notas de saida", "notas emitidas", "saida"])
        entrada_folder = find_top_folder(["notas de entrada", "compras", "pagamentos", "entrada"])
        extratos_folder = find_top_folder(["extratos", "extrato"])

        extrato_subfolders = [c for c in (extratos_folder.get("children", []) if extratos_folder else []) if c.get("is_folder")]

        def find_extrato_sub(keywords: list) -> Optional[dict]:
            for sf in extrato_subfolders:
                nn = _norm_ascii(sf["name"])
                if any(k in nn for k in keywords):
                    return sf
            # Fallback: caso esteja direto na raiz do mês
            return find_top_folder(keywords)

        santander_folder = find_extrato_sub(["santander"])
        getnet_folder = find_extrato_sub(["getnet", "stone", "adquirente", "maquininha"])
        cartoes_folder = find_extrato_sub(["fatura", "cartoes", "cartao"])
        delivery_folder = find_extrato_sub(["delivery", "ifood", "99"])
        erp_kw = os.getenv("ERP_FOLDER_KEYWORD", "erp").lower().strip()
        erp_folder = find_extrato_sub([erp_kw, "erp", "pdv", "sistema"])

        categories = []

        # 1. Notas de Saída (Vendas NFC-e + Remessas/Armazém)
        saida_files = [f for f in (saida_folder.get("descendant_files", []) if saida_folder else []) if is_non_empty_file(f)]
        nfce_files = [f for f in saida_files if any(k in _norm_ascii(f["name"]) for k in ["nfce", "emitidas", ".zip", ".xml"])]
        remessa_files = [f for f in saida_files if f not in nfce_files or any(k in _norm_ascii(f["name"]) for k in ["transferencia", "armazem", "remessa", "nf-", "nfe"])]
        cat1_ok = bool(saida_folder and len(nfce_files) >= 1)
        categories.append({
            "id": "notas_saida_vendas",
            "title": "1. Notas de Saída — Vendas (NFC-es ERP) & Remessas de Armazém",
            "folder_name": saida_folder["name"] if saida_folder else "Notas de Saída (vendas e transporte)",
            "folder_exists": bool(saida_folder),
            "complete": cat1_ok,
            "file_count": len(saida_files),
            "remessa_count": len(remessa_files),
            "files": saida_files,
            "missing_reason": "" if cat1_ok else "Subpasta 'Notas de Saída (vendas e transporte)' ausente ou sem arquivo ZIP/XML das NFC-es emitidas no mês.",
        })

        # 2. Notas de Entrada (Compras e Serviços)
        entrada_files = [f for f in (entrada_folder.get("descendant_files", []) if entrada_folder else []) if is_non_empty_file(f)]
        cat2_ok = bool(entrada_folder and len(entrada_files) >= 1)
        categories.append({
            "id": "notas_entrada_compras",
            "title": "2. Notas de Entrada — NFs de Compras e Serviços Tomados",
            "folder_name": entrada_folder["name"] if entrada_folder else "Notas de Entrada (compras)",
            "folder_exists": bool(entrada_folder),
            "complete": cat2_ok,
            "file_count": len(entrada_files),
            "files": entrada_files,
            "missing_reason": "" if cat2_ok else "Subpasta 'Notas de Entrada (compras)' ausente ou VAZIA (0 arquivos XML/PDF/ZIP de notas de compra enviados).",
        })

        # 3. Extrato Bancário Santander
        sant_files = [f for f in (santander_folder.get("descendant_files", []) if santander_folder else []) if is_non_empty_file(f)]
        cat3_ok = bool(santander_folder and len(sant_files) >= 1)
        categories.append({
            "id": "extrato_santander",
            "title": "3. Extratos Bancários — Conta PJ Santander (OFX/PDF/XLSX)",
            "folder_name": f"Extratos / {santander_folder['name']}" if santander_folder else "Extratos / Extrato Santander",
            "folder_exists": bool(santander_folder),
            "complete": cat3_ok,
            "file_count": len(sant_files),
            "files": sant_files,
            "missing_reason": "" if cat3_ok else "Subpasta 'Extratos / Extrato Santander' ausente ou sem extratos bancários anexados.",
        })

        # 4. Extratos Adquirente / Maquininhas (Getnet)
        getnet_files = [f for f in (getnet_folder.get("descendant_files", []) if getnet_folder else []) if is_non_empty_file(f)]
        cat4_ok = bool(getnet_folder and len(getnet_files) >= 1)
        categories.append({
            "id": "extratos_getnet",
            "title": "4. Extratos de Adquirentes & Maquininhas — Getnet (Vendas e Recebíveis)",
            "folder_name": f"Extratos / {getnet_folder['name']}" if getnet_folder else "Extratos / Extratos Getnet",
            "folder_exists": bool(getnet_folder),
            "complete": cat4_ok,
            "file_count": len(getnet_files),
            "files": getnet_files,
            "missing_reason": "" if cat4_ok else "Subpasta 'Extratos / Extratos Getnet' ausente ou sem relatórios de vendas/recebíveis.",
        })

        # 5. Faturas de Cartões
        cartoes_files = [f for f in (cartoes_folder.get("descendant_files", []) if cartoes_folder else []) if is_non_empty_file(f)]
        cat5_ok = bool(cartoes_folder and len(cartoes_files) >= 1)
        categories.append({
            "id": "faturas_cartoes",
            "title": "5. Faturas de Cartões de Crédito Corporativos",
            "folder_name": f"Extratos / {cartoes_folder['name']}" if cartoes_folder else "Extratos / Faturas cartões",
            "folder_exists": bool(cartoes_folder),
            "complete": cat5_ok,
            "file_count": len(cartoes_files),
            "files": cartoes_files,
            "missing_reason": "" if cat5_ok else "Subpasta 'Extratos / Faturas cartões' ausente ou sem faturas anexadas.",
        })

        # 6. Relatórios Delivery (iFood & 99Food)
        deliv_files = [f for f in (delivery_folder.get("descendant_files", []) if delivery_folder else []) if is_non_empty_file(f)]
        has_ifood = any("ifood" in _norm_ascii(f["name"]) for f in deliv_files)
        has_99 = any(("99" in _norm_ascii(f["name"]) or "dados da loja" in _norm_ascii(f["name"])) for f in deliv_files)
        cat6_ok = bool(delivery_folder and has_ifood and has_99)
        missing_deliv = []
        if not has_ifood:
            missing_deliv.append("relatório iFood")
        if not has_99:
            missing_deliv.append("relatório 99Food")
        categories.append({
            "id": "relatorios_delivery",
            "title": "6. Relatórios de Marketplaces / Delivery (iFood & 99Food)",
            "folder_name": f"Extratos / {delivery_folder['name']}" if delivery_folder else "Extratos / Relatórios Delivery (99, iFood)",
            "folder_exists": bool(delivery_folder),
            "complete": cat6_ok,
            "file_count": len(deliv_files),
            "files": deliv_files,
            "missing_reason": "" if cat6_ok else f"Subpasta 'Relatórios Delivery (99, iFood)' incompleta — faltando: {', '.join(missing_deliv) or 'arquivos da pasta'}.",
        })

        # 7. Relatórios ERP (Balcão & Entrega)
        nc_files = [f for f in (erp_folder.get("descendant_files", []) if erp_folder else []) if is_non_empty_file(f)]
        cat7_ok = bool(erp_folder and len(nc_files) >= 1)
        categories.append({
            "id": "relatorios_erp",
            "title": "7. Relatórios de Vendas Diárias — ERP (Balcão & Entrega)",
            "folder_name": f"Extratos / {erp_folder['name']}" if erp_folder else "Extratos / Relatórios ERP",
            "folder_exists": bool(erp_folder),
            "complete": cat7_ok,
            "file_count": len(nc_files),
            "files": nc_files,
            "missing_reason": "" if cat7_ok else "Subpasta 'Extratos / Relatórios ERP' ausente ou sem planilhas de vendas diárias.",
        })

        completed_count = sum(1 for c in categories if c["complete"])
        total_cats = len(categories)
        missing_cats = [f"{c['title']}: {c['missing_reason']}" for c in categories if not c["complete"]]
        is_100 = (completed_count == total_cats)
        pct = round((completed_count / total_cats) * 100, 1) if total_cats else 0.0
        valid_total_files = len([f for f in all_files if is_non_empty_file(f)])

        result = {
            "ok": True,
            "competencia": comp_dot,
            "competencia_key": comp_key,
            "year_folder_id": year_folder_id,
            "month_folder_found": True,
            "month_folder_id": month_folder_id,
            "month_folder_link": month_folder_link,
            "is_100_validated": is_100,
            "completion_pct": pct,
            "total_categories": total_cats,
            "completed_categories": completed_count,
            "total_files": valid_total_files,
            "categories": categories,
            "missing_categories": missing_cats,
            "checked_at": now_brt_str,
        }

        if persist_state:
            _persist_jvrio_validation_setting(comp_key, result)

        return result

    except Exception as e:
        logger.warning(f"Erro na auditoria determinística da pasta contábil ({comp_dot}): {e}")
        return {
            "ok": False,
            "error": str(e),
            "competencia": comp_dot,
            "competencia_key": comp_key,
            "is_100_validated": False,
            "completion_pct": 0.0,
            "checked_at": now_brt_str,
        }


def _persist_jvrio_validation_setting(comp_key: str, audit_result: Dict[str, Any]) -> None:
    try:
        from api.tasks_queue import set_setting
        payload = {
            "validated": bool(audit_result.get("is_100_validated")),
            "competencia": audit_result.get("competencia"),
            "completion_pct": audit_result.get("completion_pct", 0.0),
            "completed_categories": audit_result.get("completed_categories", 0),
            "total_categories": audit_result.get("total_categories", 7),
            "total_files": audit_result.get("total_files", 0),
            "month_folder_id": audit_result.get("month_folder_id"),
            "checked_at": audit_result.get("checked_at"),
        }
        set_setting(f"jvrio_closing_validated_{comp_key}", json.dumps(payload, ensure_ascii=False))
    except Exception as e:
        logger.warning(f"Não foi possível persistir estado de validação contábil ({comp_key}): {e}")


def is_jvrio_closing_already_validated(now_dt: Optional[Any] = None) -> Tuple[bool, str]:
    """
    Verifica se o fechamento contábil do mês anterior já foi 100% validado e confirmado.
    Usado pelo scheduler CRON (dias 1 a 5 às 09:00) para pular execuções redundantes após atingir 100%.
    """
    try:
        from api.tasks_queue import get_setting
        _, _, comp_dot, comp_key = _resolve_jvrio_competencia(None)
        raw = get_setting(f"jvrio_closing_validated_{comp_key}")
        if not raw:
            return False, f"Competência {comp_dot} ainda sem registro de validação 100%."
        saved = json.loads(raw)
        if not saved.get("validated"):
            return False, f"Competência {comp_dot} consta pendente ({saved.get('completion_pct', 0)}%)."

        # Faz rechecagem leve em tempo real na API do Drive para garantir que nenhum arquivo foi removido da pasta
        live = audit_jvrio_closing_folder(comp_dot, persist_state=False)
        if live.get("ok") and not live.get("is_100_validated"):
            _persist_jvrio_validation_setting(comp_key, live)
            return False, f"Competência {comp_dot} deixou de estar 100% completa no Drive ({live.get('completion_pct')}%)."

        return (
            True,
            f"Competência {comp_dot} já está 100% validada ({saved.get('total_files', live.get('total_files', 0))} arquivos conferidos em {saved.get('checked_at', 'auditoria anterior')}).",
        )
    except Exception as e:
        logger.warning(f"Erro ao checar trava de validação contábil: {e}")
        return False, str(e)


def format_jvrio_audit_report(audit_data: Dict[str, Any]) -> str:
    """Formata o resultado determinístico da auditoria da pasta contábil em Markdown estruturado."""
    if not audit_data.get("ok"):
        return f"❌ Erro ao auditar pasta da contabilidade no Google Drive: {audit_data.get('error', 'erro desconhecido')}"

    comp = audit_data.get("competencia", "")
    checked_at = audit_data.get("checked_at", "")
    if not audit_data.get("month_folder_found"):
        return (
            f"=== AUDITORIA DETERMINÍSTICA GOOGLE DRIVE — CONTABILIDADE (COMPETÊNCIA {comp}) ===\n"
            f"• Horário da Inspeção: {checked_at}\n"
            f"• Status Geral: ❌ PENDENTE (0%) — A pasta '{comp}' ainda NÃO foi encontrada dentro da pasta anual no Google Drive.\n"
        )

    status_str = (
        "✅ 100% COMPLETO E VALIDADO (PRONTO PARA A CONTABILIDADE)"
        if audit_data.get("is_100_validated")
        else f"⚠️ PACOTE INCOMPLETO / PENDENTE ({audit_data.get('completed_categories')}/{audit_data.get('total_categories')} categorias — {audit_data.get('completion_pct')}%)"
    )

    lines = [
        f"=== AUDITORIA DETERMINÍSTICA GOOGLE DRIVE — CONTABILIDADE (COMPETÊNCIA {comp}) ===",
        f"• Pasta Auditada: {comp} (ID: {audit_data.get('month_folder_id')} | Link: {audit_data.get('month_folder_link')})",
        f"• Horário da Inspeção na API do Drive: {checked_at}",
        f"• Total de Arquivos Válidos Encontrados: {audit_data.get('total_files')} arquivo(s)",
        f"• Status Determinístico do Pacote: {status_str}",
        "",
        "--- DETALHAMENTO POR SUBPASTA E ARQUIVOS REAIS NO GOOGLE DRIVE ---",
    ]

    for cat in audit_data.get("categories", []):
        badge = "✅ COMPLETO" if cat["complete"] else "❌ PENDENTE"
        lines.append(f"\n[{badge}] {cat['title']}")
        lines.append(f"  • Subpasta no Drive: '{cat['folder_name']}' ({'Encontrada' if cat['folder_exists'] else 'NÃO ENCONTRADA'}) | Arquivos: {cat['file_count']}")
        if cat["files"]:
            for f in cat["files"]:
                sz = f"{f['size_kb']} KB" if f.get("size_kb") is not None else "Atalho/Doc Drive"
                ts = f.get("created_brt") or f.get("modified_brt") or ""
                lines.append(f"    - {f['name']} ({sz} | Enviado: {ts})")
        if not cat["complete"] and cat.get("missing_reason"):
            lines.append(f"  • ⚠️ Pendência Detectada: {cat['missing_reason']}")

    if audit_data.get("missing_categories"):
        lines.append("\n--- 🚨 LISTA EXATA DE PENDÊNCIAS A REGULARIZAR ---")
        for m in audit_data["missing_categories"]:
            lines.append(f"  - {m}")
    else:
        lines.append(
            f"\n--- ✅ CONCLUSÃO DETERMINÍSTICA ---\n"
            f"Todas as {audit_data.get('total_categories')}/{audit_data.get('total_categories')} categorias obrigatórias da competência {comp} possuem arquivos válidos no Google Drive."
        )

    return "\n".join(lines)


class JVRioAccountingAuditInput(BaseModel):
    competencia: Optional[str] = Field(
        None,
        description="Competência a auditar no formato 'YYYY.MM' (ex: '2026.10'). Deixe vazio ou 'anterior' para auditar automaticamente o mês anterior.",
    )


class JVRioAccountingAuditTool(BaseTool):
    name: str = "jvrio_drive_folder_audit"
    description: str = (
        "Audita recursivamente a pasta oficial da contabilidade no Google Drive para a competência do mês anterior (ex: '2026' -> '2026.10'), "
        "listando todos os arquivos reais, tamanhos em KB e horários de upload dentro de 'Notas de Entrada (compras)', "
        "'Notas de Saída (vendas e transporte)' e das 5 subpastas de 'Extratos'. "
        "Retorna de forma 100% determinística se o pacote está COMPLETO ou PENDENTE."
    )
    args_schema: Type[BaseModel] = JVRioAccountingAuditInput

    def _run(self, competencia: Optional[str] = None) -> str:
        data = audit_jvrio_closing_folder(competencia=competencia, persist_state=False)
        return format_jvrio_audit_report(data)


# --- GMAIL TOOLS ---
DEFAULT_GMAIL_URL = os.environ.get("GOOGLE_APPS_SCRIPT_GMAIL_URL", "")
DEFAULT_GMAIL_KEY = os.environ.get("GMAIL_APP_KEY", "")

def _call_gmail_api(method: str, params_or_body: dict) -> dict:
    url = os.getenv("GOOGLE_APPS_SCRIPT_GMAIL_URL") or DEFAULT_GMAIL_URL
    key = os.getenv("GMAIL_APP_KEY") or DEFAULT_GMAIL_KEY
    if not url:
        return {"error": "GOOGLE_APPS_SCRIPT_GMAIL_URL não configurado e OAuth token indisponível."}
    data = dict(params_or_body)
    if key:
        data["key"] = key
    try:
        if method.upper() == "GET":
            resp = requests.get(url, params=data, timeout=30, allow_redirects=True)
        else:
            resp = requests.post(url, json=data, timeout=45, allow_redirects=True)
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"HTTP {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"error": str(e)}

class GmailSearchInput(BaseModel):
    query: str = Field(..., description="Filtro de busca padrão do Gmail (ex: 'is:unread', 'from:fornecedor@exemplo.com', 'subject:fatura').")
    limit: Optional[int] = Field(5, description="Quantidade máxima de e-mails para listar (padrão: 5).")

class GmailSearchTool(BaseTool):
    name: str = "gmail_search"
    description: str = "Pesquisa e lista e-mails recentes na caixa de entrada do Gmail por remetente, assunto ou status."
    args_schema: Type[BaseModel] = GmailSearchInput

    def _run(self, query: str, limit: int = 5) -> str:
        token, email = get_workspace_access_token()
        if token:
            try:
                resp = requests.get(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                    params={"q": query, "maxResults": min(limit, 10)},
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=15
                )
                if resp.status_code == 200:
                    messages = resp.json().get("messages", [])
                    if not messages:
                        return f"Nenhum e-mail encontrado no Gmail para a busca '{query}'."
                    out = []
                    for i, m in enumerate(messages, 1):
                        mid = m["id"]
                        m_resp = requests.get(
                            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}",
                            params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=8
                        )
                        if m_resp.status_code == 200:
                            m_data = m_resp.json()
                            headers = {h["name"]: h["value"] for h in m_data.get("payload", {}).get("headers", [])}
                            snippet = m_data.get("snippet", "")[:100]
                            out.append(
                                f"[{i}] ID: {mid} | De: {headers.get('From', 'Desconhecido')} | Assunto: {headers.get('Subject', 'Sem Assunto')} | Data: {headers.get('Date', '')} | Prévia: {snippet}"
                            )
                    return "\n".join(out)
            except Exception as e:
                logger.warning(f"Erro na pesquisa nativa do Gmail, usando fallback: {e}")

        # Fallback WebApp
        res = _call_gmail_api("GET", {"action": "search", "query": query, "limit": limit})
        if "error" in res:
            return f"Erro ao pesquisar e-mails no Gmail: {res['error']}"
        emails = res.get("results") or res.get("emails", [])
        if not emails:
            return f"Nenhum e-mail encontrado para a busca '{query}'."
        out = []
        for i, em in enumerate(emails, 1):
            out.append(
                f"[{i}] ID: {em.get('id')} | De: {em.get('from')} | Assunto: {em.get('subject')} | Data: {em.get('date')} | Previa: {em.get('snippet', '')[:100]}"
            )
        return "\n".join(out)

class GmailReadEmailInput(BaseModel):
    message_id: str = Field(..., description="ID da mensagem de e-mail (obtido através do gmail_search).")

class GmailReadEmailTool(BaseTool):
    name: str = "gmail_read_email"
    description: str = "Lê o conteúdo completo de um e-mail no Gmail corporativo a partir do seu ID."
    args_schema: Type[BaseModel] = GmailReadEmailInput

    def _run(self, message_id: str) -> str:
        token, email = get_workspace_access_token()
        mid = message_id.strip()
        if token:
            try:
                resp = requests.get(
                    f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{mid}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=15
                )
                if resp.status_code == 200:
                    m_data = resp.json()
                    headers = {h["name"]: h["value"] for h in m_data.get("payload", {}).get("headers", [])}
                    snippet = m_data.get("snippet", "")
                    
                    # Tenta extrair corpo de texto decodificando base64url
                    body_text = ""
                    payload = m_data.get("payload", {})
                    if "parts" in payload:
                        for part in payload["parts"]:
                            if part.get("mimeType") == "text/plain" and "data" in part.get("body", {}):
                                body_text = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")
                                break
                    elif "body" in payload and "data" in payload["body"]:
                        body_text = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")

                    final_body = body_text.strip() if body_text else snippet
                    return f"=== E-MAIL (ID: {mid}) ===\nDe: {headers.get('From')}\nPara: {headers.get('To')}\nData: {headers.get('Date')}\nAssunto: {headers.get('Subject')}\n\nConteúdo:\n{final_body[:3500]}"
            except Exception as e:
                logger.warning(f"Erro na leitura nativa do Gmail, usando fallback: {e}")

        # Fallback WebApp
        res = _call_gmail_api("GET", {"action": "read", "id": mid})
        if "error" in res:
            return f"Erro ao ler e-mail {message_id}: {res['error']}"
        subject = res.get("subject", "Sem Assunto")
        sender = res.get("from", "Desconhecido")
        to = res.get("to", "")
        date = res.get("date", "")
        body = res.get("body", res.get("snippet", ""))[:3000]
        return f"=== E-MAIL (ID: {message_id}) ===\nDe: {sender}\nPara: {to}\nData: {date}\nAssunto: {subject}\n\nConteúdo:\n{body}"

class GmailSendEmailInput(BaseModel):
    to: str = Field(..., description="E-mail do destinatário (ex: 'contato@empresa.com' ou lista separada por vírgula).")
    subject: str = Field(..., description="Assunto do e-mail.")
    body: str = Field(..., description="Corpo do e-mail em texto simples.")
    html: Optional[str] = Field(None, description="Corpo do e-mail formatado em HTML (opcional).")

class GmailSendEmailTool(BaseTool):
    name: str = "gmail_send_email"
    description: str = "Envia um e-mail corporativo diretamente através da conta oficial do Gmail."
    args_schema: Type[BaseModel] = GmailSendEmailInput

    def _run(self, to: str, subject: str, body: str, html: Optional[str] = None) -> str:
        clean_plain = body.strip()
        final_html = html.strip() if html else None
        try:
            from tools.telegram_tools import format_markdown_for_email
            conv_plain, conv_html = format_markdown_for_email(body)
            if conv_plain:
                clean_plain = conv_plain
            if not final_html and conv_html:
                final_html = conv_html
        except Exception as fmt_err:
            logger.debug(f"Erro ao converter Markdown para e-mail: {fmt_err}")

        token, email = get_workspace_access_token()
        if token:
            try:
                msg = MIMEMultipart("alternative")
                msg["To"] = to.strip()
                msg["Subject"] = subject.strip()
                msg["From"] = email or "me"
                msg.attach(MIMEText(clean_plain, "plain", "utf-8"))
                if final_html:
                    msg.attach(MIMEText(final_html, "html", "utf-8"))

                raw_bytes = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
                resp = requests.post(
                    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                    json={"raw": raw_bytes},
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    timeout=20
                )
                if resp.status_code == 200:
                    send_id = resp.json().get("id", "confirmado")
                    return f"✅ E-mail enviado com sucesso para '{to}' com o assunto '{subject}' via Google Workspace! (ID: {send_id})"
            except Exception as e:
                logger.warning(f"Erro no envio nativo do Gmail, usando fallback: {e}")

        # Fallback WebApp
        payload = {
            "action": "send",
            "to": to.strip(),
            "subject": subject.strip(),
            "body": clean_plain
        }
        if final_html:
            payload["html"] = final_html
        res = _call_gmail_api("POST", payload)
        if "error" in res:
            return f"Falha ao enviar e-mail para '{to}': {res['error']}"
        return f"✅ E-mail enviado com sucesso para '{to}' com o assunto '{subject}'! (ID: {res.get('id', 'confirmado')})"
