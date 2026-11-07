import React, { useEffect, useRef } from 'react';
import {
  Bot,
  Settings,
  Brain,
  Smile,
  Copy,
  Trash2,
  Wrench,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Headphones,
  MessageSquare,
  CircleDollarSign,
  Landmark,
  TrendingUp,
  Cpu,
  Lock,
  Eye,
  Zap,
  Globe,
  Clock,
  Send,
  Mail,
  Terminal,
  Megaphone,
  Target,
  ShoppingBag,
  UtensilsCrossed,
  Waypoints,
  Activity
} from 'lucide-react';
import { useLanguage } from '../i18n';
import {
  getInstalledCompanyPlugins,
  isToolInstalled,
  isTriggerInstalled
} from './CatalogModal';

export const PUBLIC_TOOL_PRESETS = [
  { id: 'notion', name: 'Notion Workspace', category: 'Manuais, Senhas & Dados da Empresa', icon: FileSpreadsheet, color: 'text-stone-900', isPublic: true },
  { id: 'gmail', name: 'Gmail', category: 'Filtro & Leitura/Envio de E-mails', icon: Mail, color: 'text-red-600', isPublic: true },
  { id: 'drive', name: 'Google Drive', category: 'Documentos & Manuais da Empresa', icon: FileSpreadsheet, color: 'text-blue-700', isPublic: true },
  { id: 'freescout', name: 'FreeScout', category: 'Chamados Operacionais de Lojas', icon: Headphones, color: 'text-indigo-700', isPublic: true },
  { id: 'chat', name: 'Chatwoot', category: 'Atendimento & SAC (WhatsApp)', icon: MessageSquare, color: 'text-purple-700', isPublic: true },
  { id: 'meta_ads', name: 'Meta Ads', category: 'Facebook & Instagram Ads', icon: Megaphone, color: 'text-blue-600', isPublic: true },
  { id: 'google_ads', name: 'Google Ads', category: 'Search, PMax & YouTube', icon: Target, color: 'text-amber-600', isPublic: true },
  { id: 'url', name: 'URL', category: 'Acesso a Sites & Portais Web', icon: Globe, color: 'text-sky-600', isPublic: true },
  { id: 'generic_mcp', name: 'Servidor MCP Genérico', category: 'Model Context Protocol (SSE/STDIO)', icon: Cpu, color: 'text-violet-700', isPublic: true }
];

export const PRIVATE_TOOL_PRESETS = [
  { id: 'erp', name: 'ERP Operacional', category: 'Faturamento, Catálogo & Estoque', icon: Database, color: 'text-emerald-700', isPublic: false },
  { id: 'business_analytics', name: 'Business Analytics', category: 'Business Analytics & Métricas', icon: TrendingUp, color: 'text-rose-600', isPublic: false },
  { id: 'contaazul', name: 'Conta Azul', category: 'Contas a Pagar, Receber & Fiscal', icon: CircleDollarSign, color: 'text-teal-700', isPublic: false },
  { id: 'bank', name: 'Banco', category: 'Conciliação Bancária via Pluggy.ai', icon: Landmark, color: 'text-amber-700', isPublic: false },
  { id: 'marqhr', name: 'MarQ HR', category: 'Ponto Eletrônico & Gestão de RH', icon: Clock, color: 'text-rose-600', isPublic: false },
  { id: 'entrega_aki', name: 'Plataforma Entrega Aki', category: 'Produtos & Config. da Loja (Entrega Aki)', icon: Globe, color: 'text-emerald-600', isPublic: false },
  { id: 'ifood', name: 'iFood Marketplace', category: 'Chat, Status, Cardápio & SLA iFood', icon: ShoppingBag, color: 'text-red-600', isPublic: false },
  { id: '99food', name: '99 Food Marketplace', category: 'Chat, Status, Cardápio & SLA 99 Food', icon: UtensilsCrossed, color: 'text-amber-600', isPublic: false }
];

export const TOOL_PRESETS = [...PUBLIC_TOOL_PRESETS, ...PRIVATE_TOOL_PRESETS];

export const PUBLIC_TRIGGER_PRESETS = [
  { id: 'event_gmail', name: 'Gmail', category: 'Monitoramento & Filtros de E-mails', icon: Mail, color: 'text-red-600', type: 'gmail_event', isPublic: true },
  { id: 'event_loop_chatwoot', name: 'Chatwoot', category: 'Mensagens de Clientes no WhatsApp', icon: MessageSquare, color: 'text-purple-600', type: 'chatwoot_event', isPublic: true },
  { id: 'event_loop_freescout', name: 'FreeScout Helpdesk', category: 'Chamados Operacionais', icon: Headphones, color: 'text-indigo-600', type: 'freescout_event', isPublic: true },
  { id: 'webhook', name: 'Webhook HTTP', category: 'Chamada de API Externa', icon: Globe, color: 'text-orange-600', type: 'webhook', isPublic: true },
  { id: 'cron', name: 'Agendamento / Cron', category: 'Disparo Programado / Timer', icon: Clock, color: 'text-blue-600', type: 'cron', isPublic: true },
  { id: 'telegram', name: 'Telegram Bot', category: 'Mensagens / Canais Telegram', icon: Send, color: 'text-sky-600', type: 'telegram', isPublic: true },
  { id: 'whatsapp', name: 'WhatsApp', category: 'Mensagens de Clientes no WhatsApp', icon: MessageSquare, color: 'text-emerald-600', type: 'whatsapp', isPublic: true },
  { id: 'custom_trigger', name: 'Sob Medida', category: 'Webhook Customizado REST', icon: Zap, color: 'text-amber-600', type: 'custom', isPublic: true }
];

export const PRIVATE_TRIGGER_PRESETS = [
  { id: 'event_entrega_aki', name: 'Entrega Aki', category: 'Webhook & Plataforma Entrega Aki', icon: Globe, color: 'text-emerald-600', type: 'entrega_aki_event', isPublic: false },
  { id: 'event_ifood', name: 'iFood', category: 'Webhook & Eventos iFood (Chat/Status/SLA)', icon: ShoppingBag, color: 'text-red-600', type: 'ifood_event', isPublic: false },
  { id: 'event_99food', name: '99 Food', category: 'Webhook & Eventos 99 Food (Chat/Status/SLA)', icon: UtensilsCrossed, color: 'text-amber-600', type: '99food_event', isPublic: false }
];

export const TRIGGER_PRESETS = [...PUBLIC_TRIGGER_PRESETS, ...PRIVATE_TRIGGER_PRESETS];

export function getFilteredToolPresets() {
  const { installedTools } = getInstalledCompanyPlugins();
  return [
    ...PUBLIC_TOOL_PRESETS,
    ...PRIVATE_TOOL_PRESETS.filter((p) => isToolInstalled(p.id, installedTools))
  ];
}

export function getFilteredTriggerPresets() {
  const { installedTools, installedTriggers } = getInstalledCompanyPlugins();
  return [
    ...PUBLIC_TRIGGER_PRESETS,
    ...PRIVATE_TRIGGER_PRESETS.filter((p) =>
      isTriggerInstalled(p.id, p.type, installedTriggers, installedTools)
    )
  ];
}

export function ContextMenu({
  x,
  y,
  targetNode,
  targetEdge,
  isAdmin = true,
  onClose,
  onConfigure,
  onDelete,
  onDeleteEdge,
  onToggleEdgeStyle,
  onToggleEdgeAnimation,
  onDuplicate,
  onMemory,
  onPersonality,
  onWorkspace,
  onAddAgent,
  onOpenCatalog,
  onOrganize
}) {
  const { t, lang } = useLanguage();
  const menuRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuWidth = 240;
  const menuHeight = targetNode ? 240 : 220;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 20);

  const label = (pt, en, es) => (lang === 'en' ? en : lang === 'es' ? es : pt);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />

      <div
        ref={menuRef}
        style={{ left: adjustedX, top: adjustedY }}
        className="fixed z-50 w-60 bg-white/95 backdrop-blur-md border border-[#E2E8E4] rounded-2xl shadow-2xl p-1.5 text-xs text-[#1A202C] animate-in fade-in zoom-in-95 duration-100 select-none"
      >
        {targetEdge ? (
          <div className="space-y-0.5">
            <div className="px-3 py-1.5 border-b border-[#E2E8E4] mb-1">
              <span className="font-extrabold text-[11px] text-[#16422B] uppercase tracking-wider block truncate">
                {label('Conexão Selecionada', 'Selected Connection', 'Conexión Seleccionada')}
              </span>
              <span className="text-[10px] text-[#5A6B61] font-semibold block truncate">
                {targetEdge.source} → {targetEdge.target}
              </span>
            </div>

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    if (onToggleEdgeStyle) onToggleEdgeStyle(targetEdge);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                >
                  <Waypoints className="w-4 h-4 text-[#16422B] shrink-0" />
                  <span className="truncate">
                    {targetEdge.style?.strokeDasharray
                      ? label('Tornar Linha Sólida', 'Make Solid Line', 'Hacer Línea Sólida')
                      : label('Tornar Linha Tracejada', 'Make Dashed Line', 'Hacer Línea Discontinua')}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (onToggleEdgeAnimation) onToggleEdgeAnimation(targetEdge);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                >
                  <Activity className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="truncate">
                    {targetEdge.animated
                      ? label('Desativar Animação', 'Disable Animation', 'Desactivar Animación')
                      : label('Ativar Linha Animada', 'Enable Animated Line', 'Activar Línea Animada')}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (onDeleteEdge) onDeleteEdge(targetEdge);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="truncate">{t('Excluir Conexão')}</span>
                </button>
              </>
            )}
          </div>
        ) : targetNode ? (
          <div className="space-y-0.5">
            <div className="px-3 py-1.5 border-b border-[#E2E8E4] mb-1">
              <span className="font-extrabold text-[11px] text-[#16422B] uppercase tracking-wider block truncate">
                {targetNode.data?.role ||
                  targetNode.data?.name ||
                  targetNode.data?.label ||
                  label('Bloco Selecionado', 'Selected Block', 'Bloque Seleccionado')}
              </span>
              <span className="text-[10px] text-[#5A6B61] font-semibold flex items-center justify-between gap-1">
                <span className="truncate">
                  {targetNode.type === 'agent'
                    ? label('Agente CrewAI', 'CrewAI Agent', 'Agente CrewAI')
                    : targetNode.type === 'tool'
                    ? t('catalog.typeTool')
                    : t('catalog.typeTrigger')}
                </span>
                {!isAdmin && (
                  <span className="text-amber-700 font-bold flex items-center gap-0.5 whitespace-nowrap shrink-0">
                    <Lock className="w-2.5 h-2.5 shrink-0" />
                    <span>{label('Leitura', 'Read-only', 'Lectura')}</span>
                  </span>
                )}
              </span>
            </div>

            <button
              onClick={() => {
                onConfigure(targetNode);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#16422B] transition cursor-pointer"
            >
              <Settings className="w-4 h-4 text-[#16422B] shrink-0" />
              <span className="truncate">
                {targetNode.type === 'agent'
                  ? label('Configurar & Goal', 'Configure & Goal', 'Configurar y Goal')
                  : targetNode.type === 'tool'
                  ? label('Configurar MCP', 'Configure MCP', 'Configurar MCP')
                  : label('Configurar Gatilho', 'Configure Trigger', 'Configurar Disparador')}
              </span>
            </button>

            {targetNode.type === 'agent' && (
              <>
                <button
                  onClick={() => {
                    onMemory(targetNode);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#16422B] transition cursor-pointer"
                >
                  <Brain className="w-4 h-4 text-[#7E5BB5] shrink-0" />
                  <span className="truncate">{t('Memória do Agente')}</span>
                </button>

                <button
                  onClick={() => {
                    onPersonality(targetNode);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#16422B] transition cursor-pointer"
                >
                  <Smile className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="truncate">{t('Personalidade & Tom')}</span>
                </button>

                <button
                  onClick={() => {
                    if (onWorkspace) onWorkspace(targetNode);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-emerald-800 transition cursor-pointer"
                >
                  <Terminal className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="truncate">{t('Workspace & Scripts')}</span>
                </button>
              </>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    onDuplicate(targetNode);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#16422B] transition cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-[#5A6B61] shrink-0" />
                  <span className="truncate">{t('Duplicar Bloco')}</span>
                </button>

                <div className="my-1 border-t border-[#E2E8E4]"></div>

                <button
                  onClick={() => {
                    onDelete(targetNode);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-red-50 text-red-600 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="truncate">{t('Excluir Bloco')}</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 relative">
            <div className="px-3 py-1.5 border-b border-[#E2E8E4] mb-1">
              <span className="font-extrabold text-[11px] text-[#5A6B61] uppercase tracking-wider block truncate">
                {label('Menu do Studio', 'Studio Menu', 'Menú de Studio')}
              </span>
            </div>

            {isAdmin ? (
              <>
                <button
                  onClick={() => {
                    if (onOpenCatalog) {
                      onOpenCatalog({ initialTab: 'agent', position: { x, y } });
                    } else {
                      onAddAgent({ x, y, isLead: false });
                    }
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#16422B] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Bot className="w-4 h-4 text-[#16422B] shrink-0" />
                    <span className="truncate">{t('studio.newAgent')}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
                </button>

                <button
                  onClick={() => {
                    if (onOpenCatalog) {
                      onOpenCatalog({ initialTab: 'tool', position: { x, y } });
                    }
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#7E5BB5] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Wrench className="w-4 h-4 text-[#7E5BB5] shrink-0" />
                    <span className="truncate">{label('Nova Ferramenta', 'New Tool', 'Nueva Herramienta')}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
                </button>

                <button
                  onClick={() => {
                    if (onOpenCatalog) {
                      onOpenCatalog({ initialTab: 'trigger', position: { x, y } });
                    }
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#CA3D26] transition cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Zap className="w-4 h-4 text-[#CA3D26] shrink-0" />
                    <span className="truncate">{label('Novo Gatilho', 'New Trigger', 'Nuevo Disparador')}</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
                </button>

                <div className="my-1 border-t border-[#E2E8E4]"></div>

                <button
                  onClick={() => {
                    if (onOpenCatalog) {
                      onOpenCatalog({ initialTab: 'all', position: { x, y } });
                    }
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-emerald-50 text-emerald-800 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">{t('studio.exploreCatalog')}</span>
                </button>
              </>
            ) : (
              <div className="px-3 py-2 text-[11px] text-[#5A6B61] italic flex items-center gap-2 bg-[#F8FAF9] rounded-xl border border-[#E2E8E4]">
                <Eye className="w-4 h-4 text-[#7E5BB5] shrink-0" />
                <span>{t('studio.readOnlyMode')}</span>
              </div>
            )}

            <div className="my-1 border-t border-[#E2E8E4]"></div>

            <button
              onClick={() => {
                onOrganize();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl font-bold hover:bg-[#EFF5F1] text-[#5A6B61] transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#5A6B61] shrink-0" />
              <span className="truncate">{t('Auto-Organizar Fluxo (ELK)')}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
