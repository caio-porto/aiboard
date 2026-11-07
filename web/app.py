"""Streamlit Dashboard for AI Board Enterprise Suite."""
import os
import time
import requests
import streamlit as st
from dotenv import load_dotenv

# Carrega variáveis
load_dotenv()

from web.auth import render_login_component

COMPANY_NAME = os.getenv("COMPANY_NAME", "AI Board")
APP_DOMAIN = os.getenv("APP_DOMAIN", "localhost:8501")

st.set_page_config(
    page_title=f"{COMPANY_NAME} | AI Enterprise",
    page_icon="/logo.svg",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        #MainMenu {visibility: hidden;}
        footer {visibility: hidden;}
        header {visibility: hidden;}
        
        :root {
            --brand-dark: #16422B;
            --brand-green: #2B6143;
            --brand-accent: #CA3D26;
            --brand-light-green: #EFF5F1;
            --brand-gray: #4A5568;
            --brand-border: #E2E8E4;
            --brand-bg: #F8FAF9;
        }

        .stApp {
            background-color: var(--brand-bg);
            font-family: 'Nunito', sans-serif;
            color: #1A202C;
        }

        .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #FFFFFF;
            border: 1px solid var(--brand-border);
            border-radius: 18px;
            padding: 12px 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 16px rgba(22, 66, 43, 0.05);
        }
        .brand-container {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .official-logo-img {
            height: 38px;
            width: auto;
            object-fit: contain;
        }
        .brand-badge-ai {
            background: var(--brand-dark);
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 800;
            padding: 4px 10px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
        }
        .user-profile {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            color: var(--brand-gray);
            text-align: right;
        }
        .user-name {
            font-weight: 800;
            color: var(--brand-dark);
        }

        .brand-card {
            background: #FFFFFF;
            border: 1px solid var(--brand-border);
            border-radius: 18px;
            padding: 22px 26px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.02);
            margin-bottom: 20px;
        }
        .card-title {
            font-weight: 800;
            font-size: 20px;
            color: var(--brand-dark);
            margin-bottom: 6px;
        }

        div.stButton > button {
            background-color: var(--brand-dark);
            color: #FFFFFF;
            border-radius: 12px;
            border: none;
            padding: 10px 20px;
            font-weight: 700;
            font-size: 14px;
            transition: all 0.25s ease;
        }
        div.stButton > button:hover {
            background-color: var(--brand-green);
            color: #FFFFFF;
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(22, 66, 43, 0.2);
        }

        .stTabs [data-baseweb="tab-list"] {
            gap: 10px;
            border-bottom: 2px solid var(--brand-border);
            padding-bottom: 6px;
        }
        .stTabs [data-baseweb="tab"] {
            border-radius: 10px;
            padding: 8px 18px;
            font-weight: 700;
            font-size: 15px;
            color: var(--brand-gray);
            border: none;
        }
        .stTabs [aria-selected="true"] {
            background-color: var(--brand-light-green) !important;
            color: var(--brand-dark) !important;
            font-weight: 800;
        }
    </style>
""", unsafe_allow_html=True)

# Renderiza autenticação Google OAuth
user = render_login_component()

API_URL = os.getenv("API_INTERNAL_URL", "http://127.0.0.1:8001")

topbar_html = f"""
<div class="topbar">
    <div class="brand-container">
        <span style="font-weight:900;font-size:20px;color:#16422B;">{COMPANY_NAME}</span>
        <span class="brand-badge-ai">AI Enterprise</span>
    </div>
    <div class="user-profile">
        <div>
            <div class="user-name">{user.get('name', 'Admin')}</div>
            <small style="color:#718096;">{user.get('email', 'admin@example.com')}</small>
        </div>
    </div>
</div>
"""
st.markdown(topbar_html, unsafe_allow_html=True)

# Sidebar
with st.sidebar:
    st.markdown(f"### {COMPANY_NAME}")
    
    # Status Backend
    try:
        health_resp = requests.get(f"{API_URL}/health", timeout=3)
        if health_resp.status_code == 200:
            st.success("🟢 CrewAI Backend Online")
        else:
            st.warning("🟠 Backend em manutenção")
    except Exception:
        st.error("🔴 Backend Offline")

    st.markdown("---")
    st.markdown("#### Conexões Ativas")
    st.markdown("✅ **Google Workspace**")
    st.markdown("✅ **Chatwoot**")
    st.markdown("✅ **Freescout**")
    st.markdown("✅ **Evolution API** (`WhatsApp`)")
    st.markdown("✅ **Telegram Bot**")

    st.markdown("---")
    if st.button("🚪 Encerrar Sessão", use_container_width=True):
        st.session_state["user"] = None
        st.rerun()

# Abas principais
tab_operacional, tab_financeiro, tab_historico, tab_config = st.tabs([
    "🌿 Central Operacional",
    "💰 Agente Financeiro",
    "📜 Histórico de Agentes",
    "⚙️ Infraestrutura"
])

# ---------------- TAB 1: CENTRAL OPERACIONAL ----------------
with tab_operacional:
    st.markdown("""
        <div class="brand-card">
            <div class="card-title">Central de Inteligência Operacional</div>
            <p style="color:#4A5568; margin-bottom:0;">
                Equipe de agentes CrewAI autônomos para responder dúvidas, analisar posições de estoque,
                consultar planilhas e procedimentos no Google Drive e sintetizar relatórios.
            </p>
        </div>
    """, unsafe_allow_html=True)

    st.markdown("##### ⚡ Ações Rápidas (1 Clique)")
    col1, col2, col3 = st.columns(3)
    quick_prompt = None

    if col1.button("📦 Auditoria Operacional", use_container_width=True):
        quick_prompt = "Executar auditoria operacional completa dos conectores ativos."

    if col2.button("📝 Chamados em Aberto no Helpdesk", use_container_width=True):
        quick_prompt = "Consultar chamados ativos no Freescout e resumir pendências operacionais."

    if col3.button("📂 Buscar Manuais no Google Drive", use_container_width=True):
        quick_prompt = "Buscar no Google Drive procedimentos operacionais e fichas técnicas."

    with st.form("form_agent_run"):
        user_prompt = st.text_area(
            "Instrução para a Equipe de Agentes:",
            value=quick_prompt if quick_prompt else "",
            placeholder="Ex: Consultar os últimos e-mails recebidos e resumir pendências prioritárias.",
            height=110
        )
        submit_btn = st.form_submit_button("🚀 Executar Agentes CrewAI", use_container_width=True)

    if submit_btn and user_prompt.strip():
        with st.spinner("Enviando tarefa para a fila de agentes..."):
            try:
                res = requests.post(
                    f"{API_URL}/api/tasks",
                    json={
                        "crew_name": "operational",
                        "prompt": user_prompt,
                        "requester": f"web:{user.get('email', 'admin')}"
                    },
                    timeout=10
                )
                if res.status_code == 200:
                    task_data = res.json()
                    task_id = task_data["task_id"]
                    st.success(f"Tarefa enfileirada! ID: `{task_id}`")

                    progress_placeholder = st.empty()
                    result_placeholder = st.empty()
                    
                    for _ in range(60):
                        time.sleep(2)
                        status_res = requests.get(f"{API_URL}/api/tasks/{task_id}", timeout=5)
                        if status_res.status_code == 200:
                            data = status_res.json()
                            status = data["status"]
                            progress_placeholder.info(f"⏳ Status da Execução: **{status}**...")
                            
                            if status == "COMPLETED":
                                progress_placeholder.success("✅ Tarefa Concluída com Sucesso!")
                                result_placeholder.markdown("### 📋 Resposta Consolidada:")
                                result_placeholder.markdown(data["result"])
                                break
                            elif status == "FAILED":
                                progress_placeholder.error(f"❌ Falha na Execução: {data.get('error')}")
                                break
                else:
                    st.error(f"Erro na API: {res.text}")
            except Exception as e:
                st.error(f"Falha de conexão com a API: {str(e)}")

# ---------------- TAB 2: AGENTE FINANCEIRO ----------------
with tab_financeiro:
    st.markdown("""
        <div class="brand-card">
            <div class="card-title">💰 Agente Financeiro & Conciliação</div>
            <p style="color:#4A5568; margin-bottom:0;">
                Módulo para conciliação automática de pagamentos em conta corrente e auditoria de e-mails fiscais/boletos.
            </p>
        </div>
    """, unsafe_allow_html=True)
    st.info("A base do Agente Financeiro está configurada em `crews/financial_crew.py`.")

# ---------------- TAB 3: HISTÓRICO & LOGS ----------------
with tab_historico:
    st.markdown("##### 📜 Histórico Recente de Tarefas")
    if st.button("🔄 Atualizar Histórico", key="btn_reload_tasks"):
        st.rerun()

    try:
        tasks_res = requests.get(f"{API_URL}/api/tasks", timeout=5)
        if tasks_res.status_code == 200:
            tasks = tasks_res.json()
            if tasks:
                for t in tasks:
                    status_badge = "🟢" if t['status'] == "COMPLETED" else "⏳" if t['status'] in ("QUEUED", "RUNNING") else "🔴"
                    with st.expander(f"{status_badge} [{t['task_id']}] {t['crew_name'].upper()} — {t['status']}"):
                        st.markdown(f"**Instrução:** {t['prompt']}")
                        if t.get("result"):
                            st.markdown("**Resultado:**")
                            st.markdown(t["result"])
                        if t.get("error"):
                            st.error(f"Erro: {t['error']}")
            else:
                st.info("Nenhuma tarefa executada ainda.")
    except Exception as e:
        st.error(f"Não foi possível carregar o histórico: {str(e)}")

# ---------------- TAB 4: CONEXÕES & STATUS ----------------
with tab_config:
    st.markdown("##### ⚙️ Ecossistema Integrado")
    st.markdown("""
        | Serviço | Endereço Interno | Papel Operacional |
        | :--- | :--- | :--- |
        | **FastAPI Backend** | `http://127.0.0.1:8001` | Fila assíncrona CrewAI & Studio UI |
        | **Streamlit Web** | `http://127.0.0.1:8501` | Dashboard auxiliar |
        | **Chatwoot** | `http://127.0.0.1:3050` | Atendimentos e CRM |
        | **Freescout** | `http://127.0.0.1:18080` | Chamados de suporte |
        | **Evolution API** | `http://127.0.0.1:8085` | Conector WhatsApp |
        | **PostgreSQL + pgvector**| `127.0.0.1:5432` | Banco relacional e memória vetorial |
    """)
