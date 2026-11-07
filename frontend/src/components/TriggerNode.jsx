import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Send, Globe, Radio, Clock, MessageSquare, Headphones, Zap, ShoppingBag, UtensilsCrossed, Mail } from 'lucide-react';
import { PlatformLogo } from './PlatformLogo';
import { useLanguage } from '../i18n';

const triggerIconMap = {
  telegram: Send,
  whatsapp: MessageSquare,
  webhook: Globe,
  cron: Clock,
  freescout: Headphones,
  freescout_event: Headphones,
  delivery: ShoppingBag,
  delivery_event: ShoppingBag,
  entrega_aki_event: Globe,
  ifood_event: ShoppingBag,
  '99food_event': UtensilsCrossed,
  chatwoot: MessageSquare,
  chatwoot_event: MessageSquare,
  gmail: Mail,
  gmail_event: Mail,
  custom: Zap
};

export const TriggerNode = memo(({ data, selected }) => {
  const { t, lang } = useLanguage();
  const status = data.healthStatus || 'online';
  const lbl = (pt, en, es) => (lang === 'en' ? en : lang === 'es' ? es : pt);

  return (
    <div className="group relative w-full h-full min-w-[190px] min-h-[82px] select-none">
      <NodeResizer
        isVisible={selected}
        minWidth={180}
        minHeight={78}
        lineClassName="!border-[#CA3D26]"
        handleClassName="!w-3 !h-3 !bg-white !border-2 !border-[#CA3D26] !rounded-xs cursor-se-resize"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="trigger_out"
        className={`!bg-[#CA3D26] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-bottom-3 after:-top-5 after:-inset-x-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="source"
        position={Position.Right}
        id="trigger_right_out"
        className={`!bg-[#CA3D26] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-right-3 after:-left-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="source"
        position={Position.Left}
        id="trigger_left_out"
        className={`!bg-[#CA3D26] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-left-3 after:-right-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <div
        className={`w-full h-full bg-white rounded-2xl border-2 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden ${
          selected
            ? 'border-[#CA3D26] ring-2 ring-[#CA3D26]/20 shadow-lg'
            : status === 'warning'
            ? 'border-amber-300'
            : status === 'offline' || status === 'error'
            ? 'border-rose-300'
            : 'border-[#E2E8E4]'
        }`}
      >
        <div className="p-2.5 flex-1 flex flex-col justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-xl bg-orange-50 text-[#CA3D26] shrink-0 flex items-center justify-center">
              <PlatformLogo type={data.type || data.id} size="sm" className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col items-start">
              <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-[#CA3D26] uppercase tracking-wider leading-none mb-0.5 whitespace-nowrap">
                {t('catalog.typeTrigger')}
              </span>
              <div
                className="font-extrabold text-xs text-[#1A202C] truncate w-full leading-tight"
                title={data.label || data.name || lbl('Canal de Entrada', 'Input Channel', 'Canal de Entrada')}
              >
                {(data.label || data.name || lbl('Canal de Entrada', 'Input Channel', 'Canal de Entrada'))
                  .replace(/^Gatilho\s+/i, '')
                  .replace(/^Radar\s+(Reativo:\s*)?/i, '')}
              </div>
              <div
                className="text-[10px] text-[#5A6B61] font-semibold truncate w-full"
                title={data.subtitle || lbl('Escutando Eventos', 'Listening for Events', 'Escuchando Eventos')}
              >
                {t(data.subtitle || lbl('Escutando Eventos', 'Listening for Events', 'Escuchando Eventos'))}
              </div>
            </div>
          </div>

          <div className="mt-1.5 pt-1.5 border-t border-[#E2E8E4] flex items-center justify-between text-[10px] text-[#5A6B61] shrink-0 gap-1.5">
            <span
              className="flex items-center gap-1 font-bold text-[#CA3D26] min-w-0 truncate"
              title={data.healthDetails || data.healthLabel || lbl('Monitoramento de eventos em tempo real', 'Real-time event monitoring', 'Monitoreo de eventos en tiempo real')}
            >
              <Radio
                className={`w-3 h-3 shrink-0 ${
                  status === 'online'
                    ? 'text-emerald-500 animate-pulse'
                    : status === 'warning'
                    ? 'text-amber-500'
                    : 'text-rose-500'
                }`}
              />
              <span className="truncate">{t(data.healthLabel || lbl('Radar Ativo', 'Active Radar', 'Radar Activo'))}</span>
            </span>

            {status === 'online' ? (
              <span
                title={data.healthDetails || lbl('Gatilho operacional e conectado.', 'Trigger operational and connected.', 'Disparador operativo y conectado.')}
                className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>{t('status.online')}</span>
              </span>
            ) : status === 'warning' ? (
              <span
                title={data.healthDetails || lbl('Configuração pendente.', 'Configuration pending.', 'Configuración pendiente.')}
                className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{t('status.pending')}</span>
              </span>
            ) : (
              <span
                title={data.healthDetails || lbl('Desconectado.', 'Disconnected.', 'Desconectado.')}
                className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span>{t('status.disconnected')}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
