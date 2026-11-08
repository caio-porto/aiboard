"""Central de Inteligência Operacional - CrewAI com Compilação Dinâmica de Topologia, Memória, Town Hall e Ferramentas MCP."""
import os
import logging
from typing import Dict, Any, List, Optional
from crewai import Agent, Crew, Process, Task, LLM

# Ferramentas Públicas Universais
from tools.google_workspace_tools import (
    GoogleDriveSearchTool,
    GoogleDriveReadFileTool,
    JVRioAccountingAuditTool,
    audit_jvrio_closing_folder,
    format_jvrio_audit_report,
    GmailSearchTool,
    GmailReadEmailTool,
    GmailSendEmailTool
)
from tools.microservices_tools import (
    ChatwootTool,
    FreescoutTool,
    MetaAdsTool
)
try:
    from tools.notion_workspace_tools import (
        NotionSearchTool,
        NotionReadPageTool,
        NotionCompanyInfoTool
    )
except ImportError:
    NotionSearchTool = None
    NotionReadPageTool = None
    NotionCompanyInfoTool = None

from tools.business_report_tools import (
    BusinessAnalyticsTool,
    GenericMCPTool
)
# Ferramentas Autônomas de Workspace, Criação de Scripts e Memória de Regras Aprendidas (Frugal AI & Meta Muse)
from tools.telegram_tools import TelegramAlertTool
from tools.agent_workspace_tools import (
    AgentScriptForgeTool,
    AgentScriptExecuteTool,
    AgentSQLiteTool,
    AgentDataStoreTool,
    AgentWorkspaceListTool,
    LearnedRulesMemoryTool,
    get_learned_rules_content
)

# Ferramentas Privadas / Customizadas (custom_tools/ com fallback para tools/)
try:
    from custom_tools.new_choice_erp_tools import (
        ERPSalesFinancialTool,
        ERPProductSearchTool,
        ERPStockCheckTool,
        ERPInventoryForecastTool,
        ERPWeeklyNFeInboundTool,
        ERPNFeItemMappingTool,
    )
except ImportError:
    try:
        from tools.new_choice_erp_tools import (
            ERPSalesFinancialTool,
            ERPProductSearchTool,
            ERPStockCheckTool,
            ERPInventoryForecastTool,
            ERPWeeklyNFeInboundTool,
            ERPNFeItemMappingTool,
        )
    except ImportError:
        ERPSalesFinancialTool = None
        ERPProductSearchTool = None
        ERPStockCheckTool = None
        ERPInventoryForecastTool = None
        ERPWeeklyNFeInboundTool = None
        ERPNFeItemMappingTool = None

try:
    from custom_tools.finance_tools import (
        ContaAzulTool,
        BankExtractTool,
        DREDacontTool
    )
except ImportError:
    try:
        from tools.finance_tools import (
            ContaAzulTool,
            BankExtractTool,
            DREDacontTool
        )
    except ImportError:
        ContaAzulTool = None
        BankExtractTool = None
        DREDacontTool = None

logger = logging.getLogger(__name__)

GLOBAL_META_MUSE_PROTOCOL = (
    "\n================================================================================\n"
    "🚀 PROTOCOLO DE AUTONOMIA E PROATIVIDADE (PADRÃO META MUSE — ZERO-CLICK RESOLUTION):\n"
    "1. Proibido Apenas Alertar: Nunca envie uma mensagem dizendo apenas 'Falta X' ou 'Há um erro em Y'. "
    "Antes de notificar os fundadores, esgote todas as ferramentas e consulte outros agentes da árvore para já entregar a solução pronta ou a ação executada.\n"
    "2. Verificação Cruzada (360º): Sempre cruze pelo menos duas fontes antes de concluir uma análise "
    "(ex.: ERP vs. Planilha; Ponto vs. Escala; Boleto da Intranet vs. Conta Azul).\n"
    "3. Comunicação Direta e Estruturada: Suas respostas em alertas operacionais, auditorias e notificações no Telegram/E-mail devem seguir estritamente o formato:\n"
    "   • **[STATUS / ALERTA]:** Resumo em 1 linha.\n"
    "   • **[DIAGNÓSTICO & DADOS]:** O que foi encontrado (valores exatos, datas, IDs).\n"
    "   • **[AÇÃO JÁ EXECUTADA]:** O que você já fez sozinho (ex.: 'Boleto enviado ao financeiro', 'Faturamento consultado com o CFO').\n"
    "   • **[DECISÃO NECESSÁRIA]:** O que precisa de 1 clique/aprovação humana (ex.: 'Aprovar preenchimento com R$ X?').\n"
    "   *(Nota: se o usuário fizer apenas uma pergunta pontual direta de consulta no chat como 'Quem trabalha domingo?', entregue a resposta/tabela direta logo na 1ª linha)*.\n"
    "4. Evolução Contínua: Sempre consulte a memória de longo prazo (`REGRAS_APRENDIDAS_E_FEEDBACKS.md`) antes de agir para respeitar correções, "
    "feedbacks anteriores e novas regras de negócio aprendidas.\n"
    "================================================================================\n"
)

C_LEVEL_LEARNING_TRIGGER = (
    "\n🧠 [GATILHO DE APRENDIZADO CONTÍNUO DOS DIRETORES C-LEVEL]:\n"
    "Sempre que você receber uma correção, preferência ou nova exigência do fundador "
    "(ex.: 'A partir de hoje, envie boletos de energia também para X' ou 'Desconsidere o item Y na contagem'), "
    "registre essa regra permanentemente na ferramenta 'learned_rules_memory' (Memória de Regras Aprendidas / `REGRAS_APRENDIDAS_E_FEEDBACKS.md`) "
    "com `action='add'`, data e contexto, e passe a aplicá-la em 100% das execuções futuras.\n"
)


def get_gemini_llm(model_override: Optional[str] = None) -> LLM:
    """Configura o modelo Gemini para os agentes CrewAI com mapeamento transparente e otimização de custos."""
    try:
        from api.tasks_queue import get_setting
        api_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        model_name = model_override or get_setting("gemini_model") or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    except Exception:
        api_key = os.getenv("GEMINI_API_KEY")
        model_name = model_override or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    clean_name = str(model_name).lower().strip().replace("gemini/", "").replace(" ", "-")
    import re
    clean_name = re.sub(r"-+", "-", clean_name)

    if "flash-lite" in clean_name or "lite" in clean_name:
        if "3.5" in clean_name:
            target_model = "gemini-3.5-flash-lite"
        elif "latest" in clean_name:
            target_model = "gemini-flash-lite-latest"
        else:
            target_model = "gemini-3.1-flash-lite"
    elif "pro" in clean_name:
        target_model = "gemini-3.1-pro-preview"
    elif "3.5" in clean_name:
        target_model = "gemini-3.5-flash"
    elif "latest" in clean_name:
        target_model = "gemini-flash-latest"
    else:
        target_model = "gemini-3.8-flash"

    full_model_name = f"gemini/{target_model}"

    return LLM(
        model=full_model_name,
        api_key=api_key or "DUMMY_KEY_FOR_LOCAL_BUILD"
    )


def instantiate_mcp_tools_by_type(tool_type: str, custom_data: Optional[Dict] = None) -> List[Any]:
    """Instancia os blocos de ferramentas de função única conforme o protocolo MCP."""
    t = (tool_type or "").lower().strip()
    tools = []

    erp_alias = os.getenv("ERP_TOOL_ALIAS", "erp").lower().strip()
    if t in ("erp", "vendas", erp_alias):
        for cls in (
            ERPSalesFinancialTool,
            ERPProductSearchTool,
            ERPStockCheckTool,
            ERPInventoryForecastTool,
            ERPWeeklyNFeInboundTool,
            ERPNFeItemMappingTool,
        ):
            if cls is not None:
                tools.append(cls())
    elif t in ("drive", "docs", "sheets"):
        import re
        d_search = GoogleDriveSearchTool()
        d_read = GoogleDriveReadFileTool()
        if custom_data:
            raw_folder = custom_data.get("driveFolderFilter") or ""
            raw_file = custom_data.get("driveFileFilter") or ""
            cat = custom_data.get("category") or ""
            if raw_folder:
                m_f = re.search(r'/folders/([a-zA-Z0-9_-]+)', raw_folder)
                d_search.default_folder_id = m_f.group(1) if m_f else raw_folder.strip()
            if raw_file:
                m_file = re.search(r'/d/([a-zA-Z0-9_-]+)', raw_file)
                fid = m_file.group(1) if m_file else raw_file.strip()
                d_search.default_file_id = fid
                d_read.default_file_id = fid
            if cat:
                d_search.category_label = cat
                if "jv rio" in cat.lower() or "contabil" in cat.lower() or "fiscal" in cat.lower():
                    tools.append(JVRioAccountingAuditTool())
        tools.extend([d_search, d_read])
    elif t in ("gmail", "email", "mail"):
        tools.extend([GmailSearchTool(), GmailReadEmailTool(), GmailSendEmailTool()])
    elif t in ("notion", "notion_workspace"):
        if NotionCompanyInfoTool:
            tools.extend([NotionCompanyInfoTool(), NotionSearchTool(), NotionReadPageTool()])
    elif t in ("chat", "chatwoot", "whatsapp"):
        tools.append(ChatwootTool())
    elif t in ("helpdesk", "freescout", "suporte"):
        tools.append(FreescoutTool())
    elif t in ("contaazul", "fiscal"):
        if ContaAzulTool:
            tools.append(ContaAzulTool())
    elif t in ("finance", "banco", "bank", "extratos", "brex"):
        if ContaAzulTool:
            tools.append(ContaAzulTool())
        if BankExtractTool:
            tools.append(BankExtractTool())
    elif t in ("business", "relatorio", "business_analytics"):
        tools.append(BusinessAnalyticsTool())
    elif t in ("dre", "dacont", "dre_dacont", "url"):
        if DREDacontTool:
            tools.append(DREDacontTool())
        tools.append(BusinessAnalyticsTool())
    elif t in ("meta", "meta_ads", "facebook", "instagram"):
        from tools.marketing_tools import MarketingGrowthAuditTool
        meta_tool = MetaAdsTool()
        if custom_data:
            meta_tool.ad_account_id = custom_data.get("adAccountId") or ""
            meta_tool.access_token = custom_data.get("accessToken") or ""
        tools.extend([MarketingGrowthAuditTool(), meta_tool])
    elif t in ("marq", "marqhr", "marq_hr", "ponto", "ponto_eletronico"):
        try:
            from custom_tools.marqhr_tools import (
                MarQHRTimecardAuditTool,
                MarQHRWeeklyScheduleAuditTool,
                MarQHREmployeeDirectoryTool,
                MarQHRAbsenceReportTool
            )
            tools.extend([
                MarQHRTimecardAuditTool(),
                MarQHRWeeklyScheduleAuditTool(),
                MarQHREmployeeDirectoryTool(),
                MarQHRAbsenceReportTool()
            ])
        except ImportError:
            try:
                from tools.marqhr_tools import (
                    MarQHRTimecardAuditTool,
                    MarQHRWeeklyScheduleAuditTool,
                    MarQHREmployeeDirectoryTool,
                    MarQHRAbsenceReportTool
                )
                tools.extend([
                    MarQHRTimecardAuditTool(),
                    MarQHRWeeklyScheduleAuditTool(),
                    MarQHREmployeeDirectoryTool(),
                    MarQHRAbsenceReportTool()
                ])
            except ImportError:
                pass
    elif t in ("intranet", "intranetmall", "intranet_mall", "shopping", "shopping_tijuca"):
        try:
            from custom_tools.intranetmall_tools import (
                IntranetMallDailyAuditTool,
                IntranetMallBoletosTool,
                IntranetMallVendasTool,
                IntranetMallCircularesTool,
                IntranetMallOSTool
            )
            tools.extend([
                IntranetMallDailyAuditTool(),
                IntranetMallBoletosTool(),
                IntranetMallVendasTool(),
                IntranetMallCircularesTool(),
                IntranetMallOSTool()
            ])
        except ImportError:
            try:
                from tools.intranetmall_tools import (
                    IntranetMallDailyAuditTool,
                    IntranetMallBoletosTool,
                    IntranetMallVendasTool,
                    IntranetMallCircularesTool,
                    IntranetMallOSTool
                )
                tools.extend([
                    IntranetMallDailyAuditTool(),
                    IntranetMallBoletosTool(),
                    IntranetMallVendasTool(),
                    IntranetMallCircularesTool(),
                    IntranetMallOSTool()
                ])
            except ImportError:
                pass
    elif t in ("entrega_aki", "entregaaki", "entrega", "canal_proprio"):
        try:
            from custom_tools.delivery_tools import EntregaAkiTool
            tools.append(EntregaAkiTool())
        except ImportError:
            try:
                from tools.delivery_tools import EntregaAkiTool
                tools.append(EntregaAkiTool())
            except ImportError:
                pass
    elif t in ("ifood", "portal_ifood", "ifood_marketplace"):
        try:
            from custom_tools.delivery_tools import IFoodTool
            tools.append(IFoodTool())
        except ImportError:
            try:
                from tools.delivery_tools import IFoodTool
                tools.append(IFoodTool())
            except ImportError:
                pass
    elif t in ("99food", "99_food", "ninety_nine_food", "portal_99food"):
        try:
            from custom_tools.delivery_tools import NinetyNineFoodTool
            tools.append(NinetyNineFoodTool())
        except ImportError:
            try:
                from tools.delivery_tools import NinetyNineFoodTool
                tools.append(NinetyNineFoodTool())
            except ImportError:
                pass
    elif t in ("delivery", "entregas"):
        try:
            from custom_tools.delivery_tools import (
                DeliveryCatalogSyncTool,
                DeliveryOrderSLAMonitorTool,
                DeliveryPlatformAlertsTool
            )
            tools.extend([
                DeliveryCatalogSyncTool(),
                DeliveryOrderSLAMonitorTool(),
                DeliveryPlatformAlertsTool(),
            ])
        except ImportError:
            try:
                from tools.delivery_tools import (
                    DeliveryCatalogSyncTool,
                    DeliveryOrderSLAMonitorTool,
                    DeliveryPlatformAlertsTool
                )
                tools.extend([
                    DeliveryCatalogSyncTool(),
                    DeliveryOrderSLAMonitorTool(),
                    DeliveryPlatformAlertsTool(),
                ])
            except ImportError:
                pass
        tools.append(ChatwootTool())
        for cls in (ERPSalesFinancialTool, ERPProductSearchTool, ERPStockCheckTool, ERPInventoryForecastTool):
            if cls is not None:
                tools.append(cls())
    elif t in ("telegram", "telegram_alert", "alerta", "notificacao", "aviso"):
        tools.append(TelegramAlertTool())
    elif t in ("generic_mcp", "mcp"):
        server_endpoint = (custom_data or {}).get("endpoint", "")
        server_mode = (custom_data or {}).get("mode", "sse")
        mcp_tool = GenericMCPTool()
        mcp_tool.server_endpoint = server_endpoint
        mcp_tool.server_mode = server_mode
        tools.append(mcp_tool)
    else:
        if ERPSalesFinancialTool is not None:
            tools.append(ERPSalesFinancialTool())

    return tools


def get_ground_truth_snapshot() -> str:
    """Extrai os dados oficiais consolidados de vendas do New Choice ERP para ancorar a verdade."""
    db_paths = [
        "/app/data/erp_analytics/analytics_store.db",
        "/root/scripts/erp_dashboard/data/analytics_store.db",
        os.path.join(os.path.dirname(__file__), "..", "data", "erp_analytics", "analytics_store.db"),
        os.path.join(os.path.dirname(__file__), "..", "data", "analytics_store.db"),
        "data/erp_analytics/analytics_store.db"
    ]
    db_path = next((p for p in db_paths if os.path.exists(p)), None)
    if not db_path:
        return ""
    try:
        import sqlite3
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            cur = conn.cursor()
            cur.execute("SELECT MAX(order_date) FROM orders WHERE status = 'Liquidado'")
            latest_date_row = cur.fetchone()
            latest_date = latest_date_row[0] if latest_date_row and latest_date_row[0] else None
            if not latest_date:
                return ""

            cur.execute("""
                SELECT 
                    COUNT(*), 
                    COALESCE(SUM(gross_amount), 0), 
                    COALESCE(SUM(discount_amount), 0), 
                    COALESCE(SUM(net_amount), 0)
                FROM orders 
                WHERE order_date = ? AND status = 'Liquidado'
            """, (latest_date,))
            d_count, d_gross, d_disc, d_net = cur.fetchone()
            d_ticket = (d_net / d_count) if d_count > 0 else 0.0

            cur.execute("""
                SELECT channel, COUNT(*), SUM(net_amount)
                FROM orders
                WHERE order_date = ? AND status = 'Liquidado'
                GROUP BY channel ORDER BY 3 DESC
            """, (latest_date,))
            d_channels = [f"{r[0]}: R$ {r[2]:,.2f} ({r[1]} ped.)" for r in cur.fetchall()]

            current_month = latest_date[:7]
            cur.execute("""
                SELECT 
                    COUNT(*), 
                    COALESCE(SUM(gross_amount), 0), 
                    COALESCE(SUM(discount_amount), 0), 
                    COALESCE(SUM(net_amount), 0)
                FROM orders 
                WHERE order_date LIKE ? AND status = 'Liquidado'
            """, (f"{current_month}%",))
            m_count, m_gross, m_disc, m_net = cur.fetchone()
            m_ticket = (m_net / m_count) if m_count > 0 else 0.0

            monthly_target = 125000.0
            try:
                cur.execute("SELECT monthly_sales_target FROM operational_params ORDER BY month DESC LIMIT 1")
                t_row = cur.fetchone()
                if t_row and t_row[0]:
                    monthly_target = float(t_row[0])
            except Exception:
                pass
            target_pct = (m_net / monthly_target * 100) if monthly_target > 0 else 0.0

            def fmt_curr(val):
                return f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            def fmt_int(val):
                return f"{val:,}".replace(",", ".")

            return (
                f"\n================================================================================\n"
                f"🔒 [DADOS OFICIAIS E VERIFICADOS DO NEW CHOICE ERP - EXTRAÇÃO DIRETA DO BANCO]:\n"
                f"• Último Fechamento Diário Consolidado ({latest_date}):\n"
                f"  - Pedidos Liquidados: {fmt_int(d_count)} pedidos\n"
                f"  - Faturamento Bruto: R$ {fmt_curr(d_gross)} | Descontos: R$ {fmt_curr(d_disc)}\n"
                f"  - Faturamento Líquido: R$ {fmt_curr(d_net)}\n"
                f"  - Ticket Médio Diário: R$ {fmt_curr(d_ticket)}\n"
                f"  - Canais de Venda: {' | '.join(d_channels)}\n"
                f"• Acumulado do Mês Corrente (Competência {current_month} MTD):\n"
                f"  - Total de Pedidos no Mês: {fmt_int(m_count)} pedidos liquidados\n"
                f"  - Faturamento Líquido Acumulado: R$ {fmt_curr(m_net)} (Bruto: R$ {fmt_curr(m_gross)})\n"
                f"  - Ticket Médio Mensal: R$ {fmt_curr(m_ticket)}\n"
                f"  - Meta Mensal Parametrizada: R$ {fmt_curr(monthly_target)} (Atingimento Atual: {target_pct:.2f}%)\n"
                f"================================================================================\n"
                f"⛔ REGRA DE SEGURANÇA E ZERO ALUCINAÇÃO:\n"
                f"Você é estritamente proibido de inventar ou alterar números de vendas, pedidos ou faturamento.\n"
                f"Ao citar valores do fechamento diário ou mensal, utilize OBRIGATORIAMENTE os dados verificados acima.\n"
                f"================================================================================\n"
            )
    except Exception as e:
        logger.warning(f"Erro ao extrair snapshot do ERP: {e}")
        return ""


def create_operational_crew(
    user_request: str,
    topology_snapshot: Optional[Dict[str, Any]] = None,
    step_callback: Optional[Any] = None,
    task_callback: Optional[Any] = None
) -> Crew:
    """Instancia a Crew dinamicamente a partir da topologia visual, memórias, Town Hall, Regras Aprendidas e Protocolo Meta Muse."""
    from api.tasks_queue import (
        get_canvas_topology,
        get_town_hall,
        get_agent_memory,
        get_agent_personality
    )

    req_lower = user_request.lower()
    is_jvrio_audit = any(k in req_lower for k in [
        "jv rio", "fechamento contábil", "fechamento contabil", "pasta compartilhada da contabilidade"
    ])
    is_intranetmall_audit = any(k in req_lower for k in [
        "intranet mall", "intranetmall", "shopping tijuca", "consultaboleto", "vendas_visualizar", "os_consulta"
    ])
    is_marketing_audit = (not is_intranetmall_audit) and any(k in req_lower for k in [
        "meta ads", "campanhas", "tráfego pago", "trafego pago", "red note", "rednote",
        "tiktok", "roas", "ctr", "cpc", "marketing_campaign_attribution_audit", "live boba bar"
    ])
    needs_erp_snapshot = (not is_jvrio_audit) and any(k in req_lower for k in [
        "vendas", "faturamento", "fechamento", "pedidos", "caixa", "ticket", "receita",
        "dre", "lucro", "boletim", "comitê", "comite", "estoque", "execução programada", "execucao programada", "intranet"
    ])

    jvrio_snapshot = ""
    if is_jvrio_audit:
        try:
            jv_data = audit_jvrio_closing_folder(persist_state=False)
            jv_report = format_jvrio_audit_report(jv_data)
            jvrio_snapshot = (
                f"\n================================================================================\n"
                f"🔒 [INSPEÇÃO DETERMINÍSTICA EM TEMPO REAL DA PASTA JV RIO NO GOOGLE DRIVE]:\n"
                f"{jv_report}\n"
                f"================================================================================\n"
                f"⛔ TRAVA ANTI-ALUCINAÇÃO JV RIO:\n"
                f"O status de cada subpasta DEVE obedecer 100% à inspeção recursiva acima extraída diretamente da API do Google Drive.\n"
                f"É ESTRITAMENTE PROIBIDO marcar qualquer categoria como 'Completo (100%)' se ela constar como '❌ PENDENTE' ou vazia acima.\n"
                f"Cite os nomes reais dos arquivos, tamanhos em KB e horários de envio constatados no Google Drive.\n"
                f"================================================================================\n"
            )
        except Exception as e:
            logger.warning(f"Erro ao gerar snapshot determinístico JV Rio: {e}")

    intranetmall_snapshot = ""
    if is_intranetmall_audit:
        try:
            try:
                from custom_tools.intranetmall_tools import IntranetMallClient
            except ImportError:
                from tools.intranetmall_tools import IntranetMallClient
            im_report = IntranetMallClient().run_full_daily_audit()
            intranetmall_snapshot = (
                f"\n================================================================================\n"
                f"🔒 [AUDITORIA DETERMINÍSTICA EM TEMPO REAL — INTRANET MALL x ERP]:\n"
                f"{im_report}\n"
                f"================================================================================\n"
                f"⛔ TRAVA ANTI-ALUCINAÇÃO INTRANET MALL:\n"
                f"Utilize OBRIGATORIAMENTE os dados reais acima extraídos diretamente do portal Intranet Mall e do banco SQLite do ERP.\n"
                f"É ESTRITAMENTE PROIBIDO inventar números de faturas, protocolos, valores de vendas, circulares ou O.S.\n"
                f"================================================================================\n"
            )
        except Exception as e:
            logger.warning(f"Erro ao gerar snapshot determinístico Intranet Mall: {e}")

    marketing_snapshot = ""
    if is_marketing_audit:
        try:
            from tools.marketing_tools import generate_marketing_growth_report
            mkt_report = generate_marketing_growth_report()
            marketing_snapshot = (
                f"\n================================================================================\n"
                f"🔒 [AUDITORIA DETERMINÍSTICA DE MARKETING — META ADS x ERP]:\n"
                f"{mkt_report}\n"
                f"================================================================================\n"
                f"⛔ TRAVA ANTI-ALUCINAÇÃO MARKETING & GROWTH:\n"
                f"Utilize OBRIGATORIAMENTE as métricas exatas acima (spend, alcance, CTR, CPC, AddToCart, InitiateCheckout, Efeito Halo e Fidelidade).\n"
                f"É ESTRITAMENTE PROIBIDO inventar números de campanhas, cliques ou vendas.\n"
                f"================================================================================\n"
            )
        except Exception as e:
            logger.warning(f"Erro ao gerar snapshot determinístico de Marketing: {e}")

    ground_truth = jvrio_snapshot or intranetmall_snapshot or marketing_snapshot or (get_ground_truth_snapshot() if needs_erp_snapshot else "")
    effective_request = f"{ground_truth}\n\n[SOLICITAÇÃO DA TAREFA]:\n{user_request}" if ground_truth else user_request

    # 1. Carrega topologia (snapshot do Mutex ou atual do banco)
    topo = topology_snapshot or get_canvas_topology()
    nodes = topo.get("nodes", [])
    edges = topo.get("edges", [])

    # 2. Carrega Diretrizes do Town Hall (Objetivos Gerais da AI Board)
    town_hall = get_town_hall()
    town_hall_text = (
        f"\n\n[🏢 DIRETRIZES ESTRATÉGICAS DA EMPRESA - TOWN HALL]:\n"
        f"• Visão Corporativa: {town_hall.get('vision', '')}\n"
        f"• Metas e OKRs Globais:\n{town_hall.get('okrs', '')}\n"
        f"• Princípios e Diretrizes: {town_hall.get('guidelines', '')}\n"
        f"Todos os agentes devem alinhar suas decisões e respostas a estas diretrizes corporativas.\n"
    )

    # 3. Carrega Regras Aprendidas dos Fundadores (`REGRAS_APRENDIDAS_E_FEEDBACKS.md`)
    shared_learned_rules = get_learned_rules_content()

    # Filtra nós de agentes e nós de ferramentas
    agent_nodes = [n for n in nodes if n.get("type") == "agent"]
    tool_nodes = {n["id"]: n for n in nodes if n.get("type") == "tool"}

    if not agent_nodes:
        logger.info("Nenhum nó de agente na topologia. Utilizando configuração base padrão.")
        return _create_default_crew(effective_request, town_hall_text)

    # 4. Mapeia conexões entre ferramentas -> agentes e agentes -> agentes
    tools_for_agent: Dict[str, List[Any]] = {a["id"]: [] for a in agent_nodes}
    allowed_peers_for_agent: Dict[str, List[str]] = {a["id"]: [] for a in agent_nodes}

    for edge in edges:
        s_id = edge.get("source")
        t_id = edge.get("target")

        if s_id in tool_nodes and t_id in tools_for_agent:
            t_node = tool_nodes[s_id]
            inst_tools = instantiate_mcp_tools_by_type(t_node.get("data", {}).get("type"), t_node.get("data"))
            tools_for_agent[t_id].extend(inst_tools)
        elif t_id in tool_nodes and s_id in tools_for_agent:
            t_node = tool_nodes[t_id]
            inst_tools = instantiate_mcp_tools_by_type(t_node.get("data", {}).get("type"), t_node.get("data"))
            tools_for_agent[s_id].extend(inst_tools)

        if s_id in allowed_peers_for_agent and t_id in allowed_peers_for_agent:
            if t_id not in allowed_peers_for_agent[s_id]:
                allowed_peers_for_agent[s_id].append(t_id)

    # 5. Instancia os Agentes dinamicamente com Protocolo Meta Muse + Memória Contínua
    crew_agents: List[Agent] = []
    agent_instances: Dict[str, Agent] = {}

    for a_node in agent_nodes:
        a_id = a_node["id"]
        a_data = a_node.get("data", {})

        role = a_data.get("role", "Especialista Operacional")
        name = a_data.get("name", role)
        goal = a_data.get("goal", "Executar tarefas designadas no ecossistema corporativo.")
        model_name = a_data.get("model", "Gemini 3.8 Flash Medium")
        llm = get_gemini_llm(model_name)

        mem_info = get_agent_memory(a_id)
        pers_info = get_agent_personality(a_id)
        is_clevel = bool(
            a_data.get("isCLevel")
            or a_data.get("isLead")
            or a_id in ("agent-ceo", "agent-coo", "agent-cfo", "agent-cmo", "agent-cpo")
        )

        learned_facts = "\n".join([f"- {fact}" for fact in mem_info.get("learned_facts", [])])
        custom_backstory = (a_data.get("backstory") or "").strip()

        backstory = (
            f"Você é {name}, atuando como `{role}`.\n"
            f"Personalidade e Tom: {pers_info.get('tone', 'Proativo, analítico e orientado a resolução Zero-Click')}.\n\n"
            f"📋 [BACKSTORY E INSTRUÇÕES OPERACIONAIS DO CARGO]:\n"
            f"{custom_backstory or pers_info.get('guidelines', '')}\n\n"
            f"🧠 [MEMÓRIA OPERACIONAL ACUMULADA]:\n{mem_info.get('memory_text', '')}\n"
            f"Fatos Aprendidos:\n{learned_facts}\n\n"
            f"📚 [REGRAS APRENDIDAS E FEEDBACKS DOS FUNDADORES (`REGRAS_APRENDIDAS_E_FEEDBACKS.md`)]:\n"
            f"{shared_learned_rules}\n"
            f"{town_hall_text}\n"
            f"{GLOBAL_META_MUSE_PROTOCOL}\n"
            f"{C_LEVEL_LEARNING_TRIGGER if is_clevel else ''}\n"
            f"[💡 DIRETRIZ DE FRUGALIDADE E AUTONOMIA - SCRIPTS & BANCOS LOCAIS]:\n"
            f"Seu ID interno é '{a_id}'. Você possui um workspace local com ferramentas para forjar e rodar scripts próprios:\n"
            f"- 'agent_script_forge': Escreva scripts Python locais para cálculos repetitivos, filtros e relatórios.\n"
            f"- 'agent_script_execute': Execute seus scripts Python localmente com custo ZERO de tokens.\n"
            f"- 'agent_sqlite_manager': Crie tabelas e consulte seu banco SQLite local para guardar estado permanente.\n"
            f"- 'agent_data_store': Salve ou leia caches JSON/CSV e relatórios compilados.\n"
            f"- 'agent_workspace_list': Liste ferramentas e arquivos já criados em seu workspace.\n"
            f"- 'learned_rules_memory': Consulte ou grave permanentemente novas regras de negócio e feedbacks dos fundadores.\n"
            f"SEMPRE que uma tarefa puder ser resolvida com script determinístico ou consulta SQL local, prefira este método para economizar tokens e garantir velocidade máxima.\n"
        )

        raw_tools = list(tools_for_agent.get(a_id, []))
        # Garante que o COO tenha acesso direto à Intranet Mall e Gmail para encaminhar boletos e circulares
        if a_id == "agent-coo":
            raw_tools.append(GmailSendEmailTool())
            if ERPSalesFinancialTool is not None:
                raw_tools.append(ERPSalesFinancialTool())
            try:
                try:
                    from custom_tools.intranetmall_tools import (
                        IntranetMallDailyAuditTool,
                        IntranetMallBoletosTool,
                        IntranetMallVendasTool,
                        IntranetMallCircularesTool,
                        IntranetMallOSTool
                    )
                except ImportError:
                    from tools.intranetmall_tools import (
                        IntranetMallDailyAuditTool,
                        IntranetMallBoletosTool,
                        IntranetMallVendasTool,
                        IntranetMallCircularesTool,
                        IntranetMallOSTool
                    )
                raw_tools.extend([
                    IntranetMallDailyAuditTool(),
                    IntranetMallBoletosTool(),
                    IntranetMallVendasTool(),
                    IntranetMallCircularesTool(),
                    IntranetMallOSTool(),
                ])
            except ImportError:
                pass
        elif a_id == "agent-coo-logistics":
            for _cls in (ERPInventoryForecastTool, ERPStockCheckTool):
                if _cls is not None:
                    raw_tools.append(_cls())
        elif a_id == "agent-cfo-accounting":
            raw_tools.append(JVRioAccountingAuditTool())
        elif a_id in ("agent-cmo", "agent-cmo-ads", "agent-cmo-creative"):
            try:
                try:
                    from custom_tools.marketing_tools import MarketingGrowthAuditTool
                except ImportError:
                    from tools.marketing_tools import MarketingGrowthAuditTool
                raw_tools.append(MarketingGrowthAuditTool())
            except ImportError:
                pass

        raw_tools.extend([
            TelegramAlertTool(),
            AgentScriptForgeTool(),
            AgentScriptExecuteTool(),
            AgentSQLiteTool(),
            AgentDataStoreTool(),
            AgentWorkspaceListTool(),
            LearnedRulesMemoryTool()
        ])
        seen_names = set()
        dedup_tools = []
        for t in raw_tools:
            if t.name not in seen_names:
                seen_names.add(t.name)
                dedup_tools.append(t)

        # Diretores C-Level (CEO, COO, CFO, CMO, CPO) têm allow_delegation=True explícito
        connected_peers = allowed_peers_for_agent.get(a_id, [])
        can_delegate = is_clevel or (len(connected_peers) > 0)

        agent = Agent(
            role=role,
            goal=goal,
            backstory=backstory,
            tools=dedup_tools,
            llm=llm,
            verbose=True,
            allow_delegation=can_delegate
        )
        crew_agents.append(agent)
        agent_instances[a_id] = agent

    # 6. Segmentação Inteligente da Equipe e Alocação de Tarefas
    lead_node = next((n for n in agent_nodes if n.get("data", {}).get("isLead") or n.get("data", {}).get("department") == "ceo"), agent_nodes[0])
    lead_agent = agent_instances[lead_node["id"]]

    clevel_by_dept = {}
    for n in agent_nodes:
        if n.get("data", {}).get("isCLevel") and n["id"] != lead_node["id"]:
            dept = n.get("data", {}).get("department", "").lower()
            if dept:
                clevel_by_dept[dept] = n["id"]

    # Detecta se o usuário está ensinando uma nova regra ou dando feedback aos fundadores
    is_learning_feedback = any(w in req_lower for w in [
        "a partir de hoje", "nova regra", "sempre que", "nunca mais", "desconsidere",
        "registre essa regra", "grave na memória", "grave na memoria", "aprenda que", "passe a enviar"
    ])

    target_specialist_id = None
    for a_node in agent_nodes:
        a_id = a_node["id"]
        a_data = a_node.get("data", {})
        for st in a_data.get("scheduledTasks", []):
            st_title = st.get("title", "").lower()
            if st_title and st_title in req_lower:
                target_specialist_id = a_id
                break
        if target_specialist_id:
            break

    is_full_report = any(w in req_lower for w in [
        "relatório completo", "relatorio completo", "boletim estratégico completo",
        "boletim completo", "ata do comitê", "ata do comite",
        "comitê executivo completo", "comite executivo completo",
        "parecer completo da diretoria"
    ])

    if not target_specialist_id:
        if any(w in req_lower for w in ["intranet", "shopping center", "shopping", "circular", "circulares", "ordem de serviço", "ordens de serviço", "importação", "importacao", "90 dias"]):
            target_specialist_id = "agent-coo"
        elif any(w in req_lower for w in ["previsão de estoque", "previsao de estoque", "previsão de insumos", "previsao de insumos", "planejamento de compras", "planejamento semanal de estoque", "reposição", "reposicao", "mrp", "thiluc", "rio quality", "dl cargas", "olaria", "romaneio", "quanto o estoque", "durará", "durara"]):
            target_specialist_id = "agent-coo-logistics" if "agent-coo-logistics" in agent_instances else "agent-coo-stock"
        elif any(w in req_lower for w in ["fechamento de vendas", "estoque", "insumos", "saldo de estoque", "boba", "copo", "tampa", "ingredientes", "ruptura", "contagem"]):
            target_specialist_id = "agent-coo-stock"
        elif any(w in req_lower for w in ["contas a pagar", "contas do dia", "faturas", "vencimento", "fornecedores", "brex", "boleto", "boletos"]):
            target_specialist_id = "agent-cfo-payable"
        elif any(w in req_lower for w in ["jv rio", "fechamento contábil", "fechamento contabil", "impostos", "pasta compartilhada", "das", "darf"]):
            target_specialist_id = "agent-cfo-accounting"
        elif any(w in req_lower for w in ["dre", "cmv", "margem de contribuição", "margem de contribuicao", "ebitda"]):
            target_specialist_id = "agent-cfo-profit"
        elif any(w in req_lower for w in ["folha", "ponto", "dp", "trabalhista", "férias", "ferias", "marq", "art. 386", "art. 66", "art. 71", "dsr", "interjornada", "intrajornada", "descanso", "escala", "escalas"]):
            target_specialist_id = "agent-cpo-dp"
        elif any(w in req_lower for w in ["aso", "onboarding", "carreira", "cargos e salários", "contrato assinado"]):
            target_specialist_id = "agent-cpo-training"
        elif any(w in req_lower for w in ["turno", "turnos", "horário", "horario", "horários", "horarios", "manual", "manuais", "pop", "pops", "procedimento", "ficha técnica", "ficha tecnica"]):
            target_specialist_id = "agent-coo-manuals" if "agent-coo-manuals" in agent_instances else clevel_by_dept.get("coo")
        elif any(w in req_lower for w in ["roteiro", "reels", "tiktok", "copy", "legenda", "criativo"]):
            target_specialist_id = "agent-cmo-creative"
        elif any(w in req_lower for w in ["meta ads", "google ads", "campanhas", "tráfego", "trafego", "roas", "ctr", "cpa"]):
            target_specialist_id = "agent-cmo-ads"
        elif any(w in req_lower for w in ["suporte", "chatwoot", "freescout", "reclamações", "reclamacoes", "cx", "chamados", "sac"]):
            target_specialist_id = "agent-cmo-sac" if "agent-cmo-sac" in agent_instances else "agent-coo-manuals"
        elif any(w in req_lower for w in ["venda", "vendas", "faturamento", "pedidos", "ticket médio", "ticket medio", "canal", "canais"]):
            target_specialist_id = "agent-coo-stock"

    custom_response_format = (town_hall.get("response_format") or "").strip()
    lead_pers = get_agent_personality(lead_node["id"])
    lead_guidelines = (lead_pers.get("guidelines") or "").strip()

    lang_rule = (
        "\n🌐 IDIOMA DE RESPOSTA: Responda SEMPRE no mesmo idioma em que o usuário escreveu a pergunta/solicitação "
        "(se a pergunta estiver em inglês, responda 100% em inglês; se estiver em espanhol, em espanhol; se estiver em português, em português)."
    )

    if is_full_report:
        lead_task_desc = (
            f"Como CEO e Líder Geral da organização, consolide os levantamentos da sua equipe para responder à solicitação: '{user_request}'.\n"
            "Apresente um Relatório Estratégico Consolidado contendo:\n"
            "1. **[STATUS / ALERTA]:** Resumo executivo em 1 linha\n"
            "2. **[DIAGNÓSTICO & DADOS]:** Tabelas Markdown fiéis aos dados reais\n"
            "3. **[AÇÃO JÁ EXECUTADA]:** Ações autônomas já realizadas pelos agentes\n"
            "4. **[DECISÃO NECESSÁRIA]:** O que precisa de 1 clique/aprovação humana\n"
            "⚠️ DIRETRIZ DE VERACIDADE RIGOROSA: Os valores numéricos DEVEM ser 100% fiéis aos relatórios oficiais e ferramentas. Zero dados fictícios."
            f"{lang_rule}"
        )
        lead_expected_output = "Relatório Executivo consolidado no padrão Zero-Click Resolution com dados 100% verídicos, no idioma da pergunta."
    elif custom_response_format:
        lead_task_desc = (
            f"Como Líder Geral da organização, responda à solicitação do usuário: '{user_request}'.\n\n"
            f"🎯 REGRAS DE FORMATO E ESTRUTURA DE RESPOSTA (Configuradas no Painel Town Hall):\n"
            f"{custom_response_format}\n\n"
            f"🎭 DIRETRIZES PESSOAIS DO LÍDER:\n"
            f"{lead_guidelines}\n\n"
            f"{'🧠 ATENÇÃO: O usuário enviou uma nova regra ou feedback. Utilize a ferramenta learned_rules_memory com action=add para gravá-la permanentemente e confirme na resposta!' if is_learning_feedback else ''}\n"
            f"⚠️ DIRETRIZ DE VERACIDADE RIGOROSA: Baseie-se estritamente nos dados oficiais levantados pelas ferramentas. Zero alucinação."
            f"{lang_rule}"
        )
        lead_expected_output = "Resposta final em Markdown seguindo estritamente as Regras de Formato configuradas na interface, no idioma da pergunta."
    else:
        lead_task_desc = (
            f"Como Líder Geral da organização, responda de forma DIRETA, OBJETIVA e CONCISA à solicitação do usuário: '{user_request}'.\n\n"
            "🎯 DIRETRIZ CRÍTICA — APENAS A RESPOSTA EXECUTIVA DIRETA (ZERO BUROCRACIA):\n"
            "1. Responda DIRETAMENTE ao que foi solicitado logo na primeira linha, sem enrolação ou preâmbulos.\n"
            "2. Se a pergunta solicitar dados, lista, nomes, horários ou tabelas, apresente DIRETAMENTE a tabela/dados solicitados em Markdown limpo.\n"
            "⚠️ DIRETRIZ DE VERACIDADE RIGOROSA: Baseie-se estritamente nos dados oficiais levantados pelas ferramentas. Zero alucinação."
            f"{lang_rule}"
        )
        lead_expected_output = "Resposta Executiva Direta em Markdown limpo, concisa, objetiva, contendo apenas a resposta e tabela solicitada, no idioma da pergunta."

    tasks: List[Task] = []
    selected_agents: List[Agent] = []

    if target_specialist_id and target_specialist_id in agent_instances:
        spec_agent = agent_instances[target_specialist_id]
        spec_node = next(n for n in agent_nodes if n["id"] == target_specialist_id)
        dept = spec_node.get("data", {}).get("department", "").lower()
        clevel_id = clevel_by_dept.get(dept)

        selected_agents.append(spec_agent)

        task_spec = Task(
            description=(
                f"Atue com rigor operacional e proatividade Zero-Click (Padrão Meta Muse) para atender à solicitação: '{effective_request}'.\n"
                f"Utilize suas ferramentas atribuídas para levantar dados oficiais, fazer verificação cruzada 360º e já entregar a ação/solução pronta.\n"
                f"REGRAS DE CONFORMIDADE E ZERO ALUCINAÇÃO:\n"
                f"- NUNCA invente, estime ou arredonde números.\n"
                f"- Nunca apenas reclame de um problema: já execute a busca/pré-lançamento/cálculo e entregue a solução pronta.\n"
                f"Seus objetivos específicos: {spec_agent.goal}"
            ),
            expected_output=f"Diagnóstico + Ação Executada + Solução Pronta levantados por {spec_agent.role} em Markdown estruturado.",
            agent=spec_agent
        )
        tasks.append(task_spec)

        if clevel_id and clevel_id in agent_instances and clevel_id != target_specialist_id:
            clevel_agent = agent_instances[clevel_id]
            selected_agents.append(clevel_agent)
            task_clevel = Task(
                description=(
                    f"Como diretor C-Level da pasta ({clevel_agent.role}), avalie, audite em 360º e complemente a solução pronta apresentada por {spec_agent.role} "
                    f"para a solicitação: '{user_request}'.\n"
                    f"{'Se houver uma nova regra ou feedback do fundador, registre-a permanentemente usando learned_rules_memory(action=add).' if is_learning_feedback else ''}\n"
                    f"Valide os números exatos e a solução antes do envio ao CEO."
                ),
                expected_output=f"Dados validados, ação executada e decisão pronta da diretoria {clevel_agent.role}.",
                agent=clevel_agent
            )
            tasks.append(task_clevel)

        if lead_node["id"] != target_specialist_id:
            selected_agents.append(lead_agent)
            task_ceo = Task(
                description=lead_task_desc,
                expected_output=lead_expected_output,
                agent=lead_agent
            )
            tasks.append(task_ceo)

    else:
        erp_node_id = "agent-coo-stock" if "agent-coo-stock" in agent_instances else "agent-coo-sales"
        manuals_node_id = "agent-coo-manuals" if "agent-coo-manuals" in agent_instances else None
        core_ids = [
            erp_node_id,
            manuals_node_id,
            clevel_by_dept.get("coo"),
            clevel_by_dept.get("cfo"),
            clevel_by_dept.get("cmo"),
            clevel_by_dept.get("cpo"),
            lead_node["id"]
        ]
        valid_ids = [cid for cid in core_ids if cid and cid in agent_instances]

        seen_c = set()
        active_ids = []
        for cid in valid_ids:
            if cid not in seen_c:
                seen_c.add(cid)
                active_ids.append(cid)

        for aid in active_ids:
            agent = agent_instances[aid]
            selected_agents.append(agent)

            if aid == lead_node["id"]:
                tasks.append(
                    Task(
                        description=lead_task_desc,
                        expected_output=lead_expected_output,
                        agent=agent
                    )
                )
            else:
                tasks.append(
                    Task(
                        description=(
                            f"Atue dentro de sua alçada ({agent.role}) usando o protocolo Zero-Click Resolution para analisar a solicitação: '{effective_request}'.\n"
                            f"Utilize suas ferramentas oficiais para levantar dados reais e entregar a solução pronta.\n"
                            f"ATENÇÃO: Não invente números fora da sua área. Baseie-se apenas em suas ferramentas e no snapshot oficial fornecido."
                        ),
                        expected_output=f"Diagnóstico + Ação + Solução Pronta oficial de {agent.role}.",
                        agent=agent
                    )
                )

    # Habilita memória nativa se houver OPENAI_API_KEY configurada para embeddings ou usa memória SQLite/MD persistente
    enable_native_memory = bool(os.getenv("OPENAI_API_KEY"))
    crew_kwargs = {
        "agents": selected_agents,
        "tasks": tasks,
        "process": Process.sequential,
        "memory": enable_native_memory,
        "verbose": True
    }
    if step_callback:
        crew_kwargs["step_callback"] = step_callback
    if task_callback:
        crew_kwargs["task_callback"] = task_callback

    return Crew(**crew_kwargs)


def _create_default_crew(user_request: str, town_hall_text: str) -> Crew:
    """Equipe padrão de contingência caso o canvas esteja vazio."""
    llm = get_gemini_llm()

    drive_search = GoogleDriveSearchTool()
    drive_read = GoogleDriveReadFileTool()
    gmail_search = GmailSearchTool()
    chatwoot = ChatwootTool()
    freescout = FreescoutTool()
    rules_tool = LearnedRulesMemoryTool()

    erp_tools = [rules_tool]
    for cls in (ERPSalesFinancialTool, ERPProductSearchTool, ERPStockCheckTool):
        if cls is not None:
            erp_tools.insert(0, cls())

    agente_erp = Agent(
        role="Gestor de Estoque, Insumos & Auditor Operacional",
        goal="Cruzar vendas com contagens físicas no Google Drive, detectar divergências ou risco de ruptura (stockout) e calcular necessidades de compra local e importação.",
        backstory=f"Você é o especialista em vendas, estoque e faturamento da organização.{town_hall_text}{GLOBAL_META_MUSE_PROTOCOL}",
        tools=erp_tools,
        llm=llm,
        verbose=True
    )

    agente_workspace = Agent(
        role="Guardião de Manuais, Receitas & POPs Operacionais",
        goal="Resolver dúvidas operacionais das lojas instantaneamente com base nas fichas técnicas e manuais oficiais e auditar se os procedimentos estão atualizados.",
        backstory=f"Você é o guardião dos processos da empresa.{town_hall_text}{GLOBAL_META_MUSE_PROTOCOL}",
        tools=[drive_search, drive_read, gmail_search, chatwoot, freescout, rules_tool],
        llm=llm,
        verbose=True
    )

    coordenador = Agent(
        role="CEO - Diretor Geral & Orquestrador Zero-Click",
        goal="Analisar a solicitação do usuário, coordenar investigações com os especialistas e entregar um resumo executivo com números exatos e solução pronta.",
        backstory=f"Você é o assistente executivo e de operações da diretoria da organização.{town_hall_text}{GLOBAL_META_MUSE_PROTOCOL}{C_LEVEL_LEARNING_TRIGGER}",
        tools=[rules_tool],
        llm=llm,
        allow_delegation=True,
        verbose=True
    )

    t1 = Task(
        description=f"Consulte o ERP sobre: '{user_request}'. Se envolver faturamento, utilize 'erp_sales_financial_report'.",
        expected_output="Dados consolidados de faturamento ou catálogo do ERP.",
        agent=agente_erp
    )
    t2 = Task(
        description=f"Pesquise documentos e canais operacionais sobre: '{user_request}'.",
        expected_output="Resumo de arquivos ou confirmação operacional.",
        agent=agente_workspace
    )
    t3 = Task(
        description=(
            f"Como assistente de inteligência da organização, responda à solicitação: '{user_request}'.\n"
            "🎯 DIRETRIZ CRÍTICA — APENAS A RESPOSTA EXECUTIVA DIRETA (ZERO BUROCRACIA):\n"
            "1. Vá direto ao ponto logo na primeira frase respondendo objetivamente ao usuário.\n"
            "2. Se pedir tabela ou lista de dados, forneça diretamente a tabela/dados em Markdown.\n"
            "3. Seja conciso, claro e factual."
        ),
        expected_output="Resposta Executiva Direta em Markdown limpo com apenas os dados solicitados.",
        agent=coordenador
    )

    crew_kwargs = {
        "agents": [agente_erp, agente_workspace, coordenador],
        "tasks": [t1, t2, t3],
        "process": Process.sequential,
        "verbose": True
    }
    return Crew(**crew_kwargs)


def run_operational_crew(
    prompt: str,
    topology_snapshot: Optional[Dict[str, Any]] = None,
    step_callback: Optional[Any] = None,
    task_callback: Optional[Any] = None
) -> str:
    """Executa a Crew operacional e retorna o resultado formatado."""
    crew = create_operational_crew(
        prompt,
        topology_snapshot=topology_snapshot,
        step_callback=step_callback,
        task_callback=task_callback
    )
    result = crew.kickoff()
    return str(result)
