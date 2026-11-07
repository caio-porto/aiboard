"""Ferramenta de Alerta, Formatação Limpa (Anti-Markdown Cru) e Notificação no Telegram para Agentes Autônomos (CrewAI)."""
import os
import re
import time
import sqlite3
import logging
import requests
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Type, Optional, List, Tuple
from pydantic import BaseModel, Field
from crewai.tools import BaseTool

logger = logging.getLogger(__name__)
BRT = ZoneInfo("America/Sao_Paulo")
DB_PATH = os.getenv("TASKS_DB_PATH", "/opt/crewai/data/tasks.db")
if not os.path.exists(os.path.dirname(DB_PATH)) and not os.path.isabs(DB_PATH):
    DB_PATH = "tasks.db"


def _strip_md_inline(s: str) -> str:
    """Remove marcadores Markdown básicos de uma célula para checagem/título."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"__(.+?)__", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    return s.strip()


def _convert_markdown_tables_to_cards(text: str, target: str = "telegram_html") -> str:
    """Converte tabelas pipe do Markdown (| Col1 | Col2 |) em cartões verticais legíveis no celular."""
    lines = text.split("\n")
    out_lines: List[str] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].strip()
        # Verifica se é início de tabela Markdown (linha com | e linha seguinte separadora | :--- |)
        if (
            line.startswith("|")
            and line.endswith("|")
            and i + 1 < n
            and re.match(r"^\|\s*[:\-| ]+\|\s*$", lines[i + 1].strip())
        ):
            headers = [_strip_md_inline(c.strip()) for c in line.strip("|").split("|")]
            i += 2  # pula cabeçalho e linha separadora
            table_cards: List[str] = []

            while i < n and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                row_line = lines[i].strip()
                if re.match(r"^\|\s*[:\-| ]+\|\s*$", row_line):
                    i += 1
                    continue
                cells = [c.strip() for c in row_line.strip("|").split("|")]
                if not any(cells):
                    i += 1
                    continue

                if len(headers) == 2 and len(cells) >= 2:
                    k = _strip_md_inline(cells[0])
                    v = cells[1]
                    if target == "telegram_html":
                        table_cards.append(f"• <b>{k}:</b> {v}")
                    else:
                        table_cards.append(f"• *{k}:* {v}")
                elif len(cells) >= 2:
                    c0 = _strip_md_inline(cells[0])
                    c1 = _strip_md_inline(cells[1])
                    if target == "telegram_html":
                        card_lines = [f"▸ <b>{c0} — {c1}</b>"]
                        for idx in range(2, len(cells)):
                            val = cells[idx].strip()
                            if not val or val == "—":
                                continue
                            h_label = headers[idx] if idx < len(headers) and headers[idx] else f"Item {idx + 1}"
                            card_lines.append(f"   • <b>{h_label}:</b> {val}")
                        table_cards.append("\n".join(card_lines))
                    else:
                        card_lines = [f"▸ *{c0} — {c1}*"]
                        for idx in range(2, len(cells)):
                            val = _strip_md_inline(cells[idx].strip())
                            if not val or val == "—":
                                continue
                            h_label = headers[idx] if idx < len(headers) and headers[idx] else f"Item {idx + 1}"
                            card_lines.append(f"   • {h_label}: {val}")
                        table_cards.append("\n".join(card_lines))
                else:
                    table_cards.append(f"• {cells[0]}")
                i += 1

            if table_cards:
                out_lines.append("\n\n".join(table_cards))
            continue

        out_lines.append(lines[i])
        i += 1

    return "\n".join(out_lines)


def format_markdown_for_telegram_html(text: str) -> str:
    """Converte qualquer texto com sintaxe Markdown (###, **, `, tabelas |---|) em HTML nativo e limpo para o Telegram."""
    if not text:
        return ""

    s = str(text).replace("\r\n", "\n")

    # 1. Converte tabelas Markdown em cartões verticais mobile-friendly antes de processar tags
    s = _convert_markdown_tables_to_cards(s, target="telegram_html")

    # 2. Protege blocos de código ```...```
    code_blocks: List[str] = []

    def _stash_pre(m):
        idx = len(code_blocks)
        inner = m.group(1).strip("\n")
        inner_esc = inner.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        code_blocks.append(f"<pre>{inner_esc}</pre>")
        return f"\x00PREBLOCK{idx}\x00"

    s = re.sub(r"```(?:[a-zA-Z0-9_-]+)?\n?(.*?)```", _stash_pre, s, flags=re.S)

    # 3. Protege inline code `...`
    inline_codes: List[str] = []

    def _stash_code(m):
        idx = len(inline_codes)
        inner_esc = m.group(1).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        inline_codes.append(f"<code>{inner_esc}</code>")
        return f"\x00CODEINLINE{idx}\x00"

    s = re.sub(r"`([^`\n]+)`", _stash_code, s)

    # 4. Protege tags HTML válidas do Telegram já existentes no texto
    valid_tags: List[str] = []

    def _stash_tag(m):
        idx = len(valid_tags)
        raw_tag = m.group(0)
        # Normaliza strong/em para b/i
        norm = re.sub(r"^<(/?)strong>", r"<\1b>", raw_tag, flags=re.I)
        norm = re.sub(r"^<(/?)em>", r"<\1i>", norm, flags=re.I)
        valid_tags.append(norm)
        return f"\x00HTMLTAG{idx}\x00"

    s = re.sub(
        r"</?(?:b|strong|i|em|u|s|strike|del|code|pre)>|<a\s+href=[\"'][^\"']+[\"']>|<\/a>",
        _stash_tag,
        s,
        flags=re.I,
    )

    # 5. Escapa &, <, > remanescentes para não quebrar o parse_mode="HTML" do Telegram
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # 6. Converte Links Markdown [texto](url)
    s = re.sub(
        r"\[([^\]]+)\]\((https?://[^\s\)]+)\)",
        r'<a href="\2">\1</a>',
        s,
    )

    # 7. Converte Cabeçalhos Markdown (#, ##, ###, ####) e linhas divisórias (---)
    formatted_lines: List[str] = []
    for line in s.split("\n"):
        stripped = line.strip()
        if re.match(r"^(?:---+|\*\*\*+|___+)$", stripped):
            formatted_lines.append("────────────────────")
            continue

        m_h12 = re.match(r"^#{1,2}\s+(.+)$", stripped)
        if m_h12:
            title_clean = _strip_md_inline(m_h12.group(1))
            formatted_lines.append(f"\n━━━━━━━━━━━━━━━━━━━━\n🏛 <b>{title_clean}</b>")
            continue

        m_h3 = re.match(r"^#{3}\s+(.+)$", stripped)
        if m_h3:
            title_clean = _strip_md_inline(m_h3.group(1))
            formatted_lines.append(f"\n📌 <b>{title_clean}</b>")
            continue

        m_h4 = re.match(r"^#{4,6}\s+(.+)$", stripped)
        if m_h4:
            title_clean = _strip_md_inline(m_h4.group(1))
            formatted_lines.append(f"\n🔹 <b>{title_clean}</b>")
            continue

        # Converte listas Markdown (- item ou * item)
        m_bullet = re.match(r"^(\s*)[-*]\s+(.+)$", line)
        if m_bullet:
            indent = len(m_bullet.group(1))
            content = m_bullet.group(2)
            prefix = "   ◦ " if indent >= 2 else "• "
            formatted_lines.append(f"{prefix}{content}")
            continue

        # Remove citações > no início da linha
        m_quote = re.match(r"^&gt;\s*(.+)$", stripped)
        if m_quote:
            formatted_lines.append(f"💬 <i>{m_quote.group(1)}</i>")
            continue

        formatted_lines.append(line)

    s = "\n".join(formatted_lines)

    # 8. Converte Negrito (**texto** ou __texto__), Itálico (*texto*) e Tachado (~~texto~~)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s, flags=re.S)
    s = re.sub(r"__(.+?)__", r"<b>\1</b>", s, flags=re.S)
    s = re.sub(r"(?<!\*)\*([^\*\n]+?)\*(?!\*)", r"<i>\1</i>", s)
    s = re.sub(r"~~(.+?)~~", r"<s>\1</s>", s)

    # 9. Restaura tags HTML, inline codes e code blocks
    for idx, tag in enumerate(valid_tags):
        s = s.replace(f"\x00HTMLTAG{idx}\x00", tag)
    for idx, ic in enumerate(inline_codes):
        s = s.replace(f"\x00CODEINLINE{idx}\x00", ic)
    for idx, cb in enumerate(code_blocks):
        s = s.replace(f"\x00PREBLOCK{idx}\x00", cb)

    # Limpa excesso de quebras de linha
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s


def split_telegram_html_chunks(html_text: str, max_len: int = 3800) -> List[str]:
    """Divide mensagens longas em partes seguras por quebra de linha sem cortar palavras ou tags HTML."""
    if not html_text:
        return [""]
    if len(html_text) <= max_len:
        return [html_text]

    chunks: List[str] = []
    current_lines: List[str] = []
    current_len = 0

    for line in html_text.split("\n"):
        line_len = len(line) + 1
        if current_len + line_len > max_len and current_lines:
            chunks.append("\n".join(current_lines).strip())
            current_lines = [line]
            current_len = line_len
        else:
            current_lines.append(line)
            current_len += line_len

    if current_lines:
        chunks.append("\n".join(current_lines).strip())

    return chunks or [html_text[:max_len]]


def format_markdown_for_plain_messaging(text: str) -> str:
    """Converte Markdown para formato limpo de WhatsApp / Chatwoot (sem ###, sem ** e sem tabelas pipe)."""
    if not text:
        return ""
    s = str(text).replace("\r\n", "\n")
    s = _convert_markdown_tables_to_cards(s, target="plain")
    s = re.sub(r"^#{1,6}\s+(.+)$", lambda m: f"\n📌 *{_strip_md_inline(m.group(1))}*", s, flags=re.M)
    s = re.sub(r"^\s*(?:---+|\*\*\*+|___+)\s*$", "────────────────────", s, flags=re.M)
    s = re.sub(r"\*\*(.+?)\*\*", r"*\1*", s)
    s = re.sub(r"__(.+?)__", r"*\1*", s)
    s = re.sub(r"`([^`\n]+)`", r"\1", s)
    s = re.sub(r"^\s*[-*]\s+", "• ", s, flags=re.M)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s


def format_markdown_for_email(text: str) -> Tuple[str, str]:
    """Converte um texto Markdown em (plain_text_limpo, html_corporativo_estilizado) para envio por e-mail."""
    if not text:
        return "", ""

    plain = format_markdown_for_plain_messaging(text).replace("*", "")

    lines = str(text).replace("\r\n", "\n").split("\n")
    html_parts: List[str] = []
    i = 0
    n = len(lines)

    def _inline_md_to_html(line_str: str) -> str:
        esc = line_str.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        esc = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", esc)
        esc = re.sub(r"__(.+?)__", r"<strong>\1</strong>", esc)
        esc = re.sub(r"(?<!\*)\*([^\*\n]+?)\*(?!\*)", r"<em>\1</em>", esc)
        esc = re.sub(
            r"`([^`]+)`",
            r'<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-family:monospace;">\1</code>',
            esc,
        )
        esc = re.sub(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)", r'<a href="\2" style="color:#0f766e;">\1</a>', esc)
        return esc

    while i < n:
        stripped = lines[i].strip()
        # Tabela Markdown -> Tabela HTML real
        if (
            stripped.startswith("|")
            and stripped.endswith("|")
            and i + 1 < n
            and re.match(r"^\|\s*[:\-| ]+\|\s*$", lines[i + 1].strip())
        ):
            headers = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2
            tbl = [
                '<table style="border-collapse:collapse;width:100%;margin:14px 0;font-size:13px;border:1px solid #cbd5e1;">',
                '<thead><tr style="background:#0f3d3e;color:#ffffff;text-align:left;">',
            ]
            for h in headers:
                tbl.append(f'<th style="padding:8px 10px;border:1px solid #cbd5e1;">{_inline_md_to_html(h)}</th>')
            tbl.append("</tr></thead><tbody>")
            row_idx = 0
            while i < n and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                r_line = lines[i].strip()
                if re.match(r"^\|\s*[:\-| ]+\|\s*$", r_line):
                    i += 1
                    continue
                cells = [c.strip() for c in r_line.strip("|").split("|")]
                bg = "#ffffff" if row_idx % 2 == 0 else "#f8fafc"
                tbl.append(f'<tr style="background:{bg};">')
                for c in cells:
                    tbl.append(f'<td style="padding:8px 10px;border:1px solid #e2e8f0;">{_inline_md_to_html(c)}</td>')
                tbl.append("</tr>")
                row_idx += 1
                i += 1
            tbl.append("</tbody></table>")
            html_parts.append("".join(tbl))
            continue

        if not stripped:
            html_parts.append("<br/>")
            i += 1
            continue

        if re.match(r"^(?:---+|\*\*\*+|___+)$", stripped):
            html_parts.append('<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"/>')
            i += 1
            continue

        m_h = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if m_h:
            lvl = min(len(m_h.group(1)), 4)
            sizes = {1: "20px", 2: "18px", 3: "16px", 4: "14px"}
            html_parts.append(
                f'<h{lvl} style="color:#0f3d3e;font-size:{sizes[lvl]};margin:16px 0 8px 0;">{_inline_md_to_html(m_h.group(2))}</h{lvl}>'
            )
            i += 1
            continue

        m_li = re.match(r"^(\s*)[-*]\s+(.+)$", lines[i])
        if m_li:
            margin_left = "24px" if len(m_li.group(1)) >= 2 else "8px"
            html_parts.append(
                f'<div style="margin:4px 0 4px {margin_left};">• {_inline_md_to_html(m_li.group(2))}</div>'
            )
            i += 1
            continue

        html_parts.append(f'<p style="margin:6px 0;line-height:1.5;">{_inline_md_to_html(lines[i])}</p>')
        i += 1

    styled_html = (
        '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#1e293b;max-width:720px;line-height:1.5;">'
        + "\n".join(html_parts)
        + "</div>"
    )
    return plain, styled_html


def get_configured_telegram_recipients(target_chat_id: Optional[str] = None) -> List[str]:
    """Retorna a lista de chat_ids configurados para receber alertas e relatórios no Telegram."""
    recipients = set()
    if target_chat_id:
        recipients.add(str(target_chat_id).strip())
        return list(recipients)

    try:
        db_candidates = [
            DB_PATH,
            "/opt/crewai/data/tasks.db",
            os.path.join(os.getcwd(), "data", "tasks.db"),
            "tasks.db",
        ]
        target_db = next((p for p in db_candidates if os.path.exists(p)), None)
        if target_db:
            with sqlite3.connect(target_db) as conn:
                cur = conn.cursor()
                cur.execute("SELECT value FROM system_settings WHERE key = 'telegram_default_chat_id'")
                row = cur.fetchone()
                if row and row[0]:
                    recipients.add(str(row[0]).strip())

                cur.execute("SELECT chat_id FROM telegram_approvers WHERE is_active = 1 AND can_approve = 1")
                for r in cur.fetchall():
                    if r and r[0]:
                        recipients.add(str(r[0]).strip())
    except Exception as e:
        logger.warning(f"Erro ao buscar destinatários no DB: {e}")

    env_def = os.getenv("TELEGRAM_DEFAULT_CHAT_ID")
    if env_def:
        recipients.add(str(env_def).strip())

    return list(recipients)


def send_telegram_document(
    file_bytes: bytes,
    filename: str,
    caption: str = "",
    target_chat_id: Optional[str] = None,
) -> bool:
    """Envia um documento (ex: PDF de circular ou boleto) diretamente para o Telegram com legenda em HTML."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not file_bytes:
        return False

    recipients = get_configured_telegram_recipients(target_chat_id)
    if not recipients:
        return False

    clean_caption = format_markdown_for_telegram_html(caption)[:1000] if caption else ""
    url = f"https://api.telegram.org/bot{token}/sendDocument"
    sent_any = False

    for cid in recipients:
        try:
            files = {"document": (filename, file_bytes, "application/pdf")}
            data = {"chat_id": cid}
            if clean_caption:
                data["caption"] = clean_caption
                data["parse_mode"] = "HTML"
            resp = requests.post(url, data=data, files=files, timeout=20)
            if resp.status_code == 200:
                sent_any = True
            else:
                logger.warning(f"Falha sendDocument Telegram ({resp.status_code}): {resp.text[:150]}")
        except Exception as e:
            logger.warning(f"Erro ao enviar documento Telegram para {cid}: {e}")

    return sent_any


class TelegramAlertInput(BaseModel):
    message: str = Field(
        ...,
        description="Texto completo do alerta ou relatório financeiro/operacional a ser enviado aos gestores no Telegram. Inclua valores, datas, nomes de fornecedores, contas pendentes e sugestão de ação."
    )
    urgency: Optional[str] = Field(
        default="alerta",
        description="Nível de criticidade: 'informativo', 'alerta' ou 'critico'."
    )
    target_chat_id: Optional[str] = Field(
        default=None,
        description="Chat ID específico de destino no Telegram. Se omitido, dispara para o chat padrão configurado e para todos os administradores ativos."
    )


class TelegramAlertTool(BaseTool):
    name: str = "telegram_alert"
    description: str = (
        "Dispara um alerta, notificação urgente ou relatório executivo diretamente para o Telegram dos gestores/fundadores. "
        "Use esta ferramenta sempre que a solicitação do usuário incluir termos como 'avise no Telegram', 'mande um alerta no Telegram', "
        "'notifique no Telegram', ou sempre que identificar contas não pagas, boletos a vencer hoje, divergências de conciliação ou anomalias."
    )
    args_schema: Type[BaseModel] = TelegramAlertInput

    def _run(self, message: str, urgency: str = "alerta", target_chat_id: Optional[str] = None) -> str:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        if not token:
            return "Erro: TELEGRAM_BOT_TOKEN não configurado no ambiente."

        clean_urgency = (urgency or "alerta").lower()
        if clean_urgency in ("critico", "critical", "urgente"):
            icon = "🚨"
            urg_label = "CRÍTICO"
        elif clean_urgency in ("informativo", "info", "sucesso"):
            icon = "ℹ️"
            urg_label = "INFORMATIVO"
        else:
            icon = "⚠️"
            urg_label = "ALERTA OPERACIONAL"

        ts_now = datetime.now(BRT).strftime("%d/%m/%Y às %H:%M")
        brand_label = os.getenv("COMPANY_NAME", "AI BOARD").upper()

        body_html = format_markdown_for_telegram_html(message.strip())
        formatted_text = (
            f"{icon} <b>[{urg_label} - {brand_label}]</b>\n"
            f"📅 <b>Data/Hora:</b> {ts_now} (Brasília)\n"
            f"────────────────────\n\n"
            f"{body_html}"
        )

        recipients = get_configured_telegram_recipients(target_chat_id)
        if not recipients:
            return "Erro: Nenhum destinatário de Telegram configurado no sistema."

        sent_count = 0
        errors = []
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        chunks = split_telegram_html_chunks(formatted_text, max_len=3800)

        for cid in recipients:
            cid_ok = False
            for chunk in chunks:
                try:
                    resp = requests.post(
                        url,
                        json={
                            "chat_id": cid,
                            "text": chunk,
                            "parse_mode": "HTML",
                            "disable_web_page_preview": True,
                        },
                        timeout=10
                    )
                    if resp.status_code == 200:
                        cid_ok = True
                    else:
                        plain_fallback = format_markdown_for_plain_messaging(chunk)
                        fallback_resp = requests.post(
                            url,
                            json={
                                "chat_id": cid,
                                "text": plain_fallback[:3900],
                            },
                            timeout=10
                        )
                        if fallback_resp.status_code == 200:
                            cid_ok = True
                        else:
                            errors.append(f"Chat {cid}: {resp.status_code} - {resp.text[:100]}")
                except Exception as err:
                    errors.append(f"Chat {cid}: {str(err)}")
            if cid_ok:
                sent_count += 1

        if sent_count > 0:
            return f"✅ Alerta enviado com sucesso para {sent_count} destinatário(s) no Telegram (Chat ID: {', '.join(recipients)})!"
        else:
            return f"Falha ao enviar alerta no Telegram. Detalhes: {'; '.join(errors)}"
