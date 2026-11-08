import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  X,
  Square,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ShieldAlert,
  Mail,
  Share2,
  Download,
  Send,
  DollarSign,
  Cloud,
  ExternalLink
} from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';
import {
  OFFICIAL_LOGO_URL,
  markdownToWhatsApp,
  buildFormattedDocHtml,
  calculateTaskCost
} from '../utils/reportFormatters';
import { formatBrtTime, formatBrtDateTime } from '../utils/dateUtils';
import { useLanguage } from '../i18n';

export function TaskLiveModal({ taskId, isOpen, onClose, user, taskUserName }) {
  const { t, tr } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [taskStatus, setTaskStatus] = useState('UNKNOWN');
  const [taskError, setTaskError] = useState(null);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [taskResult, setTaskResult] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [taskUserNameState, setTaskUserNameState] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Compartilhamento e Configurações
  const [sharingEmail, setSharingEmail] = useState(false);
  const [creatingDriveDoc, setCreatingDriveDoc] = useState(false);
  const [lastDriveUrl, setLastDriveUrl] = useState('');
  const [shareToast, setShareToast] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [usdBrlRate, setUsdBrlRate] = useState(5.65);
  const [timeoutSec, setTimeoutSec] = useState(300);

  const terminalEndRef = useRef(null);

  // Carrega configurações globais (partner_emails, câmbio, timeout)
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.partner_emails) {
          setEmailRecipients(data.partner_emails);
        }
        if (data.usd_brl_exchange_rate) {
          setUsdBrlRate(Number(data.usd_brl_exchange_rate) || 5.65);
        }
        if (data.task_timeout_seconds) {
          setTimeoutSec(Number(data.task_timeout_seconds) || 300);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Carrega os logs e resultado da tarefa
  const fetchLogs = async () => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/logs`, {
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTaskStatus(data.status || 'UNKNOWN');
        setTaskError(data.error || null);
        if (data.prompt) setTaskPrompt(data.prompt);
        if (data.result) setTaskResult(data.result);
        if (data.started_at) setStartedAt(data.started_at);
        if (data.completed_at) setCompletedAt(data.completed_at);
        if (data.user_name) setTaskUserNameState(data.user_name);
      }
    } catch (e) {
      console.error('Erro ao buscar logs da tarefa:', e);
    }
  };

  // Poll a cada 2s enquanto a tarefa estiver rodando
  useEffect(() => {
    if (!isOpen || !taskId) return;
    setLoading(true);
    setLastDriveUrl('');
    setShareToast('');
    fetchLogs().finally(() => setLoading(false));

    const interval = setInterval(() => {
      fetchLogs();
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, taskId]);

  // Timer de duração
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      if (startedAt) {
        const end = completedAt ? completedAt : Date.now() / 1000;
        setElapsedSeconds(Math.max(0, Math.floor(end - startedAt)));
      } else {
        setElapsedSeconds(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, startedAt, completedAt]);

  // Auto scroll para o final do terminal
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCancelTask = async () => {
    if (!taskId) return;
    const confirmCancel = window.confirm(
      `${tr('Deseja realmente abortar a execução da Tarefa')} #${taskId}?\n\n${tr('Isso interromperá o processamento dos agentes e liberará a fila imediatamente.')}`
    );
    if (!confirmCancel) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (res.ok) {
        await fetchLogs();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || tr('Não foi possível cancelar a tarefa.'));
      }
    } catch (e) {
      alert(tr('Erro de rede ao cancelar tarefa.'));
    } finally {
      setCancelling(false);
    }
  };

  const handleCopyLogs = () => {
    const formatted = logs
      .map((l) => {
        const ts = l.timestamp || l.created_at;
        const timeStr = ts ? formatBrtTime(ts) : '';
        return `[${timeStr}] [${l.level}] ${l.agent_name ? `(${l.agent_name}) ` : ''}${l.message}`;
      })
      .join('\n');
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Enviar Boletim por E-mail aos Sócios
  const handleSendEmail = async () => {
    if (!taskId) return;
    setSharingEmail(true);
    try {
      const recipients = emailRecipients
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      const res = await fetch(`/api/tasks/${taskId}/share/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          recipients: recipients.length > 0 ? recipients : undefined,
          custom_message: emailNote.trim() || undefined
        })
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const destStr = Array.isArray(data.recipients) ? data.recipients.join(', ') : emailRecipients;
        setShareToast(`✅ ${tr('Boletim enviado por e-mail para')}: ${destStr}`);
        setShowEmailModal(false);
        setTimeout(() => setShareToast(''), 5000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(tr('Erro ao enviar e-mail') + ': ' + (err.detail || tr('Falha no envio')));
      }
    } catch (err) {
      alert(tr('Erro de conexão ao enviar e-mail.'));
    } finally {
      setSharingEmail(false);
    }
  };

  // Criar documento formatado no Google Drive e abrir no Google Docs
  const handleCreateGoogleDriveDoc = async () => {
    if (!taskId) return;
    setCreatingDriveDoc(true);
    setLastDriveUrl('');
    try {
      const res = await fetch(`/api/tasks/${taskId}/share/gdrive`, {
        method: 'POST',
        headers: { 'X-User-Email': user?.email || '' }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setLastDriveUrl(data.url);
          window.open(data.url, '_blank', 'noopener,noreferrer');
          setShareToast(`📄 ${tr('Documento criado no Google Drive')} (${data.folder || 'AI Board'})!`);
          setTimeout(() => setShareToast(''), 7000);
          return;
        }
      }
      handleDownloadDocLocal();
    } catch (e) {
      handleDownloadDocLocal();
    } finally {
      setCreatingDriveDoc(false);
    }
  };

  // Download local como .doc formatado (Tabelas + Logo Oficial)
  const handleDownloadDocLocal = () => {
    const content = taskResult || logs.map((l) => l.message).join('\n\n');
    const title = taskPrompt ? taskPrompt.slice(0, 60) : `Executive_Report_${taskId}`;

    const docHtml = buildFormattedDocHtml({
      taskId,
      title,
      prompt: taskPrompt,
      content,
      createdAt: startedAt || Date.now() / 1000,
      userName: user?.name || user?.email || 'AI Board System'
    });

    const blob = new Blob([docHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Executive_Report_${taskId.slice(0, 8)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setShareToast(`📄 ${tr('Documento formatado (.doc) baixado com sucesso!')}`);
    setTimeout(() => setShareToast(''), 3500);
  };

  // Compartilhar via WhatsApp com tabelas e negrito formatados
  const handleShareWhatsApp = () => {
    const rawContent = taskResult || (logs.length > 0 ? logs[logs.length - 1].message : '');
    const formatted = markdownToWhatsApp(rawContent);
    const summary =
      formatted.length > 1500
        ? formatted.slice(0, 1500) + `\n\n_(${tr('Acesse o boletim completo no AI Board')})_`
        : formatted;
    const text = `*[AI Board] ${tr('Boletim Executivo')} #${taskId.slice(0, 6)}*\n\n${summary}\n\n🔗 _AI Board Studio_`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const isRunning = taskStatus === 'RUNNING' || taskStatus === 'QUEUED';

  // Estimativa Dinâmica de Custo da Tarefa (Padronizada e Sincronizada com o Card de Histórico)
  const taskCost = calculateTaskCost({
    prompt: taskPrompt,
    result: taskResult,
    started_at: startedAt,
    completed_at: completedAt,
    elapsedSeconds,
    user_name: taskUserNameState || taskUserName || user?.name || ''
  }, usdBrlRate);

  const {
    costUsd: estCostUsd,
    costBrl: estCostBrl,
    inTokens: estInputTokens,
    outTokens: estOutputTokens,
    costBrlFormatted,
    costUsdFormatted
  } = taskCost;

  const getLevelBadgeClass = (level) => {
    switch (level) {
      case 'STEP':
        return 'bg-purple-900/60 text-purple-300 border-purple-500/30';
      case 'TOOL':
        return 'bg-cyan-900/60 text-cyan-300 border-cyan-500/30';
      case 'SUCCESS':
        return 'bg-emerald-900/60 text-emerald-300 border-emerald-500/30';
      case 'ERROR':
        return 'bg-red-900/60 text-red-300 border-red-500/30';
      case 'WARNING':
        return 'bg-amber-900/60 text-amber-300 border-amber-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[#0b0f19] border border-slate-800 text-slate-100 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* Header do Terminal */}
        <div className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-[#111827] border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>
            <div className="bg-white/95 px-2 py-0.5 rounded-md flex items-center shrink-0 ml-1">
              <CompanyLogo className="h-3.5 max-w-[90px] object-contain" />
            </div>
            <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-mono font-bold text-xs sm:text-sm text-slate-200 truncate">
              {t('taskLive.title')} <span className="text-emerald-400">#{taskId}</span>
            </span>

            {/* Badge de Status */}
            {taskStatus === 'RUNNING' && (
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full animate-pulse shrink-0 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0"></span>
                {t('taskLive.running')}
              </span>
            )}
            {taskStatus === 'QUEUED' && (
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-blue-300 bg-blue-950/60 border border-blue-500/40 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                {t('taskLive.queued')}
              </span>
            )}
            {taskStatus === 'COMPLETED' && (
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                {t('taskLive.completed')}
              </span>
            )}
            {taskStatus === 'FAILED' && (
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-red-300 bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                {t('taskLive.failed')}
              </span>
            )}

            {/* Tempo decorrido */}
            {startedAt && (
              <span className="text-[10px] sm:text-xs font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded-md border border-slate-700 shrink-0 whitespace-nowrap">
                ⏱️ {formatDuration(elapsedSeconds)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isRunning && (
              <button
                onClick={handleCancelTask}
                disabled={cancelling}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                title={tr('Interrompe o agente e libera a execução')}
              >
                <Square className="w-3 h-3 fill-current shrink-0" />
                <span>{cancelling ? t('taskLive.aborting') : t('taskLive.abort')}</span>
              </button>
            )}

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 cursor-pointer whitespace-nowrap"
              title={tr('Copiar histórico completo de logs')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
              <span className="hidden sm:inline">{copied ? t('common.copied') : t('common.copy')}</span>
            </button>

            <button
              onClick={fetchLogs}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 cursor-pointer"
              title={t('common.refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700 cursor-pointer"
              title={t('common.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subheader: Info de Segurança e Auto-Scroll */}
        <div className="px-3 sm:px-4 py-1.5 bg-[#0d1424] border-b border-slate-800/80 flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-mono gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
            <span>{t('taskLive.realTimeLogs')}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-amber-400/90 flex items-center gap-1 whitespace-nowrap">
              <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
              Timeout: {Math.round(timeoutSec / 60)} min ({timeoutSec}s)
            </span>
            <label className="flex items-center gap-1 cursor-pointer select-none text-slate-300 whitespace-nowrap">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded-xs text-emerald-600 focus:ring-0 w-3 h-3 bg-slate-800 border-slate-700"
              />
              {t('taskLive.autoScroll')}
            </label>
          </div>
        </div>

        {/* CARD DE ESTIMATIVA DE CUSTO E COMPARTILHAMENTO DE BOLETIM (AO CONCLUIR) */}
        {taskStatus === 'COMPLETED' && (
          <div className="p-3 bg-emerald-950/40 border-b border-emerald-500/30 space-y-2.5 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-emerald-200">
                  {t('taskLive.reportCompleted')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] font-mono flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1 whitespace-nowrap">
                  <DollarSign className="w-3 h-3 text-emerald-400 shrink-0" />
                  {t('taskLive.estCost')}: ~R$ {costBrlFormatted} (${costUsdFormatted} USD)
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                  ⏱️ {formatDuration(elapsedSeconds)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hidden sm:inline whitespace-nowrap">
                  Tokens: ~{estInputTokens / 1000}k in / ~{estOutputTokens} out
                </span>
              </div>
            </div>

            {/* Barra de Ações de Compartilhamento do Boletim */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-900/50">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                <Share2 className="w-3 h-3 shrink-0" />
                {t('taskLive.shareReport')}
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 1. Enviar por E-mail para os Sócios */}
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-[#16422B] hover:bg-[#2B6143] text-white rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>{t('taskLive.sendEmail')}</span>
                </button>

                {/* 2. Criar Documento Formatado no Google Drive e Abrir */}
                <button
                  type="button"
                  onClick={handleCreateGoogleDriveDoc}
                  disabled={creatingDriveDoc}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingDriveDoc ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{creatingDriveDoc ? t('taskLive.creatingDrive') : t('taskLive.openDocs')}</span>
                </button>

                {/* 2b. Baixar arquivo .doc formatado localmente */}
                <button
                  type="button"
                  onClick={handleDownloadDocLocal}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>.DOC</span>
                </button>

                {/* 3. Compartilhar via WhatsApp Formatado */}
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-[#25D366] hover:bg-[#20BA5A] text-slate-900 rounded-lg shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </button>
              </div>
            </div>

            {shareToast && (
              <div className="text-[11px] font-bold text-emerald-300 bg-emerald-900/40 p-2 rounded-lg border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
                <span>{shareToast}</span>
                {lastDriveUrl && (
                  <a
                    href={lastDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] font-bold transition whitespace-nowrap"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {t('taskLive.openDocs')}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL / POPOVER DE ENVIO DE E-MAIL AOS SÓCIOS */}
        {showEmailModal && (
          <div className="p-3.5 bg-slate-900 border-b border-slate-800 text-xs space-y-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                {tr('Enviar Boletim Executivo AI Board por E-mail')}
              </span>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                {tr('Destinatários (separados por vírgula)')}:
              </label>
              <input
                type="text"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                {tr('Nota de Acompanhamento (opcional)')}:
              </label>
              <input
                type="text"
                placeholder={tr('Ex: Segue o fechamento para aprovação...')}
                value={emailNote}
                onChange={(e) => setEmailNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sharingEmail}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-[#16422B] hover:bg-[#2B6143] text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>{sharingEmail ? tr('Enviando...') : tr('Confirmar & Disparar E-mail')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Terminal Body com os Logs */}
        <div className="flex-1 p-2 sm:p-3 md:p-4 overflow-y-auto font-mono text-xs space-y-2 bg-[#080c14] select-text">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600 mb-2" />
              <p>{t('taskLive.waitingInit')}</p>
              <p className="text-[10px] text-slate-600">
                {t('taskLive.waitingInitHint')}
              </p>
            </div>
          ) : (
            logs.map((log) => {
              const logTs = log.timestamp || log.created_at;
              const timeStr = logTs ? formatBrtTime(logTs) : '';

              return (
                <div
                  key={log.id}
                  className="py-1.5 px-2 rounded-lg hover:bg-slate-900/60 transition group border-l-2 border-transparent hover:border-emerald-500/40 space-y-1"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {timeStr && (
                      <span className="text-slate-500 text-[10px] font-mono shrink-0">
                        {timeStr}
                      </span>
                    )}

                    <span
                      className={`px-1.5 py-0.2 rounded-sm text-[9px] font-bold border uppercase tracking-wider shrink-0 ${getLevelBadgeClass(
                        log.level
                      )}`}
                    >
                      {log.level}
                    </span>

                    {log.agent_name && (
                      <span className="text-emerald-400 font-semibold text-[10.5px]">
                        @{log.agent_name}:
                      </span>
                    )}
                  </div>

                  <div
                    className="text-slate-200 whitespace-pre-wrap break-words leading-relaxed text-[11px] pl-0.5 select-text"
                    data-no-i18n="true"
                  >
                    {log.message}
                  </div>
                </div>
              );
            })
          )}

          {taskError && (
            <div className="mt-3 p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-red-300 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                {t('taskLive.errorRecorded')}
              </div>
              <div className="text-[11px] whitespace-pre-wrap break-words pl-6" data-no-i18n="true">{taskError}</div>
            </div>
          )}

          {isRunning && (
            <div className="flex items-center gap-2 py-2 px-3 bg-slate-900/80 rounded-lg text-emerald-400 text-xs border border-emerald-500/20 animate-pulse mt-4">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span>{t('taskLive.inProgress')}</span>
            </div>
          )}

          <div ref={terminalEndRef} />
        </div>

        {/* Footer do Modal */}
        <div className="px-3 sm:px-4 py-2 bg-[#111827] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            {t('taskLive.events')}: <span className="font-bold text-slate-200">{logs.length}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition border border-slate-700 cursor-pointer whitespace-nowrap"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
