import React, { useState, useEffect } from 'react';
import { Building2, X, Save, Check, Target, Compass, ShieldCheck, Lock, MessageSquareText, Sparkles, BookOpen, Plus } from 'lucide-react';
import { OFFICIAL_LOGO_URL } from '../utils/reportFormatters';
import { CompanyLogo } from './CompanyLogo';
import { useLanguage } from '../i18n';

const FORMAT_PRESETS = [
  {
    id: 'direct',
    label: '🎯 Resposta Executiva Direta (Sem Burocracia)',
    desc: 'Vai direto ao ponto na 1ª linha e exibe apenas a resposta e tabelas solicitadas.',
    content:
      "1. Responda DIRETAMENTE ao que foi solicitado logo na primeira linha, sem enrolação ou preâmbulos.\n" +
      "2. Se a pergunta solicitar dados, lista, nomes, horários ou tabelas (ex: colaboradores escalados, valores de venda, canais, estoque), apresente DIRETAMENTE a tabela/dados solicitados em Markdown limpo e bem formatado.\n" +
      "3. É PROIBIDO gerar cabeçalhos burocráticos de comitê corporativo como '🏛️ BOLETIM EXECUTIVO AI Board — COMITÊ ESTRATÉGICO' ou 'De: CEO para Conselho'.\n" +
      "4. É PROIBIDO incluir seções corporativas não solicitadas, tais como '1. Diagnóstico Consolidado e Números Oficiais' (especialmente com faturamento R$ 0,00 quando a pergunta não for financeira), '2. Decisão Estratégica do Comitê' ou '3. Ordens Executivas ao COO/CFO/CMO'.\n" +
      "5. Entregue apenas a Resposta Executiva Direta e a tabela/dado pedido, com zero alucinação."
  },
  {
    id: 'metamuse',
    label: '⚡ Protocolo Meta Muse (Zero-Click Resolution)',
    desc: 'Formato estruturado: [STATUS / ALERTA], [DIAGNÓSTICO & DADOS], [AÇÃO JÁ EXECUTADA] e [DECISÃO NECESSÁRIA].',
    content:
      "Estruture comunicados proativos e alertas operacionais estritamente no padrão Zero-Click Resolution (Meta Muse):\n" +
      "• [STATUS / ALERTA]: Resumo direto em 1 linha.\n" +
      "• [DIAGNÓSTICO & DADOS]: O que foi encontrado com verificação cruzada 360º (valores exatos, datas, IDs).\n" +
      "• [AÇÃO JÁ EXECUTADA]: O que os agentes já resolveram autonomamente antes de notificar.\n" +
      "• [DECISÃO NECESSÁRIA]: O que precisa de 1 clique ou aprovação humana."
  },
  {
    id: 'committee',
    label: '🏛️ Boletim Executivo Completo (Comitê)',
    desc: 'Relatório formal com Diagnóstico, Decisão do Comitê e Ordens Executivas.',
    content:
      "Apresente um Boletim Executivo Oficial AI Board contendo:\n" +
      "1. 📌 Resposta Executiva Direta\n" +
      "2. 📊 Diagnóstico Consolidado e Números Oficiais (Tabelas Markdown)\n" +
      "3. 🏛️ Decisão Estratégica do Comitê Executivo\n" +
      "4. 🎯 Ordens Executivas e Delegações Práticas (COO, CFO, CMO, CPO e Estoque)"
  }
];

export function TownHallModal({ isOpen, onClose, user }) {
  const { t, tr } = useLanguage();
  const [activeTab, setActiveTab] = useState('townhall'); // 'townhall' | 'learned_rules'
  const [vision, setVision] = useState('');
  const [okrs, setOkrs] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [responseFormat, setResponseFormat] = useState('');
  const [learnedRulesContent, setLearnedRulesContent] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newRuleDept, setNewRuleDept] = useState('Global (Todos os Agentes)');
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [ruleAddedSuccess, setRuleAddedSuccess] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      fetch('/api/townhall').then((r) => r.json()).catch(() => ({})),
      fetch('/api/learned-rules').then((r) => r.json()).catch(() => ({}))
    ])
      .then(([thData, rulesData]) => {
        setVision(thData.vision || '');
        setOkrs(thData.okrs || '');
        setGuidelines(thData.guidelines || '');
        setResponseFormat(thData.response_format || FORMAT_PRESETS[0].content);
        setLearnedRulesContent(rulesData.content || '');
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao buscar dados do Town Hall:', err);
        setLoading(false);
      });
  }, [isOpen]);

  const handleSave = async () => {
    if (!isAdmin) return;
    try {
      const resTh = await fetch('/api/townhall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          vision,
          okrs,
          guidelines,
          response_format: responseFormat
        })
      });
      if (!resTh.ok) {
        const err = await resTh.json();
        throw new Error(err.detail || 'Falha ao salvar Town Hall');
      }

      if (learnedRulesContent) {
        await fetch('/api/learned-rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Email': user?.email || ''
          },
          body: JSON.stringify({ content: learnedRulesContent })
        });
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      alert(tr('Erro ao salvar') + ': ' + err.message);
    }
  };

  const handleAddQuickRule = async () => {
    if (!isAdmin || !newRuleText.trim()) return;
    try {
      const res = await fetch('/api/learned-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          new_rule: newRuleText.trim(),
          department: newRuleDept,
          agent_id: user?.email || 'fundador'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao adicionar regra');
      setLearnedRulesContent(data.content || learnedRulesContent);
      setNewRuleText('');
      setRuleAddedSuccess(t('townhall.ruleAddedSuccess'));
      setTimeout(() => setRuleAddedSuccess(''), 3500);
    } catch (err) {
      alert(tr('Erro ao registrar regra') + ': ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-[#E2E8E4] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E2E8E4] flex items-center justify-between bg-[#F8FAF9] gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="px-3 py-2 rounded-2xl bg-white border border-[#E2E8E4] flex items-center gap-2 shadow-2xs shrink-0">
              <CompanyLogo className="h-5 max-w-[110px] object-contain" />
              <Building2 className="w-4 h-4 text-[#16422B] shrink-0" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base text-[#16422B] truncate">
                  {t('townhall.title')}
                </h2>
                {!isAdmin && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Lock className="w-3 h-3 text-amber-600 shrink-0" /> {t('common.readOnly')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5A6B61] font-semibold truncate">
                {t('townhall.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-200 text-gray-500 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-abas */}
        <div className="px-5 pt-3 bg-[#F8FAF9] border-b border-[#E2E8E4] flex gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('townhall')}
            className={`px-4 py-2 rounded-t-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'townhall'
                ? 'bg-white text-[#16422B] border-[#16422B] shadow-2xs'
                : 'text-[#5A6B61] border-transparent hover:text-[#16422B]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            {t('townhall.tabGuidelines')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('learned_rules')}
            className={`px-4 py-2 rounded-t-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
              activeTab === 'learned_rules'
                ? 'bg-white text-[#16422B] border-[#16422B] shadow-2xs'
                : 'text-[#5A6B61] border-transparent hover:text-[#16422B]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            {t('townhall.tabLearnedRules')}
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 flex-1 overflow-y-auto text-xs">
          {loading ? (
            <div className="py-12 text-center text-gray-400">{t('townhall.loading')}</div>
          ) : activeTab === 'townhall' ? (
            <>
              {/* SEÇÃO 1: FORMATO PADRÃO DE RESPOSTA DO CHAT (DESTAQUE PRINCIPAL) */}
              <div className="p-4 rounded-2xl bg-[#EFF5F1]/70 border border-[#16422B]/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-extrabold text-[#16422B] flex items-center gap-1.5">
                    <MessageSquareText className="w-4 h-4 text-[#16422B] shrink-0" />
                    {t('townhall.responseFormatLabel')}
                  </label>
                  <span className="text-[10px] font-bold bg-[#16422B] text-white px-2.5 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                    <Sparkles className="w-3 h-3 shrink-0" /> {t('townhall.editableViaUi')}
                  </span>
                </div>

                <p className="text-[11px] text-[#5A6B61] leading-relaxed">
                  {t('townhall.responseFormatDesc')}
                </p>

                {isAdmin && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {FORMAT_PRESETS.map((preset) => {
                      const isActive = responseFormat.trim() === preset.content.trim();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setResponseFormat(preset.content)}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                            isActive
                              ? 'bg-[#16422B] text-white border-[#16422B] shadow-xs'
                              : 'bg-white text-[#16422B] border-[#E2E8E4] hover:border-[#16422B]/50'
                          }`}
                        >
                          <div className="font-extrabold text-[11px] leading-snug">{tr(preset.label)}</div>
                          <div className={`text-[10px] mt-1 leading-tight ${isActive ? 'text-emerald-100' : 'text-[#5A6B61]'}`}>
                            {tr(preset.desc)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <textarea
                  rows={6}
                  value={responseFormat}
                  readOnly={!isAdmin}
                  onChange={(e) => setResponseFormat(e.target.value)}
                  className={`w-full text-xs p-3 bg-white border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] font-mono text-[11px] leading-relaxed ${
                    !isAdmin ? 'bg-gray-50 cursor-default' : ''
                  }`}
                  placeholder={tr('Defina como o agente líder deve formatar a resposta final...')}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#16422B] mb-1.5 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#16422B] shrink-0" />
                  {t('townhall.visionLabel')}
                </label>
                <textarea
                  rows={2}
                  value={vision}
                  readOnly={!isAdmin}
                  onChange={(e) => setVision(e.target.value)}
                  className={`w-full text-xs p-3 border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] leading-relaxed font-medium ${
                    !isAdmin ? 'bg-gray-50 cursor-default' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#16422B] mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[#CA3D26] shrink-0" />
                  {t('townhall.okrsLabel')}
                </label>
                <textarea
                  rows={3}
                  value={okrs}
                  readOnly={!isAdmin}
                  onChange={(e) => setOkrs(e.target.value)}
                  className={`w-full text-xs p-3 border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] font-mono text-[11px] leading-relaxed ${
                    !isAdmin ? 'bg-gray-50 cursor-default' : ''
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#16422B] mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#7E5BB5] shrink-0" />
                  {t('townhall.guidelinesLabel')}
                </label>
                <textarea
                  rows={2}
                  value={guidelines}
                  readOnly={!isAdmin}
                  onChange={(e) => setGuidelines(e.target.value)}
                  className={`w-full text-xs p-3 border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] leading-relaxed font-medium ${
                    !isAdmin ? 'bg-gray-50 cursor-default' : ''
                  }`}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold text-[#16422B] text-xs flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-700 shrink-0" />
                    {t('townhall.knowledgeBaseTitle')}
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-700 text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
                    {t('townhall.syncedWithDrive')}
                  </span>
                </div>
                <p className="text-[11px] text-[#5A6B61] leading-relaxed">
                  {t('townhall.knowledgeBaseDesc')}
                </p>

                {isAdmin && (
                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <select
                      value={newRuleDept}
                      onChange={(e) => setNewRuleDept(e.target.value)}
                      className="text-xs px-3 py-2 bg-white border border-[#E2E8E4] rounded-xl font-bold text-[#16422B] focus:outline-none focus:border-[#16422B]"
                    >
                      <option value="Global">🌐 Global</option>
                      <option value="COO / Operações">🔵 COO / Operations</option>
                      <option value="CFO / Financeiro">🟢 CFO / Finance</option>
                      <option value="CMO / Marketing">🟣 CMO / Marketing</option>
                      <option value="CPO / RH & Escalas">🟠 CPO / HR & People</option>
                    </select>
                    <input
                      type="text"
                      value={newRuleText}
                      onChange={(e) => setNewRuleText(e.target.value)}
                      placeholder={t('townhall.newRulePlaceholder')}
                      className="flex-1 text-xs px-3 py-2 bg-white border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                    />
                    <button
                      type="button"
                      onClick={handleAddQuickRule}
                      className="px-3.5 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      {t('townhall.registerRule')}
                    </button>
                  </div>
                )}

                {ruleAddedSuccess && (
                  <div className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0" /> {ruleAddedSuccess}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#16422B] mb-1.5">
                  {t('townhall.consolidatedHistoryLabel')}
                </label>
                <textarea
                  rows={14}
                  value={learnedRulesContent}
                  readOnly={!isAdmin}
                  onChange={(e) => setLearnedRulesContent(e.target.value)}
                  className={`w-full text-xs p-3.5 bg-white border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] font-mono text-[11px] leading-relaxed ${
                    !isAdmin ? 'bg-gray-50 cursor-default' : ''
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-[#E2E8E4] bg-[#F8FAF9] flex flex-wrap items-center justify-between gap-2">
          {savedSuccess ? (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" /> {t('townhall.savedSuccess')}
            </span>
          ) : (
            <span className="text-[11px] text-[#5A6B61] font-semibold">
              {isAdmin ? t('townhall.appliedImmediately') : t('common.adminOnly')}
            </span>
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#E2E8E4] text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer whitespace-nowrap"
            >
              {t('common.close')}
            </button>
            {isAdmin && (
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-4 h-4 shrink-0" />
                {t('common.saveChanges')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
