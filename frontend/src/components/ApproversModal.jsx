import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  Trash2, 
  UserPlus, 
  ToggleLeft, 
  ToggleRight, 
  Info, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Send,
  UserCheck,
  ShieldAlert,
  Loader2
} from 'lucide-react';

import { useLanguage } from '../i18n';

export default function ApproversModal({ isOpen, onClose }) {
  const { t, tr } = useLanguage();
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Form de novo aprovador
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newChatId, setNewChatId] = useState('');
  const [newRole, setNewRole] = useState('approver');

  const fetchApprovers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/telegram/approvers');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setApprovers(data.approvers || []);
      } else {
        setError(data.detail || tr('Falha ao carregar lista de aprovadores.'));
      }
    } catch (err) {
      setError(tr('Erro de conexão ao buscar aprovadores.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchApprovers();
    }
  }, [isOpen]);

  const handleAddApprover = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() && !newChatId.trim()) {
      setError(tr('Informe pelo menos o @username ou o Chat ID do Telegram.'));
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/telegram/approvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim().replace(/^@/, ''),
          name: newName.trim() || (newUsername ? `@${newUsername.trim().replace(/^@/, '')}` : `ID ${newChatId.trim()}`),
          chat_id: newChatId.trim() || null,
          role: newRole,
          can_approve: true,
          is_active: true,
          added_by: 'Studio Web'
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setSuccessMsg(`${tr('Aprovador')} ${newName || newUsername} ${tr('cadastrado com sucesso!')}`);
        setNewUsername('');
        setNewName('');
        setNewChatId('');
        setTimeout(() => setSuccessMsg(''), 4000);
        fetchApprovers();
      } else {
        setError(data.detail || data.message || tr('Falha ao cadastrar aprovador.'));
      }
    } catch (err) {
      setError(tr('Erro ao salvar aprovador.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (approverId, field) => {
    try {
      const res = await fetch(`/api/telegram/approvers/${approverId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field })
      });
      if (res.ok) {
        fetchApprovers();
      }
    } catch (err) {
      console.error('Erro ao alternar status do aprovador:', err);
    }
  };

  const handleDelete = async (approverId, name) => {
    if (!window.confirm(`${tr('Tem certeza que deseja remover o aprovador')} "${name}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/telegram/approvers/${approverId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSuccessMsg(tr('Aprovador removido.'));
        setTimeout(() => setSuccessMsg(''), 3000);
        fetchApprovers();
      }
    } catch (err) {
      setError(tr('Erro ao excluir aprovador.'));
    }
  };

  if (!isOpen) return null;

  const activeCount = approvers.filter(a => a.is_active && a.can_approve).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shadow-xs shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                  {t('approvers.title')}
                </h3>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                  {activeCount} {t('common.active').toLowerCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t('approvers.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificações / Alertas */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Banner Informativo */}
        <div className="mx-6 mt-4 p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <b>{t('approvers.howItWorksTitle')}</b> {t('approvers.howItWorksDesc')}
          </div>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Formulário de Adição */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {t('approvers.registerNew')}
              </h4>
            </div>
            
            <form onSubmit={handleAddApprover} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {t('approvers.telegramUser')}
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-xs text-slate-400">@</span>
                  <input
                    type="text"
                    placeholder="username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full pl-6 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {t('approvers.nameRole')}
                </label>
                <input
                  type="text"
                  placeholder="Ex: Alex Silva (Manager)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {t('approvers.chatIdOptional')}
                </label>
                <input
                  type="text"
                  placeholder="Ex: 123456789"
                  value={newChatId}
                  onChange={(e) => setNewChatId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving || (!newUsername.trim() && !newChatId.trim())}
                  className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <UserPlus className="w-3.5 h-3.5 shrink-0" />}
                  <span>{t('common.add')}</span>
                </button>
              </div>
            </form>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              {t('approvers.chatIdAutoHint')}
            </p>
          </div>

          {/* Lista de Aprovadores */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {t('approvers.registeredMembers')} ({approvers.length})
              </h4>
              <button
                onClick={fetchApprovers}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
              >
                {t('approvers.refreshList')}
              </button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span>{t('common.loading')}</span>
              </div>
            ) : approvers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                {t('approvers.emptyList')}
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {approvers.map((app) => {
                  const isPrimaryAdmin = app.role === 'admin' && app.is_primary;
                  return (
                    <div
                      key={app.id}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition bg-white dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          app.is_active && app.can_approve
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}>
                          {app.role === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                              {app.name || app.username || `ID ${app.chat_id}`}
                            </span>
                            {app.role === 'admin' && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                                Super Admin
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                            {app.username && (
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                @{app.username}
                              </span>
                            )}
                            {app.chat_id ? (
                              <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                                ID: {app.chat_id}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                                {t('approvers.waitingStart')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controles e Ações */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Botão de Permissão de Aprovação */}
                        <button
                          onClick={() => handleToggle(app.id, 'can_approve')}
                          disabled={isPrimaryAdmin}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                            app.can_approve
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>{app.can_approve ? t('approvers.approves') : t('approvers.viewsOnly')}</span>
                        </button>

                        {/* Botão Ativo / Inativo */}
                        <button
                          onClick={() => handleToggle(app.id, 'is_active')}
                          disabled={isPrimaryAdmin}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            app.is_active
                              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={app.is_active ? t('common.active') : t('common.inactive')}
                        >
                          {app.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>

                        {/* Botão Excluir */}
                        {!isPrimaryAdmin && (
                          <button
                            onClick={() => handleDelete(app.id, app.name || app.username)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition cursor-pointer"
                            title={t('common.remove')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {t('approvers.telegramCommandHint')} <code>/add_aprovador @username Name</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-lg transition cursor-pointer whitespace-nowrap"
          >
            {t('common.close')}
          </button>
        </div>

      </div>
    </div>
  );
}
