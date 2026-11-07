import api.db_utils
"""Motor de Gatilhos Reativos, Webhooks por Plataforma e Loop de Eventos em Tempo Real - AI Board.

Arquitetura Híbrida (Webhooks em Tempo Real + Varredura Fallback por Plataforma):
1. Gatilhos Separados por Plataforma de Delivery:
   - `trig-entrega-aki` (`entrega_aki_event`): Webhook `/api/webhooks/entrega-aki` + Monitoramento do canal de entregas e ERP.
   - `trig-ifood` (`ifood_event`): Webhook `/api/webhooks/ifood` + Monitoramento de eventos iFood.
   - `trig-99food` (`99food_event`): Webhook `/api/webhooks/99food` + Monitoramento de eventos 99 Food.
2. Seleção Prévia de Causas (Filtros no Gatilho) + Verificação Posterior de Causa:
   - Causas padronizadas (`new_message`, `order_status`, `sla_delay`, `store_catalog`, `customer_review`).
   - O usuário pode pré-selecionar no painel do gatilho quais causas devem ativar o agente.
   - Quando ativado, o motor identifica e classifica a causa exata e instrui o agente a consultar a ferramenta da plataforma correspondente (`action='check_cause'`) e o New Choice ERP.
3. Demais Canais Reativos:
   - `trig-chatwoot-events` (`chatwoot_event`): Mensagens de clientes no Chatwoot.
   - `trig-freescout-events` (`freescout_event`): Chamados operacionais de lojas no FreeScout Helpdesk.
"""

import os
import time
import uuid
import json
import logging
import sqlite3
import threading
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("event_triggers")
BRT = timezone(timedelta(hours=-3))

DB_PATH = "/app/data/tasks.db" if os.path.exists("/app/data/tasks.db") else os.path.join(os.path.dirname(__file__), "..", "data", "tasks.db")
ANALYTICS_DB_PATH = "/app/data/erp_analytics/analytics_store.db" if os.path.exists("/app/data/erp_analytics/analytics_store.db") else os.path.join(os.path.dirname(__file__), "..", "data", "erp_analytics", "analytics_store.db")

_event_loop_thread: Optional[threading.Thread] = None
_loop_running = False
_last_scan_timestamp: Optional[float] = None
_last_scan_stats: Dict[str, Any] = {}

DEFAULT_ENABLED_CAUSES = [
    "order_status",
    "store_catalog",
    "delivery_catalog_erp",
    "ifood_polling",
    "sla_delay",
    "order_chat_message",
    "customer_review",
]

CAUSE_CATALOG: Dict[str, Dict[str, str]] = {
    "order_status": {
        "label": "🚨 Cancelamento de Pedido (Radar ERP)",
        "recommended_action": "order_status",
        "description": "Pedido cancelado ou falha operacional detectada no canal pelo New Choice ERP."
    },
    "store_catalog": {
        "label": "🏪 Loja Aberta/Fechada / Ruptura de Vitrine",
        "recommended_action": "store_settings",
        "description": "Divergência de vitrine ou loja sinalizada como fechada/pausada no site ou plataforma."
    },
    "delivery_catalog_erp": {
        "label": "🧋 Auditoria de Cardápio (Classe Delivery no ERP)",
        "recommended_action": "erp_catalog",
        "description": "Consulta e auditoria de produtos e preços oficiais da Classe Delivery diretamente no New Choice ERP."
    },
    "ifood_polling": {
        "label": "📦 Fila de Pedidos & Eventos (Sessão Portal)",
        "recommended_action": "order_status",
        "description": "Event Polling em tempo real via Sessão autenticada do Portal do Parceiro (portal.ifood.com.br) e Webhook oficial."
    },
    "sla_delay": {
        "label": "⏱️ Alerta de Atraso / SLA de Preparo",
        "recommended_action": "order_status",
        "description": "Pedido ultrapassou a tolerância máxima de preparo registrada no sistema."
    },
    "order_chat_message": {
        "label": "💬 Mensagem no Chat do Pedido Aberto",
        "recommended_action": "customer_sac",
        "description": "Cliente enviou uma mensagem ou dúvida em um pedido em andamento no delivery."
    },
    "customer_review": {
        "label": "⭐ Avaliação Crítica (< 5 Estrelas)",
        "recommended_action": "customer_sac",
        "description": "Cliente registrou uma avaliação com nota menor que 5 estrelas no iFood ou 99 Food."
    }
}

PLATFORM_META: Dict[str, Dict[str, str]] = {
    "entrega_aki": {
        "name": "Entrega Aki (Pedidos & Cardápio)",
        "trigger_type": "entrega_aki_event",
        "trigger_id": "trig-entrega-aki",
        "tool_name": "entrega_aki_channel_tool",
        "erp_channel": "delivery_proprio"
    },
    "ifood": {
        "name": "iFood Marketplace",
        "trigger_type": "ifood_event",
        "trigger_id": "trig-ifood",
        "tool_name": "ifood_marketplace_tool",
        "erp_channel": "ifood"
    },
    "99food": {
        "name": "99 Food Marketplace",
        "trigger_type": "99food_event",
        "trigger_id": "trig-99food",
        "tool_name": "ninety_nine_food_marketplace_tool",
        "erp_channel": "99food"
    }
}


def get_db_connection():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_events_db():
    try:
        with get_db_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS reactive_events_state (
                    event_key TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    detected_at REAL NOT NULL,
                    task_id TEXT,
                    details TEXT,
                    status TEXT DEFAULT 'dispatched'
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rev_source ON reactive_events_state (source)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rev_detected ON reactive_events_state (detected_at)")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS delivery_webhook_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    event_code TEXT NOT NULL,
                    cause_code TEXT NOT NULL,
                    cause_label TEXT NOT NULL,
                    order_id TEXT,
                    customer_name TEXT,
                    summary TEXT,
                    payload_json TEXT,
                    source_mode TEXT DEFAULT 'webhook',
                    dispatched_task_id TEXT,
                    created_at REAL NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dwe_platform ON delivery_webhook_events (platform, created_at DESC)")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS chatwoot_human_takeover (
                    conversation_id INTEGER PRIMARY KEY,
                    last_human_reply_at REAL NOT NULL,
                    operator_name TEXT DEFAULT 'Operador Humano',
                    last_message_id INTEGER,
                    mode TEXT DEFAULT 'paused',
                    updated_at REAL NOT NULL
                )
            """)
            conn.commit()
    except Exception as e:
        logger.error(f"Erro ao inicializar banco de eventos reativos: {e}")


init_events_db()


# =====================================================================
# 1. RESOLUÇÃO DE CONFIGURAÇÃO E AGENTE ALVO DO GATILHO NO CANVAS
# =====================================================================
def get_trigger_config(trigger_id_or_type: str, fallback_agent_id: str = "agent-coo-delivery") -> Dict[str, Any]:
    """Lê a configuração do bloco de gatilho no Canvas (agente conectado, modo Webhook/Loop e filtros de causa pré-selecionados)."""
    config = {
        "trigger_id": None,
        "target_agent": fallback_agent_id,
        "trigger_mode": "webhook_and_poll",
        "enabled_causes": list(DEFAULT_ENABLED_CAUSES),
        "auto_detect_cause": True
    }
    try:
        from api.tasks_queue import get_canvas_topology
        topo = get_canvas_topology()
        nodes = topo.get("nodes", [])
        edges = topo.get("edges", [])

        matching_node = None
        for n in nodes:
            if n.get("type") == "trigger":
                nid = n.get("id", "")
                ntype = n.get("data", {}).get("type", "")
                if nid == trigger_id_or_type or ntype == trigger_id_or_type:
                    matching_node = n
                    break

        # Fallback: se procurar por um gatilho de plataforma e só existir o antigo 'delivery_event'
        if not matching_node and trigger_id_or_type in ("entrega_aki_event", "ifood_event", "99food_event"):
            for n in nodes:
                if n.get("type") == "trigger" and n.get("data", {}).get("type") == "delivery_event":
                    matching_node = n
                    break

        if matching_node:
            nid = matching_node.get("id")
            ndata = matching_node.get("data", {})
            config["trigger_id"] = nid
            if ndata.get("triggerMode"):
                config["trigger_mode"] = ndata["triggerMode"]
            if isinstance(ndata.get("enabledCauses"), list):
                config["enabled_causes"] = ndata["enabledCauses"]
            if "autoDetectCause" in ndata:
                config["auto_detect_cause"] = bool(ndata["autoDetectCause"])

            for e in edges:
                if e.get("source") == nid and e.get("target"):
                    config["target_agent"] = e.get("target")
                    break
    except Exception as e:
        logger.warning(f"Erro ao ler config do gatilho '{trigger_id_or_type}': {e}")

    return config


def get_target_agent_for_trigger(trigger_id_or_type: str, fallback_agent_id: str) -> str:
    """Identifica o agente conectado a este gatilho no canvas visual. Se não houver, usa fallback."""
    return get_trigger_config(trigger_id_or_type, fallback_agent_id)["target_agent"]


# =====================================================================
# 2. CLASSIFICADOR DE CAUSA DE GATILHO & RECEPTOR DE WEBHOOKS
# =====================================================================
def classify_delivery_event_cause(platform: str, payload: Dict[str, Any]) -> Tuple[str, str, str, str, str, str]:
    """Inspeciona o payload do evento (Webhook ou Polling) e identifica a causa exata do disparo.
    Retorna: (event_code, cause_code, cause_label, order_id, customer_name, summary)
    """
    raw_code = str(
        payload.get("fullCode")
        or payload.get("code")
        or payload.get("event_type")
        or payload.get("event")
        or payload.get("type")
        or "PLATFORM_EVENT"
    ).upper().strip()

    explicit_cause = str(payload.get("cause_code") or payload.get("cause") or "").lower().strip()
    order_id = str(
        payload.get("orderId")
        or payload.get("order_id")
        or payload.get("id")
        or payload.get("displayId")
        or "S/N"
    )
    customer_name = str(
        payload.get("customerName")
        or payload.get("customer_name")
        or (payload.get("customer") or {}).get("name")
        or "Cliente"
    )
    message_text = str(
        payload.get("message")
        or payload.get("content")
        or payload.get("text")
        or payload.get("summary")
        or payload.get("reason")
        or ""
    ).strip()

    # 1. Determina cause_code pela classificação explícita ou inferência semântica do evento
    score_val = payload.get("score") or payload.get("rating") or payload.get("stars")
    
    if explicit_cause in CAUSE_CATALOG:
        cause_code = explicit_cause
    elif explicit_cause in ("chat", "message", "msg", "order_chat", "order_chat_message", "chat_message", "new_message"):
        cause_code = "order_chat_message"
    elif explicit_cause in ("review", "rating", "feedback", "star", "customer_review", "bad_review"):
        cause_code = "customer_review"
    elif any(k in raw_code for k in ("CHAT", "MESSAGE", "MSG", "CONVERSATION", "CUSTOMER_QUESTION")):
        cause_code = "order_chat_message"
    elif any(k in raw_code for k in ("REVIEW", "RATING", "FEEDBACK", "EVALUATION", "STAR")) or score_val is not None:
        cause_code = "customer_review"
    elif any(k in raw_code for k in ("DELAY", "SLA", "LATE", "PREPARATION_TIME", "COURIER_DELAY")):
        cause_code = "sla_delay"
    elif any(k in raw_code for k in ("CATALOG", "MENU", "ITEM", "STORE", "MERCHANT", "PAUSE", "OFFLINE", "RUPTURA")):
        cause_code = "store_catalog"
    else:
        cause_code = "order_status"

    cause_info = CAUSE_CATALOG.get(cause_code, CAUSE_CATALOG["order_status"])
    cause_label = cause_info["label"]

    if not message_text:
        if cause_code == "new_message":
            message_text = f"Nova mensagem recebida no chat da plataforma ({raw_code}) referente ao pedido #{order_id}."
        elif cause_code == "sla_delay":
            message_text = f"Alerta de SLA / atraso operacional detectado ({raw_code}) no pedido #{order_id}."
        elif cause_code == "store_catalog":
            message_text = f"Alerta de status da loja ou divergência de cardápio/vitrine ({raw_code})."
        elif cause_code == "customer_review":
            message_text = f"Nova avaliação registrada por {customer_name} no pedido #{order_id}."
        else:
            message_text = f"Evento de status de pedido ({raw_code}) no pedido #{order_id}."

    return raw_code, cause_code, cause_label, order_id, customer_name, message_text


def ingest_delivery_webhook_event(
    platform: str,
    payload: Dict[str, Any],
    source_mode: str = "webhook",
    force_dispatch: bool = False
) -> Dict[str, Any]:
    """Registra um evento vindo de Webhook (ou simulação/radar) de uma plataforma de delivery,
    verifica os filtros pré-selecionados no gatilho daquela plataforma e aciona o agente com a causa exata."""
    plat_key = (platform or "ifood").lower().strip().replace("-", "_")
    if plat_key not in PLATFORM_META:
        plat_key = "ifood"

    meta = PLATFORM_META[plat_key]
    trig_cfg = get_trigger_config(meta["trigger_type"], "agent-coo-delivery")

    event_code, cause_code, cause_label, order_id, customer_name, summary = classify_delivery_event_cause(plat_key, payload)
    cause_meta = CAUSE_CATALOG.get(cause_code, CAUSE_CATALOG["order_status"])
    rec_action = cause_meta["recommended_action"]

    now_ts = time.time()
    event_row_id = None

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO delivery_webhook_events
            (platform, event_code, cause_code, cause_label, order_id, customer_name, summary, payload_json, source_mode, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            plat_key,
            event_code,
            cause_code,
            cause_label,
            order_id,
            customer_name,
            summary,
            json.dumps(payload, ensure_ascii=False),
            source_mode,
            now_ts
        ))
        event_row_id = cur.lastrowid
        conn.commit()

    # Verifica se a causa está habilitada nos filtros pré-selecionados do gatilho
    enabled_causes = trig_cfg.get("enabled_causes", DEFAULT_ENABLED_CAUSES)
    if not force_dispatch and cause_code not in enabled_causes:
        logger.info(
            f"ℹ️ [GATILHO {plat_key.upper()}] Evento #{event_row_id} ({cause_code}) ignorado pois a causa não está pré-selecionada no gatilho."
        )
        return {
            "status": "filtered_out",
            "event_id": event_row_id,
            "platform": plat_key,
            "cause_code": cause_code,
            "cause_label": cause_label,
            "reason": f"A causa '{cause_label}' está desmarcada nas opções de pré-seleção do gatilho."
        }

    # Monta o prompt estruturado com a Causa Identificada + Ferramenta da Plataforma + New Choice ERP
    mode_human = "Webhook Oficial em Tempo Real" if source_mode == "webhook" else "Monitoramento Ativo (Fallback Loop)"
    store_url_cfg = os.getenv("DELIVERY_STORE_URL", "")
    if plat_key == "entrega_aki":
        tool_guidance = (
            f"1) Utilize a ferramenta `{meta['tool_name']}` com `action='erp_catalog'` "
            f"para auditar os produtos e preços da Classe Delivery no New Choice ERP (sem acessar o Gestor Web durante o dia).\n"
            f"2) Utilize a ferramenta `{meta['tool_name']}` com `action='check_cause'` ou `action='products'` "
            f"para verificar a vitrine pública online{f' em {store_url_cfg}' if store_url_cfg else ''}.\n"
            f"3) Utilize em conjunto a ferramenta **New Choice ERP** para auditar saldo de estoque dos insumos."
        )
    elif plat_key == "ifood":
        tool_guidance = (
            f"1) Utilize a ferramenta `{meta['tool_name']}` com `action='check_cause'` e `action='order_status'` "
            f"para verificar os detalhes do pedido #{order_id} no canal iFood.\n"
            f"2) Caso possua credenciais do Portal do Desenvolvedor iFood (developer.ifood.com.br - Gratuito), "
            f"a ferramenta sincroniza diretamente com a fila oficial de pedidos e status da loja.\n"
            f"3) Utilize em conjunto a ferramenta **New Choice ERP** para conferir a baixa de estoque e dados fiscais."
        )
    else:
        tool_guidance = (
            f"1) Utilize a ferramenta `{meta['tool_name']}` com `action='check_cause'` e `action='order_status'` "
            f"para verificar os detalhes específicos do canal 99 Food.\n"
            f"2) Para automação do Portal do Lojista 99 Food, a ferramenta utiliza Playwright com descoberta de rotas REST internas.\n"
            f"3) Utilize em conjunto a ferramenta **New Choice ERP** para conciliação das vendas e estoque."
        )

    prompt = (
        f"[🚨 GATILHO DE PLATAFORMA ACIONADO — {meta['name'].upper()}]\n"
        f"• Plataforma de Origem: {meta['name']}\n"
        f"• Mecanismo de Disparo: {mode_human}\n"
        f"• Causa Verificada do Gatilho: {cause_label} (`{cause_code}`)\n"
        f"• Código do Evento: `{event_code}` | Pedido ID: #{order_id}\n"
        f"• Cliente / Origem: {customer_name}\n"
        f"• Resumo do Evento: {summary}\n\n"
        f"🛠️ [PROTOCOLO DE EXECUÇÃO POR FERRAMENTA]:\n"
        f"{tool_guidance}\n"
        f"3) Execute a resolução imediata seguindo o padrão Zero-Click (pausar item sem estoque, responder cliente ou acionar a operação da loja)."
    )

    dedup_key = payload.get("dedup_key") or f"wh_{plat_key}_{cause_code}_{order_id}_{int(now_ts)}"
    task_id = dispatch_reactive_event({
        "key": dedup_key,
        "source": plat_key,
        "entity_id": str(order_id),
        "trigger_type": meta["trigger_type"],
        "fallback_agent": trig_cfg.get("target_agent", "agent-coo-delivery"),
        "prompt": prompt,
        "details": f"[{meta['name']}] {cause_label} - Pedido #{order_id}: {summary[:80]}"
    })

    if task_id and event_row_id:
        with get_db_connection() as conn:
            conn.execute(
                "UPDATE delivery_webhook_events SET dispatched_task_id = ? WHERE id = ?",
                (task_id, event_row_id)
            )
            conn.commit()

    return {
        "status": "dispatched" if task_id else "duplicate",
        "event_id": event_row_id,
        "task_id": task_id,
        "platform": plat_key,
        "event_code": event_code,
        "cause_code": cause_code,
        "cause_label": cause_label,
        "target_agent": trig_cfg.get("target_agent", "agent-coo-delivery"),
        "summary": summary
    }


def get_recent_delivery_webhook_events(platform: Optional[str] = None, limit: int = 15) -> List[Dict[str, Any]]:
    """Retorna os últimos eventos registrados por plataforma e suas causas verificadas."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        if platform:
            plat_clean = platform.lower().strip().replace("-", "_")
            cur.execute("""
                SELECT * FROM delivery_webhook_events
                WHERE platform = ?
                ORDER BY created_at DESC LIMIT ?
            """, (plat_clean, limit))
        else:
            cur.execute("""
                SELECT * FROM delivery_webhook_events
                ORDER BY created_at DESC LIMIT ?
            """, (limit,))
        return [dict(r) for r in cur.fetchall()]


# =====================================================================
# 3. MONITORAMENTO SEPARADO POR PLATAFORMA DE DELIVERY (FALLBACK LOOP)
# =====================================================================
def _check_erp_channel_cancellations(platform_key: str) -> List[Dict[str, Any]]:
    """Solucão própria de fallback quando o Webhook não envia o evento: monitora cancelamentos recentes por canal específico."""
    events = []
    if not os.path.exists(ANALYTICS_DB_PATH):
        return events

    meta = PLATFORM_META[platform_key]
    trig_cfg = get_trigger_config(meta["trigger_type"], "agent-coo-delivery")

    # Respeita modo 'webhook_only' ou filtro de causa 'order_status'
    if trig_cfg.get("trigger_mode") == "webhook_only":
        return events
    if "order_status" not in trig_cfg.get("enabled_causes", DEFAULT_ENABLED_CAUSES):
        return events

    erp_channel = meta["erp_channel"]
    try:
        with sqlite3.connect(ANALYTICS_DB_PATH, timeout=5) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("""
                SELECT id, store_id, order_date, order_time, channel, gross_amount, net_amount, status, customer_name
                FROM orders
                WHERE status = 'Cancelado'
                  AND channel = ?
                  AND order_date >= date('now', '-2 days')
                ORDER BY order_date DESC, order_time DESC
                LIMIT 10
            """, (erp_channel,))
            rows = cur.fetchall()

            for r in rows:
                oid = str(r["id"])
                ev_key = f"delivery_canc_{erp_channel}_{oid}"
                val_fmt = f"R$ {r['net_amount']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                summary = f"Pedido #{oid} cancelado em {r['order_date']} {r['order_time']} (Valor: {val_fmt})"

                prompt = (
                    f"[🚨 GATILHO {meta['name'].upper()} — CAUSA: MUDANÇA DE STATUS / PEDIDO CANCELADO]\n"
                    f"• Plataforma: {meta['name']}\n"
                    f"• Mecanismo de Detecção: Monitoramento Ativo (Solução Própria Fallback)\n"
                    f"• Causa Verificada: 🚨 Mudança de Status / Cancelamento de Pedido (`order_status`)\n"
                    f"• Pedido ID: #{oid} | Data/Hora: {r['order_date']} {r['order_time']}\n"
                    f"• Valor Líquido Perdido: {val_fmt} | Cliente: {r['customer_name'] or 'Não identificado'}\n\n"
                    f"🛠️ [INSTRUÇÃO EXECUTIVA]:\n"
                    f"1) Consulte a ferramenta individual `{meta['tool_name']}` com `action='check_cause'` e `action='order_status'` "
                    f"para verificar informações específicas da plataforma (mensagens do cliente, status da loja ou disputa).\n"
                    f"2) Consulte a ferramenta **New Choice ERP** para verificar os itens da compra e disponibilidade de estoque.\n"
                    f"3) Se houver ruptura de insumo, solicite pausa imediata na vitrine."
                )

                events.append({
                    "key": ev_key,
                    "source": platform_key,
                    "entity_id": oid,
                    "trigger_type": meta["trigger_type"],
                    "fallback_agent": trig_cfg.get("target_agent", "agent-coo-delivery"),
                    "prompt": prompt,
                    "details": f"[{meta['name']}] Cancelamento #{oid} ({val_fmt})"
                })
    except Exception as e:
        logger.error(f"Erro ao checar cancelamentos de {platform_key}: {e}")

    return events


def check_entrega_aki_events() -> List[Dict[str, Any]]:
    """Monitor específico do Gatilho Entrega Aki (pedidos delivery_proprio)."""
    events = _check_erp_channel_cancellations("entrega_aki")
    trig_cfg = get_trigger_config("entrega_aki_event", "agent-coo-delivery")

    if trig_cfg.get("trigger_mode") == "webhook_only":
        return events

    # Se a causa 'store_catalog' estiver ativa e DELIVERY_STORE_URL configurada, verifica disponibilidade
    store_url = os.getenv("DELIVERY_STORE_URL")
    if store_url and "store_catalog" in trig_cfg.get("enabled_causes", DEFAULT_ENABLED_CAUSES):
        try:
            resp = requests.get(store_url, timeout=6)
            if resp.status_code >= 500:
                day_hour_key = datetime.now(BRT).strftime("%Y%m%d_%H")
                ev_key = f"entrega_aki_site_down_{day_hour_key}"
                events.append({
                    "key": ev_key,
                    "source": "entrega_aki",
                    "entity_id": day_hour_key,
                    "trigger_type": "entrega_aki_event",
                    "fallback_agent": trig_cfg.get("target_agent", "agent-coo-delivery"),
                    "prompt": (
                        f"[🚨 GATILHO ENTREGA AKI — CAUSA: ALERTA DE LOJA / VITRINE OFFLINE]\n"
                        f"• Plataforma: Entrega Aki ({store_url})\n"
                        f"• Causa Verificada: 🏪 Alerta de Loja / Cardápio (`store_catalog`)\n"
                        f"• Diagnóstico HTTP: O site retornou erro HTTP {resp.status_code}.\n"
                        f"• Instrução: Utilize `entrega_aki_channel_tool(action='store_settings')` para diagnosticar a disponibilidade da loja."
                    ),
                    "details": f"[Entrega Aki] Site retornou HTTP {resp.status_code}"
                })
        except Exception:
            pass

    return events


def check_ifood_events() -> List[Dict[str, Any]]:
    """Monitor específico do Gatilho iFood: Radar New Choice ERP + Event Polling oficial (se credenciais configuradas)."""
    events = _check_erp_channel_cancellations("ifood")
    client_id = os.getenv("IFOOD_CLIENT_ID")
    client_secret = os.getenv("IFOOD_CLIENT_SECRET")
    if client_id and client_secret:
        try:
            try:
                from custom_tools.delivery_tools import IFoodOfficialAPIClient
            except ImportError:
                from tools.delivery_tools import IFoodOfficialAPIClient
            client = IFoodOfficialAPIClient(client_id, client_secret)
            raw_events = client.poll_events()
            if raw_events:
                acked_ids = []
                for ev in raw_events:
                    eid = ev.get("id")
                    code = ev.get("code")
                    order_id = ev.get("orderId")
                    if eid:
                        acked_ids.append(eid)
                    ev_key = f"ifood_api_{code}_{order_id}_{eid}"
                    events.append({
                        "key": ev_key,
                        "source": "ifood",
                        "entity_id": str(order_id or eid),
                        "trigger_type": "ifood_event",
                        "fallback_agent": "agent-coo-delivery",
                        "prompt": (
                            f"[🚨 GATILHO IFOOD — EVENTO OFICIAL API MERCHANT]\n"
                            f"• Código do Evento: `{code}` | Pedido ID: #{order_id}\n"
                            f"• Origem: API Oficial iFood Developer (developer.ifood.com.br)\n"
                            f"• Instrução: Utilize `ifood_marketplace_tool(action='order_status')` para acompanhar o pedido."
                        ),
                        "details": f"[iFood Oficial] Evento {code} - Pedido #{order_id}"
                    })
                if acked_ids:
                    client.acknowledge_events(acked_ids)
        except Exception as e:
            logger.debug(f"Erro no polling oficial iFood: {e}")
    return events


def check_99food_events() -> List[Dict[str, Any]]:
    """Monitor específico do Gatilho 99 Food."""
    return _check_erp_channel_cancellations("99food")


# =====================================================================
# 4. MONITORAMENTO: CHATWOOT COM MULTIMODAL GEMINI VISION
# =====================================================================
_VISION_ANALYSIS_CACHE: Dict[str, str] = {}


def get_gemini_api_key() -> str:
    """Recupera a chave de API do Google Gemini do ambiente ou do banco tasks.db."""
    key = os.getenv("GEMINI_API_KEY", "")
    if key:
        return key
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key = 'gemini_api_key'")
        row = cur.fetchone()
        conn.close()
        if row and row["value"]:
            return row["value"]
    except Exception:
        pass
    return ""


def get_chatwoot_attachment_file_path(blob_key: str) -> Optional[str]:
    """Localiza o arquivo físico do ActiveStorage correspondente à blob_key."""
    if not blob_key:
        return None
    safe_key = os.path.basename(blob_key)
    candidate_paths = [
        f"/app/data/chatwoot_storage/{safe_key[:2]}/{safe_key[2:4]}/{safe_key}",
        f"/var/lib/docker/volumes/chatwoot_storage_data/_data/{safe_key[:2]}/{safe_key[2:4]}/{safe_key}",
        os.path.join(os.path.dirname(__file__), "..", "data", "chatwoot_storage", safe_key[:2], safe_key[2:4], safe_key)
    ]
    for p in candidate_paths:
        if os.path.exists(p) and os.path.isfile(p):
            return p
    return None


def analyze_chatwoot_image(blob_key: str, filename: str = "", caption: str = "") -> Optional[str]:
    """Analisa imagem de anexo do Chatwoot usando Google Gemini Vision (gemini-3.8-flash)."""
    if not blob_key:
        return None
    if blob_key in _VISION_ANALYSIS_CACHE:
        return _VISION_ANALYSIS_CACHE[blob_key]

    file_path = get_chatwoot_attachment_file_path(blob_key)
    if not file_path:
        logger.debug(f"Arquivo de anexo não encontrado para key: {blob_key}")
        return None

    api_key = get_gemini_api_key()
    if not api_key:
        logger.warning("Gemini API Key não encontrada para análise de visão do Chatwoot.")
        return None

    try:
        from PIL import Image
        from google import genai

        img = Image.open(file_path)
        client = genai.Client(api_key=api_key)

        vision_prompt = (
            "Você é o assistente inteligente de operações e controle de qualidade da organização.\n"
            "Analise detalhadamente esta foto enviada pela equipe ou cliente via canal de atendimento/mensageria.\n\n"
            "Identifique e relate com precisão técnica:\n"
            "1. LEITURA DE EQUIPAMENTO OU DISPLAY: Se houver display de equipamento ou balança digital, leia com exatidão o número exibido e a unidade. Indique se o aparelho parece estável.\n"
            "2. IDENTIFICAÇÃO DE INSUMOS/PRODUTOS: Identifique o que está sendo pesado, manipulado ou inspecionado (insumos, embalagens, peças, produtos, mercadorias).\n"
            "3. PADRÃO OPERACIONAL E CONFORMIDADE: Descreva o contexto provável (inspeção de turno, controle de porcionamento, teste de lote, desperdício ou conformidade com Boas Práticas).\n"
            "4. RESUMO OPERACIONAL: Resuma em 1 a 2 frases para o gestor tomar ciência ou providência imediata."
        )
        if caption:
            vision_prompt += f"\n\nContexto textual informado junto à foto: \"{caption}\""

        # Modelo oficial recomendado
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[vision_prompt, img]
        )

        analysis = (response.text or "").strip()
        if analysis:
            _VISION_ANALYSIS_CACHE[blob_key] = analysis
            return analysis
    except Exception as e:
        logger.error(f"Erro na análise de visão computacional Chatwoot ({blob_key}): {e}")

    return None


CHATWOOT_DEBOUNCE_SECONDS = 180.0
CHATWOOT_MAX_WAIT_SECONDS = 360.0
CHATWOOT_HUMAN_TAKEOVER_TTL_SECONDS = 14400.0  # 4 horas de pausa automática após atendimento humano
CHATWOOT_EXTENDED_HUMAN_WAIT_SECONDS = 900.0   # 15 minutos caso configurado em modo de espera estendida

_chatwoot_timers_lock = threading.Lock()
_chatwoot_active_timers: Dict[int, threading.Timer] = {}
_chatwoot_buffer_meta: Dict[int, Dict[str, Any]] = {}


def get_chatwoot_human_guard_config() -> Dict[str, Any]:
    """Retorna as configurações de prioridade de atendimento humano e anti-colisão no WhatsApp/Chatwoot."""
    from api.tasks_queue import get_setting
    try:
        initial_wait = int(float(get_setting("chatwoot_initial_wait_seconds") or CHATWOOT_DEBOUNCE_SECONDS))
    except Exception:
        initial_wait = int(CHATWOOT_DEBOUNCE_SECONDS)
    initial_wait = max(30, min(initial_wait, 1800))

    mode = str(get_setting("chatwoot_human_takeover_mode") or "pause").strip().lower()
    if mode not in ("pause", "extended_wait"):
        mode = "pause"

    try:
        takeover_ttl = int(float(get_setting("chatwoot_human_takeover_ttl_seconds") or CHATWOOT_HUMAN_TAKEOVER_TTL_SECONDS))
    except Exception:
        takeover_ttl = int(CHATWOOT_HUMAN_TAKEOVER_TTL_SECONDS)
    takeover_ttl = max(300, min(takeover_ttl, 86400))

    try:
        extended_wait = int(float(get_setting("chatwoot_extended_wait_seconds") or CHATWOOT_EXTENDED_HUMAN_WAIT_SECONDS))
    except Exception:
        extended_wait = int(CHATWOOT_EXTENDED_HUMAN_WAIT_SECONDS)
    extended_wait = max(120, min(extended_wait, 3600))

    return {
        "initial_wait_seconds": initial_wait,
        "human_takeover_mode": mode,
        "human_takeover_ttl_seconds": takeover_ttl,
        "extended_wait_seconds": extended_wait,
    }


def save_chatwoot_human_guard_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Atualiza as configurações de prioridade humana no WhatsApp/Chatwoot."""
    from api.tasks_queue import set_setting
    if "initial_wait_seconds" in payload and payload["initial_wait_seconds"] is not None:
        val = max(30, min(int(payload["initial_wait_seconds"]), 1800))
        set_setting("chatwoot_initial_wait_seconds", str(val))
    if "human_takeover_mode" in payload and payload["human_takeover_mode"] in ("pause", "extended_wait"):
        set_setting("chatwoot_human_takeover_mode", str(payload["human_takeover_mode"]))
    if "human_takeover_ttl_seconds" in payload and payload["human_takeover_ttl_seconds"] is not None:
        val = max(300, min(int(payload["human_takeover_ttl_seconds"]), 86400))
        set_setting("chatwoot_human_takeover_ttl_seconds", str(val))
    if "extended_wait_seconds" in payload and payload["extended_wait_seconds"] is not None:
        val = max(120, min(int(payload["extended_wait_seconds"]), 3600))
        set_setting("chatwoot_extended_wait_seconds", str(val))
    return get_chatwoot_human_guard_config()


def supersede_pending_chatwoot_actions(conversation_id: int, operator_name: str = "Operador Humano") -> int:
    """Cancela imediatamente qualquer ação pendente (Telegram/Painel) para a conversa quando um humano responde diretamente."""
    if not conversation_id:
        return 0
    cancelled_ids = []
    now = time.time()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT action_id, payload_json, target FROM pending_actions WHERE status = 'pending' AND action_type = 'chatwoot_reply'")
            rows = cur.fetchall()
            for r in rows:
                aid = r["action_id"]
                target_str = str(r["target"] or "")
                try:
                    p_data = json.loads(r["payload_json"] or "{}")
                except Exception:
                    p_data = {}
                p_cid = p_data.get("conversation_id")
                if str(p_cid) == str(conversation_id) or f"#{conversation_id}" in target_str:
                    conn.execute("""
                        UPDATE pending_actions
                        SET status = 'rejected',
                            resolved_at = ?,
                            resolved_by = ?,
                            execution_result = ?
                        WHERE action_id = ?
                    """, (
                        now,
                        f"{operator_name} (Atendido no WhatsApp)",
                        json.dumps({"superseded_by_human": True, "conversation_id": conversation_id}, ensure_ascii=False),
                        aid
                    ))
                    cancelled_ids.append(aid)
            if cancelled_ids:
                conn.commit()
    except Exception as e:
        logger.warning(f"Erro ao cancelar ações pendentes da conversa #{conversation_id}: {e}")

    if cancelled_ids:
        try:
            from api.tasks_queue import broadcast_action_resolution
            for aid in cancelled_ids:
                broadcast_action_resolution(
                    aid,
                    f"{operator_name} (Respondeu no WhatsApp)",
                    "rejected",
                    f"👨‍💼 Conversa #{conversation_id} já foi respondida diretamente por um humano no WhatsApp. Sugestão do agente cancelada automaticamente para evitar resposta duplicada."
                )
        except Exception as e:
            logger.debug(f"Erro no broadcast de cancelamento por atendimento humano: {e}")

    return len(cancelled_ids)


def record_chatwoot_human_reply(conversation_id: int, msg_id: Optional[int] = None, operator_name: str = "Operador Humano"):
    """Registra que um humano assumiu/respondeu na conversa, cancelando timers, marcando mensagens e abortando sugestões pendentes."""
    if not conversation_id:
        return

    conv_id = int(conversation_id)
    now = time.time()
    buffered_mids = []

    with _chatwoot_timers_lock:
        if conv_id in _chatwoot_active_timers:
            try:
                _chatwoot_active_timers[conv_id].cancel()
            except Exception:
                pass
            del _chatwoot_active_timers[conv_id]
        meta = _chatwoot_buffer_meta.pop(conv_id, None)
        if meta and meta.get("messages"):
            buffered_mids.extend(meta["messages"])

    # Busca também mensagens recentes do cliente no Postgres para marcá-las como atendidas pelo humano
    pg_conn = None
    try:
        pg_conn = get_chatwoot_postgres_conn()
        with pg_conn.cursor() as cur_pg:
            cur_pg.execute("""
                SELECT id FROM messages
                WHERE conversation_id = %s
                  AND message_type = 0
                  AND created_at >= NOW() - INTERVAL '6 hours'
            """, (conv_id,))
            for r in cur_pg.fetchall():
                if r[0] and r[0] not in buffered_mids:
                    buffered_mids.append(r[0])
    except Exception:
        pass
    finally:
        if pg_conn:
            try:
                pg_conn.close()
            except Exception:
                pass

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO chatwoot_human_takeover (conversation_id, last_human_reply_at, operator_name, last_message_id, mode, updated_at)
                VALUES (?, ?, ?, ?, 'paused', ?)
                ON CONFLICT(conversation_id) DO UPDATE SET
                    last_human_reply_at = excluded.last_human_reply_at,
                    operator_name = excluded.operator_name,
                    last_message_id = COALESCE(excluded.last_message_id, chatwoot_human_takeover.last_message_id),
                    mode = 'paused',
                    updated_at = excluded.updated_at
            """, (conv_id, now, operator_name or "Operador Humano", msg_id, now))

            if msg_id:
                cur.execute("""
                    INSERT OR IGNORE INTO reactive_events_state
                    (event_key, source, entity_id, detected_at, task_id, details, status)
                    VALUES (?, 'chatwoot', ?, ?, 'operator', 'Respondido diretamente por operador humano', 'handled_by_operator')
                """, (f"chatwoot_msg_{msg_id}", str(msg_id), now))

            for b_mid in buffered_mids:
                cur.execute("""
                    INSERT OR IGNORE INTO reactive_events_state
                    (event_key, source, entity_id, detected_at, task_id, details, status)
                    VALUES (?, 'chatwoot', ?, ?, 'operator', 'Conversa atendida por operador humano', 'handled_by_operator')
                """, (f"chatwoot_msg_{b_mid}", str(b_mid), now))

            conn.commit()
    except Exception as e:
        logger.warning(f"Erro ao registrar takeover humano no SQLite (conversa #{conv_id}): {e}")

    superseded = supersede_pending_chatwoot_actions(conv_id, operator_name=operator_name)
    if superseded > 0:
        logger.info(f"🛡️ [ANTI-COLISÃO WHATSAPP]: {superseded} ação(ões) pendente(s) cancelada(s) pois {operator_name} respondeu na conversa #{conv_id}.")


def get_conversation_human_status(conversation_id: int, pg_conn=None) -> Dict[str, Any]:
    """Verifica no SQLite e no PostgreSQL do Chatwoot se um humano já respondeu na conversa e qual deve ser o comportamento do agente."""
    conv_id = int(conversation_id)
    cfg = get_chatwoot_human_guard_config()
    now = time.time()

    sqlite_human_ts = 0.0
    operator_name = "Operador Humano"
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT last_human_reply_at, operator_name FROM chatwoot_human_takeover WHERE conversation_id = ?", (conv_id,))
            row = cur.fetchone()
            if row and row["last_human_reply_at"]:
                sqlite_human_ts = float(row["last_human_reply_at"])
                operator_name = row["operator_name"] or operator_name
    except Exception:
        pass

    pg_out_ts = 0.0
    pg_in_ts = 0.0
    own_conn = False
    try:
        if pg_conn is None:
            pg_conn = get_chatwoot_postgres_conn()
            own_conn = True
        with pg_conn.cursor() as cur_pg:
            cur_pg.execute("""
                SELECT
                    MAX(CASE WHEN message_type = 1 AND COALESCE(private, false) = false THEN EXTRACT(EPOCH FROM created_at) END) AS last_out_ts,
                    MAX(CASE WHEN message_type = 0 THEN EXTRACT(EPOCH FROM created_at) END) AS last_in_ts
                FROM messages
                WHERE conversation_id = %s
                  AND created_at >= NOW() - INTERVAL '24 hours';
            """, (conv_id,))
            r = cur_pg.fetchone()
            if r:
                if r[0] is not None:
                    pg_out_ts = float(r[0])
                if r[1] is not None:
                    pg_in_ts = float(r[1])
    except Exception as e:
        logger.debug(f"Erro ao consultar status humano no Postgres para conversa #{conv_id}: {e}")
    finally:
        if own_conn and pg_conn:
            try:
                pg_conn.close()
            except Exception:
                pass

    last_human_ts = max(sqlite_human_ts, pg_out_ts)
    already_answered = bool(last_human_ts > 0 and pg_in_ts > 0 and last_human_ts >= pg_in_ts)
    elapsed_since_human = (now - last_human_ts) if last_human_ts > 0 else None
    human_active = bool(elapsed_since_human is not None and elapsed_since_human < cfg["human_takeover_ttl_seconds"])
    mode = cfg["human_takeover_mode"]

    # Se um humano já respondeu na janela ativa:
    # - No modo 'pause' (padrão): o agente para de acompanhar a conversa pela janela configurada (4h)
    # - No modo 'extended_wait': o agente aguarda um período muito maior (15 min) antes de sugerir qualquer coisa
    should_pause = already_answered or (human_active and mode == "pause")
    effective_wait = float(cfg["extended_wait_seconds"] if human_active else cfg["initial_wait_seconds"])
    max_wait = float(max(effective_wait + 120.0, CHATWOOT_MAX_WAIT_SECONDS))

    return {
        "conversation_id": conv_id,
        "last_human_reply_at": last_human_ts if last_human_ts > 0 else None,
        "last_incoming_at": pg_in_ts if pg_in_ts > 0 else None,
        "elapsed_since_human_seconds": round(elapsed_since_human, 1) if elapsed_since_human is not None else None,
        "operator_name": operator_name,
        "already_answered": already_answered,
        "human_active_in_conversation": human_active,
        "mode": mode,
        "should_pause": should_pause,
        "effective_wait_seconds": effective_wait,
        "max_wait_seconds": max_wait,
    }


def get_chatwoot_conversation_history(pg_conn, conversation_id: int, limit: int = 10, before_message_id: Optional[int] = None) -> str:
    """Recupera o histórico recente da conversa no Chatwoot (mensagens de clientes e de nossos operadores)."""
    try:
        with pg_conn.cursor() as cur:
            if before_message_id:
                cur.execute("""
                    SELECT 
                        m.id, 
                        m.message_type, 
                        m.sender_type,
                        COALESCE(u.name, ct.name, 'Equipe') as author_name,
                        m.content, 
                        m.created_at,
                        asb.filename,
                        asb.key as blob_key
                    FROM messages m
                    LEFT JOIN users u ON (m.sender_type = 'User' AND m.sender_id = u.id)
                    LEFT JOIN contacts ct ON (m.sender_type = 'Contact' AND m.sender_id = ct.id)
                    LEFT JOIN attachments a ON a.message_id = m.id
                    LEFT JOIN active_storage_attachments asa ON (asa.record_type = 'Attachment' AND asa.record_id = a.id)
                    LEFT JOIN active_storage_blobs asb ON asb.id = asa.blob_id
                    WHERE m.conversation_id = %s AND m.id < %s
                    ORDER BY m.id DESC
                    LIMIT %s;
                """, (conversation_id, before_message_id, limit))
            else:
                cur.execute("""
                    SELECT 
                        m.id, 
                        m.message_type, 
                        m.sender_type,
                        COALESCE(u.name, ct.name, 'Equipe') as author_name,
                        m.content, 
                        m.created_at,
                        asb.filename,
                        asb.key as blob_key
                    FROM messages m
                    LEFT JOIN users u ON (m.sender_type = 'User' AND m.sender_id = u.id)
                    LEFT JOIN contacts ct ON (m.sender_type = 'Contact' AND m.sender_id = ct.id)
                    LEFT JOIN attachments a ON a.message_id = m.id
                    LEFT JOIN active_storage_attachments asa ON (asa.record_type = 'Attachment' AND asa.record_id = a.id)
                    LEFT JOIN active_storage_blobs asb ON asb.id = asa.blob_id
                    WHERE m.conversation_id = %s
                    ORDER BY m.id DESC
                    LIMIT %s;
                """, (conversation_id, limit))

            rows = cur.fetchall()
            rows.reverse()  # Ordenação cronológica (antiga -> recente)

            lines = []
            for r in rows:
                mid, mtype, stype, author, content, ctime, fname, bkey = r
                clean = str(content or "").strip()
                if "Esta mensagem foi excluída" in clean:
                    continue

                ts_str = ctime.astimezone(BRT).strftime("%d/%m %H:%M") if hasattr(ctime, "astimezone") else str(ctime)[:16]

                if mtype == 1 or stype == "User":
                    tag = f"🟢 [OPERADOR — {author}]"
                elif mtype == 0 or stype == "Contact":
                    tag = f"👤 [CLIENTE/WHATSAPP — {author}]"
                else:
                    tag = f"ℹ️ [SISTEMA]"

                att_info = ""
                if fname:
                    att_info = f" [Arquivo anexado: {fname}]"
                    if bkey and bkey in _VISION_ANALYSIS_CACHE:
                        first_line = _VISION_ANALYSIS_CACHE[bkey].split("\n")[0][:90]
                        att_info += f" ({first_line}...)"

                text_info = f'"{clean}"' if clean else "(Mensagem sem texto)"
                lines.append(f"• [{ts_str}] {tag}: {text_info}{att_info}")

            return "\n".join(lines) if lines else "(Nenhuma mensagem anterior no histórico)"
    except Exception as e:
        logger.warning(f"Erro ao buscar histórico da conversa #{conversation_id}: {e}")
        return "(Histórico temporariamente indisponível)"


def get_chatwoot_postgres_conn():
    """Cria conexão com o banco de dados PostgreSQL do Chatwoot."""
    import psycopg2
    return psycopg2.connect(
        host=os.getenv("CHATWOOT_DB_HOST", "chatwoot-postgres"),
        port=int(os.getenv("CHATWOOT_DB_PORT", "5432")),
        user=os.getenv("CHATWOOT_DB_USER", "postgres"),
        password=os.getenv("CHATWOOT_DB_PASS", ""),
        dbname=os.getenv("CHATWOOT_DB_NAME", "chatwoot_production"),
        connect_timeout=4
    )


def build_chatwoot_batch_event(conversation_id: int) -> Optional[Dict[str, Any]]:
    """Constrói o payload do evento reativo para o conjunto acumulado de mensagens de um cliente."""
    pg_conn = None
    try:
        pg_conn = get_chatwoot_postgres_conn()

        # Verificação Anti-Colisão: checa se um humano já respondeu ou assumiu a conversa
        human_st = get_conversation_human_status(conversation_id, pg_conn=pg_conn)
        if human_st.get("should_pause"):
            logger.info(
                f"👨‍💼 [CHATWOOT PRE-FLIGHT]: Conversa #{conversation_id} já possui atendimento humano "
                f"(already_answered={human_st.get('already_answered')}, active={human_st.get('human_active_in_conversation')}, "
                f"mode={human_st.get('mode')}). Disparo do agente suprimido."
            )
            return None

        with pg_conn.cursor() as cur:
            cur.execute("""
                WITH latest_outgoing AS (
                    SELECT conversation_id, MAX(created_at) as last_out_at
                    FROM messages
                    WHERE conversation_id = %s AND message_type = 1
                    GROUP BY conversation_id
                )
                SELECT 
                    m.id, 
                    m.conversation_id, 
                    m.content, 
                    m.created_at, 
                    c.display_id,
                    a.id as attachment_id,
                    a.file_type,
                    asb.key as blob_key,
                    asb.filename,
                    asb.content_type,
                    asb.byte_size
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                LEFT JOIN latest_outgoing lo ON lo.conversation_id = m.conversation_id
                LEFT JOIN attachments a ON a.message_id = m.id
                LEFT JOIN active_storage_attachments asa ON (asa.record_type = 'Attachment' AND asa.record_id = a.id)
                LEFT JOIN active_storage_blobs asb ON asb.id = asa.blob_id
                WHERE m.conversation_id = %s
                  AND m.message_type = 0
                  AND m.created_at >= NOW() - INTERVAL '4 hours'
                  AND (lo.last_out_at IS NULL OR m.created_at > lo.last_out_at)
                  AND (
                      (m.content IS NOT NULL AND LENGTH(TRIM(m.content)) > 0)
                      OR a.id IS NOT NULL
                  )
                ORDER BY m.id ASC;
            """, (conversation_id, conversation_id))
            rows = cur.fetchall()

            if not rows:
                return None

            # Agrupa por mensagem (para suportar múltiplos anexos na mesma mensagem)
            messages_map: Dict[int, Dict[str, Any]] = {}
            for r in rows:
                mid, cid, content, ctime, disp_id, att_id, file_type, blob_key, filename, content_type, byte_size = r
                if mid not in messages_map:
                    messages_map[mid] = {
                        "id": mid,
                        "conversation_id": cid,
                        "content": content,
                        "created_at": ctime,
                        "display_id": disp_id,
                        "attachments": []
                    }
                if att_id and blob_key:
                    messages_map[mid]["attachments"].append({
                        "id": att_id,
                        "file_type": file_type,
                        "blob_key": blob_key,
                        "filename": filename,
                        "content_type": content_type,
                        "byte_size": byte_size
                    })

            messages_list = list(messages_map.values())
            if not messages_list:
                return None

            # Verifica mensagens já despachadas no SQLite
            all_mids = [m["id"] for m in messages_list]
            with get_db_connection() as conn:
                cur_lite = conn.cursor()
                placeholders = ",".join(["?"] * len(all_mids))
                cur_lite.execute(
                    f"SELECT entity_id FROM reactive_events_state WHERE source = 'chatwoot' AND entity_id IN ({placeholders})",
                    tuple(str(m) for m in all_mids)
                )
                already_handled = {int(row[0]) for row in cur_lite.fetchall()}

            unhandled = [m for m in messages_list if m["id"] not in already_handled]
            if not unhandled:
                return None

            disp_num = unhandled[0]["display_id"] or conversation_id
            first_mid = unhandled[0]["id"]
            latest_mid = unhandled[-1]["id"]
            first_time = unhandled[0]["created_at"].astimezone(BRT).strftime("%H:%M:%S")
            latest_time = unhandled[-1]["created_at"].astimezone(BRT).strftime("%H:%M:%S")

            # Reconhecimento visual dos anexos (Gemini Vision) em qualquer mensagem do lote
            vision_summaries = []
            image_count = 0
            for m in unhandled:
                clean_msg_content = str(m["content"] or "").strip()
                for att in m["attachments"]:
                    ct = str(att.get("content_type") or "").lower()
                    ft = att.get("file_type")
                    blob_key = att.get("blob_key")
                    fname = att.get("filename") or "foto.jpg"

                    if (ft == 0 or ct.startswith("image/")) and blob_key:
                        image_count += 1
                        vision_result = analyze_chatwoot_image(blob_key, filename=fname, caption=clean_msg_content)
                        if vision_result:
                            vision_summaries.append(
                                f"📷 **Foto Anexada [{fname}]:**\n{vision_result}"
                            )
                        else:
                            vision_summaries.append(
                                f"📷 **Foto Anexada [{fname}]** (ActiveStorage ID: `{blob_key}`)."
                            )

            # Histórico estritamente anterior ao primeiro item deste lote acumulado
            history_text = get_chatwoot_conversation_history(pg_conn, conversation_id, limit=10, before_message_id=first_mid)

            if len(unhandled) == 1:
                single_msg = unhandled[0]
                clean_content = str(single_msg["content"] or "").strip()
                prompt_lines = [
                    "[🚨 ATENDIMENTO IMEDIATO - MENSAGEM NO CHATWOOT]",
                    f"• Conversa #{disp_num} (Mensagem ID: {single_msg['id']})",
                    f"• Horário do Envio: {first_time}",
                    f'• Remetente / Conteúdo de Texto Atual:\n\"{clean_content or "(Nenhum texto informado - mensagem composta por foto/mídia)"}\"'
                ]
            else:
                prompt_lines = [
                    "[🚨 ATENDIMENTO IMEDIATO - MENSAGENS EM SEQUÊNCIA NO CHATWOOT]",
                    f"• Conversa #{disp_num} ({len(unhandled)} mensagens acumuladas do cliente em sequência)",
                    f"• Período do Envio: {first_time} até {latest_time}",
                    "• Mensagens Recebidas do Cliente (analisar o contexto completo em conjunto antes de responder):"
                ]
                for m in unhandled:
                    m_time = m["created_at"].astimezone(BRT).strftime("%H:%M:%S")
                    m_txt = str(m["content"] or "").strip() or "(Mensagem com anexo de foto)"
                    prompt_lines.append(f'  - [{m_time}] \"{m_txt}\"')

            if vision_summaries:
                prompt_lines.append("\n📸 [RECONHECIMENTO VISUAL DE ANEXOS (GEMINI VISION)]:")
                prompt_lines.extend(vision_summaries)

            prompt_lines.append(
                f"\n📜 [HISTÓRICO RECENTE DA CONVERSA — CONTEXTO COMPLETO (CLIENTES & OPERADORES)]:\n"
                f"{history_text}\n"
            )

            from api.tasks_queue import get_setting
            brand_name = get_setting("company_name") or os.getenv("COMPANY_NAME", "AI Board")
            store_url_cfg = os.getenv("DELIVERY_STORE_URL", "")

            prompt_lines.append(
                f"\n• DIRETRIZES DE ATENDIMENTO ({brand_name} — PADRÃO CHATWOOT / WHATSAPP):\n"
                "1) Tom de Voz 100% Humano, Natural e Descomplicado:\n"
                f"   - Escreva exatamente como a equipe de atendimento responde no WhatsApp da {brand_name}.\n"
                "   - É PROIBIDO soar como chatbot ou script automático.\n"
                "   - Anti-Bajulação: Seja simpático, prestativo e direto ao ponto. Use 0 ou no máximo 1 emoji simples e amigável (ex: 😊, 👍, 😉).\n"
                "2) Soluções e Respostas Diretas por Tipo de Situação:\n"
                "   • Dúvida de Loja Física & Onde Entrega:\n"
                f"     - Oriente o cliente sobre as unidades disponíveis{f' e o canal de delivery ({store_url_cfg})' if store_url_cfg else ''}.\n"
                "   • Retirada por Motorista de App (Uber / 99 / Flash / Lalamove):\n"
                "     - Confirme a possibilidade de retirada (Pick-up) mediante identificação do código ou nome do motorista.\n"
                "   • Eventos, Aniversários & Grandes Encomendas:\n"
                "     - Informe sobre pacotes especiais para eventos corporativos ou comemorações conforme as regras da organização.\n"
                "   • Insumo em Preparo ou Espera:\n"
                "     - Seja 100% transparente com o tempo real de preparo e ofereça alternativa equivalente caso o cliente tenha pressa.\n"
                "   • Dificuldade ou Bug no Site de Delivery:\n"
                "     - Peça um print/foto da tela do erro para verificação rápida e avise assim que normalizado.\n"
                "   • Cobrança Duplicada / Pedido de Estorno no Cartão:\n"
                "     - Peça gentilmente o comprovante ou extrato para conciliação financeira no sistema.\n"
                "   • Propostas Comerciais Não Solicitadas:\n"
                "     - Responda educadamente em 1 linha agradecendo o contato.\n"
                "   • Grupo Operacional Interno (Fotos de Equipamento / Auditoria de Turno):\n"
                "     - Se a mensagem vier do grupo de operação com foto de equipamento ou balança, audite a conformidade com o procedimento padrão.\n"
                "3) Resposta Completa em Mensagem Única:\n"
                "   - Se for apenas saudação ('Oi', 'Boa tarde'), responda de forma curta e amigável: 'Boa tarde, [Nome]! Tudo bem? Como posso te ajudar por aqui hoje?'.\n"
                "   - Se houver dúvida ou relato, vá direto à solução sem enrolação.\n"
                "4) Formule o texto exato pronto para envio dentro do bloco estruturado de ação abaixo:\n\n"
                "```action\n"
                "{\n"
                f'  "action_type": "chatwoot_reply",\n'
                f'  "conversation_id": {conversation_id},\n'
                '  "message": "<escreva aqui a mensagem humana, natural, direta ao ponto e sem bajulação pronta para envio no WhatsApp>",\n'
                '  "summary": "<resumo executivo do objetivo da resposta>"\n'
                "}\n"
                "```"
            )

            details_text = f"Mensagem conversa #{disp_num}: "
            if len(unhandled) > 1:
                details_text = f"Lote ({len(unhandled)} msgs) conv #{disp_num}: "
            if image_count > 0:
                details_text += f"[📸 {image_count} foto(s)] "
            preview = " / ".join([str(m["content"] or "").strip()[:35] for m in unhandled if m["content"]])
            details_text += preview[:60]

            return {
                "key": f"chatwoot_batch_{conversation_id}_{latest_mid}",
                "source": "chatwoot",
                "entity_id": str(latest_mid),
                "trigger_type": "chatwoot_event",
                "fallback_agent": "agent-cmo-sac",
                "prompt": "\n".join(prompt_lines),
                "details": details_text,
                "related_message_ids": all_mids
            }
    except Exception as e:
        logger.error(f"Erro ao construir lote do Chatwoot (conversa #{conversation_id}): {e}")
        return None
    finally:
        if pg_conn:
            try:
                pg_conn.close()
            except Exception:
                pass


def process_chatwoot_conversation_batch(conversation_id: int) -> Optional[str]:
    """Dispara a execução do CrewAI para o lote de mensagens acumuladas da conversa após o debounce."""
    with _chatwoot_timers_lock:
        _chatwoot_active_timers.pop(conversation_id, None)
        _chatwoot_buffer_meta.pop(conversation_id, None)

    logger.info(f"⚡ [CHATWOOT DEBOUNCE FINALIZADO]: Processando lote acumulado da conversa #{conversation_id}...")
    event = build_chatwoot_batch_event(conversation_id)
    if not event:
        logger.info(f"ℹ️ [CHATWOOT]: Nenhum evento pendente para conversa #{conversation_id} (possivelmente já respondido ou vazio).")
        return None

    task_id = dispatch_reactive_event(event)
    return task_id


def schedule_chatwoot_debounce(conversation_id: int, delay_seconds: float = 30.0):
    """Agenda ou reagenda o timer de debounce de mensagens para uma conversa."""
    with _chatwoot_timers_lock:
        if conversation_id in _chatwoot_active_timers:
            try:
                _chatwoot_active_timers[conversation_id].cancel()
            except Exception:
                pass

        timer = threading.Timer(delay_seconds, process_chatwoot_conversation_batch, args=(conversation_id,))
        timer.daemon = True
        _chatwoot_active_timers[conversation_id] = timer
        timer.start()


def handle_chatwoot_webhook(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Receptor oficial de webhooks do Chatwoot com proteção de atendimento humano (Human Takeover) e debounce inteligente."""
    event = payload.get("event")
    if not event or event == "ping":
        return {"status": "ok", "message": "Disparo recebido e validado com sucesso! Conexão Chatwoot operacional."}

    conversation = payload.get("conversation") or {}
    conv_id = conversation.get("id") or payload.get("conversation_id")
    msg_id = payload.get("id")
    raw_msg_type = payload.get("message_type")
    sender = payload.get("sender") or {}
    sender_type = str(sender.get("type") or "").lower()
    operator_name = str(sender.get("name") or "Operador Humano").strip()

    # Se for mensagem de saída (enviada por operador humano):
    if raw_msg_type in ("outgoing", 1) or sender_type in ("user", "agent"):
        if conv_id:
            record_chatwoot_human_reply(int(conv_id), msg_id=msg_id, operator_name=operator_name)
            logger.info(
                f"👨‍💼 [CHATWOOT HUMAN TAKEOVER]: Operador ({operator_name}) respondeu na conversa #{conv_id}. "
                f"Timer de debounce cancelado, ações pendentes abortadas e acompanhamento automático pausado."
            )
            return {
                "status": "ok",
                "action": "operator_active_paused",
                "conversation_id": conv_id,
                "operator": operator_name
            }

    # Se for mensagem de atividade do sistema (ex: atribuição automática de fila):
    if raw_msg_type in ("activity", 2):
        return {"status": "ok", "action": "ignored_activity"}

    # Se for mensagem recebida de cliente:
    if event in ("message_created", "conversation_created"):
        if not conv_id:
            logger.warning("Webhook Chatwoot recebido sem conversation_id.")
            return {"status": "ok", "received": True}

        conv_id = int(conv_id)
        human_st = get_conversation_human_status(conv_id)

        # Se um humano já respondeu nesta conversa e o modo de pausa ('pause') está ativo, o agente para de acompanhar a conversa!
        if human_st.get("human_active_in_conversation") and human_st.get("mode") == "pause":
            with _chatwoot_timers_lock:
                if conv_id in _chatwoot_active_timers:
                    try:
                        _chatwoot_active_timers[conv_id].cancel()
                    except Exception:
                        pass
                    del _chatwoot_active_timers[conv_id]
                _chatwoot_buffer_meta.pop(conv_id, None)

            if msg_id:
                try:
                    with get_db_connection() as conn:
                        conn.execute("""
                            INSERT OR IGNORE INTO reactive_events_state
                            (event_key, source, entity_id, detected_at, task_id, details, status)
                            VALUES (?, 'chatwoot', ?, ?, 'human_takeover', 'Conversa já acompanhada por humano — IA pausada', 'ignored_human_takeover')
                        """, (f"chatwoot_msg_{msg_id}", str(msg_id), time.time()))
                        conn.commit()
                except Exception:
                    pass

            elapsed_min = int((human_st.get("elapsed_since_human_seconds") or 0) // 60)
            logger.info(
                f"👨‍💼 [CHATWOOT HUMAN TAKEOVER]: Conversa #{conv_id} já está sendo atendida por humano "
                f"(última resposta há {elapsed_min} min). Agente parou de acompanhar a conversa para não competir."
            )
            return {
                "status": "ok",
                "action": "paused_human_takeover",
                "conversation_id": conv_id,
                "elapsed_since_human_seconds": human_st.get("elapsed_since_human_seconds"),
            }

        wait_seconds = float(human_st.get("effective_wait_seconds") or CHATWOOT_DEBOUNCE_SECONDS)
        max_wait_seconds = float(human_st.get("max_wait_seconds") or CHATWOOT_MAX_WAIT_SECONDS)

        now = time.time()
        with _chatwoot_timers_lock:
            if conv_id not in _chatwoot_buffer_meta:
                _chatwoot_buffer_meta[conv_id] = {
                    "first_seen": now,
                    "last_seen": now,
                    "count": 1,
                    "messages": [msg_id] if msg_id else []
                }
            else:
                _chatwoot_buffer_meta[conv_id]["last_seen"] = now
                _chatwoot_buffer_meta[conv_id]["count"] += 1
                if msg_id and msg_id not in _chatwoot_buffer_meta[conv_id]["messages"]:
                    _chatwoot_buffer_meta[conv_id]["messages"].append(msg_id)

            first_seen = _chatwoot_buffer_meta[conv_id]["first_seen"]
            msg_count = _chatwoot_buffer_meta[conv_id]["count"]

            # Trava de segurança: se o cliente estiver mandando mensagens sem parar além do limite máximo, processa agora
            if now - first_seen >= max_wait_seconds:
                logger.info(f"⚡ [CHATWOOT MAX WAIT ATINGIDO]: Conversa #{conv_id} acumulou por {max_wait_seconds}s. Disparando lote...")
                if conv_id in _chatwoot_active_timers:
                    try:
                        _chatwoot_active_timers[conv_id].cancel()
                    except Exception:
                        pass
                    del _chatwoot_active_timers[conv_id]
                t = threading.Thread(target=process_chatwoot_conversation_batch, args=(conv_id,), daemon=True)
                t.start()
                return {"status": "ok", "action": "dispatched_max_wait", "conversation_id": conv_id, "buffered_count": msg_count}

            # Agenda/reagenda o timer de espera para dar prioridade ao atendente humano
            if conv_id in _chatwoot_active_timers:
                try:
                    _chatwoot_active_timers[conv_id].cancel()
                except Exception:
                    pass

            timer = threading.Timer(wait_seconds, process_chatwoot_conversation_batch, args=(conv_id,))
            timer.daemon = True
            _chatwoot_active_timers[conv_id] = timer
            _chatwoot_active_timers[conv_id].start()

            logger.info(
                f"⏳ [CHATWOOT DEBOUNCE]: Conversa #{conv_id} acumulando ({msg_count} msg(s)). "
                f"Aguardando {int(wait_seconds)}s para prioridade de resposta humana..."
            )
            return {
                "status": "ok",
                "action": "buffered",
                "conversation_id": conv_id,
                "debounce_seconds": wait_seconds,
                "buffered_count": msg_count
            }

    return {"status": "ok", "event": event, "received": True}


def check_chatwoot_events() -> List[Dict[str, Any]]:
    """Varredura periódica de fallback do Chatwoot respeitando o Human Takeover e a janela estendida de prioridade humana."""
    events = []
    pg_conn = None
    try:
        pg_conn = get_chatwoot_postgres_conn()
        with pg_conn.cursor() as cur:
            cur.execute("""
                WITH latest_outgoing AS (
                    SELECT conversation_id, MAX(created_at) as last_out_at
                    FROM messages
                    WHERE message_type = 1
                      AND COALESCE(private, false) = false
                      AND created_at >= NOW() - INTERVAL '24 hours'
                    GROUP BY conversation_id
                )
                SELECT 
                    m.conversation_id, 
                    MAX(m.created_at) as latest_in_at,
                    COUNT(m.id) as pending_count
                FROM messages m
                LEFT JOIN latest_outgoing lo ON lo.conversation_id = m.conversation_id
                WHERE m.message_type = 0
                  AND m.created_at >= NOW() - INTERVAL '4 hours'
                  AND (lo.last_out_at IS NULL OR m.created_at > lo.last_out_at)
                  AND (m.content IS NOT NULL AND LENGTH(TRIM(m.content)) > 0)
                GROUP BY m.conversation_id;
            """)
            rows = cur.fetchall()

            now_utc = datetime.now(timezone.utc)
            for r in rows:
                cid, latest_in_at, count = r
                if latest_in_at.tzinfo is None:
                    latest_in_at = latest_in_at.replace(tzinfo=timezone.utc)

                human_st = get_conversation_human_status(int(cid), pg_conn=pg_conn)
                if human_st.get("should_pause"):
                    continue

                wait_seconds = float(human_st.get("effective_wait_seconds") or CHATWOOT_DEBOUNCE_SECONDS)
                elapsed = (now_utc - latest_in_at).total_seconds()

                # Se a mensagem foi recebida dentro da janela de espera humana, agenda timer para o restante
                if elapsed < wait_seconds:
                    with _chatwoot_timers_lock:
                        if cid not in _chatwoot_active_timers:
                            rem = max(5.0, wait_seconds - elapsed)
                            schedule_chatwoot_debounce(cid, delay_seconds=rem)
                    continue

                # Se já passou da janela de silêncio sem resposta humana:
                with _chatwoot_timers_lock:
                    if cid in _chatwoot_active_timers:
                        continue  # O timer já cuidará deste disparo

                batch_ev = build_chatwoot_batch_event(cid)
                if batch_ev:
                    events.append(batch_ev)

    except Exception as e:
        logger.warning(f"Erro ao checar eventos no Chatwoot Postgres: {e}")
    finally:
        if pg_conn:
            try:
                pg_conn.close()
            except Exception:
                pass
    return events


# =====================================================================
# 5. MONITORAMENTO: FREESCOUT HELPDESK (CHAMADOS URGENTES DE LOJAS)
# =====================================================================
def check_freescout_events() -> List[Dict[str, Any]]:
    """Verifica chamados novos no FreeScout via MariaDB nativo."""
    events = []
    conn = None
    try:
        import pymysql
        conn = pymysql.connect(
            host=os.getenv("FREESCOUT_DB_HOST", "freescout-db"),
            port=int(os.getenv("FREESCOUT_DB_PORT", "3306")),
            user=os.getenv("FREESCOUT_DB_USER", "freescout"),
            password=os.getenv("FREESCOUT_DB_PASS", ""),
            database=os.getenv("FREESCOUT_DB_NAME", "freescout"),
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=4
        )

        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.number, c.subject, c.customer_email, c.created_at, c.status
                FROM conversations c
                WHERE c.status IN (1, 2)
                  AND c.created_at >= NOW() - INTERVAL 4 HOUR
                ORDER BY c.id DESC
                LIMIT 10;
            """)
            rows = cur.fetchall()

            for r in rows:
                tid = str(r["id"])
                ev_key = f"freescout_ticket_{tid}"

                prompt = (
                    f"[🚨 NOVO CHAMADO NO HELPDESK - FREESCOUT]\n"
                    f"• Ticket: #{r['number']} - \"{r['subject']}\"\n"
                    f"• Solicitante: {r['customer_email']}\n"
                    f"• Data/Horário: {r['created_at']}\n\n"
                    f"• Instrução Executiva: Analisar o chamado operacional da loja, consultar os procedimentos "
                    f"e POPs oficiais no Google Drive e orientar a equipe ou encaminhar para manutenção imediata."
                )

                events.append({
                    "key": ev_key,
                    "source": "freescout",
                    "entity_id": tid,
                    "trigger_type": "freescout_event",
                    "fallback_agent": "agent-coo-manuals",
                    "prompt": prompt,
                    "details": f"Ticket #{r['number']}: {r['subject']}"
                })

    except Exception as e:
        logger.warning(f"Erro ao checar eventos no FreeScout MariaDB: {e}")
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass
    return events


# =====================================================================
# 6. GMAIL É UMA FERRAMENTA (TOOL), NÃO UM GATILHO
# =====================================================================
# O Gmail opera estritamente como ferramenta passiva (read/search/send)
# sob demanda explícita dos agentes, NUNCA como gatilho autônomo de disparo.
def check_gmail_events() -> List[Dict[str, Any]]:
    return []

# =====================================================================
# 7. RECEPTOR DE GATILHO SOB MEDIDA (CUSTOM WEBHOOKS)
# =====================================================================
def ingest_custom_webhook_event(
    event_key: str,
    payload: Dict[str, Any],
    token: Optional[str] = None
) -> Dict[str, Any]:
    """Processa um evento HTTP POST recebido para o Gatilho Sob Medida."""
    from api.tasks_queue import get_canvas_topology
    topo = get_canvas_topology()
    nodes = topo.get("nodes", [])

    matching_node = None
    for n in nodes:
        if n.get("type") == "trigger":
            ndata = n.get("data", {})
            ntype = ndata.get("type", "")
            node_event_key = ndata.get("eventKey") or ndata.get("customKey") or "custom"
            if ntype == "custom" and (node_event_key == event_key or event_key == "custom"):
                matching_node = n
                break

    node_data = matching_node.get("data", {}) if matching_node else {}
    expected_token = node_data.get("secretToken") or ""
    if expected_token and token != expected_token:
        return {
            "status": "unauthorized",
            "message": "Token de autenticação (X-Webhook-Secret ou ?token=) inválido para este gatilho."
        }

    # Validação de palavras-chave / filtro se configurado
    keywords_filter = (node_data.get("filterKeywords") or "").strip()
    payload_str = json.dumps(payload, ensure_ascii=False)
    if keywords_filter:
        kws = [k.strip().lower() for k in keywords_filter.split(",") if k.strip()]
        if not any(k in payload_str.lower() for k in kws):
            return {
                "status": "filtered_out",
                "reason": f"O payload recebido não contém nenhuma das palavras-chave exigidas: {keywords_filter}"
            }

    custom_prompt_tpl = node_data.get("promptTemplate") or (
        f"Analise o evento customizado '{event_key}' recebido via webhook. Verifique os parâmetros e execute a ação necessária."
    )

    trig_cfg = get_trigger_config(matching_node.get("id") if matching_node else "custom", fallback_agent_id="agent-ceo")
    now_ts = time.time()
    dedup_key = f"custom_{event_key}_{int(now_ts * 1000)}"

    prompt = (
        f"[⚡ GATILHO SOB MEDIDA ACIONADO — {event_key.upper()}]\n"
        f"• Chave do Evento: `{event_key}`\n"
        f"• Horário do Disparo: {datetime.now(BRT).strftime('%d/%m/%Y às %H:%M:%S')}\n"
        f"• Dados Recebidos (JSON):\n"
        f"```json\n{json.dumps(payload, indent=2, ensure_ascii=False)[:2000]}\n```\n\n"
        f"🛠️ [INSTRUÇÃO EXECUTIVA]:\n"
        f"{custom_prompt_tpl}\n"
    )

    task_id = dispatch_reactive_event({
        "key": dedup_key,
        "source": f"custom_{event_key}",
        "entity_id": str(int(now_ts)),
        "trigger_type": "custom",
        "fallback_agent": trig_cfg.get("target_agent", "agent-ceo"),
        "prompt": prompt,
        "details": f"Gatilho Customizado [{event_key}]: {payload_str[:60]}"
    })

    return {
        "status": "ok",
        "task_id": task_id,
        "event_key": event_key,
        "dispatched_to_agent": trig_cfg.get("target_agent", "agent-ceo"),
        "timestamp": now_ts
    }


# =====================================================================
# 8. DISPACHO & DEDUPLICAÇÃO DE EVENTOS REATIVOS
# =====================================================================
def dispatch_reactive_event(event: Dict[str, Any]) -> Optional[str]:
    """Valida se o evento já foi processado e, se for novo, enfileira a tarefa imediata no CrewAI."""
    from api.tasks_queue import create_task

    key = event["key"]
    source = event["source"]
    entity_id = event["entity_id"]
    trigger_type = event.get("trigger_type", "custom")
    fallback_agent = event.get("fallback_agent", "agent-ceo")
    prompt = event["prompt"]
    details = event.get("details", "")

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT event_key FROM reactive_events_state WHERE event_key = ?", (key,))
        if cur.fetchone():
            return None  # Já processado anteriormente

        target_agent = get_target_agent_for_trigger(trigger_type, fallback_agent)

        logger.info(f"⚡ [GATILHO REATIVO DISPARADO]: {key} -> Agente: {target_agent}")

        task_id = create_task(
            crew_name="operational",
            prompt=prompt,
            requester=f"reactive_trigger:{source}:{entity_id}",
            user_email=os.getenv("SYSTEM_EMAIL", "system@ai-board.local"),
            user_name=f"Gatilho ({source.upper()})"
        )

        cur.execute("""
            INSERT INTO reactive_events_state (event_key, source, entity_id, detected_at, task_id, details, status)
            VALUES (?, ?, ?, ?, ?, ?, 'dispatched')
        """, (key, source, entity_id, time.time(), task_id, details))

        related_message_ids = event.get("related_message_ids") or []
        for mid in related_message_ids:
            cur.execute("""
                INSERT OR IGNORE INTO reactive_events_state (event_key, source, entity_id, detected_at, task_id, details, status)
                VALUES (?, ?, ?, ?, ?, ?, 'dispatched_in_batch')
            """, (f"chatwoot_msg_{mid}", source, str(mid), time.time(), task_id, f"Processado no lote {key}"))

        conn.commit()

        return task_id


# =====================================================================
# 7. CICLO DE EXECUÇÃO & EVENT LOOP
# =====================================================================
def run_event_loop_iteration() -> Dict[str, Any]:
    """Executa uma rodada completa de verificação de eventos em cada canal individual."""
    global _last_scan_timestamp, _last_scan_stats

    start_time = time.time()
    dispatched_count = 0
    checked_events = []

    from api.tasks_queue import send_system_telegram_alert

    # 1. Gatilho Entrega Aki (ERP delivery_proprio)
    try:
        aki_evs = check_entrega_aki_events()
        checked_events.extend(aki_evs)
    except Exception as e:
        logger.error(f"Erro no gatilho Entrega Aki: {e}")
        send_system_telegram_alert("Erro no Gatilho Entrega Aki", str(e), severity="WARNING", source="trigger_entrega_aki")

    # 2. Gatilho iFood
    try:
        ifood_evs = check_ifood_events()
        checked_events.extend(ifood_evs)
    except Exception as e:
        logger.error(f"Erro no gatilho iFood: {e}")
        send_system_telegram_alert("Erro no Gatilho iFood", str(e), severity="WARNING", source="trigger_ifood")

    # 3. Gatilho 99 Food
    try:
        n99_evs = check_99food_events()
        checked_events.extend(n99_evs)
    except Exception as e:
        logger.error(f"Erro no gatilho 99 Food: {e}")
        send_system_telegram_alert("Erro no Gatilho 99 Food", str(e), severity="WARNING", source="trigger_99food")

    # 4. Gatilho Chatwoot
    try:
        chat_evs = check_chatwoot_events()
        checked_events.extend(chat_evs)
    except Exception as e:
        logger.error(f"Erro no gatilho Chatwoot: {e}")
        send_system_telegram_alert("Erro no Gatilho Chatwoot", str(e), severity="WARNING", source="trigger_chatwoot")

    # 5. Gatilho FreeScout
    try:
        free_evs = check_freescout_events()
        checked_events.extend(free_evs)
    except Exception as e:
        logger.error(f"Erro no gatilho FreeScout: {e}")
        send_system_telegram_alert("Erro no Gatilho FreeScout", str(e), severity="WARNING", source="trigger_freescout")

    # Gmail é ferramenta passiva (não é gatilho)

    for ev in checked_events:
        tid = dispatch_reactive_event(ev)
        if tid:
            dispatched_count += 1

    duration_ms = int((time.time() - start_time) * 1000)
    _last_scan_timestamp = time.time()
    _last_scan_stats = {
        "timestamp": _last_scan_timestamp,
        "duration_ms": duration_ms,
        "scanned_total": len(checked_events),
        "dispatched_new": dispatched_count,
        "sources": {
            "entrega_aki": len(aki_evs),
            "ifood": len(ifood_evs),
            "99food": len(n99_evs),
            "chatwoot": len(chat_evs),
            "freescout": len(free_evs),
            "gmail": 0
        }
    }

    return _last_scan_stats


# LOOP DE BACKGROUND DESATIVADO: Nenhuma rotina deve rodar fora do CRON oficial
def _event_listener_worker():
    return

def start_event_loop():
    logger.info("Loop em background desativado: toda rotina periódica roda exclusivamente no CRON oficial.")
    return


def get_event_loop_status() -> Dict[str, Any]:
    """Retorna o status atual do loop de eventos e webhooks para o frontend e diagnósticos."""
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM reactive_events_state")
        total_events = cur.fetchone()[0]

        cur.execute("""
            SELECT event_key, source, entity_id, detected_at, task_id, details, status
            FROM reactive_events_state
            ORDER BY detected_at DESC
            LIMIT 10
        """)
        recent_rows = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT id, platform, event_code, cause_code, cause_label, order_id, customer_name, summary, source_mode, dispatched_task_id, created_at
            FROM delivery_webhook_events
            ORDER BY created_at DESC
            LIMIT 15
        """)
        recent_webhook_events = [dict(r) for r in cur.fetchall()]

    return {
        "is_active": _loop_running,
        "last_scan_stats": _last_scan_stats,
        "total_dispatched_lifetime": total_events,
        "recent_dispatched_events": recent_rows,
        "recent_webhook_events": recent_webhook_events,
        "causes_catalog": CAUSE_CATALOG
    }
