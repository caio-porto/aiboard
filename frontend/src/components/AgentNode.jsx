import React, { memo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { Bot, Wrench, Sparkles, Crown, Briefcase, Settings2, Megaphone, Users, Terminal } from 'lucide-react';
import { useLanguage } from '../i18n';

export const AgentNode = memo(({ id, data, selected }) => {
  const { t, lang } = useLanguage();
  const isLead = data.isLead;
  const dept = (data.department || '').toLowerCase();
  const lbl = (pt, en, es) => (lang === 'en' ? en : lang === 'es' ? es : pt);

  let headerBg = isLead ? 'bg-[#16422B] text-white' : 'bg-[#EFF5F1] text-[#16422B]';
  let iconBg = isLead ? 'bg-white/10 text-white' : 'bg-[#16422B] text-white';
  let selectedBorder = 'border-[#16422B] shadow-2xl ring-2 ring-[#16422B]/20';
  let modelColor = isLead ? 'text-emerald-200' : 'text-[#16422B]/80';
  let nodeIcon = <Bot className="w-5 h-5" />;
  let badge = null;

  if (isLead) {
    headerBg = 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-white';
    iconBg = 'bg-amber-900/50 text-amber-200';
    selectedBorder = 'border-amber-600 shadow-2xl ring-2 ring-amber-500/20';
    modelColor = 'text-amber-100';
    nodeIcon = <Crown className="w-5 h-5 text-amber-300" />;
    badge = (
      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 uppercase tracking-wider flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0">
        <Crown className="w-2.5 h-2.5 shrink-0" />
        <span>{data.roleBadge || data.roleTitle || lbl('Líder', 'Leader', 'Líder')}</span>
      </span>
    );
  } else if (dept === 'ceo') {
    headerBg = 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 text-white';
    iconBg = 'bg-amber-900/50 text-amber-200';
    selectedBorder = 'border-amber-600 shadow-2xl ring-2 ring-amber-500/20';
    modelColor = 'text-amber-100';
    nodeIcon = <Crown className="w-5 h-5 text-amber-300" />;
    badge = (
      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 uppercase tracking-wider flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0">
        <Crown className="w-2.5 h-2.5 shrink-0" /> CEO
      </span>
    );
  } else if (dept === 'cfo') {
    const isCLevel = data.isCLevel !== false;
    headerBg = isCLevel ? 'bg-gradient-to-r from-emerald-800 to-emerald-700 text-white' : 'bg-emerald-50 text-emerald-950 border-b border-emerald-100';
    iconBg = isCLevel ? 'bg-white/15 text-emerald-100' : 'bg-emerald-700 text-white';
    selectedBorder = 'border-emerald-700 shadow-2xl ring-2 ring-emerald-500/20';
    modelColor = isCLevel ? 'text-emerald-200' : 'text-emerald-800';
    nodeIcon = isCLevel ? <Briefcase className="w-5 h-5 text-emerald-200" /> : <Bot className="w-5 h-5" />;
    badge = (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0 ${
        isCLevel ? 'bg-emerald-500 text-white shadow-2xs' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
      }`}>
        {isCLevel ? '💼 CFO' : lbl('Finanças', 'Finance', 'Finanzas')}
      </span>
    );
  } else if (dept === 'coo') {
    const isCLevel = data.isCLevel !== false;
    headerBg = isCLevel ? 'bg-gradient-to-r from-blue-800 to-blue-700 text-white' : 'bg-blue-50 text-blue-950 border-b border-blue-100';
    iconBg = isCLevel ? 'bg-white/15 text-blue-100' : 'bg-blue-700 text-white';
    selectedBorder = 'border-blue-700 shadow-2xl ring-2 ring-blue-500/20';
    modelColor = isCLevel ? 'text-blue-200' : 'text-blue-800';
    nodeIcon = isCLevel ? <Settings2 className="w-5 h-5 text-blue-200" /> : <Bot className="w-5 h-5" />;
    badge = (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0 ${
        isCLevel ? 'bg-blue-500 text-white shadow-2xs' : 'bg-blue-100 text-blue-800 border border-blue-200'
      }`}>
        {isCLevel ? '⚙️ COO' : lbl('Operações', 'Operations', 'Operaciones')}
      </span>
    );
  } else if (dept === 'cmo') {
    const isCLevel = data.isCLevel !== false;
    headerBg = isCLevel ? 'bg-gradient-to-r from-purple-800 to-purple-700 text-white' : 'bg-purple-50 text-purple-950 border-b border-purple-100';
    iconBg = isCLevel ? 'bg-white/15 text-purple-100' : 'bg-purple-700 text-white';
    selectedBorder = 'border-purple-700 shadow-2xl ring-2 ring-purple-500/20';
    modelColor = isCLevel ? 'text-purple-200' : 'text-purple-800';
    nodeIcon = isCLevel ? <Megaphone className="w-5 h-5 text-purple-200" /> : <Bot className="w-5 h-5" />;
    badge = (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0 ${
        isCLevel ? 'bg-purple-500 text-white shadow-2xs' : 'bg-purple-100 text-purple-800 border border-purple-200'
      }`}>
        {isCLevel ? '📣 CMO' : 'Marketing'}
      </span>
    );
  } else if (dept === 'cpo') {
    const isCLevel = data.isCLevel !== false;
    headerBg = isCLevel ? 'bg-gradient-to-r from-rose-800 to-rose-700 text-white' : 'bg-rose-50 text-rose-950 border-b border-rose-100';
    iconBg = isCLevel ? 'bg-white/15 text-rose-100' : 'bg-rose-700 text-white';
    selectedBorder = 'border-rose-700 shadow-2xl ring-2 ring-rose-500/20';
    modelColor = isCLevel ? 'text-rose-200' : 'text-rose-800';
    nodeIcon = isCLevel ? <Users className="w-5 h-5 text-rose-200" /> : <Bot className="w-5 h-5" />;
    badge = (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 whitespace-nowrap shrink-0 ${
        isCLevel ? 'bg-rose-500 text-white shadow-2xs' : 'bg-rose-100 text-rose-800 border border-rose-200'
      }`}>
        {isCLevel ? '👥 CPO' : lbl('Gente & RH', 'People & HR', 'Personas y RRHH')}
      </span>
    );
  } else {
    const customColor = data.departmentColor || '#059669';
    badge = (
      <span
        style={{ borderColor: `${customColor}40`, color: customColor, backgroundColor: `${customColor}15` }}
        className="inline-flex items-center gap-1 text-[9px] font-bold border px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0"
      >
        <span style={{ backgroundColor: customColor }} className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"></span>
        <span>{data.departmentName || (dept ? dept.toUpperCase() : t('Ativo'))}</span>
      </span>
    );
  }

  return (
    <div className="group relative w-full h-full min-w-[240px] min-h-[120px] select-none">
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={120}
        lineClassName="!border-[#16422B]"
        handleClassName="!w-3 !h-3 !bg-white !border-2 !border-[#16422B] !rounded-xs cursor-se-resize"
      />

      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className={`!bg-[#16422B] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-top-3 after:-bottom-5 after:-inset-x-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="tools"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-left-3 after:-right-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="target"
        position={Position.Right}
        id="tools_right"
        className={`!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-right-3 after:-left-5 after:-inset-y-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className={`!bg-[#CA3D26] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md transition-opacity duration-150 z-20 after:content-[''] after:absolute after:-bottom-3 after:-top-5 after:-inset-x-3 after:rounded-full ${
          selected
            ? '!opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:!opacity-100 group-hover:pointer-events-auto'
        }`}
      />

      <Handle
        type="target"
        position={Position.Bottom}
        id="collab_in"
        className="!bg-[#7E5BB5] !w-3.5 !h-3.5 !border-2 !border-white !shadow-md opacity-0 pointer-events-none z-10"
      />

      <div
        className={`w-full h-full bg-white rounded-2xl border-2 shadow-md hover:shadow-lg transition-all flex flex-col justify-between overflow-hidden ${
          selected ? selectedBorder : 'border-[#E2E8E4]'
        }`}
      >
        <div className={`p-3 rounded-t-2xl shrink-0 ${headerBg}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${iconBg}`}>
              {nodeIcon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm leading-tight truncate" title={data.role}>
                {data.role || t('Especialista')}
              </div>
              <div className="text-[11px] font-semibold truncate opacity-90 mt-0.5" title={data.name}>
                {data.name || lbl('Agente CrewAI', 'CrewAI Agent', 'Agente CrewAI')}
              </div>

              <div className="mt-2 pt-1.5 border-t border-current/10 flex items-center justify-between gap-1.5">
                <div className={`text-[10px] font-bold tracking-wide flex items-center gap-1 min-w-0 ${modelColor}`}>
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">{data.model || 'Gemini 3.8 Flash Medium'}</span>
                </div>
                <div className="shrink-0">
                  {badge}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 flex-1 flex flex-col justify-between space-y-2 text-xs text-[#4A5568] min-h-0 w-full overflow-hidden">
          <p className="text-[11px] leading-relaxed text-gray-600 font-medium line-clamp-4 break-words whitespace-normal overflow-hidden flex-1">
            {data.goal || lbl('Executa tarefas designadas no ecossistema AI Board.', 'Executes assigned tasks in the AI Board ecosystem.', 'Ejecuta tareas asignadas en el ecosistema AI Board.')}
          </p>

          <div className="pt-2 border-t border-[#E2E8E4] flex items-center justify-between text-[11px] shrink-0 gap-1.5">
            <span className="flex items-center gap-1 font-semibold text-[#16422B] min-w-0 truncate">
              <Wrench className="w-3.5 h-3.5 text-[#7E5BB5] shrink-0" />
              <span className="truncate">
                {data.toolsCount !== undefined
                  ? `${data.toolsCount} ${lbl('Conectores', 'Connectors', 'Conectores')}`
                  : lbl('MCP Ativo', 'MCP Active', 'MCP Activo')}
              </span>
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.onNodeAction) data.onNodeAction(id, 'workspace');
                }}
                className="p-1 rounded-lg text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100 hover:text-emerald-950 border border-emerald-200 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold whitespace-nowrap shrink-0"
                title={lbl('Abrir Workspace & Scripts Próprios deste Agente (Frugal AI)', 'Open Agent Workspace & Custom Scripts (Frugal AI)', 'Abrir Workspace y Scripts Propios del Agente (Frugal AI)')}
              >
                <Terminal className="w-3 h-3 text-emerald-700 shrink-0" />
                <span>Scripts</span>
              </button>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span>{t('studio.ready')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
