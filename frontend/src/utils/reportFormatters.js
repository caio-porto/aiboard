import { marked } from 'marked';
import { formatBrtDateTime } from './dateUtils';
import { getCurrentLanguage } from '../i18n';

export function getOfficialLogoUrl() {
  try {
    const cached = localStorage.getItem('aiboard_company_config');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.company_logo_url && parsed.company_logo_url !== '/favicon.svg') {
        return parsed.company_logo_url;
      }
    }
  } catch {}
  return '/logo.svg';
}

export function getOfficialBrandName() {
  try {
    const cached = localStorage.getItem('aiboard_company_config');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.company_name) return parsed.company_name;
    }
  } catch {}
  return 'AI Board';
}

export const OFFICIAL_LOGO_URL = '/logo.svg';
export const OFFICIAL_BRAND_NAME = 'AI Board';

/**
 * Converte Markdown (incluindo tabelas GFM, **negrito**, ### títulos) para a sintaxe limpa e legível do WhatsApp:
 * - **texto** -> *texto* (negrito do WhatsApp)
 * - Tabelas Markdown -> Lista de tópicos estruturados (• *Coluna 1*: Coluna 2) sem barras '|' ou ':---'
 * - ### Título -> *Título*
 */
export function markdownToWhatsApp(mdText) {
  if (!mdText) return '';
  const lines = mdText.replace(/\r\n/g, '\n').trim().split('\n');
  const out = [];

  const cleanInline = (s) => {
    if (!s) return '';
    return s
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1 ($2)')
      .replace(/\*\*(.+?)\*\*/g, '*$1*')
      .trim();
  };

  let i = 0;
  const n = lines.length;
  while (i < n) {
    const stripped = lines[i].trim();
    if (!stripped) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      i++;
      continue;
    }
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(stripped)) {
      i++;
      continue;
    }
    // Tabela Markdown | col1 | col2 |
    if (stripped.startsWith('|') && stripped.endsWith('|') && stripped.slice(1, -1).includes('|')) {
      const tableLines = [];
      while (i < n && lines[i].trim().startsWith('|') && lines[i].trim().slice(1).includes('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0]
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.replace(/\*+/g, '').trim());
        const sepLine = tableLines[1].replace(/^\||\|$/g, '').replace(/\s+/g, '');
        const isSep = sepLine
          .split('|')
          .filter(Boolean)
          .every((c) => /^:?\-{2,}:?$/.test(c));
        const startIdx = isSep ? 2 : 1;

        for (let r = startIdx; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => cleanInline(c));
          if (!cells.some(Boolean)) continue;
          if (cells.length === 2) {
            const c0 = cells[0].startsWith('*') ? cells[0] : `*${cells[0]}*`;
            out.push(`• ${c0}: ${cells[1]}`);
          } else {
            const first = cells[0].startsWith('*') ? cells[0] : `*${cells[0]}*`;
            const rest = [];
            for (let c = 1; c < cells.length; c++) {
              const hdr = headers[c] || '';
              rest.push(hdr ? `${hdr}: ${cells[c]}` : cells[c]);
            }
            out.push(`• ${first} — ${rest.join(' | ')}`);
          }
        }
        continue;
      }
    }
    // Títulos #, ##, ###
    const mH = stripped.match(/^(#{1,4})\s+(.+)$/);
    if (mH) {
      const cleanTitle = mH[2].replace(/\*+/g, '').trim();
      out.push(`*${cleanTitle}*`);
      i++;
      continue;
    }
    // Listas - ou *
    if (/^(\-|\*)\s+.+$/.test(stripped)) {
      const itemBody = stripped.replace(/^(\-|\*)\s+/, '');
      out.push(`• ${cleanInline(itemBody)}`);
      i++;
      continue;
    }
    // Notas em itálico *(Nota: ...)* -> _(Nota: ...)_
    if (stripped.startsWith('*(') && stripped.endsWith(')*')) {
      const inner = stripped.slice(1, -1).trim();
      out.push(`_${cleanInline(inner)}_`);
      i++;
      continue;
    }
    out.push(cleanInline(stripped));
    i++;
  }
  return out.join('\n').trim();
}

/**
 * Gera um HTML completo e estilizado (compatível com Microsoft Word e Google Docs)
 * convertendo o Markdown para elementos HTML reais (<table>, <th>, <td>, <strong>, <ul>, etc.)
 * e exibindo a logomarca oficial da AI Board.
 */
export function buildFormattedDocHtml({ taskId, prompt, result, createdAt, userName }) {
  const lang = getCurrentLanguage();
  const brandName = getOfficialBrandName();
  const renderedContent = marked.parse(result || '');
  const styledContent = renderedContent
    .replace(/<table>/g, '<table cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #CBD5E0;">')
    .replace(/<th>/g, '<th style="background-color:#16422B;color:#FFFFFF;font-weight:bold;text-align:left;padding:8px 12px;border:1px solid #16422B;">')
    .replace(/<td>/g, '<td style="padding:8px 12px;border:1px solid #CBD5E0;color:#1A202C;">')
    .replace(/<strong>/g, '<strong style="color:#16422B;font-weight:bold;">');

  const dateStr = createdAt
    ? formatBrtDateTime(createdAt)
    : formatBrtDateTime(new Date());

  const labels = lang === 'en' ? {
    title: `${brandName} - Bulletin #${taskId}`,
    header: `${brandName} — Executive Bulletin`,
    task: 'Task:',
    date: 'Date:',
    requester: 'Requester:',
    request: 'Request:',
    defaultUser: `${brandName} Console`,
    defaultPrompt: 'Operational Query',
    footer: `Generated by ${brandName} Enterprise AI Hub`
  } : lang === 'es' ? {
    title: `${brandName} - Boletín #${taskId}`,
    header: `${brandName} — Boletín Ejecutivo`,
    task: 'Tarea:',
    date: 'Fecha:',
    requester: 'Solicitante:',
    request: 'Solicitud:',
    defaultUser: `Consola ${brandName}`,
    defaultPrompt: 'Consulta Operativa',
    footer: `Generado por ${brandName} Enterprise AI Hub`
  } : {
    title: `${brandName} - Boletim #${taskId}`,
    header: `${brandName} — Boletim Executivo`,
    task: 'Tarefa:',
    date: 'Data:',
    requester: 'Solicitante:',
    request: 'Solicitação:',
    defaultUser: `Console ${brandName}`,
    defaultPrompt: 'Consulta Operacional',
    footer: `Gerado pela Central de Inteligência ${brandName} Enterprise AI Hub`
  };

  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${labels.title}</title>
  <style>
    body { font-family: Arial, Calibri, sans-serif; font-size: 11pt; line-height: 1.55; color: #1A202C; padding: 24px; }
    h1, h2, h3 { color: #16422B; }
    table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
    th { background-color: #16422B; color: #FFFFFF; font-weight: bold; padding: 8pt 10pt; border: 1pt solid #16422B; text-align: left; }
    td { padding: 7pt 10pt; border: 1pt solid #CBD5E0; color: #1A202C; }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:none;border-bottom:2pt solid #16422B;padding-bottom:10pt;margin-bottom:14pt;">
    <tr>
      <td style="border:none;vertical-align:middle;">
        <img src="${getOfficialLogoUrl()}" alt="${brandName}" height="34" style="height:34px;vertical-align:middle;max-width:140px;object-fit:contain;" />
        <span style="font-size:16pt;font-weight:bold;color:#16422B;margin-left:8pt;vertical-align:middle;">${labels.header}</span>
      </td>
      <td style="border:none;text-align:right;vertical-align:middle;font-size:9.5pt;color:#5A6B61;">
        <strong>${labels.task}</strong> #${taskId}<br/>
        <strong>${labels.date}</strong> ${dateStr}
      </td>
    </tr>
  </table>
  <div style="background-color:#F8FAF9;border:1pt solid #E2E8E4;padding:10pt 12pt;border-radius:6pt;margin-bottom:14pt;font-size:10pt;color:#2D3748;">
    <strong>${labels.requester}</strong> ${userName || labels.defaultUser}<br/>
    <strong>${labels.request}</strong> ${prompt || labels.defaultPrompt}
  </div>
  <div style="font-size:11pt;line-height:1.6;">
    ${styledContent}
  </div>
  <hr style="border:none;border-top:1pt solid #E2E8E4;margin-top:20pt;margin-bottom:8pt;" />
  <p style="font-size:8.5pt;color:#718096;text-align:center;">
    ${labels.footer}
  </p>
</body>
</html>`;
}

/**
 * Calcula a estimativa dinamica e padronizada de custo de execucao de uma tarefa (CrewAI + Gemini 3.8 Flash).
 * Garante paridade 100% identica entre o Card de Historico e o Modal \'Ver Logs\'.
 *
 * Precos Oficiais Gemini 3.8 Flash:
 * - Input: .75 / 1.000.000 tokens
 * - Output: .75 / 1.000.000 tokens
 */
export function calculateTaskCost(task, usdBrlRate = 5.65) {
  if (!task) {
    return {
      costUsd: 0,
      costBrl: 0,
      inTokens: 0,
      outTokens: 0,
      costBrlFormatted: '0.00',
      costUsdFormatted: '0.000',
      isCommittee: false
    };
  }

  const prompt = (task.prompt || '').toLowerCase();
  const userName = (task.user_name || '').toLowerCase();

  const dur = task.completed_at && task.started_at
    ? Math.floor(task.completed_at - task.started_at)
    : (task.elapsedSeconds || 0);

  // E comite executivo / rotina multi-agente se for rotina de comite, fechamento financeiro, conciliacao ou rotina longa
  const isCommittee =
    prompt.includes('comite') ||
    prompt.includes('fechamento & conciliacao') ||
    prompt.includes('fechamento & conciliação') ||
    prompt.includes('execucao programada') ||
    prompt.includes('execução programada') ||
    userName.includes('cron') ||
    dur > 120;

  const inTokens = isCommittee ? 25000 : 15000;
  const outTokens = task.result
    ? Math.max(800, Math.round(task.result.length / 4))
    : 1000;

  const costUsd = (inTokens / 1000000) * 0.75 + (outTokens / 1000000) * 3.75;
  const rate = Number(usdBrlRate) || 5.65;
  const costBrl = costUsd * rate;

  return {
    costUsd,
    costBrl,
    inTokens,
    outTokens,
    costBrlFormatted: costBrl.toFixed(2),
    costUsdFormatted: costUsd.toFixed(3),
    isCommittee
  };
}

