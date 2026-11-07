"""Ferramenta MCP / Conector Corporativo com o Notion Workspace.

Permite aos agentes da AI Board consultar:
1. Dados cadastrais da empresa (CNPJ, Razão Social, Contas Bancárias).
2. Senhas e acessos a sistemas operacionais documentados no Notion.
3. POPs, manuais, procedimentos internos e contatos de fornecedores/parceiros.
4. Busca semântica e leitura de páginas completas do Notion da organização.
"""

import os
import json
import time
import logging
import requests
from typing import Type, Optional, Dict, Any, List
from pydantic import BaseModel, Field

try:
    from crewai.tools import BaseTool
except ImportError:
    class BaseTool:
        """Fallback mock quando CrewAI não está no ambiente local."""
        pass

logger = logging.getLogger("notion_workspace_tools")

NOTION_API_URL = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
DEFAULT_ROOT_PAGE_ID = os.getenv("NOTION_ROOT_PAGE_ID", "")
NOTION_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "notion_config.json")


def _clean_page_id(raw_id: str) -> str:
    """Extrai o UUID de 32 caracteres de uma URL do Notion ou formata com hífens se necessário."""
    clean = raw_id.strip()
    if "/" in clean:
        clean = clean.split("/")[-1]
    if "?" in clean:
        clean = clean.split("?")[0]
    if "-" in clean and len(clean.replace("-", "")) == 32:
        return clean
    clean = clean.replace("-", "")
    if len(clean) == 32:
        # Formata no padrão 8-4-4-4-12
        return f"{clean[:8]}-{clean[8:12]}-{clean[12:16]}-{clean[16:20]}-{clean[20:]}"
    return raw_id


class NotionClient:
    """Cliente oficial para a API v1 do Notion."""

    def __init__(self, api_key: Optional[str] = None, root_page_id: Optional[str] = None):
        self.api_key = (api_key or os.getenv("NOTION_API_KEY") or os.getenv("NOTION_TOKEN") or "").strip()
        self.root_page_id = (root_page_id or os.getenv("NOTION_ROOT_PAGE_ID") or DEFAULT_ROOT_PAGE_ID).strip()

        # Carrega chave persistida em data/ se não estiver nas variáveis de ambiente
        if not self.api_key and os.path.exists(NOTION_CONFIG_FILE):
            try:
                with open(NOTION_CONFIG_FILE, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    self.api_key = cfg.get("api_key", "").strip()
                    if cfg.get("root_page_id"):
                        self.root_page_id = cfg["root_page_id"].strip()
            except Exception as e:
                logger.debug(f"Erro ao ler {NOTION_CONFIG_FILE}: {e}")

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        }

    def test_connection(self) -> Dict[str, Any]:
        """Testa se o token de integração do Notion é válido e retorna o nome do bot/workspace."""
        start = time.time()
        if not self.api_key or self.api_key == "your_notion_api_key":
            return {
                "status": "warning",
                "status_label": "Token Pendente",
                "is_configured": False,
                "latency_ms": 1,
                "details": "Chave de integração do Notion (NOTION_API_KEY / Internal Secret) pendente de configuração."
            }

        try:
            resp = requests.get(f"{NOTION_API_URL}/users/me", headers=self.headers, timeout=8)
            latency = int((time.time() - start) * 1000)

            if resp.status_code == 200:
                data = resp.json()
                bot_name = data.get("name") or "AI Board Integration"
                ws_name = data.get("bot", {}).get("workspace_name") or f"{os.getenv('COMPANY_NAME', 'AI Board')} Notion"
                return {
                    "status": "online",
                    "status_label": "Online (Conectado)",
                    "is_configured": True,
                    "latency_ms": latency,
                    "bot_name": bot_name,
                    "workspace_name": ws_name,
                    "details": f"Conexão com Notion Workspace confirmada. Bot: '{bot_name}', Workspace: '{ws_name}'."
                }
            elif resp.status_code == 401:
                return {
                    "status": "offline",
                    "status_label": "Token Inválido",
                    "is_configured": False,
                    "latency_ms": latency,
                    "details": "Token do Notion rejeitado (HTTP 401). Verifique se o Internal Integration Secret está correto."
                }
            else:
                return {
                    "status": "warning",
                    "status_label": f"HTTP {resp.status_code}",
                    "is_configured": False,
                    "latency_ms": latency,
                    "details": f"Notion API retornou status HTTP {resp.status_code}: {resp.text[:120]}"
                }
        except Exception as e:
            latency = int((time.time() - start) * 1000)
            return {
                "status": "offline",
                "status_label": "Falha de Conexão",
                "is_configured": False,
                "latency_ms": latency,
                "details": f"Erro ao contatar API do Notion: {str(e)[:120]}"
            }

    def search(self, query: str, filter_type: Optional[str] = None, page_size: int = 8) -> List[Dict[str, Any]]:
        """Pesquisa páginas e bancos de dados no Notion por palavra-chave."""
        if not self.api_key:
            return []

        payload: Dict[str, Any] = {
            "query": query,
            "page_size": page_size
        }
        if filter_type in ("page", "database"):
            payload["filter"] = {"value": filter_type, "property": "object"}

        try:
            resp = requests.post(f"{NOTION_API_URL}/search", headers=self.headers, json=payload, timeout=12)
            if resp.status_code != 200:
                logger.warning(f"Erro na busca Notion: {resp.status_code} - {resp.text[:150]}")
                return []

            results = resp.json().get("results", [])
            parsed = []
            for item in results:
                title = "Sem Título"
                # Extrai título de página
                if item.get("object") == "page":
                    props = item.get("properties", {})
                    for p in props.values():
                        if p.get("type") == "title" and p.get("title"):
                            title = "".join([t.get("plain_text", "") for t in p["title"]])
                            break
                elif item.get("object") == "database":
                    d_title = item.get("title", [])
                    if d_title:
                        title = "".join([t.get("plain_text", "") for t in d_title])

                parsed.append({
                    "id": item.get("id"),
                    "object": item.get("object"),
                    "title": title,
                    "url": item.get("url"),
                    "last_edited_time": item.get("last_edited_time")
                })
            return parsed
        except Exception as e:
            logger.error(f"Exceção ao buscar no Notion: {e}")
            return []

    def read_blocks(self, block_id: str, limit: int = 100) -> str:
        """Lê recursivamente o conteúdo de blocos de uma página e converte em Markdown estruturado."""
        if not self.api_key:
            return "API Key do Notion não configurada."

        clean_id = _clean_page_id(block_id)
        url = f"{NOTION_API_URL}/blocks/{clean_id}/children?page_size={limit}"

        try:
            resp = requests.get(url, headers=self.headers, timeout=12)
            if resp.status_code != 200:
                return f"Erro ao ler página {block_id} do Notion (HTTP {resp.status_code}): {resp.text[:150]}"

            blocks = resp.json().get("results", [])
            lines: List[str] = []

            for b in blocks:
                b_type = b.get("type", "")
                data = b.get(b_type, {})
                rich_text = data.get("rich_text", [])
                text = "".join([t.get("plain_text", "") for t in rich_text])

                if b_type == "paragraph":
                    if text.strip():
                        lines.append(f"{text}\n")
                elif b_type == "heading_1":
                    lines.append(f"# {text}\n")
                elif b_type == "heading_2":
                    lines.append(f"## {text}\n")
                elif b_type == "heading_3":
                    lines.append(f"### {text}\n")
                elif b_type == "bulleted_list_item":
                    lines.append(f"• {text}")
                elif b_type == "numbered_list_item":
                    lines.append(f"1. {text}")
                elif b_type == "to_do":
                    check = "[x]" if data.get("checked") else "[ ]"
                    lines.append(f"{check} {text}")
                elif b_type == "callout":
                    icon = data.get("icon", {}).get("emoji", "💡")
                    lines.append(f"> {icon} {text}\n")
                elif b_type == "code":
                    lang = data.get("language", "")
                    lines.append(f"```{lang}\n{text}\n```\n")
                elif b_type == "child_page":
                    page_title = data.get("title", "Subpágina")
                    lines.append(f"📄 **Subpágina:** [{page_title}] (ID: {b.get('id')})")
                elif b_type == "child_database":
                    db_title = data.get("title", "Banco de Dados")
                    lines.append(f"📊 **Tabela/Banco:** [{db_title}] (ID: {b.get('id')})")

            return "\n".join(lines) if lines else "Página vazia ou sem blocos de texto reconhecidos."
        except Exception as e:
            return f"Falha ao ler blocos do Notion: {str(e)}"


# --- SCHEMAS PARA O CREWAI ---

class NotionSearchInput(BaseModel):
    query: str = Field(..., description="Palavra-chave a pesquisar no Notion (ex: 'CNPJ', 'conta bancária', 'senha', 'fornecedor').")
    filter_type: Optional[str] = Field(None, description="Filtro opcional: 'page' para páginas ou 'database' para bancos de dados.")


class NotionReadPageInput(BaseModel):
    page_id_or_url: str = Field(..., description="ID da página (UUID de 32 chars) ou URL completa da página do Notion.")


class NotionCompanyInfoInput(BaseModel):
    info_topic: str = Field("cadastro_geral", description="Tópico de informação desejado: 'cnpj', 'banco', 'senhas', 'contatos' ou 'cadastro_geral'.")


# --- CREWAI TOOLS ---

class NotionSearchTool(BaseTool):
    name: str = "notion_search"
    description: str = (
        "Pesquisa no Notion corporativo da empresa por manuais, dados de cadastro, contas bancárias, "
        "senhas, procedimentos e anotações dos fundadores e da equipe."
    )
    args_schema: Type[BaseModel] = NotionSearchInput

    def _run(self, query: str, filter_type: Optional[str] = None) -> str:
        client = NotionClient()
        results = client.search(query, filter_type=filter_type)
        if not results:
            return f"Nenhum resultado encontrado no Notion para a busca '{query}'. Verifique se o termo está correto ou se a página foi compartilhada com a integração."

        out = [f"=== RESULTADOS DA BUSCA NO NOTION ('{query}') ==="]
        for r in results:
            out.append(f"- **{r['title']}** ({r['object']})")
            out.append(f"  ID: {r['id']}")
            out.append(f"  URL: {r['url']}")
            out.append(f"  Última edição: {r['last_edited_time']}")
        return "\n".join(out)


class NotionReadPageTool(BaseTool):
    name: str = "notion_read_page"
    description: str = (
        "Lê o conteúdo completo formatado em Markdown de uma página específica do Notion da empresa, "
        "incluindo textos, tópicos, tabelas, senhas e checklists."
    )
    args_schema: Type[BaseModel] = NotionReadPageInput

    def _run(self, page_id_or_url: str) -> str:
        client = NotionClient()
        return client.read_blocks(page_id_or_url)


class NotionCompanyInfoTool(BaseTool):
    name: str = "notion_company_info"
    description: str = (
        "Consulta direta das informações vitais da empresa cadastradas no Notion central "
        "(CNPJ, dados bancários PJ, senhas dos portais operacionais e contatos de emergência)."
    )
    args_schema: Type[BaseModel] = NotionCompanyInfoInput

    def _run(self, info_topic: str = "cadastro_geral") -> str:
        client = NotionClient()
        root_id = client.root_page_id or DEFAULT_ROOT_PAGE_ID
        content = client.read_blocks(root_id)
        if "Erro" in content or "Falha" in content:
            # Tenta busca textual caso o ID direto falhe
            search_res = client.search(info_topic)
            if search_res:
                return client.read_blocks(search_res[0]["id"])
        return content
