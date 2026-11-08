import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Cpu,
  ShieldCheck,
  Zap,
  RotateCcw,
  Play,
  CheckSquare,
  Square,
  Filter,
  Terminal,
  FileDiff,
  Layers,
  ListFilter,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  Sliders,
  Eye,
  X,
  TrendingDown,
  Lock,
  GitBranch,
  Radar,
  Wrench,
  MessageSquareCode,
  ArrowRight,
  History
} from 'lucide-react';
import { formatBrtDateTime, formatBrtTime } from '../utils/dateUtils';
import { useLanguage } from '../i18n';

const CATEGORY_META = {
  Prompt: {
    label: 'Prompt & Memória',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: MessageSquareCode
  },
  'Tool/MCP': {
    label: 'Tool / Script MCP',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Wrench
  },
  FinOps: {
    label: 'FinOps & Custos',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: TrendingDown
  },
  Segurança: {
    label: 'Segurança & Resiliência',
    color: 'bg-amber-50 text-amber-900 border-amber-200',
    icon: Lock
  },
  Integração: {
    label: 'Integração 360º',
    color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    icon: GitBranch
  },
  'Nova Feature': {
    label: 'Radar Tecnológico',
    color: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: Radar
  }
};

const RISK_META = {
  LOW: {
    label: 'Risco Baixo',
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300'
  },
  MEDIUM: {
    label: 'Risco Médio',
    badge: 'bg-amber-100 text-amber-900 border-amber-300'
  },
  HIGH: {
    label: 'Risco Alto',
    badge: 'bg-red-100 text-red-900 border-red-300'
  }
};

const STATUS_META = {
  PENDING_APPROVAL: {
    label: 'Aguardando Aprovação',
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500'
  },
  QUEUED: {
    label: 'Na Fila Antigravity',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500 animate-pulse'
  },
  RUNNING_IN_ANTIGRAVITY: {
    label: 'Executando no Antigravity',
    badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    dot: 'bg-indigo-600 animate-ping'
  },
  TESTING: {
    label: 'Testando Integridade',
    badge: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-600 animate-pulse'
  },
  COMPLETED: {
    label: 'Concluída & Auditada',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-600'
  },
  FAILED: {
    label: 'Falhou (Protegida)',
    badge: 'bg-red-50 text-red-800 border-red-200',
    dot: 'bg-red-600'
  },
  ROLLED_BACK: {
    label: 'Revertida (Rollback)',
    badge: 'bg-gray-100 text-gray-700 border-gray-300',
    dot: 'bg-gray-500'
  }
};

export function EvolutionCenterView({ user }) {
  const { t, tr } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [overview, setOverview] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({
    full_auto_mode: false,
    allowed_categories: ['Prompt', 'FinOps', 'Tool/MCP', 'Segurança', 'Integração'],
    max_auto_risk_level: 'LOW',
    semantic_cache_enabled: true,
    context_compression_enabled: true,
    smart_model_routing_enabled: true
  });
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [executingBatch, setExecutingBatch] = useState(false);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState('');

  // Seleção múltipla e filtros
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list' | 'audit'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showAutoConfig, setShowAutoConfig] = useState(false);

  // Paginação / Limite visual para evitar rolagem infinita na tela
  const INITIAL_KANBAN_LIMIT = 3;
  const INITIAL_LIST_LIMIT = 8;
  const [kanbanLimits, setKanbanLimits] = useState({
    pending: INITIAL_KANBAN_LIMIT,
    running: INITIAL_KANBAN_LIMIT,
    completed: INITIAL_KANBAN_LIMIT,
    history: INITIAL_KANBAN_LIMIT
  });
  const [listLimit, setListLimit] = useState(INITIAL_LIST_LIMIT);
  const [auditLimit, setAuditLimit] = useState(INITIAL_LIST_LIMIT);

  // Modal de Diff e Inspeção Técnica
  const [diffTask, setDiffTask] = useState(null);
  const [diffTab, setDiffTab] = useState('unified'); // 'unified' | 'split' | 'logs'

  // Modal de Nova Tarefa Evolutiva Sob Demanda
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('Prompt');
  const [newTaskRisk, setNewTaskRisk] = useState('LOW');
  const [newTaskImpact, setNewTaskImpact] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const consoleContainerRef = useRef(null);
  const lastEventIdRef = useRef(0);
  const lastSettingsPatchTsRef = useRef(0);
  const lockedTaskIdsRef = useRef(new Map());

  const scrollConsoleToBottomInternalOnly = () => {
    const el = consoleContainerRef.current;
    if (!el) return;
    // Rola apenas o container interno do terminal, nunca a janela/página principal
    el.scrollTop = el.scrollHeight;
  };

  const showTemporaryToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? '' : prev));
    }, 4500);
  };

  const fetchOverview = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/evolution/overview', {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
        const nowTs = Date.now();
        const mergedTasks = (data.tasks || []).map((tItem) => {
          const lockedTs = lockedTaskIdsRef.current.get(tItem.id);
          if (lockedTs) {
            if (['COMPLETED', 'FAILED'].includes(tItem.status)) {
              lockedTaskIdsRef.current.delete(tItem.id);
            } else if (
              nowTs - lockedTs < 8000 &&
              ['PENDING_APPROVAL', 'ROLLED_BACK'].includes(tItem.status)
            ) {
              return {
                ...tItem,
                status: 'QUEUED',
                approved_by: tItem.approved_by || user?.email || 'Admin'
              };
            }
          }
          return tItem;
        });
        setTasks(mergedTasks);
        // Evita que um poll em andamento sobrescreva atualização otimista recém-clicada pelo usuário
        if (data.settings && Date.now() - lastSettingsPatchTsRef.current > 2500) {
          setSettings(data.settings);
        }
        if (data.recent_events) {
          const maxId = data.recent_events.reduce((acc, ev) => Math.max(acc, ev.id || 0), 0);
          const hasNew = maxId > lastEventIdRef.current;
          setLiveEvents(data.recent_events);
          if (hasNew) {
            lastEventIdRef.current = maxId;
            requestAnimationFrame(scrollConsoleToBottomInternalOnly);
          }
        }
      }
    } catch (e) {
      console.error('Erro ao carregar Centro de Evolução:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Inicialização + Streaming SSE em Tempo Real + Fallback Polling
  useEffect(() => {
    fetchOverview(false);

    let es = null;
    try {
      es = new EventSource('/api/evolution/stream');
      es.onopen = () => setSseConnected(true);
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'connected') {
            setSseConnected(true);
          } else if (parsed.type === 'log' && parsed.data) {
            setLiveEvents((prev) => {
              const exists = prev.some((x) => x.id && x.id === parsed.data.id);
              if (exists) return prev;
              if (parsed.data.id && parsed.data.id > lastEventIdRef.current) {
                lastEventIdRef.current = parsed.data.id;
              }
              requestAnimationFrame(scrollConsoleToBottomInternalOnly);
              return [...prev.slice(-140), parsed.data];
            });
          } else if (parsed.type === 'task_status' && parsed.data) {
            const { id: tid, status: newSt, approved_by: appBy, task: fullTask } = parsed.data;
            if (tid && ['COMPLETED', 'FAILED'].includes(newSt)) {
              lockedTaskIdsRef.current.delete(tid);
              if (newSt === 'COMPLETED') {
                showTemporaryToast(
                  `✅ Evolução #${tid} concluída e testada no Antigravity com snapshot salvo!`
                );
              }
            }
            if (tid && newSt) {
              setTasks((prev) =>
                prev.map((tItem) => {
                  if (tItem.id !== tid) return tItem;
                  if (fullTask) return fullTask;
                  return {
                    ...tItem,
                    status: newSt,
                    approved_by: appBy || tItem.approved_by
                  };
                })
              );
            }
            fetchOverview(true);
          } else if (parsed.type === 'settings_updated' && parsed.data) {
            if (Date.now() - lastSettingsPatchTsRef.current > 800) {
              setSettings(parsed.data);
            }
          }
        } catch (err) {
          // ignora keepalive
        }
      };
      es.onerror = () => {
        setSseConnected(false);
      };
    } catch (e) {
      setSseConnected(false);
    }

    const pollInterval = setInterval(() => {
      fetchOverview(true);
    }, 3500);

    return () => {
      if (es) es.close();
      clearInterval(pollInterval);
    };
  }, []);

  // Alternar Modo de Autonomia Total (Full-Auto) com atualização otimista instantânea (0ms)
  const handleToggleFullAuto = async () => {
    if (!isAdmin) return;
    const prevSettings = settings;
    const nextVal = !settings.full_auto_mode;
    lastSettingsPatchTsRef.current = Date.now();
    setSettings((prev) => ({ ...prev, full_auto_mode: nextVal }));
    showTemporaryToast(
      nextVal
        ? '⚡ Modo de Autonomia Total (Full-Auto) ATIVADO!'
        : '🛡️ Modo de Aprovação Supervisionada ativo.'
    );
    try {
      const res = await fetch('/api/evolution/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ full_auto_mode: nextVal })
      });
      if (res.ok) {
        const data = await res.json();
        lastSettingsPatchTsRef.current = Date.now();
        setSettings(data.settings);
        fetchOverview(true);
      } else {
        setSettings(prevSettings);
      }
    } catch (e) {
      console.error('Erro ao alternar Full-Auto:', e);
      setSettings(prevSettings);
    }
  };

  // Atualizar filtros (Risco / Categorias) com atualização otimista instantânea (0ms)
  const handleUpdateAutoFilter = async (patch) => {
    if (!isAdmin) return;
    const prevSettings = settings;
    lastSettingsPatchTsRef.current = Date.now();
    setSettings((prev) => ({ ...prev, ...patch }));
    try {
      const res = await fetch('/api/evolution/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify(patch)
      });
      if (res.ok) {
        const data = await res.json();
        lastSettingsPatchTsRef.current = Date.now();
        setSettings(data.settings);
        showTemporaryToast('Configurações do Meta-Agente atualizadas!');
      } else {
        setSettings(prevSettings);
      }
    } catch (e) {
      console.error('Erro ao salvar filtros:', e);
      setSettings(prevSettings);
    }
  };

  const handleToggleAllowedCategory = (cat) => {
    const curr = settings.allowed_categories || [];
    const next = curr.includes(cat) ? curr.filter((c) => c !== cat) : [...curr, cat];
    handleUpdateAutoFilter({ allowed_categories: next });
  };

  // Disparar Auditoria 360º + Radar Tecnológico no Antigravity
  const handleRunAuditNow = async () => {
    setAuditing(true);
    try {
      const res = await fetch('/api/evolution/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ user: user?.email || 'Admin' })
      });
      if (res.ok) {
        const data = await res.json();
        const createdCnt = Number(data.new_tasks_created || 0);
        showTemporaryToast(
          createdCnt > 0
            ? `🔍 Auditoria 360º concluída (0 tokens)! ${createdCnt} oportunidade(s) inédita(s) de causa-raiz detectada(s).`
            : '✨ Sistema 100% auditado! Nenhum novo gargalo inédito — todas as oportunidades atuais já estão no backlog ou aplicadas.'
        );
        await fetchOverview(true);
      }
    } catch (e) {
      console.error('Erro ao executar auditoria:', e);
    } finally {
      setAuditing(false);
    }
  };

  // Executar tarefas selecionadas (em lote ou individual) no Antigravity com bloqueio contra execução duplicada
  const handleExecuteTasks = async (taskIdsToRun) => {
    const candidateIds = taskIdsToRun && taskIdsToRun.length > 0 ? taskIdsToRun : selectedIds;
    if (!candidateIds.length) return;

    // Impede que tarefas já na fila/executando ou concluídas sejam disparadas uma segunda vez
    const ids = candidateIds.filter((id) => {
      if (lockedTaskIdsRef.current.has(id)) return false;
      const tItem = tasks.find((item) => item.id === id);
      if (!tItem) return true;
      return !['QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING', 'COMPLETED'].includes(tItem.status);
    });

    if (ids.length === 0) {
      showTemporaryToast(
        '🔒 Esta tarefa já está enfileirada/em execução no Antigravity ou já foi concluída.'
      );
      return;
    }

    const nowTs = Date.now();
    ids.forEach((id) => lockedTaskIdsRef.current.set(id, nowTs));

    // Atualização otimista instantânea (0ms): move imediatamente para a coluna "Executando no Antigravity"
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    setTasks((prev) =>
      prev.map((tItem) =>
        ids.includes(tItem.id)
          ? {
              ...tItem,
              status: 'QUEUED',
              approved_by: user?.email || 'Admin',
              started_at: nowTs / 1000
            }
          : tItem
      )
    );
    showTemporaryToast(
      `🔒 ${ids.length} tarefa(s) bloqueada(s) e movida(s) para a coluna "Executando no Antigravity"!`
    );

    setExecutingBatch(true);
    try {
      const res = await fetch('/api/evolution/tasks/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          task_ids: ids,
          sync: false
        })
      });
      if (res.ok) {
        await fetchOverview(true);
      } else {
        ids.forEach((id) => lockedTaskIdsRef.current.delete(id));
        await fetchOverview(true);
      }
    } catch (e) {
      console.error('Erro ao executar lote no Antigravity:', e);
      ids.forEach((id) => lockedTaskIdsRef.current.delete(id));
      await fetchOverview(true);
    } finally {
      setExecutingBatch(false);
    }
  };

  // Acionar Rollback 1-Clique
  const handleRollbackTask = async (taskId) => {
    if (!isAdmin) return;
    setRollingBackId(taskId);
    try {
      const res = await fetch(`/api/evolution/tasks/${taskId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ user: user?.email || 'Admin' })
      });
      const data = await res.json();
      if (res.ok) {
        showTemporaryToast(`⏪ ${data.message || 'Rollback concluído com sucesso!'}`);
        await fetchOverview(true);
        if (diffTask && diffTask.id === taskId) {
          setDiffTask(data.task);
        }
      } else {
        showTemporaryToast(`Erro no Rollback: ${data.detail || 'Falha ao restaurar snapshot'}`);
      }
    } catch (e) {
      console.error('Erro ao acionar rollback:', e);
    } finally {
      setRollingBackId(null);
    }
  };

  // Criar tarefa evolutiva customizada
  const handleCreateCustomTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDesc.trim()) return;
    setCreatingTask(true);
    try {
      const res = await fetch('/api/evolution/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          category: newTaskCategory,
          risk_level: newTaskRisk,
          expected_impact: newTaskImpact.trim() || 'Otimização arquitetural e eficiência operacional',
          description: newTaskDesc.trim(),
          author: user?.email || 'Admin'
        })
      });
      if (res.ok) {
        setShowNewTaskModal(false);
        setNewTaskTitle('');
        setNewTaskImpact('');
        setNewTaskDesc('');
        showTemporaryToast('Nova tarefa adicionada ao Backlog Evolutivo!');
        await fetchOverview(true);
      }
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
    } finally {
      setCreatingTask(false);
    }
  };

  // Filtragem de tarefas
  const filteredTasks = tasks.filter((tItem) => {
    if (categoryFilter !== 'ALL' && tItem.category !== categoryFilter) return false;
    if (riskFilter !== 'ALL' && tItem.risk_level !== riskFilter) return false;
    if (statusFilter !== 'ALL' && tItem.status !== statusFilter) return false;
    return true;
  });

  const selectablePendingIds = filteredTasks
    .filter((tItem) => tItem.status === 'PENDING_APPROVAL')
    .map((tItem) => tItem.id);

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllPending = () => {
    const allSelected =
      selectablePendingIds.length > 0 && selectablePendingIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectablePendingIds);
    }
  };

  const activeRunningTasks = tasks.filter((tItem) =>
    ['QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING'].includes(tItem.status)
  );

  const baseMetrics = overview?.metrics || {
    antigravity_tokens_cost: 0,
    pending_approval: 0,
    running_count: 0,
    completed_count: 0,
    rolled_back_count: 0,
    active_snapshots_count: 0,
    estimated_monthly_savings_applied_brl: 0,
    estimated_monthly_savings_pending_brl: 0
  };

  const metrics =
    tasks.length > 0
      ? {
          ...baseMetrics,
          pending_approval: tasks.filter((tItem) => tItem.status === 'PENDING_APPROVAL').length,
          running_count: activeRunningTasks.length,
          completed_count: tasks.filter((tItem) => tItem.status === 'COMPLETED').length,
          rolled_back_count: tasks.filter((tItem) => tItem.status === 'ROLLED_BACK').length
        }
      : baseMetrics;

  // Agrupamento para o Kanban
  const kanbanColumns = [
    {
      id: 'col-pending',
      title: t('evolution.colPendingTitle'),
      subtitle: t('evolution.colPendingSubtitle'),
      headerColor: 'border-amber-300 bg-amber-50/60 text-amber-900',
      items: filteredTasks.filter((tItem) => tItem.status === 'PENDING_APPROVAL')
    },
    {
      id: 'col-running',
      title: t('evolution.colRunningTitle'),
      subtitle: t('evolution.colRunningSubtitle'),
      headerColor: 'border-indigo-300 bg-indigo-50/60 text-indigo-900',
      items: filteredTasks.filter((tItem) =>
        ['QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING'].includes(tItem.status)
      )
    },
    {
      id: 'col-completed',
      title: t('evolution.colCompletedTitle'),
      subtitle: t('evolution.colCompletedSubtitle'),
      headerColor: 'border-emerald-300 bg-emerald-50/60 text-emerald-900',
      items: filteredTasks.filter((tItem) => tItem.status === 'COMPLETED')
    },
    {
      id: 'col-rolledback',
      title: t('evolution.colRolledbackTitle'),
      subtitle: t('evolution.colRolledbackSubtitle'),
      headerColor: 'border-gray-300 bg-gray-100/80 text-gray-800',
      items: filteredTasks.filter((tItem) => ['ROLLED_BACK', 'FAILED'].includes(tItem.status))
    }
  ];

  const renderDiffLines = (diffText) => {
    const lines = (diffText || '').split('\n');
    return (
      <div className="font-mono text-xs leading-relaxed overflow-x-auto bg-[#0D1410] text-gray-200 p-4 rounded-2xl border border-[#1E3327]">
        {lines.map((line, i) => {
          let cls = 'text-gray-300';
          if (line.startsWith('+++') || line.startsWith('---')) {
            cls = 'text-amber-300 font-bold';
          } else if (line.startsWith('@@')) {
            cls = 'text-cyan-400 font-semibold';
          } else if (line.startsWith('+')) {
            cls = 'bg-emerald-950/80 text-emerald-300 px-1.5 rounded-xs block';
          } else if (line.startsWith('-')) {
            cls = 'bg-red-950/80 text-red-300 px-1.5 rounded-xs block';
          }
          return (
            <div key={i} className={`whitespace-pre-wrap break-words ${cls}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTaskCard = (tItem) => {
    const catMeta = CATEGORY_META[tItem.category] || CATEGORY_META.FinOps;
    const CatIcon = catMeta.icon || Sparkles;
    const riskMeta = RISK_META[tItem.risk_level] || RISK_META.LOW;
    const stMeta = STATUS_META[tItem.status] || STATUS_META.PENDING_APPROVAL;
    const isSelectable = tItem.status === 'PENDING_APPROVAL';
    const isSelected = selectedIds.includes(tItem.id);
    const isActiveExecution = ['QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING'].includes(tItem.status);

    return (
      <div
        key={tItem.id}
        className={`bg-white rounded-2xl border transition-all p-4 space-y-3 shadow-2xs hover:shadow-md ${
          isActiveExecution
            ? 'border-indigo-300 ring-2 ring-indigo-500/20 bg-indigo-50/20'
            : isSelected
            ? 'border-[#16422B] ring-2 ring-[#16422B]/15 bg-[#F4F9F6]/50'
            : 'border-[#E2E8E4]'
        }`}
      >
        {/* Topo do Card: Checkbox + Categoria + Risco */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {isSelectable && isAdmin && (
              <button
                type="button"
                onClick={() => toggleSelectOne(tItem.id)}
                className="text-[#16422B] hover:scale-105 transition"
                title={t('evolution.selectPending')}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-[#16422B]" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
              </button>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${catMeta.color}`}
            >
              <CatIcon className="w-3 h-3 shrink-0" />
              {tr(catMeta.label)}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${riskMeta.badge}`}
            >
              {tr(riskMeta.label)}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 whitespace-nowrap ${stMeta.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot}`} />
            {tr(stMeta.label)}
          </span>
        </div>

        {/* Título e Diagnóstico */}
        <div>
          <h4 className="text-xs font-extrabold text-[#16422B] leading-snug">{tItem.title}</h4>
          <p className="text-[11px] text-[#5A6B61] mt-1 line-clamp-3 leading-relaxed">
            {tItem.description}
          </p>
        </div>

        {/* Alvo e Impacto Esperado */}
        <div className="bg-[#F8FAF9] border border-[#E2E8E4] rounded-xl p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-[#5A6B61]">{t('evolution.target')}:</span>
            <span className="font-mono font-bold text-[#16422B] truncate max-w-[180px]">
              {tItem.target_name || tItem.target_id}
            </span>
          </div>
          <div className="text-[10px] text-emerald-800 font-bold flex items-start gap-1">
            <Zap className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
            <span>{tItem.expected_impact}</span>
          </div>
        </div>

        {/* Indicador visual das 3 etapas ao vivo quando na coluna 'Executando no Antigravity' */}
        {isActiveExecution && (
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-extrabold text-indigo-900">
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3 h-3 text-indigo-700" />
                {t('evolution.executionLockActive')}
              </span>
              <span className="text-[9px] text-indigo-700 font-mono">
                {tItem.status === 'QUEUED'
                  ? '1/3'
                  : tItem.status === 'RUNNING_IN_ANTIGRAVITY'
                  ? '2/3'
                  : '3/3'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[9px] font-bold text-center">
              <div
                className={`py-1 px-1 rounded-md border ${
                  tItem.status === 'QUEUED'
                    ? 'bg-blue-600 text-white border-blue-700 animate-pulse'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}
              >
                1. Queue
              </div>
              <div
                className={`py-1 px-1 rounded-md border ${
                  tItem.status === 'RUNNING_IN_ANTIGRAVITY'
                    ? 'bg-indigo-600 text-white border-indigo-700 animate-pulse'
                    : tItem.status === 'TESTING'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-white/70 text-gray-400 border-gray-200'
                }`}
              >
                2. Apply
              </div>
              <div
                className={`py-1 px-1 rounded-md border ${
                  tItem.status === 'TESTING'
                    ? 'bg-purple-600 text-white border-purple-700 animate-pulse'
                    : 'bg-white/70 text-gray-400 border-gray-200'
                }`}
              >
                3. Smoke Test
              </div>
            </div>
          </div>
        )}

        {/* Metadados de Auditoria */}
        <div className="flex items-center justify-between text-[10px] text-[#5A6B61] pt-0.5">
          <span className="font-mono">ID: #{tItem.id}</span>
          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            {Number(tItem.estimated_savings_brl || 0) > 0
              ? `-R$ ${Number(tItem.estimated_savings_brl).toFixed(2)}/mês • 0 tokens`
              : '0 tokens (Antigravity Free)'}
          </span>
        </div>

        {tItem.approved_by && (
          <div className="text-[10px] text-[#5A6B61] bg-[#EFF5F1] px-2.5 py-1 rounded-lg flex items-center justify-between">
            <span>
              Por: <strong>{tItem.approved_by}</strong>
            </span>
            {tItem.completed_at && <span>{formatBrtDateTime(tItem.completed_at)}</span>}
          </div>
        )}

        {tItem.status === 'ROLLED_BACK' && tItem.rolled_back_by && (
          <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
            Revertido por <strong>{tItem.rolled_back_by}</strong> em{' '}
            {formatBrtDateTime(tItem.rolled_back_at)}
          </div>
        )}

        {/* Botões de Ação do Card */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#EFF5F1]">
          <button
            type="button"
            onClick={() => {
              setDiffTask(tItem);
              setDiffTab('unified');
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E2E8E4] hover:border-[#16422B] text-[#16422B] text-[11px] font-bold transition bg-white hover:bg-[#F4F7F5] whitespace-nowrap"
          >
            <FileDiff className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t('evolution.viewDiffLogs')}</span>
          </button>

          {isAdmin && tItem.status === 'PENDING_APPROVAL' && (
            <button
              type="button"
              disabled={executingBatch || lockedTaskIdsRef.current.has(tItem.id)}
              onClick={() => handleExecuteTasks([tItem.id])}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#16422B] hover:bg-[#235A3D] text-white text-[11px] font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('evolution.execute')}</span>
            </button>
          )}

          {isActiveExecution && (
            <button
              type="button"
              disabled
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-extrabold cursor-not-allowed whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
              <span className="truncate">
                {tItem.status === 'QUEUED'
                  ? t('evolution.queuedLocked')
                  : tItem.status === 'RUNNING_IN_ANTIGRAVITY'
                  ? t('evolution.runningLocked')
                  : t('evolution.testingLocked')}
              </span>
            </button>
          )}

          {isAdmin && tItem.status === 'COMPLETED' && (
            <button
              type="button"
              disabled={rollingBackId === tItem.id}
              onClick={() => handleRollbackTask(tItem.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[11px] font-extrabold transition disabled:opacity-50 whitespace-nowrap"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 shrink-0 ${rollingBackId === tItem.id ? 'animate-spin' : ''}`}
              />
              <span className="truncate">{rollingBackId === tItem.id ? t('evolution.reverting') : t('evolution.rollback')}</span>
            </button>
          )}

          {isAdmin && tItem.status === 'ROLLED_BACK' && (
            <button
              type="button"
              disabled={executingBatch || lockedTaskIdsRef.current.has(tItem.id)}
              onClick={() => handleExecuteTasks([tItem.id])}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#EFF5F1] hover:bg-[#16422B] text-[#16422B] hover:text-white text-[11px] font-bold transition disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('evolution.reapply')}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[#F8FAF9] p-2 sm:p-4 md:p-6 pb-6 md:pb-6 space-y-4 md:space-y-5">
      {/* Toast de Feedback */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-6 z-50 bg-[#16422B] text-white px-4 py-3 rounded-2xl shadow-xl border border-emerald-700 flex items-center gap-2.5 text-xs font-bold animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* BANNER PRINCIPAL + TOGGLE DE AUTONOMIA TOTAL (FULL-AUTO) */}
      <div className="bg-gradient-to-r from-[#16422B] via-[#1C5236] to-[#133824] rounded-3xl p-5 md:p-6 text-white shadow-lg border border-[#255C3E]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-xs text-emerald-200 text-[11px] font-extrabold uppercase tracking-wider">
              <Cpu className="w-3.5 h-3.5 shrink-0" />
              <span>{t('evolution.bannerBadge')}</span>
            </div>
            <h1 className="text-lg md:text-2xl font-black tracking-tight">
              {t('evolution.bannerTitle')}
            </h1>
            <p className="text-xs md:text-sm text-emerald-100/90 leading-relaxed">
              {t('evolution.bannerDesc')}
            </p>
          </div>

          {/* Card de Controle do Modo de Autonomia Total (Full-Auto) */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex flex-col gap-3 min-w-[290px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  {t('evolution.fullAutoTitle')}
                </div>
                <div className="text-[11px] text-white/85 font-medium mt-0.5">
                  {settings.full_auto_mode
                    ? t('evolution.fullAutoActive')
                    : t('evolution.fullAutoSupervised')}
                </div>
              </div>

              <button
                type="button"
                disabled={!isAdmin || savingSettings}
                onClick={handleToggleFullAuto}
                className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  settings.full_auto_mode ? 'bg-emerald-400' : 'bg-white/25'
                } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={t('evolution.fullAutoTitle')}
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    settings.full_auto_mode ? 'translate-x-8' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/15 text-[11px] gap-2">
              <button
                type="button"
                onClick={() => setShowAutoConfig((prev) => !prev)}
                className="inline-flex items-center gap-1 text-emerald-200 hover:text-white font-bold transition truncate"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{showAutoConfig ? t('evolution.hideAutoRules') : t('evolution.configureAutoFilters')}</span>
              </button>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-400/30 text-emerald-200 font-bold shrink-0 whitespace-nowrap">
                {t('evolution.maxRisk')}: {settings.max_auto_risk_level}
              </span>
            </div>
          </div>
        </div>

        {/* Painel Expansível de Filtros Full-Auto (Quais categorias podem rodar sem aprovação) */}
        {showAutoConfig && (
          <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 rounded-2xl p-4">
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-emerald-200">
                {t('evolution.allowedCategoriesLabel')}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(CATEGORY_META).map((cat) => {
                  const active = (settings.allowed_categories || []).includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => handleToggleAllowedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                        active
                          ? 'bg-emerald-400 text-[#0D2618] border-emerald-300 shadow-xs'
                          : 'bg-white/10 text-white/70 border-white/15 hover:bg-white/20'
                      }`}
                    >
                      {active ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      {tr(cat)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-extrabold text-emerald-200">
                {t('evolution.maxRiskAllowedLabel')}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {['LOW', 'MEDIUM', 'HIGH'].map((rLevel) => (
                  <button
                    key={rLevel}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => handleUpdateAutoFilter({ max_auto_risk_level: rLevel })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold border transition whitespace-nowrap ${
                      settings.max_auto_risk_level === rLevel
                        ? 'bg-amber-300 text-amber-950 border-amber-200'
                        : 'bg-white/10 text-white/75 border-white/15 hover:bg-white/20'
                    }`}
                  >
                    {tr(RISK_META[rLevel].label)} ({rLevel})
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CARDS DE MÉTRICAS E KPIS FINOPS / ANTIGRAVITY */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs">
          <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
            <span>{t('evolution.metaAgentCost')}</span>
            <Cpu className="w-4 h-4 text-[#16422B] shrink-0" />
          </div>
          <div className="text-lg md:text-xl font-black text-[#16422B] mt-1">R$ 0,00</div>
          <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
            {t('evolution.zeroPaidTokens')}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs">
          <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
            <span>{t('evolution.pendingBacklog')}</span>
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="text-lg md:text-xl font-black text-amber-700 mt-1">
            {metrics.pending_approval} {t('evolution.tasksCount')}
          </div>
          <div className="text-[10px] font-semibold text-[#5A6B61] mt-0.5">
            {t('evolution.potential')}: +R$ {Number(metrics.estimated_monthly_savings_pending_brl || 0).toFixed(2)}/mês
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs">
          <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
            <span>{t('evolution.appliedEvolutions')}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="text-lg md:text-xl font-black text-emerald-700 mt-1">
            {metrics.completed_count} {t('evolution.completedCount')}
          </div>
          <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">
            {t('evolution.integrityTested')}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs">
          <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
            <span>{t('evolution.activeFinopsSavings')}</span>
            <TrendingDown className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="text-lg md:text-xl font-black text-[#16422B] mt-1">
            R$ {Number(metrics.estimated_monthly_savings_applied_brl || 0).toFixed(2)}/mês
          </div>
          <div className="text-[10px] font-semibold text-[#5A6B61] mt-0.5">
            {t('evolution.currentForecastCost')}: R$ {Number(metrics.current_monthly_cost_brl || 2.07).toFixed(2)}/mês
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
            <span>{t('evolution.rollbackSnapshots')}</span>
            <RotateCcw className="w-4 h-4 text-indigo-600 shrink-0" />
          </div>
          <div className="text-lg md:text-xl font-black text-indigo-900 mt-1">
            {metrics.active_snapshots_count} {t('evolution.pointsCount')}
          </div>
          <div className="text-[10px] font-semibold text-[#5A6B61] mt-0.5">
            {t('evolution.instantOneClickRestore')}
          </div>
        </div>
      </div>

      {/* BARRA DE FERRAMENTAS DO BACKLOG: SELEÇÃO MÚLTIPLA, FILTROS E EXECUÇÃO EM LOTE */}
      <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] shadow-2xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        {/* Esquerda: Seleção em Lote e Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={toggleSelectAllPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8E4] hover:border-[#16422B] text-xs font-bold text-[#16422B] bg-[#F8FAF9] transition whitespace-nowrap"
            >
              {selectablePendingIds.length > 0 &&
              selectablePendingIds.every((id) => selectedIds.includes(id)) ? (
                <CheckSquare className="w-4 h-4 text-[#16422B] shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              {t('evolution.selectPending')} ({selectablePendingIds.length})
            </button>
          )}

          {/* Filtro por Categoria */}
          <div className="flex items-center gap-1 bg-[#F8FAF9] border border-[#E2E8E4] rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#16422B] focus:outline-hidden"
            >
              <option value="ALL">{t('evolution.allCategories')}</option>
              {Object.keys(CATEGORY_META).map((cat) => (
                <option key={cat} value={cat}>
                  {tr(cat)}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Nível de Risco */}
          <div className="flex items-center gap-1 bg-[#F8FAF9] border border-[#E2E8E4] rounded-xl px-2.5 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#5A6B61] shrink-0" />
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#16422B] focus:outline-hidden"
            >
              <option value="ALL">{t('evolution.allRiskLevels')}</option>
              <option value="LOW">{t('evolution.lowRisk')}</option>
              <option value="MEDIUM">{t('evolution.mediumRisk')}</option>
              <option value="HIGH">{t('evolution.highRisk')}</option>
            </select>
          </div>

          {/* Alternador de Visão: Kanban | Lista | Auditoria */}
          <div className="inline-flex items-center bg-[#EFF5F1] p-1 rounded-xl border border-[#E2E8E4]">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition whitespace-nowrap ${
                viewMode === 'kanban' ? 'bg-white text-[#16422B] shadow-2xs' : 'text-[#5A6B61]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              {t('evolution.kanbanView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition whitespace-nowrap ${
                viewMode === 'list' ? 'bg-white text-[#16422B] shadow-2xs' : 'text-[#5A6B61]'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5 shrink-0" />
              {t('evolution.listView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('audit')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition whitespace-nowrap ${
                viewMode === 'audit' ? 'bg-white text-[#16422B] shadow-2xs' : 'text-[#5A6B61]'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              {t('evolution.snapshotsRollbackView')}
            </button>
          </div>
        </div>

        {/* Direita: Botões de Ação (Executar Selecionadas no Antigravity + Diagnóstico Radar + Nova Tarefa) */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowNewTaskModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8E4] hover:border-[#16422B] text-xs font-bold text-[#16422B] bg-white transition whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              {t('evolution.newTask')}
            </button>
          )}

          <button
            type="button"
            disabled={auditing}
            onClick={handleRunAuditNow}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#16422B] text-xs font-extrabold text-[#16422B] bg-[#EFF5F1] hover:bg-[#E2EFE6] transition disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${auditing ? 'animate-spin' : ''}`} />
            {auditing ? t('evolution.auditingSystem') : t('evolution.runRadarAudit')}
          </button>

          {isAdmin && (
            <button
              type="button"
              disabled={selectedIds.length === 0 || executingBatch}
              onClick={() => handleExecuteTasks(selectedIds)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16422B] hover:bg-[#235A3D] text-white text-xs font-extrabold shadow-sm transition disabled:opacity-40 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              {executingBatch
                ? t('evolution.executingBatch')
                : t('evolution.executeSelected', { count: selectedIds.length })}
            </button>
          )}
        </div>
      </div>

      {/* BANNER DE BLOQUEIO DE FILA E EXECUÇÃO ATIVA (PERSISTENTE APÓS F5) */}
      {activeRunningTasks.length > 0 && (
        <div className="bg-indigo-950 text-white rounded-2xl px-4 py-3 border border-indigo-700 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-800 border border-indigo-500 shrink-0">
              <Lock className="w-3.5 h-3.5 text-indigo-200 animate-pulse" />
            </span>
            <div>
              <span className="text-indigo-200 font-extrabold uppercase tracking-wider mr-2">
                {t('evolution.executionLockActive')}:
              </span>
              <span>
                {activeRunningTasks.length} {t('evolution.tasksCount')}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-indigo-200 font-semibold bg-indigo-900/80 px-2.5 py-1 rounded-lg border border-indigo-700 shrink-0">
            Queue Persisted
          </span>
        </div>
      )}

      {/* LAYOUT PRINCIPAL: KANBAN / LISTA + CONSOLE DE ACOMPANHAMENTO EM TEMPO REAL */}
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA (8 cols): KANBAN OU LISTA DE TAREFAS */}
        <div className="2xl:col-span-8 space-y-4">
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {kanbanColumns.map((col) => {
                const defaultColLimit =
                  col.id === 'col-running' ? Math.max(INITIAL_KANBAN_LIMIT, 10) : INITIAL_KANBAN_LIMIT;
                const colLimit = kanbanLimits[col.id] || defaultColLimit;
                const visibleItems = col.items.slice(0, colLimit);
                const remainingCount = Math.max(0, col.items.length - colLimit);
                const isExpanded = colLimit > defaultColLimit && col.items.length > defaultColLimit;

                return (
                  <div
                    key={col.id}
                    className="bg-[#EFF5F1]/60 border border-[#E2E8E4] rounded-2xl p-3 flex flex-col gap-3 min-h-[420px]"
                  >
                    <div className={`p-3 rounded-xl border shrink-0 ${col.headerColor}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-extrabold">{col.title}</h3>
                        <span className="px-2 py-0.5 rounded-full bg-white/80 text-[11px] font-black shrink-0">
                          {col.items.length}
                        </span>
                      </div>
                      <p className="text-[10px] opacity-80 font-medium mt-0.5">{col.subtitle}</p>
                    </div>

                    <div className="space-y-3 flex-1">
                      {col.items.length === 0 ? (
                        <div className="h-40 border border-dashed border-[#CBD5E0] rounded-xl flex items-center justify-center text-[11px] text-[#5A6B61] font-medium p-4 text-center">
                          {t('evolution.noTasksInStage')}
                        </div>
                      ) : (
                        visibleItems.map((tItem) => renderTaskCard(tItem))
                      )}
                    </div>

                    {(remainingCount > 0 || isExpanded) && (
                      <div className="pt-1 border-t border-[#E2E8E4] flex items-center gap-2 shrink-0">
                        {remainingCount > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setKanbanLimits((prev) => ({
                                ...prev,
                                [col.id]: (prev[col.id] || INITIAL_KANBAN_LIMIT) + 5
                              }))
                            }
                            className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-[#16422B] hover:text-white text-[#16422B] border border-[#CBD5E0] text-[11px] font-extrabold transition shadow-2xs"
                          >
                            {t('evolution.showMore')} (+{remainingCount})
                          </button>
                        )}
                        {isExpanded && (
                          <button
                            type="button"
                            onClick={() =>
                              setKanbanLimits((prev) => ({
                                ...prev,
                                [col.id]: INITIAL_KANBAN_LIMIT
                              }))
                            }
                            className="py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold transition"
                          >
                            {t('evolution.showLess')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'list' && (
            <div className="bg-white rounded-2xl border border-[#E2E8E4] overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#F4F7F5] border-b border-[#E2E8E4] text-[11px] font-extrabold text-[#16422B]">
                      <th className="p-3 w-10">Sel.</th>
                      <th className="p-3">Tarefa & Diagnóstico</th>
                      <th className="p-3">Categoria</th>
                      <th className="p-3">Risco</th>
                      <th className="p-3">Impacto / FinOps</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E4] text-xs">
                    {filteredTasks.slice(0, listLimit).map((tItem) => {
                      const isSelectable = tItem.status === 'PENDING_APPROVAL';
                      const isSelected = selectedIds.includes(tItem.id);
                      const stMeta = STATUS_META[tItem.status] || STATUS_META.PENDING_APPROVAL;
                      const riskMeta = RISK_META[tItem.risk_level] || RISK_META.LOW;
                      return (
                        <tr key={tItem.id} className="hover:bg-[#F8FAF9]">
                          <td className="p-3">
                            {isSelectable && isAdmin && (
                              <button type="button" onClick={() => toggleSelectOne(tItem.id)}>
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#16422B]" />
                                ) : (
                                  <Square className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="p-3 max-w-md">
                            <div className="font-extrabold text-[#16422B]">{tItem.title}</div>
                            <div className="text-[11px] text-[#5A6B61] line-clamp-2 mt-0.5">
                              {tItem.description}
                            </div>
                            <div className="text-[10px] font-mono text-gray-400 mt-1">
                              ID: #{tItem.id} • {t('evolution.target')}: {tItem.target_name || tItem.target_id}
                            </div>
                          </td>
                          <td className="p-3 font-bold text-[#16422B]">{tr(tItem.category)}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${riskMeta.badge}`}
                            >
                              {tr(riskMeta.label)}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] font-semibold text-emerald-800 max-w-xs">
                            {tItem.expected_impact}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${stMeta.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot}`} />
                              {tr(stMeta.label)}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setDiffTask(tItem);
                                setDiffTab('unified');
                              }}
                              className="px-2.5 py-1 rounded-lg border border-[#E2E8E4] hover:border-[#16422B] text-[11px] font-bold text-[#16422B]"
                            >
                              Diff
                            </button>
                            {isAdmin && tItem.status === 'PENDING_APPROVAL' && (
                              <button
                                type="button"
                                disabled={executingBatch || lockedTaskIdsRef.current.has(tItem.id)}
                                onClick={() => handleExecuteTasks([tItem.id])}
                                className="px-2.5 py-1 rounded-lg bg-[#16422B] text-white text-[11px] font-bold disabled:opacity-50"
                              >
                                {t('evolution.execute')}
                              </button>
                            )}
                            {['QUEUED', 'RUNNING_IN_ANTIGRAVITY', 'TESTING'].includes(tItem.status) && (
                              <button
                                type="button"
                                disabled
                                className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-300 text-[11px] font-extrabold cursor-not-allowed inline-flex items-center gap-1"
                              >
                                <Lock className="w-3 h-3" />
                                {tItem.status === 'QUEUED' ? t('evolution.queuedLocked') : t('evolution.runningLocked')}
                              </button>
                            )}
                            {isAdmin && tItem.status === 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => handleRollbackTask(tItem.id)}
                                className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-extrabold"
                              >
                                Rollback
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredTasks.length > INITIAL_LIST_LIMIT && (
                <div className="p-3 bg-[#F8FAF9] border-t border-[#E2E8E4] flex items-center justify-center gap-3">
                  {filteredTasks.length > listLimit && (
                    <button
                      type="button"
                      onClick={() => setListLimit((prev) => prev + 8)}
                      className="px-4 py-1.5 rounded-xl bg-white hover:bg-[#16422B] hover:text-white text-[#16422B] border border-[#CBD5E0] text-xs font-extrabold transition"
                    >
                      {t('evolution.showMore')} (+{filteredTasks.length - listLimit})
                    </button>
                  )}
                  {listLimit > INITIAL_LIST_LIMIT && (
                    <button
                      type="button"
                      onClick={() => setListLimit(INITIAL_LIST_LIMIT)}
                      className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition"
                    >
                      {t('evolution.showLess')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {viewMode === 'audit' && (
            <div className="bg-white rounded-2xl border border-[#E2E8E4] p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-[#16422B]">
                    {t('evolution.snapshotsRollbackView')} (`system_snapshots`)
                  </h3>
                  <p className="text-xs text-[#5A6B61]">
                    {t('evolution.instantOneClickRestore')}
                  </p>
                </div>
              </div>

              {(() => {
                const auditTasks = tasks.filter((tItem) =>
                  ['COMPLETED', 'ROLLED_BACK'].includes(tItem.status)
                );
                if (auditTasks.length === 0) {
                  return (
                    <div className="p-8 text-center text-xs text-[#5A6B61] border border-dashed border-[#E2E8E4] rounded-2xl">
                      {t('evolution.noTasksInStage')}
                    </div>
                  );
                }
                const visibleAudit = auditTasks.slice(0, auditLimit);
                const remainingAudit = Math.max(0, auditTasks.length - auditLimit);
                return (
                  <>
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                      {visibleAudit.map((tItem) => (
                        <div
                          key={tItem.id}
                          className="p-3.5 rounded-2xl border border-[#E2E8E4] bg-[#F8FAF9] flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-[11px] font-bold text-[#16422B] bg-white px-2 py-0.5 rounded-md border border-[#E2E8E4]">
                                #{tItem.id}
                              </span>
                              {tItem.snapshot_id && (
                                <span className="font-mono text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                  Snapshot: {tItem.snapshot_id}
                                </span>
                              )}
                              <span className="text-xs font-extrabold text-[#16422B]">{tItem.title}</span>
                            </div>
                            <div className="text-[11px] text-[#5A6B61]">
                              <strong>{tItem.approved_by || 'System'}</strong> •{' '}
                              <strong>{formatBrtDateTime(tItem.completed_at)}</strong> •{' '}
                              <strong className="text-emerald-700">0 tokens</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setDiffTask(tItem);
                                setDiffTab('unified');
                              }}
                              className="px-3 py-1.5 rounded-xl border border-[#E2E8E4] bg-white text-xs font-bold text-[#16422B] hover:border-[#16422B] whitespace-nowrap"
                            >
                              {t('evolution.viewDiffLogs')}
                            </button>

                            {isAdmin && tItem.status === 'COMPLETED' && (
                              <button
                                type="button"
                                disabled={rollingBackId === tItem.id}
                                onClick={() => handleRollbackTask(tItem.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                                {t('evolution.rollback')}
                              </button>
                            )}

                            {tItem.status === 'ROLLED_BACK' && (
                              <span className="px-3 py-1.5 rounded-xl bg-gray-200 text-gray-700 text-xs font-bold whitespace-nowrap">
                                Rollback
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {auditTasks.length > INITIAL_LIST_LIMIT && (
                      <div className="pt-2 border-t border-[#E2E8E4] flex items-center justify-center gap-3">
                        {remainingAudit > 0 && (
                          <button
                            type="button"
                            onClick={() => setAuditLimit((prev) => prev + 8)}
                            className="px-4 py-1.5 rounded-xl bg-white hover:bg-[#16422B] hover:text-white text-[#16422B] border border-[#CBD5E0] text-xs font-extrabold transition"
                          >
                            {t('evolution.showMore')} (+{remainingAudit})
                          </button>
                        )}
                        {auditLimit > INITIAL_LIST_LIMIT && (
                          <button
                            type="button"
                            onClick={() => setAuditLimit(INITIAL_LIST_LIMIT)}
                            className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition"
                          >
                            {t('evolution.showLess')}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (4 cols): CONSOLE DE ACOMPANHAMENTO EM TEMPO REAL (ANTIGRAVITY LIVE STREAM) */}
        <div className="2xl:col-span-4 bg-[#0D1410] text-gray-100 rounded-3xl border border-[#1E3327] shadow-xl overflow-hidden flex flex-col h-[620px]">
          {/* Header do Console */}
          <div className="px-4 py-3.5 bg-[#121D17] border-b border-[#1E3327] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-extrabold text-white tracking-wide truncate">
                  {t('evolution.consoleTitle')}
                </h3>
                <p className="text-[10px] text-emerald-300/80 truncate">
                  {t('evolution.consoleSubtitle')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                  sseConnected
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-amber-950 text-amber-300 border-amber-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    sseConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                {sseConnected ? 'SSE Live' : 'Sync Ativo'}
              </span>
            </div>
          </div>

          {/* Corpo dos Logs do Console */}
          <div ref={consoleContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-[11px]">
            {liveEvents.length === 0 ? (
              <div className="text-gray-400 text-center py-12">
                {t('evolution.waitingEvents')}
              </div>
            ) : (
              liveEvents.map((ev, idx) => {
                let badgeCls = 'bg-gray-800 text-gray-300 border-gray-700';
                if (ev.level === 'SUCCESS' || ev.step === 'COMPLETED') {
                  badgeCls = 'bg-emerald-950 text-emerald-300 border-emerald-700';
                } else if (ev.level === 'ERROR') {
                  badgeCls = 'bg-red-950 text-red-300 border-red-700';
                } else if (ev.level === 'WARNING' || ev.step === 'ROLLBACK') {
                  badgeCls = 'bg-amber-950 text-amber-300 border-amber-700';
                } else if (ev.level === 'STEP' || ev.step === 'APPLY' || ev.step === 'ANTIGRAVITY') {
                  badgeCls = 'bg-indigo-950 text-indigo-300 border-indigo-700';
                }

                return (
                  <div
                    key={ev.id || idx}
                    className="p-2.5 rounded-xl bg-[#121C16] border border-[#1D2F24] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">{ev.time_human || formatBrtTime(ev.timestamp)}</span>
                        <span className={`px-1.5 py-0.2 rounded-sm border font-bold ${badgeCls}`}>
                          {ev.step}
                        </span>
                      </div>
                      <span className="text-emerald-400/80 font-bold">#{ev.task_id}</span>
                    </div>
                    <div className="text-gray-200 leading-relaxed break-words">{ev.message}</div>
                  </div>
                );
              })
            )}
          </div>

          {/* Rodapé do Console: Atalhos Rápidos de Rollback das Últimas Tarefas Concluídas */}
          <div className="p-3 bg-[#121D17] border-t border-[#1E3327] space-y-2">
            <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              <span>Últimas Alterações Aplicadas (Rollback Rápido)</span>
              <span>0 Tokens</span>
            </div>
            <div className="space-y-1.5">
              {tasks
                .filter((t) => t.status === 'COMPLETED')
                .slice(0, 3)
                .map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 bg-[#0D1410] px-2.5 py-1.5 rounded-xl border border-[#1E3327] text-[11px]"
                  >
                    <span className="truncate text-emerald-200 font-semibold">{t.title}</span>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={rollingBackId === t.id}
                        onClick={() => handleRollbackTask(t.id)}
                        className="shrink-0 px-2 py-0.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/30 text-[10px] font-extrabold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Desfazer
                      </button>
                    )}
                  </div>
                ))}
              {tasks.filter((t) => t.status === 'COMPLETED').length === 0 && (
                <div className="text-[10px] text-gray-500 italic">
                  Nenhuma alteração pendente de reversão no momento.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE VISUALIZAÇÃO DE DIFF TÉCNICO E LOGS DE AUDITORIA */}
      {diffTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-[#E2E8E4] shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-5 bg-[#16422B] text-white flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-emerald-200 font-bold">
                  <span>Tarefa #{diffTask.id}</span>
                  <span>•</span>
                  <span>{diffTask.category}</span>
                  <span>•</span>
                  <span>Risco: {diffTask.risk_level}</span>
                  {diffTask.snapshot_id && (
                    <>
                      <span>•</span>
                      <span>Snapshot: {diffTask.snapshot_id}</span>
                    </>
                  )}
                </div>
                <h3 className="text-base md:text-lg font-black">{diffTask.title}</h3>
              </div>

              <button
                type="button"
                onClick={() => setDiffTask(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Abas do Modal */}
            <div className="px-5 py-2.5 bg-[#F4F7F5] border-b border-[#E2E8E4] flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDiffTab('unified')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    diffTab === 'unified'
                      ? 'bg-[#16422B] text-white'
                      : 'bg-white text-[#16422B] border border-[#E2E8E4]'
                  }`}
                >
                  Diff Unificado (Git Style)
                </button>
                <button
                  type="button"
                  onClick={() => setDiffTab('split')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    diffTab === 'split'
                      ? 'bg-[#16422B] text-white'
                      : 'bg-white text-[#16422B] border border-[#E2E8E4]'
                  }`}
                >
                  Estado Anterior vs. Novo Estado
                </button>
                <button
                  type="button"
                  onClick={() => setDiffTab('logs')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    diffTab === 'logs'
                      ? 'bg-[#16422B] text-white'
                      : 'bg-white text-[#16422B] border border-[#E2E8E4]'
                  }`}
                >
                  Logs de Execução ({diffTask.execution_logs?.length || 0})
                </button>
              </div>

              <span className="text-xs font-bold text-emerald-800">
                Impacto: {diffTask.expected_impact}
              </span>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#F8FAF9] border border-[#E2E8E4] text-xs text-[#2D3748] leading-relaxed">
                <strong>Diagnóstico Técnico do Meta-Agente:</strong> {diffTask.description}
              </div>

              {diffTab === 'unified' &&
                renderDiffLines(
                  diffTask.payload?.diff ||
                    `--- Antes\n+++ Depois\n-${diffTask.payload?.before || ''}\n+${
                      diffTask.payload?.after || ''
                    }`
                )}

              {diffTab === 'split' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs font-extrabold text-red-800 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
                      Estado Anterior (Salvo em Snapshot)
                    </div>
                    <pre className="p-3.5 rounded-2xl bg-[#F8FAF9] border border-[#E2E8E4] text-xs font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
                      {diffTask.payload?.before || '(Vazio)'}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                      Novo Estado Proposto / Aplicado (Antigravity)
                    </div>
                    <pre className="p-3.5 rounded-2xl bg-emerald-50/30 border border-emerald-200 text-xs font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
                      {diffTask.payload?.after || '(Sem conteúdo)'}
                    </pre>
                  </div>
                </div>
              )}

              {diffTab === 'logs' && (
                <div className="space-y-2 font-mono text-xs bg-[#0D1410] text-gray-200 p-4 rounded-2xl">
                  {(diffTask.execution_logs || []).map((lg, i) => (
                    <div key={i} className="border-b border-white/10 pb-2 last:border-none">
                      <span className="text-emerald-400 font-bold">
                        [{lg.time_human || 'Log'}] [{lg.step}]
                      </span>{' '}
                      <span>{lg.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 bg-[#F8FAF9] border-t border-[#E2E8E4] flex items-center justify-between">
              <div className="text-xs text-[#5A6B61]">
                Status atual: <strong>{STATUS_META[diffTask.status]?.label || diffTask.status}</strong>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && diffTask.status === 'PENDING_APPROVAL' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleExecuteTasks([diffTask.id]);
                      setDiffTask(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#16422B] hover:bg-[#235A3D] text-white text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Aprovar e Executar no Antigravity
                  </button>
                )}

                {isAdmin && diffTask.status === 'COMPLETED' && (
                  <button
                    type="button"
                    disabled={rollingBackId === diffTask.id}
                    onClick={() => handleRollbackTask(diffTask.id)}
                    className="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rollback Instantâneo (1-Clique)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDiffTask(null)}
                  className="px-4 py-2 rounded-xl border border-[#E2E8E4] bg-white text-xs font-bold text-[#5A6B61]"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CRIAR NOVA TAREFA EVOLUTIVA SOB DEMANDA */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCustomTask}
            className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 border border-[#E2E8E4] shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#16422B]">
                Encomendar Nova Evolução ao Meta-Agente
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#16422B] mb-1">Título da Evolução *</label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Ex: Otimizar prompt do Agente de SAC para triagem rápida"
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8E4] focus:border-[#16422B] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#16422B] mb-1">Categoria</label>
                  <select
                    value={newTaskCategory}
                    onChange={(e) => setNewTaskCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8E4] bg-white"
                  >
                    {Object.keys(CATEGORY_META).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#16422B] mb-1">Nível de Risco</label>
                  <select
                    value={newTaskRisk}
                    onChange={(e) => setNewTaskRisk(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8E4] bg-white"
                  >
                    <option value="LOW">LOW (Baixo)</option>
                    <option value="MEDIUM">MEDIUM (Médio)</option>
                    <option value="HIGH">HIGH (Alto)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#16422B] mb-1">Impacto Esperado</label>
                <input
                  type="text"
                  value={newTaskImpact}
                  onChange={(e) => setNewTaskImpact(e.target.value)}
                  placeholder="Ex: Redução de 30% em tokens e resposta imediata"
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8E4] focus:border-[#16422B] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-[#16422B] mb-1">
                  Descrição / Especificação da Mudança *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  placeholder="Descreva a regra, melhoria de prompt, script MCP ou integração desejada..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8E4] focus:border-[#16422B] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E8E4] text-xs font-bold text-[#5A6B61]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingTask}
                className="px-4 py-2 rounded-xl bg-[#16422B] text-white text-xs font-extrabold"
              >
                {creatingTask ? 'Adicionando...' : 'Adicionar ao Backlog'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
