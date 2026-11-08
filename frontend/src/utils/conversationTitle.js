/**
 * AI Board • Intelligent Conversation Topic & Title Generator
 * Generates concise, professional, executive-grade titles based on the user prompt and agent response.
 */

const REMOVE_PREFIXES = [
  /^(ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií]|hey|hello|hi)[,!.\s]+/i,
  /^(por favor|gentileza|por gentileza|pfv)[,!.\s]+/i,
  /^(voc[eê] poderia|voc[eê] pode|poderia|pode|gostaria de saber|gostaria de|quero saber|preciso de|preciso que|me ajude com|me ajuda com|me d[aá]|me informe|me mostre|me fale sobre|me diz|diga-me)[,!.\s]+/i,
  /^(como est[aá]|como est[aã]o|como vai|como foi|qual [eé]|quais s[aã]o|quanto foi|quanto est[aá]|quanto deu)[,!.\s]+/i,
  /^(verifique|verificar|analisar|analise|consulte|consultar|checar|cheque|listar|liste|gerar|gere)[,!.\s]+/i,
  /^(os|as|o|a|um|uma|uns|umas)\s+/i
];

const TOPIC_KEYWORDS = [
  { match: /\bintranet\s*mall\b|\bintranetmall\b/i, label: 'Intranet Mall' },
  { match: /\bopera[cç][aã]o\b/i, label: 'Operação' },
  { match: /\bfaturamento\b|\bvendas\b|\breceita\b/i, label: 'Vendas & Faturamento' },
  { match: /\bestoque\b|\binsumo[s]?\b|\bruptura\b/i, label: 'Estoque & Insumos' },
  { match: /\bcaixa\b|\bfechamento\b/i, label: 'Fluxo de Caixa' },
  { match: /\bfinanceiro\b|\bfinanceira\b|\bdre\b|\bmargem\b/i, label: 'Financeiro & DRE' },
  { match: /\bintranet\s*mall\b|\bintranetmall\b/i, label: 'Intranet Mall' },
  { match: /\bcard[aá]pio\b|\bpre[cç]o[s]?\b/i, label: 'Cardápio & Preços' },
  { match: /\bmarketing\b|\btr[aá]fego\b|\bmeta\s*ads\b|\bgoogle\s*ads\b|\bcampanha[s]?\b/i, label: 'Marketing & Ads' },
  { match: /\bfornecedor(es)?\b|\bcompras\b/i, label: 'Compras & Fornecedores' },
  { match: /\brh\b|\bcolaborador(es)?\b|\bponto\b|\bescala\b/i, label: 'RH & Equipe' },
  { match: /\bauditoria\b|\bdiscrep[aâ]ncia[s]?\b/i, label: 'Auditoria Operacional' },
  { match: /\bchatwoot\b|\batendimento\b|\bcliente[s]?\b/i, label: 'Atendimento ao Cliente' },
  { match: /\bfreescout\b|\bchamado[s]?\b|\bticket[s]?\b/i, label: 'Helpdesk & Chamados' }
];

/**
 * Capitalizes text nicely into a title
 */
function toTitleCase(str) {
  if (!str) return '';
  const lowerWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'no', 'na', 'nos', 'nas', 'por', 'a', 'o', 'as', 'os', 'of', 'and', 'the', 'in', 'on', 'to', 'for']);
  
  const words = str.split(/\s+/).filter(Boolean);
  return words
    .map((w, idx) => {
      const clean = w.toLowerCase();
      if (idx > 0 && lowerWords.has(clean)) {
        return clean;
      }
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .join(' ');
}

/**
 * Generates an executive, topic-focused title for a chat session.
 * @param {string} prompt - The user's prompt text
 * @param {string} [agentResponse] - Optional agent response to extract deeper context
 * @returns {string} Clean, concise conversation title
 */
export function generateConversationTitle(prompt, agentResponse = '') {
  if (!prompt || typeof prompt !== 'string') {
    return 'Conversa Operacional';
  }

  let text = prompt.trim();

  // If prompt was "Como está a operação hoje?", clean common prefix
  let cleaned = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const rx of REMOVE_PREFIXES) {
      if (rx.test(cleaned)) {
        cleaned = cleaned.replace(rx, '').trim();
        changed = true;
      }
    }
  }

  // Remove trailing punctuation (? . ! :)
  cleaned = cleaned.replace(/[?!.:;]+$/g, '').trim();

  // Check if there is an explicit store/location mentioned
  const storeMatch = text.match(/\b(shopping\s+\w+|loja\s+\w+|tijuca|leblon|ipanema|barra|copacabana|centro|botafogo)\b/i);
  const storeTag = storeMatch ? toTitleCase(storeMatch[0]) : '';

  // 1. Check for specific topic keywords
  for (const topic of TOPIC_KEYWORDS) {
    if (topic.match.test(text)) {
      if (/\bhoje\b/i.test(text)) {
        return storeTag ? `${topic.label} (${storeTag}) • Hoje` : `${topic.label} de Hoje`;
      }
      if (/\bontem\b/i.test(text)) {
        return storeTag ? `${topic.label} (${storeTag}) • Ontem` : `${topic.label} de Ontem`;
      }
      if (/\bm[eê]s\b/i.test(text)) {
        return storeTag ? `${topic.label} (${storeTag}) • Mensal` : `${topic.label} do Mês`;
      }
      if (/\bsemana\b/i.test(text)) {
        return storeTag ? `${topic.label} (${storeTag}) • Semanal` : `${topic.label} da Semana`;
      }
      return storeTag ? `${topic.label} - ${storeTag}` : topic.label;
    }
  }

  // 2. If cleaned string is a good length (3 to 40 chars), use Title Case of cleaned prompt
  if (cleaned.length >= 3) {
    // If it ends with "hoje" or "ontem"
    if (/\bhoje$/i.test(cleaned) && !/hoje/i.test(cleaned.slice(0, -4))) {
      const base = cleaned.replace(/\bhoje$/i, '').trim();
      return `${toTitleCase(base)} de Hoje`;
    }
    
    // Truncate cleanly at word boundary if too long
    if (cleaned.length > 36) {
      const sub = cleaned.slice(0, 36);
      const lastSpace = sub.lastIndexOf(' ');
      cleaned = (lastSpace > 12 ? sub.slice(0, lastSpace) : sub) + '...';
    }
    return toTitleCase(cleaned);
  }

  // 3. Fallback: inspect agent response for markdown headers like "# Título" or "[STATUS / ALERTA]"
  if (agentResponse && typeof agentResponse === 'string') {
    const headerMatch = agentResponse.match(/^#+\s+(.+)$/m);
    if (headerMatch && headerMatch[1]) {
      return toTitleCase(headerMatch[1].replace(/[*_#]/g, '').trim().slice(0, 36));
    }
    const bracketMatch = agentResponse.match(/\[([A-Z\s/&]+)\]/);
    if (bracketMatch && bracketMatch[1] && bracketMatch[1].length < 30) {
      return toTitleCase(bracketMatch[1].trim());
    }
  }

  // Default fallback
  return toTitleCase(text.slice(0, 32));
}
