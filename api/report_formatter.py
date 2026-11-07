import os
import re
import html
from typing import List, Dict, Any

LOGO_BLACK_URL = os.getenv("COMPANY_LOGO_URL", "/logo.svg")

def markdown_to_html_rich(md_text: str) -> str:
    """
    Converte texto Markdown (incluindo tabelas GFM, títulos, listas, negrito, itálico, código e citações)
    para HTML rico com estilos inline corporativos (compatível com Gmail, Google Docs e Word).
    """
    if not md_text:
        return ""

    text = md_text.replace("\r\n", "\n").strip()
    lines = text.split("\n")
    out_blocks: List[str] = []
    
    def format_inline(s: str) -> str:
        # Escapa HTML básico preservando estrutura antes da formatação inline
        s = html.escape(s)
        # Código inline `code`
        s = re.sub(
            r'`([^`]+)`',
            r'<code style="background:#EFF5F1;color:#16422B;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace;font-size:12px;">\1</code>',
            s
        )
        # Links [label](url)
        s = re.sub(
            r'\[([^\]]+)\]\((https?://[^\)]+)\)',
            r'<a href="\2" style="color:#16422B;font-weight:700;text-decoration:underline;">\1</a>',
            s
        )
        # Negrito + Itálico ***text***
        s = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', s)
        # Negrito **text**
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#16422B;font-weight:700;">\1</strong>', s)
        # Itálico *text* ou _text_
        s = re.sub(r'(?<!\*)\*([^\*\n]+)\*(?!\*)', r'<em style="color:#4A5568;">\1</em>', s)
        return s

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Linha em branco
        if not stripped:
            i += 1
            continue

        # Linha horizontal --- ou ***
        if re.match(r'^(\-{3,}|\*{3,}|_{3,})$', stripped):
            out_blocks.append('<hr style="border:none;border-top:1px solid #E2E8E4;margin:16px 0;" />')
            i += 1
            continue

        # Bloco de código ```
        if stripped.startswith("```"):
            code_lines = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(html.escape(lines[i]))
                i += 1
            i += 1  # pula fechamento ```
            code_html = "\n".join(code_lines)
            out_blocks.append(
                f'<pre style="background:#F8FAF9;border:1px solid #E2E8E4;border-radius:10px;padding:12px;font-family:Consolas,monospace;font-size:12px;color:#1A202C;overflow-x:auto;margin:12px 0;"><code>{code_html}</code></pre>'
            )
            continue

        # Tabela Markdown | col1 | col2 |
        if stripped.startswith("|") and stripped.endswith("|") and "|" in stripped[1:-1]:
            table_lines = []
            while i < n and lines[i].strip().startswith("|") and "|" in lines[i].strip()[1:]:
                table_lines.append(lines[i].strip())
                i += 1

            if len(table_lines) >= 2:
                # Extrai cabeçalho
                header_cells = [c.strip() for c in table_lines[0].strip("|").split("|")]
                # Verifica se a 2ª linha é separadora | :--- | :--- |
                sep_line = table_lines[1].strip("|").replace(" ", "")
                is_sep = all(re.match(r'^:?\-{2,}:?$', c) for c in sep_line.split("|") if c != "")
                data_start_idx = 2 if is_sep else 1

                th_html = "".join(
                    f'<th style="background-color:#16422B;color:#FFFFFF;font-weight:700;text-align:left;padding:10px 14px;border:1px solid #16422B;font-size:13px;">{format_inline(c)}</th>'
                    for c in header_cells
                )
                rows_html = []
                for r_idx, r_line in enumerate(table_lines[data_start_idx:]):
                    cells = [c.strip() for c in r_line.strip("|").split("|")]
                    bg_color = "#FFFFFF" if r_idx % 2 == 0 else "#F8FAF9"
                    td_html = "".join(
                        f'<td style="background-color:{bg_color};color:#1A202C;padding:9px 14px;border:1px solid #E2E8E4;font-size:13px;">{format_inline(c)}</td>'
                        for c in cells
                    )
                    rows_html.append(f"<tr>{td_html}</tr>")

                tbody_str = "".join(rows_html)
                out_blocks.append(
                    f'<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:14px 0;border-radius:10px;overflow:hidden;border:1px solid #E2E8E4;">'
                    f'<thead><tr>{th_html}</tr></thead>'
                    f'<tbody>{tbody_str}</tbody>'
                    f'</table>'
                )
                continue
            else:
                # Apenas 1 linha com pipe
                out_blocks.append(f'<p style="margin:8px 0;line-height:1.6;color:#2D3748;font-size:14px;">{format_inline(table_lines[0])}</p>')
                continue

        # Títulos #, ##, ###, ####
        m_heading = re.match(r'^(#{1,4})\s+(.+)$', stripped)
        if m_heading:
            level = len(m_heading.group(1))
            content_h = format_inline(m_heading.group(2).strip())
            sizes = {1: "20px", 2: "17px", 3: "15px", 4: "14px"}
            out_blocks.append(
                f'<h{level} style="color:#16422B;font-size:{sizes.get(level, "15px")};font-weight:800;margin:16px 0 8px 0;line-height:1.35;">{content_h}</h{level}>'
            )
            i += 1
            continue

        # Blockquote >
        if stripped.startswith(">"):
            q_lines = []
            while i < n and lines[i].strip().startswith(">"):
                q_lines.append(format_inline(lines[i].strip().lstrip(">").strip()))
                i += 1
            out_blocks.append(
                f'<blockquote style="margin:12px 0;padding:10px 14px;background:#EFF5F1;border-left:4px solid #16422B;border-radius:6px;color:#16422B;font-size:13px;">{"<br/>".join(q_lines)}</blockquote>'
            )
            continue

        # Lista não ordenada (-, *, •)
        if re.match(r'^(\-|\*|•)\s+.+$', stripped):
            ul_items = []
            while i < n and re.match(r'^(\-|\*|•)\s+.+$', lines[i].strip()):
                item_txt = re.sub(r'^(\-|\*|•)\s+', '', lines[i].strip())
                ul_items.append(f'<li style="margin:5px 0;line-height:1.55;color:#2D3748;font-size:14px;">{format_inline(item_txt)}</li>')
                i += 1
            out_blocks.append(f'<ul style="margin:10px 0;padding-left:22px;">{"".join(ul_items)}</ul>')
            continue

        # Lista ordenada (1. , 2. )
        if re.match(r'^\d+\.\s+.+$', stripped):
            ol_items = []
            while i < n and re.match(r'^\d+\.\s+.+$', lines[i].strip()):
                item_txt = re.sub(r'^\d+\.\s+', '', lines[i].strip())
                ol_items.append(f'<li style="margin:5px 0;line-height:1.55;color:#2D3748;font-size:14px;">{format_inline(item_txt)}</li>')
                i += 1
            out_blocks.append(f'<ol style="margin:10px 0;padding-left:22px;">{"".join(ol_items)}</ol>')
            continue

        # Parágrafo normal (agrupa linhas consecutivas simples)
        p_lines = []
        while i < n:
            cur_s = lines[i].strip()
            if (
                not cur_s
                or cur_s.startswith("#")
                or cur_s.startswith("|")
                or cur_s.startswith(">")
                or cur_s.startswith("```")
                or re.match(r'^(\-|\*|•)\s+.+$', cur_s)
                or re.match(r'^\d+\.\s+.+$', cur_s)
                or re.match(r'^(\-{3,}|\*{3,}|_{3,})$', cur_s)
            ):
                break
            p_lines.append(format_inline(cur_s))
            i += 1

        if p_lines:
            out_blocks.append(
                f'<p style="margin:10px 0;line-height:1.65;color:#2D3748;font-size:14px;">{"<br/>".join(p_lines)}</p>'
            )

    return "\n".join(out_blocks)


def markdown_to_whatsapp(md_text: str) -> str:
    """
    Converte Markdown padrão (com tabelas GFM, **negrito**, ### títulos) para a sintaxe limpa e legível do WhatsApp:
    - **texto** -> *texto* (negrito do WhatsApp)
    - Tabelas Markdown -> Lista de tópicos estruturados (• Coluna 1: Coluna 2) sem barras '|' ou ':---'
    - ### Título -> *Título*
    """
    if not md_text:
        return ""

    lines = md_text.replace("\r\n", "\n").strip().split("\n")
    out_lines: List[str] = []

    def clean_inline_wa(s: str) -> str:
        # Links [label](url) -> label (url)
        s = re.sub(r'\[([^\]]+)\]\((https?://[^\)]+)\)', r'\1 (\2)', s)
        # Converte **bold** para *bold* (WhatsApp)
        s = re.sub(r'\*\*(.+?)\*\*', r'*\1*', s)
        return s.strip()

    i = 0
    n = len(lines)
    while i < n:
        stripped = lines[i].strip()
        if not stripped:
            if out_lines and out_lines[-1] != "":
                out_lines.append("")
            i += 1
            continue

        # Linha horizontal
        if re.match(r'^(\-{3,}|\*{3,}|_{3,})$', stripped):
            i += 1
            continue

        # Tabela Markdown | col1 | col2 |
        if stripped.startswith("|") and stripped.endswith("|") and "|" in stripped[1:-1]:
            table_lines = []
            while i < n and lines[i].strip().startswith("|") and "|" in lines[i].strip()[1:]:
                table_lines.append(lines[i].strip())
                i += 1

            if len(table_lines) >= 2:
                headers = [re.sub(r'\*+', '', c).strip() for c in table_lines[0].strip("|").split("|")]
                sep_line = table_lines[1].strip("|").replace(" ", "")
                is_sep = all(re.match(r'^:?\-{2,}:?$', c) for c in sep_line.split("|") if c != "")
                data_start = 2 if is_sep else 1

                for r_line in table_lines[data_start:]:
                    cells = [clean_inline_wa(c) for c in r_line.strip("|").split("|")]
                    if not any(cells):
                        continue
                    if len(cells) == 2:
                        # Formato enxuto para 2 colunas: • *Yuri*: 11h30 às 18h50
                        c0 = cells[0] if cells[0].startswith("*") else f"*{cells[0]}*"
                        out_lines.append(f"• {c0}: {cells[1]}")
                    else:
                        # Para 3+ colunas: • *Col1* — Col2: val2 | Col3: val3
                        first_col = cells[0] if cells[0].startswith("*") else f"*{cells[0]}*"
                        details = []
                        for idx_c in range(1, len(cells)):
                            hdr_name = headers[idx_c] if idx_c < len(headers) else ""
                            if hdr_name:
                                details.append(f"{hdr_name}: {cells[idx_c]}")
                            else:
                                details.append(cells[idx_c])
                        out_lines.append(f"• {first_col} — {' | '.join(details)}")
                continue

        # Títulos #, ##, ###
        m_h = re.match(r'^(#{1,4})\s+(.+)$', stripped)
        if m_h:
            title_clean = re.sub(r'\*+', '', m_h.group(2)).strip()
            out_lines.append(f"*{title_clean}*")
            i += 1
            continue

        # Listas - ou *
        if re.match(r'^(\-|\*)\s+.+$', stripped):
            item_body = re.sub(r'^(\-|\*)\s+', '', stripped)
            out_lines.append(f"• {clean_inline_wa(item_body)}")
            i += 1
            continue

        # Nota em itálico *(Nota: ...)* -> _(Nota: ...)_
        if stripped.startswith("*(") and stripped.endswith(")*"):
            inner = stripped[1:-1].strip()
            out_lines.append(f"_{clean_inline_wa(inner)}_")
            i += 1
            continue

        out_lines.append(clean_inline_wa(stripped))
        i += 1

    return "\n".join(out_lines).strip()
