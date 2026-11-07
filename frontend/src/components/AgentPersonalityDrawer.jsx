import React, { useState, useEffect } from 'react';
import { Smile, X, Save, Check, Sparkles, Lock } from 'lucide-react';
import { useLanguage } from '../i18n';

const TONE_PRESETS = [
  { id: 'analitico', label: 'Analítico e Direto (Diretoria)', desc: 'Foco em números exatos, concisão e tabelas executivas.' },
  { id: 'operacional', label: 'Rápido e Operacional (Loja/PDV)', desc: 'Instruções curtas, focadas em checklist e resolução imediata.' },
  { id: 'conciliador', label: 'Formal e Conciliador (Financeiro)', desc: 'Linguagem contábil, precisão fiscal e auditoria de saldos.' },
  { id: 'didatico', label: 'Didático e Paciente (Treinamento)', desc: 'Explica conceitos passo a passo e cita manuais de procedimento.' },
  { id: 'custom', label: 'Personalizado', desc: 'Definido livremente nas diretrizes.' }
];

export function AgentPersonalityDrawer({ agent, onClose, user }) {
  const { t, tr } = useLanguage();
  const [tone, setTone] = useState('Analítico e Direto (Diretoria)');
  const [guidelines, setGuidelines] = useState('');
  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!agent) return;
    setLoading(true);
    fetch(`/api/agents/${agent.id}/personality`)
      .then((r) => r.json())
      .then((data) => {
        setTone(data.tone || 'Analítico e Direto (Diretoria)');
        setGuidelines(data.guidelines || tr('Sempre responda de forma sucinta com números exatos. Formate tabelas em Markdown.'));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao buscar personalidade:', err);
        setTone('Analítico e Direto (Diretoria)');
        setGuidelines(tr('Sempre responda de forma sucinta com números exatos. Formate tabelas em Markdown.'));
        setLoading(false);
      });
  }, [agent]);

  const handleSave = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/agents/${agent.id}/personality`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ tone, guidelines })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao salvar');
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      alert(tr('Erro ao salvar personalidade') + ': ' + err.message);
    }
  };

  if (!agent) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-110 bg-white border-l border-[#E2E8E4] shadow-2xl z-50 flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex items-center justify-between bg-[#F8FAF9] gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 shrink-0">
            <Smile className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm text-[#16422B] truncate">{t('agentPersonality.title')}</h3>
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
          <div className="py-12 text-center text-gray-400">{t('agentPersonality.loading')}</div>
        ) : (
          <>
            <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900 leading-relaxed">
                {t('agentPersonality.description')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#16422B] mb-2">
                {t('agentPersonality.toneLabel')}
              </label>
              <div className="space-y-2">
                {TONE_PRESETS.map((preset) => {
                  const isSelected = tone.startsWith(preset.label.split(' ')[0]);
                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        if (isAdmin) setTone(preset.label);
                      }}
                      className={`p-3 rounded-2xl border transition ${
                        isAdmin ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        isSelected
                          ? 'border-[#16422B] bg-[#EFF5F1] ring-1 ring-[#16422B]'
                          : 'border-[#E2E8E4] hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-bold text-xs text-[#16422B]">{tr(preset.label)}</div>
                      <div className="text-[11px] text-[#5A6B61] mt-0.5">{tr(preset.desc)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#16422B] mb-1.5">
                {t('agentPersonality.guidelinesLabel')}
              </label>
              <textarea
                rows={5}
                value={guidelines}
                readOnly={!isAdmin}
                onChange={(e) => setGuidelines(e.target.value)}
                className={`w-full text-xs p-3 border border-[#E2E8E4] rounded-2xl focus:outline-none focus:border-[#16422B] font-mono text-[11px] leading-relaxed ${
                  !isAdmin ? 'bg-gray-50 cursor-default' : ''
                }`}
                placeholder={t('agentPersonality.guidelinesPlaceholder')}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 sm:p-5 border-t border-[#E2E8E4] bg-[#F8FAF9] flex flex-wrap items-center justify-between gap-3">
        {savedSuccess ? (
          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
            <Check className="w-4 h-4 shrink-0" /> {t('agentPersonality.savedSuccess')}
          </span>
        ) : (
          <span className="text-[11px] text-gray-500 font-medium">
            {isAdmin ? t('agentPersonality.appliedImmediately') : t('common.adminOnly')}
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
              className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              {t('agentPersonality.saveProfile')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
