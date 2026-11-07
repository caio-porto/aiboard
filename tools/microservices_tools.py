"""Microservices Tools (Chatwoot, Freescout, Activepieces, Evolution API)."""
import os
import json
import logging
from typing import Type, Optional, Dict, Any, List
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

# --- CHATWOOT TOOL ---
def _get_chatwoot_db():
    import psycopg2
    return psycopg2.connect(
        host=os.getenv("CHATWOOT_DB_HOST", "chatwoot-postgres"),
        port=int(os.getenv("CHATWOOT_DB_PORT", "5432")),
        user=os.getenv("CHATWOOT_DB_USER", "postgres"),
        password=os.getenv("CHATWOOT_DB_PASS", ""),
        dbname=os.getenv("CHATWOOT_DB_NAME", "chatwoot_production"),
        connect_timeout=4
    )


class ChatwootQueryInput(BaseModel):
    query_type: str = Field("open_conversations", description="Tipo de consulta: 'open_conversations' (conversas abertas), 'recent_messages' (mensagens recentes com imagens) ou 'inspect_image' (analisa imagem via Gemini Vision).")
    conversation_id: Optional[int] = Field(None, description="ID da conversa opcional.")


class ChatwootTool(BaseTool):
    name: str = "chatwoot_service"
    description: str = "Consulta atendimentos, clientes, fotos e mensagens recentes no Chatwoot diretamente da base oficial."
    args_schema: Type[BaseModel] = ChatwootQueryInput

    def _run(self, query_type: str = "open_conversations", conversation_id: Optional[int] = None) -> str:
        try:
            conn = _get_chatwoot_db()
            with conn.cursor() as cur:
                if query_type in ("recent_messages", "messages", "inspect_image"):
                    filter_conv = "AND m.conversation_id = %s" if conversation_id else ""
                    params = (conversation_id,) if conversation_id else ()
                    cur.execute(f"""
                        SELECT m.id, m.conversation_id, m.content, m.created_at, c.display_id,
                               a.id as att_id, asb.key as blob_key, asb.filename, asb.content_type
                        FROM messages m
                        JOIN conversations c ON m.conversation_id = c.id
                        LEFT JOIN attachments a ON a.message_id = m.id
                        LEFT JOIN active_storage_attachments asa ON (asa.record_type = 'Attachment' AND asa.record_id = a.id)
                        LEFT JOIN active_storage_blobs asb ON asb.id = asa.blob_id
                        WHERE m.message_type = 0 {filter_conv}
                        ORDER BY m.id DESC
                        LIMIT 10;
                    """, params)
                    rows = cur.fetchall()
                    conn.close()

                    if not rows:
                        return "Chatwoot: Nenhuma mensagem recente encontrada."

                    out = [f"=== Mensagens Recentes Chatwoot ({len(rows)} registros) ==="]
                    for r in rows:
                        mid, cid, content, ctime, disp_id, att_id, blob_key, filename, ctype = r
                        ts = ctime.strftime("%d/%m %H:%M") if hasattr(ctime, "strftime") else str(ctime)
                        line = f"- [#{disp_id or cid}] ({ts}) Mensagem ID {mid}: {content or '(Sem texto)'}"
                        if blob_key:
                            line += f" | 📸 Anexo: {filename or 'imagem'} (Key: {blob_key})"
                        out.append(line)
                    return "\n".join(out)

                else:
                    cur.execute("""
                        SELECT c.id, c.display_id, c.status, c.created_at, c.updated_at
                        FROM conversations c
                        WHERE c.status = 0
                        ORDER BY c.updated_at DESC
                        LIMIT 15;
                    """)
                    rows = cur.fetchall()
                    conn.close()

                    out = [f"=== Conversas Abertas no Chatwoot ({len(rows)} ativas) ==="]
                    for r in rows:
                        cid, disp_id, status, ctime, utime = r
                        out.append(f"- Conversa #{disp_id or cid} (Atualizada: {utime})")
                    return "\n".join(out)
        except Exception as e:
            logger.warning(f"Erro ao consultar Chatwoot DB: {e}")
            return f"Erro ao consultar Chatwoot: {e}"

# --- FREESCOUT DIRECT MARIADB TOOLS (100% GRATUITO & SEGURO) ---
def _get_freescout_db():
    import pymysql
    host = os.getenv("FREESCOUT_DB_HOST", "freescout-db")
    port = int(os.getenv("FREESCOUT_DB_PORT", "3306"))
    user = os.getenv("FREESCOUT_DB_USER", "freescout")
    password = os.getenv("FREESCOUT_DB_PASS", "")
    db = os.getenv("FREESCOUT_DB_NAME", "freescout")
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=db,
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=4
    )

class FreescoutQueryInput(BaseModel):
    filter_status: str = Field("active", description="Filtro de chamados: 'active' (abertos/em andamento), 'closed' ou 'all'.")
    search: Optional[str] = Field(None, description="Termo de busca opcional (assunto ou email do cliente).")
    limit: Optional[int] = Field(10, description="Quantidade máxima de chamados a retornar.")

class FreescoutTool(BaseTool):
    name: str = "freescout_service"
    description: str = "Consulta chamados de suporte técnico, manutenção, recrutamento e operações no FreeScout Helpdesk diretamente da base de dados oficial."
    args_schema: Type[BaseModel] = FreescoutQueryInput

    def _run(self, filter_status: str = "active", search: Optional[str] = None, limit: int = 10) -> str:
        # 1. Tenta consulta direta via MariaDB (Opção recomendada & gratuita)
        try:
            conn = _get_freescout_db()
            with conn.cursor() as cur:
                where_clauses = ["1=1"]
                params = []

                if filter_status == "active":
                    where_clauses.append("c.status IN (1, 2)") # 1=Active, 2=Pending
                elif filter_status == "closed":
                    where_clauses.append("c.status = 3")

                if search:
                    where_clauses.append("(c.subject LIKE %s OR c.customer_email LIKE %s)")
                    params.extend([f"%{search}%", f"%{search}%"])

                sql = f"""
                    SELECT 
                        c.id, 
                        c.number, 
                        c.subject, 
                        c.customer_email, 
                        c.preview,
                        c.status,
                        c.created_at,
                        m.name AS mailbox_name
                    FROM conversations c
                    LEFT JOIN mailboxes m ON c.mailbox_id = m.id
                    WHERE {' AND '.join(where_clauses)}
                    ORDER BY c.id DESC
                    LIMIT %s
                """
                params.append(limit)
                cur.execute(sql, tuple(params))
                rows = cur.fetchall()

            conn.close()

            if not rows:
                return f"Nenhum chamado encontrado no FreeScout para status='{filter_status}' e busca='{search or ''}'."

            status_map = {1: "🟢 Aberto/Ativo", 2: "🟡 Aguardando", 3: "⚪ Fechado", 4: "🔴 Spam/Lixeira"}
            out = [f"=== FREESCOUT HELPDESK ({len(rows)} chamados encontrados) ==="]
            for r in rows:
                status_str = status_map.get(r['status'], f"Status {r['status']}")
                date_str = r['created_at'].strftime("%d/%m/%Y %H:%M") if r.get('created_at') else "Data n/d"
                out.append(
                    f"• Ticket #{r['number']} [{r['mailbox_name']}] - {status_str}\n"
                    f"  Assunto: {r['subject']}\n"
                    f"  Cliente: {r['customer_email']} | Criado em: {date_str}\n"
                    f"  Prévia: {r.get('preview', '')[:120]}...\n"
                )
            return "\n".join(out)
        except Exception as db_err:
            logger.warning(f"Erro ao consultar FreeScout via MariaDB: {db_err}")

        # 2. Fallback via API REST HTTP (se configurada)
        api_url = os.getenv("FREESCOUT_URL", "http://host.docker.internal:18080")
        api_key = os.getenv("FREESCOUT_API_KEY")
        if api_key and api_key != "your_freescout_api_key":
            try:
                headers = {"X-FreeScout-API-Key": api_key}
                resp = requests.get(f"{api_url}/api/conversations?status={filter_status}", headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    return json.dumps(data, indent=2, ensure_ascii=False)[:3000]
            except Exception as e:
                logger.warning(f"Erro ao contatar FreeScout via HTTP: {e}")

        return f"Não foi possível consultar o FreeScout Helpdesk: Erro de conexão com banco de dados ({str(db_err)})"

class FreescoutReadTicketInput(BaseModel):
    ticket_number_or_id: int = Field(..., description="Número (#number) ou ID da conversa no FreeScout.")

class FreescoutReadTicketTool(BaseTool):
    name: str = "freescout_read_ticket"
    description: str = "Lê o histórico completo de mensagens e respostas de um chamado específico no FreeScout Helpdesk."
    args_schema: Type[BaseModel] = FreescoutReadTicketInput

    def _run(self, ticket_number_or_id: int) -> str:
        try:
            conn = _get_freescout_db()
            with conn.cursor() as cur:
                # Busca conversa
                cur.execute("""
                    SELECT c.id, c.number, c.subject, c.customer_email, c.status, c.created_at, m.name AS mailbox_name
                    FROM conversations c
                    LEFT JOIN mailboxes m ON c.mailbox_id = m.id
                    WHERE c.number = %s OR c.id = %s
                    LIMIT 1
                """, (ticket_number_or_id, ticket_number_or_id))
                conv = cur.fetchone()
                if not conv:
                    conn.close()
                    return f"Ticket #{ticket_number_or_id} não encontrado no FreeScout."

                # Busca mensagens da thread
                cur.execute("""
                    SELECT id, type, `from`, `to`, body, created_at
                    FROM threads
                    WHERE conversation_id = %s
                    ORDER BY id ASC
                """, (conv['id'],))
                threads = cur.fetchall()

            conn.close()

            status_map = {1: "Aberto/Ativo", 2: "Aguardando", 3: "Fechado", 4: "Spam"}
            out = [
                f"=== TICKET #{conv['number']}: {conv['subject']} ===",
                f"Caixa: {conv['mailbox_name']} | Cliente: {conv['customer_email']} | Status: {status_map.get(conv['status'], conv['status'])}",
                f"Criado em: {conv['created_at']}\n",
                "--- HISTÓRICO DE MENSAGENS ---"
            ]
            for t in threads:
                author = t.get('from') or "Sistema"
                date_str = t['created_at'].strftime("%d/%m/%Y %H:%M") if t.get('created_at') else ""
                body = (t.get('body') or "").replace("<br>", "\n").replace("<p>", "").replace("</p>", "\n")
                out.append(f"[{date_str}] De: {author}\n{body[:1500]}\n")

            return "\n".join(out)
        except Exception as e:
            return f"Erro ao extrair histórico do ticket #{ticket_number_or_id}: {str(e)}"


# --- META ADS TOOL (FACEBOOK & INSTAGRAM) ---
class MetaAdsQueryInput(BaseModel):
    query_type: str = Field(
        "resumo_conta",
        description="Tipo de consulta Meta Ads: 'resumo_conta', 'listar_campanhas' ou 'insights_desempenho'."
    )
    periodo: Optional[str] = Field("last_7d", description="Período de insights: 'today', 'yesterday', 'last_7d', 'this_month'.")

class MetaAdsTool(BaseTool):
    name: str = "meta_ads_campaign_service"
    description: str = (
        "Consulta campanhas de tráfego, custos de veiculação (spend), impressões, cliques, "
        "CTR e conversões do Facebook Ads e Instagram Ads diretamente via Meta Marketing API."
    )
    args_schema: Type[BaseModel] = MetaAdsQueryInput
    ad_account_id: str = ""
    access_token: str = ""

    def _run(self, query_type: str = "resumo_conta", periodo: str = "last_7d") -> str:
        try:
            from api.tasks_queue import get_setting
        except Exception:
            try:
                from tasks_queue import get_setting
            except Exception:
                def get_setting(k): return None

        token = self.access_token or get_setting("META_ADS_ACCESS_TOKEN") or os.getenv("META_ADS_ACCESS_TOKEN", "")
        account_raw = self.ad_account_id or get_setting("META_ADS_ACCOUNT_ID") or os.getenv("META_ADS_ACCOUNT_ID", "")
        
        if not token or not account_raw:
            return "⚠️ Credenciais da Meta Ads (Account ID e Access Token) não configuradas no sistema."

        act_id = account_raw if account_raw.startswith("act_") else f"act_{account_raw}"

        try:
            # 1. Consulta dados básicos da conta
            url_acc = f"https://graph.facebook.com/v19.0/{act_id}?fields=id,name,account_status,currency,amount_spent&access_token={token}"
            r_acc = requests.get(url_acc, timeout=8)
            if r_acc.status_code != 200:
                err = r_acc.json().get("error", {})
                msg = err.get("message", r_acc.text)
                return (
                    f"⚠️ [Meta Marketing API]: Não foi possível acessar a conta '{act_id}' (Status {r_acc.status_code}).\n"
                    f"Mensagem do Meta: {msg}\n\n"
                    f"👉 Para resolver: Certifique-se de que o usuário 'Agente IA' (ID 61595769907634) possui a permissão 'ads_read' concedida na Conta de Anúncios no Meta Business Suite."
                )

            acc_info = r_acc.json()
            acc_name = acc_info.get("name", "Conta Corporativa")
            currency = acc_info.get("currency", "BRL")

            if query_type == "resumo_conta":
                spent = float(acc_info.get("amount_spent", 0) or 0) / 100.0 if acc_info.get("amount_spent") else 0.0
                return (
                    f"📱 [Meta Ads - Visão Geral da Conta {act_id}]:\n"
                    f"- Nome da Conta: {acc_name}\n"
                    f"- Moeda de Cobrança: {currency}\n"
                    f"- Status da Conta: {'Ativa' if acc_info.get('account_status') == 1 else 'Atenção/Pausada'}\n"
                    f"- Total Histórico Investido: {currency} {spent:,.2f}"
                )

            elif query_type == "listar_campanhas":
                url_camp = f"https://graph.facebook.com/v19.0/{act_id}/campaigns?fields=id,name,status,objective,daily_budget&limit=10&access_token={token}"
                r_camp = requests.get(url_camp, timeout=8)
                if r_camp.status_code == 200:
                    camps = r_camp.json().get("data", [])
                    if not camps:
                        return f"Nenhuma campanha encontrada na conta {act_id}."
                    lines = [f"📱 [Meta Ads - Campanhas Ativas/Recentes na Conta {act_id}]:"]
                    for c in camps:
                        status_emoji = "🟢" if c.get("status") == "ACTIVE" else "⚪"
                        lines.append(f"{status_emoji} {c.get('name')} (ID: {c.get('id')}) | Status: {c.get('status')} | Objetivo: {c.get('objective')}")
                    return "\n".join(lines)

            # Insights / Desempenho
            url_ins = f"https://graph.facebook.com/v19.0/{act_id}/insights?fields=spend,impressions,clicks,cpc,cpm,ctr&date_preset={periodo}&access_token={token}"
            r_ins = requests.get(url_ins, timeout=8)
            if r_ins.status_code == 200:
                insights_data = r_ins.json().get("data", [])
                if insights_data:
                    ins = insights_data[0]
                    return (
                        f"📊 [Meta Ads - Desempenho de Tráfego ({periodo})]:\n"
                        f"- Total Investido (Spend): {currency} {float(ins.get('spend', 0)):,.2f}\n"
                        f"- Impressões: {int(ins.get('impressions', 0)):,}\n"
                        f"- Cliques no Link: {int(ins.get('clicks', 0)):,}\n"
                        f"- CTR Médio: {float(ins.get('ctr', 0)):.2f}%\n"
                        f"- CPC Médio: {currency} {float(ins.get('cpc', 0)):,.2f}"
                    )
                return f"Nenhum gasto ou impressão registrada no Meta Ads para o período '{periodo}'."

            return f"Meta Ads Insights retornou HTTP {r_ins.status_code}: {r_ins.text}"
        except Exception as e:
            return f"Erro ao consultar Meta Marketing API: {str(e)}"
