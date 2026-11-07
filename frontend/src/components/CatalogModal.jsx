import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Sparkles,
  Bot,
  Wrench,
  Zap,
  Filter
} from 'lucide-react';
import { PlatformLogo } from './PlatformLogo';
import { useLanguage } from '../i18n';

export const PUBLIC_TOOL_IDS = [
  'notion',
  'gmail',
  'drive',
  'chat',
  'freescout',
  'meta_ads',
  'google_ads',
  'url',
  'generic_mcp'
];

export const PRIVATE_TOOL_IDS = [
  'erp',
  'entrega_aki',
  'ifood',
  '99food',
  'contaazul',
  'bank',
  'marqhr',
  'intranetmall',
  'business_analytics'
];

export const PUBLIC_TRIGGER_IDS = [
  'trig_gmail',
  'trig_chatwoot',
  'trig_freescout',
  'trig_webhook',
  'trig_cron',
  'trig_telegram',
  'trig_whatsapp',
  'trig_custom'
];

export const PRIVATE_TRIGGER_IDS = [
  'trig_entrega_aki',
  'trig_ifood',
  'trig_99food'
];

export function getInstalledCompanyPlugins() {
  try {
    const raw = localStorage.getItem('aiboard_company_config');
    if (!raw) return { installedTools: [], installedTriggers: [] };
    const parsed = JSON.parse(raw);
    return {
      installedTools: Array.isArray(parsed?.installed_tools) ? parsed.installed_tools : [],
      installedTriggers: Array.isArray(parsed?.installed_triggers) ? parsed.installed_triggers : []
    };
  } catch {
    return { installedTools: [], installedTriggers: [] };
  }
}

export function isToolInstalled(toolId, installedTools = []) {
  if (PUBLIC_TOOL_IDS.includes(toolId)) return true;
  if (!Array.isArray(installedTools) || installedTools.length === 0) return false;
  return installedTools.includes(toolId) || installedTools.includes('*');
}

export function isTriggerInstalled(trigId, trigType, installedTriggers = [], installedTools = []) {
  if (PUBLIC_TRIGGER_IDS.includes(trigId)) return true;
  const combined = [
    ...(Array.isArray(installedTriggers) ? installedTriggers : []),
    ...(Array.isArray(installedTools) ? installedTools : [])
  ];
  if (combined.length === 0) return false;
  const baseTool = trigId.replace(/^trig_/, '').replace(/^event_/, '');
  return (
    combined.includes(trigId) ||
    combined.includes(trigType) ||
    combined.includes(baseTool) ||
    combined.includes('*')
  );
}

export const PUBLIC_TOOL_CATALOG = [
  {
    id: 'notion',
    name: 'Notion Workspace',
    name_en: 'Notion Workspace',
    name_es: 'Notion Workspace',
    category: 'Gestão, Manuais & Senhas',
    category_en: 'Knowledge, Manuals & Docs',
    category_es: 'Gestión, Manuales y Docs',
    desc: 'Base de conhecimento corporativa: dados cadastrais, documentação interna, contatos e POPs.',
    desc_en: 'Corporate knowledge base: company records, internal documentation, contacts, and SOPs.',
    desc_es: 'Base de conocimiento corporativa: datos empresariales, documentación interna, contactos y POPs.',
    type: 'notion',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'gmail',
    name: 'Gmail',
    name_en: 'Gmail',
    name_es: 'Gmail',
    category: 'Google Workspace',
    category_en: 'Google Workspace',
    category_es: 'Google Workspace',
    desc: 'Pesquisa, leitura e envio de faturas, boletos, avisos de contabilidade e fornecedores.',
    desc_en: 'Search, read, and send invoices, billing notices, accounting alerts, and vendor emails.',
    desc_es: 'Búsqueda, lectura y envío de facturas, avisos contables y correos de proveedores.',
    type: 'gmail',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'drive',
    name: 'Google Drive',
    name_en: 'Google Drive',
    name_es: 'Google Drive',
    category: 'Google Workspace',
    category_en: 'Google Workspace',
    category_es: 'Google Workspace',
    desc: 'Pesquisa e leitura de manuais oficiais, POPs operacionais, fichas técnicas e planilhas.',
    desc_en: 'Search and read official manuals, operational SOPs, technical sheets, and spreadsheets.',
    desc_es: 'Búsqueda y lectura de manuales oficiales, POPs operativos, fichas técnicas y hojas de cálculo.',
    type: 'drive',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'chat',
    name: 'Chatwoot',
    name_en: 'Chatwoot',
    name_es: 'Chatwoot',
    category: 'Atendimento & SAC',
    category_en: 'Customer Support & CRM',
    category_es: 'Atención al Cliente y SAC',
    desc: 'Atendimento ao cliente em tempo real via WhatsApp e canais digitais com histórico de conversas.',
    desc_en: 'Real-time customer support via WhatsApp and digital channels with full conversation history.',
    desc_es: 'Atención al cliente en tiempo real vía WhatsApp y canales digitales con historial de conversaciones.',
    type: 'chat',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'freescout',
    name: 'FreeScout Helpdesk',
    name_en: 'FreeScout Helpdesk',
    name_es: 'FreeScout Helpdesk',
    category: 'Operações & Suporte',
    category_en: 'Operations & Helpdesk',
    category_es: 'Operaciones y Soporte',
    desc: 'Gestão de chamados operacionais e solicitações de suporte interno.',
    desc_en: 'Operational ticket management and internal support requests.',
    desc_es: 'Gestión de tickets operativos y solicitudes de soporte interno.',
    type: 'freescout',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    name_en: 'Meta Ads',
    name_es: 'Meta Ads',
    category: 'Marketing & Tráfego',
    category_en: 'Marketing & Paid Media',
    category_es: 'Marketing y Tráfico',
    desc: 'Métricas, ROAS, CPA e gerenciamento de campanhas pagas no Instagram e Facebook.',
    desc_en: 'Metrics, ROAS, CPA, and paid campaign management across Instagram and Facebook.',
    desc_es: 'Métricas, ROAS, CPA y gestión de campañas pagadas en Instagram y Facebook.',
    type: 'meta_ads',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    name_en: 'Google Ads',
    name_es: 'Google Ads',
    category: 'Marketing & Tráfego',
    category_en: 'Marketing & Paid Media',
    category_es: 'Marketing y Tráfico',
    desc: 'Auditoria de campanhas de pesquisa, Performance Max e YouTube.',
    desc_en: 'Audit Search, Performance Max, and YouTube ad campaigns.',
    desc_es: 'Auditoría de campañas de búsqueda, Performance Max y YouTube.',
    type: 'google_ads',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'url',
    name: 'Conector Web / URL',
    name_en: 'Web / URL Connector',
    name_es: 'Conector Web / URL',
    category: 'Portais Web Externos',
    category_en: 'External Web Portals',
    category_es: 'Portales Web Externos',
    desc: 'Acesso e auditoria de páginas, APIs REST e portais web externos ou financeiros.',
    desc_en: 'Access and audit external web pages, REST APIs, and financial portals.',
    desc_es: 'Acceso y auditoría de páginas web, APIs REST y portales externos o financieros.',
    type: 'url',
    itemKind: 'tool',
    isPublic: true
  },
  {
    id: 'generic_mcp',
    name: 'Servidor MCP Genérico',
    name_en: 'Generic MCP Server',
    name_es: 'Servidor MCP Genérico',
    category: 'Integrações Customizadas',
    category_en: 'Custom Integrations',
    category_es: 'Integraciones Personalizadas',
    desc: 'Conexão com ferramentas externas via protocolo Model Context Protocol (STDIO / SSE).',
    desc_en: 'Connect external tools via the Model Context Protocol (STDIO / SSE).',
    desc_es: 'Conexión con herramientas externas mediante Model Context Protocol (STDIO / SSE).',
    type: 'generic_mcp',
    itemKind: 'tool',
    isPublic: true
  }
];

export const PRIVATE_TOOL_CATALOG = [
  {
    id: 'erp',
    name: 'ERP Operacional',
    name_en: 'Enterprise ERP',
    name_es: 'ERP Operativo',
    category: 'Financeiro, Compras & Estoque',
    category_en: 'Finance, Purchasing & Inventory',
    category_es: 'Finanzas, Compras e Inventario',
    desc: 'Catálogo de fichas técnicas, compras de insumos, faturamento e posições de estoque.',
    desc_en: 'Technical sheets catalog, supply purchasing, billing, and inventory positions.',
    desc_es: 'Catálogo de fichas técnicas, compras de insumos, facturación y posiciones de inventario.',
    type: 'erp',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'entrega_aki',
    name: 'Plataforma Entrega Aki',
    name_en: 'Entrega Aki Platform',
    name_es: 'Plataforma Entrega Aki',
    category: 'Delivery & Vitrine',
    category_en: 'Delivery & Storefront',
    category_es: 'Delivery y Vitrina',
    desc: 'Acesso direto ao painel Entrega Aki para auditar produtos ativos, preços e configurações da loja.',
    desc_en: 'Direct access to Entrega Aki to audit active products, prices, and store settings.',
    desc_es: 'Acceso directo a Entrega Aki para auditar productos activos, precios y configuración de la tienda.',
    type: 'entrega_aki',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'ifood',
    name: 'iFood Marketplace',
    name_en: 'iFood Marketplace',
    name_es: 'iFood Marketplace',
    category: 'Delivery & Plataformas',
    category_en: 'Delivery & Marketplaces',
    category_es: 'Delivery y Plataformas',
    desc: 'Conector com o ecossistema iFood: chat de clientes, status de pedido em tempo real, SLA e cardápio.',
    desc_en: 'iFood ecosystem connector: customer chat, real-time order status, SLA, and menu.',
    desc_es: 'Conector con el ecosistema iFood: chat de clientes, estado de pedidos en tiempo real, SLA y menú.',
    type: 'ifood',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: '99food',
    name: '99 Food Marketplace',
    name_en: '99 Food Marketplace',
    name_es: '99 Food Marketplace',
    category: 'Delivery & Plataformas',
    category_en: 'Delivery & Marketplaces',
    category_es: 'Delivery y Plataformas',
    desc: 'Conector com o ecossistema 99 Food: mensagens, status de despacho, coleta de entregadores e cardápio.',
    desc_en: '99 Food ecosystem connector: messages, dispatch status, courier pickup, and menu.',
    desc_es: 'Conector con el ecosistema 99 Food: mensajes, estado de despacho, recogida y menú.',
    type: '99food',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'contaazul',
    name: 'Conta Azul',
    name_en: 'Conta Azul ERP',
    name_es: 'Conta Azul ERP',
    category: 'Financeiro & Fiscal',
    category_en: 'Finance & Accounting',
    category_es: 'Finanzas y Fiscal',
    desc: 'Contas a pagar e a receber, conciliação e plano de contas DRE via API oficial.',
    desc_en: 'Accounts payable/receivable, reconciliation, and P&L chart of accounts via official API.',
    desc_es: 'Cuentas por pagar y cobrar, conciliación y plan de cuentas DRE vía API oficial.',
    type: 'contaazul',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'bank',
    name: 'Banco & Extratos PJ',
    name_en: 'Corporate Bank Statements',
    name_es: 'Banco y Extractos Corporativos',
    category: 'Financeiro & Conciliação',
    category_en: 'Finance & Reconciliation',
    category_es: 'Finanzas y Conciliación',
    desc: 'Conciliação bancária automática de extratos e transações PIX via Open Finance.',
    desc_en: 'Automated bank reconciliation of statements and PIX transactions via Open Finance.',
    desc_es: 'Conciliación bancaria automática de extractos y transacciones PIX vía Open Finance.',
    type: 'bank',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'marqhr',
    name: 'MarQ HR',
    name_en: 'MarQ HR',
    name_es: 'MarQ HR',
    category: 'Gente & Cultura (RH)',
    category_en: 'People & Culture (HR)',
    category_es: 'Personas y Cultura (RRHH)',
    desc: 'Espelho de ponto eletrônico, batidas diárias, auditoria de horas extras e férias.',
    desc_en: 'Electronic timecards, daily clock-ins, overtime auditing, and vacation tracking.',
    desc_es: 'Registro de asistencia electrónico, marcaciones diarias, auditoría de horas extras y vacaciones.',
    type: 'marqhr',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'intranetmall',
    name: 'Intranet Mall',
    name_en: 'Intranet Mall',
    name_es: 'Intranet Mall',
    category: 'Operações & Shopping',
    category_en: 'Operations & Mall Portal',
    category_es: 'Operaciones y Centro Comercial',
    desc: 'Boletos de condomínio, aluguel, circulares e declaração de vendas da loja Shopping Center.',
    desc_en: 'Mall invoices, rent, circulars, and store gross sales declarations.',
    desc_es: 'Facturas de condominio, alquiler, circulares y declaración de ventas de la tienda.',
    type: 'intranetmall',
    itemKind: 'tool',
    isPublic: false
  },
  {
    id: 'business_analytics',
    name: 'Business Analytics',
    name_en: 'Business Analytics',
    name_es: 'Business Analytics',
    category: 'Estratégia & Métricas',
    category_en: 'Strategy & Metrics',
    category_es: 'Estrategia y Métricas',
    desc: 'Painel de Business Analytics consolidado e KPIs históricos.',
    desc_en: 'Consolidated Business Analytics dashboard and historical KPIs.',
    desc_es: 'Panel consolidado de Business Analytics y KPIs históricos.',
    type: 'business_analytics',
    itemKind: 'tool',
    isPublic: false
  }
];

export const TOOL_CATALOG = [...PUBLIC_TOOL_CATALOG, ...PRIVATE_TOOL_CATALOG];

export const PUBLIC_TRIGGER_CATALOG = [
  {
    id: 'trig_gmail',
    name: 'Gmail',
    name_en: 'Gmail',
    name_es: 'Gmail',
    category: 'Google Workspace',
    category_en: 'Google Workspace',
    category_es: 'Google Workspace',
    desc: 'Dispara quando novos e-mails não lidos chegarem com filtros de remetente, assunto ou anexos.',
    desc_en: 'Fires when new unread emails arrive matching sender, subject, or attachment filters.',
    desc_es: 'Se activa cuando llegan nuevos correos no leídos con filtros de remitente, asunto o adjuntos.',
    type: 'gmail_event',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_chatwoot',
    name: 'Chatwoot',
    name_en: 'Chatwoot',
    name_es: 'Chatwoot',
    category: 'Atendimento & SAC',
    category_en: 'Customer Support & CRM',
    category_es: 'Atención al Cliente y SAC',
    desc: 'Dispara em tempo real quando novas mensagens de clientes chegarem no WhatsApp para atendimento imediato.',
    desc_en: 'Fires in real time when new customer messages arrive on WhatsApp for immediate support.',
    desc_es: 'Se activa en tiempo real cuando llegan nuevos mensajes de clientes en WhatsApp.',
    type: 'chatwoot_event',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_freescout',
    name: 'FreeScout Helpdesk',
    name_en: 'FreeScout Helpdesk',
    name_es: 'FreeScout Helpdesk',
    category: 'Operações & Suporte',
    category_en: 'Operations & Helpdesk',
    category_es: 'Operaciones y Soporte',
    desc: 'Dispara imediatamente quando novos chamados de suporte operacional forem abertos.',
    desc_en: 'Fires immediately when new operational support tickets are opened.',
    desc_es: 'Se activa inmediatamente cuando se abren nuevos tickets de soporte operativo.',
    type: 'freescout_event',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_webhook',
    name: 'Webhook HTTP',
    name_en: 'HTTP Webhook',
    name_es: 'Webhook HTTP',
    category: 'Integrações Externas',
    category_en: 'External Integrations',
    category_es: 'Integraciones Externas',
    desc: 'Recebe eventos HTTP POST de qualquer sistema externo através de endpoint dedicado.',
    desc_en: 'Receives HTTP POST events from any external system via a dedicated endpoint.',
    desc_es: 'Recibe eventos HTTP POST de cualquier sistema externo mediante un endpoint dedicado.',
    type: 'webhook',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_cron',
    name: 'Agendamento / Cron',
    name_en: 'Schedule / Cron',
    name_es: 'Programación / Cron',
    category: 'Automação Programada',
    category_en: 'Scheduled Automation',
    category_es: 'Automatización Programada',
    desc: 'Executa em horários e dias programados (ex: relatórios matinais, fechamento noturno ou comitês).',
    desc_en: 'Runs at scheduled times and days (e.g., morning reports, nightly close, or executive committees).',
    desc_es: 'Se ejecuta en horarios y días programados (ej: informes matutinos, cierre nocturno o comités).',
    type: 'cron',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_telegram',
    name: 'Telegram Bot',
    name_en: 'Telegram Bot',
    name_es: 'Bot de Telegram',
    category: 'Mensageria Mobile',
    category_en: 'Mobile Messaging',
    category_es: 'Mensajería Móvil',
    desc: 'Escuta mensagens, comandos de voz e solicitações enviadas ao bot corporativo do Telegram.',
    desc_en: 'Listens for messages, voice commands, and requests sent to the corporate Telegram bot.',
    desc_es: 'Escucha mensajes, comandos de voz y solicitudes enviadas al bot corporativo de Telegram.',
    type: 'telegram',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_whatsapp',
    name: 'WhatsApp',
    name_en: 'WhatsApp',
    name_es: 'WhatsApp',
    category: 'Mensageria Corporativa',
    category_en: 'Enterprise Messaging',
    category_es: 'Mensajería Corporativa',
    desc: 'Recebe mensagens e comandos através do número de WhatsApp corporativo.',
    desc_en: 'Receives messages and commands through the corporate WhatsApp number.',
    desc_es: 'Recibe mensajes y comandos a través del número corporativo de WhatsApp.',
    type: 'whatsapp',
    itemKind: 'trigger',
    isPublic: true
  },
  {
    id: 'trig_custom',
    name: 'Sob Medida',
    name_en: 'Custom REST Trigger',
    name_es: 'Disparador Personalizado',
    category: 'Customizado',
    category_en: 'Custom',
    category_es: 'Personalizado',
    desc: 'Disparo com payload JSON customizável, chave de autenticação e modelo de prompt próprio.',
    desc_en: 'Custom JSON payload trigger with authentication key and dedicated prompt template.',
    desc_es: 'Disparo con payload JSON personalizable, clave de autenticación y plantilla de prompt propia.',
    type: 'custom',
    itemKind: 'trigger',
    isPublic: true
  }
];

export const PRIVATE_TRIGGER_CATALOG = [
  {
    id: 'trig_entrega_aki',
    name: 'Entrega Aki',
    name_en: 'Entrega Aki',
    name_es: 'Entrega Aki',
    category: 'Delivery & Canais',
    category_en: 'Delivery & Channels',
    category_es: 'Delivery y Canales',
    desc: 'Dispara imediatamente via Webhook ou monitoramento ativo da plataforma de delivery e pedidos diretos.',
    desc_en: 'Fires immediately via Webhook or active monitoring of the direct delivery platform.',
    desc_es: 'Se activa inmediatamente vía Webhook o monitoreo activo de la plataforma de delivery.',
    type: 'entrega_aki_event',
    itemKind: 'trigger',
    isPublic: false
  },
  {
    id: 'trig_ifood',
    name: 'iFood',
    name_en: 'iFood',
    name_es: 'iFood',
    category: 'Delivery & Plataformas',
    category_en: 'Delivery & Marketplaces',
    category_es: 'Delivery y Plataformas',
    desc: 'Dispara via Webhook oficial iFood ou monitoramento para mensagens no chat, status de pedidos, SLA ou cardápio.',
    desc_en: 'Fires via iFood Webhook or monitoring for chat messages, order status, SLA, or menu alerts.',
    desc_es: 'Se activa vía Webhook iFood o monitoreo para mensajes de chat, estado de pedidos, SLA o menú.',
    type: 'ifood_event',
    itemKind: 'trigger',
    isPublic: false
  },
  {
    id: 'trig_99food',
    name: '99 Food',
    name_en: '99 Food',
    name_es: '99 Food',
    category: 'Delivery & Plataformas',
    category_en: 'Delivery & Marketplaces',
    category_es: 'Delivery y Plataformas',
    desc: 'Dispara via Webhook oficial 99 Food para mensagens, status de despacho, coleta de entregador ou cardápio.',
    desc_en: 'Fires via 99 Food Webhook for messages, dispatch status, courier pickup, or menu changes.',
    desc_es: 'Se activa vía Webhook 99 Food para mensajes, estado de despacho, recogida o menú.',
    type: '99food_event',
    itemKind: 'trigger',
    isPublic: false
  }
];

export const TRIGGER_CATALOG = [...PUBLIC_TRIGGER_CATALOG, ...PRIVATE_TRIGGER_CATALOG];

export const AGENT_PRESETS = [
  {
    id: 'agent_analyst',
    name: 'Analista Operacional',
    name_en: 'Operations Analyst',
    name_es: 'Analista Operativo',
    role: 'Analista Operacional & Auditor',
    role_en: 'Operations Analyst & Auditor',
    role_es: 'Analista Operativo y Auditor',
    category: 'Operações',
    category_en: 'Operations',
    category_es: 'Operaciones',
    desc: 'Agente responsável por auditar relatórios, checar rotinas e cruzar dados operacionais.',
    desc_en: 'Agent responsible for auditing reports, checking routines, and cross-referencing operational data.',
    desc_es: 'Agente responsable de auditar informes, verificar rutinas y cruzar datos operativos.',
    model: 'Gemini 3.1 Flash-Lite',
    department: 'coo',
    itemKind: 'agent'
  },
  {
    id: 'agent_financial',
    name: 'Especialista Financeiro',
    name_en: 'Financial Specialist',
    name_es: 'Especialista Financiero',
    role: 'Auditor Fiscal & Conciliação',
    role_en: 'Financial Auditor & Reconciliation',
    role_es: 'Auditor Fiscal y Conciliación',
    category: 'Financeiro',
    category_en: 'Finance',
    category_es: 'Finanzas',
    desc: 'Agente especialista em conciliação bancária, lançamento de notas e controle de pagamentos.',
    desc_en: 'Specialist agent in bank reconciliation, invoice verification, and payment control.',
    desc_es: 'Agente especialista en conciliación bancaria, registro de facturas y control de pagos.',
    model: 'Gemini 3.8 Flash',
    department: 'cfo',
    itemKind: 'agent'
  },
  {
    id: 'agent_cx',
    name: 'Especialista em Atendimento',
    name_en: 'Customer Experience Specialist',
    name_es: 'Especialista en Atención al Cliente',
    role: 'Atendimento & Experiência do Cliente',
    role_en: 'Customer Support & Experience',
    role_es: 'Atención y Experiencia del Cliente',
    category: 'Atendimento & SAC',
    category_en: 'Customer Support & CRM',
    category_es: 'Atención al Cliente y SAC',
    desc: 'Agente dedicado ao atendimento acolhedor no tom de voz da marca e suporte a clientes.',
    desc_en: 'Agent dedicated to warm, on-brand customer support and issue resolution.',
    desc_es: 'Agente dedicado a la atención cordial en el tono de voz de la marca y soporte a clientes.',
    model: 'Gemini 3.1 Flash-Lite',
    department: 'cmo',
    itemKind: 'agent'
  }
];

export function CatalogModal({
  isOpen,
  initialTab = 'all', // 'all' | 'tools' | 'triggers' | 'agents'
  onClose,
  onSelectTool,
  onSelectTrigger,
  onSelectAgent
}) {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchQuery('');
      setSelectedCategory('all');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const localizeItem = (item) => {
    const isEn = lang === 'en';
    const isEs = lang === 'es';
    return {
      ...item,
      name: isEn ? item.name_en || item.name : isEs ? item.name_es || item.name : item.name,
      category: isEn
        ? item.category_en || item.category
        : isEs
        ? item.category_es || item.category
        : item.category,
      desc: isEn ? item.desc_en || item.desc : isEs ? item.desc_es || item.desc : item.desc,
      role: item.role
        ? isEn
          ? item.role_en || item.role
          : isEs
          ? item.role_es || item.role
          : item.role
        : undefined
    };
  };

  const { visibleTools, visibleTriggers, visibleAgents, allItems } = useMemo(() => {
    const { installedTools, installedTriggers } = getInstalledCompanyPlugins();

    const tools = [
      ...PUBLIC_TOOL_CATALOG,
      ...PRIVATE_TOOL_CATALOG.filter((tool) => isToolInstalled(tool.id, installedTools))
    ].map((item) => ({
      ...localizeItem(item),
      kindLabel: t('catalog.typeTool')
    }));

    const triggers = [
      ...PUBLIC_TRIGGER_CATALOG,
      ...PRIVATE_TRIGGER_CATALOG.filter((trig) =>
        isTriggerInstalled(trig.id, trig.type, installedTriggers, installedTools)
      )
    ].map((item) => ({
      ...localizeItem(item),
      kindLabel: t('catalog.typeTrigger')
    }));

    const agents = AGENT_PRESETS.map((item) => ({
      ...localizeItem(item),
      kindLabel: t('catalog.typeAgent')
    }));

    return {
      visibleTools: tools,
      visibleTriggers: triggers,
      visibleAgents: agents,
      allItems: [...tools, ...triggers, ...agents]
    };
  }, [lang, t, isOpen]);

  const categories = useMemo(() => {
    const set = new Set();
    allItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ['all', ...Array.from(set)];
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (activeTab === 'tools') {
      items = items.filter((i) => i.itemKind === 'tool');
    } else if (activeTab === 'triggers') {
      items = items.filter((i) => i.itemKind === 'trigger');
    } else if (activeTab === 'agents') {
      items = items.filter((i) => i.itemKind === 'agent');
    }

    if (selectedCategory !== 'all') {
      items = items.filter((i) => i.category === selectedCategory);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter((i) => {
        return (
          i.name.toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q) ||
          (i.desc || '').toLowerCase().includes(q) ||
          (i.role || '').toLowerCase().includes(q)
        );
      });
    }

    return items;
  }, [allItems, activeTab, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-[#E2E8E4] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E2E8E4] bg-gradient-to-r from-gray-50/70 to-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-2xl bg-[#16422B] text-white shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#16422B] truncate">
                {t('catalog.title')}
              </h2>
              <p className="text-xs text-[#5A6B61] truncate">
                {t('catalog.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer shrink-0"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-[#E2E8E4] space-y-3 bg-white">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('catalog.searchPlaceholder')}
                className="w-full pl-10 pr-8 py-2 text-xs font-medium border border-[#E2E8E4] rounded-2xl bg-gray-50/60 focus:bg-white focus:outline-none focus:border-[#16422B] focus:ring-1 focus:ring-[#16422B] transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-2xl border border-gray-200 shrink-0 text-xs overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl font-bold transition whitespace-nowrap cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-white text-[#16422B] shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('catalog.tabAll')} ({allItems.length})
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'tools'
                    ? 'bg-white text-purple-700 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>
                  {t('catalog.tabTools')} ({visibleTools.length})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('triggers')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'triggers'
                    ? 'bg-white text-[#CA3D26] shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-[#CA3D26] shrink-0" />
                <span>
                  {t('catalog.tabTriggers')} ({visibleTriggers.length})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'agents'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>
                  {t('catalog.tabAgents')} ({visibleAgents.length})
                </span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
            <span className="text-gray-400 font-semibold flex items-center gap-1 shrink-0 pl-1 pr-1 whitespace-nowrap">
              <Filter className="w-3 h-3 shrink-0" />
              <span>{t('catalog.filterAllCategories')}:</span>
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#16422B] text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? t('catalog.filterAllCategories') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Component Grid */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-[#F9FAF9] max-h-[55vh]">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs space-y-2">
              <p className="font-semibold text-gray-600">
                {t('catalog.noResults', { query: searchQuery })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="text-emerald-700 font-bold underline cursor-pointer"
              >
                {t('catalog.clearFilters')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map((item) => {
                const isTool = item.itemKind === 'tool';
                const isTrig = item.itemKind === 'trigger';
                const isAgent = item.itemKind === 'agent';

                const badgeBg = isTool
                  ? 'bg-purple-100 text-purple-800'
                  : isTrig
                  ? 'bg-orange-100 text-[#CA3D26]'
                  : 'bg-emerald-100 text-emerald-900';

                return (
                  <div
                    key={`${item.itemKind}-${item.id}`}
                    onClick={() => {
                      if (isTool && onSelectTool) onSelectTool(item);
                      else if (isTrig && onSelectTrigger) onSelectTrigger(item);
                      else if (isAgent && onSelectAgent) onSelectAgent(item);
                      onClose();
                    }}
                    className="p-3.5 bg-white rounded-2xl border border-[#E2E8E4] hover:border-[#16422B] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-2.5 min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="p-2 rounded-xl bg-gray-50 border border-gray-100 shrink-0 group-hover:scale-105 transition">
                          <PlatformLogo type={item.type || item.id} size="md" />
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${badgeBg}`}
                        >
                          {item.kindLabel}
                        </span>
                      </div>

                      <div className="font-extrabold text-xs text-[#1A202C] group-hover:text-[#16422B] transition truncate">
                        {item.name}
                      </div>

                      <div className="text-[10px] text-gray-500 font-semibold truncate mt-0.5">
                        {item.category}
                      </div>

                      <p className="text-[11px] text-gray-600 leading-snug line-clamp-2 mt-1.5">
                        {item.desc}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-[#16422B] font-bold">
                      <span className="group-hover:underline truncate">{t('catalog.addButton')}</span>
                      <Plus className="w-4 h-4 text-[#16422B] group-hover:translate-x-0.5 transition shrink-0" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-[#E2E8E4] bg-white flex items-center justify-between text-xs text-gray-500">
          <span>
            {t('catalog.showingCount', {
              count: filteredItems.length,
              type: t('catalog.blocks')
            })}
          </span>
          <span className="text-[11px] whitespace-nowrap">{t('catalog.ESC')}</span>
        </div>
      </div>
    </div>
  );
}
