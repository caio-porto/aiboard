import React, { useState, useEffect } from 'react';
import { Brain, X, Plus, Trash2, Save, Sparkles, Check, Lock } from 'lucide-react';
import { useLanguage } from '../i18n';

export function AgentMemoryDrawer({ agent, onClose, user }) {
  const { t, tr } = useLanguage();
  const [memoryText, setMemoryText] = useState('');
  const [learnedFacts, setLearnedFacts] = useState([]);
  const [newFact, setNewFact] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!agent) return;
    setLoading(true);
    fetch(`/api/agents/${agent.id}/memory`)
      .then((r) => r.json())
      .then((data) => {
        setMemoryText(data.memory_text || tr('O agente retém o histórico de consultas e métricas aprendidas nas interações recentes.'));
        setLearnedFacts(data.learned_facts || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao buscar memória:', err);
        setMemoryText(tr('O agente retém o histórico de consultas e métricas aprendidas nas interações recentes.'));
        setLearnedFacts([
          tr('Acompanha métricas operacionais, canais de venda e indicadores diários.')
        ]);
        setLoading(false);
      });
  }, [agent]);

  const handleAddFact = (e) => {
    e.preventDefault();
    if (!isAdmin || !newFact.trim()) return;
    setLearnedFacts([...learnedFacts, newFact.trim()]);
    setNewFact('');
  };

  const handleRemoveFact = (index) => {
    if (!isAdmin) return;
    setLearnedFacts(learnedFacts.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/agents/${agent.id}/memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          name: agent.data?.name || '',
          role: agent.data?.role || '',
          memory_text: memoryText,
          learned_facts: learnedFacts
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao salvar');
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      alert(tr('Erro ao salvar memória do agente') + ': ' + err.message);
    }
  };

  if (!agent) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-110 bg-white border-l border-[#E2E8E4] shadow-2xl z-50 flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex items-center justify-between bg-[#F8FAF9] gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-[#EFF5F1] text-[#7E5BB5] shrink-0">
            <Brain className="w-5 h-5 text-[#7E5BB5]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm text-[#16422B] truncate">{t('agentMemory.title')}</h3>
              {!isAdmin && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1 whitespace-nowrap">
                  <Lock className="w-3 h-3 text-amber-600 shrink-0" /> {t('common.readOnly')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#5A6B61] font-semibold truncate max-w-64">
              {agent.data?.name || agent.data?.role}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-500 transition shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5 space-y-5 flex-1 overflow-y-auto text-xs">
        {loading ? (
          <div className="py-12 text-center text-gray-400">{t('agentMemory.loading')}</div>
        ) : (
          <>
            <div className="bg-[#EFF5F1] p-3.5 rounded-2xl border border-emerald-100 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#16422B] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#16422B] leading-relaxed">
                {t('agentMemory.description')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#16422B] mb-1.5">
                {t('agentMemory.summaryLabel')}
              </label>
              <textarea
                rows={4}
                value={memoryText}
                readOnly={!isAdmin}
                onChange={(e) => setMemoryText(e.target.value)}
                className={`w-full text-xs p-3 border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#7E5BB5] leading-relaxed ${
                  !isAdmin ? 'bg-gray-50 cursor-default' : ''
                }`}
                placeholder={t('agentMemory.summaryPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#16422B] mb-1.5">
                {t('agentMemory.learnedFactsLabel')} ({learnedFacts.length}):
              </label>
              <div className="space-y-2 mb-3 max-h-56 overflow-y-auto">
                {learnedFacts.map((fact, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-2 p-2.5 bg-gray-50 border border-[#E2E8E4] rounded-xl text-[11px] text-gray-800"
                  >
                    <span className="leading-relaxed">{fact}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveFact(index)}
                        className="p-1 text-gray-400 hover:text-red-500 transition shrink-0"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {learnedFacts.length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-[11px] italic">
                    {t('agentMemory.noFacts')}
                  </div>
                )}
              </div>

              {/* Adicionar novo fato (Apenas Admin) */}
              {isAdmin && (
                <form onSubmit={handleAddFact} className="flex gap-2">
                  <input
                    type="text"
                    value={newFact}
                    onChange={(e) => setNewFact(e.target.value)}
                    placeholder={t('agentMemory.newFactPlaceholder')}
                    className="flex-1 text-xs px-3 py-2 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#7E5BB5]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-[#7E5BB5] hover:bg-[#6846A3] text-white rounded-xl font-bold transition flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    {t('common.insert')}
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-5 border-t border-[#E2E8E4] bg-[#F8FAF9] flex flex-wrap items-center justify-between gap-3">
        {savedSuccess ? (
          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
            <Check className="w-4 h-4 shrink-0" /> {t('agentMemory.savedSuccess')}
          </span>
        ) : (
          <span className="text-[11px] text-gray-500 font-medium">
            {isAdmin ? t('agentMemory.syncedAutomatically') : t('common.adminOnly')}
          </span>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#E2E8E4] text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition whitespace-nowrap"
          >
            {t('common.close')}
          </button>
          {isAdmin && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#7E5BB5] hover:bg-[#6846A3] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              {t('agentMemory.saveMemory')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
