import React, { useState, useEffect } from 'react';
import {
  History,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  RefreshCw,
  User,
  Crown,
  Filter,
  Terminal,
  Mail,
  Download,
  Share2,
  ExternalLink,
  Cloud
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TaskLiveModal } from './TaskLiveModal';
import { CompanyLogo } from './CompanyLogo';
import {
  OFFICIAL_LOGO_URL,
  getOfficialBrandName,
  markdownToWhatsApp,
  buildFormattedDocHtml,
  calculateTaskCost
} from '../utils/reportFormatters';
import { formatBrtDateTime } from '../utils/dateUtils';
import { useLanguage } from '../i18n';

export function HistoryView({ user }) {
  const { t, tr } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [selectedUserFilter, setSelectedUserFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedTaskIdForLogs, setSelectedTaskIdForLogs] = useState(null);
  const [sharingTaskId, setSharingTaskId] = useState(null);
  const [creatingDriveTaskId, setCreatingDriveTaskId] = useState(null);
  const [shareToast, setShareToast] = useState('');
  const [lastDriveUrl, setLastDriveUrl] = useState('');
  const [partnerEmailsLabel, setPartnerEmailsLabel] = useState('');
  const [usdBrlRate, setUsdBrlRate] = useState(5.65);

  const isAdmin = user?.role === 'admin';

  // Carrega configurações globais (partner_emails, câmbio, etc.)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.partner_emails) {
          setPartnerEmailsLabel(data.partner_emails);
        }
        if (data.usd_brl_exchange_rate) {
          setUsdBrlRate(Number(data.usd_brl_exchange_rate) || 5.65);
        }
      })
      .catch(() => {});
  }, []);

  const handleShareEmail = async (taskItem) => {
    setSharingTaskId(taskItem.task_id);
    try {
      const res = await fetch(`/api/tasks/${taskItem.task_id}/share/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        // Ao omitir recipients fixos, o backend utiliza os partner_emails configurados em Config & Status
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const destStr = Array.isArray(data.recipients) ? data.recipients.join(', ') : partnerEmailsLabel;
        setShareToast(`✅ ${t('history.emailSentToast', { id: taskItem.task_id.slice(0, 6), dest: destStr })}`);
        setTimeout(() => setShareToast(''), 5000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || t('history.emailFailAlert'));
      }
    } catch (e) {
      alert(t('history.emailConnError'));
    } finally {
      setSharingTaskId(null);
    }
  };

  // Cria documento formatado no Google Drive e abre o link direto no navegador
  const handleCreateGoogleDriveDoc = async (taskItem) => {
    setCreatingDriveTaskId(taskItem.task_id);
    setLastDriveUrl('');
    try {
      const res = await fetch(`/api/tasks/${taskItem.task_id}/share/gdrive`, {
        method: 'POST',
        headers: { 'X-User-Email': user?.email || '' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setLastDriveUrl(data.url);
          window.open(data.url, '_blank', 'noopener,noreferrer');
          setShareToast(`📄 ${t('history.driveCreatedToast', { folder: data.folder || 'AI Board Executive Bulletins' })}`);
          setTimeout(() => setShareToast(''), 7000);
          return;
        }
      }

      // Fallback: download local caso a integração Drive retorne sem URL
      handleDownloadFormattedDocLocal(taskItem);
    } catch (e) {
      handleDownloadFormattedDocLocal(taskItem);
    } finally {
      setCreatingDriveTaskId(null);
    }
  };

  const handleDownloadFormattedDocLocal = (taskItem) => {
    const content = taskItem.result || '';
    const title = taskItem.prompt ? taskItem.prompt.slice(0, 60) : `Bulletin_${taskItem.task_id}`;
    const docHtml = buildFormattedDocHtml({
      taskId: taskItem.task_id,
      title,
      prompt: taskItem.prompt,
      content,
      createdAt: taskItem.created_at,
      userName: taskItem.user_name || taskItem.user_email || user?.name || user?.email || 'AI Board System'
    });
    const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Executive_Bulletin_${taskItem.task_id.slice(0, 8)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setShareToast(`📄 ${t('history.docDownloadedToast')}`);
    setTimeout(() => setShareToast(''), 4000);
  };

  const handleShareWhatsApp = (taskItem) => {
    const formattedBody = markdownToWhatsApp(taskItem.result || '');
    const clipped =
      formattedBody.length > 1500
        ? formattedBody.slice(0, 1500) + '\n\n_(aiboard.local)_'
        : formattedBody;
    const text = `*[AI Board] #${taskItem.task_id.slice(0, 6)}*\n\n${clipped}\n\n🔗 _https://aiboard.local_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      let url = '/api/tasks';
      if (isAdmin && selectedUserFilter) {
        url += `?user_email=${encodeURIComponent(selectedUserFilter)}`;
      }

      const res = await fetch(url, {
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/users', {
        headers: { 'X-User-Email': user?.email || '' }
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.users) setUsersList(data.users);
        })
        .catch(() => {});
    }
  }, [isAdmin, user]);

  useEffect(() => {
    loadTasks();
  }, [selectedUserFilter]);

  const filtered = tasks.filter(
    (taskItem) =>
      (taskItem.prompt || '').toLowerCase().includes(filter.toLowerCase()) ||
      (taskItem.task_id || '').toLowerCase().includes(filter.toLowerCase()) ||
      (taskItem.user_name || '').toLowerCase().includes(filter.toLowerCase()) ||
      (taskItem.user_email || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto h-full p-3 md:p-4 pb-24 md:pb-6 flex flex-col">
      {/* Header do Histórico com Identificação de Nível */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-extrabold text-[#16422B] flex items-center gap-2">
              <History className="w-5 h-5 text-[#16422B] shrink-0" />
              <span>{isAdmin ? t('history.globalTitle') : t('history.userTitle')}</span>
            </h2>
            {isAdmin ? (
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0">
                <Crown className="w-3 h-3 text-amber-700 shrink-0" /> {t('history.adminView')}
              </span>
            ) : (
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap shrink-0">
                <User className="w-3 h-3 text-emerald-600 shrink-0" /> {t('history.yourTasksOnly')}
              </span>
            )}
          </div>
          <p className="text-xs text-[#5A6B61]">
            {isAdmin ? t('history.adminSubtitle') : t('history.userSubtitle')}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-white border border-[#E2E8E4] px-2.5 py-1.5 rounded-xl text-xs">
              <Filter className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-[#16422B] focus:outline-none"
              >
                <option value="">{t('history.allCollaborators')}</option>
                {usersList.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name || u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('history.filterPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs bg-white border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
            />
          </div>

          <button
            onClick={loadTasks}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-[#E2E8E4] rounded-xl hover:bg-[#EFF5F1] text-[#16422B] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title={t('history.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{loading ? t('history.refreshing') : t('history.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Toast Global de Compartilhamento / Google Drive */}
      {shareToast && (
        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-xs animate-in fade-in">
          <span>{shareToast}</span>
          {lastDriveUrl && (
            <a
              href={lastDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#16422B] text-white rounded-lg text-[11px] font-bold hover:bg-[#2B6143] transition whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {t('history.openInGoogleDocs')}
            </a>
          )}
        </div>
      )}

      {/* Lista de Tarefas ou Indicador de Carregamento */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <div className="space-y-3 animate-in fade-in">
            <div className="bg-white border border-[#E2E8E4] rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 shadow-xs">
              <CompanyLogo
                className="h-8 max-w-[180px] mx-auto object-contain opacity-95 animate-pulse"
              />
              <div className="flex items-center gap-2 text-[#16422B] font-extrabold text-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-[#16422B]" />
                <span>{t('history.loadingTitle', { brand: getOfficialBrandName() })}</span>
              </div>
              <p className="text-[11px] text-[#5A6B61]">
                {t('history.loadingDesc')}
              </p>
            </div>
            {[1, 2, 3].map((sk) => (
              <div
                key={sk}
                className="bg-white border border-[#E2E8E4] rounded-2xl p-4 space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-20 bg-emerald-100/70 rounded-md" />
                    <div className="h-4 w-32 bg-gray-100 rounded-md" />
                    <div className="h-4 w-24 bg-gray-100 rounded-full" />
                  </div>
                  <div className="h-6 w-28 bg-emerald-50 rounded-lg" />
                </div>
                <div className="h-12 w-full bg-[#F8FAF9] rounded-xl border border-[#E2E8E4]" />
                <div className="h-24 w-full bg-gray-50 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-[#E2E8E4] rounded-2xl p-8 text-center text-xs text-[#5A6B61]">
            {t('history.noTasksFound')}
          </div>
        ) : (
          filtered.map((taskItem) => (
            <div
              key={taskItem.task_id}
              className="bg-white border border-[#E2E8E4] rounded-2xl p-4 shadow-xs hover:border-[#16422B]/40 transition space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Metadados à Esquerda com truncamento inteligente na tag de usuário */}
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden flex-wrap">
                  <span className="font-mono font-bold text-[#16422B] bg-[#EFF5F1] px-2 py-0.5 rounded-md shrink-0">
                    #{taskItem.task_id}
                  </span>
                  <span className="text-[11px] font-semibold text-[#5A6B61] shrink-0">
                    {formatBrtDateTime(taskItem.created_at)}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium shrink-0 whitespace-nowrap">
                    {taskItem.crew_name === 'financial' ? t('history.financialCrew') : t('history.operationalCrew')}
                  </span>

                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EFF5F1] text-[#16422B] border border-emerald-100 max-w-[200px] sm:max-w-[280px] md:max-w-[360px] truncate shrink"
                    title={taskItem.user_name || taskItem.user_email || 'Console AI Board'}
                  >
                    <User className="w-3 h-3 text-[#16422B] shrink-0" />
                    <span className="truncate">{taskItem.user_name || taskItem.user_email || 'Console AI Board'}</span>
                  </span>
                </div>

                {/* Ações e Badges à Direita: Posição Fixa e Padronizada em Todos os Cards */}
                <div className="flex items-center gap-1.5 shrink-0 ml-auto whitespace-nowrap flex-wrap">
                  <button
                    onClick={() => setSelectedTaskIdForLogs(taskItem.task_id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#16422B]/10 hover:bg-[#16422B] text-[#16422B] hover:text-white transition border border-[#16422B]/20 cursor-pointer shrink-0 whitespace-nowrap"
                    title={t('history.viewLogs')}
                  >
                    <Terminal className="w-3.5 h-3.5 shrink-0" />
                    <span>{taskItem.status === 'RUNNING' ? t('history.liveLogs') : t('history.viewLogs')}</span>
                  </button>

                  {taskItem.status === 'COMPLETED' &&
                    (() => {
                      const { costBrlFormatted, costUsdFormatted } = calculateTaskCost(taskItem, usdBrlRate);
                      return (
                        <>
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px] border border-emerald-200/60 shrink-0 whitespace-nowrap">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {t('history.completed')}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 font-mono font-bold text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded-md text-[10.5px] border border-emerald-200 shrink-0 whitespace-nowrap"
                          >
                            💰 ~R$ {costBrlFormatted} (${costUsdFormatted})
                          </span>
                        </>
                      );
                    })()}
                  {taskItem.status === 'RUNNING' && (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin shrink-0" /> {t('history.running')}
                    </span>
                  )}
                  {taskItem.status === 'QUEUED' && (
                    <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" /> {t('history.queued')}
                    </span>
                  )}
                  {taskItem.status === 'FAILED' && (
                    <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
                      <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" /> {t('history.failed')}
                    </span>
                  )}
                </div>
              </div>

              {/* Pergunta / Solicitação */}
              <div className="text-xs text-[#1A202C] font-semibold bg-[#F8FAF9] p-2.5 rounded-xl border border-[#E2E8E4]">
                <span className="text-[#5A6B61] font-bold block text-[10px] uppercase tracking-wider mb-0.5">
                  {t('history.collaboratorQuestion')}
                </span>
                <span data-no-i18n="true">{taskItem.prompt}</span>
              </div>

              {/* Resultado Formatado em Markdown com Ações de Compartilhamento */}
              {taskItem.result && (
                <div className="pt-2 border-t border-[#E2E8E4] space-y-3">
                  <div data-no-i18n="true">
                    <MarkdownRenderer content={taskItem.result} />
                  </div>

                  {/* Barra de Compartilhamento do Boletim */}
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                      <Share2 className="w-3 h-3 text-emerald-700 shrink-0" />
                      {t('history.shareBulletin')}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleShareEmail(taskItem)}
                        disabled={sharingTaskId === taskItem.task_id}
                        className="flex items-center gap-1 px-2.5 py-1 font-bold bg-[#16422B] hover:bg-[#2B6143] text-white rounded-lg text-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        title={`${t('history.sendPartnersEmail')} (${partnerEmailsLabel})`}
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {sharingTaskId === taskItem.task_id
                            ? t('history.sending')
                            : t('history.sendPartnersEmail')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCreateGoogleDriveDoc(taskItem)}
                        disabled={creatingDriveTaskId === taskItem.task_id}
                        className="flex items-center gap-1 px-2.5 py-1 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs transition cursor-pointer disabled:opacity-50 shadow-2xs whitespace-nowrap"
                        title={t('history.openInGoogleDocs')}
                      >
                        {creatingDriveTaskId === taskItem.task_id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <Cloud className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>
                          {creatingDriveTaskId === taskItem.task_id
                            ? t('history.creatingDrive')
                            : t('history.openInGoogleDocs')}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadFormattedDocLocal(taskItem)}
                        className="flex items-center gap-1 px-2 py-1 font-bold bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs transition cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>.DOC</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareWhatsApp(taskItem)}
                        className="flex items-center gap-1 px-2.5 py-1 font-bold bg-[#25D366] hover:bg-[#20BA5A] text-slate-900 rounded-lg text-xs transition cursor-pointer whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Erro */}
              {taskItem.error && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs font-mono" data-no-i18n="true">
                  {taskItem.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de Logs em Tempo Real / Terminal */}
      <TaskLiveModal
        taskId={selectedTaskIdForLogs}
        isOpen={!!selectedTaskIdForLogs}
        onClose={() => {
          setSelectedTaskIdForLogs(null);
          loadTasks();
        }}
        user={user}
        taskUserName={tasks.find((tItem) => tItem.task_id === selectedTaskIdForLogs)?.user_name}
      />
    </div>
  );
}
