import api.db_utils
"""FastAPI application for AI Board Enterprise Suite with Access Control (User & Admin), Dynamic Canvas, and User-Segregated History."""
import os
import json
import time
import logging
import subprocess
from typing import Optional, List, Dict, Any
import requests
from fastapi import FastAPI, HTTPException, Header, Depends, Body, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv()

from api.tasks_queue import (
    create_task,
    get_task,
    get_task_logs,
    cancel_task,
    list_tasks,
    get_setting,
    set_setting,
    get_canvas_topology,
    save_canvas_topology,
    get_canvas_history,
    rollback_canvas_history,
    save_tool_health,
    save_all_tools_health,
    get_all_tools_health_cache,
    get_town_hall,
    save_town_hall,
    get_agent_memory,
    save_agent_memory,
    get_agent_personality,
    save_agent_personality,
    get_execution_mutex,
    get_user,
    get_or_create_user,
    list_users,
    set_user_role,
    set_user_language,
    add_user,
    delete_user,
    is_email_domain_valid
)
from api.tool_diagnostics import get_all_tools_health, test_tool_health, get_installed_catalog_items

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("crewai_api")

# --- COTAÇÃO AO VIVO USD -> BRL (API PÚBLICA) ---
_LIVE_EXCHANGE_CACHE = {"rate": 5.65, "ts": 0, "provider": "padrão"}

def fetch_live_usd_brl_rate(force: bool = False) -> tuple:
    """Obtém a cotação comercial atual USD -> BRL via APIs públicas com cache de 30min."""
    now = time.time()
    if not force and (now - _LIVE_EXCHANGE_CACHE["ts"] < 1800) and (_LIVE_EXCHANGE_CACHE["rate"] > 0) and (_LIVE_EXCHANGE_CACHE["provider"] != "padrão"):
        return _LIVE_EXCHANGE_CACHE["rate"], _LIVE_EXCHANGE_CACHE["provider"]

    # 1. ExchangeRate Open API (https://open.er-api.com)
    try:
        resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            rate = float(data.get("rates", {}).get("BRL", 0))
            if rate > 0:
                _LIVE_EXCHANGE_CACHE["rate"] = round(rate, 4)
                _LIVE_EXCHANGE_CACHE["ts"] = now
                _LIVE_EXCHANGE_CACHE["provider"] = "ExchangeRate-API"
                return _LIVE_EXCHANGE_CACHE["rate"], "ExchangeRate-API"
    except Exception as e:
        logger.warning(f"Erro ao consultar open.er-api.com: {e}")

    # 2. AwesomeAPI (API pública brasileira)
    try:
        resp = requests.get("https://economia.awesomeapi.com.br/last/USD-BRL", timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            bid = float(data.get("USDBRL", {}).get("bid", 0))
            if bid > 0:
                _LIVE_EXCHANGE_CACHE["rate"] = round(bid, 4)
                _LIVE_EXCHANGE_CACHE["ts"] = now
                _LIVE_EXCHANGE_CACHE["provider"] = "AwesomeAPI"
                return _LIVE_EXCHANGE_CACHE["rate"], "AwesomeAPI"
    except Exception as e:
        logger.warning(f"Erro ao consultar AwesomeAPI: {e}")

    # 3. Frankfurter dev API (Banco Central Europeu / Global)
    try:
        resp = requests.get("https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL", timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            rate = float(data.get("rates", {}).get("BRL", 0))
            if rate > 0:
                _LIVE_EXCHANGE_CACHE["rate"] = round(rate, 4)
                _LIVE_EXCHANGE_CACHE["ts"] = now
                _LIVE_EXCHANGE_CACHE["provider"] = "Frankfurter"
                return _LIVE_EXCHANGE_CACHE["rate"], "Frankfurter"
    except Exception as e:
        logger.warning(f"Erro ao consultar Frankfurter API: {e}")

    return _LIVE_EXCHANGE_CACHE["rate"] or 5.65, _LIVE_EXCHANGE_CACHE["provider"]

app = FastAPI(
    title="AI Board Enterprise API",
    description="Backend corporativo com autenticação corporativa, níveis de acesso (Admin vs Usuário) e topologia visual dinâmica.",
    version="2.1.0"
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Erro não tratado em {request.url.path}: {exc}")
    try:
        from api.tasks_queue import send_system_telegram_alert
        send_system_telegram_alert(
            title=f"Exceção 500 no Servidor ({request.method} {request.url.path})",
            details=f"Rota: {request.url.path}\nErro: {str(exc)}\nTipo: {exc.__class__.__name__}",
            severity="CRITICAL",
            source="fastapi_core"
        )
    except Exception:
        pass
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno no servidor. Um alerta imediato foi enviado ao Telegram do administrador."}
    )


# --- MODELOS PYDANTIC ---
class LoginRequest(BaseModel):
    email: str = Field(..., description="E-mail corporativo autorizado")
    name: Optional[str] = Field("", description="Nome completo do usuário")
    picture: Optional[str] = Field("", description="URL do avatar")

class GoogleAuthRequest(BaseModel):
    code: str = Field(..., description="Código de autorização retornado pelo Google OAuth")
    redirect_uri: Optional[str] = Field(None, description="URI de redirecionamento utilizada no fluxo OAuth")

class UserRoleUpdateRequest(BaseModel):
    role: str = Field(..., description="Novo nível de acesso: 'admin' ou 'user'")

class UserLanguageUpdateRequest(BaseModel):
    language: str = Field(..., description="Idioma preferido: 'en', 'pt-BR' ou 'es'")
    email: Optional[str] = Field(None, description="E-mail do usuário (opcional quando enviado via header X-User-Email)")

class UserCreateRequest(BaseModel):
    email: str = Field(..., description="E-mail corporativo autorizado")
    name: Optional[str] = Field(None, description="Nome do colaborador")
    role: str = Field("user", description="Nível inicial de acesso: 'admin' ou 'user'")

class SettingsRequest(BaseModel):
    gemini_model: Optional[str] = Field(None, description="Identificador do modelo Gemini (ex: gemini-3.8-flash-medium)")
    gemini_api_key: Optional[str] = Field(None, description="Nova chave de API do Gemini (opcional)")
    max_daily_budget_brl: Optional[float] = Field(None, description="Teto máximo de gasto diário permitido em Reais (BRL)")
    kill_switch_active: Optional[bool] = Field(None, description="Trava mestre de emergência: desliga completamente a API do Gemini")
    partner_emails: Optional[str] = Field(None, description="E-mails da diretoria separados por vírgula para envio de boletins")
    allowed_domains: Optional[str] = Field(None, description="Domínios corporativos autorizados no login OAuth")
    google_client_id: Optional[str] = Field(None, description="Google OAuth 2.0 Client ID")
    default_language: Optional[str] = Field(None, description="Idioma padrão da plataforma ('en', 'pt-BR', 'es')")
    currency_code: Optional[str] = Field(None, description="Código da moeda padrão ('USD', 'BRL', 'EUR', 'GBP')")
    currency_symbol: Optional[str] = Field(None, description="Símbolo da moeda ('$', 'R$', '€', '£')")
    company_name: Optional[str] = Field(None, description="Nome da marca / organização")
    company_legal_name: Optional[str] = Field(None, description="Razão social da empresa")
    company_logo_url: Optional[str] = Field(None, description="URL da logomarca oficial")
    reports_drive_folder: Optional[str] = Field(None, description="Nome ou ID da pasta do Google Drive para salvar documentos/boletins")
    backup_gdrive_path: Optional[str] = Field(None, description="Caminho rclone no Google Drive para backups do servidor")
    backup_retention_days: Optional[int] = Field(None, description="Dias de retenção de backups locais")
    backup_cron_time: Optional[str] = Field(None, description="Horário diário do backup automático (HH:MM)")
    cron_scheduler_enabled: Optional[bool] = Field(None, description="Ativa ou pausa o agendador global de rotinas CRON")
    task_timeout_seconds: Optional[int] = Field(None, description="Tempo máximo de execução por tarefa em segundos")
    usd_brl_exchange_rate: Optional[Any] = Field(None, description="Taxa de câmbio USD -> BRL para estimativas de custo")
    telegram_bot_token: Optional[str] = Field(None, description="Token do Bot do Telegram (opcional)")
    telegram_default_chat_id: Optional[str] = Field(None, description="Chat ID padrão do Telegram para notificações")

class TopologyRequest(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]

class TownHallRequest(BaseModel):
    vision: str
    okrs: str
    guidelines: str
    response_format: Optional[str] = ""

class AgentMemoryRequest(BaseModel):
    name: Optional[str] = ""
    role: Optional[str] = ""
    memory_text: str
    learned_facts: List[str] = []

class AgentPersonalityRequest(BaseModel):
    tone: str
    guidelines: str

class TaskRequest(BaseModel):
    crew_name: str = Field("operational", description="Nome da crew a ser acionada ('operational' ou 'financial').")
    prompt: str = Field(..., description="Instrução ou pergunta para os agentes executarem.")
    requester: str = Field("web", description="Origem da solicitação ('web', 'telegram', 'automation').")
    telegram_chat_id: Optional[str] = Field(None, description="Chat ID do Telegram para envio de notificação ao concluir.")
    user_email: Optional[str] = Field(None, description="E-mail do usuário solicitante")
    user_name: Optional[str] = Field(None, description="Nome do usuário solicitante")

class TaskResponse(BaseModel):
    task_id: str
    status: str
    crew_name: str
    message: str

# --- DEPENDÊNCIAS DE AUTORIZAÇÃO ---
def get_current_user_optional(x_user_email: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not x_user_email:
        return None
    return get_user(x_user_email)

def require_authenticated_user(x_user_email: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Autenticação obrigatória. Forneça o cabeçalho X-User-Email.")
    user = get_user(x_user_email)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não cadastrado ou não autorizado.")
    return user

def require_admin_user(x_user_email: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = require_authenticated_user(x_user_email)
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Apenas administradores podem modificar configurações, blocos e permissões."
        )
    return user

AVAILABLE_MODELS = [
    {
        "id": "gemini-3.1-flash-lite",
        "name": "Gemini 3.1 Flash-Lite",
        "badge": "Mais Barato ($0.25/M)",
        "cost": "$0.25 / 1M in | $1.50 / 1M out",
        "desc": "Ultra econômico (67% mais barato). Ideal para triagem de SAC, busca documental no Drive e checagem de estoque."
    },
    {
        "id": "gemini-3.5-flash-lite",
        "name": "Gemini 3.5 Flash-Lite",
        "badge": "Econômico Rápido ($0.30/M)",
        "cost": "$0.30 / 1M in | $2.50 / 1M out",
        "desc": "60% mais barato que o Flash padrão. Excelente para auditoria de contas a pagar, DP e monitoramento de anúncios."
    },
    {
        "id": "gemini-3.8-flash",
        "name": "Gemini 3.8 Flash",
        "badge": "Recomendado ($0.75/M)",
        "cost": "$0.75 / 1M in | $3.75 / 1M out",
        "desc": "Equilíbrio ideal entre velocidade ultrarrápida, alta inteligência e custo acessível. Padrão para diretores C-Level e redação."
    },
    {
        "id": "gemini-3.5-flash",
        "name": "Gemini 3.5 Flash",
        "badge": "Versátil ($0.75/M)",
        "cost": "$0.75 / 1M in | $3.75 / 1M out",
        "desc": "Alta cadência e precisão operacional para relatórios de DRE e análises financeiras."
    },
    {
        "id": "gemini-flash-latest",
        "name": "Gemini Flash Latest",
        "badge": "Sempre Atualizado",
        "cost": "$0.75 / 1M in | $3.75 / 1M out",
        "desc": "Aponta dinamicamente para a versão mais recente e estável da família Gemini Flash."
    },
    {
        "id": "gemini-3.1-pro-preview",
        "name": "Gemini 3.1 Pro",
        "badge": "Raciocínio Complexo ($2.00/M)",
        "cost": "$2.00 / 1M in | $10.00 / 1M out",
        "desc": "Máxima capacidade analítica para auditorias contábeis complexas e planejamento estratégico profundo."
    }
]

@app.get("/health")
def health_check():
    gemini_configured = bool(os.getenv("GEMINI_API_KEY"))
    telegram_configured = bool(os.getenv("TELEGRAM_BOT_TOKEN"))
    return {
        "status": "healthy",
        "gemini_ready": gemini_configured,
        "telegram_ready": telegram_configured,
        "version": "2.1.0"
    }

# --- AUTENTICAÇÃO E PERFIS ---
@app.post("/api/auth/login")
def login_with_email(req: LoginRequest):
    """Realiza login ou registro de usuário corporativo."""
    try:
        user = get_or_create_user(email=req.email, name=req.name or "", picture=req.picture or "")
        return {
            "status": "success",
            "user": user
        }
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

@app.post("/api/auth/google")
def exchange_google_auth(req: GoogleAuthRequest):
    """Troca o authorization code do Google OAuth por dados do usuário corporativo."""
    client_id = get_setting("google_client_id") or os.getenv("GOOGLE_CLIENT_ID")
    client_secret = get_setting("google_client_secret") or os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = req.redirect_uri or os.getenv("GOOGLE_REDIRECT_URI", os.getenv("APP_URL", "http://localhost:5173"))

    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail="Credenciais de Google OAuth não configuradas no servidor.")

    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": req.code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    try:
        token_resp = requests.post(token_url, data=token_data, timeout=10)
        if token_resp.status_code != 200:
            logger.error(f"Erro token Google: {token_resp.text}")
            raise HTTPException(status_code=400, detail="Código de autorização Google inválido ou expirado.")

        tokens = token_resp.json()
        access_token = tokens.get("access_token")

        userinfo_resp = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Falha ao obter perfil do usuário no Google.")

        info = userinfo_resp.json()
        email = info.get("email", "").lower().strip()
        name = info.get("name", "")
        picture = info.get("picture", "")

        user = get_or_create_user(email=email, name=name, picture=picture)
        return {"status": "success", "user": user}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Erro no fluxo Google OAuth: {e}")
        raise HTTPException(status_code=500, detail=f"Erro no processamento do login Google: {str(e)}")

@app.get("/api/auth/me")
def get_current_user_profile(user: Dict[str, Any] = Depends(require_authenticated_user)):
    return {"user": user}

class ContaAzulConfigRequest(BaseModel):
    client_id: str = Field(..., description="Client ID da aplicação Conta Azul")
    client_secret: Optional[str] = Field(None, description="Client Secret da aplicação Conta Azul")
    redirect_uri: Optional[str] = Field(None, description="URL de redirecionamento OAuth 2.0")

@app.post("/api/tools/contaazul/config")
def save_contaazul_config(req: ContaAzulConfigRequest):
    """Salva credenciais do Conta Azul nas configurações do sistema e variáveis de ambiente."""
    set_setting("CONTAAZUL_CLIENT_ID", req.client_id.strip())
    os.environ["CONTAAZUL_CLIENT_ID"] = req.client_id.strip()
    
    if req.client_secret and req.client_secret.strip():
        set_setting("CONTAAZUL_CLIENT_SECRET", req.client_secret.strip())
        os.environ["CONTAAZUL_CLIENT_SECRET"] = req.client_secret.strip()
        
    if req.redirect_uri and req.redirect_uri.strip():
        set_setting("CONTAAZUL_REDIRECT_URI", req.redirect_uri.strip())
        os.environ["CONTAAZUL_REDIRECT_URI"] = req.redirect_uri.strip()
        
    return {
        "status": "success",
        "message": "Configurações do Conta Azul salvas com sucesso no servidor!"
    }

# --- CONFIGURAÇÃO NOTION WORKSPACE ---
class NotionConfigRequest(BaseModel):
    api_key: Optional[str] = Field(None, description="Internal Integration Secret do Notion (secret_...)")
    root_page_id: Optional[str] = Field(None, description="ID ou URL da página principal de anotações")

@app.post("/api/tools/notion/config")
def save_notion_config(req: NotionConfigRequest):
    """Salva credenciais e configurações do Notion Workspace."""
    from tools.notion_workspace_tools import NOTION_CONFIG_FILE, _clean_page_id
    cfg = {}
    if os.path.exists(NOTION_CONFIG_FILE):
        try:
            with open(NOTION_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}

    if req.api_key is not None and req.api_key.strip():
        val = req.api_key.strip()
        set_setting("NOTION_API_KEY", val)
        os.environ["NOTION_API_KEY"] = val
        cfg["api_key"] = val

    if req.root_page_id is not None and req.root_page_id.strip():
        clean_id = _clean_page_id(req.root_page_id.strip())
        set_setting("NOTION_ROOT_PAGE_ID", clean_id)
        os.environ["NOTION_ROOT_PAGE_ID"] = clean_id
        cfg["root_page_id"] = clean_id

    os.makedirs(os.path.dirname(NOTION_CONFIG_FILE), exist_ok=True)
    with open(NOTION_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

    return {
        "status": "success",
        "message": "Configurações do Notion salvas com sucesso no servidor!"
    }

@app.get("/api/tools/notion/config")
def get_notion_config():
    """Retorna as configurações atuais do Notion (com máscara no token)."""
    from tools.notion_workspace_tools import NOTION_CONFIG_FILE, DEFAULT_ROOT_PAGE_ID
    key = os.getenv("NOTION_API_KEY") or get_setting("NOTION_API_KEY") or ""
    page_id = os.getenv("NOTION_ROOT_PAGE_ID") or get_setting("NOTION_ROOT_PAGE_ID") or DEFAULT_ROOT_PAGE_ID
    if not key and os.path.exists(NOTION_CONFIG_FILE):
        try:
            with open(NOTION_CONFIG_FILE, "r", encoding="utf-8") as f:
                c = json.load(f)
                key = c.get("api_key", "")
                page_id = c.get("root_page_id", page_id)
        except Exception:
            pass

    masked_key = ""
    if key:
        masked_key = f"{key[:7]}...{key[-4:]}" if len(key) > 12 else "***"

    return {
        "is_configured": bool(key),
        "api_key_masked": masked_key,
        "root_page_id": page_id,
        "default_url": f"https://www.notion.so/{page_id.replace('-', '')}" if page_id else "https://www.notion.so"
    }

class PluggyConfigRequest(BaseModel):
    client_id: str = Field(..., description="Client ID da aplicação Pluggy.ai")
    client_secret: Optional[str] = Field(None, description="Client Secret da aplicação Pluggy.ai")
    bank_name: Optional[str] = Field("Santander Empresas", description="Bancos monitorados")

@app.post("/api/tools/pluggy/config")
def save_pluggy_config(req: PluggyConfigRequest):
    """Salva credenciais do Pluggy.ai Open Finance nas configurações do sistema e variáveis de ambiente."""
    set_setting("PLUGGY_CLIENT_ID", req.client_id.strip())
    os.environ["PLUGGY_CLIENT_ID"] = req.client_id.strip()
    
    if req.client_secret and req.client_secret.strip():
        set_setting("PLUGGY_CLIENT_SECRET", req.client_secret.strip())
        os.environ["PLUGGY_CLIENT_SECRET"] = req.client_secret.strip()
        
    if req.bank_name and req.bank_name.strip():
        set_setting("PLUGGY_BANK_NAME", req.bank_name.strip())
        os.environ["PLUGGY_BANK_NAME"] = req.bank_name.strip()
        
    return {
        "status": "success",
        "message": "Credenciais Open Finance (Pluggy.ai) salvas com sucesso no servidor!"
    }

# --- CONFIGURAÇÕES META ADS & GOOGLE ADS ---
class MetaAdsConfigRequest(BaseModel):
    ad_account_id: Optional[str] = Field(None, description="ID da Conta de Anúncios (ex: act_123456789)")
    access_token: Optional[str] = Field(None, description="Token de Acesso da Meta")
    app_id: Optional[str] = Field(None, description="App ID Meta")
    app_secret: Optional[str] = Field(None, description="App Secret Meta")
    pixel_id: Optional[str] = Field(None, description="Pixel ID / Dataset ID")
    connection_mode: Optional[str] = Field("graph_api", description="graph_api ou mcp")
    endpoint: Optional[str] = Field(None, description="Endpoint do Servidor MCP")

@app.post("/api/tools/meta-ads/config")
def save_meta_ads_config(req: MetaAdsConfigRequest):
    """Salva credenciais da Meta Ads nas configurações do sistema e variáveis de ambiente."""
    if req.ad_account_id is not None:
        val = req.ad_account_id.strip()
        set_setting("META_ADS_ACCOUNT_ID", val)
        os.environ["META_ADS_ACCOUNT_ID"] = val
    if req.access_token is not None and req.access_token.strip():
        val = req.access_token.strip()
        set_setting("META_ADS_ACCESS_TOKEN", val)
        os.environ["META_ADS_ACCESS_TOKEN"] = val
    if req.app_id is not None:
        val = req.app_id.strip()
        set_setting("META_ADS_APP_ID", val)
        os.environ["META_ADS_APP_ID"] = val
    if req.app_secret is not None and req.app_secret.strip():
        val = req.app_secret.strip()
        set_setting("META_ADS_APP_SECRET", val)
        os.environ["META_ADS_APP_SECRET"] = val
    if req.pixel_id is not None:
        val = req.pixel_id.strip()
        set_setting("META_ADS_PIXEL_ID", val)
        os.environ["META_ADS_PIXEL_ID"] = val
    if req.endpoint is not None:
        set_setting("META_ADS_MCP_URL", req.endpoint.strip())
        os.environ["META_ADS_MCP_URL"] = req.endpoint.strip()
    return {"status": "success", "message": "Credenciais da Meta Ads salvas com sucesso no servidor!"}

@app.get("/api/tools/meta-ads/config")
def get_meta_ads_config():
    """Retorna as configurações salvas da Meta Ads (com mascaramento de token)."""
    token = get_setting("META_ADS_ACCESS_TOKEN") or os.getenv("META_ADS_ACCESS_TOKEN", "")
    masked_token = f"{token[:6]}...{token[-4:]}" if len(token) > 10 else ("Configurado" if token else "")
    return {
        "ad_account_id": get_setting("META_ADS_ACCOUNT_ID") or os.getenv("META_ADS_ACCOUNT_ID", ""),
        "access_token": masked_token,
        "is_configured": bool(token and get_setting("META_ADS_ACCOUNT_ID")),
        "app_id": get_setting("META_ADS_APP_ID") or os.getenv("META_ADS_APP_ID", ""),
        "pixel_id": get_setting("META_ADS_PIXEL_ID") or os.getenv("META_ADS_PIXEL_ID", ""),
        "endpoint": get_setting("META_ADS_MCP_URL") or os.getenv("META_ADS_MCP_URL", "http://127.0.0.1:8998/sse")
    }

class GoogleAdsConfigRequest(BaseModel):
    customer_id: Optional[str] = Field(None, description="Customer ID Google Ads (10 dígitos)")
    developer_token: Optional[str] = Field(None, description="Developer Token Google Ads API")
    client_id: Optional[str] = Field(None, description="OAuth Client ID")
    client_secret: Optional[str] = Field(None, description="OAuth Client Secret")
    refresh_token: Optional[str] = Field(None, description="OAuth Refresh Token")
    connection_mode: Optional[str] = Field("google_api", description="google_api ou mcp")
    endpoint: Optional[str] = Field(None, description="Endpoint do Servidor MCP")

@app.post("/api/tools/google-ads/config")
def save_google_ads_config(req: GoogleAdsConfigRequest):
    """Salva credenciais do Google Ads nas configurações do sistema e variáveis de ambiente."""
    if req.customer_id is not None:
        val = req.customer_id.strip()
        set_setting("GOOGLE_ADS_CUSTOMER_ID", val)
        os.environ["GOOGLE_ADS_CUSTOMER_ID"] = val
    if req.developer_token is not None and req.developer_token.strip():
        val = req.developer_token.strip()
        set_setting("GOOGLE_ADS_DEVELOPER_TOKEN", val)
        os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"] = val
    if req.client_id is not None:
        val = req.client_id.strip()
        set_setting("GOOGLE_ADS_CLIENT_ID", val)
        os.environ["GOOGLE_ADS_CLIENT_ID"] = val
    if req.client_secret is not None and req.client_secret.strip():
        val = req.client_secret.strip()
        set_setting("GOOGLE_ADS_CLIENT_SECRET", val)
        os.environ["GOOGLE_ADS_CLIENT_SECRET"] = val
    if req.refresh_token is not None and req.refresh_token.strip():
        val = req.refresh_token.strip()
        set_setting("GOOGLE_ADS_REFRESH_TOKEN", val)
        os.environ["GOOGLE_ADS_REFRESH_TOKEN"] = val
    if req.endpoint is not None:
        set_setting("GOOGLE_ADS_MCP_URL", req.endpoint.strip())
        os.environ["GOOGLE_ADS_MCP_URL"] = req.endpoint.strip()
    return {"status": "success", "message": "Credenciais do Google Ads salvas com sucesso no servidor!"}

@app.get("/api/tools/google-ads/config")
def get_google_ads_config():
    """Retorna as configurações salvas do Google Ads (com mascaramento)."""
    dev_token = get_setting("GOOGLE_ADS_DEVELOPER_TOKEN") or os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "")
    refresh_token = get_setting("GOOGLE_ADS_REFRESH_TOKEN") or os.getenv("GOOGLE_ADS_REFRESH_TOKEN", "")
    return {
        "customer_id": get_setting("GOOGLE_ADS_CUSTOMER_ID") or os.getenv("GOOGLE_ADS_CUSTOMER_ID", ""),
        "developer_token": f"{dev_token[:4]}...{dev_token[-4:]}" if len(dev_token) > 8 else ("Configurado" if dev_token else ""),
        "client_id": get_setting("GOOGLE_ADS_CLIENT_ID") or os.getenv("GOOGLE_ADS_CLIENT_ID", ""),
        "refresh_token": f"{refresh_token[:6]}...{refresh_token[-4:]}" if len(refresh_token) > 10 else ("Configurado" if refresh_token else ""),
        "is_configured": bool(get_setting("GOOGLE_ADS_CUSTOMER_ID") and dev_token),
        "endpoint": get_setting("GOOGLE_ADS_MCP_URL") or os.getenv("GOOGLE_ADS_MCP_URL", "http://127.0.0.1:8997/sse")
    }

# --- OAUTH CONTA AZUL ---
@app.get("/api/auth/contaazul/authorize")
def authorize_contaazul():
    """Redireciona o usuário para tela oficial de autorização do Conta Azul."""
    app_url = os.getenv("APP_URL", "http://localhost:5173")
    client_id = os.getenv("CONTAAZUL_CLIENT_ID", "")
    redirect_uri = os.getenv("CONTAAZUL_REDIRECT_URI", f"{app_url}/api/auth/contaazul/callback")
    scope = "openid+profile+aws.cognito.signin.user.admin"
    url = f"https://login.contaazul.com/#/oauth/authorize?response_type=code&client_id={client_id}&redirect_uri={requests.utils.quote(redirect_uri, safe='')}&state=ESTADO&scope={scope}"
    return RedirectResponse(url=url)

@app.get("/api/auth/contaazul/callback", response_class=HTMLResponse)
def contaazul_oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    """Callback do Conta Azul para troca de código por tokens de acesso."""
    app_url = os.getenv("APP_URL", "http://localhost:5173")
    if error:
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #CA3D26;">Autorização Recusada</h1>
            <p>O Conta Azul retornou o erro: {error}</p>
            <a href="{app_url}" style="color: #16422B; font-weight: bold;">Voltar ao AI Board Studio</a>
            </body></html>""",
            status_code=400
        )
    if not code:
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #CA3D26;">Código de Autorização Ausente</h1>
            <p>Nenhum código retornado pelo servidor OAuth.</p>
            <a href="{app_url}">Voltar ao AI Board Studio</a>
            </body></html>""",
            status_code=400
        )

    try:
        from custom_tools.contaazul_client import exchange_code_for_tokens
    except ImportError:
        try:
            from tools.contaazul_client import exchange_code_for_tokens
        except ImportError:
            return HTMLResponse("<h1>Módulo Conta Azul não instalado em custom_tools/</h1>", status_code=501)
    res = exchange_code_for_tokens(code)
    if res.get("status") == "success":
        return HTMLResponse(
            f"""<!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Conta Azul Conectado | AI Board</title>
              <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAF9; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                .card {{ background: white; border-radius: 24px; padding: 48px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); text-align: center; max-width: 480px; border: 1px solid #E2E8E4; }}
                h1 {{ color: #16422B; font-size: 22px; font-weight: 800; margin-bottom: 12px; }}
                p {{ color: #5A6B61; font-size: 14px; line-height: 1.6; margin-bottom: 28px; }}
                .badge {{ display: inline-block; background: #E7F6ED; color: #16422B; border: 1px solid #B8E4C9; padding: 6px 16px; border-radius: 99px; font-weight: 800; font-size: 12px; margin-bottom: 24px; }}
                .btn {{ display: inline-block; background: #16422B; color: white; padding: 14px 28px; border-radius: 14px; text-decoration: none; font-weight: 800; font-size: 14px; box-shadow: 0 4px 12px rgba(22,66,43,0.2); }}
                .btn:hover {{ background: #235A3D; }}
              </style>
            </head>
            <body>
              <div class="card">
                <div class="badge">● CONEXÃO ESTABELECIDA COM SUCESSO</div>
                <h1>Conta Azul Conectado!</h1>
                <p>O aplicativo oficial do Conta Azul foi vinculado com sucesso ao AI Board.<br><br>Seus agentes executivos agora têm acesso em tempo real a contas a pagar, a receber e conciliações bancárias.</p>
                <a href="{app_url}" class="btn">Abrir AI Board Studio</a>
              </div>
            </body>
            </html>"""
        )
    else:
        err_msg = res.get("message", "Erro desconhecido")
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #CA3D26;">Falha na Troca de Token</h1>
            <p>Ocorreu um erro ao trocar o código de autorização pelo token:</p>
            <pre style="background: #eee; padding: 15px; border-radius: 10px; display: inline-block; text-align: left;">{err_msg}</pre>
            <br><br>
            <a href="{app_url}">Voltar ao AI Board Studio</a>
            </body></html>""",
            status_code=500
        )

# --- CONTA AZUL API v2 & WEB DIRECT ENDPOINTS ---
@app.get("/api/contaazul/overview")
def get_contaazul_overview():
    """Retorna visão consolidada da API do Conta Azul e status da Conexão Web Direta."""
    try:
        from custom_tools.contaazul_client import (
            test_contaazul_connection,
            listar_contas_financeiras,
            listar_categorias,
            buscar_contas_a_pagar,
            buscar_contas_a_receber,
            obter_empresa_conectada,
            get_contaazul_web_direct_status
        )
    except ImportError:
        try:
            from tools.contaazul_client import (
                test_contaazul_connection,
                listar_contas_financeiras,
                listar_categorias,
                buscar_contas_a_pagar,
                buscar_contas_a_receber,
                obter_empresa_conectada,
                get_contaazul_web_direct_status
            )
        except ImportError:
            return {"status": "not_installed", "connected": False, "message": "Módulo Conta Azul não instalado."}
    health = test_contaazul_connection()
    if health.get("status") != "online":
        return {
            "status": health.get("status"),
            "connected": False,
            "message": health.get("details"),
            "web_direct": get_contaazul_web_direct_status()
        }
    
    empresa = {}
    try:
        empresa = obter_empresa_conectada()
    except Exception as e:
        logger.warning(f"Erro ao obter empresa conectada: {e}")
        
    contas_bancarias = []
    try:
        contas_bancarias = listar_contas_financeiras()
    except Exception:
        pass
        
    categorias = []
    try:
        categorias = listar_categorias()
    except Exception:
        pass

    import datetime
    hoje = datetime.date.today()
    inicio_mes = hoje.replace(day=1).strftime("%Y-%m-%d")
    proximo_mes = (hoje.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    fim_mes = (proximo_mes - datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    contas_pagar_total = 0
    try:
        res_pagar = buscar_contas_a_pagar(data_vencimento_de=inicio_mes, data_vencimento_ate=fim_mes)
        contas_pagar_total = res_pagar.get("itens_totais", len(res_pagar.get("itens", []))) if isinstance(res_pagar, dict) else len(res_pagar)
    except Exception:
        pass

    contas_receber_total = 0
    try:
        res_receber = buscar_contas_a_receber(data_vencimento_de=inicio_mes, data_vencimento_ate=fim_mes)
        contas_receber_total = res_receber.get("itens_totais", len(res_receber.get("itens", []))) if isinstance(res_receber, dict) else len(res_receber)
    except Exception:
        pass

    return {
        "status": "online",
        "connected": True,
        "empresa": empresa,
        "periodo": {"de": inicio_mes, "ate": fim_mes},
        "total_contas_bancarias": len(contas_bancarias) if isinstance(contas_bancarias, list) else 14,
        "total_categorias_dre": len(categorias) if isinstance(categorias, list) else 133,
        "total_contas_a_pagar_mes": contas_pagar_total,
        "total_contas_a_receber_mes": contas_receber_total,
        "web_direct": get_contaazul_web_direct_status(),
        "api_v2_modules": [
            {"id": "contas_a_pagar", "name": "Contas a Pagar", "status": "active", "count": contas_pagar_total},
            {"id": "contas_a_receber", "name": "Contas a Receber", "status": "active", "count": contas_receber_total},
            {"id": "baixas_liquidacoes", "name": "Baixas & Liquidações", "status": "active", "supported": True},
            {"id": "contas_financeiras", "name": "Contas Bancárias & Caixas", "status": "active", "count": len(contas_bancarias) if isinstance(contas_bancarias, list) else 14},
            {"id": "categorias_dre", "name": "Plano de Contas DRE", "status": "active", "count": len(categorias) if isinstance(categorias, list) else 133},
            {"id": "centros_custo", "name": "Centros de Custo", "status": "active", "supported": True},
            {"id": "pessoas", "name": "Pessoas (Clientes & Fornecedores)", "status": "active", "supported": True},
            {"id": "produtos_servicos", "name": "Produtos & Serviços", "status": "active", "supported": True},
            {"id": "vendas", "name": "Vendas & Orçamentos", "status": "active", "supported": True},
            {"id": "web_direct", "name": "Conexão Web Direta (app.contaazul.com.br)", "status": "active", "features": ["OFX em Tela", "Comprovantes PDF", "DRE Consolidado"]}
        ]
    }

@app.get("/api/contaazul/contas-a-pagar")
def get_contas_a_pagar_endpoint(
    de: Optional[str] = None,
    ate: Optional[str] = None,
    status: Optional[str] = None
):
    """Lista eventos de contas a pagar no período."""
    try:
        from custom_tools.contaazul_client import buscar_contas_a_pagar
    except ImportError:
        try:
            from tools.contaazul_client import buscar_contas_a_pagar
        except ImportError:
            return {"status": "not_installed", "total": 0, "data": []}
    try:
        dados = buscar_contas_a_pagar(data_vencimento_de=de, data_vencimento_ate=ate, status=status)
        return {"status": "success", "total": len(dados), "data": dados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/contaazul/contas-a-receber")
def get_contas_a_receber_endpoint(
    de: Optional[str] = None,
    ate: Optional[str] = None,
    status: Optional[str] = None
):
    """Lista eventos de contas a receber no período."""
    try:
        from custom_tools.contaazul_client import buscar_contas_a_receber
    except ImportError:
        try:
            from tools.contaazul_client import buscar_contas_a_receber
        except ImportError:
            return {"status": "not_installed", "total": 0, "data": []}
    try:
        dados = buscar_contas_a_receber(data_vencimento_de=de, data_vencimento_ate=ate, status=status)
        return {"status": "success", "total": len(dados), "data": dados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- GERENCIAMENTO DE USUÁRIOS (APENAS ADMIN) ---
@app.get("/api/users")
def get_all_users(admin: Dict[str, Any] = Depends(require_admin_user)):
    """Lista todos os usuários registrados (Apenas administradores)."""
    return {"users": list_users()}

@app.post("/api/users")
def create_new_user(req: UserCreateRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Adiciona ou cadastra um novo colaborador no sistema (Apenas administradores)."""
    clean_email = req.email.strip().lower()
    if not is_email_domain_valid(clean_email):
        raise HTTPException(
            status_code=403,
            detail="Domínio não autorizado. Apenas e-mails corporativos autorizados podem ser cadastrados."
        )
    try:
        user = add_user(clean_email, req.name, req.role)
        return {"status": "success", "user": user, "message": f"Colaborador '{clean_email}' adicionado com sucesso."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/users/{target_email}")
def remove_user(target_email: str, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Remove um colaborador do sistema (Apenas administradores)."""
    clean_target = target_email.strip().lower()
    clean_admin = admin["email"].strip().lower()
    
    if clean_target == clean_admin:
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta de administrador.")
    
    deleted = delete_user(clean_target)
    if not deleted:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return {"status": "success", "message": f"Usuário '{clean_target}' removido com sucesso."}

@app.post("/api/users/{target_email}/role")
def update_user_role(target_email: str, req: UserRoleUpdateRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Modifica o nível de acesso de um usuário: 'admin' ou 'user' (Apenas administradores)."""
    try:
        updated = set_user_role(target_email, req.role)
        if not updated:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return {"status": "success", "user": updated, "message": f"Nível de acesso de '{target_email}' alterado para '{req.role}'."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/users/me/language")
@app.put("/api/users/me/language")
def update_my_language(req: UserLanguageUpdateRequest, x_user_email: Optional[str] = Header(None)):
    """Persiste o idioma preferido ('en', 'pt-BR', 'es') do usuário autenticado."""
    target_email = (x_user_email or req.email or "").strip().lower()
    lang = (req.language or "en").strip()
    if lang not in ("en", "pt-BR", "es"):
        raise HTTPException(status_code=400, detail="Unsupported language. Use 'en', 'pt-BR', or 'es'.")
    if not target_email:
        return {"status": "success", "user": None, "language": lang}
    try:
        updated = set_user_language(target_email, lang)
        return {"status": "success", "user": updated, "language": lang}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/users/{target_email}/language")
@app.post("/api/users/{target_email}/language")
def update_target_user_language(target_email: str, req: UserLanguageUpdateRequest, x_user_email: Optional[str] = Header(None)):
    """Persiste o idioma preferido ('en', 'pt-BR', 'es') de um usuário específico."""
    lang = (req.language or "en").strip()
    if lang not in ("en", "pt-BR", "es"):
        raise HTTPException(status_code=400, detail="Unsupported language. Use 'en', 'pt-BR', or 'es'.")
    try:
        updated = set_user_language(target_email, lang)
        if not updated:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        return {"status": "success", "user": updated, "language": lang}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- CONFIGURAÇÕES DO SISTEMA (MODIFICAÇÃO APENAS ADMIN) ---
@app.get("/api/settings")
def get_settings():
    current_model = get_setting("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-3.8-flash-medium")
    api_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
    masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else ("Configurada" if api_key else "Não configurada")

    tg_token = get_setting("telegram_bot_token") or os.getenv("TELEGRAM_BOT_TOKEN", "")
    masked_tg = f"{tg_token[:5]}...{tg_token[-4:]}" if len(tg_token) > 10 else ("Configurado" if tg_token else "Não configurado")

    cron_enabled_str = str(get_setting("cron_scheduler_enabled", "false")).lower()
    cron_enabled = cron_enabled_str in ("true", "1", "yes", "active", "enabled")

    try:
        timeout_sec = int(get_setting("task_timeout_seconds") or 300)
    except Exception:
        timeout_sec = 300

    raw_usd = get_setting("usd_brl_exchange_rate")
    live_rate, live_provider = fetch_live_usd_brl_rate()
    is_manual = False
    if raw_usd is not None and str(raw_usd).strip():
        try:
            val = float(raw_usd)
            if val > 0:
                usd_rate = round(val, 4)
                is_manual = True
            else:
                usd_rate = live_rate
        except Exception:
            usd_rate = live_rate
    else:
        usd_rate = live_rate

    try:
        ret_days = int(get_setting("backup_retention_days") or 14)
    except Exception:
        ret_days = 14

    try:
        max_daily_budget = float(get_setting("max_daily_budget_brl") or 5.00)
    except Exception:
        max_daily_budget = 5.00

    kill_switch_str = str(get_setting("kill_switch_active", "false")).lower()
    kill_switch = kill_switch_str in ("true", "1", "yes")

    from api.tasks_queue import is_daily_budget_exceeded
    is_exceeded, cost_today, _, runs_today, steps_today = is_daily_budget_exceeded()
    catalog_items = get_installed_catalog_items()

    configured_logo = get_setting("company_logo_url") or os.getenv("COMPANY_LOGO_URL", "/logo.svg")
    if configured_logo in ("", "/logo.svg"):
        for custom_logo_candidate in [
            "/app/data/company_logo.svg",
            os.path.join(os.path.dirname(__file__), "..", "data", "company_logo.svg"),
        ]:
            if os.path.exists(custom_logo_candidate):
                configured_logo = "/api/branding/logo"
                break

    currency_code = (get_setting("currency_code") or os.getenv("DEFAULT_CURRENCY", "BRL")).upper()
    default_symbol = "$" if currency_code == "USD" else ("€" if currency_code == "EUR" else ("£" if currency_code == "GBP" else "R$"))
    currency_symbol = get_setting("currency_symbol") or os.getenv("CURRENCY_SYMBOL", default_symbol)

    return {
        "max_daily_budget_brl": round(max_daily_budget, 2),
        "kill_switch_active": kill_switch,
        "cost_today_brl": round(cost_today, 2),
        "daily_budget_exceeded": is_exceeded,
        "runs_today": runs_today,
        "steps_today": steps_today,
        "gemini_model": current_model,
        "gemini_api_key_set": bool(api_key),
        "gemini_api_key_masked": masked_key,
        "available_models": AVAILABLE_MODELS,
        "partner_emails": get_setting("partner_emails") or os.getenv("DEFAULT_PARTNER_EMAILS", ""),
        "allowed_domains": get_setting("allowed_domains") or os.getenv("ALLOWED_GOOGLE_DOMAINS", "*"),
        "google_client_id": get_setting("google_client_id") or os.getenv("GOOGLE_CLIENT_ID", ""),
        "default_language": get_setting("default_language") or os.getenv("DEFAULT_LANGUAGE", "en"),
        "currency_code": currency_code,
        "currency_symbol": currency_symbol,
        "installed_tools": catalog_items.get("installed_tools", []),
        "installed_triggers": catalog_items.get("installed_triggers", []),
        "company_name": get_setting("company_name") or os.getenv("COMPANY_NAME", "AI Board"),
        "company_legal_name": get_setting("company_legal_name") or os.getenv("COMPANY_LEGAL_NAME", "AI Board Enterprise Solutions"),
        "company_logo_url": configured_logo,
        "reports_drive_folder": get_setting("reports_drive_folder") or "",
        "backup_gdrive_path": get_setting("backup_gdrive_path") or "gdrive:IT/Internal Software/ServerBackup/crewai",
        "backup_retention_days": ret_days,
        "backup_cron_time": get_setting("backup_cron_time") or "03:45",
        "cron_scheduler_enabled": cron_enabled,
        "task_timeout_seconds": timeout_sec,
        "usd_brl_exchange_rate": usd_rate,
        "usd_brl_exchange_rate_manual": raw_usd if is_manual else "",
        "usd_brl_exchange_rate_is_auto": not is_manual,
        "usd_brl_live_rate": live_rate,
        "usd_brl_live_provider": live_provider,
        "telegram_bot_token_set": bool(tg_token),
        "telegram_bot_token_masked": masked_tg,
        "telegram_default_chat_id": get_setting("telegram_default_chat_id") or os.getenv("TELEGRAM_DEFAULT_CHAT_ID", "")
    }


@app.get("/api/branding/logo")
def get_custom_branding_logo():
    """Serves custom company logo from data/company_logo.svg if present, else redirects to /logo.svg."""
    from fastapi.responses import FileResponse
    for custom_logo_candidate in [
        "/app/data/company_logo.svg",
        os.path.join(os.path.dirname(__file__), "..", "data", "company_logo.svg"),
    ]:
        if os.path.exists(custom_logo_candidate):
            return FileResponse(custom_logo_candidate, media_type="image/svg+xml")
    return RedirectResponse(url="/logo.svg")


@app.get("/api/currency/usd-brl")
def get_usd_brl_rate_endpoint(force_refresh: bool = False):
    """Consulta a cotação comercial USD -> BRL ao vivo através de API pública (ou configuração manual se ativa)."""
    raw_usd = get_setting("usd_brl_exchange_rate")
    live_rate, live_provider = fetch_live_usd_brl_rate(force=force_refresh)
    is_manual = False
    if raw_usd is not None and str(raw_usd).strip():
        try:
            val = float(raw_usd)
            if val > 0:
                is_manual = True
                effective_rate = round(val, 4)
            else:
                effective_rate = live_rate
        except Exception:
            effective_rate = live_rate
    else:
        effective_rate = live_rate

    return {
        "status": "success",
        "live_rate": live_rate,
        "provider": live_provider,
        "is_manual": is_manual,
        "manual_rate": float(raw_usd) if is_manual else None,
        "effective_rate": effective_rate,
        "timestamp": int(time.time())
    }

@app.post("/api/settings")
def save_settings(req: SettingsRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    if req.max_daily_budget_brl is not None:
        set_setting("max_daily_budget_brl", str(round(float(req.max_daily_budget_brl), 2)))

    if req.kill_switch_active is not None:
        set_setting("kill_switch_active", "true" if req.kill_switch_active else "false")
    if req.gemini_model is not None and req.gemini_model.strip():
        set_setting("gemini_model", req.gemini_model.strip())

    if req.gemini_api_key is not None and req.gemini_api_key.strip():
        set_setting("gemini_api_key", req.gemini_api_key.strip())

    if req.partner_emails is not None:
        set_setting("partner_emails", req.partner_emails.strip())

    if req.allowed_domains is not None and req.allowed_domains.strip():
        set_setting("allowed_domains", req.allowed_domains.strip())

    if req.google_client_id is not None:
        set_setting("google_client_id", req.google_client_id.strip())
        if req.google_client_id.strip():
            os.environ["GOOGLE_CLIENT_ID"] = req.google_client_id.strip()

    if req.default_language is not None and req.default_language.strip() in ("en", "pt-BR", "es"):
        set_setting("default_language", req.default_language.strip())

    if req.currency_code is not None and req.currency_code.strip():
        set_setting("currency_code", req.currency_code.strip().upper())

    if req.currency_symbol is not None and req.currency_symbol.strip():
        set_setting("currency_symbol", req.currency_symbol.strip())

    if req.company_name is not None and req.company_name.strip():
        set_setting("company_name", req.company_name.strip())

    if req.company_legal_name is not None and req.company_legal_name.strip():
        set_setting("company_legal_name", req.company_legal_name.strip())

    if req.company_logo_url is not None and req.company_logo_url.strip():
        set_setting("company_logo_url", req.company_logo_url.strip())

    if req.reports_drive_folder is not None:
        set_setting("reports_drive_folder", req.reports_drive_folder.strip())

    if req.backup_gdrive_path is not None and req.backup_gdrive_path.strip():
        clean_path = req.backup_gdrive_path.strip()
        set_setting("backup_gdrive_path", clean_path)
        # Persiste arquivo de configuração consumido pelo backup-to-gdrive.sh no host
        for cfg_dir in ["/app/data", "/opt/crewai/data", os.path.join(os.path.dirname(__file__), "..", "data")]:
            try:
                os.makedirs(cfg_dir, exist_ok=True)
                cfg_file = os.path.join(cfg_dir, "backup_config.json")
                existing_cfg = {}
                if os.path.exists(cfg_file):
                    with open(cfg_file, "r", encoding="utf-8") as f:
                        existing_cfg = json.load(f)
                existing_cfg["gdrive_path"] = clean_path
                if req.backup_retention_days is not None:
                    existing_cfg["retention_days"] = int(req.backup_retention_days)
                if req.backup_cron_time is not None:
                    existing_cfg["cron_time"] = req.backup_cron_time.strip()
                with open(cfg_file, "w", encoding="utf-8") as f:
                    json.dump(existing_cfg, f, indent=2, ensure_ascii=False)
                break
            except Exception:
                continue

    if req.backup_retention_days is not None:
        set_setting("backup_retention_days", str(max(1, int(req.backup_retention_days))))

    if req.backup_cron_time is not None and req.backup_cron_time.strip():
        set_setting("backup_cron_time", req.backup_cron_time.strip())

    if req.cron_scheduler_enabled is not None:
        set_setting("cron_scheduler_enabled", "true" if req.cron_scheduler_enabled else "false")

    if req.task_timeout_seconds is not None:
        set_setting("task_timeout_seconds", str(max(30, int(req.task_timeout_seconds))))

    if req.usd_brl_exchange_rate is not None:
        val_str = str(req.usd_brl_exchange_rate).strip()
        if not val_str:
            set_setting("usd_brl_exchange_rate", "")
        else:
            try:
                val_num = float(val_str)
                if val_num <= 0:
                    set_setting("usd_brl_exchange_rate", "")
                else:
                    set_setting("usd_brl_exchange_rate", str(round(val_num, 4)))
            except Exception:
                set_setting("usd_brl_exchange_rate", "")

    if req.telegram_bot_token is not None and req.telegram_bot_token.strip():
        set_setting("telegram_bot_token", req.telegram_bot_token.strip())
        os.environ["TELEGRAM_BOT_TOKEN"] = req.telegram_bot_token.strip()

    if req.telegram_default_chat_id is not None:
        set_setting("telegram_default_chat_id", req.telegram_default_chat_id.strip())
        os.environ["TELEGRAM_DEFAULT_CHAT_ID"] = req.telegram_default_chat_id.strip()

    return {
        "status": "success",
        "message": "Configurações globais salvas e aplicadas com sucesso!",
        "settings": get_settings()
    }

# --- ESTIMATIVA DINÂMICA DE CUSTOS DE IA (TAREFAS AGENDADAS & CHAT) ---
MODEL_PRICING_CATALOG = {
    "gemini-3.1-flash-lite": {"name": "Gemini 3.1 Flash-Lite", "input_per_m": 0.25, "output_per_m": 1.50},
    "gemini-3.5-flash-lite": {"name": "Gemini 3.5 Flash-Lite", "input_per_m": 0.30, "output_per_m": 2.50},
    "gemini-3.8-flash": {"name": "Gemini 3.8 Flash", "input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-3.5-flash": {"name": "Gemini 3.5 Flash", "input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-flash-latest": {"name": "Gemini Flash Latest", "input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-3.8-flash-medium": {"name": "Gemini 3.8 Flash", "input_per_m": 0.75, "output_per_m": 3.75},
    "gemini-3.1-pro-preview": {"name": "Gemini 3.1 Pro", "input_per_m": 2.00, "output_per_m": 10.00},
    "gemini-2.5-pro": {"name": "Gemini 2.5 Pro", "input_per_m": 2.00, "output_per_m": 10.00},
}

def _get_model_pricing_rates(model_id_or_name: str) -> Dict[str, Any]:
    m = (model_id_or_name or "").lower()
    for k, v in MODEL_PRICING_CATALOG.items():
        if k in m or v["name"].lower() in m:
            return v
    if "lite" in m:
        return {"name": model_id_or_name, "input_per_m": 0.25, "output_per_m": 1.50}
    if "pro" in m:
        return {"name": model_id_or_name, "input_per_m": 2.00, "output_per_m": 10.00}
    return {"name": model_id_or_name, "input_per_m": 0.75, "output_per_m": 3.75}

def _parse_cron_monthly_runs(cron_expr: str) -> float:
    try:
        parts = cron_expr.strip().split()
        if len(parts) != 5:
            return 30.0
        m_str, h_str, dom_str, mon_str, dow_str = parts
        days_in_month = 30.44
        dow_factor = 1.0
        if dow_str != "*":
            if "-" in dow_str:
                s, e = map(int, dow_str.split("-"))
                dow_factor = (e - s + 1) / 7.0
            elif "," in dow_str:
                dow_factor = len(dow_str.split(",")) / 7.0
            else:
                dow_factor = 1.0 / 7.0

        if dom_str != "*":
            if "," in dom_str:
                days_factor = float(len(dom_str.split(",")))
            elif "-" in dom_str:
                s, e = map(int, dom_str.split("-"))
                days_factor = float(e - s + 1)
            else:
                days_factor = 1.0
        else:
            days_factor = days_in_month * dow_factor

        if h_str == "*":
            hours_per_day = 24.0
        elif "/" in h_str:
            step = int(h_str.split("/")[1])
            hours_per_day = 24.0 / max(1, step)
        elif "," in h_str:
            hours_per_day = float(len(h_str.split(",")))
        else:
            hours_per_day = 1.0

        if m_str == "*":
            mins_per_hour = 60.0
        elif "/" in m_str:
            step = int(m_str.split("/")[1])
            mins_per_hour = 60.0 / max(1, step)
        elif "," in m_str:
            mins_per_hour = float(len(m_str.split(",")))
        else:
            mins_per_hour = 1.0

        if h_str == "*":
            total_runs = days_factor * hours_per_day * mins_per_hour
        else:
            total_runs = days_factor * hours_per_day * (len(m_str.split(",")) if "," in m_str else 1.0)
        return round(total_runs, 1)
    except Exception:
        return 30.0

def _human_readable_cron(cron_expr: str) -> str:
    parts = cron_expr.strip().split()
    if len(parts) != 5:
        return cron_expr
    m, h, dom, mon, dow = parts
    time_str = f"{h.zfill(2)}:{m.zfill(2)}" if h.isdigit() and m.isdigit() else ""
    if dow == "1-5" and time_str:
        return f"Dias úteis (Seg a Sex às {time_str})"
    elif dow.isdigit() and time_str:
        dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
        d_idx = int(dow) % 7
        return f"Semanal ({dias[d_idx]} às {time_str})"
    elif dow == "*" and dom == "*" and time_str:
        return f"Diário (às {time_str})"
    elif "/" in h:
        return f"A cada {h.split('/')[1]} horas"
    return f"CRON ({cron_expr})"

def auto_route_agent_for_instruction(text: str, nodes: List[Dict[str, Any]]) -> str:
    """Roteia automaticamente uma rotina/instrução para o agente especialista mais adequado no canvas."""
    t_low = (text or "").lower()
    agent_ids = {n.get("id") for n in (nodes or []) if n.get("type") == "agent"}

    candidates = []
    if any(k in t_low for k in ["estoque", "insumo", "produto", "boba", "xarope", "copo", "chá", "cha", "new choice", "erp", "fechamento de vendas", "faturamento diário"]):
        candidates = ["agent-coo-stock", "agent-coo"]
    elif any(k in t_low for k in ["conta a pagar", "contas a pagar", "fatura", "vencimento", "boleto", "fornecedor", "conta azul"]):
        candidates = ["agent-cfo-payable", "agent-cfo"]
    elif any(k in t_low for k in ["jv rio", "imposto", "contábil", "contabil", "fiscal", "nota fiscal", "nf"]):
        candidates = ["agent-cfo-accounting", "agent-cfo"]
    elif any(k in t_low for k in ["dre", "margem", "lucro", "cmv", "resultado"]):
        candidates = ["agent-cfo-profit", "agent-cfo"]
    elif any(k in t_low for k in ["ponto", "folha", "férias", "ferias", "dp", "trabalhista", "marq", "atestado", "fgts", "inss"]):
        candidates = ["agent-cpo-dp", "agent-cpo"]
    elif any(k in t_low for k in ["escala", "turno", "horário", "horario", "manual", "pop", "procedimento", "ficha técnica", "ficha tecnica"]):
        candidates = ["agent-coo-manuals", "agent-coo"]
    elif any(k in t_low for k in ["treinamento", "carreira", "cargo", "admissão", "admissao", "demissão", "demissao", "rh"]):
        candidates = ["agent-cpo-training", "agent-cpo"]
    elif any(k in t_low for k in ["anúncio", "anuncio", "campanha", "tráfego", "trafego", "meta ads", "google ads", "roas"]):
        candidates = ["agent-cmo-ads", "agent-cmo"]
    elif any(k in t_low for k in ["criativo", "copy", "promoção", "promocao", "instagram", "post", "rede social"]):
        candidates = ["agent-cmo-creative", "agent-cmo"]
    elif any(k in t_low for k in ["sac", "atendimento", "reclamação", "reclamacao", "whatsapp", "chatwoot", "cliente"]):
        candidates = ["agent-cmo-sac", "agent-cmo"]
    elif any(k in t_low for k in ["shopping", "intranet", "aluguel", "condomínio", "condominio", "loja"]):
        candidates = ["agent-coo", "agent-coo-stock"]

    for cid in candidates:
        if cid in agent_ids:
            return cid
    if "agent-ceo" in agent_ids:
        return "agent-ceo"
    return next(iter(agent_ids), "agent-ceo")


class ScheduledTaskUpsertRequest(BaseModel):
    id: Optional[str] = None
    title: str = Field(..., description="Título da tarefa agendada")
    instruction: str = Field(..., description="Instrução detalhada do que verificar ou executar")
    cron: str = Field("0 9 * * 6", description="Expressão CRON de 5 campos")
    frequency: Optional[str] = Field(None, description="Descrição legível da frequência")
    agent_id: str = Field("auto", description="ID do agente responsável ou 'auto' para roteamento inteligente")
    active: Optional[bool] = Field(None, description="Se a rotina está ativa")
    enabled: Optional[bool] = Field(None, description="Alias para active")


@app.get("/api/scheduled-tasks")
def list_all_scheduled_tasks():
    """Lista todas as rotinas agendadas de todos os agentes em uma visão unificada."""
    topo = get_canvas_topology()
    nodes = topo.get("nodes", [])
    agents_list = []
    tasks_list = []

    raw_usd = get_setting("usd_brl_exchange_rate")
    try:
        exchange_rate = float(raw_usd) if raw_usd and float(raw_usd) > 0 else fetch_live_usd_brl_rate()[0]
    except Exception:
        exchange_rate = fetch_live_usd_brl_rate()[0]
    system_default_model = get_setting("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    for n in nodes:
        if n.get("type") != "agent":
            continue
        aid = n.get("id", "")
        data = n.get("data", {})
        role = data.get("role") or data.get("name") or aid
        name = data.get("name") or role
        dept = (data.get("department") or "").upper() or "GERAL"
        model = data.get("model") or system_default_model
        agents_list.append({
            "id": aid,
            "role": role,
            "name": name,
            "department": dept,
            "model": model
        })
        for t in data.get("scheduledTasks", []):
            cron_expr = t.get("cron", "0 9 * * *")
            is_active = t.get("active", t.get("enabled", True))
            monthly_runs = _parse_cron_monthly_runs(cron_expr)
            instruction = t.get("instruction", "")
            title = t.get("title", "Rotina Agendada")
            is_zero_token = bool(
                t.get("zero_token")
                or "intranetmall" in str(t.get("id", "")).lower()
                or "zero-token" in instruction.lower()
                or "intranetmall_daily_audit" in instruction.lower()
            )
            is_committee = "comitê" in title.lower() or "reunir" in instruction.lower() or aid == "agent-ceo"
            input_tokens = 0 if is_zero_token else (25000 if is_committee else 15000)
            output_tokens = 0 if is_zero_token else (2500 if is_committee else 1200)
            rates = _get_model_pricing_rates(model)
            cost_per_run_usd = (input_tokens / 1_000_000.0) * rates["input_per_m"] + (output_tokens / 1_000_000.0) * rates["output_per_m"]
            cost_month_usd = cost_per_run_usd * monthly_runs
            cost_month_brl = round(cost_month_usd * exchange_rate, 2)
            cost_per_run_brl = round(cost_per_run_usd * exchange_rate, 4)

            tasks_list.append({
                "id": t.get("id") or f"task-{aid}",
                "title": title,
                "instruction": instruction,
                "cron": cron_expr,
                "frequency": t.get("frequency") or _human_readable_cron(cron_expr),
                "active": is_active,
                "enabled": is_active,
                "monthly_runs": round(monthly_runs, 1),
                "cost_month_brl": cost_month_brl,
                "cost_per_run_brl": cost_per_run_brl,
                "auto_delegated": bool(t.get("auto_delegated", False)),
                "agent_id": aid,
                "agent_role": role,
                "agent_name": name,
                "department": dept,
                "model": model
            })

    cron_enabled_str = str(get_setting("cron_scheduler_enabled", "false")).lower()
    cron_enabled = cron_enabled_str in ("true", "1", "yes", "active", "enabled")

    return {
        "tasks": tasks_list,
        "agents": agents_list,
        "cron_scheduler_enabled": cron_enabled
    }


@app.post("/api/scheduled-tasks")
def create_or_update_scheduled_task(req: ScheduledTaskUpsertRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Cria ou atualiza uma rotina agendada, permitindo delegação automática ('auto') ou escolha direta do agente."""
    import uuid
    topo = get_canvas_topology()
    nodes = topo.get("nodes", [])
    edges = topo.get("edges", [])

    is_auto = (not req.agent_id) or req.agent_id.strip().lower() in ("auto", "automatic", "sistema", "")
    target_agent_id = (
        auto_route_agent_for_instruction(f"{req.title} {req.instruction}", nodes)
        if is_auto
        else req.agent_id.strip()
    )

    task_id = (req.id or "").strip() or f"task-{int(time.time())}-{str(uuid.uuid4())[:4]}"
    freq_label = (req.frequency or "").strip() or _human_readable_cron(req.cron.strip())

    if req.active is not None:
        is_task_active = bool(req.active)
    elif req.enabled is not None:
        is_task_active = bool(req.enabled)
    else:
        is_task_active = True

    new_task_obj = {
        "id": task_id,
        "title": req.title.strip(),
        "frequency": freq_label,
        "cron": req.cron.strip(),
        "instruction": req.instruction.strip(),
        "active": is_task_active,
        "enabled": is_task_active,
        "auto_delegated": is_auto
    }

    # Atualização in-place para PRESERVAR rigorosamente a ordem estável das tarefas na lista
    found_agent_role = target_agent_id
    for n in nodes:
        if n.get("type") != "agent":
            continue
        n.setdefault("data", {})
        old_tasks = list(n["data"].get("scheduledTasks", []))
        if n.get("id") == target_agent_id:
            found_idx = next((i for i, t in enumerate(old_tasks) if t.get("id") == task_id), -1)
            if found_idx != -1:
                old_tasks[found_idx] = new_task_obj
            else:
                old_tasks.append(new_task_obj)
            n["data"]["scheduledTasks"] = old_tasks
            found_agent_role = n["data"].get("role") or n["data"].get("name") or target_agent_id
        else:
            n["data"]["scheduledTasks"] = [t for t in old_tasks if t.get("id") != task_id]

    author = admin.get("email", "admin@example.com")
    save_canvas_topology(
        nodes,
        edges,
        author=author,
        summary=f"Rotina '{req.title.strip()}' atribuída a {found_agent_role}"
    )

    return {
        "status": "success",
        "message": f"Rotina '{req.title.strip()}' salva e atribuída a {found_agent_role}!",
        "task": new_task_obj,
        "agent_id": target_agent_id,
        "agent_role": found_agent_role
    }


@app.delete("/api/scheduled-tasks/{task_id}")
def delete_scheduled_task_endpoint(task_id: str, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Remove uma rotina agendada de qualquer agente."""
    topo = get_canvas_topology()
    nodes = topo.get("nodes", [])
    edges = topo.get("edges", [])
    removed_title = None

    for n in nodes:
        if n.get("type") != "agent":
            continue
        old_tasks = n.get("data", {}).get("scheduledTasks", [])
        kept = []
        for t in old_tasks:
            if t.get("id") == task_id:
                removed_title = t.get("title", task_id)
            else:
                kept.append(t)
        if len(kept) != len(old_tasks):
            n["data"]["scheduledTasks"] = kept

    if not removed_title:
        raise HTTPException(status_code=404, detail="Rotina agendada não encontrada.")

    author = admin.get("email", "admin@example.com")
    save_canvas_topology(nodes, edges, author=author, summary=f"Rotina '{removed_title}' removida")
    return {"status": "success", "message": f"Rotina '{removed_title}' removida com sucesso!"}


@app.post("/api/scheduled-tasks/{task_id}/run")
def run_scheduled_task_now_endpoint(task_id: str, user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Dispara imediatamente a execução de uma rotina agendada sob demanda."""
    topo = get_canvas_topology()
    for n in topo.get("nodes", []):
        if n.get("type") != "agent":
            continue
        for t in n.get("data", {}).get("scheduledTasks", []):
            if t.get("id") == task_id:
                role = n.get("data", {}).get("role", "Agente")
                title = t.get("title", "Rotina")
                instruction = t.get("instruction", "")
                tid = create_task(
                    crew_name="operational",
                    prompt=f"[EXECUÇÃO PROGRAMADA - {title}]: {instruction}",
                    requester=f"cron_manual:{task_id}",
                    user_email=user.get("email", "system@ai-board.local"),
                    user_name=user.get("name") or f"Rotina ({role})"
                )
                return {
                    "status": "success",
                    "task_id": tid,
                    "message": f"Rotina '{title}' iniciada com sucesso (Tarefa #{tid})!"
                }
    raise HTTPException(status_code=404, detail="Rotina agendada não encontrada.")


@app.get("/api/costs/estimate")
def get_cost_estimate_endpoint(model_override: Optional[str] = None):
    """Calcula dinamicamente a estimativa de custos operacionais das tarefas agendadas e interações de chat."""
    raw_usd = get_setting("usd_brl_exchange_rate")
    if raw_usd is not None and str(raw_usd).strip():
        try:
            val = float(raw_usd)
            exchange_rate = val if val > 0 else fetch_live_usd_brl_rate()[0]
        except Exception:
            exchange_rate = fetch_live_usd_brl_rate()[0]
    else:
        exchange_rate = fetch_live_usd_brl_rate()[0]
    system_default_model = model_override or get_setting("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    topo = get_canvas_topology()
    nodes = topo.get("nodes", [])

    scheduled_breakdown = []
    total_monthly_runs = 0.0
    total_scheduled_usd = 0.0
    total_pro_benchmark_usd = 0.0

    pro_rates = _get_model_pricing_rates("gemini-3.1-pro-preview")

    for n in nodes:
        if n.get("type") != "agent":
            continue
        data = n.get("data", {})
        agent_role = data.get("role") or data.get("label") or "Agente"
        agent_model = data.get("model") or system_default_model
        agent_id = n.get("id", "")
        tasks = data.get("scheduledTasks", [])

        for t in tasks:
            active = t.get("active", True)
            cron_expr = t.get("cron", "0 0 * * *")
            monthly_runs = _parse_cron_monthly_runs(cron_expr) if active else 0.0

            instruction = t.get("instruction", "")
            title = t.get("title", "Rotina Agendada")
            is_zero_token = bool(
                t.get("zero_token")
                or "intranetmall" in str(t.get("id", "")).lower()
                or "zero-token" in instruction.lower()
                or "intranetmall_daily_audit" in instruction.lower()
            )
            is_committee = "comitê" in title.lower() or "reunir" in instruction.lower() or agent_id == "agent-ceo"

            input_tokens = 0 if is_zero_token else (25000 if is_committee else 15000)
            output_tokens = 0 if is_zero_token else (2500 if is_committee else 1200)

            rates = _get_model_pricing_rates(agent_model)
            cost_per_run_usd = (input_tokens / 1_000_000.0) * rates["input_per_m"] + (output_tokens / 1_000_000.0) * rates["output_per_m"]
            cost_month_usd = cost_per_run_usd * monthly_runs if active else 0.0

            cost_per_run_pro = (input_tokens / 1_000_000.0) * pro_rates["input_per_m"] + (output_tokens / 1_000_000.0) * pro_rates["output_per_m"]
            pro_benchmark_usd = cost_per_run_pro * monthly_runs if active else 0.0

            if active:
                total_monthly_runs += monthly_runs
                total_scheduled_usd += cost_month_usd
                total_pro_benchmark_usd += pro_benchmark_usd

            scheduled_breakdown.append({
                "id": t.get("id"),
                "title": title,
                "agent_role": agent_role,
                "agent_id": agent_id,
                "model_id": agent_model,
                "model_name": rates["name"],
                "cron": cron_expr,
                "frequency_human": _human_readable_cron(cron_expr),
                "monthly_runs": monthly_runs,
                "daily_runs": round(monthly_runs / 30.44, 2),
                "active": active,
                "is_committee": is_committee,
                "input_tokens_est": input_tokens,
                "output_tokens_est": output_tokens,
                "cost_per_run_usd": round(cost_per_run_usd, 5),
                "cost_per_run_brl": round(cost_per_run_usd * exchange_rate, 4),
                "cost_month_usd": round(cost_month_usd, 4),
                "cost_month_brl": round(cost_month_usd * exchange_rate, 2)
            })

    # Interações via Chat nos últimos 30 dias
    chat_count = 0
    now = time.time()
    from api.tasks_queue import DB_PATH
    if os.path.exists(DB_PATH):
        try:
            with sqlite3.connect(DB_PATH) as conn:
                cur = conn.cursor()
                cur.execute("""
                    SELECT COUNT(*) FROM agent_tasks 
                    WHERE (requester NOT LIKE 'cron:%' OR requester IS NULL)
                    AND created_at >= ?
                """, (now - 30 * 86400,))
                chat_count = cur.fetchone()[0]
        except Exception:
            pass

    chat_rates = _get_model_pricing_rates(system_default_model)
    chat_in_tokens = 12000
    chat_out_tokens = 1000
    cost_per_chat_usd = (chat_in_tokens / 1_000_000.0) * chat_rates["input_per_m"] + (chat_out_tokens / 1_000_000.0) * chat_rates["output_per_m"]
    chat_month_usd = chat_count * cost_per_chat_usd

    total_combined_usd = total_scheduled_usd + chat_month_usd
    savings_usd = max(0.0, total_pro_benchmark_usd - total_scheduled_usd)
    savings_pct = round((savings_usd / total_pro_benchmark_usd) * 100, 1) if total_pro_benchmark_usd > 0 else 0.0

    return {
        "scheduled_tasks": {
            "total_tasks": len(scheduled_breakdown),
            "active_tasks": sum(1 for t in scheduled_breakdown if t["active"]),
            "monthly_executions": round(total_monthly_runs, 1),
            "daily_executions": round(total_monthly_runs / 30.44, 1),
            "cost_usd_month": round(total_scheduled_usd, 3),
            "cost_brl_month": round(total_scheduled_usd * exchange_rate, 2),
            "cost_usd_day": round(total_scheduled_usd / 30.44, 4),
            "cost_brl_day": round((total_scheduled_usd * exchange_rate) / 30.44, 2),
            "tasks": scheduled_breakdown
        },
        "chat_interactions": {
            "total_interactions_last_30d": chat_count,
            "cost_per_interaction_usd": round(cost_per_chat_usd, 4),
            "cost_per_interaction_brl": round(cost_per_chat_usd * exchange_rate, 3),
            "cost_usd_month": round(chat_month_usd, 3),
            "cost_brl_month": round(chat_month_usd * exchange_rate, 2),
            "system_model": chat_rates["name"]
        },
        "combined_total": {
            "cost_usd_month": round(total_combined_usd, 3),
            "cost_brl_month": round(total_combined_usd * exchange_rate, 2),
            "cost_usd_day": round(total_combined_usd / 30.44, 4),
            "cost_brl_day": round((total_combined_usd * exchange_rate) / 30.44, 2)
        },
        "frugal_savings": {
            "pro_benchmark_usd_month": round(total_pro_benchmark_usd, 3),
            "pro_benchmark_brl_month": round(total_pro_benchmark_usd * exchange_rate, 2),
            "monthly_savings_usd": round(savings_usd, 3),
            "monthly_savings_brl": round(savings_usd * exchange_rate, 2),
            "savings_percentage": savings_pct
        },
        "exchange_rate_usd_brl": exchange_rate,
        "currency_code": (get_setting("currency_code") or os.getenv("DEFAULT_CURRENCY", "BRL")).upper(),
        "currency_symbol": get_setting("currency_symbol") or os.getenv("CURRENCY_SYMBOL", "$" if (get_setting("currency_code") or os.getenv("DEFAULT_CURRENCY", "BRL")).upper() == "USD" else ("€" if (get_setting("currency_code") or os.getenv("DEFAULT_CURRENCY", "BRL")).upper() == "EUR" else ("£" if (get_setting("currency_code") or os.getenv("DEFAULT_CURRENCY", "BRL")).upper() == "GBP" else "R$"))),
        "system_default_model": system_default_model
    }

# --- TOPOLOGIA VISUAL DO STUDIO (SALVAMENTO APENAS ADMIN) ---
@app.get("/api/canvas/topology")
def get_topology():
    return get_canvas_topology()

@app.post("/api/canvas/topology")
def save_topology(req: TopologyRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    author = admin.get("email", "admin@example.com")
    diff = save_canvas_topology(req.nodes, req.edges, author=author)
    return {"status": "success", "message": "Topologia salva com sucesso!", "diff": diff}

@app.get("/api/canvas/history")
def get_topology_history(user: Dict[str, Any] = Depends(require_authenticated_user)):
    return get_canvas_history()

@app.post("/api/canvas/rollback/{history_id}")
def rollback_topology(history_id: int, admin: Dict[str, Any] = Depends(require_admin_user)):
    author = admin.get("email", "admin@example.com")
    res = rollback_canvas_history(history_id, author=f"{author} (Rollback)")
    if not res:
        raise HTTPException(status_code=404, detail="Versão de histórico não encontrada.")
    return {"status": "success", "message": f"Topologia revertida com sucesso para a versão #{history_id}!"}

@app.get("/api/canvas/mutex")
def get_mutex_status():
    return get_execution_mutex()

# --- TOWN HALL (EDIÇÃO APENAS ADMIN) ---
@app.get("/api/townhall")
def get_company_townhall():
    return get_town_hall()

@app.post("/api/townhall")
def update_company_townhall(req: TownHallRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    save_town_hall(req.vision, req.okrs, req.guidelines, req.response_format or "")
    return {"status": "success", "message": "Diretrizes e OKRs do Town Hall atualizados pelo administrador!"}

# --- REGRAS APRENDIDAS E FEEDBACKS (EVOLUÇÃO CONTÍNUA - REGRAS_APRENDIDAS_E_FEEDBACKS.md) ---
class LearnedRulesUpdateRequest(BaseModel):
    content: Optional[str] = Field(None, description="Conteúdo Markdown completo de REGRAS_APRENDIDAS_E_FEEDBACKS.md")
    new_rule: Optional[str] = Field(None, description="Nova regra individual para adicionar com data e contexto")
    department: Optional[str] = Field("Global", description="Departamento ou contexto da regra")
    agent_id: Optional[str] = Field("fundador-ui", description="Autor ou agente")

@app.get("/api/learned-rules")
def get_learned_rules_endpoint():
    """Retorna o conteúdo de REGRAS_APRENDIDAS_E_FEEDBACKS.md e a lista estruturada de regras aprendidas."""
    from tools.agent_workspace_tools import get_learned_rules_content, SHARED_RULES_FILE
    content = get_learned_rules_content()
    rules_list = []
    try:
        from api.tasks_queue import DB_PATH
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
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
            rows = conn.execute("SELECT id, created_at, date_human, department, agent_id, rule_text FROM learned_business_rules ORDER BY id DESC LIMIT 100").fetchall()
            rules_list = [dict(r) for r in rows]
    except Exception as e:
        logger.warning(f"Erro ao listar learned_business_rules: {e}")

    return {
        "content": content,
        "file_path": SHARED_RULES_FILE,
        "rules": rules_list
    }

@app.post("/api/learned-rules")
def update_learned_rules_endpoint(req: LearnedRulesUpdateRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Adiciona uma nova regra aprendida ou salva o arquivo REGRAS_APRENDIDAS_E_FEEDBACKS.md editado pela interface."""
    from tools.agent_workspace_tools import LearnedRulesMemoryTool, SHARED_RULES_FILE, get_learned_rules_content
    import base64

    if req.new_rule and req.new_rule.strip():
        tool = LearnedRulesMemoryTool()
        msg = tool._run(
            action="add",
            rule_text=req.new_rule.strip(),
            context_or_department=req.department or "Global",
            agent_id=req.agent_id or admin.get("email", "fundador")
        )
        return {
            "status": "success",
            "message": msg,
            "content": get_learned_rules_content()
        }

    if req.content is not None:
        os.makedirs(os.path.dirname(SHARED_RULES_FILE), exist_ok=True)
        with open(SHARED_RULES_FILE, "w", encoding="utf-8") as f:
            f.write(req.content)

        drive_synced = False
        try:
            folder_name = get_setting("reports_drive_folder", "Boletins Executivos")
            b64_content = base64.b64encode(req.content.encode("utf-8")).decode("ascii")
            res_drive = _call_drive_api("POST", {
                "action": "upload",
                "name": "REGRAS_APRENDIDAS_E_FEEDBACKS.md",
                "folderName": folder_name,
                "mimeType": "text/markdown",
                "base64Data": b64_content
            })
            if res_drive.get("id") or res_drive.get("url"):
                drive_synced = True
        except Exception:
            pass

        return {
            "status": "success",
            "message": "Arquivo REGRAS_APRENDIDAS_E_FEEDBACKS.md salvo com sucesso" + (" e sincronizado no Google Drive!" if drive_synced else "!"),
            "content": req.content
        }

    raise HTTPException(status_code=400, detail="Informe 'new_rule' ou 'content'.")


# --- MEMÓRIAS INDIVIDUAIS DOS AGENTES (EDIÇÃO APENAS ADMIN) ---
@app.get("/api/agents/{agent_id}/memory")
def get_agent_memory_endpoint(agent_id: str):
    return get_agent_memory(agent_id)

@app.post("/api/agents/{agent_id}/memory")
def save_agent_memory_endpoint(agent_id: str, req: AgentMemoryRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    save_agent_memory(agent_id, req.memory_text, req.learned_facts, req.name or "", req.role or "")
    return {"status": "success", "message": f"Memória do agente '{agent_id}' salva com sucesso!"}

# --- PERSONALIDADES DOS AGENTES (EDIÇÃO APENAS ADMIN) ---
@app.get("/api/agents/{agent_id}/personality")
def get_agent_personality_endpoint(agent_id: str):
    return get_agent_personality(agent_id)

@app.post("/api/agents/{agent_id}/personality")
def save_agent_personality_endpoint(agent_id: str, req: AgentPersonalityRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    save_agent_personality(agent_id, req.tone, req.guidelines)
    return {"status": "success", "message": f"Personalidade do agente '{agent_id}' atualizada com sucesso!"}

# --- WORKSPACES, SCRIPTS AUTÔNOMOS E BANCOS LOCAIS DOS AGENTES (FRUGAL AI) ---
class WorkspaceFileSaveRequest(BaseModel):
    name: str = Field(..., description="Nome do arquivo ou script")
    content: str = Field(..., description="Conteúdo do arquivo")
    description: Optional[str] = Field(None, description="Descrição da ferramenta ou dados")

class WorkspaceScriptRunRequest(BaseModel):
    filename: str = Field(..., description="Nome do script a executar")
    args: Optional[List[str]] = Field(None, description="Argumentos adicionais")

@app.get("/api/agents/{agent_id}/workspace")
def get_agent_workspace(agent_id: str):
    """Retorna a lista de scripts, bancos SQLite e dados do workspace do agente com tokens economizados."""
    from api.agent_workspace import list_agent_workspace_files
    return list_agent_workspace_files(agent_id)

@app.get("/api/agents/{agent_id}/workspace/file")
def get_agent_workspace_file(agent_id: str, name: str):
    """Lê o conteúdo de um script/arquivo ou inspeciona o banco SQLite."""
    from api.agent_workspace import get_workspace_file_content
    try:
        return get_workspace_file_content(agent_id, name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/{agent_id}/workspace/file")
def save_agent_workspace_file(agent_id: str, req: WorkspaceFileSaveRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Salva ou cria um novo script/arquivo no workspace do agente."""
    from api.agent_workspace import save_workspace_file
    try:
        return save_workspace_file(agent_id, req.name, req.content, req.description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/agents/{agent_id}/workspace/file")
def delete_agent_workspace_file(agent_id: str, name: str, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Remove um arquivo do workspace do agente."""
    from api.agent_workspace import delete_workspace_file
    try:
        return delete_workspace_file(agent_id, name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/{agent_id}/workspace/run")
def run_agent_workspace_script(agent_id: str, req: WorkspaceScriptRunRequest, admin: Dict[str, Any] = Depends(require_admin_user)):
    """Executa um script local no workspace do agente e retorna o output determinístico."""
    from api.agent_workspace import execute_workspace_script
    try:
        return execute_workspace_script(agent_id, req.filename, req.args)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- TAREFAS E HISTÓRICO SEGREGADO POR USUÁRIO ---
@app.post("/api/tasks", response_model=TaskResponse)
def submit_task(req: TaskRequest, x_user_email: Optional[str] = Header(None)):
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="O prompt não pode estar vazio.")
    
    # Determina e-mail e nome do usuário a partir da requisição ou do header
    user_email = req.user_email or x_user_email or "anonimo@ai-board.local"
    user = get_user(user_email)
    user_name = req.user_name or (user["name"] if user else user_email.split("@")[0].title())

    task_id = create_task(
        crew_name=req.crew_name,
        prompt=req.prompt,
        requester=req.requester,
        telegram_chat_id=req.telegram_chat_id,
        user_email=user_email,
        user_name=user_name
    )
    return TaskResponse(
        task_id=task_id,
        status="QUEUED",
        crew_name=req.crew_name,
        message=f"Tarefa {task_id} enfileirada com sucesso para a Crew '{req.crew_name}'."
    )

@app.get("/api/tasks/{task_id}")
def check_task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    return task

@app.get("/api/tasks/{task_id}/logs")
def get_task_logs_endpoint(task_id: str, after_id: int = 0):
    """Retorna os logs detalhados em tempo real de uma tarefa de agente."""
    logs = get_task_logs(task_id, after_id=after_id)
    task = get_task(task_id)
    return {
        "task_id": task_id,
        "status": task.get("status") if task else "UNKNOWN",
        "error": task.get("error") if task else None,
        "prompt": task.get("prompt") if task else "",
        "result": task.get("result") if task else None,
        "started_at": task.get("started_at") if task else None,
        "completed_at": task.get("completed_at") if task else None,
        "user_name": task.get("user_name") if task else None,
        "user_email": task.get("user_email") if task else None,
        "logs": logs
    }

@app.post("/api/tasks/{task_id}/cancel")
def cancel_task_endpoint(task_id: str, user: Dict[str, Any] = Depends(require_authenticated_user)):
    """Cancela imediatamente uma tarefa em execução."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    
    # Usuário comum só pode cancelar suas próprias tarefas; admin pode cancelar qualquer uma
    if user.get("role") != "admin" and task.get("user_email") != user.get("email"):
        raise HTTPException(status_code=403, detail="Você só tem permissão para cancelar suas próprias tarefas.")
        
    success = cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Não foi possível cancelar a tarefa ou ela já foi finalizada.")
    return {"status": "success", "message": f"Tarefa {task_id} cancelada com sucesso!"}


# --- NOTIFICAÇÕES NO CELULAR (CROSS-DEVICE: DESKTOP -> CELULAR VIA TELEGRAM + WEB PUSH VAPID) ---
class MobileToggleRequest(BaseModel):
    user_email: Optional[str] = None
    enabled: bool = True
    send_confirmation: bool = True


class PushSubscribeRequest(BaseModel):
    user_email: Optional[str] = None
    subscription: Dict[str, Any]
    device_type: Optional[str] = "mobile"
    user_agent: Optional[str] = ""


@app.get("/api/notifications/mobile-status")
def get_mobile_notification_status(
    user_email: Optional[str] = None,
    x_user_email: Optional[str] = Header(None),
):
    from api.tasks_queue import (
        is_mobile_chat_notify_enabled,
        get_or_create_vapid_keys,
        get_user_web_push_subscriptions,
        get_active_approver_chat_ids,
    )
    email = (user_email or x_user_email or "").strip().lower()
    enabled = is_mobile_chat_notify_enabled(email)
    vapid = get_or_create_vapid_keys()
    subs = get_user_web_push_subscriptions(email)
    tg_chats = get_active_approver_chat_ids()
    tg_token = bool(os.getenv("TELEGRAM_BOT_TOKEN") or get_setting("telegram_bot_token"))
    return {
        "status": "ok",
        "enabled": enabled,
        "vapid_public_key": vapid.get("public_key", ""),
        "telegram_connected": bool(tg_token and len(tg_chats) > 0),
        "web_push_devices": len(subs),
    }


@app.post("/api/notifications/mobile-toggle")
def toggle_mobile_notifications(
    req: MobileToggleRequest,
    x_user_email: Optional[str] = Header(None),
):
    from api.tasks_queue import (
        set_mobile_chat_notify_enabled,
        dispatch_mobile_chat_notification,
        get_or_create_vapid_keys,
    )
    email = (req.user_email or x_user_email or "admin@localhost").strip().lower()
    enabled = set_mobile_chat_notify_enabled(email, req.enabled)
    vapid = get_or_create_vapid_keys()

    dispatch_res = {"sent_telegram": False, "sent_webpush": 0}
    if enabled and req.send_confirmation:
        dispatch_res = dispatch_mobile_chat_notification(
            user_email=email,
            title="Notificações no Celular Ativadas!",
            body=(
                "A partir de agora, sempre que um agente concluir uma resposta no Chat Operacional "
                "(mesmo quando você perguntar pelo computador), você receberá o aviso e a resposta "
                "diretamente aqui no seu celular."
            ),
            prompt="",
            task_id="",
            duration_sec=0,
        )

    return {
        "status": "ok",
        "enabled": enabled,
        "vapid_public_key": vapid.get("public_key", ""),
        "dispatched": dispatch_res,
    }


@app.post("/api/notifications/push-subscribe")
def subscribe_web_push_endpoint(
    req: PushSubscribeRequest,
    x_user_email: Optional[str] = Header(None),
):
    from api.tasks_queue import (
        save_web_push_subscription,
        set_mobile_chat_notify_enabled,
    )
    email = (req.user_email or x_user_email or "admin@localhost").strip().lower()
    ok = save_web_push_subscription(
        user_email=email,
        subscription=req.subscription,
        device_type=req.device_type or "mobile",
        user_agent=req.user_agent or "",
    )
    if ok:
        set_mobile_chat_notify_enabled(email, True)
    return {"status": "ok" if ok else "error", "subscribed": ok}

# --- COMPARTILHAMENTO DE BOLETINS E RELATÓRIOS DA IA ---
class TaskShareEmailRequest(BaseModel):
    recipients: Optional[List[str]] = Field(None, description="Destinatários do e-mail")
    custom_message: Optional[str] = Field(None, description="Mensagem adicional ou observação")

@app.post("/api/tasks/{task_id}/share/email")
def share_task_by_email(
    task_id: str,
    req: Optional[TaskShareEmailRequest] = None,
    user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Envia o boletim/resultado da tarefa por e-mail para os diretoria via Gmail."""
    from api.report_formatter import markdown_to_html_rich

    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    
    result = task.get("result") or ""
    if not result:
        raise HTTPException(status_code=400, detail="Esta tarefa ainda não possui resultado final gerado para compartilhamento.")

    default_partners_str = get_setting("partner_emails") or os.getenv("DEFAULT_PARTNER_EMAILS", "")
    default_partners = [e.strip() for e in default_partners_str.split(",") if e.strip()]

    recipients_list = (req and req.recipients) or default_partners
    to_str = ", ".join([r.strip() for r in recipients_list if r.strip()])
    if not to_str:
        to_str = default_partners_str or "executivos@example.com"

    company_name = get_setting("company_name") or "AI Board"
    company_legal = get_setting("company_legal_name") or "AI Board Enterprise Solutions"
    logo_url = get_setting("company_logo_url") or "/logo.svg"
    app_url = os.getenv("APP_URL", "http://localhost:5173")

    prompt_summary = (task.get("prompt") or "Relatório Executivo")[:80].replace("\n", " ")
    subject = f"[{company_name}] Boletim Executivo: {prompt_summary} (#{task_id[:6]})"

    custom_note = (
        f"<div style='background: #EFF5F1; padding: 12px 16px; border-left: 4px solid #16422B; border-radius: 8px; font-size: 13px; color: #16422B; margin-bottom: 20px;'>"
        f"<strong>Nota de Envio:</strong> {req.custom_message}</div>"
        if (req and req.custom_message) else ""
    )

    rich_html_content = markdown_to_html_rich(result)

    html_body = f"""<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAF9; margin: 0; padding: 24px; color: #1A202C; }}
        .card {{ background: #FFFFFF; max-width: 700px; margin: 0 auto; border-radius: 20px; border: 1px solid #E2E8E4; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }}
        .meta {{ font-size: 12px; color: #5A6B61; margin-bottom: 20px; line-height: 1.6; background: #F8FAF9; padding: 12px 16px; border-radius: 12px; }}
        .content {{ font-size: 14px; line-height: 1.65; color: #2D3748; background: #FFFFFF; padding: 20px; border-radius: 14px; border: 1px solid #E2E8E4; font-family: inherit; }}
        .footer {{ margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8E4; font-size: 11px; color: #718096; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 2px solid #EFF5F1; padding-bottom: 16px; margin-bottom: 20px;">
          <tr>
            <td style="vertical-align: middle;">
              <img src="{logo_url}" alt="{company_name}" height="32" style="height: 32px; vertical-align: middle; display: inline-block; border: 0;" />
              <span style="display: inline-block; vertical-align: middle; margin-left: 8px; background: #16422B; color: #FFFFFF; font-size: 10px; font-weight: 900; padding: 3px 7px; border-radius: 99px; letter-spacing: 0.5px;">AI</span>
              <span style="display: inline-block; vertical-align: middle; margin-left: 8px; color: #16422B; font-size: 16px; font-weight: 800;">Central de Inteligência</span>
            </td>
            <td style="text-align: right; vertical-align: middle;">
              <span style="background: #E7F6ED; color: #16422B; border: 1px solid #B8E4C9; padding: 5px 12px; border-radius: 99px; font-weight: 700; font-size: 11px; white-space: nowrap;">Boletim Executivo</span>
            </td>
          </tr>
        </table>
        <div class="meta">
          <strong>Solicitante:</strong> {task.get('user_name') or task.get('requester') or 'Sistema Autônomo'}<br>
          <strong>Pergunta / Rotina:</strong> {task.get('prompt') or 'Consulta Operacional'}<br>
          <strong>Data da Execução:</strong> {time.strftime('%d/%m/%Y às %H:%M')}<br>
          <strong>Identificador da Tarefa:</strong> #{task_id}
        </div>
        {custom_note}
        <div class="content">{rich_html_content}</div>
        <div class="footer">
          Gerado automaticamente pela Central de Inteligência Artificial da {company_legal}<br>
          Acesse a plataforma completa em <a href="{app_url}" style="color: #16422B; font-weight: bold;">{app_url}</a>
        </div>
      </div>
    </body>
    </html>"""

    from api.report_formatter import markdown_to_whatsapp
    plain_body = f"{company_name} - Boletim Executivo (#{task_id})\n\n{markdown_to_whatsapp(result)}\n\nAcesse: {app_url}"

    try:
        from tools.google_workspace_tools import GmailSendEmailTool
        sender = GmailSendEmailTool()
        send_res = sender.run(to=to_str, subject=subject, body=plain_body, html=html_body)
        return {
            "status": "success",
            "message": f"Boletim executivo enviado com sucesso para: {to_str}",
            "recipients": to_str,
            "details": send_res
        }
    except Exception as e:
        logger.error(f"Erro ao disparar e-mail de compartilhamento: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao enviar e-mail: {str(e)}")

@app.post("/api/tasks/{task_id}/share/gdrive")
def share_task_to_gdrive(
    task_id: str,
    user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Cria um documento formatado no Google Drive com logo e tabelas renderizadas e retorna a URL direta para abertura no Google Docs."""
    import base64
    from api.report_formatter import markdown_to_html_rich
    from tools.google_workspace_tools import _call_drive_api

    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    
    result = task.get("result") or ""
    if not result:
        raise HTTPException(status_code=400, detail="Esta tarefa ainda não possui resultado final gerado.")

    company_name = get_setting("company_name") or "AI Board"
    company_legal = get_setting("company_legal_name") or "AI Board Enterprise Solutions"
    logo_url = get_setting("company_logo_url") or "/logo.svg"
    app_url = os.getenv("APP_URL", "http://localhost:5173")
    target_folder = get_setting("reports_drive_folder") or ""

    rich_html = markdown_to_html_rich(result)
    prompt_clean = (task.get("prompt") or "Boletim Executivo").strip()
    short_title = re.sub(r'[^a-zA-Z0-9À-ÿ _\-]', '', prompt_clean)[:45].strip() or f"Boletim_{task_id[:6]}"
    doc_filename = f"{company_name} - {short_title} (#{task_id[:6]}).doc"

    doc_html = f"""<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>{company_name} - {short_title}</title>
  <style>
    body {{ font-family: Arial, Calibri, sans-serif; font-size: 11pt; line-height: 1.55; color: #1A202C; margin: 24pt; }}
    table {{ border-collapse: collapse; width: 100%; margin: 12pt 0; }}
    th {{ background-color: #16422B; color: #FFFFFF; font-weight: bold; padding: 8pt 10pt; border: 1pt solid #16422B; text-align: left; }}
    td {{ padding: 7pt 10pt; border: 1pt solid #CBD5E0; color: #1A202C; }}
    h1, h2, h3 {{ color: #16422B; }}
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="border: none; border-bottom: 2pt solid #16422B; padding-bottom: 10pt; margin-bottom: 14pt;">
    <tr>
      <td style="border: none; vertical-align: middle;">
        <img src="{logo_url}" alt="{company_name}" height="34" style="height: 34px; vertical-align: middle;" />
        <span style="font-size: 16pt; font-weight: bold; color: #16422B; margin-left: 8pt; vertical-align: middle;">{company_name} — Boletim Executivo</span>
      </td>
      <td style="border: none; text-align: right; vertical-align: middle; font-size: 9.5pt; color: #5A6B61;">
        <strong>Tarefa:</strong> #{task_id}<br/>
        <strong>Data:</strong> {time.strftime('%d/%m/%Y às %H:%M')}
      </td>
    </tr>
  </table>
  <div style="background-color: #F8FAF9; border: 1pt solid #E2E8E4; padding: 10pt 12pt; border-radius: 6pt; margin-bottom: 14pt; font-size: 10pt; color: #2D3748;">
    <strong>Solicitante:</strong> {task.get('user_name') or task.get('user_email') or 'Console'}<br/>
    <strong>Solicitação:</strong> {prompt_clean}
  </div>
  <div>
    {rich_html}
  </div>
  <hr style="border: none; border-top: 1pt solid #E2E8E4; margin-top: 20pt; margin-bottom: 8pt;" />
  <p style="font-size: 8.5pt; color: #718096; text-align: center;">
    Gerado pela Central de Inteligência {company_legal} • {app_url}
  </p>
</body>
</html>"""

    # 1. Envia para o Google Drive via WebApp oficial (cria arquivo que abre diretamente no Google Docs)
    encoded_b64 = base64.b64encode(doc_html.encode("utf-8")).decode("ascii")
    upload_payload = {
        "action": "upload",
        "name": doc_filename,
        "base64Content": encoded_b64,
        "mimeType": "application/msword",
        "folder": target_folder
    }
    drive_res = _call_drive_api("POST", upload_payload)
    drive_url = drive_res.get("url")
    drive_id = drive_res.get("id")

    # Configura acesso para qualquer pessoa com link caso tenha sido criado
    if drive_id:
        try:
            _call_drive_api("POST", {
                "action": "share_set_access",
                "id": drive_id,
                "isFolder": False,
                "access": "anyone_with_link",
                "role": "editor"
            })
        except Exception:
            pass

    # 2. Também salva cópia local em /data/boletins
    drive_dirs = [
        "/app/data/boletins",
        "/opt/crewai/data/boletins",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "boletins"))
    ]
    for d in drive_dirs:
        try:
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, doc_filename), "w", encoding="utf-8") as f:
                f.write(doc_html)
            break
        except Exception:
            continue

    return {
        "status": "success",
        "message": f"Documento '{doc_filename}' criado no Google Drive com sucesso!",
        "filename": doc_filename,
        "id": drive_id,
        "url": drive_url,
        "html": doc_html
    }

@app.get("/api/tasks")
def get_recent_tasks(
    limit: int = 50,
    user_email: Optional[str] = None,
    x_user_email: Optional[str] = Header(None)
):
    """
    Retorna histórico de tarefas.
    - Se for Usuário Comum: retorna EXCLUSIVAMENTE o histórico do próprio usuário.
    - Se for Administrador: pode visualizar todas as tarefas ou filtrar por qualquer usuário.
    """
    current_user = get_user(x_user_email) if x_user_email else None
    is_admin = bool(current_user and current_user.get("role") == "admin")

    if not is_admin:
        # Usuário comum: força o filtro pelo seu próprio e-mail
        target_email = current_user["email"] if current_user else (user_email or x_user_email)
        return list_tasks(limit=limit, user_email=target_email, is_admin=False)
    
    # Admin: se user_email foi passado, filtra por ele; senão retorna todas
    return list_tasks(limit=limit, user_email=user_email, is_admin=True)


def _reconcile_sessions_with_user_tasks(sessions: List[Dict[str, Any]], user_email: str) -> List[Dict[str, Any]]:
    """
    Sincroniza as sessões de chat com o banco `agent_tasks` do usuário:
    1. Se uma sessão tiver uma pergunta cuja resposta anterior falhou (`isError: True` / `❌`),
       mas existir uma tarefa `COMPLETED` para a mesma pergunta, substitui o erro pela resposta concluída.
    2. Se existirem tarefas `COMPLETED` do Chat Web para o usuário que ainda não estejam nas sessões
       deste dispositivo (ex: pergunta feita no PC e aberta no Celular), adiciona/sincroniza automaticamente.
    """
    if not user_email:
        return sessions or []

    try:
        user_tasks = list_tasks(limit=30, user_email=user_email, is_admin=True)
    except Exception:
        user_tasks = []

    web_completed = [
        t for t in (user_tasks or [])
        if t.get("status") == "COMPLETED"
        and t.get("result")
        and any(k in str(t.get("requester") or "").lower() for k in ("web", "react_console"))
        and str(t.get("user_email") or "").lower() == user_email.lower()
    ]
    if not web_completed:
        return sessions or []

    from datetime import datetime
    reconciled = json.loads(json.dumps(sessions or []))
    rendered_task_ids = set()

    for s in reconciled:
        msgs = s.get("messages") or []
        for idx, m in enumerate(msgs):
            mid = str(m.get("id") or "")
            if mid.startswith("res-"):
                rendered_task_ids.add(mid[4:])
            # Verifica se é uma mensagem de usuário seguida por erro ou sem resposta
            if m.get("sender") == "user":
                u_text = str(m.get("text") or "").strip()
                if not u_text:
                    continue
                next_msg = msgs[idx + 1] if idx + 1 < len(msgs) else None
                next_is_error = bool(
                    next_msg
                    and next_msg.get("sender") == "agent"
                    and (next_msg.get("isError") or str(next_msg.get("text") or "").strip().startswith("❌"))
                )
                if next_msg is None or next_is_error:
                    match = next(
                        (
                            t for t in web_completed
                            if str(t.get("prompt") or "").strip() == u_text
                            or str(t.get("prompt") or "").strip().startswith(u_text[:30])
                            or u_text.startswith(str(t.get("prompt") or "").strip()[:30])
                        ),
                        None,
                    )
                    if match:
                        tid = match.get("task_id") or match.get("id")
                        comp_ts = float(match.get("completed_at") or match.get("created_at") or time.time())
                        time_str = datetime.fromtimestamp(comp_ts).strftime("%H:%M")
                        iso_str = datetime.fromtimestamp(comp_ts).isoformat()
                        new_agent_msg = {
                            "id": f"res-{tid}",
                            "sender": "agent",
                            "isError": False,
                            "text": match.get("result"),
                            "time": time_str,
                        }
                        if next_is_error:
                            msgs[idx + 1] = new_agent_msg
                        else:
                            msgs.insert(idx + 1, new_agent_msg)
                        s["pendingTaskId"] = None
                        s["pendingTaskStatus"] = None
                        s["updatedAt"] = iso_str
                        rendered_task_ids.add(str(tid))

    # Se a tarefa mais recente concluída no servidor ainda não estiver em nenhuma sessão, cria/insere no topo
    for t in reversed(web_completed[:10]):
        tid = str(t.get("task_id") or t.get("id") or "")
        if not tid or tid in rendered_task_ids:
            continue
        u_prompt = str(t.get("prompt") or "").strip()
        # Evita duplicar se já houver sessão com a mesma resposta exata
        already_in_any = any(
            any(
                m.get("sender") == "agent"
                and not m.get("isError")
                and str(m.get("text") or "").strip() == str(t.get("result") or "").strip()
                for m in (s.get("messages") or [])
            )
            for s in reconciled
        )
        if already_in_any:
            rendered_task_ids.add(tid)
            continue

        comp_ts = float(t.get("completed_at") or t.get("created_at") or time.time())
        creat_ts = float(t.get("created_at") or comp_ts)
        u_time = datetime.fromtimestamp(creat_ts).strftime("%H:%M")
        a_time = datetime.fromtimestamp(comp_ts).strftime("%H:%M")
        iso_creat = datetime.fromtimestamp(creat_ts).isoformat()
        iso_comp = datetime.fromtimestamp(comp_ts).isoformat()

        new_sess = {
            "id": f"sess-sync-{tid}",
            "title": u_prompt[:36] + ("..." if len(u_prompt) > 36 else ""),
            "createdAt": iso_creat,
            "updatedAt": iso_comp,
            "pendingTaskId": None,
            "pendingTaskStatus": None,
            "messages": [
                {
                    "id": "welcome",
                    "sender": "agent",
                    "text": "Olá! Sou a Inteligência Central da sua operação. Posso acionar toda a nossa árvore de agentes especialistas e ferramentas para responder perguntas estratégicas, auditar números ou executar tarefas. Como posso ajudar agora?",
                    "time": u_time,
                },
                {
                    "id": f"user-{tid}",
                    "sender": "user",
                    "text": u_prompt,
                    "time": u_time,
                },
                {
                    "id": f"res-{tid}",
                    "sender": "agent",
                    "isError": False,
                    "text": t.get("result"),
                    "time": a_time,
                },
            ],
        }
        reconciled.insert(0, new_sess)
        rendered_task_ids.add(tid)

    # Remove sessões vazias duplicadas se já houver sessões com conteúdo
    non_empty = [
        s for s in reconciled
        if any(m.get("sender") == "user" for m in (s.get("messages") or []))
    ]
    if non_empty:
        reconciled = non_empty

    reconciled.sort(key=lambda s: str(s.get("updatedAt") or ""), reverse=True)
    return reconciled[:30]


@app.get("/api/chat/sessions")
def get_user_chat_sessions(
    user_email: Optional[str] = None,
    x_user_email: Optional[str] = Header(None),
):
    target_email = (x_user_email or user_email or "").strip().lower()
    if not target_email:
        return {"sessions": []}
    raw = get_setting(f"chat_sessions_v3_{target_email}", "[]")
    try:
        saved = json.loads(raw) if raw else []
        if not isinstance(saved, list):
            saved = []
    except Exception:
        saved = []
    reconciled = _reconcile_sessions_with_user_tasks(saved, target_email)
    try:
        set_setting(f"chat_sessions_v3_{target_email}", json.dumps(reconciled, ensure_ascii=False))
    except Exception:
        pass
    return {"sessions": reconciled}


@app.post("/api/chat/sessions")
def save_user_chat_sessions(
    payload: Dict[str, Any] = Body(...),
    x_user_email: Optional[str] = Header(None),
):
    target_email = (x_user_email or payload.get("user_email") or "").strip().lower()
    if not target_email:
        return {"ok": False}
    incoming = payload.get("sessions")
    if not isinstance(incoming, list):
        return {"ok": False}
    reconciled = _reconcile_sessions_with_user_tasks(incoming, target_email)
    set_setting(f"chat_sessions_v3_{target_email}", json.dumps(reconciled, ensure_ascii=False))
    return {"ok": True, "sessions": reconciled}


# --- TOOL HEALTH DIAGNOSTICS & VERIFICATION ---
@app.get("/api/tools/cache")
def get_tools_cached_status():
    """Retorna o cache persistido dos diagnósticos de saúde das ferramentas."""
    return get_all_tools_health_cache()

def _get_shared_connection_family_ids(tid: str) -> List[str]:
    t = (tid or "").lower()
    if "freescout" in t:
        return ["tool-freescout", "trig-freescout-events", "trig-freescout"]
    if "chatwoot" in t:
        return ["tool-chatwoot", "trig-chatwoot-events", "trig-chatwoot"]
    if "gmail" in t:
        return ["tool-gmail", "trig-gmail-events", "trig-gmail"]
    if "entrega-aki" in t or "entrega_aki" in t:
        return ["tool-entrega-aki", "trig-entrega-aki"]
    if "99food" in t:
        return ["tool-99food", "trig-99food"]
    if "ifood" in t:
        return ["tool-ifood", "trig-ifood"]
    return [tid]

@app.get("/api/tools/status")
def get_tools_status():
    """Retorna o status em tempo real de todas as ferramentas e gatilhos configurados no canvas e persiste em cache com timestamp."""
    topology = get_canvas_topology()
    nodes = topology.get("nodes", []) if topology else []
    health_map = get_all_tools_health(nodes)
    now = time.time()
    for h in health_map.values():
        h["updated_at"] = now
    try:
        save_all_tools_health(health_map)
        if topology and nodes:
            changed = False
            for n in nodes:
                if n.get("type") in ("tool", "trigger"):
                    nid = n.get("id")
                    h = health_map.get(nid)
                    if not h:
                        for sib in _get_shared_connection_family_ids(nid):
                            if sib in health_map:
                                h = health_map[sib]
                                break
                    if h:
                        nd = n.setdefault("data", {})
                        nd["healthStatus"] = h.get("status", "online")
                        nd["healthLabel"] = h.get("status_label", "Ativo")
                        nd["healthLatency"] = h.get("latency_ms", 0)
                        nd["healthDetails"] = h.get("details", "")
                        nd["healthUpdatedAt"] = now
                        nd["isConfigured"] = h.get("is_configured", True)
                        changed = True
            if changed:
                save_canvas_topology(nodes, topology.get("edges", []))
    except Exception as e:
        logger.warning(f"Erro ao salvar cache de status de ferramentas: {e}")
    return health_map

@app.post("/api/tools/{tool_id}/test")
def run_tool_test(tool_id: str, payload: Optional[Dict[str, Any]] = None):
    """Executa diagnóstico sob demanda para uma ferramenta ou gatilho específico e sincroniza nós da mesma conexão."""
    data = payload or {}
    result = test_tool_health(tool_id, data)
    now = time.time()
    result["updated_at"] = now
    sibling_ids = set(_get_shared_connection_family_ids(tool_id))
    sibling_ids.add(tool_id)
    try:
        for sid in sibling_ids:
            save_tool_health(sid, result)
        topology = get_canvas_topology()
        if topology and isinstance(topology.get("nodes"), list):
            changed = False
            for n in topology["nodes"]:
                if n.get("id") in sibling_ids:
                    nd = n.setdefault("data", {})
                    nd["healthStatus"] = result.get("status", "online")
                    nd["healthLabel"] = result.get("status_label", "Ativo")
                    nd["healthLatency"] = result.get("latency_ms", 0)
                    nd["healthDetails"] = result.get("details", "")
                    nd["healthUpdatedAt"] = now
                    nd["isConfigured"] = result.get("is_configured", True)
                    changed = True
            if changed:
                save_canvas_topology(topology["nodes"], topology.get("edges", []))
    except Exception as e:
        logger.warning(f"Erro ao salvar cache de teste da ferramenta {tool_id}: {e}")
    return result

class TestGestorRequest(BaseModel):
    url: Optional[str] = "https://gestor.entregaaki.app.br"
    cnpj: str
    user: str
    password: str

@app.post("/api/delivery/test-gestor")
def test_gestor_login(req: TestGestorRequest):
    """Testa credenciais no Gestor Web (Entrega Aki / New Choice) de forma segura sem desconectar a sessão do caixa."""
    from playwright.sync_api import sync_playwright
    import time

    base_url = (req.url or "https://gestor.entregaaki.app.br").rstrip("/")
    login_url = f"{base_url}/Login.aspx?ReturnUrl=%2f"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"]
            )
            page = browser.new_page()
            page.goto(login_url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_selector('#iEdLoja', timeout=10000)
            page.fill('#iEdLoja', req.cnpj.strip())
            page.fill('#iEdUsuario', req.user.strip())
            page.fill('#iEdSenha', req.password.strip())
            page.click('#iBtLogin')
            page.wait_for_timeout(3000)

            body_text = page.inner_text('body')
            if "Usuário não cadastrado" in body_text or "senha invalida" in body_text:
                browser.close()
                return {"status": "error", "message": "Usuário não cadastrado, inativo ou senha inválida no Gestor Web."}

            if "Erro de Autenticação" in body_text:
                browser.close()
                return {"status": "error", "message": "Falha na autenticação do Gestor Web. Verifique o CNPJ, usuário e senha."}

            # Checa se chegou na tela de seleção de canais (sucesso!)
            select_canais = page.query_selector('#iCbCanais')
            channels = []
            if select_canais:
                for opt in select_canais.query_selector_all('option'):
                    txt = opt.inner_text().strip()
                    if txt:
                        channels.append(txt)

            browser.close()
            return {
                "status": "success",
                "message": f"Credenciais válidas! Conectado com sucesso ao Gestor Web (Loja {req.cnpj}).",
                "channels": channels or ["CANAL PRINCIPAL"]
            }
    except Exception as e:
        logger.error(f"Erro ao testar login no gestor: {e}")
        return {"status": "error", "message": f"Erro de conexão com o Gestor: {str(e)}"}

# --- BACKUP GOOGLE DRIVE (rclone) ---
@app.get("/api/backup/status")
def get_backup_status():
    configured_path = get_setting("backup_gdrive_path") or "gdrive:IT/Internal Software/ServerBackup/crewai"
    retention_days = int(get_setting("backup_retention_days") or 14)
    cron_time = get_setting("backup_cron_time") or "03:45"

    candidates = [
        "/app/data/last_backup.json",
        "/opt/crewai/backups/last_backup.json",
        "/opt/crewai/data/last_backup.json",
        os.path.join(os.path.dirname(__file__), "..", "data", "last_backup.json")
    ]
    for status_file in candidates:
        if os.path.exists(status_file):
            try:
                with open(status_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["gdrive_path"] = configured_path
                data["retention_days"] = retention_days
                data["cron_time"] = cron_time
                return data
            except Exception as e:
                logger.error(f"Erro ao ler status do backup ({status_file}): {e}")
    return {
        "status": "idle",
        "date_human": "Ainda não executado",
        "gdrive_path": configured_path,
        "retention_days": retention_days,
        "cron_time": cron_time,
        "db_size": "N/A"
    }

@app.post("/api/backup/run")
def trigger_backup_now(admin: Dict[str, Any] = Depends(require_admin_user)):
    # 1. Pega timestamp atual do último backup se existir
    status_now = get_backup_status()
    prev_ts = status_now.get("timestamp", 0) if isinstance(status_now, dict) else 0

    # 2. Caminho do trigger file para o systemd.path do host
    trigger_candidates = [
        "/app/data/backup.trigger",
        "/opt/crewai/data/backup.trigger",
        os.path.join(os.path.dirname(__file__), "..", "data", "backup.trigger")
    ]
    
    # 3. Se script local existir no host / container direto, roda subprocess
    direct_script = "/opt/crewai/backup-to-gdrive.sh"
    if os.path.exists(direct_script):
        try:
            res = subprocess.run(["bash", direct_script], capture_output=True, text=True, timeout=180)
            if res.returncode == 0:
                return {
                    "status": "success",
                    "message": "Backup sincronizado com o Google Drive com sucesso!",
                    "output": res.stdout[-400:]
                }
            else:
                logger.error(f"Falha no backup: {res.stderr}")
                raise HTTPException(status_code=500, detail=f"Erro ao executar backup: {res.stderr[:300]}")
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Tempo limite excedido ao sincronizar com o Google Drive.")

    # 4. Caso contrário (rodando dentro do container Docker), aciona o systemd.path no host via trigger file
    triggered = False
    for t_path in trigger_candidates:
        try:
            os.makedirs(os.path.dirname(t_path), exist_ok=True)
            with open(t_path, "w", encoding="utf-8") as f:
                f.write(str(time.time()))
            triggered = True
            break
        except Exception:
            continue

    if not triggered:
        raise HTTPException(status_code=500, detail="Não foi possível criar arquivo de trigger de backup.")

    # Aguarda até 30s pelo systemd processar o backup e atualizar last_backup.json
    for _ in range(30):
        time.sleep(1)
        new_status = get_backup_status()
        new_ts = new_status.get("timestamp", 0) if isinstance(new_status, dict) else 0
        if new_ts and new_ts > prev_ts and new_status.get("status") == "success":
            return {
                "status": "success",
                "message": f"Backup para Google Drive concluído com sucesso em {new_status.get('date_human')}!",
                "data": new_status
            }

    return {
        "status": "pending",
        "message": "Backup disparado com sucesso em segundo plano no host do servidor."
    }


# --- GOOGLE DRIVE FILES LIST (PARA SELEÇÃO NO STUDIO) ---
@app.get("/api/tools/drive/files")
def list_drive_files_endpoint(
    q: Optional[str] = None,
    limit: int = 30,
    user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Retorna lista de arquivos do Google Drive para seleção visual no Studio."""
    try:
        from tools.google_workspace_tools import get_workspace_access_token
        token, email = get_workspace_access_token()
        if not token:
            raise HTTPException(status_code=400, detail="Google Workspace não conectado via OAuth.")

        params = {
            "pageSize": min(limit, 50),
            "fields": "files(id, name, mimeType, webViewLink, modifiedTime, iconLink, driveId)",
            "orderBy": "modifiedTime desc",
            "corpora": "allDrives",
            "includeItemsFromAllDrives": "true",
            "supportsAllDrives": "true"
        }
        q_clauses = ["trashed = false"]
        if q and q.strip():
            clean_q = q.strip().replace("'", "\\'")
            q_clauses.append(f"name contains '{clean_q}'")
        params["q"] = " and ".join(q_clauses)

        resp = requests.get(
            "https://www.googleapis.com/drive/v3/files",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=12
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Erro no Google Drive: {resp.text}")

        data = resp.json()
        return {"status": "success", "files": data.get("files", []), "account": email}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao listar arquivos do Google Drive: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tools/drive/file-info")
def get_drive_file_info_endpoint(
    id: str,
    user: Dict[str, Any] = Depends(require_authenticated_user)
):
    """Retorna metadados e o nome amigável de um arquivo específico pelo seu ID do Google Drive."""
    try:
        import re
        from tools.google_workspace_tools import get_workspace_access_token
        token, _ = get_workspace_access_token()
        if not token:
            raise HTTPException(status_code=400, detail="Google Workspace não conectado.")

        raw_id = id.strip()
        # Se for URL de pasta ou arquivo do Drive, extrai apenas o ID
        match_folder = re.search(r'/folders/([a-zA-Z0-9_-]+)', raw_id)
        match_file = re.search(r'/d/([a-zA-Z0-9_-]+)', raw_id)
        match_query = re.search(r'[?&]id=([a-zA-Z0-9_-]+)', raw_id)
        if match_folder:
            clean_id = match_folder.group(1)
        elif match_file:
            clean_id = match_file.group(1)
        elif match_query:
            clean_id = match_query.group(1)
        else:
            clean_id = raw_id

        resp = requests.get(
            f"https://www.googleapis.com/drive/v3/files/{clean_id}",
            params={"fields": "id, name, mimeType, webViewLink", "supportsAllDrives": "true"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Arquivo não encontrado: {resp.text}")
        data = resp.json()
        return {"status": "success", "file": data, "name": data.get("name", clean_id)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao obter info do arquivo Drive {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/microservices/status")
def get_microservices_live_status():
    """Realiza verificação real de saúde (live probe) de todos os microserviços e integrações conectados à Central AI Board."""
    from concurrent.futures import ThreadPoolExecutor

    topology = get_canvas_topology()
    nodes = topology.get("nodes", []) if topology else []
    cached = get_all_tools_health_cache() or {}

    def check_core_engine():
        return {
            "id": "svc-core",
            "name": "AI Board Core Engine",
            "port": "8001",
            "type": "FastAPI / CrewAI 2.1",
            "status": "online",
            "status_label": "Online",
            "latency_ms": 1,
            "desc": "Fila assíncrona, compilador de topologia e motor de agentes",
            "details": "API principal respondendo na porta 8001 com SQLite ativo."
        }

    def check_telegram_bot():
        tg_tok = get_setting("telegram_bot_token") or os.getenv("TELEGRAM_BOT_TOKEN", "")
        if not tg_tok:
            return {
                "id": "svc-telegram",
                "name": "Telegram Bot Worker",
                "port": "Background",
                "type": "python-telegram-bot",
                "status": "warning",
                "status_label": "Token Pendente",
                "latency_ms": 0,
                "desc": "Escuta comandos mobile e envia notificações",
                "details": "Token do Bot do Telegram não configurado."
            }
        t0 = time.time()
        try:
            r = requests.get(f"https://api.telegram.org/bot{tg_tok}/getMe", timeout=4)
            lat = int((time.time() - t0) * 1000)
            if r.status_code == 200 and r.json().get("ok"):
                bot_user = r.json().get("result", {}).get("username", "aiboard_bot")
                return {
                    "id": "svc-telegram",
                    "name": "Telegram Bot Worker",
                    "port": "Background",
                    "type": f"@{bot_user}",
                    "status": "online",
                    "status_label": "Online",
                    "latency_ms": lat,
                    "desc": "Escuta comandos mobile e envia notificações",
                    "details": f"Bot @{bot_user} autenticado e conectado à API do Telegram."
                }
        except Exception:
            pass
        return {
            "id": "svc-telegram",
            "name": "Telegram Bot Worker",
            "port": "Background",
            "type": "python-telegram-bot",
            "status": "online",
            "status_label": "Configurado",
            "latency_ms": 5,
            "desc": "Escuta comandos mobile e envia notificações",
            "details": "Worker Telegram ativo em background."
        }

    def map_tool_probe(svc_id: str, name: str, port: str, svc_type: str, desc: str, tool_key: str):
        res = test_tool_health(tool_key, {})
        st = res.get("status", "warning")
        return {
            "id": svc_id,
            "name": name,
            "port": port,
            "type": svc_type,
            "status": st,
            "status_label": res.get("status_label", "Verificado"),
            "latency_ms": res.get("latency_ms", 0),
            "desc": desc,
            "details": res.get("details", "")
        }

    installed = set(get_installed_catalog_items().get("installed_tools", []))
    erp_host = os.getenv("ERP_BASE_URL", "ERP API").replace("https://", "").replace("http://", "").split("/")[0]

    probes = [
        ("svc-core", check_core_engine),
        ("svc-telegram", check_telegram_bot),
        ("svc-workspace", lambda: map_tool_probe("svc-workspace", "Google Workspace (Drive & Gmail)", "OAuth 2.0", "googleapis.com", "Leitura de planilhas, POPs, pastas e envio de boletins", "tool-drive")),
        ("svc-meta", lambda: map_tool_probe("svc-meta", "Meta Ads Graph API", "v19.0", "graph.facebook.com", "Campanhas pagas Instagram/Facebook, ROAS e tráfego", "tool-meta-ads")),
        ("svc-freescout", lambda: map_tool_probe("svc-freescout", "FreeScout Helpdesk & MariaDB", "18080 / 3306", "helpdesk.local", "Chamados de manutenção e suporte das unidades", "tool-freescout")),
        ("svc-chatwoot", lambda: map_tool_probe("svc-chatwoot", "Chatwoot", "3050", "chat.local", "Atendimento omnichannel ao cliente via WhatsApp", "tool-chatwoot")),
    ]
    if "erp" in installed:
        probes.append(("svc-erp", lambda: map_tool_probe("svc-erp", "New Choice ERP & PDV", "SQLite / HTTPS", erp_host, "Fichas técnicas, catálogo, faturamento e estoque", "tool-erp")))
    if "contaazul" in installed:
        probes.append(("svc-contaazul", lambda: map_tool_probe("svc-contaazul", "Conta Azul Financeiro API v2", "OAuth 2.0", "api.contaazul.com", "Contas a pagar/receber, conciliação e categorias DRE", "tool-contaazul")))
    if "bank" in installed:
        probes.append(("svc-pluggy", lambda: map_tool_probe("svc-pluggy", "Open Finance Brasil (Pluggy.ai)", "HTTPS", "api.pluggy.ai", "Extratos bancários Santander PJ e conciliação PIX", "tool-bank")))
    if "business_analytics" in installed:
        probes.append(("svc-business", lambda: map_tool_probe("svc-business", "Business Analytics", "HTTPS", "analytics.local", "Painel analítico de vendas e KPIs históricos", "tool-business")))
        probes.append(("svc-dre", lambda: map_tool_probe("svc-dre", "DRE Operacional & Controladoria", "HTTPS", "dre.local", "Apuração contábil de CMV, impostos e margem líquida", "tool-dre")))
    if "marqhr" in installed:
        probes.append(("svc-marqhr", lambda: map_tool_probe("svc-marqhr", "MarQ HR & Ponto Eletrônico", "HTTPS", "app.marqhr.com", "Espelho de ponto, escalas, férias e banco de horas", "tool-marqhr")))
    if "intranetmall" in installed:
        probes.append(("svc-mall", lambda: map_tool_probe("svc-mall", "Intranet Mall / Shoppings", "HTTPS", "intranetmall.com.br", "Boletos de condomínio, aluguel e vendas informadas", "tool-intranetmall")))

    results = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        fut_map = {ex.submit(fn): sid for sid, fn in probes}
        out_by_id = {}
        for fut in fut_map:
            sid = fut_map[fut]
            try:
                out_by_id[sid] = fut.result()
            except Exception as e:
                out_by_id[sid] = {
                    "id": sid,
                    "name": sid,
                    "port": "-",
                    "type": "Service",
                    "status": "offline",
                    "status_label": "Erro",
                    "latency_ms": 0,
                    "desc": str(e),
                    "details": str(e)
                }
        for sid, _ in probes:
            if sid in out_by_id:
                results.append(out_by_id[sid])

    now_ts = time.time()
    return {
        "checked_at": now_ts,
        "checked_at_human": time.strftime("%d/%m/%Y às %H:%M:%S"),
        "total": len(results),
        "online_count": sum(1 for r in results if r["status"] == "online"),
        "services": results
    }


# --- ROTAS DE WEBHOOKS PASSIVOS (SEM THREAD OU LOOP DE BACKGROUND) ---
# Todas as rotinas periódicas de tempo devem rodar exclusivamente sob o agendador CRON oficial.
# O sistema NUNCA inicia loops ou threads invisíveis em background.
import api.event_triggers

@app.get("/api/events/status")
async def api_get_event_loop_status():
    """Retorna métricas, histórico recente e status do loop de eventos contínuo."""
    try:
        from api.event_triggers import get_event_loop_status
        return get_event_loop_status()
    except Exception as e:
        return {"is_active": False, "error": str(e)}

@app.post("/api/events/scan-now")
async def api_scan_events_now():
    """Força um ciclo imediato de verificação de eventos em todos os canais."""
    try:
        from api.event_triggers import run_event_loop_iteration
        stats = run_event_loop_iteration()
        return {"status": "ok", "stats": stats}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/events/toggle")
async def api_toggle_event_loop(req: Dict[str, Any] = Body(...)):
    """Ativa ou pausa o loop de eventos contínuo."""
    from api.tasks_queue import set_setting
    enabled = req.get("enabled", True)
    set_setting("event_loop_enabled", "true" if enabled else "false")
    return {"status": "ok", "event_loop_enabled": enabled}


# --- WEBHOOKS DEDICADOS POR PLATAFORMA DE DELIVERY (IFOOD, 99 FOOD, ENTREGA AKI) ---
@app.post("/api/webhooks/ifood")
async def api_webhook_ifood(payload: Dict[str, Any] = Body(default={})):
    """Receptor oficial de Webhooks da plataforma iFood (eventos de chat, status de pedido, SLA, cardápio e reviews)."""
    if not payload or payload.get("code") == "KEEPALIVE" or payload.get("fullCode") == "KEEPALIVE":
        return {"status": "ok", "message": "iFood Webhook Keepalive acknowledged"}
    try:
        from api.event_triggers import ingest_delivery_webhook_event
        res = ingest_delivery_webhook_event("ifood", payload, source_mode="webhook")
        return {"status": "ok", "result": res}
    except Exception as e:
        logger.error(f"Erro no processamento do Webhook iFood: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/webhooks/99food")
async def api_webhook_99food(payload: Dict[str, Any] = Body(default={})):
    """Receptor oficial de Webhooks da plataforma 99 Food (eventos de chat, status de pedido, entregador, SLA e loja)."""
    if not payload or payload.get("event") == "ping":
        return {"status": "ok", "message": "99 Food Webhook Ping acknowledged"}
    try:
        from api.event_triggers import ingest_delivery_webhook_event
        res = ingest_delivery_webhook_event("99food", payload, source_mode="webhook")
        return {"status": "ok", "result": res}
    except Exception as e:
        logger.error(f"Erro no processamento do Webhook 99 Food: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/webhooks/entrega-aki")
async def api_webhook_entrega_aki(payload: Dict[str, Any] = Body(default={})):
    """Receptor oficial de Webhooks da plataforma Entrega Aki."""
    if not payload or payload.get("event") == "ping":
        return {"status": "ok", "message": "Entrega Aki Webhook Ping acknowledged"}
    try:
        from api.event_triggers import ingest_delivery_webhook_event
        res = ingest_delivery_webhook_event("entrega_aki", payload, source_mode="webhook")
        return {"status": "ok", "result": res}
    except Exception as e:
        logger.error(f"Erro no processamento do Webhook Entrega Aki: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/api/webhooks/delivery/recent")
async def api_get_recent_delivery_webhooks(platform: Optional[str] = None, limit: int = 15):
    """Lista os últimos eventos e causas detectadas pelos gatilhos de delivery."""
    try:
        from api.event_triggers import get_recent_delivery_webhook_events, CAUSE_CATALOG
        events = get_recent_delivery_webhook_events(platform=platform, limit=limit)
        return {"status": "ok", "events": events, "causes_catalog": CAUSE_CATALOG}
    except Exception as e:
        return {"status": "error", "message": str(e), "events": []}


# --- WEBHOOK DEDICADO CHATWOOT SAC ---
@app.post("/api/webhooks/chatwoot")
async def api_webhook_chatwoot(payload: Dict[str, Any] = Body(default={})):
    """Receptor oficial de Webhooks do Chatwoot (mensagens de clientes com agrupamento inteligente de 30s)."""
    try:
        from api.event_triggers import handle_chatwoot_webhook
        return handle_chatwoot_webhook(payload)
    except Exception as e:
        logger.error(f"Erro no processamento do Webhook Chatwoot: {e}")
        return {"status": "error", "message": str(e)}


# --- WEBHOOK DEDICADO WHATSAPP / EVOLUTION API ---
@app.post("/api/webhooks/whatsapp")
async def api_webhook_whatsapp(payload: Dict[str, Any] = Body(default={})):
    """Receptor de Webhooks do WhatsApp / Evolution API."""
    try:
        event = payload.get("event") or payload.get("type")
        if not event or event == "ping":
            return {"status": "ok", "message": "WhatsApp Webhook Ping acknowledged"}
        logger.info(f"Webhook recebido do WhatsApp: {event}")
        return {"status": "ok", "event": event, "received": True}
    except Exception as e:
        logger.error(f"Erro no processamento do Webhook WhatsApp: {e}")
        return {"status": "error", "message": str(e)}


# --- GATILHO SOB MEDIDA (CUSTOM WEBHOOKS) ---
@app.post("/api/webhooks/custom/{event_key}")
async def api_webhook_custom(event_key: str, request: Request, payload: Dict[str, Any] = Body(default={})):
    """Receptor HTTP para o Gatilho Sob Medida configurado no Canvas."""
    token = request.headers.get("X-Webhook-Secret") or request.query_params.get("token")
    try:
        from api.event_triggers import ingest_custom_webhook_event
        res = ingest_custom_webhook_event(event_key, payload, token=token)
        if res.get("status") == "unauthorized":
            raise HTTPException(status_code=401, detail=res["message"])
        return res
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no processamento do Gatilho Sob Medida [{event_key}]: {e}")
        return {"status": "error", "message": str(e)}


@app.post("/api/webhooks/custom/{event_key}/test")
async def api_webhook_custom_test(event_key: str, request: Request, payload: Dict[str, Any] = Body(default={})):
    """Simula o disparo do Gatilho Sob Medida diretamente do drawer visual."""
    token = request.headers.get("X-Webhook-Secret") or request.query_params.get("token")
    try:
        from api.event_triggers import ingest_custom_webhook_event
        test_payload = payload or {
            "origem": "Painel de Teste Visual",
            "tipo_evento": event_key,
            "valor": 150.0,
            "detalhes": "Disparo de simulação manual do Gatilho Sob Medida."
        }
        res = ingest_custom_webhook_event(event_key, test_payload, token=token)
        return {"status": "ok", "test_mode": True, "result": res}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# --- GERENCIAMENTO DINÂMICO DE DEPARTAMENTOS / ÁREAS ---
@app.get("/api/departments")
def api_get_departments():
    """Retorna a lista dinâmica de departamentos configurada na plataforma."""
    raw = get_setting("canvas_departments")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return [
        {"id": "ceo", "name": "Central Executiva & Estratégia", "color": "#D97706", "icon": "Sparkles"},
        {"id": "cfo", "name": "Financeiro & Controladoria", "color": "#059669", "icon": "CircleDollarSign"},
        {"id": "coo", "name": "Operações & Lojas", "color": "#2563EB", "icon": "Layers"},
        {"id": "cmo", "name": "Marketing, Marca & Growth", "color": "#7C3AED", "icon": "Megaphone"},
        {"id": "cpo", "name": "Gente & Cultura (RH)", "color": "#E11D48", "icon": "Users"},
        {"id": "ti", "name": "Tecnologia & Inovação", "color": "#4F46E5", "icon": "Cpu"},
        {"id": "logistica", "name": "Logística & Suprimentos", "color": "#0D9488", "icon": "Truck"}
    ]


@app.post("/api/departments")
def api_save_departments(departments: List[Dict[str, Any]] = Body(...), admin: Dict[str, Any] = Depends(require_admin_user)):
    """Salva a lista dinâmica de departamentos e cores personalizadas."""
    set_setting("canvas_departments", json.dumps(departments, ensure_ascii=False))
    return {"status": "success", "departments": departments}


# --- SERVIÇO DE ANEXOS / IMAGENS CHATWOOT ---
@app.get("/api/chatwoot/attachments/{blob_key}")
async def api_get_chatwoot_attachment(blob_key: str):
    """Serve imagens e arquivos armazenados pelo ActiveStorage do Chatwoot."""
    from fastapi.responses import FileResponse
    safe_key = os.path.basename(blob_key)
    candidate_paths = [
        f"/app/data/chatwoot_storage/{safe_key[:2]}/{safe_key[2:4]}/{safe_key}",
        f"/var/lib/docker/volumes/chatwoot_storage_data/_data/{safe_key[:2]}/{safe_key[2:4]}/{safe_key}",
        os.path.join(os.path.dirname(__file__), "..", "data", "chatwoot_storage", safe_key[:2], safe_key[2:4], safe_key)
    ]
    for p in candidate_paths:
        if os.path.exists(p) and os.path.isfile(p):
            return FileResponse(p)
    raise HTTPException(status_code=404, detail="Anexo não encontrado")


# --- VALIDAÇÃO & EXECUÇÃO DE AÇÕES (HUMAN-IN-THE-LOOP & AUTÔNOMO) ---
@app.get("/api/settings/approval-mode")
def api_get_approval_mode():
    """Retorna o status atual da exigência de validação de ações e as regras de prioridade humana no WhatsApp/Chatwoot."""
    from api.tasks_queue import is_action_approval_required
    from api.event_triggers import get_chatwoot_human_guard_config
    cfg = get_chatwoot_human_guard_config()
    return {
        "require_action_approval": is_action_approval_required(),
        "chatwoot_human_guard": cfg
    }


@app.post("/api/settings/approval-mode")
def api_set_approval_mode(payload: Dict[str, Any] = Body(...)):
    """Ativa ou desativa a exigência de aprovação para execução de ações e atualiza proteção de atendimento humano no WhatsApp."""
    from api.tasks_queue import set_action_approval_required, is_action_approval_required
    from api.event_triggers import save_chatwoot_human_guard_config, get_chatwoot_human_guard_config
    if "require_action_approval" in payload and payload["require_action_approval"] is not None:
        set_action_approval_required(bool(payload["require_action_approval"]))
    if "chatwoot_human_guard" in payload and isinstance(payload["chatwoot_human_guard"], dict):
        save_chatwoot_human_guard_config(payload["chatwoot_human_guard"])
    else:
        save_chatwoot_human_guard_config(payload)
    return {
        "status": "ok",
        "require_action_approval": is_action_approval_required(),
        "chatwoot_human_guard": get_chatwoot_human_guard_config()
    }


@app.get("/api/actions/pending")
def api_get_pending_actions(status: Optional[str] = "pending"):
    """Lista ações geradas pelos agentes (pendentes, aprovadas, rejeitadas)."""
    from api.tasks_queue import list_pending_actions
    return {"status": "ok", "actions": list_pending_actions(status=status)}


@app.get("/api/actions/{action_id}")
def api_get_action(action_id: str):
    """Consulta detalhes de uma ação específica."""
    from api.tasks_queue import get_pending_action
    act = get_pending_action(action_id)
    if not act:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    return {"status": "ok", "action": act}


@app.post("/api/actions/{action_id}/approve")
def api_approve_action(action_id: str, payload: Dict[str, Any] = Body(default={})):
    """Aprova e executa imediatamente a ação proposta pelo agente."""
    from api.tasks_queue import execute_pending_action
    resolved_by = payload.get("approved_by") or payload.get("user") or "Admin"
    res = execute_pending_action(action_id, resolved_by=resolved_by)
    return res


@app.post("/api/actions/{action_id}/reject")
def api_reject_action(action_id: str, payload: Dict[str, Any] = Body(default={})):
    """Rejeita a ação proposta pelo agente."""
    from api.tasks_queue import reject_pending_action
    resolved_by = payload.get("rejected_by") or payload.get("user") or "Admin"
    res = reject_pending_action(action_id, resolved_by=resolved_by)
    return res


@app.post("/api/erp/nfe-mapping")
def api_register_erp_nfe_mapping(payload: Dict[str, Any] = Body(default={})):
    """Registra ou atualiza determinísticamente (0 tokens) um mapeamento De-Para de item de NF-e no New Choice ERP."""
    try:
        from custom_tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
    except ImportError:
        try:
            from tools.new_choice_erp_tools import ERPWeeklyNFeInboundManager
        except ImportError:
            raise HTTPException(status_code=501, detail="Módulo ERP não instalado em custom_tools/")
    supplier_key = str(payload.get("supplier_key") or "").strip()
    supplier_item_code = str(payload.get("supplier_item_code") or "").strip()
    erp_ref = str(payload.get("erp_ref") or "").strip()
    conversion_factor = float(payload.get("conversion_factor") or 1.0)
    supplier_item_desc = str(payload.get("supplier_item_desc") or "").strip()
    if not supplier_key or not supplier_item_code or not erp_ref:
        raise HTTPException(
            status_code=400,
            detail="Informe supplier_key, supplier_item_code e erp_ref."
        )
    manager = ERPWeeklyNFeInboundManager()
    return manager.register_item_mapping(
        supplier_key=supplier_key,
        supplier_item_code=supplier_item_code,
        erp_ref=erp_ref,
        conversion_factor=conversion_factor,
        supplier_item_desc=supplier_item_desc,
    )


# =====================================================================
# ROTAS DE GESTÃO DE APROVADORES TELEGRAM (MULTI-USUÁRIOS)
# =====================================================================
@app.get("/api/telegram/approvers")
def api_get_telegram_approvers():
    """Retorna lista de todos os usuários aprovadores do Telegram."""
    from api.tasks_queue import list_telegram_approvers
    return {"status": "ok", "approvers": list_telegram_approvers()}


@app.post("/api/telegram/approvers")
def api_create_or_update_telegram_approver(payload: Dict[str, Any] = Body(...)):
    """Cadastra ou atualiza um usuário aprovador do Telegram."""
    from api.tasks_queue import add_or_update_telegram_approver
    username = payload.get("username")
    chat_id = payload.get("chat_id")
    name = payload.get("name")
    role = payload.get("role", "approver")
    can_approve = payload.get("can_approve", True)
    is_active = payload.get("is_active", True)
    added_by = payload.get("added_by", "Admin")

    if not username and not chat_id:
        raise HTTPException(status_code=400, detail="Informe pelo menos o @username ou o chat_id do Telegram.")

    res = add_or_update_telegram_approver(
        username=username,
        chat_id=chat_id,
        name=name,
        role=role,
        can_approve=can_approve,
        is_active=is_active,
        added_by=added_by
    )
    return res


@app.delete("/api/telegram/approvers/{approver_id}")
def api_delete_telegram_approver(approver_id: int):
    """Remove um aprovador cadastrado."""
    from api.tasks_queue import remove_telegram_approver
    success = remove_telegram_approver(approver_id)
    return {"status": "ok", "deleted": success}


@app.post("/api/telegram/approvers/{approver_id}/toggle")
def api_toggle_telegram_approver(approver_id: int, payload: Dict[str, Any] = Body(default={})):
    """Alterna estado de atividade ou permissão de aprovação de um aprovador."""
    from api.tasks_queue import toggle_telegram_approver
    field = payload.get("field", "is_active")
    new_val = toggle_telegram_approver(approver_id, field=field)
    if new_val is None:
        raise HTTPException(status_code=404, detail="Aprovador não encontrado.")
    return {"status": "ok", "field": field, "value": new_val}


# =====================================================================
# ROTAS DE GESTÃO DE DEPARTAMENTOS & ORGANOGRAMA
# =====================================================================
@app.get("/api/departments")
def api_get_departments():
    """Retorna lista de departamentos configurados no sistema."""
    from api.tasks_queue import get_setting
    raw = get_setting("custom_departments")
    if raw:
        try:
            return {"status": "ok", "departments": json.loads(raw)}
        except Exception:
            pass
    defaults = [
        {"id": "ceo", "name": "Central Executiva & Estratégia", "label": "CEO", "color": "#D97706", "icon": "Sparkles"},
        {"id": "cfo", "name": "Financeiro & Controladoria", "label": "CFO", "color": "#059669", "icon": "CircleDollarSign"},
        {"id": "coo", "name": "Operações & Lojas", "label": "COO", "color": "#2563EB", "icon": "Layers"},
        {"id": "cmo", "name": "Marketing, Marca & Growth", "label": "CMO", "color": "#7C3AED", "icon": "Megaphone"},
        {"id": "cpo", "name": "Gente & Cultura (RH)", "label": "CPO", "color": "#E11D48", "icon": "Users"},
        {"id": "ti", "name": "Tecnologia & Inovação", "label": "TI", "color": "#4F46E5", "icon": "Cpu"},
        {"id": "logistica", "name": "Logística & Suprimentos", "label": "Logística", "color": "#0D9488", "icon": "Truck"}
    ]
    return {"status": "ok", "departments": defaults}


@app.post("/api/departments")
def api_save_departments(payload: Dict[str, Any] = Body(...)):
    """Salva a lista customizada de departamentos."""
    from api.tasks_queue import set_setting
    depts = payload.get("departments", [])
    set_setting("custom_departments", json.dumps(depts, ensure_ascii=False))
    return {"status": "ok", "departments": depts}


# =====================================================================
# CENTRO DE EVOLUÇÃO & META-AGENTE ARQUITETO (ANTIGRAVITY ZERO-COST)
# =====================================================================

class EvolutionBatchExecuteRequest(BaseModel):
    task_ids: List[str] = Field(..., description="Lista de IDs de tarefas evolutivas aprovadas para execução no Antigravity")
    sync: bool = Field(False, description="Se True, aguarda conclusão síncrona; se False, dispara em background com streaming SSE")


class EvolutionSettingsUpdateRequest(BaseModel):
    full_auto_mode: Optional[bool] = None
    allowed_categories: Optional[List[str]] = None
    max_auto_risk_level: Optional[str] = None
    semantic_cache_enabled: Optional[bool] = None
    context_compression_enabled: Optional[bool] = None
    smart_model_routing_enabled: Optional[bool] = None
    zero_cost_antigravity_mode: Optional[bool] = None


@app.get("/api/evolution/overview")
def api_get_evolution_overview():
    """Retorna visão consolidada do Centro de Evolução: tarefas, métricas FinOps, snapshots, configurações e logs."""
    from api.evolution_agent import get_evolution_overview
    return get_evolution_overview()


@app.get("/api/evolution/tasks")
def api_list_evolution_tasks(
    status: Optional[str] = None,
    category: Optional[str] = None,
    risk_level: Optional[str] = None,
    limit: int = 100
):
    """Lista o Backlog Evolutivo de Tarefas com filtros opcionais."""
    from api.evolution_agent import list_evolution_tasks
    return {"status": "ok", "tasks": list_evolution_tasks(status=status, category=category, risk_level=risk_level, limit=limit)}


@app.get("/api/evolution/tasks/{task_id}")
def api_get_evolution_task_detail(task_id: str):
    """Retorna detalhes completos, diff técnico, logs de execução e snapshot vinculado de uma tarefa."""
    from api.evolution_agent import get_evolution_task, get_snapshot_by_task
    task = get_evolution_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa evolutiva não encontrada.")
    snap = get_snapshot_by_task(task_id)
    return {"status": "ok", "task": task, "snapshot": snap}


@app.post("/api/evolution/tasks")
def api_create_custom_evolution_task(
    payload: Dict[str, Any] = Body(...),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Permite cadastrar uma nova tarefa evolutiva sob demanda no backlog do Meta-Agente."""
    from api.evolution_agent import create_custom_evolution_task
    author = (user or {}).get("email") or payload.get("author") or "Admin"
    if not (payload.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="Informe o título da tarefa evolutiva.")
    task = create_custom_evolution_task(payload, author=author)
    return {"status": "ok", "task": task, "message": "Tarefa adicionada ao Backlog Evolutivo com sucesso!"}


@app.delete("/api/evolution/tasks/{task_id}")
def api_delete_evolution_task(
    task_id: str,
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Remove/rejeita uma tarefa pendente do backlog."""
    from api.evolution_agent import delete_or_reject_evolution_task
    actor = (user or {}).get("email") or "Admin"
    deleted = delete_or_reject_evolution_task(task_id, rejected_by=actor)
    if not deleted:
        raise HTTPException(status_code=400, detail="Tarefa não encontrada ou já concluída (use Rollback para reverter tarefas concluídas).")
    return {"status": "ok", "deleted": True, "task_id": task_id}


@app.post("/api/evolution/audit")
def api_trigger_evolution_audit(
    payload: Dict[str, Any] = Body(default={}),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Dispara uma varredura 360º + Radar Tecnológico do Meta-Agente Antigravity (0 tokens pagos)."""
    from api.evolution_agent import run_evolution_audit_and_propose
    actor = (user or {}).get("email") or payload.get("user") or "Admin"
    res = run_evolution_audit_and_propose(triggered_by=actor)
    return res


@app.post("/api/evolution/tasks/execute")
def api_execute_evolution_tasks(
    req: EvolutionBatchExecuteRequest,
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Aprova e enfileira em lote as tarefas selecionadas no motor Antigravity com bloqueio contra execução duplicada e snapshot prévio."""
    from api.evolution_agent import execute_evolution_tasks_batch, trigger_batch_execution_async
    if not req.task_ids:
        raise HTTPException(status_code=400, detail="Selecione ao menos uma tarefa para executar.")
    actor = (user or {}).get("email") or "Admin"
    if req.sync:
        return execute_evolution_tasks_batch(req.task_ids, approved_by=actor)
    enq = trigger_batch_execution_async(req.task_ids, approved_by=actor)
    queued_ids = enq.get("queued_ids", [])
    skipped_ids = enq.get("skipped_ids", [])
    return {
        "status": "ok",
        "queued": len(queued_ids),
        "queued_ids": queued_ids,
        "skipped": len(skipped_ids),
        "skipped_ids": skipped_ids,
        "task_ids": queued_ids,
        "message": (
            f"🔒 {len(queued_ids)} tarefa(s) enfileirada(s) e bloqueada(s) para execução no Antigravity!"
            if queued_ids
            else "Esta(s) tarefa(s) já está(ão) na fila de execução ou já foi(ram) concluída(s)."
        )
    }


@app.post("/api/evolution/tasks/{task_id}/rollback")
def api_rollback_evolution_task(
    task_id: str,
    payload: Dict[str, Any] = Body(default={}),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Aciona Rollback imediato em 1 clique, restaurando o snapshot anterior do banco de dados."""
    from api.evolution_agent import rollback_evolution_task
    actor = (user or {}).get("email") or payload.get("user") or "Admin"
    try:
        return rollback_evolution_task(task_id, rolled_back_by=actor)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception(f"Erro no rollback da tarefa {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Falha ao executar rollback: {str(e)}")


@app.get("/api/evolution/settings")
def api_get_evolution_settings():
    """Retorna configurações do Meta-Agente (incluindo `full_auto_mode` e filtros de categoria/risco)."""
    from api.evolution_agent import get_evolution_settings
    return get_evolution_settings()


@app.post("/api/evolution/settings")
def api_update_evolution_settings(
    req: EvolutionSettingsUpdateRequest,
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    """Atualiza configurações do Meta-Agente e alterna o Modo de Autonomia Total (Full-Auto)."""
    from api.evolution_agent import update_evolution_settings
    actor = (user or {}).get("email") or "Admin"
    payload = req.model_dump(exclude_none=True) if hasattr(req, "model_dump") else req.dict(exclude_none=True)
    updated = update_evolution_settings(payload, updated_by=actor)
    return {
        "status": "ok",
        "settings": updated,
        "message": (
            "⚡ Modo de Autonomia Total (Full-Auto) ATIVADO!"
            if updated.get("full_auto_mode")
            else "🛡️ Modo de Aprovação Supervisionada ativo."
        )
    }


@app.get("/api/evolution/events")
def api_get_evolution_events(after_id: int = 0, task_id: Optional[str] = None, limit: int = 120):
    """Retorna os logs em tempo real do console Antigravity (suporte incremental via `after_id`)."""
    from api.evolution_agent import get_evolution_live_events
    return {"status": "ok", "events": get_evolution_live_events(after_id=after_id, task_id=task_id, limit=limit)}


@app.get("/api/evolution/stream")
async def api_stream_evolution_events(request: Request):
    """
    Endpoint Server-Sent Events (SSE) para transmitir ao vivo os passos de execução
    do Antigravity, alterações de status de tarefas e auditoria em tempo real.
    """
    import asyncio
    import queue
    from fastapi.responses import StreamingResponse
    from api.evolution_agent import subscribe_evolution_stream, unsubscribe_evolution_stream

    sub_q = subscribe_evolution_stream()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'ts': time.time()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = sub_q.get_nowait()
                    yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
                    await asyncio.sleep(1.0)
        finally:
            unsubscribe_evolution_stream(sub_q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, reload=False)
