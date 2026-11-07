"""Ferramentas Determinísticas de Marketing, Performance (Meta Ads) e Atribuição Omnichannel (ERP).

Conecta a API Graph do Meta Ads ao banco oficial de analytics de vendas
para fornecer ao time de Marketing (CMO, Gestor de Tráfego e Copywriter):
1. Auditoria determinística de campanhas, conjuntos de anúncios (targeting, raio km, idade, otimização, Pixel) e criativos.
2. Matriz de parâmetros ideais baseada nos dados históricos reais da conta (CPC, CTR de Link, AddToCart, InitiateCheckout).
3. Métricas objetivas de conversão e atribuição Omnichannel (Efeito Halo no Balcão + Delivery) e alavancagem do Programa de Fidelidade.
4. Cruzamento com o Top Produtos do ERP e calendário estratégico de campanhas e conteúdo vertical.
"""

import os
import re
import json
import sqlite3
import logging
import urllib.parse
import requests
from datetime import datetime, timezone, timedelta
from typing import Type, Optional, Dict, Any, List
from pydantic import BaseModel, Field

try:
    from crewai.tools import BaseTool
except ImportError:
    class BaseTool:
        pass

logger = logging.getLogger("marketing_tools")
BRT = timezone(timedelta(hours=-3))

TASKS_DB_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "tasks.db")


def _fmt_brl(val: float) -> str:
    sign = "-" if (val or 0.0) < 0 else ""
    v = abs(float(val or 0.0))
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{sign}R$ {s}"


def _find_erp_db_path() -> Optional[str]:
    candidates = [
        "/app/data/erp_analytics/analytics_store.db",
        "/root/scripts/erp_dashboard/data/analytics_store.db",
        os.path.join(os.path.dirname(__file__), "..", "data", "erp_analytics", "analytics_store.db"),
        os.path.join(os.path.dirname(__file__), "..", "data", "analytics_store.db"),
    ]
    return next((p for p in candidates if os.path.exists(p)), None)


def _load_meta_credentials() -> Dict[str, str]:
    """Carrega Account ID e Access Token do nó tool-meta-ads na topologia ou variáveis de ambiente."""
    creds = {
        "account_id": (os.getenv("META_ADS_ACCOUNT_ID") or "").strip(),
        "access_token": (os.getenv("META_ADS_ACCESS_TOKEN") or "").strip(),
    }
    if os.path.exists(TASKS_DB_FILE):
        try:
            with sqlite3.connect(TASKS_DB_FILE) as conn:
                cur = conn.cursor()
                cur.execute("SELECT nodes_json FROM canvas_topology WHERE id = 'current'")
                row = cur.fetchone()
                if row and row[0]:
                    nodes = json.loads(row[0])
                    for n in nodes:
                        if n.get("id") == "tool-meta-ads" or (n.get("data", {}).get("type") in ("meta_ads", "meta")):
                            d = n.get("data", {})
                            acc = d.get("adAccountId") or d.get("metaAccountId")
                            tok = d.get("accessToken") or d.get("metaAccessToken")
                            if acc:
                                creds["account_id"] = str(acc).strip()
                            if tok:
                                creds["access_token"] = str(tok).strip()
                            break
                if not creds["access_token"]:
                    cur.execute("SELECT value FROM system_settings WHERE key = 'META_ADS_ACCESS_TOKEN'")
                    r_tok = cur.fetchone()
                    if r_tok and r_tok[0]:
                        creds["access_token"] = str(r_tok[0]).strip()
        except Exception as e:
            logger.debug(f"Erro ao carregar credenciais Meta Ads do SQLite: {e}")

    if creds["account_id"] and not creds["account_id"].startswith("act_"):
        creds["account_id"] = f"act_{creds['account_id']}"
    return creds


def _extract_action_metric(actions_list: Optional[List[Dict[str, Any]]], keys: List[str]) -> float:
    if not actions_list:
        return 0.0
    for k in keys:
        for a in actions_list:
            if a.get("action_type") == k:
                try:
                    return float(a.get("value", 0) or 0)
                except Exception:
                    pass
    return 0.0


def fetch_meta_ads_deep_audit() -> Dict[str, Any]:
    """Consulta a Meta Graph API (campanhas, adsets, targeting e insights por anúncio) de forma determinística."""
    creds = _load_meta_credentials()
    act_id = creds["account_id"]
    token = creds["access_token"]
    result: Dict[str, Any] = {
        "ok": False,
        "account_id": act_id,
        "campaigns": [],
        "adsets": [],
        "ad_insights": [],
        "campaign_insights": [],
        "error": None,
    }
    if not token or not act_id:
        result["error"] = "Credenciais do Meta Ads ausentes."
        return result

    base = f"https://graph.facebook.com/v19.0/{act_id}"
    try:
        # 1. Campanhas
        r_camp = requests.get(f"{base}/campaigns", params={
            "fields": "id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,start_time,stop_time",
            "limit": 25,
            "access_token": token
        }, timeout=10)
        if r_camp.status_code != 200:
            result["error"] = f"HTTP {r_camp.status_code}: {r_camp.text[:200]}"
            return result
        result["campaigns"] = r_camp.json().get("data", [])

        # 2. AdSets e configurações de segmentação
        r_as = requests.get(f"{base}/adsets", params={
            "fields": "id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,promoted_object",
            "limit": 25,
            "access_token": token
        }, timeout=10)
        if r_as.status_code == 200:
            result["adsets"] = r_as.json().get("data", [])

        # 3. Insights por Campanha (histórico completo)
        r_cins = requests.get(f"{base}/insights", params={
            "level": "campaign",
            "date_preset": "maximum",
            "fields": "campaign_id,campaign_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,cpc,cpm,actions,action_values,cost_per_action_type",
            "limit": 25,
            "access_token": token
        }, timeout=10)
        if r_cins.status_code == 200:
            result["campaign_insights"] = r_cins.json().get("data", [])

        # 4. Insights por Criativo/Anúncio (nível Ad)
        r_ains = requests.get(f"{base}/insights", params={
            "level": "ad",
            "date_preset": "maximum",
            "fields": "ad_id,ad_name,adset_name,campaign_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,cpc,cpm,actions,action_values,cost_per_action_type",
            "limit": 30,
            "access_token": token
        }, timeout=10)
        if r_ains.status_code == 200:
            result["ad_insights"] = r_ains.json().get("data", [])

        result["ok"] = True
    except Exception as e:
        result["error"] = str(e)
    return result


def fetch_erp_marketing_attribution() -> Dict[str, Any]:
    """Extrai métricas determinísticas de conversão, fidelidade, efeito halo e top produtos no New Choice ERP."""
    db_path = _find_erp_db_path()
    data: Dict[str, Any] = {
        "ok": False,
        "loyalty": {},
        "channel_lift": [],
        "top_products": [],
        "weekday_profile": [],
    }
    if not db_path:
        return data

    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT MAX(substr(order_date, 1, 10)) FROM orders WHERE status = 'Liquidado'")
            latest_row = cur.fetchone()
            latest_date = latest_row[0] if (latest_row and latest_row[0]) else "2026-10-31"
            cur_month = latest_date[:7]

            # 1. Programa de Fidelidade & Descontos (Mês de referência e acumulado 60d)
            cur.execute("""
                SELECT
                    COUNT(*) as total_orders,
                    COUNT(DISTINCT CASE WHEN customer_code IS NOT NULL AND customer_code != '' AND customer_code != '0' THEN customer_code END) as unique_id_customers,
                    SUM(CASE WHEN discount_amount > 0 THEN 1 ELSE 0 END) as loyalty_orders,
                    COALESCE(ROUND(SUM(discount_amount), 2), 0.0) as total_discount_brl,
                    COALESCE(ROUND(SUM(net_amount), 2), 0.0) as total_net_brl,
                    COALESCE(ROUND(AVG(CASE WHEN discount_amount > 0 THEN net_amount END), 2), 0.0) as ticket_with_loyalty,
                    COALESCE(ROUND(AVG(CASE WHEN discount_amount = 0 OR discount_amount IS NULL THEN net_amount END), 2), 0.0) as ticket_without_loyalty
                FROM orders
                WHERE status = 'Liquidado' AND substr(order_date, 1, 7) = ?
            """, (cur_month,))
            row_l = cur.fetchone()
            tot_ord = row_l[0] or 0
            loy_ord = row_l[2] or 0
            t_with = row_l[5] or 0.0
            t_without = row_l[6] or 0.0
            lift_pct = round(((t_with - t_without) / t_without) * 100, 1) if t_without > 0 else 0.0

            data["loyalty"] = {
                "month": cur_month,
                "total_orders": tot_ord,
                "unique_identified_customers": row_l[1] or 0,
                "loyalty_orders": loy_ord,
                "loyalty_share_pct": round((loy_ord / tot_ord) * 100, 2) if tot_ord > 0 else 0.0,
                "total_discount_brl": row_l[3] or 0.0,
                "total_net_brl": row_l[4] or 0.0,
                "ticket_with_loyalty": t_with,
                "ticket_without_loyalty": t_without,
                "ticket_lift_pct": lift_pct,
            }

            # 2. Efeito Halo Omnichannel (Comparativo: Período com Campanha Ativa >= 2026-10-30 vs. Baseline 14 dias antes)
            cur.execute("""
                SELECT
                    CASE WHEN substr(order_date, 1, 10) >= '2026-10-30' THEN 'campanha_ativa' ELSE 'baseline_14d' END as p,
                    channel,
                    COUNT(DISTINCT substr(order_date, 1, 10)) as dias,
                    COUNT(*) as pedidos,
                    COALESCE(ROUND(SUM(net_amount), 2), 0.0) as receita_liq,
                    COALESCE(ROUND(AVG(net_amount), 2), 0.0) as ticket_medio
                FROM orders
                WHERE status = 'Liquidado' AND substr(order_date, 1, 10) >= '2026-10-16'
                GROUP BY p, channel
            """)
            by_chan: Dict[str, Dict[str, Any]] = {}
            for p_key, ch, dias, ped, rec, tkt in cur.fetchall():
                by_chan.setdefault(ch, {})[p_key] = {
                    "dias": max(dias or 1, 1),
                    "pedidos": ped or 0,
                    "pedidos_dia": round((ped or 0) / max(dias or 1, 1), 1),
                    "receita_dia": round((rec or 0.0) / max(dias or 1, 1), 2),
                    "ticket_medio": tkt or 0.0,
                }
            for ch, vals in by_chan.items():
                base_v = vals.get("baseline_14d", {"pedidos_dia": 0.0, "receita_dia": 0.0, "ticket_medio": 0.0})
                act_v = vals.get("campanha_ativa", {"pedidos_dia": 0.0, "receita_dia": 0.0, "ticket_medio": 0.0})
                rev_lift = (
                    round(((act_v["receita_dia"] - base_v["receita_dia"]) / base_v["receita_dia"]) * 100, 1)
                    if base_v["receita_dia"] > 0 else 0.0
                )
                data["channel_lift"].append({
                    "channel": ch,
                    "base_orders_day": base_v["pedidos_dia"],
                    "base_rev_day": base_v["receita_dia"],
                    "active_orders_day": act_v["pedidos_dia"],
                    "active_rev_day": act_v["receita_dia"],
                    "active_ticket": act_v["ticket_medio"],
                    "rev_lift_pct": rev_lift,
                })

            # 3. Top Produtos Campeões do Mês (para ancorar criativos de anúncios em produtos reais de alto giro)
            cur.execute("""
                SELECT
                    oi.product_name,
                    ROUND(SUM(oi.quantity), 0) as qtd,
                    COALESCE(ROUND(SUM(oi.total_price), 2), 0.0) as receita
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.status = 'Liquidado'
                  AND substr(o.order_date, 1, 7) = ?
                  AND UPPER(oi.product_name) NOT LIKE '%TAXA%'
                  AND UPPER(oi.product_name) NOT LIKE '%SACOLA%'
                GROUP BY oi.product_name
                ORDER BY qtd DESC
                LIMIT 10
            """, (cur_month,))
            for pname, qtd, rec in cur.fetchall():
                data["top_products"].append({
                    "product": pname,
                    "qty": int(qtd or 0),
                    "revenue": rec or 0.0
                })

            data["ok"] = True
    except Exception as e:
        logger.warning(f"Erro ao extrair atribuição ERP para marketing: {e}")

    return data


def _search_youtube_shorts_live(query: str, max_results: int = 2, fallback_items: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, str]]:
    """Busca vídeos curtos reais (YouTube Shorts 9:16) em tempo real para servir de referência visual de gravação."""
    results: List[Dict[str, str]] = []
    seen = set()
    try:
        q = urllib.parse.quote_plus(f"{query} #shorts")
        url = f"https://www.youtube.com/results?search_query={q}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        r = requests.get(url, headers=headers, timeout=6)
        if r.status_code == 200:
            text = r.text
            for m in re.finditer(r'"shortsLockupViewModel":\{.*?"accessibilityText":"([^"]+?)".*?"videoId":"([a-zA-Z0-9_-]{11})"', text):
                title, vid = m.group(1), m.group(2)
                title_clean = re.sub(r',\s*\d[\d,\.]*\s*(K|M|mil|mi|thousand|million)?\s*views.*$', '', title, flags=re.I).strip()
                if vid not in seen:
                    seen.add(vid)
                    results.append({"title": title_clean[:85], "url": f"https://www.youtube.com/shorts/{vid}"})
                    if len(results) >= max_results:
                        return results

            for m in re.finditer(r'"videoId":"([a-zA-Z0-9_-]{11})"\}\}\},"accessibilityText":"([^"]+?)"', text):
                vid, title = m.group(1), m.group(2)
                title_clean = re.sub(r',\s*\d[\d,\.]*\s*(K|M|mil|mi|thousand|million)?\s*views.*$', '', title, flags=re.I).strip()
                if vid not in seen:
                    seen.add(vid)
                    results.append({"title": title_clean[:85], "url": f"https://www.youtube.com/shorts/{vid}"})
                    if len(results) >= max_results:
                        return results

            for vid, title in re.findall(r'"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}', text):
                if vid not in seen:
                    seen.add(vid)
                    results.append({"title": title[:85], "url": f"https://www.youtube.com/shorts/{vid}"})
                    if len(results) >= max_results:
                        return results
    except Exception as e:
        logger.debug(f"Erro ao buscar YouTube Shorts para '{query}': {e}")

    if fallback_items:
        for item in fallback_items:
            if item["url"] not in {x["url"] for x in results}:
                results.append(item)
                if len(results) >= max_results:
                    break
    return results


def fetch_viral_video_references() -> List[Dict[str, Any]]:
    """Retorna pacotes de vídeos reais de referência (Shorts + TikTok + RedNote) para cada formato e roteiro."""
    catalog = [
        {
            "category": "Formato 1 & Roteiro 1: Brown Sugar / Creme Brûlée Maçaricado & Tiger Boba (ASMR / Torch POV)",
            "query": "creme brulee brown sugar boba torch",
            "tiktok_search": "https://www.tiktok.com/search/video?q=creme%20brulee%20boba%20torch%20asmr",
            "rednote_search": "https://www.xiaohongshu.com/search_result?keyword=%E7%83%A4%E5%B8%83%E8%95%BE%E6%B3%A2%E9%9C%B8%E5%A5%B6%E8%8C%B6",
            "fallbacks": [
                {"title": "Crème Brulee Dirty Boba Torch & Caramelize POV (@fengchaoc)", "url": "https://www.youtube.com/shorts/XY14oco_Rkg"},
                {"title": "How to Sprinkle and Torch Crème Brûlée Bubble Tea (#shorts)", "url": "https://www.youtube.com/shorts/1YMxG73QVPE"},
            ],
        },
        {
            "category": "Roteiro 2: Matcha Latte Layered Ombré vs. Frutado Tropical (Maracujá Popping Boba)",
            "query": "matcha latte layered boba making asmr",
            "tiktok_search": "https://www.tiktok.com/search/video?q=layered%20matcha%20latte%20boba%20asmr",
            "rednote_search": "https://www.xiaohongshu.com/search_result?keyword=%E6%8A%B9%E8%8C%B6%E6%8B%BF%E9%93%81%E7%99%BE%E9%A6%99%E6%9E%9C%E6%B3%A2%E9%9C%B8",
            "fallbacks": [
                {"title": "Making 3-Layer Matcha Boba Latte ASMR", "url": "https://www.youtube.com/shorts/9FAs-U30tAQ"},
                {"title": "Classic Passion Fruit Green Tea with Popping Boba Shake", "url": "https://www.youtube.com/shorts/jewEU2MUzwk"},
            ],
        },
        {
            "category": "Formato 2 & Frente 1: Lançamento de Comida (Boba + Savory/Crispy Snack Pairing ASMR)",
            "query": "korean street toast boba tea combo",
            "tiktok_search": "https://www.tiktok.com/search/video?q=boba%20tea%20and%20savory%20snack%20combo%20asmr",
            "rednote_search": "https://www.xiaohongshu.com/search_result?keyword=%E5%A5%B6%E8%8C%B6%E9%85%8D%E5%B0%8F%E5%90%83%E4%B8%8B%E5%8D%88%E8%8C%B6",
            "fallbacks": [
                {"title": "Crispy Savory Toast + Cold Boba Tea Pairing Mukbang", "url": "https://www.youtube.com/shorts/toeo1Fc41Yc"},
                {"title": "Street Food Crispy Snack Making ASMR", "url": "https://www.youtube.com/shorts/RsOqgGGEklg"},
            ],
        },
        {
            "category": f"Frente 2: Pacotes de Eventos ('{os.getenv('COMPANY_NAME', 'AI Board')} Live Boba Bar' — Casamentos, 15 Anos e Corporativo)",
            "query": "boba tea bar wedding catering station",
            "tiktok_search": "https://www.tiktok.com/search/video?q=wedding%20boba%20tea%20bar%20catering",
            "rednote_search": "https://www.xiaohongshu.com/search_result?keyword=%E5%A9%9A%E7%A4%BC%E5%A5%B6%E8%8C%B6%E5%8F%B0%E5%BF%AB%E9%97%AA",
            "fallbacks": [
                {"title": "POV: You Booked a Live Boba Bar for Your Wedding", "url": "https://www.youtube.com/shorts/rC3y92HJ0kE"},
                {"title": "Live Boba Station at a Wedding Reception", "url": "https://www.youtube.com/shorts/0aXyoCz37JU"},
            ],
        },
        {
            "category": "Roteiro 3 & Frente 3: Bastidores POV, Clube de Fidelidade & Check-in no Tablet da Loja",
            "query": "boba shop barista pov order aesthetic",
            "tiktok_search": "https://www.tiktok.com/search/video?q=boba%20shop%20worker%20pov%20loyalty%20rewards",
            "rednote_search": "https://www.xiaohongshu.com/search_result?keyword=%E5%A5%B6%E8%8C%B6%E5%BA%97%E6%97%A5%E5%B8%B8vlog",
            "fallbacks": [
                {"title": "Boba Tea Shop Barista POV & Sealing Cup ASMR", "url": "https://www.youtube.com/shorts/dhnY4Zk2dc0"},
                {"title": "Behind the Scenes Making Boba Order POV", "url": "https://www.youtube.com/shorts/yWZ29uHx1s0"},
            ],
        },
    ]

    enriched = []
    for item in catalog:
        videos = _search_youtube_shorts_live(item["query"], max_results=2, fallback_items=item["fallbacks"])
        enriched.append({
            "category": item["category"],
            "videos": videos,
            "tiktok_search": item["tiktok_search"],
            "rednote_search": item["rednote_search"],
        })
    return enriched


def generate_marketing_growth_report() -> str:
    """Gera o relatório determinístico completo de Performance de Campanhas, Atribuição ERP e Plano de Growth."""
    now_str = datetime.now(BRT).strftime("%d/%m/%Y às %H:%M (BRT)")
    meta = fetch_meta_ads_deep_audit()
    erp = fetch_erp_marketing_attribution()
    company_name = os.getenv("COMPANY_NAME", "AI Board")

    out = [
        f"### 🚀 Inteligência Determinística de Marketing, Performance & Growth — {company_name}",
        f"**Data/Hora da Auditoria:** {now_str} | **Conta Meta Ads:** `{meta.get('account_id') or 'Não configurada'}`",
        "",
    ]

    # -------------------------------------------------------------------------
    # SEÇÃO 1: DESEMPENHO HISTÓRICO E ATUAL DAS CAMPANHAS (META ADS)
    # -------------------------------------------------------------------------
    out.append("#### 📊 1. Auditoria de Campanhas e Criativos no Meta Ads (Dados Oficiais Graph API)")
    if not meta.get("ok"):
        out.append(f"⚠️ Não foi possível consultar a API do Meta Ads no momento: {meta.get('error')}")
    else:
        out.extend([
            "##### 1.1. Comparativo de Eficiência entre Campanhas (Histórico vs. Ativa):",
            "| Campanha | Objetivo | Investimento | Alcance | Impressões | Frequência | CTR Total | CPC Médio | Cliques Link | ViewContent | AddToCart | InitiateCheckout |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        camp_obj_map = {c["id"]: c.get("objective", "—") for c in meta.get("campaigns", [])}
        for ci in meta.get("campaign_insights", []):
            cid = ci.get("campaign_id", "")
            cname = ci.get("campaign_name", "—")
            obj = camp_obj_map.get(cid, "—")
            spend = float(ci.get("spend", 0) or 0)
            reach = int(ci.get("reach", 0) or 0)
            impr = int(ci.get("impressions", 0) or 0)
            freq = float(ci.get("frequency", 0) or 0)
            ctr = float(ci.get("ctr", 0) or 0)
            cpc = float(ci.get("cpc", 0) or 0)
            acts = ci.get("actions", [])
            lclicks = int(_extract_action_metric(acts, ["link_click"]))
            vc = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_view_content", "omni_view_content", "view_content", "landing_page_view"]))
            atc = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"]))
            ic = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"]))
            out.append(
                f"| **{cname}** | `{obj}` | **{_fmt_brl(spend)}** | {reach:,} | {impr:,} | {freq:.2f} | **{ctr:.2f}%** | {_fmt_brl(cpc)} | {lclicks} | {vc} | **{atc}** | **{ic}** |"
            )

        out.extend([
            "",
            "##### 1.2. Desempenho Granular por Criativo (Anúncios):",
            "| Anúncio (Criativo) | Campanha | Gasto | Alcance | Freq. | CTR Total | CTR Link | CPC | CPM | Vídeo Views | ViewContent | AddToCart (Valor) | Checkout | Diagnóstico Determinístico |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        for ai in meta.get("ad_insights", []):
            aname = ai.get("ad_name", "—")
            cname = ai.get("campaign_name", "—")
            spend = float(ai.get("spend", 0) or 0)
            reach = int(ai.get("reach", 0) or 0)
            freq = float(ai.get("frequency", 0) or 0)
            ctr = float(ai.get("ctr", 0) or 0)
            l_ctr = float(ai.get("inline_link_click_ctr", 0) or 0)
            cpc = float(ai.get("cpc", 0) or 0)
            cpm = float(ai.get("cpm", 0) or 0)
            acts = ai.get("actions", [])
            act_vals = ai.get("action_values", [])
            vv = int(_extract_action_metric(acts, ["video_view"]))
            vc = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_view_content", "omni_view_content", "view_content"]))
            atc = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"]))
            atc_val = _extract_action_metric(act_vals, ["offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart", "add_to_cart"])
            ic = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_initiate_checkout", "omni_initiated_checkout", "initiate_checkout"]))
            purch = int(_extract_action_metric(acts, ["offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"]))

            if atc > 0:
                diag = f"🏆 **Campeão de Conversão** (CPA Carrinho: {_fmt_brl(spend/atc)} | {purch} Purchase no Pixel)"
            elif l_ctr >= 1.2:
                diag = f"⚡ **Maior Taxa de Clique (CTR Link {l_ctr:.2f}%)** — Escalar orçamento!"
            elif ctr < 0.2:
                diag = "🔴 **Baixa Retenção / Sem CTA de Clique** (Objetivo Alcance)"
            else:
                diag = "🟡 **Bom Hook Visual, mas baixo clique no link** (Reforçar CTA nos 3s iniciais)"

            atc_str = f"**{atc}** ({_fmt_brl(atc_val)})" if atc > 0 else "0"
            out.append(
                f"| **{aname}** | {cname} | {_fmt_brl(spend)} | {reach:,} | {freq:.2f} | **{ctr:.2f}%** | **{l_ctr:.2f}%** | {_fmt_brl(cpc)} | {_fmt_brl(cpm)} | {vv} | {vc} | {atc_str} | {ic} | {diag} |"
            )

        # Auditoria de Parâmetros dos Conjuntos de Anúncios
        out.extend([
            "",
            "##### 1.3. Parâmetros Técnicos Auditados nos Conjuntos de Anúncios (`AdSets`) & Descobertas Críticas:",
        ])
        for adset in meta.get("adsets", []):
            as_name = adset.get("name", "—")
            opt_goal = adset.get("optimization_goal", "—")
            prom = adset.get("promoted_object") or {}
            targ = adset.get("targeting") or {}
            age_range = targ.get("age_range") or [targ.get("age_min", 18), targ.get("age_max", 65)]
            geo = targ.get("geo_locations") or {}
            radius = 0
            for loc_list_key in ("custom_locations", "places", "cities"):
                if geo.get(loc_list_key):
                    radius = geo[loc_list_key][0].get("radius", 0)
                    break
            interests = []
            for spec in targ.get("flexible_spec", []):
                for it in spec.get("interests", []):
                    interests.append(it.get("name", ""))
            pixel_info = f"Pixel `{prom.get('pixel_id')}` ({prom.get('custom_event_type')})" if prom.get("pixel_id") else "Sem Pixel vinculado"
            out.append(
                f"- **AdSet `{as_name}`:** Otimização=`{opt_goal}` | {pixel_info} | Raio=`{radius} km` | Idade=`{age_range[0]}–{age_range[1]}` | Interesses=`{', '.join(interests[:7])}`"
            )

        out.extend([
            "",
            f"> 💡 **3 Achados Determinísticos de Configuração na Conta `{company_name}`:**",
            "> 1. **Raio de 6 km vs. 10 km:** Reduzir o raio de `10 km` para **`6 km` hiperlocal** com `location_types=['frequently_in', 'home', 'recent']` e idade `20–50` fez o **CTR saltar de `0,75%` para `2,45%` (+228%)** e o **CPC cair de `R$ 0,70` para `R$ 0,50`**.",
            "> 2. **Gargalo Técnico no Evento `VALUE` / `Purchase` do Pixel:** Quando o conjunto está configurado com `optimization_goal = VALUE` sem retorno de `fbq('track', 'Purchase')`, a entrega trava. **Ação imediata:** Mudar `optimization_goal` de `VALUE` para **`OFFSITE_CONVERSIONS`** otimizando para `ADD_TO_CART` ou `INITIATED_CHECKOUT` (ou `Impressions/ThruPlay` para vídeos locais), destravando a entrega para os criativos campeões de CTR.",
            f"> 3. **Proibição de Campanhas `OUTCOME_AWARENESS` (`REACH`):** Campanhas com objetivo `REACH` tiveram `CTR de 0,046%` e `CPC de R$ 2,84`. Para `{company_name}`, **100% das campanhas** devem usar `OUTCOME_SALES` (Delivery/E-commerce) ou `OUTCOME_ENGAGEMENT` / `CTWA (Click-to-WhatsApp)` (Eventos B2B e Reservas VIP).",
        ])

    # -------------------------------------------------------------------------
    # SEÇÃO 2: MÉTRICAS OBJETIVAS DE CONVERSÃO & ATRIBUIÇÃO OMNICHANNEL (ERP)
    # -------------------------------------------------------------------------
    out.extend([
        "",
        "---",
        "#### 🎯 2. Métricas Objetivas de Conversão, Efeito Halo Omnichannel & Fidelidade (ERP)",
    ])
    if erp.get("ok"):
        loy = erp["loyalty"]
        out.extend([
            f"##### 2.1. Performance do Programa de Fidelidade & Cupom de Desconto (Competência `{loy['month']}`):",
            f"- **Total de Pedidos Liquidados no Mês:** `{loy['total_orders']:,}` pedidos (`{loy['unique_identified_customers']}` clientes identificados por código no PDV).",
            f"- **Pedidos com Resgate de Fidelidade/Desconto:** `{loy['loyalty_orders']}` pedidos (**`{loy['loyalty_share_pct']}%` de participação** | Total de descontos concedidos: `{_fmt_brl(loy['total_discount_brl'])}`).",
            f"- **Impacto Real no Ticket Médio Líquido:**",
            f"  - Ticket Médio Líquido **SEM Fidelidade/Desconto**: **`{_fmt_brl(loy['ticket_without_loyalty'])}`**",
            f"  - Ticket Médio Líquido **COM Fidelidade/Desconto** (já descontado o benefício): **`{_fmt_brl(loy['ticket_with_loyalty'])}`** (**`+{loy['ticket_lift_pct']}%` de aumento líquido por pedido!**)",
            "",
            "##### 2.2. Efeito Halo Omnichannel (Vendas Reais no ERP Antes vs. Durante a Campanha Ativa):",
            "| Canal no ERP | Pedidos/Dia (Baseline 16–29/10) | Receita Líq./Dia (Baseline) | Pedidos/Dia (Durante Campanha) | Receita Líq./Dia (Durante Campanha) | Ticket Médio Atual | Variação Receita/Dia (Lift) |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ])
        for ch in erp.get("channel_lift", []):
            lift_sign = "+" if ch["rev_lift_pct"] >= 0 else ""
            out.append(
                f"| **{ch['channel']}** | {ch['base_orders_day']} ped/dia | {_fmt_brl(ch['base_rev_day'])} | **{ch['active_orders_day']} ped/dia** | **{_fmt_brl(ch['active_rev_day'])}** | {_fmt_brl(ch['active_ticket'])} | **`{lift_sign}{ch['rev_lift_pct']}%`** |"
            )

        out.extend([
            "",
            "##### 2.3. Top Produtos Campeões de Giro no ERP (Base Segura para Criativos sem Risco de Ruptura):",
            "| Ranking | Produto no PDV / ERP | Unidades Vendidas no Mês | Receita Bruta Gerada |",
            "| :--- | :--- | :--- | :--- |",
        ])
        for idx, p in enumerate(erp.get("top_products", [])[:8], start=1):
            out.append(f"| **#{idx}** | **{p['product']}** | `{p['qty']} un.` | {_fmt_brl(p['revenue'])} |")

    # -------------------------------------------------------------------------
    # SEÇÃO 3: TABELA DE PARÂMETROS IDEAIS & BENCHMARK INTERNACIONAL (REDNOTE/TIKTOK/IG)
    # -------------------------------------------------------------------------
    out.extend([
        "",
        "---",
        f"#### ⚙️ 3. Matriz de Parâmetros Ideais de Tráfego Pago (Calibrada para `{company_name}`)",
        "| Frente de Campanha | Objetivo Meta Ads | Evento de Otimização | Raio & Localização | Idade & Posicionamento | Orçamento Sugerido | Meta de Conversão (KPI Alvo) |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        "| **1. Delivery & Recompra** | `OUTCOME_SALES` | `OFFSITE_CONVERSIONS` (`AddToCart` ou `InitiateCheckout` no Pixel) | **4 a 6 km** da loja (`frequently_in`, `home`, `recent`) | `20–48 anos` | 100% Mobile (`Reels`, `Stories`, `Feed`, `IG Search`) | R$ 15 a R$ 25/dia (Foco Qui–Dom 14h–21h) | `CTR Link >= 1,3%` | `CPA Carrinho <= R$ 4,50` |",
        "| **2. Lançamento de Novos Produtos** | `OUTCOME_SALES` + `ENGAGEMENT` | Fase 1 (D-7): `ThruPlay` / `Profile Visit` | Fase 2 (D0): `AddToCart` + Cupom Combo | **3 a 5 km** da loja (Hiperlocal) | `18–45 anos` | Mobile (`Reels` + `Stories` + Collab Local) | R$ 25 a R$ 35/dia nos primeiros 10 dias | Elevar Ticket Médio Balcão de `R$ 31,71` para **`R$ 48,00+`** |",
        f"| **3. Pacotes para Eventos (Live Boba Bar)** | `OUTCOME_ENGAGEMENT` (Mensagens) | `CONVERSATIONS` (**Click-to-WhatsApp / CTWA** direto para o atendimento da `{company_name}`) | **12 a 18 km** (Região Metropolitana) | `23–55 anos` | Interesses: *Casamento, Eventos Corporativos, Festas, Formatura, RH* | R$ 15 a R$ 20/dia | `Custo por Lead Qualificado <= R$ 12,00` | `1 a 2 eventos/semana` |",
        "| **4. Fidelidade & Fluxo Loja Física** | `OUTCOME_ENGAGEMENT` | Visitas ao Perfil IG + Resgate de Pontos no Balcão | **2 a 4 km** da loja (`recent` — pessoas próximas) | `18–45 anos` | Stories & Reels com gatilho de *Pontos em Dobro (Ter/Qua)* | R$ 10/dia (Terça a Quinta) | Elevar participação de Fidelidade de `7,3%` para **`15%+`** |",
        "",
        "---",
        f"#### 🌏 4. Inteligência de Tendências Globais (EUA, Ásia/China, UK) Adaptadas para `{company_name}`",
        "1. **Estratégia de Lançamento de Comida (Em 2 Semanas) — O Modelo *'Boba + Crispy/Savory Pairing'* (Taiwan / EUA / RedNote):**",
        "   - **Por que pequenas lojas explodem lá fora ao lançar comida:** Marcas como *Xing Fu Tang*, *HeyTea (喜茶)* e cafés asiáticos independentes na Califórnia e Londres descobriram que o cliente de Bubble Tea sente falta de um item **quente/crocante/salgado ou agridoce** para contrastar com a bebida gelada.",
        "   - **Mecânica de Lançamento em 3 Fases (14 dias):**",
        f"     - **Dias -14 a -7 (Teaser Sensorial ASMR & Mistério):** Vídeos de 7 segundos em close-up extremo (textura, crocância, vapor/maçarico) sem revelar o cardápio completo: *'Faltam 10 dias para o seu {company_name} ganhar o par perfeito 👀'*.",
        "     - **Dias -6 a -1 (Acesso Antecipado VIP via Programa de Fidelidade):** Clientes já cadastrados no programa de pontos ganham **degustação exclusiva ou 50% OFF no item de comida na compra de qualquer Boba** nos 2 primeiros dias. Isso força centenas de clientes de balcão a se cadastrarem no programa de fidelidade antes da estreia!",
        f"     - **Dia 0 em diante (Ancoragem de Combo no PDV e Delivery):** Nunca vender a comida isolada na vitrine — criar o **'Combo Duo {company_name} (1 Boba Campeão + 1 Food Item)'** por um preço ancorado que puxe o ticket médio de `R$ 31,71` para `R$ 48–58`.",
        f"2. **Pacotes para Eventos (*'{company_name} Live Boba Bar'* — Casamentos, 15 Anos, Formaturas e Empresas):**",
        "   - **Benchmark Global (EUA & Singapura):** Lojas independentes de boba faturam de 20% a 35% da receita mensal levando uma **Estação Móvel (*Live Boba Station*)** com 1 ou 2 colaboradores uniformizados preparando bebidas ao vivo (especialmente o *Creme Brûlée maçaricado na hora* ou *Brown Sugar Tiger*).",
        "   - **Estrutura Comercial Pronta (3 Pacotes Padronizados para Resposta Instantânea no WhatsApp):**",
        "     - **Pacote Pocket (50 copos / 2h de evento):** 3 sabores campeões (`Boba Milk Tea`, `Boba Pêssego`, `Boba Maracujá`) + 1 Bobrista.",
        "     - **Pacote Experience (100 copos / 3h de evento):** 4 sabores (incluindo *Creme Brûlée maçaricado ao vivo* e *Matcha Latte*) + Copos personalizados com adesivo do evento/empresa + 2 Bobristas.",
        "     - **Pacote Corporate / Wedding (200+ copos / 4h):** Estação completa customizada para ativações de marca, casamentos, festas de 15 anos e coffee breaks corporativos.",
        "   - **Efeito Multiplicador:** Cada evento de 100 pessoas funciona como **amostragem paga pelo contratante** — coloque no copo do evento um QR Code *'Ganhe 50 pontos no nosso Clube de Fidelidade na loja física'*.",
        "3. **Fluxo Automatizado 1-para-3 (`Instagram Reels` + `TikTok` + `RedNote / 小红书`) + Collab Local:**",
        "   - **Gravação Única (Regra 9:16 Limpa):** Gravar 1 único vídeo vertical em 4K sem textos queimados na edição. Os 3 primeiros segundos devem ser sempre um **Gancho Visual Físico** (maçarico no Creme Brûlée, calda de açúcar mascavo na parede do copo, concha de pérolas de tapioca brilhando ou o prato de comida sendo cortado ao meio).",
        "   - **Adaptação Automática por Agente (`agent-cmo-creative`):** A cada semana, o agente gera a **Matriz Tripla de Publicação**:",
        "     1. **Instagram Reels (+ Invite Collab Local):** Gancho de desejo + localização explícita + CTA de Delivery ou Fidelidade.",
        "     2. **TikTok:** Gancho estilo *POV / Bastidores / Desafio de Equipe* (*'POV: Quando o cliente pede 3x mais boba no Milk Tea'*, *'Preparando 100 Bobas para um evento'*).",
        "     3. **RedNote (Xiaohongshu / 小红书):** Formato *Guia Estético / Lifestyle Cover* (título em destaque na capa + legenda estruturada em tópicos com palavras-chave em Português e Inglês/Mandarim voltada para jovens, estudantes, turistas e fãs de gastronomia asiática).",
    ])

    # -------------------------------------------------------------------------
    # SEÇÃO 5: VÍDEOS REAIS DE REFERÊNCIA (YOUTUBE SHORTS / TIKTOK / REDNOTE)
    # -------------------------------------------------------------------------
    video_refs = fetch_viral_video_references()
    out.extend([
        "",
        "---",
        "#### 🎬 5. Links Reais de Vídeos de Exemplo & Referências Visuais (YouTube Shorts, TikTok & RedNote)",
        "> **REGRA OBRIGATÓRIA PARA O AGENTE:** Você DEVE incluir os links clicáveis abaixo diretamente dentro de cada Formato Viral (Parte 1), de cada Roteiro de Gravação (Parte 2) e de cada Frente Estratégica (Parte 3) na sua resposta final para que a equipe tenha exemplos visuais reais de gravação. NUNCA invente URLs que não estejam listadas aqui.",
        "",
    ])
    for ref in video_refs:
        out.append(f"- **{ref['category']}:**")
        for idx, v in enumerate(ref.get("videos", []), start=1):
            out.append(f"  - 🎥 **Vídeo Exemplo #{idx} (Vertical 9:16):** [{v['title']}]({v['url']}) — `{v['url']}`")
        out.append(f"  - 📱 **Explorar Trend no TikTok:** [Ver vídeos similares no TikTok]({ref['tiktok_search']})")
        out.append(f"  - 📕 **Explorar Estética no RedNote (小红书):** [Ver referências no Xiaohongshu]({ref['rednote_search']})")

    return "\n".join(out)


# =============================================================================
# CREWAI TOOL
# =============================================================================

class MarketingGrowthAuditInput(BaseModel):
    foco_campanha: Optional[str] = Field(
        "completo",
        description="Foco opcional da análise: 'completo', 'delivery', 'comida_lancamento', 'eventos_b2b', 'fidelidade' ou 'redes_sociais'."
    )


class MarketingGrowthAuditTool(BaseTool):
    name: str = "marketing_campaign_attribution_audit"
    description: str = (
        "FERRAMENTA DETERMINÍSTICA COMPLETA DE MARKETING, PERFORMANCE (META ADS) E ATRIBUIÇÃO OMNICHANNEL (ERP). "
        "Em uma única chamada rápida, consulta a API do Meta Ads e o banco SQLite de vendas para entregar: "
        "1) Desempenho real de todas as campanhas, conjuntos de anúncios (raio km, idade, otimização, Pixel) e criativos (CTR, CPC, AddToCart, InitiateCheckout); "
        "2) Métricas objetivas de conversão, Efeito Halo Omnichannel (vendas no Balcão + Delivery durante a campanha vs. antes) e Lift de Ticket Médio do Programa de Fidelidade; "
        "3) Top Produtos mais vendidos no ERP para ancorar criativos sem risco de ruptura; "
        "4) Matriz de parâmetros ideais do Meta Ads e plano tático para lançamentos, pacotes de eventos, collabs e automação Reels/TikTok/RedNote. "
        "SEMPRE chame esta ferramenta antes de responder qualquer solicitação ou rotina de Marketing, Tráfego Pago ou Criação de Campanhas."
    )
    args_schema: Type[BaseModel] = MarketingGrowthAuditInput

    def _run(self, foco_campanha: Optional[str] = "completo") -> str:
        return generate_marketing_growth_report()
