"""Google OAuth 2.0 Authentication Helper for Streamlit."""
import os
import requests
import streamlit as st
from typing import Optional, Dict, Any

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

def get_google_auth_url() -> Optional[str]:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8501")
    if not client_id or "your_google_oauth" in client_id:
        return None
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account"
    }
    query_str = "&".join(f"{k}={requests.utils.quote(v)}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query_str}"

def exchange_code_for_user(code: str) -> Optional[Dict[str, Any]]:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8501")

    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    try:
        token_resp = requests.post(GOOGLE_TOKEN_URL, data=data, timeout=10)
        if token_resp.status_code != 200:
            return None
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        user_resp = requests.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        if user_resp.status_code == 200:
            return user_resp.json()
    except Exception:
        pass
    return None

def is_email_authorized(email: str) -> bool:
    allowed_domains_str = os.getenv("ALLOWED_GOOGLE_DOMAINS", "").strip().lower()
    allowed_domains = [d.strip() for d in allowed_domains_str.split(",") if d.strip()]
    allowed_emails_str = os.getenv("ALLOWED_GOOGLE_EMAILS", "").strip().lower()
    allowed_emails = [e.strip() for e in allowed_emails_str.split(",") if e.strip()]

    email = email.lower()
    if email in allowed_emails:
        return True
    
    for domain in allowed_domains:
        if email.endswith(f"@{domain}"):
            return True

    if not allowed_domains and not allowed_emails:
        return True
        
    return False

def render_login_component() -> Optional[Dict[str, Any]]:
    """Gerencia a sessão de login."""
    if "user" in st.session_state and st.session_state["user"]:
        return st.session_state["user"]

    query_params = st.query_params
    if "code" in query_params:
        code = query_params["code"]
        user_info = exchange_code_for_user(code)
        if user_info and "email" in user_info:
            email = user_info["email"]
            if is_email_authorized(email):
                st.session_state["user"] = user_info
                st.query_params.clear()
                st.rerun()
            else:
                st.error(f"Acesso negado: O e-mail '{email}' não está autorizado.")
                st.stop()
        else:
            st.warning("Sessão expirada. Por favor, tente novamente.")

    auth_url = get_google_auth_url()
    company_name = os.getenv("COMPANY_NAME", "AI Board")

    st.markdown("""
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
        <style>
            #MainMenu {visibility: hidden;}
            footer {visibility: hidden;}
            header {visibility: hidden;}
            .stApp {
                background: linear-gradient(180deg, #F9FAF9 0%, #EFF3F0 100%);
                font-family: 'Nunito', sans-serif;
            }
            .login-card {
                background: #FFFFFF;
                border: 1px solid #E2E8E4;
                border-radius: 24px;
                padding: 48px 40px;
                box-shadow: 0 16px 40px rgba(22, 66, 43, 0.08);
                text-align: center;
                max-width: 440px;
                width: 100%;
                margin: 40px auto;
            }
            .brand-subtitle {
                color: #5A6B61;
                font-size: 15px;
                font-weight: 600;
                margin-bottom: 32px;
                line-height: 1.5;
            }
            .btn-google {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                background: #FFFFFF;
                color: #16422B;
                border: 2px solid #E2E8E4;
                border-radius: 14px;
                padding: 14px 20px;
                font-weight: 700;
                font-size: 15px;
                text-decoration: none;
                transition: all 0.25s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            }
            .btn-google:hover {
                background: #F4F7F5;
                border-color: #16422B;
                color: #16422B;
                box-shadow: 0 6px 16px rgba(22, 66, 43, 0.15);
                transform: translateY(-2px);
            }
        </style>
    """, unsafe_allow_html=True)

    login_html = f"""
    <div class="login-card">
        <h2 style="color:#16422B;font-weight:900;margin-bottom:8px;">{company_name}</h2>
        <div class="brand-subtitle">Central de Inteligência Operacional & Agentes Autônomos</div>
        <a href="{auth_url if auth_url else '#'}" target="_self" class="btn-google">
            <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google
        </a>
    </div>
    """
    st.markdown(login_html, unsafe_allow_html=True)
    st.stop()
