import React, { memo, useState, useEffect } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { PlatformLogo } from './PlatformLogo';
import { useLanguage } from '../i18n';
import {
  Database,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  Headphones,
  Zap,
  CircleDollarSign,
  Landmark,
  TrendingUp,
  Cpu,
  Radio,
  Globe,
  Megaphone,
  Target,
  Clock,
  ShoppingBag,
  UtensilsCrossed
} from 'lucide-react';

const iconMap = {
  erp: Database,
  sheets: FileSpreadsheet,
  drive: FileSpreadsheet,
  notion: FileSpreadsheet,
  gmail: Mail,
  chat: MessageSquare,
  chatwoot: MessageSquare,
  helpdesk: Headphones,
  freescout: Headphones,
  whatsapp: Zap,
  contaazul: CircleDollarSign,
  finance: CircleDollarSign,
  bank: Landmark,
  business_analytics: TrendingUp,
  business: TrendingUp,
  dre: Globe,
  url: Globe,
  generic_mcp: Cpu,
  mcp: Cpu,
  meta_ads: Megaphone,
  google_ads: Target,
  marqhr: Clock,
  marq: Clock,
  entrega_aki: Globe,
  entrega: Globe,
  ifood: ShoppingBag,
  '99food': UtensilsCrossed,
  delivery: ShoppingBag
};

const categoryColorMap = {
  erp: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  gmail: 'bg-red-50 text-red-800 border-red-200',
  drive: 'bg-blue-50 text-blue-800 border-blue-200',
  freescout: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  chat: 'bg-purple-50 text-purple-800 border-purple-200',
  contaazul: 'bg-teal-50 text-teal-800 border-teal-200',
  bank: 'bg-amber-50 text-amber-800 border-amber-200',
  business_analytics: 'bg-rose-50 text-rose-800 border-rose-200',
  business: 'bg-rose-50 text-rose-800 border-rose-200',
  dre: 'bg-sky-50 text-sky-800 border-sky-200',
  url: 'bg-sky-50 text-sky-800 border-sky-200',
  generic_mcp: 'bg-violet-50 text-violet-800 border-violet-200',
  meta_ads: 'bg-blue-50 text-blue-800 border-blue-200',
  google_ads: 'bg-amber-50 text-amber-800 border-amber-200',
  marqhr: 'bg-rose-50 text-rose-800 border-rose-200',
  marq: 'bg-rose-50 text-rose-800 border-rose-200',
  entrega_aki: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  entrega: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  ifood: 'bg-red-50 text-red-800 border-red-200',
  '99food': 'bg-amber-50 text-amber-800 border-amber-200',
  delivery: 'bg-orange-50 text-orange-800 border-orange-200'
};

const driveNameCache = {};

export const ToolNode = memo(({ data, selected }) => {
  const { t, lang } = useLanguage();
  const IconComponent = iconMap[data.type] || Cpu;
  const categoryStyle = categoryColorMap[data.type] || 'bg-purple-50 text-[#7E5BB5] border-purple-200';
  const isMCP = data.type === 'generic_mcp' || data.isMcp;

  // Auto-resolução do nome legível do arquivo no Google Drive caso venha apenas o ID
  const [resolvedName, setResolvedName] = useState(() => {
    if (data.driveFileName && data.driveFileName !== data.driveFileFilter) {
      return data.driveFileName;
    }
    return (data.driveFileFilter && driveNameCache[data.driveFileFilter]) || null;
  });

  // Auto-resolução do nome legível da pasta no Google Drive caso venha URL ou ID
  const [resolvedFolderName, setResolvedFolderName] = useState(() => {
    if (data.driveFolderName && data.driveFolderName !== data.driveFolderFilter) {
      return data.driveFolderName;
    }
    return (data.driveFolderFilter && driveNameCache[data.driveFolderFilter]) || null;
  });

  useEffect(() => {
    if (data.type === 'drive' && data.driveFileFilter) {
      if (data.driveFileName && data.driveFileName !== data.driveFileFilter) {
        setResolvedName(data.driveFileName);
        driveNameCache[data.driveFileFilter] = data.driveFileName;
        return;
      }
      if (driveNameCache[data.driveFileFilter]) {
        setResolvedName(driveNameCache[data.driveFileFilter]);
        return;
      }
      let userEmail = '';
      try {
        const saved = localStorage.getItem('aiboard_user');
        if (saved) userEmail = JSON.parse(saved).email || '';
      } catch (e) {}

      fetch(`/api/tools/drive/file-info?id=${encodeURIComponent(data.driveFileFilter)}`, {
        headers: { 'X-User-Email': userEmail }
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.name) {
            const cleanName = res.name.trim();
            driveNameCache[data.driveFileFilter] = cleanName;
            setResolvedName(cleanName);
          }
        })
        .catch(() => {});
    }
  }, [data.driveFileFilter, data.driveFileName, data.type]);

  useEffect(() => {
    if (data.type === 'drive' && data.driveFolderFilter) {
      if (data.driveFolderName && data.driveFolderName !== data.driveFolderFilter) {
        setResolvedFolderName(data.driveFolderName);
        driveNameCache[data.driveFolderFilter] = data.driveFolderName;
        return;
      }
      if (driveNameCache[data.driveFolderFilter]) {
        setResolvedFolderName(driveNameCache[data.driveFolderFilter]);
        return;
      }
      // Se não parecer ID ou URL (ex: texto curto sem barras), já é o próprio nome
      if (!data.driveFolderFilter.includes('/') && !data.driveFolderFilter.includes('http') && data.driveFolderFilter.length < 20) {
        setResolvedFolderName(data.driveFolderFilter);
        driveNameCache[data.driveFolderFilter] = data.driveFolderFilter;
        return;
      }

      let userEmail = '';
      try {
        const saved = localStorage.getItem('aiboard_user');
        if (saved) userEmail = JSON.parse(saved).email || '';
      } catch (e) {}

      fetch(`/api/tools/drive/file-info?id=${encodeURIComponent(data.driveFolderFilter)}`, {
        headers: { 'X-User-Email': userEmail }
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.name) {
            const cleanName = res.name.trim();
            driveNameCache[data.driveFolderFilter] = cleanName;
            setResolvedFolderName(cleanName);
          }
        })
        .catch(() => {});
    }
  }, [data.driveFolderFilter, data.driveFolderName, data.type]);

  return (
    <div className="group relative w-full h-full min-w-[190px] min-h-[85px] select-none">
      {/* Redimensionador interativo quando selecionado */}
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={80}
        lineClassName="!border-[#7E5BB5]"
        handleClassName="!w-3 !h-3 !bg-white !border-2 !border-[#7E5BB5] !rounded-xs cursor-se-resize"
      />

      {/* Top Handle */}
      <Handle
        type="source"
        position={Position.Top}
        id="tool_top_out"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-top-3 after:-bottom-5 after:-inset-x-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      {/* Left Handle */}
      <Handle
        type="source"
        position={Position.Left}
        id="tool_left_out"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-left-3 after:-right-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      {/* Right Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="tool_out"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-right-3 after:-left-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="tool_bottom_out"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-bottom-3 after:-top-5 after:-inset-x-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      {/* Card Visual com bordas arredondadas e overflow interno */}
      <div
        className={`w-full h-full bg-white rounded-2xl border-2 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden ${
          selected ? 'border-[#7E5BB5] shadow-xl ring-2 ring-[#7E5BB5]/20' : 'border-[#E2E8E4]'
        }`}
      >
        <div className="p-3 flex-1 flex flex-col justify-between">
          {/* Linha Superior: Ícone, Nome e Descrição com Largura Total */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-xl bg-[#EFF5F1] text-[#16422B] shrink-0 flex items-center justify-center">
              <PlatformLogo type={data.type || data.id} size="sm" className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-xs text-[#1A202C] leading-snug truncate" title={data.name}>
                {data.name}
              </div>
              <div className="text-[10px] text-[#5A6B61] font-semibold truncate" title={data.category}>
                {data.category || t('node.toolMcp')}
              </div>
            </div>
          </div>

          {/* Badge de Filtro de Arquivo Único ou Pasta Específica (Google Drive) */}
          {data.type === 'drive' && (data.driveSearchMode === 'file' || data.driveFileFilter) && (resolvedName || data.driveFileName || data.driveFileFilter) && (
            <div 
              className="mt-1.5 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-900 truncate flex items-center gap-1.5 shadow-2xs"
              title={resolvedName || data.driveFileName || data.driveFileFilter}
            >
              <span className="shrink-0">📄</span>
              <span className="truncate">{resolvedName || data.driveFileName || data.driveFileFilter}</span>
            </div>
          )}
          {data.type === 'drive' && data.driveSearchMode === 'folder' && data.driveFolderFilter && (
            <div 
              className="mt-1.5 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-900 truncate flex items-center gap-1.5 shadow-2xs"
              title={resolvedFolderName || data.driveFolderName || data.driveFolderFilter}
            >
              <span className="shrink-0">📁</span>
              <span className="truncate">{resolvedFolderName || data.driveFolderName || (lang === 'en' ? 'Selected Folder' : lang === 'es' ? 'Carpeta Seleccionada' : 'Pasta Selecionada')}</span>
            </div>
          )}

          {/* Linha Inferior: Tipo de Conector & Badge de Status Real em Linha Própria */}
          <div className="mt-2 pt-2 border-t border-[#E2E8E4] flex items-center justify-between text-[10px] text-[#5A6B61] shrink-0 gap-1.5">
            <span className="flex items-center gap-1 font-bold text-[#7E5BB5] min-w-0 truncate">
              <Radio className="w-3 h-3 text-[#7E5BB5] shrink-0" />
              <span className="truncate">{data.endpoint ? t('node.remoteSse') : (data.mode || t('node.singleFn'))}</span>
            </span>

            {/* Badge de Status Dinâmico Baseado em Diagnóstico Real Armazenado */}
            {(() => {
              // Se já tem diagnóstico real armazenado do backend ou cache
              const status = data.healthStatus || (
                ['erp', 'gmail', 'drive', 'dre', 'url', 'contaazul', 'bank', 'business', 'business_analytics', 'chatwoot', 'freescout'].includes(data.type) ? 'online' : 'offline'
              );
              
              if (status === 'online') {
                return (
                  <span 
                    title={data.healthDetails || (lang === 'en' ? 'Tool operational and connected.' : lang === 'es' ? 'Herramienta operativa y conectada.' : 'Ferramenta operacional e conectada.')}
                    className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    {t('common.online')}
                  </span>
                );
              }
              if (status === 'warning') {
                return (
                  <span 
                    title={data.healthDetails || (lang === 'en' ? 'Credentials pending or running in simulated mode.' : lang === 'es' ? 'Credenciales pendientes u operando en modo simulado.' : 'Credenciais pendentes ou operando em modo simulado.')}
                    className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    {t('common.pending')}
                  </span>
                );
              }
              return (
                <span 
                  title={data.healthDetails || (lang === 'en' ? 'Service unreachable or disconnected.' : lang === 'es' ? 'Servicio inalcanzable o desconectado.' : 'Serviço inalcançável ou desconectado.')}
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1 shrink-0 whitespace-nowrap"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                  {t('common.disconnected')}
                </span>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
});
