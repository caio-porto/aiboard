"""Telegram Bot Service for AI Board Suite - Human-in-the-Loop & Autonomous Execution."""
import os
import json
import logging
import requests
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("crewai_telegram_bot")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_URL = os.getenv("API_INTERNAL_URL", "http://127.0.0.1:8001")
ALLOWED_USERS_RAW = os.getenv("TELEGRAM_ALLOWED_USERS", "")
ALLOWED_USERS = [u.strip().lower().lstrip('@') for u in ALLOWED_USERS_RAW.split(",") if u.strip()]


def check_or_register_approver(update: Update) -> Dict[str, Any]:
    """Verifica permissões do usuário e sincroniza chat_id na tabela de aprovadores."""
    user = update.effective_user
    chat = update.effective_chat
    if not user:
        return {"allowed": False, "can_approve": False, "role": "none"}

    username = (user.username or "").lower().lstrip('@')
    user_id = str(user.id)
    chat_id = str(chat.id) if chat else user_id
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or username

    try:
        r = requests.get(f"{API_URL}/api/telegram/approvers", timeout=3)
        if r.status_code == 200:
            approvers = r.json().get("approvers", [])
            for app in approvers:
                app_u = (app.get("username") or "").lower().lstrip('@')
                app_c = str(app.get("chat_id") or "")
                if (username and app_u == username) or (app_c and app_c == chat_id) or (app_c and app_c == user_id):
                    # Se chat_id estava vazio ou mudou, sincroniza automaticamente
                    if not app.get("chat_id") or app.get("chat_id") != chat_id:
                        requests.post(
                            f"{API_URL}/api/telegram/approvers",
                            json={"username": username, "chat_id": chat_id, "name": full_name},
                            timeout=3
                        )
                    return {
                        "allowed": True,
                        "can_approve": bool(app.get("can_approve", 1) and app.get("is_active", 1)),
                        "role": app.get("role", "approver"),
                        "approver": app
                    }
    except Exception as e:
        logger.debug(f"Erro ao consultar approvers da API: {e}")

    # Privilégio garantido para administradores configurados em ambiente
    admin_users = [u.strip().lower() for u in os.getenv("TELEGRAM_ADMIN_USERS", "").split(",") if u.strip()]
    if (username and username.lower() in admin_users) or (user_id and user_id in admin_users):
        return {"allowed": True, "can_approve": True, "role": "admin"}

    is_allowed = not ALLOWED_USERS or "*" in ALLOWED_USERS or username in ALLOWED_USERS or user_id in ALLOWED_USERS
    return {"allowed": is_allowed, "can_approve": False, "role": "viewer"}


def is_user_allowed(update: Update) -> bool:
    info = check_or_register_approver(update)
    return info["allowed"]


def register_chat_id(chat_id: str):
    """Registra o chat_id ativo do Telegram no backend para receber notificações e aprovações."""
    if not chat_id:
        return
    try:
        requests.post(
            f"{API_URL}/api/settings",
            json={"key": "telegram_default_chat_id", "value": chat_id},
            timeout=4
        )
    except Exception as e:
        logger.debug(f"Falha ao registrar telegram_default_chat_id: {e}")


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    info = check_or_register_approver(update)
    user = update.effective_user
    username = (user.username or "").lstrip('@')
    user_id = str(user.id)
    chat_id = str(update.effective_chat.id)
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or username

    register_chat_id(chat_id)

    if not info["allowed"]:
        # Notifica administradores que um novo usuário solicitou autorização
        try:
            r = requests.get(f"{API_URL}/api/telegram/approvers", timeout=3)
            if r.status_code == 200:
                approvers = r.json().get("approvers", [])
                for a in approvers:
                    if a.get("role") == "admin" and a.get("chat_id"):
                        requests.post(
                            f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                            json={
                                "chat_id": a["chat_id"],
                                "text": (
                                    f"👤 <b>Nova Solicitação de Acesso ao Bot</b>\n\n"
                                    f"• <b>Nome:</b> {full_name}\n"
                                    f"• <b>Usuário:</b> @{username or 'sem_username'}\n"
                                    f"• <b>Chat ID:</b> <code>{user_id}</code>\n\n"
                                    f"Deseja autorizar como aprovador de ações dos agentes?"
                                ),
                                "parse_mode": "HTML",
                                "reply_markup": {
                                    "inline_keyboard": [
                                        [
                                            {"text": "✅ Autorizar como Aprovador", "callback_data": f"auth_appr_{user_id}_{username}"},
                                            {"text": "❌ Recusar", "callback_data": f"auth_deny_{user_id}"}
                                        ]
                                    ]
                                }
                            },
                            timeout=5
                        )
        except Exception as ex:
            logger.debug(f"Erro ao notificar admin: {ex}")

        await update.message.reply_text(
            f"🔒 <b>Acesso Pendente de Autorização</b>\n\n"
            f"Olá {full_name}! Seu usuário @{username or 'N/A'} (ID: <code>{user_id}</code>) ainda não foi cadastrado como aprovador.\n\n"
            f"Uma solicitação foi enviada aos administradores. Assim que aprovado, você começará a receber as solicitações de validação de ações aqui!",
            parse_mode="HTML"
        )
        return

    msg = (
        f"🌿 <b>Olá, {full_name}! Sou o assistente mobile da AI Board Enterprise.</b>\n\n"
        f"Você está conectado e autorizado a interagir e validar ações dos agentes CrewAI.\n\n"
        f"⚙️ <b>Comandos Operacionais:</b>\n"
        f"/aprovacao - Alterna entre Modo Validação (Human-in-the-Loop) e Modo Autônomo\n"
        f"/pendentes - Lista e aprova ações pendentes sugeridas pelos agentes\n"
        f"/aprovadores - Lista os usuários que recebem e aprovam ações\n"
        f"/add_aprovador @usuario Nome - Cadastra um novo aprovador (Admins)\n"
        f"/remover_aprovador @usuario - Remove um aprovador cadastrado (Admins)\n"
        f"/status - Verifica o status dos servidores e agentes\n"
        f"/resumo - Gera um resumo rápido da operação"
    )
    await update.message.reply_text(msg, parse_mode="HTML")


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_allowed(update):
        return

    register_chat_id(str(update.effective_chat.id))

    try:
        r = requests.get(f"{API_URL}/health", timeout=5)
        if r.status_code == 200:
            data = r.json()
            r_mode = requests.get(f"{API_URL}/api/settings/approval-mode", timeout=3)
            is_req = r_mode.json().get("require_action_approval", True) if r_mode.status_code == 200 else True
            mode_tag = "🛡️ Validação Obrigatória" if is_req else "⚡ 100% Autônomo"

            await update.message.reply_text(
                f"🟢 <b>Sistema Online!</b>\n"
                f"Versão: <code>{data.get('version')}</code>\n"
                f"Gemini: <code>{data.get('gemini_ready')}</code>\n"
                f"Modo Agentes: <code>{mode_tag}</code>",
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text("🟠 <b>Aviso:</b> API retornou código inesperado.", parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"🔴 <b>Erro:</b> Não foi possível conectar ao backend CrewAI: {str(e)}", parse_mode="HTML")


async def resumo_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    register_chat_id(str(update.effective_chat.id))
    await handle_prompt(
        update,
        prompt="Gerar um resumo executivo da situação de estoque de embalagens e chamados abertos de suporte nas lojas."
    )


async def aprovacao_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_allowed(update):
        return

    register_chat_id(str(update.effective_chat.id))

    args = getattr(context, "args", None) or []
    if args:
        arg = args[0].lower().strip().replace("ç", "c").replace("ã", "a").replace("á", "a")
        if arg in ("on", "ativar", "true", "1", "validar", "validacao"):
            try:
                requests.post(f"{API_URL}/api/settings/approval-mode", json={"require_action_approval": True}, timeout=5)
                await update.message.reply_text(
                    "🛡️ <b>Modo de Validação ATIVADO</b>\n\n"
                    "Todas as respostas e ações sugeridas pelos agentes exigirão sua confirmação via botão antes do envio.",
                    parse_mode="HTML"
                )
            except Exception as e:
                await update.message.reply_text(f"❌ Erro ao atualizar modo: {e}")
            return
        elif arg in ("off", "desativar", "false", "0", "autonomo"):
            try:
                requests.post(f"{API_URL}/api/settings/approval-mode", json={"require_action_approval": False}, timeout=5)
                await update.message.reply_text(
                    "⚡ <b>Modo Autônomo ATIVADO</b>\n\n"
                    "Os agentes agora executarão as ações e respostas sugeridas automaticamente, sem aguardar aprovação.",
                    parse_mode="HTML"
                )
            except Exception as e:
                await update.message.reply_text(f"❌ Erro ao atualizar modo: {e}")
            return

    # Consulta modo atual
    try:
        r = requests.get(f"{API_URL}/api/settings/approval-mode", timeout=5)
        is_req = r.json().get("require_action_approval", True)
    except Exception:
        is_req = True

    status_str = (
        "🛡️ <b>Modo Atual: Validação Obrigatória (Human-in-the-Loop)</b>\n"
        "<i>O agente formula a ação ou resposta, notifica aqui e só envia após seu clique em 'Aprovar'.</i>"
        if is_req else
        "⚡ <b>Modo Atual: 100% Autônomo</b>\n"
        "<i>O agente formula e executa a ação/envio imediatamente, notificando você em seguida.</i>"
    )

    keyboard = [
        [
            InlineKeyboardButton("🛡️ Ativar Validação", callback_data="set_mode_approval"),
            InlineKeyboardButton("⚡ Ativar Autônomo", callback_data="set_mode_autonomous")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        f"⚙️ <b>Controle de Permissão e Autonomia dos Agentes</b>\n\n"
        f"{status_str}\n\n"
        f"Alterne o comportamento tocando nos botões abaixo:",
        reply_markup=reply_markup,
        parse_mode="HTML"
    )


async def pendentes_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_allowed(update):
        return

    register_chat_id(str(update.effective_chat.id))

    try:
        r = requests.get(f"{API_URL}/api/actions/pending", timeout=6)
        actions = r.json().get("actions", [])
        if not actions:
            await update.message.reply_text("✨ <b>Nenhuma ação pendente de validação no momento.</b> Todos os agentes estão em dia!", parse_mode="HTML")
            return

        await update.message.reply_text(f"📋 <b>Encontrada(s) {len(actions)} ação(ões) pendente(s):</b>", parse_mode="HTML")

        for act in actions[:5]:
            aid = act["action_id"]
            payload = json.loads(act["payload_json"]) if isinstance(act["payload_json"], str) else (act["payload_json"] or {})
            msg_text = payload.get("message") or payload.get("content") or act["summary"]

            clean_target = str(act['target']).replace("<", "&lt;").replace(">", "&gt;")
            clean_summary = str(act['summary']).replace("<", "&lt;").replace(">", "&gt;")
            clean_msg = str(msg_text).replace("<", "&lt;").replace(">", "&gt;")

            act_type = act.get("action_type", "")
            if act_type == "erp_weekly_nfe_inbound":
                appr_label = "✅ Aprovar e Dar Entrada no ERP"
            elif act_type in ("intranetmall_sales_batch_sync", "intranetmall_sales_sync"):
                appr_label = "✅ Aprovar e Lançar na Intranet Mall"
            else:
                appr_label = "✅ Aprovar e Enviar Agora"

            kb = [
                [
                    InlineKeyboardButton(appr_label, callback_data=f"act_appr_{aid}"),
                    InlineKeyboardButton("❌ Rejeitar", callback_data=f"act_rej_{aid}")
                ]
            ]
            markup = InlineKeyboardMarkup(kb)

            if act_type in ("erp_weekly_nfe_inbound", "intranetmall_sales_batch_sync", "intranetmall_sales_sync"):
                txt = (
                    f"📌 <b>Ação:</b> <code>{aid}</code>\n"
                    f"🎯 <b>Canal:</b> {clean_target}\n"
                    f"📝 <b>Resumo:</b> {clean_summary}\n\n"
                    f"{msg_text}"
                )
            else:
                txt = (
                    f"📌 <b>Ação:</b> <code>{aid}</code>\n"
                    f"🎯 <b>Canal:</b> {clean_target}\n"
                    f"📝 <b>Resumo:</b> {clean_summary}\n\n"
                    f"💬 <b>Mensagem Proposta:</b>\n<i>\"{clean_msg}\"</i>"
                )
            await update.message.reply_text(txt, reply_markup=markup, parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Erro ao consultar ações pendentes: {str(e)}")


async def aprovadores_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Lista todos os aprovadores cadastrados que recebem as ações para validação."""
    info = check_or_register_approver(update)
    if not info["allowed"]:
        await update.message.reply_text("⛔ Acesso não autorizado.")
        return

    try:
        r = requests.get(f"{API_URL}/api/telegram/approvers", timeout=5)
        if r.status_code == 200:
            approvers = r.json().get("approvers", [])
            if not approvers:
                await update.message.reply_text("ℹ️ Nenhum aprovador cadastrado no momento.")
                return

            lines = ["👥 <b>Usuários Aprovadores do Telegram:</b>\n"]
            for a in approvers:
                u_str = f"@{a['username']}" if a.get("username") else "—"
                cid_str = a.get("chat_id") or "<i>(aguardando /start)</i>"
                status_icon = "🟢" if (a.get("is_active") and a.get("can_approve")) else ("🟡" if a.get("is_active") else "🔴")
                role_label = "Super Admin" if a.get("role") == "admin" else "Aprovador"
                lines.append(
                    f"{status_icon} <b>{a.get('name', 'Sem Nome')}</b> ({role_label})\n"
                    f"   • Usuário: {u_str}\n"
                    f"   • Chat ID: <code>{cid_str}</code>\n"
                    f"   • Pode aprovar: {'Sim ✅' if a.get('can_approve') else 'Não ❌'}\n"
                )

            lines.append("\n💡 <i>Para cadastrar novos aprovadores, use:</i>\n<code>/add_aprovador @usuario Nome do Colaborador</code>")
            await update.message.reply_text("\n".join(lines), parse_mode="HTML")
        else:
            await update.message.reply_text(f"Erro ao consultar aprovadores: {r.text}")
    except Exception as e:
        await update.message.reply_text(f"❌ Erro ao buscar lista de aprovadores: {e}")


async def add_aprovador_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Cadastra um novo aprovador para receber ações dos agentes (apenas admins)."""
    info = check_or_register_approver(update)
    if info.get("role") != "admin" and str(update.effective_user.id) != "8396341860":
        await update.message.reply_text("⛔ Apenas administradores podem cadastrar novos aprovadores.")
        return

    args = getattr(context, "args", None) or []
    if not args:
        await update.message.reply_text(
            "ℹ️ <b>Uso do comando:</b>\n<code>/add_aprovador @usuario Nome da Pessoa</code>\n\n"
            "Exemplo:\n<code>/add_aprovador @gerente_loja João Silva</code>",
            parse_mode="HTML"
        )
        return

    target_user = args[0].strip().lstrip('@')
    name = " ".join(args[1:]).strip() if len(args) > 1 else target_user

    try:
        r = requests.post(
            f"{API_URL}/api/telegram/approvers",
            json={
                "username": target_user,
                "name": name,
                "role": "approver",
                "can_approve": True,
                "is_active": True,
                "added_by": f"@{update.effective_user.username or update.effective_user.first_name}"
            },
            timeout=5
        )
        if r.status_code == 200:
            await update.message.reply_text(
                f"✅ <b>Aprovador Cadastrado com Sucesso!</b>\n\n"
                f"👤 <b>Nome:</b> {name}\n"
                f"🏷 <b>Usuário:</b> @{target_user}\n"
                f"🛡️ <b>Permissão:</b> Pode validar e aprovar ações\n\n"
                f"💡 <i>Peça para @{target_user} enviar uma mensagem ou <code>/start</code> para este bot para ativar o recebimento das notificações.</i>",
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text(f"❌ Falha ao cadastrar: {r.text}")
    except Exception as e:
        await update.message.reply_text(f"❌ Erro ao registrar aprovador: {e}")


async def remover_aprovador_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Remove um aprovador cadastrado (apenas admins)."""
    info = check_or_register_approver(update)
    if info.get("role") != "admin" and str(update.effective_user.id) != "8396341860":
        await update.message.reply_text("⛔ Apenas administradores podem remover aprovadores.")
        return

    args = getattr(context, "args", None) or []
    if not args:
        await update.message.reply_text("ℹ️ <b>Uso:</b> <code>/remover_aprovador @usuario</code>", parse_mode="HTML")
        return

    target_user = args[0].strip().lower().lstrip('@')
    try:
        r = requests.get(f"{API_URL}/api/telegram/approvers", timeout=5)
        if r.status_code == 200:
            approvers = r.json().get("approvers", [])
            match = next((a for a in approvers if (a.get("username") or "").lower().lstrip('@') == target_user), None)
            if match:
                if match.get("role") == "admin" and str(match.get("chat_id")) == "8396341860":
                    await update.message.reply_text("⚠️ Não é permitido remover o administrador principal.")
                    return
                del_r = requests.delete(f"{API_URL}/api/telegram/approvers/{match['id']}", timeout=5)
                if del_r.status_code == 200:
                    await update.message.reply_text(f"🗑️ Aprovador @{target_user} ({match.get('name')}) foi removido.")
                else:
                    await update.message.reply_text(f"Erro ao excluir: {del_r.text}")
            else:
                await update.message.reply_text(f"❌ Nenhum aprovador encontrado com o usuário @{target_user}.")
    except Exception as e:
        await update.message.reply_text(f"❌ Erro: {e}")


async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not is_user_allowed(update):
        await query.edit_message_text("⛔ Acesso não autorizado.")
        return

    data = query.data
    username = update.effective_user.username or update.effective_user.first_name or "Admin"
    register_chat_id(str(update.effective_chat.id))

    if data.startswith("act_appr_"):
        action_id = data.replace("act_appr_", "")
        await query.edit_message_text(f"⏳ Processando aprovação de <code>{action_id}</code> por @{username}...", parse_mode="HTML")

        try:
            resp = requests.post(
                f"{API_URL}/api/actions/{action_id}/approve",
                json={"approved_by": f"@{username}"},
                timeout=240
            )
            res_data = resp.json()
            if res_data.get("already_resolved"):
                await query.edit_message_text(f"ℹ️ {res_data.get('message')}", parse_mode="HTML")
                return

            if resp.status_code == 200 and res_data.get("status") == "ok":
                msg_feed = res_data.get("message", "Ação executada com sucesso!")
                clean_feed = str(msg_feed).replace("<", "&lt;").replace(">", "&gt;")
                await query.edit_message_text(
                    f"✅ <b>AÇÃO APROVADA E EXECUTADA!</b>\n\n"
                    f"👤 <b>Aprovado por:</b> @{username}\n"
                    f"🚀 <b>Resultado:</b> {clean_feed}\n\n"
                    f"ID: <code>{action_id}</code>",
                    parse_mode="HTML"
                )
            else:
                err = res_data.get("message") or res_data.get("error") or resp.text
                await query.edit_message_text(
                    f"⚠️ <b>Aprovação registrada, mas ocorreu falha na execução:</b>\n<code>{err}</code>",
                    parse_mode="HTML"
                )
        except Exception as e:
            await query.edit_message_text(f"❌ Erro de comunicação ao aprovar ação: {str(e)}")

    elif data.startswith("act_rej_"):
        action_id = data.replace("act_rej_", "")
        try:
            resp = requests.post(
                f"{API_URL}/api/actions/{action_id}/reject",
                json={"rejected_by": f"@{username}"},
                timeout=8
            )
            res_data = resp.json()
            if res_data.get("already_resolved"):
                await query.edit_message_text(f"ℹ️ {res_data.get('message')}", parse_mode="HTML")
                return

            await query.edit_message_text(
                f"❌ <b>AÇÃO REJEITADA</b>\n\n"
                f"👤 <b>Decisão por:</b> @{username}\n"
                f"ℹ️ A ação <code>{action_id}</code> foi cancelada. Nenhuma mensagem ou alteração foi enviada.",
                parse_mode="HTML"
            )
        except Exception as e:
            await query.edit_message_text(f"❌ Erro ao rejeitar ação: {str(e)}")

    elif data.startswith("auth_appr_"):
        parts = data.replace("auth_appr_", "").split("_", 1)
        req_id = parts[0]
        req_user = parts[1] if len(parts) > 1 else ""
        try:
            requests.post(
                f"{API_URL}/api/telegram/approvers",
                json={
                    "chat_id": req_id,
                    "username": req_user,
                    "name": f"@{req_user}" if req_user else f"ID {req_id}",
                    "role": "approver",
                    "can_approve": True,
                    "is_active": True,
                    "added_by": f"@{username}"
                },
                timeout=5
            )
            await query.edit_message_text(
                f"✅ Usuário @{req_user} (ID <code>{req_id}</code>) foi AUTORIZADO como Aprovador por @{username}!",
                parse_mode="HTML"
            )
            requests.post(
                f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                json={
                    "chat_id": req_id,
                    "text": f"🎉 <b>Acesso Liberado!</b>\n\nSeu usuário foi autorizado por @{username}. A partir de agora você também receberá solicitações para validação e aprovação de ações dos agentes!",
                    "parse_mode": "HTML"
                },
                timeout=5
            )
        except Exception as e:
            await query.edit_message_text(f"❌ Erro ao autorizar usuário: {e}")

    elif data.startswith("auth_deny_"):
        req_id = data.replace("auth_deny_", "")
        await query.edit_message_text(f"❌ Solicitação de acesso do ID <code>{req_id}</code> foi recusada.", parse_mode="HTML")

    elif data in ("set_mode_approval", "set_mode_autonomous"):
        want_approval = (data == "set_mode_approval")
        try:
            requests.post(
                f"{API_URL}/api/settings/approval-mode",
                json={"require_action_approval": want_approval},
                timeout=5
            )
            if want_approval:
                txt = (
                    "🛡️ <b>Modo de Validação ATIVADO</b>\n\n"
                    "Todas as respostas e ações sugeridas pelos agentes exigirão sua confirmação via botão antes do envio."
                )
            else:
                txt = (
                    "⚡ <b>Modo Autônomo ATIVADO</b>\n\n"
                    "Os agentes agora executarão as ações e respostas sugeridas automaticamente, sem aguardar aprovação."
                )
            await query.edit_message_text(txt, parse_mode="HTML")
        except Exception as e:
            await query.edit_message_text(f"❌ Erro ao alternar modo: {str(e)}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_user_allowed(update):
        await update.message.reply_text("⛔ Acesso não autorizado.")
        return

    chat_id = str(update.effective_chat.id)
    register_chat_id(chat_id)

    raw_text = (update.message.text or "").strip()
    if not raw_text:
        return

    # Normalização de comandos (suporta acentos como /aprovação)
    clean_cmd = raw_text.lower().replace("ç", "c").replace("ã", "a").replace("á", "a").replace("é", "e").replace("ó", "o").replace("ô", "o").strip()

    if clean_cmd.startswith("/aprovacao") or clean_cmd.startswith("/validacao") or clean_cmd.startswith("/autonomo") or clean_cmd.startswith("/modo"):
        parts = clean_cmd.split()
        context.args = parts[1:] if len(parts) > 1 else []
        await aprovacao_command(update, context)
        return
    elif clean_cmd.startswith("/pendente") or clean_cmd.startswith("/acoes"):
        await pendentes_command(update, context)
        return
    elif clean_cmd.startswith("/aprovador") or clean_cmd.startswith("/usuarios"):
        await aprovadores_command(update, context)
        return
    elif clean_cmd.startswith("/add_aprovador") or clean_cmd.startswith("/adicionar_aprovador"):
        parts = raw_text.split()
        context.args = parts[1:] if len(parts) > 1 else []
        await add_aprovador_command(update, context)
        return
    elif clean_cmd.startswith("/remover_aprovador") or clean_cmd.startswith("/del_aprovador"):
        parts = raw_text.split()
        context.args = parts[1:] if len(parts) > 1 else []
        await remover_aprovador_command(update, context)
        return
    elif clean_cmd.startswith("/mapear_nfe") or clean_cmd.startswith("/mapear"):
        parts = raw_text.split()
        context.args = parts[1:] if len(parts) > 1 else []
        await mapear_nfe_command(update, context)
        return
    elif clean_cmd.startswith("/nfe_semana") or clean_cmd.startswith("/entrada_nfe"):
        await nfe_semana_command(update, context)
        return
    elif clean_cmd.startswith("/status"):
        await status_command(update, context)
        return
    elif clean_cmd.startswith("/resumo"):
        await resumo_command(update, context)
        return
    elif clean_cmd.startswith("/start") or clean_cmd.startswith("/help") or clean_cmd.startswith("/ajuda"):
        await start_command(update, context)
        return
    elif clean_cmd.startswith("/"):
        cmd_name = raw_text.split()[0]
        await update.message.reply_text(
            f"❓ Comando <code>{cmd_name}</code> não reconhecido.\n\n"
            "• Para alternar modo de validação: /aprovacao\n"
            "• Para ver ações pendentes: /pendentes\n"
            "• Para auditar NF-e da semana (0 tokens): /nfe_semana\n"
            "• Para mapear item De-Para (0 tokens): /mapear_nfe\n"
            "• Para gerenciar aprovadores: /aprovadores\n"
            "• Para ver status: /status\n"
            "• Para consultar os agentes, envie sua dúvida normalmente sem a barra (/).",
            parse_mode="HTML"
        )
        return

    await handle_prompt(update, raw_text)


async def mapear_nfe_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Registra um mapeamento De-Para de item de NF-e no New Choice ERP com 0 tokens LLM."""
    if not is_user_allowed(update):
        await update.message.reply_text("⛔ Acesso não autorizado.")
        return

    register_chat_id(str(update.effective_chat.id))
    args = getattr(context, "args", None) or []
    if len(args) < 3:
        await update.message.reply_text(
            "📦 <b>Mapeamento De-Para de Item de NF-e (Zero Tokens)</b>\n\n"
            "ℹ️ <b>Uso:</b>\n"
            "<code>/mapear_nfe &lt;fornecedor_ou_cnpj&gt; &lt;cod_item&gt; &lt;ref_erp&gt; [fator_conversao]</code>\n\n"
            "<b>Exemplos:</b>\n"
            "• <code>/mapear_nfe thiluc 1182 10035 250</code>\n"
            "• <code>/mapear_nfe 04148303000185 49530 10003 3960</code>\n"
            "• <code>/mapear_nfe guanabara 1045499 10013 450</code>",
            parse_mode="HTML"
        )
        return

    supplier_key = args[0].strip()
    supplier_item_code = args[1].strip()
    erp_ref = args[2].strip()
    try:
        conversion_factor = float(args[3].strip().replace(",", ".")) if len(args) >= 4 else 1.0
    except Exception:
        conversion_factor = 1.0
    desc = " ".join(args[4:]).strip() if len(args) >= 5 else ""

    try:
        r = requests.post(
            f"{API_URL}/api/erp/nfe-mapping",
            json={
                "supplier_key": supplier_key,
                "supplier_item_code": supplier_item_code,
                "erp_ref": erp_ref,
                "conversion_factor": conversion_factor,
                "supplier_item_desc": desc,
            },
            timeout=15
        )
        res_data = r.json()
        if r.status_code == 200 and res_data.get("success"):
            await update.message.reply_text(
                f"{res_data.get('message')}\n\n"
                f"💡 <i>Para revalidar as NF-e da semana com o novo mapeamento (0 tokens), envie:</i> <code>/nfe_semana</code>",
                parse_mode="HTML"
            )
        else:
            err = res_data.get("message") or res_data.get("detail") or r.text
            await update.message.reply_text(f"❌ Falha ao registrar mapeamento: {err}", parse_mode="HTML")
    except Exception as e:
        await update.message.reply_text(f"❌ Erro ao registrar mapeamento: {e}")


async def nfe_semana_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Dispara a rotina determinística (0 tokens LLM) de auditoria e entrada semanal de NF-e no New Choice ERP."""
    if not is_user_allowed(update):
        await update.message.reply_text("⛔ Acesso não autorizado.")
        return

    chat_id = str(update.effective_chat.id)
    register_chat_id(chat_id)
    username = update.effective_user.username or update.effective_user.first_name or "Admin"

    await update.message.reply_text(
        "📦 <b>Iniciando Auditoria Semanal de NF-e Destinadas (SEFAZ + New Choice ERP)</b>\n"
        "⚡ <i>Modo Determinístico Zero-Token (0 tokens LLM / R$ 0,00)...</i>",
        parse_mode="HTML"
    )
    try:
        resp = requests.post(
            f"{API_URL}/api/tasks",
            json={
                "crew_name": "operational",
                "prompt": "[EXECUÇÃO PROGRAMADA AUTOMÁTICA - Gestor de Estoque, Insumos & Auditor do New Choice ERP]: Executar ERP_Weekly_NFe_Inbound_Audit — Auditoria e Entrada Semanal de NF-e de Compra da Semana no New Choice ERP.",
                "requester": f"telegram:{username}:task-coo-saturday-nfe-inbound",
                "telegram_chat_id": chat_id
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            task_id = data["task_id"]
            await update.message.reply_text(
                f"🚀 Varredura iniciada em segundo plano (ID: <code>{task_id}</code>).\n"
                f"Em instantes você receberá o resumo das NF-e com os botões de aprovação e alertas de mapeamento!",
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text(f"❌ Erro ao iniciar varredura: {resp.text}")
    except Exception as e:
        await update.message.reply_text(f"❌ Falha de comunicação com o backend: {e}")


async def handle_prompt(update: Update, prompt: str):
    chat_id = str(update.effective_chat.id)
    register_chat_id(chat_id)
    username = update.effective_user.username or update.effective_user.first_name

    await update.message.reply_text("⏳ <b>Recebi sua solicitação!</b> Acionando a equipe de Agentes CrewAI...", parse_mode="HTML")

    try:
        resp = requests.post(
            f"{API_URL}/api/tasks",
            json={
                "crew_name": "operational",
                "prompt": prompt,
                "requester": f"telegram:{username}",
                "telegram_chat_id": chat_id
            },
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            task_id = data["task_id"]
            await update.message.reply_text(
                f"🚀 Tarefa iniciada em segundo plano! ID: <code>{task_id}</code>.\nAssim que os agentes terminarem a pesquisa, enviarei a resposta completa aqui.",
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text(f"❌ Erro ao enfileirar tarefa: {resp.text}")
    except Exception as e:
        await update.message.reply_text(f"❌ Falha de comunicação com o backend: {str(e)}")


def main():
    if not TOKEN or "your_telegram" in TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN não configurado. Serviço do Telegram pausado.")
        return

    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("status", status_command))
    app.add_handler(CommandHandler("resumo", resumo_command))
    app.add_handler(CommandHandler("aprovacao", aprovacao_command))
    app.add_handler(CommandHandler("modo", aprovacao_command))
    app.add_handler(CommandHandler("validacao", aprovacao_command))
    app.add_handler(CommandHandler("autonomo", aprovacao_command))
    app.add_handler(CommandHandler("pendentes", pendentes_command))
    app.add_handler(CommandHandler("aprovadores", aprovadores_command))
    app.add_handler(CommandHandler("add_aprovador", add_aprovador_command))
    app.add_handler(CommandHandler("adicionar_aprovador", add_aprovador_command))
    app.add_handler(CommandHandler("remover_aprovador", remover_aprovador_command))
    app.add_handler(CommandHandler("mapear_nfe", mapear_nfe_command))
    app.add_handler(CommandHandler("mapear", mapear_nfe_command))
    app.add_handler(CommandHandler("nfe_semana", nfe_semana_command))
    app.add_handler(CommandHandler("entrada_nfe", nfe_semana_command))
    app.add_handler(CallbackQueryHandler(handle_callback_query))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("Bot do Telegram iniciado e aguardando mensagens...")
    app.run_polling()


if __name__ == "__main__":
    main()
