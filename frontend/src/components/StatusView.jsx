import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Cpu,
  Sparkles,
  Check,
  Save,
  RefreshCw,
  Shield,
  Users,
  Cloud,
  Calendar,
  UserPlus,
  Trash2,
  X,
  Calculator,
  Clock,
  TrendingDown,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronUp,
  Settings,
  Mail,
  FolderOpen,
  Play,
  Plus,
  Edit3,
  Activity,
  Bot,
  Sliders,
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Layers,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  Send,
  Coins
} from 'lucide-react';
import { OFFICIAL_LOGO_URL, getOfficialLogoUrl, getOfficialBrandName } from '../utils/reportFormatters';
import { CompanyLogo } from './CompanyLogo';
import { TaskLiveModal } from './TaskLiveModal';
import { DepartmentManagerModal, DEFAULT_DEPARTMENTS } from './DepartmentManagerModal';
import ApproversModal from './ApproversModal';
import { formatBrtDateTime } from '../utils/dateUtils';
import { useLanguage } from '../i18n';
import { LanguageSelector } from './LanguageSelector';

const FREQUENCY_PRESETS = [
  { label: 'Todo Sábado às 09:00', cron: '0 9 * * 6' },
  { label: 'Todo Sábado às 08:00', cron: '0 8 * * 6' },
  { label: 'Diariamente às 07:30', cron: '30 7 * * *' },
  { label: 'Diariamente às 08:00', cron: '0 8 * * *' },
  { label: 'Diariamente às 18:00', cron: '0 18 * * *' },
  { label: 'Segunda a Sexta às 08:00', cron: '0 8 * * 1-5' },
  { label: 'Segunda a Sexta às 09:00', cron: '0 9 * * 1-5' },
  { label: 'Toda Segunda-feira às 08:00', cron: '0 8 * * 1' },
  { label: 'Toda Sexta-feira às 17:00', cron: '0 17 * * 5' },
  { label: 'Todo Dia 1º do Mês às 08:00', cron: '0 8 1 * *' },
  { label: 'Todo Dia 5 do Mês às 08:30', cron: '30 8 5 * *' },
  { label: 'A cada 4 horas', cron: '0 */4 * * *' }
];

export function StatusView({ user }) {
  const { t, tr, lang } = useLanguage();
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('sec-ai');

  // Settings & Parâmetros Globais
  const [settings, setSettings] = useState(null);
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash-medium');
  const [newApiKey, setNewApiKey] = useState('');
  const [partnerEmails, setPartnerEmails] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('example.com');
  const [companyName, setCompanyName] = useState('AI Board');
  const [companyLegalName, setCompanyLegalName] = useState('AI Board Enterprise Solutions');
  const [companyLogoUrl, setCompanyLogoUrl] = useState(OFFICIAL_LOGO_URL);
  const [reportsDriveFolder, setReportsDriveFolder] = useState('Boletins Executivos AI Board');
  const [backupGdrivePath, setBackupGdrivePath] = useState('gdrive:IT/Internal Software/ServerBackup/crewai');
  const [backupRetentionDays, setBackupRetentionDays] = useState('14');
  const [backupCronTime, setBackupCronTime] = useState('03:45');
  const [cronSchedulerEnabled, setCronSchedulerEnabled] = useState(true);
  const [taskTimeoutSeconds, setTaskTimeoutSeconds] = useState('300');
  const [usdBrlExchangeRate, setUsdBrlExchangeRate] = useState('');
  const [liveRateInfo, setLiveRateInfo] = useState({ rate: 5.65, provider: 'API Pública', isAuto: true });
  const [refreshingRate, setRefreshingRate] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramDefaultChatId, setTelegramDefaultChatId] = useState('');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [paramsToast, setParamsToast] = useState('');

  // Estimativa Dinâmica de Custos de IA
  const [costEstimate, setCostEstimate] = useState(null);
  const [maxDailyBudget, setMaxDailyBudget] = useState('5.00');
  const [killSwitchActive, setKillSwitchActive] = useState(true);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetToast, setBudgetToast] = useState('');
  const [costLoading, setCostLoading] = useState(false);
  const [costTab, setCostTab] = useState('scheduled');
  const [showTaskBreakdown, setShowTaskBreakdown] = useState(true);

  // Central de Tarefas Agendadas & Auto-Delegação
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksToast, setTasksToast] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskFormTitle, setTaskFormTitle] = useState('');
  const [taskFormFrequency, setTaskFormFrequency] = useState('Todo Sábado às 09:00');
  const [taskFormCron, setTaskFormCron] = useState('0 9 * * 6');
  const [taskFormAgentId, setTaskFormAgentId] = useState('auto');
  const [taskFormInstruction, setTaskFormInstruction] = useState('');
  const [taskFormEnabled, setTaskFormEnabled] = useState(true);
  // Seletor visual estilo Google Calendar (sem exigir digitação manual de CRON)
  const [schedMode, setSchedMode] = useState('weekly'); // 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly'
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedWeekdays, setSchedWeekdays] = useState([6]); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [schedMonthDay, setSchedMonthDay] = useState(1);
  const [schedIntervalHours, setSchedIntervalHours] = useState(4);
  const [showAdvancedCron, setShowAdvancedCron] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [runningScheduledTaskId, setRunningScheduledTaskId] = useState(null);
  const [liveModalTaskId, setLiveModalTaskId] = useState(null);
  const [taskDeptFilter, setTaskDeptFilter] = useState('');

  // Gestão de Usuários
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userToast, setUserToast] = useState('');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [userActionLoading, setUserActionLoading] = useState(false);

  // Backup Google Drive
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupToast, setBackupToast] = useState('');

  // Microserviços em Tempo Real
  const [microservicesData, setMicroservicesData] = useState(null);
  const [microservicesLoading, setMicroservicesLoading] = useState(false);

  // Validação & Aprovação de Ações (Human-in-the-Loop)
  const [requireApproval, setRequireApproval] = useState(true);
  const [pendingActions, setPendingActions] = useState([]);
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [approvers, setApprovers] = useState([]);
  const [showApproversModal, setShowApproversModal] = useState(false);
  const [actionProcessing, setActionProcessing] = useState({});
  const [chatwootHumanGuard, setChatwootHumanGuard] = useState({
    initial_wait_seconds: 180,
    human_takeover_mode: 'pause',
    human_takeover_ttl_seconds: 14400,
    extended_wait_seconds: 900
  });

  // Departamentos Dinâmicos
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptLoading, setDeptLoading] = useState(false);

  const scrollContainerRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const isAdmin = user?.role === 'admin';

  const navItems = [
    { id: 'sec-ai', label: t('status.secAi'), icon: Cpu },
    { id: 'sec-tasks', label: t('status.secTasks'), icon: Calendar },
    { id: 'sec-approval', label: t('status.secApproval'), icon: ShieldCheck },
    { id: 'sec-departments', label: t('status.secDepartments'), icon: Layers },
    { id: 'sec-params', label: t('status.secParams'), icon: Sliders },
    ...(isAdmin ? [{ id: 'sec-users', label: t('status.secUsers'), icon: Users }] : []),
    { id: 'sec-backup', label: t('status.secBackup'), icon: Cloud },
    { id: 'sec-services', label: t('status.secServices'), icon: Activity }
  ];

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);
    isProgrammaticScroll.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 800);

    const container = scrollContainerRef.current;
    const el = document.getElementById(sectionId);
    if (container && el) {
      const topPos = el.offsetTop - container.offsetTop - 8;
      container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
    } else if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

    // Scroll-spy: atualiza a seleção do menu lateral ao rolar a página
  useEffect(() => {
    if (initialLoading) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let ticking = false;

    const handleScroll = () => {
      if (isProgrammaticScroll.current) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!container) {
            ticking = false;
            return;
          }
          const containerRect = container.getBoundingClientRect();
          const sectionIds = navItems.map((item) => item.id);

          // Se estiver perto do final do scroll, seleciona a última seção
          if (container.scrollHeight - container.scrollTop <= container.clientHeight + 80) {
            setActiveSection(sectionIds[sectionIds.length - 1]);
            ticking = false;
            return;
          }

          let currentSection = sectionIds[0];
          for (const id of sectionIds) {
            const el = document.getElementById(id);
            if (el) {
              const elRect = el.getBoundingClientRect();
              const relativeTop = elRect.top - containerRect.top;
              if (relativeTop <= 160) {
                currentSection = id;
              }
            }
          }

          setActiveSection(currentSection);
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [initialLoading, navItems]);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setSelectedModel(data.gemini_model || 'gemini-3.8-flash-medium');
        if (data.max_daily_budget_brl !== undefined) setMaxDailyBudget(String(data.max_daily_budget_brl));
        if (data.kill_switch_active !== undefined) setKillSwitchActive(Boolean(data.kill_switch_active));
        if (data.partner_emails !== undefined) setPartnerEmails(data.partner_emails);
        if (data.allowed_domains !== undefined) setAllowedDomains(data.allowed_domains);
        if (data.company_name !== undefined) setCompanyName(data.company_name);
        if (data.company_legal_name !== undefined) setCompanyLegalName(data.company_legal_name);
        if (data.company_logo_url !== undefined) setCompanyLogoUrl(data.company_logo_url);
        if (data.company_name || data.company_logo_url || data.installed_tools) {
          let existing = {};
          try {
            existing = JSON.parse(localStorage.getItem('aiboard_company_config') || '{}');
          } catch {}
          const cfg = {
            ...existing,
            company_name: data.company_name || 'AI Board',
            company_legal_name: data.company_legal_name || '',
            company_logo_url: data.company_logo_url || '/logo.svg',
            allowed_domains: data.allowed_domains || '',
            google_client_id: data.google_client_id || existing.google_client_id || '',
            installed_tools: Array.isArray(data.installed_tools) ? data.installed_tools : (existing.installed_tools || null),
            installed_triggers: Array.isArray(data.installed_triggers) ? data.installed_triggers : (existing.installed_triggers || null)
          };
          localStorage.setItem('aiboard_company_config', JSON.stringify(cfg));
          window.dispatchEvent(new CustomEvent('company_settings_updated', { detail: cfg }));
        }
        if (data.reports_drive_folder !== undefined) setReportsDriveFolder(data.reports_drive_folder);
        if (data.backup_gdrive_path !== undefined) setBackupGdrivePath(data.backup_gdrive_path);
        if (data.backup_retention_days !== undefined) setBackupRetentionDays(String(data.backup_retention_days));
        if (data.backup_cron_time !== undefined) setBackupCronTime(data.backup_cron_time);
        if (data.cron_scheduler_enabled !== undefined) setCronSchedulerEnabled(!!data.cron_scheduler_enabled);
        if (data.task_timeout_seconds !== undefined) setTaskTimeoutSeconds(String(data.task_timeout_seconds));
        if (data.usd_brl_exchange_rate_manual !== undefined) {
          setUsdBrlExchangeRate(data.usd_brl_exchange_rate_manual ? String(data.usd_brl_exchange_rate_manual) : '');
        } else if (data.usd_brl_exchange_rate_is_auto) {
          setUsdBrlExchangeRate('');
        } else if (data.usd_brl_exchange_rate !== undefined) {
          setUsdBrlExchangeRate(String(data.usd_brl_exchange_rate));
        }
        if (data.usd_brl_live_rate) {
          setLiveRateInfo({
            rate: data.usd_brl_live_rate,
            provider: data.usd_brl_live_provider || 'API Pública',
            isAuto: !data.usd_brl_exchange_rate_manual
          });
        }
        if (data.telegram_default_chat_id !== undefined) setTelegramDefaultChatId(data.telegram_default_chat_id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshLiveRate = async () => {
    setRefreshingRate(true);
    try {
      const res = await fetch('/api/currency/usd-brl?force_refresh=true');
      if (res.ok) {
        const data = await res.json();
        setLiveRateInfo({
          rate: data.live_rate,
          provider: data.provider || 'API Pública',
          isAuto: !usdBrlExchangeRate
        });
        loadCostEstimate();
      }
    } catch (e) {
      console.error('Erro ao atualizar cotação:', e);
    } finally {
      setRefreshingRate(false);
    }
  };

  const loadScheduledTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await fetch('/api/scheduled-tasks');
      if (res.ok) {
        const data = await res.json();
        setScheduledTasks(data.tasks || []);
        setAvailableAgents(data.agents || []);
        if (data.cron_scheduler_enabled !== undefined) {
          setCronSchedulerEnabled(!!data.cron_scheduler_enabled);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar tarefas agendadas:', e);
    } finally {
      setTasksLoading(false);
    }
  };

  const loadBackupStatus = async () => {
    try {
      const res = await fetch('/api/backup/status');
      if (res.ok) {
        const data = await res.json();
        setBackupStatus(data);
        if (data.gdrive_path) setBackupGdrivePath(data.gdrive_path);
      }
    } catch (e) {
      console.error('Erro ao ler status do backup:', e);
    }
  };

  const loadCostEstimate = async (modelOverride) => {
    setCostLoading(true);
    try {
      const url = modelOverride
        ? `/api/costs/estimate?model_override=${encodeURIComponent(modelOverride)}`
        : '/api/costs/estimate';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setCostEstimate(data);
      }
    } catch (e) {
      console.error('Erro ao ler estimativa de custos:', e);
    } finally {
      setCostLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users', {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
      }
    } catch (e) {
      console.error('Erro ao carregar usuários:', e);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadMicroservices = async () => {
    setMicroservicesLoading(true);
    try {
      const res = await fetch('/api/microservices/status');
      if (res.ok) {
        const data = await res.json();
        setMicroservicesData(data);
      }
    } catch (e) {
      console.error('Erro ao verificar microserviços:', e);
    } finally {
      setMicroservicesLoading(false);
    }
  };

  const fetchApprovalData = async () => {
    try {
      const [resMode, resPending, resApprovers] = await Promise.all([
        fetch('/api/settings/approval-mode'),
        fetch('/api/actions/pending'),
        fetch('/api/telegram/approvers')
      ]);
      const dataMode = await resMode.json();
      if (typeof dataMode.require_action_approval === 'boolean') {
        setRequireApproval(dataMode.require_action_approval);
      }
      if (dataMode.chatwoot_human_guard) {
        setChatwootHumanGuard(prev => ({ ...prev, ...dataMode.chatwoot_human_guard }));
      }
      const dataPending = await resPending.json();
      if (Array.isArray(dataPending.actions)) {
        setPendingActions(dataPending.actions);
        setPendingActionsCount(dataPending.actions.length);
      }
      const dataApprovers = await resApprovers.json();
      if (dataApprovers.status === 'ok') {
        setApprovers(dataApprovers.approvers || []);
      }
    } catch (e) {
      console.error('Erro ao carregar dados de aprovação:', e);
    }
  };

  const handleToggleApprovalMode = async () => {
    const nextVal = !requireApproval;
    setRequireApproval(nextVal);
    try {
      await fetch('/api/settings/approval-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_action_approval: nextVal })
      });
      setToast(nextVal ? '🛡️ Modo de Validação ATIVADO: Ações exigirão aprovação prévia.' : '⚡ Modo 100% Autônomo ATIVADO: Agentes agirão sem aguardar aprovação.');
      setTimeout(() => setToast(''), 4000);
    } catch (e) {
      setToast('Erro ao alternar modo de validação.');
    }
  };

  const handleUpdateHumanGuard = async (patch) => {
    const nextCfg = { ...chatwootHumanGuard, ...patch };
    setChatwootHumanGuard(nextCfg);
    try {
      await fetch('/api/settings/approval-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatwoot_human_guard: nextCfg })
      });
      setToast('👨‍💼 Regra de Prioridade Humana no WhatsApp atualizada!');
      setTimeout(() => setToast(''), 3500);
    } catch (e) {
      setToast('Erro ao salvar regra de prioridade humana.');
    }
  };

  const handleApproveAction = async (actionId) => {
    setActionProcessing(prev => ({ ...prev, [actionId]: 'approving' }));
    try {
      const res = await fetch(`/api/actions/${actionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: user?.name || 'Admin' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setToast(`✅ Ação ${actionId} aprovada e executada com sucesso!`);
        fetchApprovalData();
      } else {
        setToast(`⚠️ ${data.message || 'Falha na execução'}`);
      }
    } catch (e) {
      setToast('Erro ao aprovar ação.');
    } finally {
      setActionProcessing(prev => ({ ...prev, [actionId]: null }));
      setTimeout(() => setToast(''), 4000);
    }
  };

  const handleRejectAction = async (actionId) => {
    setActionProcessing(prev => ({ ...prev, [actionId]: 'rejecting' }));
    try {
      const res = await fetch(`/api/actions/${actionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejected_by: user?.name || 'Admin' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setToast(`❌ Ação ${actionId} rejeitada.`);
        fetchApprovalData();
      } else {
        setToast(`⚠️ ${data.message || 'Falha ao rejeitar'}`);
      }
    } catch (e) {
      setToast('Erro ao rejeitar ação.');
    } finally {
      setActionProcessing(prev => ({ ...prev, [actionId]: null }));
      setTimeout(() => setToast(''), 4000);
    }
  };

  const fetchDepartments = async () => {
    try {
      setDeptLoading(true);
      const res = await fetch('/api/departments');
      const data = await res.json();
      if (data.status === 'ok' && Array.isArray(data.departments) && data.departments.length > 0) {
        setDepartments(data.departments);
      }
    } catch (e) {
      console.error('Erro ao carregar departamentos:', e);
    } finally {
      setDeptLoading(false);
    }
  };

  const handleSaveDepartments = async (newDepts) => {
    setDepartments(newDepts);
    try {
      await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: newDepts })
      });
      setToast('✅ Departamentos atualizados com sucesso!');
      setTimeout(() => setToast(''), 4000);
    } catch (e) {
      setToast('Erro ao salvar departamentos.');
    }
  };

  const handleDeleteDepartment = (idToDelete) => {
    if (!window.confirm('Tem certeza que deseja excluir este departamento?')) return;
    const updated = departments.filter(d => d.id !== idToDelete);
    handleSaveDepartments(updated);
  };

  useEffect(() => {
    let mounted = true;
    const initAll = async () => {
      setInitialLoading(true);
      await Promise.all([
        loadSettings(),
        loadScheduledTasks(),
        loadBackupStatus(),
        loadCostEstimate(),
        fetchApprovalData(),
        fetchDepartments(),
        isAdmin ? loadUsers() : Promise.resolve()
      ]);
      if (mounted) {
        setInitialLoading(false);
      }
      // Carrega health check ao vivo em paralelo
      loadMicroservices();
    };
    initAll();
    return () => {
      mounted = false;
    };
  }, [isAdmin, user]);

  useEffect(() => {
    if (selectedModel && !initialLoading) {
      loadCostEstimate(selectedModel);
    }
  }, [selectedModel]);

  const handleSaveBudgetOnly = async () => {
    setBudgetSaving(true);
    setBudgetToast('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          max_daily_budget_brl: parseFloat(maxDailyBudget) || 5.0,
          kill_switch_active: killSwitchActive
        })
      });
      if (res.ok) {
        setBudgetToast('✅ Limite salvo com sucesso!');
        await loadSettings();
        setTimeout(() => setBudgetToast(''), 4000);
      } else {
        setBudgetToast('❌ Falha ao salvar.');
      }
    } catch (e) {
      setBudgetToast('❌ Erro de conexão.');
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleSaveAllSettings = async (e, customToastSetter = setToast) => {
    if (e) e.preventDefault();
    if (!isAdmin) {
      alert('Apenas administradores podem modificar as configurações do sistema.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        gemini_model: selectedModel,
        max_daily_budget_brl: parseFloat(maxDailyBudget) || 5.0,
        kill_switch_active: killSwitchActive,
        partner_emails: partnerEmails.trim(),
        allowed_domains: allowedDomains.trim(),
        company_name: companyName.trim(),
        company_legal_name: companyLegalName.trim(),
        company_logo_url: companyLogoUrl.trim(),
        reports_drive_folder: reportsDriveFolder.trim(),
        backup_gdrive_path: backupGdrivePath.trim(),
        backup_retention_days: backupRetentionDays.trim(),
        backup_cron_time: backupCronTime.trim(),
        cron_scheduler_enabled: cronSchedulerEnabled,
        task_timeout_seconds: taskTimeoutSeconds.trim(),
        usd_brl_exchange_rate: usdBrlExchangeRate.trim(),
        telegram_default_chat_id: telegramDefaultChatId.trim()
      };
      if (newApiKey.trim()) {
        payload.gemini_api_key = newApiKey.trim();
      }
      if (telegramBotToken.trim()) {
        payload.telegram_bot_token = telegramBotToken.trim();
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updatedConfig = {
          company_name: companyName.trim(),
          company_legal_name: companyLegalName.trim(),
          company_logo_url: companyLogoUrl.trim(),
          allowed_domains: allowedDomains.trim()
        };
        localStorage.setItem('aiboard_company_config', JSON.stringify(updatedConfig));
        window.dispatchEvent(new CustomEvent('company_settings_updated', { detail: updatedConfig }));
        customToastSetter('✅ Configurações salvas e sincronizadas em todo o ecossistema AI Board!');
        setNewApiKey('');
        setTelegramBotToken('');
        await Promise.all([loadSettings(), loadBackupStatus(), loadCostEstimate(selectedModel)]);
        setTimeout(() => customToastSetter(''), 4000);
      } else {
        const errData = await res.json();
        customToastSetter(`❌ Erro: ${errData.detail || 'Falha ao salvar'}`);
      }
    } catch (err) {
      customToastSetter(`❌ Falha: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // --- Gestão Centralizada de Tarefas Agendadas (Estilo Google Calendar) ---
  const WEEKDAY_META = [
    { id: 0, short: 'Dom', full: 'Domingo', plural: 'Domingos' },
    { id: 1, short: 'Seg', full: 'Segunda-feira', plural: 'Segundas' },
    { id: 2, short: 'Ter', full: 'Terça-feira', plural: 'Terças' },
    { id: 3, short: 'Qua', full: 'Quarta-feira', plural: 'Quartas' },
    { id: 4, short: 'Qui', full: 'Quinta-feira', plural: 'Quintas' },
    { id: 5, short: 'Sex', full: 'Sexta-feira', plural: 'Sextas' },
    { id: 6, short: 'Sáb', full: 'Sábado', plural: 'Sábados' }
  ];

  const syncScheduleToCronAndLabel = (mode, timeStr, weekdays, monthDay, intervalHrs) => {
    const [hhRaw, mmRaw] = (timeStr || '09:00').split(':');
    const hh = Math.max(0, Math.min(23, parseInt(hhRaw || '9', 10) || 0));
    const mm = Math.max(0, Math.min(59, parseInt(mmRaw || '0', 10) || 0));
    const timeFormatted = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    if (mode === 'hourly') {
      const hrs = Math.max(1, parseInt(intervalHrs || 4, 10));
      setTaskFormCron(`0 */${hrs} * * *`);
      setTaskFormFrequency(hrs === 1 ? 'A cada 1 hora' : `A cada ${hrs} horas`);
      return;
    }

    if (mode === 'daily') {
      setTaskFormCron(`${mm} ${hh} * * *`);
      setTaskFormFrequency(`Todos os dias às ${timeFormatted}`);
      return;
    }

    if (mode === 'weekdays') {
      setTaskFormCron(`${mm} ${hh} * * 1-5`);
      setTaskFormFrequency(`Segunda a Sexta às ${timeFormatted}`);
      return;
    }

    if (mode === 'monthly') {
      const dom = Math.max(1, Math.min(31, parseInt(monthDay || 1, 10) || 1));
      setTaskFormCron(`${mm} ${hh} ${dom} * *`);
      setTaskFormFrequency(`Todo dia ${dom === 1 ? '1º' : dom} do mês às ${timeFormatted}`);
      return;
    }

    // mode === 'weekly'
    const sortedDays = [...(weekdays && weekdays.length ? weekdays : [1])].sort((a, b) => a - b);
    const cronDow = sortedDays.join(',');
    setTaskFormCron(`${mm} ${hh} * * ${cronDow}`);

    if (sortedDays.length === 1) {
      const d = WEEKDAY_META.find((w) => w.id === sortedDays[0]) || WEEKDAY_META[1];
      const prefix = d.id === 0 || d.id === 6 ? 'Todo' : 'Toda';
      setTaskFormFrequency(`${prefix} ${d.full} às ${timeFormatted}`);
    } else if (sortedDays.length === 2) {
      const d1 = WEEKDAY_META.find((w) => w.id === sortedDays[0])?.plural || '';
      const d2 = WEEKDAY_META.find((w) => w.id === sortedDays[1])?.plural || '';
      setTaskFormFrequency(`${d1} e ${d2} às ${timeFormatted}`);
    } else {
      const names = sortedDays.map((id) => WEEKDAY_META.find((w) => w.id === id)?.short || id).join(', ');
      setTaskFormFrequency(`Semanal (${names}) às ${timeFormatted}`);
    }
  };

  const hydrateVisualScheduleFromCron = (cronExpr) => {
    const parts = (cronExpr || '0 9 * * 6').trim().split(/\s+/);
    if (parts.length !== 5) {
      setSchedMode('daily');
      setSchedTime('09:00');
      return;
    }
    const [mStr, hStr, domStr, , dowStr] = parts;
    if (hStr.startsWith('*/')) {
      const hrs = parseInt(hStr.replace('*/', ''), 10) || 4;
      setSchedMode('hourly');
      setSchedIntervalHours(hrs);
      return;
    }
    const hh = String(Math.max(0, Math.min(23, parseInt(hStr, 10) || 8))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, parseInt(mStr, 10) || 0))).padStart(2, '0');
    setSchedTime(`${hh}:${mm}`);

    if (domStr !== '*' && domStr !== '?') {
      setSchedMode('monthly');
      setSchedMonthDay(parseInt(domStr, 10) || 1);
      return;
    }
    if (dowStr === '1-5') {
      setSchedMode('weekdays');
      setSchedWeekdays([1, 2, 3, 4, 5]);
      return;
    }
    if (dowStr !== '*' && dowStr !== '?') {
      const days = [];
      dowStr.split(',').forEach((seg) => {
        if (seg.includes('-')) {
          const [s, e] = seg.split('-').map((n) => parseInt(n, 10));
          for (let i = s; i <= e; i++) days.push(i % 7);
        } else {
          const n = parseInt(seg, 10);
          if (!isNaN(n)) days.push(n % 7);
        }
      });
      setSchedMode('weekly');
      setSchedWeekdays(days.length ? Array.from(new Set(days)) : [1]);
      return;
    }
    setSchedMode('daily');
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setTaskFormTitle('');
    setSchedMode('weekly');
    setSchedTime('09:00');
    setSchedWeekdays([6]);
    setSchedMonthDay(1);
    setSchedIntervalHours(4);
    setShowAdvancedCron(false);
    setTaskFormFrequency('Todo Sábado às 09:00');
    setTaskFormCron('0 9 * * 6');
    setTaskFormAgentId('auto');
    setTaskFormInstruction('');
    setTaskFormEnabled(true);
    setShowTaskModal(true);
  };

  const openEditTaskModal = (t) => {
    setEditingTask(t);
    setTaskFormTitle(t.title || '');
    const initCron = t.cron || '0 8 * * *';
    setTaskFormCron(initCron);
    setTaskFormFrequency(t.frequency || 'Diariamente às 08:00');
    hydrateVisualScheduleFromCron(initCron);
    setShowAdvancedCron(false);
    setTaskFormAgentId(t.agent_id || 'auto');
    setTaskFormInstruction(t.instruction || '');
    setTaskFormEnabled(t.enabled !== false);
    setShowTaskModal(true);
  };

  const handleSaveScheduledTask = async (e) => {
    e.preventDefault();
    if (!taskFormTitle.trim() || !taskFormInstruction.trim()) {
      alert('Preencha o título e a instrução da tarefa.');
      return;
    }

    setSavingTask(true);
    try {
      const res = await fetch('/api/scheduled-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          id: editingTask?.id || undefined,
          title: taskFormTitle.trim(),
          frequency: taskFormFrequency.trim(),
          cron: taskFormCron.trim(),
          instruction: taskFormInstruction.trim(),
          agent_id: taskFormAgentId,
          enabled: taskFormEnabled
        })
      });

      if (res.ok) {
        const data = await res.json();
        const delegatedMsg = data.auto_delegated
          ? ` (Auto-delegada para: ${data.agent_role})`
          : ` (Responsável: ${data.agent_role})`;
        setTasksToast(`✅ Tarefa "${taskFormTitle.trim()}" salva com sucesso${delegatedMsg}!`);
        setShowTaskModal(false);
        await Promise.all([loadScheduledTasks(), loadCostEstimate(selectedModel)]);
        setTimeout(() => setTasksToast(''), 5000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Erro ao salvar tarefa agendada.');
      }
    } catch (err) {
      alert('Erro de conexão ao salvar tarefa.');
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleScheduledTask = async (t) => {
    const isCurrentlyActive = t.active !== undefined ? t.active : (t.enabled !== false);
    const nextState = !isCurrentlyActive;
    // Atualização otimista imediata na UI
    setScheduledTasks((prev) =>
      prev.map((item) => (item.id === t.id ? { ...item, active: nextState, enabled: nextState } : item))
    );
    try {
      const res = await fetch('/api/scheduled-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          id: t.id,
          title: t.title,
          frequency: t.frequency,
          cron: t.cron,
          instruction: t.instruction,
          agent_id: t.agent_id,
          active: nextState,
          enabled: nextState
        })
      });
      if (res.ok) {
        await Promise.all([loadScheduledTasks(), loadCostEstimate(selectedModel)]);
      }
    } catch (e) {
      console.error('Erro ao alternar rotina agendada:', e);
      loadScheduledTasks();
    }
  };

  const handleDeleteScheduledTask = async (t) => {
    if (!window.confirm(`Deseja realmente excluir a rotina agendada "${t.title}" (${t.agent_role})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/scheduled-tasks/${encodeURIComponent(t.id)}`, {
        method: 'DELETE',
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) {
        setTasksToast(`🗑️ Tarefa "${t.title}" removida.`);
        await Promise.all([loadScheduledTasks(), loadCostEstimate(selectedModel)]);
        setTimeout(() => setTasksToast(''), 4000);
      }
    } catch (e) {
      alert('Erro ao excluir tarefa.');
    }
  };

  const handleRunScheduledTaskNow = async (t) => {
    setRunningScheduledTaskId(t.id);
    try {
      const res = await fetch(`/api/scheduled-tasks/${encodeURIComponent(t.id)}/run`, {
        method: 'POST',
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (res.ok) {
        const data = await res.json();
        setTasksToast(`🚀 Execução #${data.execution_task_id} iniciada pelo agente ${t.agent_role}!`);
        setLiveModalTaskId(data.execution_task_id);
        setTimeout(() => setTasksToast(''), 5000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Falha ao disparar tarefa.');
      }
    } catch (e) {
      alert('Erro de rede ao disparar tarefa.');
    } finally {
      setRunningScheduledTaskId(null);
    }
  };

  const handleRunBackup = async () => {
    if (!isAdmin) return;
    setBackupRunning(true);
    setBackupToast('');
    try {
      // Salva configurações de backup antes de rodar caso tenham sido editadas
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          backup_gdrive_path: backupGdrivePath.trim(),
          backup_retention_days: backupRetentionDays.trim(),
          backup_cron_time: backupCronTime.trim()
        })
      });

      const res = await fetch('/api/backup/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        }
      });
      const data = await res.json();
      if (res.ok) {
        setBackupToast('✅ Backup enviado e sincronizado no Google Drive com sucesso!');
        loadBackupStatus();
        setTimeout(() => setBackupToast(''), 4000);
      } else {
        alert('Erro no backup: ' + (data.detail || 'Falha ao sincronizar'));
      }
    } catch (err) {
      alert('Erro de conexão ao executar backup: ' + err.message);
    } finally {
      setBackupRunning(false);
    }
  };

  const handleRoleChange = async (targetEmail, newRole) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetEmail)}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        setUserToast(`✅ Permissão de '${targetEmail}' atualizada para ${newRole.toUpperCase()}!`);
        setTimeout(() => setUserToast(''), 3000);
        loadUsers();
      } else {
        const errData = await res.json();
        alert('Erro ao alterar permissão: ' + (errData.detail || 'Falha'));
      }
    } catch (err) {
      alert('Erro de rede: ' + err.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newUserEmail.trim()) {
      alert('Informe o e-mail corporativo.');
      return;
    }
    setUserActionLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          email: newUserEmail.trim(),
          name: newUserName.trim() || undefined,
          role: newUserRole
        })
      });
      if (res.ok) {
        setUserToast(`✅ Colaborador '${newUserEmail.trim()}' adicionado com sucesso!`);
        setShowAddUserModal(false);
        setNewUserEmail('');
        setNewUserName('');
        setNewUserRole('user');
        loadUsers();
        setTimeout(() => setUserToast(''), 3000);
      } else {
        const err = await res.json();
        alert('Erro ao adicionar colaborador: ' + (err.detail || 'Falha'));
      }
    } catch (err) {
      alert('Erro de rede: ' + err.message);
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!isAdmin) return;
    if (u.email.toLowerCase() === user.email.toLowerCase()) {
      alert('Você não pode excluir sua própria conta de administrador.');
      return;
    }
    if (!confirm(`Tem certeza que deseja revogar o acesso e remover o colaborador '${u.name || u.email}' (${u.email})?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(u.email)}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (res.ok) {
        setUserToast(`🗑️ Usuário '${u.email}' removido com sucesso.`);
        loadUsers();
        setTimeout(() => setUserToast(''), 3000);
      } else {
        const err = await res.json();
        alert('Erro ao remover usuário: ' + (err.detail || 'Falha'));
      }
    } catch (err) {
      alert('Erro de rede: ' + err.message);
    }
  };

  const filteredScheduledTasks = scheduledTasks.filter((t) => {
    if (!taskDeptFilter) return true;
    return (t.department || '') === taskDeptFilter;
  });

  if (initialLoading) {
    return (
      <div className="max-w-6xl mx-auto h-full p-4 md:p-6 flex flex-col items-center justify-center">
        <div className="bg-white border border-[#E2E8E4] rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm animate-in fade-in">
          <CompanyLogo
            className="h-9 max-w-[200px] mx-auto object-contain opacity-95 animate-pulse"
          />
          <div className="flex items-center justify-center gap-2 text-[#16422B] font-extrabold text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-[#16422B] shrink-0" />
            <span>{t('status.loadingTitle')} ({getOfficialBrandName()})</span>
          </div>
          <p className="text-xs text-[#5A6B61]">
            {t('status.loadingSubtitle')}
          </p>
          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#16422B] h-full w-2/3 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto h-full p-2 sm:p-3 md:p-4 pb-2 md:pb-4 flex flex-col md:flex-row gap-2.5 md:gap-5 overflow-hidden">
      {/* MENU LATERAL ESQUERDO (STICKY NAVIGATION) */}
      <aside className="w-full md:w-64 shrink-0 flex flex-col gap-2 md:gap-3">
        <div className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-2.5 sm:p-3.5 shadow-xs">
          <div className="px-1.5 sm:px-2 pb-2 mb-2 border-b border-[#E2E8E4]">
            <div className="text-xs font-extrabold text-[#16422B] tracking-tight truncate">{t('status.controlPanel')}</div>
            <div className="text-[10px] text-[#5A6B61] truncate">{t('status.quickNav')}</div>
          </div>

          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`flex items-center gap-2 px-2.5 py-2 md:gap-2.5 md:px-3 md:py-2.5 rounded-xl md:rounded-2xl text-xs font-bold transition whitespace-nowrap cursor-pointer text-left min-w-0 ${
                    isActive
                      ? 'bg-[#16422B] text-white shadow-xs'
                      : 'text-[#3A4A40] hover:bg-[#EFF5F1] hover:text-[#16422B]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-300' : 'text-[#16422B]'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Card Resumo Rápido no Menu Lateral (Desktop) */}
        <div className="hidden md:flex flex-col gap-2 bg-[#16422B] text-white rounded-3xl p-4 shadow-xs text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-200 truncate">
              {t('status.estMonthlyCost')}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          </div>
          <div className="text-xl font-black whitespace-nowrap">
            R$ {costEstimate?.combined_total?.cost_brl_month?.toFixed(2) || '0.00'}
            <span className="text-[11px] font-normal text-emerald-200"> {t('status.perMonth')}</span>
          </div>
          <div className="text-[10.5px] text-emerald-100/90 pt-1 border-t border-emerald-800 flex items-center justify-between gap-2">
            <span className="truncate">{t('status.activeRoutines')}</span>
            <span className="font-bold whitespace-nowrap">
              {scheduledTasks.filter((tk) => tk.enabled !== false).length} {t('status.tasksCount')}
            </span>
          </div>
          <div className="text-[10.5px] text-emerald-100/90 flex items-center justify-between gap-2">
            <span className="truncate">{t('status.microservices')}</span>
            <span className="font-bold text-emerald-300 whitespace-nowrap">
              {microservicesData?.online_count !== undefined
                ? `${microservicesData.online_count}/${microservicesData.total} ${t('common.online')}`
                : t('status.checking')}
            </span>
          </div>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL COM ROLAGEM SUAVE */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-4 md:space-y-6 pr-0.5 md:pr-1 scroll-smooth min-w-0 pb-6 md:pb-4"
      >
        {!isAdmin && (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-4 flex items-center gap-3 text-xs text-emerald-900 font-medium">
            <Shield className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>
              <strong>{t('status.userModeTitle')}</strong> {t('status.userModeDesc')}
            </span>
          </div>
        )}

        {/* =========================================================
            1. SEÇÃO: MODELO DE IA & CUSTOS OPERACIONAIS
        ========================================================= */}
        <section id="sec-ai" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8E4] mb-4 md:mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-2xl bg-[#EFF5F1] text-[#16422B] shrink-0">
                <Cpu className="w-5 h-5 text-[#16422B]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-[#16422B] truncate">
                  {t('status.aiEngineTitle')}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#5A6B61]">
                  {t('status.aiEngineDesc')}
                </p>
              </div>
            </div>

            <span className="text-[10.5px] sm:text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 sm:px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              {settings?.gemini_model || t('common.loading')}
            </span>
          </div>

          {isAdmin ? (
            <form onSubmit={(e) => handleSaveAllSettings(e, setToast)} className="space-y-4">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <label className="block text-xs font-bold text-[#1A202C]">
                    Motor Padrão do Sistema & Fallback de Contingência:
                  </label>
                  <span className="text-[10px] sm:text-[11px] text-[#5A6B61] bg-[#F4F7F5] px-2 py-0.5 rounded-lg border border-[#E2E8E4] inline-flex items-center gap-1">
                    <span>💡</span> Cada agente no <strong>Blocos & Conexões</strong> tem seu próprio modelo prioritário
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    settings?.available_models || [
                      {
                        id: 'gemini-3.1-flash-lite',
                        name: 'Gemini 3.1 Flash-Lite',
                        badge: 'Mais Barato ($0.25/M)',
                        cost: '$0.25 / 1M in | $1.50 / 1M out',
                        desc: 'Ultra econômico (67% mais barato). Ideal para triagem de SAC, busca no Drive e estoque.'
                      },
                      {
                        id: 'gemini-3.5-flash-lite',
                        name: 'Gemini 3.5 Flash-Lite',
                        badge: 'Econômico Rápido ($0.30/M)',
                        cost: '$0.30 / 1M in | $2.50 / 1M out',
                        desc: '60% mais barato que Flash padrão. Excelente para contas a pagar e DP.'
                      },
                      {
                        id: 'gemini-3.8-flash-medium',
                        name: 'Gemini 3.8 Flash Medium',
                        badge: 'Padrão Oficial ($0.75/M)',
                        cost: '$0.75 / 1M in | $3.75 / 1M out',
                        desc: 'Equilíbrio ideal entre velocidade, alta inteligência e custo. Padrão C-Level AI Board.'
                      },
                      {
                        id: 'gemini-3.5-flash',
                        name: 'Gemini 3.5 Flash',
                        badge: 'Versátil ($0.75/M)',
                        cost: '$0.75 / 1M in | $3.75 / 1M out',
                        desc: 'Alta cadência e precisão operacional para relatórios de DRE e análises financeiras.'
                      },
                      {
                        id: 'gemini-flash-latest',
                        name: 'Gemini Flash Latest',
                        badge: 'Sempre Atualizado',
                        cost: '$0.75 / 1M in | $3.75 / 1M out',
                        desc: 'Aponta dinamicamente para a versão mais recente e estável do Gemini Flash.'
                      },
                      {
                        id: 'gemini-3.1-pro-preview',
                        name: 'Gemini 3.1 Pro',
                        badge: 'Raciocínio Complexo ($2.00/M)',
                        cost: '$2.00 / 1M in | $10.00 / 1M out',
                        desc: 'Máxima capacidade analítica para auditorias contábeis pesadas e planejamento profundo.'
                      }
                    ]
                  ).map((m) => (
                    <label
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        selectedModel === m.id
                          ? 'border-[#16422B] bg-[#EFF5F1]/60 shadow-xs'
                          : 'border-[#E2E8E4] bg-white hover:border-[#16422B]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-xs text-[#1A202C]">{m.name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedModel === m.id
                              ? 'bg-[#16422B] text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5A6B61] leading-relaxed mb-1.5">{m.desc}</p>
                      {m.cost && (
                        <span className="text-[9.5px] font-mono font-semibold text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100 self-start">
                          {m.cost}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <div className="p-3 bg-[#F4F7F5] border border-[#E2E8E4] rounded-2xl flex items-start gap-2.5 text-xs text-[#5A6B61] mt-2.5">
                  <span className="text-sm leading-none">ℹ️</span>
                  <div>
                    <strong className="text-[#16422B] font-bold">Hierarquia de Execução:</strong> Cada agente da sua árvore (COO, CFO, Gestor de Estoque, etc.) executa com o modelo específico configurado no seu próprio bloco no Studio. A seleção acima atua como padrão de contingência (chat direto e rotinas não atribuídas) e alimenta o simulador dinâmico de custos abaixo.
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-bold text-[#1A202C] mb-1">
                  Chave de API Gemini (Google AI Studio / Vertex AI):
                </label>
                <input
                  type="password"
                  placeholder={
                    settings?.gemini_api_key_set
                      ? `Atual: ${settings.gemini_api_key_masked} (Digite para alterar)`
                      : 'Cole sua nova GEMINI_API_KEY aqui...'
                  }
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  className="w-full bg-[#F8FAF9] border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
                <p className="text-[10px] text-[#5A6B61] mt-1">
                  Deixe em branco para manter a chave atual já em execução no servidor.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                {toast ? (
                  <span className="text-xs font-bold text-emerald-700 animate-in fade-in">{toast}</span>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Salvando...' : 'Salvar Modelo & Chave'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 text-xs text-[#5A6B61]">
              <p>
                O ecossistema AI Board está operando com o modelo corporativo padrão:{' '}
                <strong>{settings?.gemini_model || 'Gemini 3.8 Flash Medium'}</strong>.
              </p>
            </div>
          )}

          
          {/* CARD DE SEGURANÇA ORÇAMENTÁRIA & TETO DIÁRIO */}
          <div className="mt-6 p-6 rounded-2xl border-2 border-[#E2E8E4] bg-white shadow-xs space-y-5">
            {/* Header com Ícone e Badge Unificado Sem Quebra de Linha */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${killSwitchActive ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#1A202C]">
                    Trava de Segurança Orçamentária & Teto Diário
                  </h4>
                  <p className="text-xs text-[#5A6B61] mt-0.5">
                    Controle rígido contra cobranças inesperadas com Circuit Breaker automático e notificações no Telegram.
                  </p>
                </div>
              </div>

              {/* Badge Principal com whitespace-nowrap */}
              <div className="shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                  killSwitchActive 
                    ? 'bg-red-100 text-red-800 border border-red-200' 
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${killSwitchActive ? 'bg-red-600 animate-pulse' : 'bg-emerald-600'}`}></span>
                  {killSwitchActive ? 'API Desligada (Protegido)' : 'API Conectada & Ativa'}
                </span>
              </div>
            </div>

            {/* Grid 2 Colunas Limpo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TETO DIÁRIO */}
              <div className="p-4 bg-[#F8FAF9] rounded-xl border border-[#E2E8E4] flex flex-col justify-between space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A202C]">
                    Teto Máximo Diário:
                  </label>
                  <p className="text-[11px] text-[#5A6B61] mt-0.5">
                    Limite orçamentário seguro em Reais para todas as tarefas das últimas 24h.
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5A6B61]">R$</span>
                    <input
                      type="number"
                      step="0.50"
                      min="1.00"
                      max="100.00"
                      value={maxDailyBudget}
                      onChange={(e) => setMaxDailyBudget(e.target.value)}
                      className="w-full bg-white border border-[#E2E8E4] rounded-lg pl-9 pr-3 py-2 text-sm font-bold font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B] shadow-2xs"
                      placeholder="5.00"
                    />
                  </div>
                  <span className="text-xs font-semibold text-[#5A6B61] whitespace-nowrap">/ dia</span>
                </div>

                <div className="pt-2 border-t border-[#E2E8E4]/60 flex items-center justify-between text-[11px] text-[#5A6B61]">
                  <span>Sugestão de Operação:</span>
                  <span className="font-semibold text-[#1A202C]">R$ 2,00 a R$ 5,00/dia</span>
                </div>
              </div>

              {/* STATUS DA API GEMINI COM TOGGLE CONVENCIONAL (DIREITA = ATIVADA, ESQUERDA = DESLIGADA) */}
              <div className="p-4 bg-[#F8FAF9] rounded-xl border border-[#E2E8E4] flex flex-col justify-between space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1A202C]">
                      API do Gemini (Chave Geral):
                    </label>
                    <p className="text-[11px] text-[#5A6B61] mt-0.5">
                      {!killSwitchActive
                        ? 'API autorizada. Operações liberadas sob vigilância do teto diário.'
                        : 'Kill Switch ativo. Todas as chamadas ao Gemini estão desligadas no servidor.'}
                    </p>
                  </div>

                  <div className="flex flex-col items-center shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!killSwitchActive}
                        disabled={!isAdmin}
                        onChange={async (e) => {
                          const isApiEnabled = e.target.checked;
                          const nextKillSwitch = !isApiEnabled;
                          setKillSwitchActive(nextKillSwitch);
                          if (isAdmin) {
                            setBudgetSaving(true);
                            try {
                              const res = await fetch('/api/settings', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'X-User-Email': user?.email || ''
                                },
                                body: JSON.stringify({ 
                                  kill_switch_active: nextKillSwitch,
                                  max_daily_budget_brl: parseFloat(maxDailyBudget) || 5.0
                                })
                              });
                              if (res.ok) {
                                setBudgetToast(
                                  isApiEnabled
                                    ? '🟢 API do Gemini ATIVADA com proteção de teto!'
                                    : '🛑 API do Gemini DESLIGADA pelo Kill Switch!'
                                );
                                await loadSettings();
                                setTimeout(() => setBudgetToast(''), 4000);
                              }
                            } catch (err) {
                              console.error(err);
                            } finally {
                              setBudgetSaving(false);
                            }
                          }
                        }}
                        className="sr-only peer"
                      />
                      {/* Toggle Convencional: À Esquerda = Vermelho/Desligado, À Direita = Verde/Ligado */}
                      <div className="w-11 h-6 bg-red-500 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8E4]/60 flex items-center justify-between text-[11px]">
                  <span className="text-[#5A6B61]">Status da API:</span>
                  <span className={`font-bold whitespace-nowrap ${!killSwitchActive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {!killSwitchActive ? '🟢 Ativada (Operacional)' : '🔴 Desligada (Kill Switch)'}
                  </span>
                </div>
              </div>
            </div>

            {/* BARRA DE CONSUMO 24H E CIRCUIT BREAKER */}
            <div className="p-4 bg-[#F4F7F5] rounded-xl border border-[#E2E8E4] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#1A202C]">Consumo Estimado (Últimas 24h):</span>
                  {settings?.runs_today ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-[#E2E8E4] text-[#5A6B61] whitespace-nowrap">
                      {settings.runs_today} execuções {settings.steps_today ? `· ${settings.steps_today} interações` : ''}
                    </span>
                  ) : null}
                </div>
                <div className="font-mono font-bold text-sm whitespace-nowrap">
                  <span className={settings?.daily_budget_exceeded ? 'text-red-600 font-extrabold' : 'text-[#1A202C]'}>
                    R$ {(settings?.cost_today_brl || 0).toFixed(2)}
                  </span>
                  <span className="text-[#5A6B61] font-normal text-xs ml-1">/ R$ {(parseFloat(maxDailyBudget) || 5).toFixed(2)}</span>
                </div>
              </div>

              {/* Barra de Progresso */}
              <div className="w-full bg-[#E2E8E4] rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    (settings?.cost_today_brl || 0) >= (parseFloat(maxDailyBudget) || 5)
                      ? 'bg-red-600'
                      : (settings?.cost_today_brl || 0) >= (parseFloat(maxDailyBudget) || 5) * 0.7
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                  }`}
                  style={{
                    width: `${Math.min(100, (((settings?.cost_today_brl || 0) / (parseFloat(maxDailyBudget) || 5)) * 100))}%`
                  }}
                />
              </div>

              {/* Alerta de Circuit Breaker Limpo e Destacado */}
              {(settings?.cost_today_brl || 0) >= (parseFloat(maxDailyBudget) || 5) ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{tr('Teto diário excedido. Circuit Breaker ativado no backend: novas tarefas serão bloqueadas preventivamente.')}</span>
                </div>
              ) : (
                <p className="text-[11px] text-[#5A6B61]">
                  {tr('Consumo dentro da margem segura diária. Monitoramento ativo a cada requisição.')}
                </p>
              )}
            </div>

            {/* FOOTER DO CARD */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-[#5A6B61]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span>{tr('Alertas em tempo real no Telegram')}: <strong>{settings?.telegram_default_chat_id || t('common.notConfigured')}</strong></span>
              </div>

              <div className="flex items-center gap-3">
                {budgetToast && (
                  <span className="text-xs font-bold text-emerald-700 animate-in fade-in whitespace-nowrap">{budgetToast}</span>
                )}
                <button
                  type="button"
                  onClick={handleSaveBudgetOnly}
                  disabled={budgetSaving}
                  className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  {budgetSaving ? t('common.saving') : tr('Salvar Teto & Status da API')}
                </button>
              </div>
            </div>
          </div>

          {/* ESTIMATIVA DINÂMICA DE CUSTOS OPERACIONAIS */}
          <div className="mt-6 pt-6 border-t border-[#E2E8E4] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800">
                  <Calculator className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#16422B] flex items-center gap-2">
                    <span>Estimativa Dinâmica de Custos Operacionais</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Tempo Real
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#5A6B61]">
                    Projeção precisa baseada nas <strong>tarefas agendadas recorrentes (CRON)</strong> e no histórico de chat
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadCostEstimate(selectedModel)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition self-start sm:self-auto cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${costLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => setCostTab('scheduled')}
                className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                  costTab === 'scheduled'
                    ? 'border-emerald-700 bg-emerald-50/50 shadow-xs'
                    : 'border-[#E2E8E4] bg-[#F8FAF9] hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-[#5A6B61] uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-700" />
                    Rotinas Agendadas (CRON)
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Fixo Mensal
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-[#16422B]">
                    R$ {costEstimate?.scheduled_tasks?.cost_brl_month?.toFixed(2) || '0.00'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#5A6B61]">
                    / mês (${costEstimate?.scheduled_tasks?.cost_usd_month?.toFixed(2) || '0.00'})
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-emerald-100/60 flex items-center justify-between text-[10px] text-[#5A6B61]">
                  <span>{costEstimate?.scheduled_tasks?.monthly_executions || 0} execuções/mês</span>
                  <span className="font-bold text-emerald-800">
                    R$ {costEstimate?.scheduled_tasks?.cost_brl_day?.toFixed(2) || '0.00'}/dia
                  </span>
                </div>
              </div>

              <div
                onClick={() => setCostTab('chat')}
                className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                  costTab === 'chat'
                    ? 'border-emerald-700 bg-emerald-50/50 shadow-xs'
                    : 'border-[#E2E8E4] bg-[#F8FAF9] hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-[#5A6B61] uppercase tracking-wider flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-teal-700" />
                    Interações de Chat
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                    Sob Demanda
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-[#16422B]">
                    R$ {costEstimate?.chat_interactions?.cost_brl_month?.toFixed(2) || '0.00'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#5A6B61]">
                    / mês (${costEstimate?.chat_interactions?.cost_usd_month?.toFixed(2) || '0.00'})
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-teal-100/60 flex items-center justify-between text-[10px] text-[#5A6B61]">
                  <span>{costEstimate?.chat_interactions?.total_interactions_last_30d || 0} consultas nos 30d</span>
                  <span className="font-bold text-teal-800">
                    ~R$ {costEstimate?.chat_interactions?.cost_per_interaction_brl?.toFixed(3) || '0.00'}/msg
                  </span>
                </div>
              </div>

              <div
                onClick={() => setCostTab('comparison')}
                className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between ${
                  costTab === 'comparison'
                    ? 'border-emerald-700 bg-emerald-50/50 shadow-xs'
                    : 'border-[#E2E8E4] bg-[#F8FAF9] hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold text-[#5A6B61] uppercase tracking-wider flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-600" />
                    Total Operacional
                  </span>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 border border-emerald-300">
                    -{costEstimate?.frugal_savings?.savings_percentage || 0}% Frugal
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-[#16422B]">
                    R$ {costEstimate?.combined_total?.cost_brl_month?.toFixed(2) || '0.00'}
                  </span>
                  <span className="text-[11px] font-semibold text-[#5A6B61]">
                    / mês (${costEstimate?.combined_total?.cost_usd_month?.toFixed(2) || '0.00'})
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-emerald-100/60 flex items-center justify-between text-[10px] text-[#5A6B61]">
                  <span>Fixo + Variável</span>
                  <span className="font-bold text-emerald-800">
                    R$ {costEstimate?.combined_total?.cost_brl_day?.toFixed(2) || '0.00'}/dia
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            2. SEÇÃO: CENTRAL DE ROTINAS & TAREFAS AGENDADAS (CRON + AUTO-DELEGAÇÃO)
        ========================================================= */}
        <section id="sec-tasks" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-4 scroll-mt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-emerald-50 text-[#16422B] shrink-0">
                <Calendar className="w-5 h-5 text-[#16422B]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-extrabold text-[#16422B] whitespace-nowrap">
                    Central de Rotinas & Tarefas Agendadas
                  </h2>
                  <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 whitespace-nowrap">
                    {scheduledTasks.length} tarefas no sistema
                  </span>
                </div>
                <p className="text-xs text-[#5A6B61] mt-0.5">
                  Visualize todas as rotinas da AI Board em um único lugar, veja o agente responsável ao lado e crie novas tarefas com <strong>Auto-Delegação Inteligente</strong>.
                </p>
              </div>
            </div>

            {/* Grupo de Ações Alinhado Horizontalmente (Sem Quebra Indesejada) */}
            <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
              <button
                type="button"
                onClick={loadScheduledTasks}
                className="h-9 px-3 bg-[#F8FAF9] hover:bg-[#EFF5F1] rounded-xl text-[#16422B] border border-[#E2E8E4] transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
                title="Recarregar tarefas"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${tasksLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={openNewTaskModal}
                  className="h-9 flex items-center gap-2 px-4 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Tarefa / Delegar</span>
                </button>
              )}
            </div>
          </div>

          {/* Barra de Controle do Motor CRON & Filtro de Departamento */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4]">
            <div className="flex items-center gap-2.5">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cronSchedulerEnabled}
                  disabled={!isAdmin}
                  onChange={async (e) => {
                    const nextVal = e.target.checked;
                    setCronSchedulerEnabled(nextVal);
                    if (isAdmin) {
                      await fetch('/api/settings', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'X-User-Email': user?.email || ''
                        },
                        body: JSON.stringify({ cron_scheduler_enabled: nextVal })
                      });
                      setTasksToast(
                        nextVal
                          ? '✅ Motor global de agendamentos CRON ativado!'
                          : '⏸️ Motor global de agendamentos CRON pausado.'
                      );
                      setTimeout(() => setTasksToast(''), 3500);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#16422B]"></div>
              </label>
              <div>
                <span className="text-xs font-extrabold text-[#16422B] block">
                  Motor de Execução Automática (CRON):{' '}
                  <span className={cronSchedulerEnabled ? 'text-emerald-700' : 'text-amber-700'}>
                    {cronSchedulerEnabled ? 'Ativo' : 'Pausado'}
                  </span>
                </span>
                <span className="text-[10.5px] text-[#5A6B61]">
                  Quando ativo, os especialistas executam suas rotinas nos horários programados e enviam alertas no Telegram/Histórico.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={taskDeptFilter}
                onChange={(e) => setTaskDeptFilter(e.target.value)}
                className="text-xs font-semibold bg-white border border-[#E2E8E4] rounded-xl px-2.5 py-1.5 text-[#16422B] focus:outline-none"
              >
                <option value="">Todas as Diretorias ({scheduledTasks.length})</option>
                <option value="Board">Diretoria / CEO</option>
                <option value="CFO">Financeiro (CFO)</option>
                <option value="COO">Operações & Estoque (COO)</option>
                <option value="CMO">Marketing & SAC (CMO)</option>
                <option value="CPO">RH & DP (CPO)</option>
                <option value="CLO">Jurídico & Contratos (CLO)</option>
              </select>
            </div>
          </div>

          {tasksToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-xl animate-in fade-in">
              {tasksToast}
            </div>
          )}

          {/* Lista Unificada de Tarefas Agendadas com o Agente Responsável ao Lado */}
          <div className="space-y-2.5">
            {filteredScheduledTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#5A6B61] bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4]">
                Nenhuma rotina agendada encontrada. Clique em <strong>"Nova Tarefa / Delegar"</strong> para adicionar.
              </div>
            ) : (
              filteredScheduledTasks.map((t) => {
                const isActive = t.active !== undefined ? t.active : (t.enabled !== false);
                const costMonth = t.cost_month_brl !== undefined ? t.cost_month_brl : 1.12;
                const monthlyExecs = t.monthly_runs !== undefined ? Math.round(t.monthly_runs) : 30;

                return (
                  <div
                    key={t.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'bg-white border-[#E2E8E4] hover:border-[#16422B]/40 hover:shadow-xs'
                        : 'bg-[#F9FBFA]/80 border-gray-200 opacity-75'
                    }`}
                  >
                    {/* Linha 1: Título + Agente (Esquerda) e Toolbar de Ações (Direita) */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-2.5 border-b border-[#F0F4F2]">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className={`text-sm font-extrabold truncate ${isActive ? 'text-[#1A202C]' : 'text-gray-500'}`}>
                            {t.title}
                          </h3>
                          {!isActive && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-gray-200 text-gray-700 whitespace-nowrap">
                              Pausada
                            </span>
                          )}
                        </div>

                        {/* Agente Responsável Padronizado e Fixo */}
                        <div className="flex items-center gap-1.5 text-xs text-[#16422B] font-semibold">
                          <Bot className="w-3.5 h-3.5 text-[#16422B] shrink-0" />
                          <span className="truncate">{t.agent_role}{t.department ? ` (${t.department})` : ''}</span>
                        </div>
                      </div>

                      {/* Toolbar de Ações: Toggle Ativar/Desativar + Executar Agora + Editar + Excluir */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* 1. Toggle Switch Nativo (Direita = Ativa/Verde, Esquerda = Pausada/Cinza) */}
                        {isAdmin && (
                          <div className="flex items-center gap-2 bg-[#F8FAF9] px-2.5 py-1 rounded-xl border border-[#E2E8E4]">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isActive}
                                onChange={() => handleToggleScheduledTask(t)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
                            </label>
                            <span className={`text-[10.5px] font-bold whitespace-nowrap ${isActive ? 'text-emerald-800' : 'text-gray-500'}`}>
                              {isActive ? 'Ativa' : 'Pausada'}
                            </span>
                          </div>
                        )}

                        {/* 2. Botão Executar Agora */}
                        <button
                          type="button"
                          onClick={() => handleRunScheduledTaskNow(t)}
                          disabled={runningScheduledTaskId === t.id}
                          className="h-8 px-3 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-[#16422B] text-[#16422B] hover:text-white border border-emerald-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          title="Executar esta rotina imediatamente"
                        >
                          {runningScheduledTaskId === t.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span className="hidden sm:inline">Executar Agora</span>
                        </button>

                        {/* 3. Ações de Gestão (Editar / Excluir) */}
                        {isAdmin && (
                          <div className="flex items-center gap-1 border-l border-[#E2E8E4] pl-1.5">
                            <button
                              type="button"
                              onClick={() => openEditTaskModal(t)}
                              className="p-1.5 rounded-lg text-gray-500 hover:text-[#16422B] hover:bg-[#EFF5F1] transition cursor-pointer"
                              title="Editar tarefa ou trocar agente responsável"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteScheduledTask(t)}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                              title="Excluir rotina agendada"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Linha 2: Instrução Operacional */}
                    <p className="text-xs text-[#5A6B61] leading-relaxed line-clamp-2">
                      {t.instruction}
                    </p>

                    {/* Linha 3: Barra de Rodapé Padronizada (Posição Estritamente Idêntica em Todos os Cards!) */}
                    <div className="pt-2.5 border-t border-[#F0F4F2] flex items-center justify-between gap-2">
                      {/* Horário / Frequência: SEMPRE no canto inferior esquerdo */}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                        <span>{t.frequency || t.cron}</span>
                      </span>

                      {/* Estimativa de Custo Mensal: SEMPRE no canto inferior direito */}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200 whitespace-nowrap shrink-0">
                        <Coins className="w-3.5 h-3.5 text-blue-700" />
                        <span>~R$ {costMonth.toFixed(2)}/mês</span>
                        <span className="text-[10px] font-normal text-blue-700">({monthlyExecs}x/mês)</span>
                      </span>
                    </div>
                  </div>
                );
              })            )}
          </div>
        </section>

        {/* =========================================================
            3. SEÇÃO: VALIDAÇÃO DE AÇÕES & AUTONOMIA (HUMAN-IN-THE-LOOP)
        ========================================================= */}
        <section id="sec-approval" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-5 scroll-mt-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-800 shrink-0 mt-0.5 sm:mt-0">
                <ShieldCheck className="w-5 h-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h2 className="text-base font-extrabold text-[#16422B] tracking-tight">
                    Aprovações & Autonomia dos Agentes
                  </h2>
                  <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-full shrink-0 shadow-2xs ${
                    requireApproval ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}>
                    {requireApproval ? '🛡️ Validação Obrigatória' : '⚡ 100% Autônomo'}
                  </span>
                </div>
                <p className="text-xs text-[#5A6B61] mt-0.5">
                  Controle se as respostas e ações operacionais necessitam de validação humana prévia via Telegram ou painel.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
              <button
                type="button"
                onClick={() => setShowApproversModal(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#16422B] text-white hover:bg-[#1E5738] transition shadow-xs cursor-pointer whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Gerenciar Aprovadores ({approvers.filter(a => a.is_active && a.can_approve).length})</span>
              </button>
            </div>
          </div>

          {/* Cards de Alternância de Modo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Validação Humana */}
            <div
              onClick={!requireApproval ? handleToggleApprovalMode : undefined}
              className={`p-4.5 rounded-2xl border-2 transition cursor-pointer relative ${
                requireApproval
                  ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                  : 'border-[#E2E8E4] bg-white hover:bg-slate-50 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                    requireApproval ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800">Modo Validação (Human-in-the-Loop)</h3>
                    <p className="text-[11px] text-slate-500">Exige confirmação via botão antes de disparar qualquer envio</p>
                  </div>
                </div>
                {requireApproval && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" /> Ativo
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                Toda resposta gerada (Chatwoot, WhatsApp, etc.) fica retida até que um dos aprovadores autorizados toque em <b>[✅ Aprovar]</b> no Telegram ou neste painel.
              </p>
            </div>

            {/* Card 2: 100% Autônomo */}
            <div
              onClick={requireApproval ? handleToggleApprovalMode : undefined}
              className={`p-4.5 rounded-2xl border-2 transition cursor-pointer relative ${
                !requireApproval
                  ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                  : 'border-[#E2E8E4] bg-white hover:bg-slate-50 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                    !requireApproval ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800">Modo 100% Autônomo</h3>
                    <p className="text-[11px] text-slate-500">Execução imediata sem pausa para aprovação</p>
                  </div>
                </div>
                {!requireApproval && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <Check className="w-3 h-3" /> Ativo
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                Os agentes respondem e executam ações automaticamente assim que a análise é concluída. Um resumo com o que foi feito é enviado ao Telegram da equipe.
              </p>
            </div>
          </div>

          {/* Prioridade de Atendimento Humano no WhatsApp / Chatwoot (Anti-Colisão) */}
          <div className="mt-4 p-4 rounded-2xl bg-[#F4F8F5] border border-[#CDE2D5] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-[#123524] flex items-center gap-1.5">
                  <span>👨‍💼 Prioridade de Atendimento Humano no WhatsApp (Anti-Colisão)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Proteção Ativa
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Evita que o agente e o atendente humano compitam ou respondam às mesmas mensagens no WhatsApp/Chatwoot.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="bg-white p-3 rounded-xl border border-[#DCE7E0] space-y-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  1. Quando um humano já respondeu ao cliente na conversa:
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdateHumanGuard({ human_takeover_mode: 'pause' })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-between ${
                      chatwootHumanGuard.human_takeover_mode === 'pause'
                        ? 'bg-[#123524] text-white border-[#123524]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>🛑 Parar de acompanhar a conversa (Pausa IA por 4h)</span>
                    {chatwootHumanGuard.human_takeover_mode === 'pause' && <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded">Padrão</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateHumanGuard({ human_takeover_mode: 'extended_wait' })}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-between ${
                      chatwootHumanGuard.human_takeover_mode === 'extended_wait'
                        ? 'bg-[#123524] text-white border-[#123524]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>⏳ Aumentar espera para 15 min sem resposta humana</span>
                    {chatwootHumanGuard.human_takeover_mode === 'extended_wait' && <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded">Ativo</span>}
                  </button>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-[#DCE7E0] space-y-2">
                <label className="block text-[11px] font-bold text-slate-700">
                  2. Espera inicial antes do agente sugerir resposta (Novas conversas):
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { sec: 60, label: '1 min' },
                    { sec: 120, label: '2 min' },
                    { sec: 180, label: '3 min' },
                    { sec: 300, label: '5 min' }
                  ].map((opt) => (
                    <button
                      key={opt.sec}
                      type="button"
                      onClick={() => handleUpdateHumanGuard({ initial_wait_seconds: opt.sec })}
                      className={`py-2 px-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        Number(chatwootHumanGuard.initial_wait_seconds) === opt.sec
                          ? 'bg-[#123524] text-white border-[#123524]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Se qualquer humano responder no WhatsApp durante a espera ou aprovação, a sugestão da IA é cancelada na hora.
                </p>
              </div>
            </div>
          </div>

          {/* Ações Pendentes de Aprovação */}
          <div className="mt-4 pt-4 border-t border-[#E2E8E4]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span>Ações Aguardando Validação Humana</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  pendingActions.length > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-500'
                }`}>
                  {`${pendingActions.length} pendente${pendingActions.length !== 1 ? 's' : ''}`}
                </span>
              </h3>
              <button
                type="button"
                onClick={fetchApprovalData}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Atualizar
              </button>
            </div>

            {pendingActions.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
                ✨ Nenhuma ação pendente no momento. Todas as sugestões dos agentes já foram decididas ou executadas.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingActions.map((act) => {
                  let payload = {};
                  try {
                    payload = typeof act.payload_json === 'string' ? JSON.parse(act.payload_json) : (act.payload_json || {});
                  } catch (e) {}
                  const proposedMsg = payload.message || payload.content || act.summary;
                  const isProcessing = actionProcessing[act.action_id];

                  return (
                    <div key={act.action_id} className="p-4 bg-amber-50/40 border border-amber-200 rounded-2xl space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                            {act.action_id}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {act.target}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatBrtDateTime(act.created_at)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                        <p className="font-semibold text-slate-500 text-[10px] uppercase mb-1">Mensagem Proposta:</p>
                        <p className="italic text-slate-800 font-sans">"{proposedMsg}"</p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!!isProcessing}
                          onClick={() => handleRejectAction(act.action_id)}
                          className="px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition cursor-pointer"
                        >
                          {isProcessing === 'rejecting' ? 'Rejeitando...' : 'Rejeitar Ação'}
                        </button>
                        <button
                          type="button"
                          disabled={!!isProcessing}
                          onClick={() => handleApproveAction(act.action_id)}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs cursor-pointer"
                        >
                          {isProcessing === 'approving' ? 'Executando...' : '✅ Aprovar e Executar Agora'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* =========================================================
            4. SEÇÃO: DEPARTAMENTOS & ORGANOGRAMA (DINÂMICO)
        ========================================================= */}
        <section id="sec-departments" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-5 scroll-mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-800">
                <Layers className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-[#16422B]">
                    Departamentos & Organograma
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                    {departments.length} cadastrados
                  </span>
                </div>
                <p className="text-xs text-[#5A6B61]">
                  Adicione, edite ou remova departamentos da empresa. Os departamentos cadastrados alimentam o organograma do Studio e a categorização dos agentes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDeptModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Gerenciar / Adicionar Departamento</span>
            </button>
          </div>

          {/* Grid de Departamentos Atuais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className="p-4 rounded-2xl border transition bg-white shadow-2xs flex flex-col justify-between"
                style={{ borderColor: `${dept.color || '#2563EB'}40` }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: dept.color || '#2563EB' }}
                    />
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 uppercase">
                      ID: {dept.id}
                    </span>
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800">{dept.name}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Sigla / Badge: <b>{dept.label || dept.id.toUpperCase()}</b>
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${dept.color || '#2563EB'}15`,
                      color: dept.color || '#2563EB'
                    }}
                  >
                    {dept.color}
                  </span>
                  {departments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDepartment(dept.id)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition cursor-pointer"
                      title="Excluir Departamento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section id="sec-params" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-5 scroll-mt-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-800">
                <Sliders className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#16422B]">
                  {tr('Parâmetros do Sistema, E-mails dos Sócios & Identidade')}
                </h2>
                <p className="text-xs text-[#5A6B61]">
                  {tr('Todas as configurações de envio de boletins, pastas do Google Drive, domínios e limites de execução editáveis pela interface')}
                </p>
              </div>
            </div>
          </div>

          <LanguageSelector variant="card" />

          <form onSubmit={(e) => handleSaveAllSettings(e, setParamsToast)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* E-mails dos Sócios */}
              <div className="md:col-span-2 p-4 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-extrabold text-[#16422B]">
                  <Mail className="w-4 h-4 text-[#16422B]" />
                  {tr('E-mails dos Sócios (Botão "Enviar Sócios" no Histórico e Logs):')}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={partnerEmails}
                  onChange={(e) => setPartnerEmails(e.target.value)}
                  placeholder="founders@example.com"
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
                <p className="text-[10.5px] text-[#5A6B61]">
                  {tr('Separe múltiplos endereços por vírgula. Estes são os destinatários padrão ao clicar em "Enviar Sócios (E-mail)".')}
                </p>
              </div>

              {/* Pasta no Google Drive para Relatórios/Docs */}
              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#1A202C]">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                  {tr('Pasta no Google Drive para Boletins (Google Docs):')}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={reportsDriveFolder}
                  onChange={(e) => setReportsDriveFolder(e.target.value)}
                  placeholder="Executive Reports - AI Board"
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-semibold text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
                <p className="text-[10px] text-[#5A6B61]">
                  {tr('Pasta onde os relatórios criados pelo botão "Abrir no Google Docs" ficam armazenados.')}
                </p>
              </div>

              {/* Domínios Corporativos Autorizados */}
              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-bold text-[#1A202C]">
                  <Globe className="w-3.5 h-3.5 text-emerald-700" />
                  {tr('Domínios Corporativos Autorizados (Login Google):')}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={allowedDomains}
                  onChange={(e) => setAllowedDomains(e.target.value)}
                  placeholder="example.com"
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
                <p className="text-[10px] text-[#5A6B61]">
                  {tr('Domínios permitidos para autenticação automática no painel.')}
                </p>
              </div>

              {/* Nome da Marca e Razão Social */}
              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="block text-xs font-bold text-[#1A202C]">
                  {tr('Nome Oficial da Marca (Brand Casing):')}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-semibold text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="block text-xs font-bold text-[#1A202C]">
                  {tr('URL do Logotipo Oficial (E-mails, Docs e Cabeçalhos):')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={companyLogoUrl}
                    onChange={(e) => setCompanyLogoUrl(e.target.value)}
                    className="flex-1 bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                  />
                  <div className="p-1.5 bg-white border border-[#E2E8E4] rounded-lg shrink-0">
                    <img src={companyLogoUrl || OFFICIAL_LOGO_URL} alt="Logo" className="h-5 object-contain" />
                  </div>
                </div>
              </div>

              {/* Timeout de Execução e Taxa de Câmbio */}
              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="block text-xs font-bold text-[#1A202C]">
                  {tr('Timeout Máximo por Tarefa (Segundos):')}
                </label>
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={taskTimeoutSeconds}
                  onChange={(e) => setTaskTimeoutSeconds(e.target.value)}
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
                <p className="text-[10px] text-[#5A6B61]">
                  {tr('Padrão: 300s (5 minutos). Interrompe automaticamente agentes travados.')}
                </p>
              </div>

              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#1A202C]">
                    {tr('Taxa de Câmbio USD → BRL (Cálculo de Custos IA):')}
                  </label>
                  {liveRateInfo.rate && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      {tr('Ao vivo')}: R$ {Number(liveRateInfo.rate).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isAdmin}
                    placeholder={liveRateInfo.rate ? `R$ ${Number(liveRateInfo.rate).toFixed(2)} (${tr('Cotação Comercial ao Vivo')})` : tr('Cotação Comercial Automática...')}
                    value={usdBrlExchangeRate}
                    onChange={(e) => setUsdBrlExchangeRate(e.target.value)}
                    className="flex-1 bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                  />
                  {usdBrlExchangeRate ? (
                    <button
                      type="button"
                      onClick={() => setUsdBrlExchangeRate('')}
                      className="px-2.5 py-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition shrink-0"
                      title={tr('Apagar valor manual e voltar à cotação comercial automática ao vivo')}
                    >
                      {tr('Usar Automático')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleRefreshLiveRate}
                    disabled={refreshingRate}
                    className="p-2 text-xs font-bold text-[#5A6B61] hover:text-[#16422B] bg-white border border-[#E2E8E4] hover:border-[#16422B] rounded-xl transition shrink-0 flex items-center gap-1"
                    title={tr('Atualizar cotação comercial agora')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingRate ? 'animate-spin text-[#16422B]' : ''}`} />
                    <span className="hidden sm:inline text-[10px]">{tr('Atualizar')}</span>
                  </button>
                </div>
                <p className="text-[10px] text-[#5A6B61]">
                  {usdBrlExchangeRate ? (
                    <span className="text-amber-700 font-medium">
                      ⚠️ {tr('Valor manual fixado em R$')} {usdBrlExchangeRate}.
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium">
                      ✓ {tr('Cotação comercial em tempo real ativa')} (R$ {Number(liveRateInfo.rate || 5.65).toFixed(2)}).
                    </span>
                  )}
                </p>
              </div>

              {/* Telegram Bot Settings */}
              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="block text-xs font-bold text-[#1A202C]">
                  Telegram Bot Token:
                </label>
                <input
                  type="password"
                  disabled={!isAdmin}
                  placeholder={
                    settings?.telegram_bot_token_set
                      ? `${tr('Atual')}: ${settings.telegram_bot_token_masked} (${tr('Digite para alterar')})`
                      : 'Telegram Bot Token...'
                  }
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div className="p-3.5 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4] space-y-1">
                <label className="block text-xs font-bold text-[#1A202C]">
                  {tr('Telegram Chat ID Padrão (Alertas Executivos):')}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder={tr('Opcional: ID do chat/grupo dos sócios')}
                  value={telegramDefaultChatId}
                  onChange={(e) => setTelegramDefaultChatId(e.target.value)}
                  className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-2 text-xs font-mono text-[#1A202C] focus:outline-none focus:border-[#16422B]"
                />
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2 flex items-center justify-between">
                {paramsToast ? (
                  <span className="text-xs font-bold text-emerald-700 animate-in fade-in">
                    {tr(paramsToast)}
                  </span>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving ? tr('Salvando...') : tr('Salvar Parâmetros do Sistema')}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* =========================================================
            4. SEÇÃO: GESTÃO DE ACESSOS & USUÁRIOS
        ========================================================= */}
        {isAdmin && (
          <section id="sec-users" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-4 scroll-mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-700">
                  <Users className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-[#16422B]">
                    Gestão de Acessos & Colaboradores 
                  </h2>
                  <p className="text-xs text-[#5A6B61]">
                    Modifique permissões, cadastre novos colaboradores ou remova acessos ao sistema.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Adicionar Colaborador</span>
                </button>

                <button
                  onClick={loadUsers}
                  className="p-2 bg-[#F8FAF9] hover:bg-[#EFF5F1] rounded-xl text-[#16422B] transition cursor-pointer"
                  title="Atualizar lista"
                >
                  <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {userToast && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
                {userToast}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8E4] text-[#5A6B61] text-[11px] uppercase tracking-wider font-extrabold">
                    <th className="py-2.5 px-3">Colaborador</th>
                    <th className="py-2.5 px-3">E-mail Corporativo</th>
                    <th className="py-2.5 px-3">Último Acesso</th>
                    <th className="py-2.5 px-3">Nível de Permissão</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8E4]">
                  {usersList.map((u) => {
                    const isSelf = u.email.toLowerCase() === user.email.toLowerCase();
                    return (
                      <tr key={u.email} className="hover:bg-[#F8FAF9] transition">
                        <td className="py-3 px-3 font-bold text-[#1A202C]">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#16422B] text-white font-extrabold text-[11px] flex items-center justify-center">
                              {u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase()}
                            </div>
                            <div>
                              <div>{u.name || 'Colaborador AI Board'}</div>
                              {isSelf && (
                                <span className="text-[10px] text-[#7E5BB5] font-extrabold">(Você)</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-[#5A6B61]">{u.email}</td>
                        <td className="py-3 px-3 text-[11px] text-gray-500">
                          {u.last_login
                            ? formatBrtDateTime(u.last_login)
                            : 'Recentemente'}
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) => handleRoleChange(u.email, e.target.value)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                              u.role === 'admin'
                                ? 'bg-amber-50 text-amber-900 border-amber-300 font-extrabold'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            } ${isSelf ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <option value="user">👤 Usuário</option>
                            <option value="admin">👑 Administrador</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={isSelf}
                            title={
                              isSelf
                                ? 'Você não pode remover sua própria conta'
                                : `Remover acesso de ${u.name || u.email}`
                            }
                            className={`p-1.5 rounded-xl transition ${
                              isSelf
                                ? 'opacity-20 cursor-not-allowed text-gray-400'
                                : 'text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* =========================================================
            5. SEÇÃO: BACKUP OFICIAL GOOGLE DRIVE (CONFIGURÁVEL VIA UI)
        ========================================================= */}
        <section id="sec-backup" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-4 scroll-mt-4">
          <div className="flex items-center justify-between pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700">
                <Cloud className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#16422B]">
                  Backup Oficial Google Drive (rclone)
                </h2>
                <p className="text-xs text-[#5A6B61]">
                  Configure a pasta de destino no Google Drive, a retenção de arquivos e dispare backups imediatos
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              rclone gdrive ativo
            </span>
          </div>

          {backupToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl animate-in fade-in">
              {backupToast}
            </div>
          )}

          {/* Campos editáveis da configuração de Backup */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 p-3.5 bg-[#F8FAF9] border border-[#E2E8E4] rounded-2xl space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#5A6B61] tracking-wider block">
                Pasta de Destino do Backup no Google Drive (rclone):
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={backupGdrivePath}
                onChange={(e) => setBackupGdrivePath(e.target.value)}
                placeholder="gdrive:IT/Internal Software/ServerBackup/crewai"
                className="w-full bg-white border border-[#E2E8E4] rounded-xl px-3 py-1.5 font-mono text-xs font-bold text-[#16422B] focus:outline-none focus:border-[#16422B]"
              />
            </div>

            <div className="p-3.5 bg-[#F8FAF9] border border-[#E2E8E4] rounded-2xl space-y-1">
              <label className="text-[10px] uppercase font-bold text-[#5A6B61] tracking-wider block">
                Retenção Local (Dias) & Horário:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  disabled={!isAdmin}
                  value={backupRetentionDays}
                  onChange={(e) => setBackupRetentionDays(e.target.value)}
                  className="w-20 bg-white border border-[#E2E8E4] rounded-xl px-2.5 py-1.5 font-mono text-xs font-bold text-[#16422B]"
                  title="Dias de retenção"
                />
                <span className="text-xs text-[#5A6B61]">dias</span>
                <input
                  type="time"
                  disabled={!isAdmin}
                  value={backupCronTime}
                  onChange={(e) => setBackupCronTime(e.target.value)}
                  className="flex-1 bg-white border border-[#E2E8E4] rounded-xl px-2.5 py-1.5 font-mono text-xs font-bold text-[#16422B]"
                  title="Horário diário do backup"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-[#F8FAF9] border border-[#E2E8E4] rounded-2xl flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-[#5A6B61] tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#5A6B61]" /> Último Backup Sincronizado:
              </span>
              <span className="text-xs font-bold text-[#16422B]">
                {backupStatus?.date_human || 'Ainda não executado'}
              </span>
            </div>

            <div className="p-3.5 bg-[#F8FAF9] border border-[#E2E8E4] rounded-2xl flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-[#5A6B61] tracking-wider">
                Tamanho do Banco Compactado:
              </span>
              <span className="text-xs font-bold text-[#16422B]">
                {backupStatus?.db_size || 'tasks.db.gz'}
              </span>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5A6B61]">
            <span className="flex items-center gap-1 font-semibold text-emerald-800">
              ⏰ <strong>Rotina Automática:</strong> Agendado diariamente às{' '}
              <strong>{backupCronTime || '03:45'} BRT</strong>
            </span>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleSaveAllSettings(e, setBackupToast)}
                  disabled={saving}
                  className="px-3.5 py-2 bg-white hover:bg-[#EFF5F1] text-[#16422B] border border-[#16422B]/30 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar Pasta</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunBackup}
                  disabled={backupRunning}
                  className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Cloud className={`w-4 h-4 ${backupRunning ? 'animate-bounce' : ''}`} />
                  {backupRunning ? 'Sincronizando com Google Drive...' : 'Fazer Backup Agora'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* =========================================================
            6. SEÇÃO: MICROSERVIÇOS & INTEGRAÇÕES (VERIFICAÇÃO EM TEMPO REAL)
        ========================================================= */}
        <section id="sec-services" className="bg-white border border-[#E2E8E4] rounded-2xl md:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-xs space-y-4 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8E4]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#EFF5F1] text-[#16422B]">
                <Server className="w-5 h-5 text-[#16422B]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-extrabold text-[#16422B]">
                    Microserviços & Conectores Corporativos (Verificação em Tempo Real)
                  </h2>
                  {microservicesData?.online_count !== undefined && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                      {`${microservicesData.online_count} Online • ${microservicesData.total} Monitorados`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5A6B61]">
                  Diagnóstico ativo de latência e conectividade de todas as APIs, bancos de dados e sistemas integrados à AI Board
                  {microservicesData?.checked_at_human && (
                    <span className="ml-1 font-semibold text-[#16422B]">
                      {`• Última verificação: ${microservicesData.checked_at_human}`}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={loadMicroservices}
              disabled={microservicesLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${microservicesLoading ? 'animate-spin' : ''}`} />
              <span>{microservicesLoading ? 'Testando Conexões...' : 'Verificar Agora'}</span>
            </button>
          </div>

          {microservicesLoading && !microservicesData ? (
            <div className="p-8 text-center space-y-2 bg-[#F8FAF9] rounded-2xl border border-[#E2E8E4]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#16422B] mx-auto" />
              <p className="text-xs font-bold text-[#16422B]">
                Executando ping e diagnóstico ao vivo nos 13 microserviços e APIs...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(microservicesData?.services || []).map((s) => {
                const stLower = (s.status || '').toLowerCase();
                const isOnline = stLower === 'online';
                const isWarn = stLower === 'warning' || stLower === 'atenção' || stLower === 'configuração pendente';
                return (
                  <div
                    key={s.id}
                    className="p-3.5 border border-[#E2E8E4] rounded-2xl flex flex-col justify-between bg-[#F8FAF9] hover:border-[#16422B]/30 transition gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-xs text-[#1A202C] flex items-center gap-1.5">
                          <span>{s.name}</span>
                        </div>
                        <div className="text-[11px] text-[#5A6B61] mt-0.5">{s.desc}</div>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
                          isOnline
                            ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                            : isWarn
                            ? 'text-amber-800 bg-amber-50 border-amber-200'
                            : 'text-red-800 bg-red-50 border-red-200'
                        }`}
                      >
                        {isOnline ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : isWarn ? (
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-600" />
                        )}
                        {s.status_label || (isOnline ? 'Online' : isWarn ? 'Atenção' : 'Offline')}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-gray-200/70 flex items-center justify-between text-[10px] font-mono text-gray-500 gap-2">
                      <span className="truncate" title={s.details || s.type}>
                        {s.details || s.type}
                      </span>
                      {s.latency_ms !== null && s.latency_ms !== undefined && (
                        <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-[#16422B] font-bold shrink-0">
                          {s.latency_ms} ms
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* =========================================================
          MODAL: NOVA / EDITAR TAREFA AGENDADA (ESTILO GOOGLE CALENDAR — 100% VERTICAL)
      ========================================================= */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E2E8E4] rounded-3xl p-5 sm:p-6 shadow-2xl w-full max-w-xl space-y-4 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-4 h-4 text-[#16422B] shrink-0" />
                <h3 className="font-extrabold text-sm text-[#16422B] truncate">
                  {editingTask ? 'Editar Rotina Agendada' : 'Nova Tarefa Agendada / Delegar para IA'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScheduledTask} className="flex flex-col space-y-4 text-xs w-full min-w-0">
              {/* 1. Título da Tarefa */}
              <div className="w-full min-w-0">
                <label className="block font-bold text-[#1A202C] mb-1">
                  Título da Tarefa / Rotina:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Conferência Semanal de Estoque para a Próxima Semana"
                  value={taskFormTitle}
                  onChange={(e) => setTaskFormTitle(e.target.value)}
                  className="w-full min-w-0 p-2.5 border border-[#E2E8E4] rounded-xl font-semibold focus:outline-none focus:border-[#16422B]"
                />
              </div>

              {/* 2. Especialista Responsável */}
              <div className="w-full min-w-0">
                <label className="block font-bold text-[#1A202C] mb-1">
                  Especialista Responsável (ou Auto-Delegação):
                </label>
                <select
                  value={taskFormAgentId}
                  onChange={(e) => setTaskFormAgentId(e.target.value)}
                  className="w-full min-w-0 max-w-full truncate p-2.5 border-2 border-[#16422B]/30 rounded-xl font-bold text-[#16422B] bg-[#EFF5F1]/50 focus:outline-none focus:border-[#16422B]"
                >
                  <option value="auto">
                    ✨ Auto-Delegar (IA analisa a instrução e escolhe o especialista ideal)
                  </option>
                  {availableAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      🤖 {ag.role} ({ag.department})
                    </option>
                  ))}
                </select>
                <p className="text-[10.5px] text-[#5A6B61] mt-1 leading-relaxed">
                  Ao escolher <strong>Auto-Delegar</strong>, o sistema analisa o tema da tarefa e vincula automaticamente ao agente responsável.
                </p>
              </div>

              {/* 3. Agendador Visual Estilo Google Calendar (100% Vertical) */}
              <div className="w-full min-w-0 bg-[#F8FAF9] border border-[#E2E8E4] rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#16422B]" />
                    Quando repetir esta rotina?
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    Horário de Brasília
                  </span>
                </div>

                {/* Tipo de recorrência */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: 'daily', label: 'Todos os dias' },
                    { id: 'weekdays', label: 'Seg a Sex (Úteis)' },
                    { id: 'weekly', label: 'Dias da semana' },
                    { id: 'monthly', label: 'Dia do mês' },
                    { id: 'hourly', label: 'A cada X horas' }
                  ].map((opt) => {
                    const active = schedMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSchedMode(opt.id);
                          syncScheduleToCronAndLabel(
                            opt.id,
                            schedTime,
                            schedWeekdays,
                            schedMonthDay,
                            schedIntervalHours
                          );
                        }}
                        className={`py-2 px-2.5 rounded-xl font-bold text-[11px] border transition cursor-pointer text-center ${
                          active
                            ? 'bg-[#16422B] text-white border-[#16422B] shadow-2xs'
                            : 'bg-white text-[#1A202C] border-[#E2E8E4] hover:border-[#16422B]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Se Semanal: Seletor de Dias da Semana igual ao Google Calendar */}
                {schedMode === 'weekly' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[11px] font-bold text-[#5A6B61]">
                      Repetir nos dias (clique para marcar 1 ou mais dias):
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEKDAY_META.map((day) => {
                        const isSelected = schedWeekdays.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => {
                              let nextDays = isSelected
                                ? schedWeekdays.filter((d) => d !== day.id)
                                : [...schedWeekdays, day.id];
                              if (nextDays.length === 0) nextDays = [day.id];
                              setSchedWeekdays(nextDays);
                              syncScheduleToCronAndLabel(
                                'weekly',
                                schedTime,
                                nextDays,
                                schedMonthDay,
                                schedIntervalHours
                              );
                            }}
                            className={`py-2 rounded-xl font-extrabold text-[11px] border transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#16422B] text-white border-[#16422B] shadow-2xs'
                                : 'bg-white text-[#5A6B61] border-[#E2E8E4] hover:border-[#16422B]'
                            }`}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Se Mensal: Seletor de Dia do Mês */}
                {schedMode === 'monthly' && (
                  <div className="space-y-1 pt-1">
                    <label className="block text-[11px] font-bold text-[#5A6B61]">
                      Dia do mês para execução:
                    </label>
                    <select
                      value={schedMonthDay}
                      onChange={(e) => {
                        const d = parseInt(e.target.value, 10) || 1;
                        setSchedMonthDay(d);
                        syncScheduleToCronAndLabel(
                          'monthly',
                          schedTime,
                          schedWeekdays,
                          d,
                          schedIntervalHours
                        );
                      }}
                      className="w-full p-2 border border-[#E2E8E4] rounded-xl font-bold bg-white text-[#16422B]"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {`Todo dia ${d === 1 ? '1º' : d} do mês`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Se Intervalo de Horas */}
                {schedMode === 'hourly' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[11px] font-bold text-[#5A6B61]">
                      Executar a cada quantas horas?
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 4, 6, 12].map((hrs) => (
                        <button
                          key={hrs}
                          type="button"
                          onClick={() => {
                            setSchedIntervalHours(hrs);
                            syncScheduleToCronAndLabel(
                              'hourly',
                              schedTime,
                              schedWeekdays,
                              schedMonthDay,
                              hrs
                            );
                          }}
                          className={`py-2 rounded-xl font-extrabold text-[11px] border transition cursor-pointer ${
                            schedIntervalHours === hrs
                              ? 'bg-[#16422B] text-white border-[#16422B]'
                              : 'bg-white text-[#5A6B61] border-[#E2E8E4] hover:border-[#16422B]'
                          }`}
                        >
                          {hrs}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seletor de Horário (para modos com hora fixa) */}
                {schedMode !== 'hourly' && (
                  <div className="space-y-1 pt-1">
                    <label className="block text-[11px] font-bold text-[#5A6B61]">
                      Horário da execução:
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={schedTime}
                        onChange={(e) => {
                          const nextTime = e.target.value || '09:00';
                          setSchedTime(nextTime);
                          syncScheduleToCronAndLabel(
                            schedMode,
                            nextTime,
                            schedWeekdays,
                            schedMonthDay,
                            schedIntervalHours
                          );
                        }}
                        className="p-2 px-3 border border-[#E2E8E4] rounded-xl font-extrabold text-sm text-[#16422B] bg-white focus:outline-none focus:border-[#16422B]"
                      />
                      <div className="flex items-center gap-1 flex-wrap">
                        {['07:30', '08:00', '09:00', '10:00', '14:00', '18:00'].map((tPreset) => (
                          <button
                            key={tPreset}
                            type="button"
                            onClick={() => {
                              setSchedTime(tPreset);
                              syncScheduleToCronAndLabel(
                                schedMode,
                                tPreset,
                                schedWeekdays,
                                schedMonthDay,
                                schedIntervalHours
                              );
                            }}
                            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition cursor-pointer ${
                              schedTime === tPreset
                                ? 'bg-[#16422B]/15 text-[#16422B] border-[#16422B]'
                                : 'bg-white text-[#5A6B61] border-[#E2E8E4] hover:border-[#16422B]'
                            }`}
                          >
                            {tPreset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Resumo Automático Legível */}
                <div className="bg-[#EFF5F1] border border-[#16422B]/20 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-[#5A6B61] block">
                      Resumo do Agendamento:
                    </span>
                    <span className="font-extrabold text-[#16422B] text-xs block truncate">
                      🗓️ {taskFormFrequency}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedCron((prev) => !prev)}
                    className="text-[10px] font-semibold text-[#5A6B61] hover:text-[#16422B] underline shrink-0 cursor-pointer"
                  >
                    {showAdvancedCron ? 'Ocultar avançado' : 'Modo avançado'}
                  </button>
                </div>

                {/* Modo Avançado Opcional (oculto por padrão) */}
                {showAdvancedCron && (
                  <div className="pt-1 space-y-2 border-t border-[#E2E8E4]">
                    <div>
                      <label className="block text-[10.5px] font-bold text-[#5A6B61] mb-1">
                        Descrição personalizada (opcional):
                      </label>
                      <input
                        type="text"
                        value={taskFormFrequency}
                        onChange={(e) => setTaskFormFrequency(e.target.value)}
                        className="w-full min-w-0 p-2 border border-[#E2E8E4] rounded-xl font-semibold bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-[#5A6B61] mb-1">
                        Expressão CRON (gerada automaticamente):
                      </label>
                      <input
                        type="text"
                        value={taskFormCron}
                        onChange={(e) => setTaskFormCron(e.target.value)}
                        className="w-full min-w-0 p-2 border border-[#E2E8E4] rounded-xl font-mono text-[11px] bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Instrução Detalhada para o Agente */}
              <div className="w-full min-w-0">
                <label className="block font-bold text-[#1A202C] mb-1">
                  Instrução Detalhada para o Agente:
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ex: Verificar todo sábado se temos estoque suficiente nas lojas e no centro de distribuição para atender a demanda da próxima semana e apontar itens abaixo do mínimo."
                  value={taskFormInstruction}
                  onChange={(e) => setTaskFormInstruction(e.target.value)}
                  className="w-full min-w-0 p-3 border border-[#E2E8E4] rounded-xl font-medium leading-relaxed focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 font-bold text-[#5A6B61] hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingTask ? 'Salvando...' : 'Salvar Rotina Agendada'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Adicionar Colaborador */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E2E8E4] rounded-3xl p-6 shadow-2xl w-full max-w-md space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#16422B]" />
                <h3 className="font-extrabold text-sm text-[#16422B]">
                  Adicionar Colaborador 
                </h3>
              </div>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  E-mail Corporativo :
                </label>
                <input
                  type="email"
                  required
                  placeholder="colaborador@empresa.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  Nome Completo (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ex: Maria Oliveira"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  Nível de Permissão Inicial:
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                >
                  <option value="user">👤 Usuário (Acesso ao Chat Operacional)</option>
                  <option value="admin">👑 Administrador (Acesso Total & Studio)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#E2E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-xs font-bold text-[#5A6B61] hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={userActionLoading}
                  className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{userActionLoading ? 'Salvando...' : 'Cadastrar Colaborador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Aprovadores do Telegram */}
      <ApproversModal
        isOpen={showApproversModal}
        onClose={() => {
          setShowApproversModal(false);
          fetchApprovalData();
        }}
      />

      {/* Modal de Gestão de Departamentos */}
      <DepartmentManagerModal
        isOpen={showDeptModal}
        departments={departments}
        onClose={() => setShowDeptModal(false)}
        onSaveDepartments={(newDepts) => {
          handleSaveDepartments(newDepts);
          setShowDeptModal(false);
        }}
      />

      {/* Modal de Logs ao Vivo quando dispara uma tarefa agendada */}
      <TaskLiveModal
        taskId={liveModalTaskId}
        isOpen={!!liveModalTaskId}
        onClose={() => setLiveModalTaskId(null)}
        user={user}
      />
    </div>
  );
}
