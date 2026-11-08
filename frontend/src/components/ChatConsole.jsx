import React, { useState, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Copy,
  Check,
  Clock,
  Bot,
  User,
  AlertCircle,
  RefreshCw,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  CornerDownLeft
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useLanguage } from '../i18n';

export function ChatConsole({ user }) {
  const { t, tr } = useLanguage();

  const defaultWelcomeMessage = {
    id: 'welcome',
    sender: 'agent',
    text: t('chat.welcome'),
    time: t('chat.now')
  };

  const getStorageKey = () => `aiboard_chat_sessions_v3_${user?.email || 'guest'}`;

  // Cria uma nova sessão com mensagem de boas-vindas
  const createNewSessionObject = () => ({
    id: `sess-${Date.now()}`,
    title: t('chat.newConversation'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [defaultWelcomeMessage]
  });

  // Inicializa sessões do localStorage (atualizando automaticamente mensagens de boas-vindas legadas)
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(getStorageKey());
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((s) => ({
            ...s,
            messages: (s.messages || []).map((m) => {
              if (m.id === 'welcome') {
                return { ...m, text: defaultWelcomeMessage.text };
              }
              return m;
            })
          }));
        }
      }
    } catch (e) {
      console.error('Erro ao ler sessões salvas:', e);
    }
    return [createNewSessionObject()];
  });

  // ID da sessão ativa
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    return sessions[0]?.id || `sess-${Date.now()}`;
  });

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Salva sessões no localStorage sempre que forem alteradas
  useEffect(() => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(sessions));
    } catch (e) {
      console.error('Erro ao salvar sessões no localStorage:', e);
    }
  }, [sessions, user?.email]);

  // Obtém a sessão ativa atual
  const activeSession = sessions.find((s) => s.id === currentSessionId) || sessions[0] || createNewSessionObject();
  const messages = activeSession.messages || [defaultWelcomeMessage];

  // Iniciar nova conversa
  const handleStartNewChat = () => {
    const newSess = createNewSessionObject();
    setSessions((prev) => [newSess, ...prev]);
    setCurrentSessionId(newSess.id);
    setPrompt('');
    setLoading(false);
    setActiveTask(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Excluir uma conversa antiga
  const handleDeleteSession = (e, sessId) => {
    e.stopPropagation();
    if (!confirm(t('chat.confirmDelete'))) return;

    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== sessId);
      if (filtered.length === 0) {
        const fresh = createNewSessionObject();
        setCurrentSessionId(fresh.id);
        return [fresh];
      }
      if (currentSessionId === sessId) {
        setCurrentSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Polling e Recuperação Persistente de Tarefas (mesmo trocando de tela, recarregando ou desconectando)
  useEffect(() => {
    let isCancelled = false;

    // 1. Checa se a sessão ativa tem uma pergunta sem resposta e tenta reconectar à tarefa correspondente
    const checkUnresolvedLastMessage = async () => {
      const activeSess = sessions.find((s) => s.id === currentSessionId);
      if (!activeSess) return;

      const msgs = activeSess.messages || [];
      const lastMsg = msgs[msgs.length - 1];

      // Se a última mensagem for do usuário e não houver pendingTaskId
      if (lastMsg && lastMsg.sender === 'user' && !activeSess.pendingTaskId) {
        try {
          const res = await fetch('/api/tasks?limit=5', {
            headers: { 'X-User-Email': user?.email || '' }
          });
          if (res.ok) {
            const tasksList = await res.json();
            const list = Array.isArray(tasksList) ? tasksList : tasksList.tasks || [];
            // Encontra a tarefa mais recente que bate com o prompt
            const matchTask = list.find((t) => {
              const p = (t.prompt || '').trim();
              const u = lastMsg.text.trim();
              return p === u || p.startsWith(u.slice(0, 30)) || u.startsWith(p.slice(0, 30));
            });

            if (matchTask && !isCancelled) {
              const tId = matchTask.task_id || matchTask.id;
              if (matchTask.status === 'COMPLETED') {
                const respTime = matchTask.completed_at
                  ? new Date(matchTask.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : t('chat.now');
                const completedMsg = {
                  id: `res-${tId}`,
                  sender: 'agent',
                  text: matchTask.result || t('chat.opCompleted'),
                  time: respTime
                };
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === currentSessionId
                      ? {
                          ...s,
                          pendingTaskId: null,
                          pendingTaskStatus: null,
                          updatedAt: new Date().toISOString(),
                          messages: [...s.messages, completedMsg]
                        }
                      : s
                  )
                );
                setLoading(false);
                setActiveTask(null);
                return;
              } else if (matchTask.status === 'RUNNING' || matchTask.status === 'QUEUED') {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.id === currentSessionId
                      ? {
                          ...s,
                          pendingTaskId: tId,
                          pendingTaskStatus: matchTask.status
                        }
                      : s
                  )
                );
                setLoading(true);
                setActiveTask({ id: tId, status: matchTask.status });
              }
            }
          }
        } catch (e) {
          console.error('Erro na recuperação de tarefas não resolvidas:', e);
        }
      }
    };

    checkUnresolvedLastMessage();

    // 2. Loop de Polling para qualquer sessão com pendingTaskId
    const pollPending = async () => {
      const activeSess = sessions.find((s) => s.id === currentSessionId);
      const pendingTask = activeSess?.pendingTaskId;

      if (!pendingTask) {
        if (loading && !sessions.some((s) => s.id === currentSessionId && s.pendingTaskId)) {
          setLoading(false);
          setActiveTask(null);
        }
        return;
      }

      setLoading(true);
      setActiveTask((prev) => prev || { id: pendingTask, status: activeSess.pendingTaskStatus || 'RUNNING' });

      try {
        const res = await fetch(`/api/tasks/${pendingTask}`);
        if (!res.ok) return;
        const taskData = await res.json();
        if (isCancelled) return;

        setActiveTask({ id: pendingTask, status: taskData.status });

        if (taskData.status === 'COMPLETED') {
          const respTime = taskData.completed_at
            ? new Date(taskData.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const completedMsg = {
            id: `res-${pendingTask}`,
            sender: 'agent',
            text: taskData.result || t('chat.opCompleted'),
            time: respTime
          };

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSess.id) return s;
              const alreadyHas = (s.messages || []).some((m) => m.id === `res-${pendingTask}`);
              return {
                ...s,
                pendingTaskId: null,
                pendingTaskStatus: null,
                updatedAt: new Date().toISOString(),
                messages: alreadyHas ? s.messages : [...(s.messages || []), completedMsg]
              };
            })
          );
          setLoading(false);
          setActiveTask(null);
        } else if (taskData.status === 'FAILED') {
          const failMsg = {
            id: `err-${pendingTask}`,
            sender: 'agent',
            isError: true,
            text: `❌ ${t('chat.taskFailed', { error: taskData.error || 'Unknown error' })}`,
            time: t('chat.now')
          };

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSess.id) return s;
              const alreadyHas = (s.messages || []).some((m) => m.id === `err-${pendingTask}`);
              return {
                ...s,
                pendingTaskId: null,
                pendingTaskStatus: null,
                updatedAt: new Date().toISOString(),
                messages: alreadyHas ? s.messages : [...(s.messages || []), failMsg]
              };
            })
          );
          setLoading(false);
          setActiveTask(null);
        }
      } catch (err) {
        console.error(`Erro ao checar status da tarefa ${pendingTask}:`, err);
      }
    };

    pollPending();
    const interval = setInterval(pollPending, 1500);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [sessions, currentSessionId, user?.email]);

  const handleSend = async (customPrompt) => {
    const textToSend = customPrompt || prompt;
    if (!textToSend.trim() || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Mensagens atualizadas para a sessão
    const updatedMessages = [
      ...messages,
      { id: userMsgId, sender: 'user', text: textToSend, time: nowTime }
    ];

    // Atualiza título da sessão caso seja a primeira pergunta do usuário
    const isFirstUserMessage = messages.filter((m) => m.sender === 'user').length === 0;
    const sessionTitle = isFirstUserMessage
      ? (textToSend.length > 36 ? textToSend.slice(0, 36) + '...' : textToSend)
      : activeSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? {
              ...s,
              title: sessionTitle,
              updatedAt: new Date().toISOString(),
              messages: updatedMessages
            }
          : s
      )
    );

    setPrompt('');
    setLoading(true);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          crew_name: 'operational',
          prompt: textToSend,
          requester: 'web:react_console',
          user_email: user?.email,
          user_name: user?.name,
          session_id: currentSessionId
        })
      });

      if (!res.ok) throw new Error(t('chat.queueError'));
      const data = await res.json();
      const taskId = data.task_id;

      // Vincula a tarefa pendente à sessão (persistida imediatamente no localStorage)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                pendingTaskId: taskId,
                pendingTaskStatus: 'QUEUED',
                updatedAt: new Date().toISOString()
              }
            : s
        )
      );
      setActiveTask({ id: taskId, status: 'QUEUED' });
      setLoading(true);

    } catch (err) {
      setLoading(false);
      setActiveTask(null);
      const errTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const errorMsg = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        isError: true,
        text: `${t('chat.commError')}: ${err.message}`,
        time: errTime
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                pendingTaskId: null,
                pendingTaskStatus: null,
                updatedAt: new Date().toISOString(),
                messages: [...s.messages, errorMsg]
              }
            : s
        )
      );
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-full flex flex-col md:flex-row gap-3 p-2 md:p-4">
      {/* 1. BARRA LATERAL DE HISTÓRICO DE CONVERSAS (Estilo ChatGPT / Gemini) */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white md:static md:w-64 md:h-full border border-[#E2E8E4] rounded-none md:rounded-3xl p-3.5 flex flex-col shadow-xl md:shadow-xs transition-all duration-300 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:flex'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8E4] gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[#16422B] shrink-0" />
            <h3 className="font-extrabold text-xs text-[#16422B] uppercase tracking-wider truncate">
              {t('chat.previousConversations')}
            </h3>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Botão + Nova Conversa */}
        <div className="py-2.5">
          <button
            onClick={handleStartNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-[#16422B] hover:bg-[#2B6143] text-white font-bold text-xs transition shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">{t('chat.newConversation')}</span>
          </button>
        </div>

        {/* Lista de Sessões Anteriores com Rolagem */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {sessions.map((sess) => {
            const isSelected = sess.id === currentSessionId;
            const userMsgCount = (sess.messages || []).filter((m) => m.sender === 'user').length;
            const updatedDate = sess.updatedAt ? new Date(sess.updatedAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' }) : '';

            return (
              <div
                key={sess.id}
                onClick={() => {
                  setCurrentSessionId(sess.id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between p-2.5 rounded-2xl transition cursor-pointer text-left border ${
                  isSelected
                    ? 'bg-[#EFF5F1] text-[#16422B] border-[#16422B]/30 font-bold shadow-2xs'
                    : 'bg-white text-gray-700 border-transparent hover:bg-gray-50 hover:border-[#E2E8E4]'
                }`}
              >
                <div className="min-w-0 flex-1 pr-1.5">
                  <div
                    className="text-xs truncate font-semibold leading-tight"
                    data-no-i18n={sess.title && sess.title !== 'Nova Conversa' ? 'true' : undefined}
                  >
                    {sess.title === 'Nova Conversa' ? t('chat.newConversation') : (sess.title || t('chat.untitledConversation'))}
                  </div>
                  <div className="text-[10px] text-[#5A6B61] flex items-center gap-1.5 mt-0.5 truncate">
                    <span>{userMsgCount} {userMsgCount === 1 ? t('chat.question') : t('chat.questions')}</span>
                    {updatedDate && <span>• {updatedDate}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, sess.id)}
                  title={t('chat.deleteConversation')}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-[#E2E8E4] text-[10px] text-[#5A6B61] text-center truncate">
          {t('chat.historySavedLocally')}
        </div>
      </div>

      {/* Backdrop mobile para fechar a barra lateral */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 2. ÁREA PRINCIPAL DE CHAT */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {/* Cabeçalho do Chat com botão de histórico no mobile e título da conversa */}
        <div className="bg-white border border-[#E2E8E4] rounded-2xl px-4 py-2.5 mb-2.5 flex items-center justify-between gap-2 shadow-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded-xl hover:bg-gray-100 text-[#16422B] transition cursor-pointer md:hidden shrink-0"
              title={t('chat.openHistory')}
            >
              <History className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h2
                className="font-extrabold text-xs md:text-sm text-[#16422B] truncate leading-tight"
                data-no-i18n={activeSession.title && activeSession.title !== 'Nova Conversa' ? 'true' : undefined}
              >
                {activeSession.title === 'Nova Conversa' ? t('chat.newConversation') : (activeSession.title || t('chat.operationalIntelligenceCenter'))}
              </h2>
              <span className="text-[10px] text-[#5A6B61] font-semibold flex items-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="truncate">{t('chat.specialistTeamConnected')}</span>
              </span>
            </div>
          </div>

          <button
            onClick={handleStartNewChat}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[#EFF5F1] text-[#16422B] hover:bg-[#E2E8E4] rounded-xl transition cursor-pointer shrink-0 whitespace-nowrap"
            title={t('chat.startCleanChat')}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('chat.newConversation')}</span>
          </button>
        </div>

        {/* Área de Mensagens com scroll interno independente */}
        <div className="flex-1 min-h-0 bg-white border border-[#E2E8E4] rounded-3xl p-4 md:p-5 overflow-y-auto space-y-4 shadow-sm">
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            const displayMsgText = m.id === 'welcome' ? t('chat.welcome') : m.text;
            const displayTime = m.time === 'Agora' ? t('chat.now') : (m.time || t('chat.now'));
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-full bg-[#16422B] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[90%] md:max-w-[85%] rounded-2xl p-4 leading-relaxed ${
                    isUser
                      ? 'bg-[#16422B] text-white rounded-br-none shadow-sm'
                      : m.isError
                      ? 'bg-red-50 text-red-900 border border-red-200'
                      : 'bg-[#F8FAF9] text-[#1A202C] border border-[#E2E8E4] rounded-bl-none shadow-xs'
                  }`}
                >
                  <div data-no-i18n={m.id !== 'welcome' ? 'true' : undefined}>
                    {isUser ? (
                      <div className="whitespace-pre-wrap font-medium text-xs md:text-sm">{displayMsgText}</div>
                    ) : (
                      <MarkdownRenderer content={displayMsgText} />
                    )}
                  </div>

                  {!isUser && !m.isError && (
                    <div className="mt-2 pt-2 border-t border-[#E2E8E4]/60 flex items-center justify-between gap-2 text-[11px] text-[#5A6B61]">
                      <span className="truncate">{t('chat.operationalCenterFooter')} • {displayTime}</span>
                      <button
                        onClick={() => handleCopy(m.id, displayMsgText)}
                        className="flex items-center gap-1 hover:text-[#16422B] transition cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        {copiedId === m.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{copiedId === m.id ? t('chat.copied') : t('chat.copy')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-full bg-[#EFF5F1] text-[#16422B] border border-[#E2E8E4] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex gap-3 items-center text-xs text-[#5A6B61] bg-[#EFF5F1] p-3 rounded-2xl border border-[#E2E8E4] animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-[#16422B] shrink-0" />
              <span>
                {activeTask?.status === 'RUNNING'
                  ? t('chat.runningStatus')
                  : t('chat.queuedStatus')}
              </span>
            </div>
          )}
        </div>

        {/* Caixa de Entrada de Prompt (Sempre visível acima da barra de navegação) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mt-2.5 flex gap-2 shrink-0"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder={t('chat.placeholder')}
            className="flex-1 min-w-0 bg-white border border-[#E2E8E4] rounded-2xl px-4 py-3 text-xs md:text-sm font-medium text-[#1A202C] focus:outline-none focus:border-[#16422B] shadow-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="bg-[#16422B] hover:bg-[#2B6143] disabled:opacity-50 text-white font-bold px-5 py-3 rounded-2xl flex items-center gap-2 text-xs md:text-sm shadow-sm transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t('chat.send')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
