import React, { useState, useEffect } from 'react';
import {
  History,
  X,
  RotateCcw,
  PlusCircle,
  MinusCircle,
  Edit3,
  Clock,
  User,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { formatBrtDateTime } from '../utils/dateUtils';
import { useLanguage } from '../i18n';

export function CanvasHistoryModal({ isOpen, onClose, onRollbackSuccess, user }) {
  const { t, tr } = useLanguage();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isAdmin = user?.role === 'admin';

  const fetchHistory = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/canvas/history', {
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (!res.ok) throw new Error(tr('Falha ao carregar histórico de auditoria'));
      const data = await res.json();
      setHistory(data);
      if (data.length > 0 && expandedId === null) {
        setExpandedId(data[0].id);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const handleRollback = async (historyId, summary) => {
    if (!isAdmin) {
      alert(t('common.adminOnly'));
      return;
    }
    const confirmed = window.confirm(
      `${tr('Deseja realmente reverter o organograma para a versão')} #${historyId}?\n"${summary}"`
    );
    if (!confirmed) return;

    setRollbackLoading(historyId);
    try {
      const res = await fetch(`/api/canvas/rollback/${historyId}`, {
        method: 'POST',
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao reverter');
      }
      alert(`${tr('Versão')} #${historyId} ${tr('restaurada com sucesso!')}`);
      if (onRollbackSuccess) {
        onRollbackSuccess();
      }
      onClose();
    } catch (err) {
      alert(tr('Erro ao reverter') + ': ' + err.message);
    } finally {
      setRollbackLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white border border-[#E2E8E4] rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8E4] flex items-center justify-between bg-[#F8FAF9] gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0">
              <History className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-[#16422B] flex items-center gap-2 flex-wrap">
                <span className="truncate">{t('canvasHistory.title')}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                  {t('canvasHistory.safeDiff')}
                </span>
              </h3>
              <p className="text-[11px] text-[#5A6B61] truncate">
                {t('canvasHistory.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-gray-500 gap-2">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-semibold">{t('canvasHistory.loading')}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!loading && !errorMsg && history.length === 0 && (
            <div className="py-12 text-center text-gray-500 text-xs">
              {t('canvasHistory.empty')}
            </div>
          )}

          {!loading &&
            history.map((item) => {
              const isExpanded = expandedId === item.id;
              const diff = item.diff || {};
              const dateStr = item.created_at
                ? formatBrtDateTime(item.created_at)
                : '';

              const added = diff.added_nodes || [];
              const removed = diff.removed_nodes || [];
              const modified = diff.modified_nodes || [];
              const addedEdges = diff.added_edges || [];
              const removedEdges = diff.removed_edges || [];

              return (
                <div
                  key={item.id}
                  className="border border-[#E2E8E4] rounded-2xl bg-white shadow-2xs hover:border-[#CBD5E1] transition overflow-hidden"
                >
                  <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-gray-50/50">
                    <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
                      <span className="px-2 py-0.5 bg-[#16422B] text-white text-[11px] font-black rounded-lg shrink-0">
                        #{item.id}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-[#16422B]">
                          <span className="truncate">{item.summary}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-[#5A6B61] mt-0.5">
                          <span className="flex items-center gap-1 font-semibold whitespace-nowrap">
                            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                            {dateStr}
                          </span>
                          <span className="flex items-center gap-1 font-semibold truncate">
                            <User className="w-3 h-3 text-gray-400 shrink-0" />
                            {item.author}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="px-2.5 py-1 text-xs font-bold text-[#5A6B61] hover:text-[#16422B] hover:bg-[#EFF5F1] rounded-xl transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <span>{isExpanded ? t('canvasHistory.hideDiff') : t('canvasHistory.viewDiff')}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleRollback(item.id, item.summary)}
                          disabled={rollbackLoading === item.id}
                          className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-extrabold transition shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <RotateCcw className={`w-3 h-3 shrink-0 ${rollbackLoading === item.id ? 'animate-spin' : ''}`} />
                          <span>{rollbackLoading === item.id ? t('canvasHistory.reverting') : t('canvasHistory.rollback')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detalhes do DIFF Expandido */}
                  {isExpanded && (
                    <div className="p-4 border-t border-[#E2E8E4] bg-white space-y-3 animate-in fade-in">
                      {/* Nós Adicionados */}
                      {added.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1">
                          <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-800">
                            <PlusCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{t('canvasHistory.blocksAdded')} ({added.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {added.map((n, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold rounded-lg"
                              >
                                + {n.name} <span className="opacity-60 text-[9px]">({n.id})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Nós Removidos */}
                      {removed.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-200 space-y-1">
                          <div className="flex items-center gap-1 text-[11px] font-extrabold text-red-800">
                            <MinusCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>{t('canvasHistory.blocksRemoved')} ({removed.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {removed.map((n, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-red-100 border border-red-300 text-red-900 text-[11px] font-bold rounded-lg"
                              >
                                - {n.name} <span className="opacity-60 text-[9px]">({n.id})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Nós Modificados (Campos Específicos) */}
                      {modified.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2">
                          <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-900">
                            <Edit3 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>{t('canvasHistory.fieldsModified')} ({modified.length}):</span>
                          </div>
                          <div className="space-y-2 pt-1">
                            {modified.map((m, i) => (
                              <div key={i} className="text-xs bg-white p-2.5 rounded-xl border border-amber-200 shadow-2xs">
                                <span className="font-extrabold text-[#16422B] text-[11px] block mb-1">
                                  {m.name} <span className="text-gray-400 font-normal">({m.id})</span>
                                </span>
                                <div className="space-y-1.5">
                                  {Object.entries(m.changes || {}).map(([key, change]) => (
                                    <div key={key} className="grid grid-cols-1 sm:grid-cols-12 gap-1 text-[10px] items-center">
                                      <span className="sm:col-span-3 font-mono font-bold text-gray-600">{key}:</span>
                                      <div className="sm:col-span-9 flex items-center gap-1.5 flex-wrap">
                                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-200 font-mono line-through max-w-full truncate">
                                          {String(change.before ?? 'null')}
                                        </span>
                                        <span className="text-gray-400 font-bold">➔</span>
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold max-w-full truncate">
                                          {String(change.after ?? 'null')}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Conexões */}
                      {(addedEdges.length > 0 || removedEdges.length > 0) && (
                        <div className="text-[11px] text-gray-600 flex items-center gap-3 pt-1">
                          {addedEdges.length > 0 && (
                            <span className="text-emerald-700 font-semibold">+{addedEdges.length} {t('canvasHistory.connectionsCreated')}</span>
                          )}
                          {removedEdges.length > 0 && (
                            <span className="text-red-700 font-semibold">-{removedEdges.length} {t('canvasHistory.connectionsRemoved')}</span>
                          )}
                        </div>
                      )}

                      {added.length === 0 && removed.length === 0 && modified.length === 0 && addedEdges.length === 0 && removedEdges.length === 0 && (
                        <div className="text-[11px] text-gray-500 italic py-1">
                          {t('canvasHistory.noStructuralChanges')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8E4] bg-[#F8FAF9] flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A6B61]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{t('canvasHistory.immutableAuditNote')}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#16422B] text-white font-bold rounded-xl hover:bg-[#2B6143] transition cursor-pointer whitespace-nowrap"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
