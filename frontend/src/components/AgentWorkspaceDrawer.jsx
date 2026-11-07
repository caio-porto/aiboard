import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Code2,
  Database,
  FileSpreadsheet,
  FileText,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  X,
  Check,
  Save,
  Sparkles,
  Lock,
  Clock,
  HardDrive,
  Eye,
  AlertCircle,
  CheckCircle2,
  Copy,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

import { useLanguage } from '../i18n';

export function AgentWorkspaceDrawer({ agent, onClose, user }) {
  const { t, tr } = useLanguage();
  const [workspaceData, setWorkspaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentData, setFileContentData] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'script' | 'database' | 'cache'

  // Estado de execução de script
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Modal de criação de novo arquivo
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileDesc, setNewFileDesc] = useState('');

  const [savingFile, setSavingFile] = useState(false);
  const [saveToast, setSaveToast] = useState('');

  const isAdmin = user?.role === 'admin';
  const agentId = agent?.id;

  const loadWorkspace = async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceData(data);
      }
    } catch (err) {
      console.error('Erro ao carregar workspace do agente:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [agentId]);

  const handleOpenFile = async (file) => {
    setSelectedFile(file);
    setLoadingFile(true);
    setExecutionResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace/file?name=${encodeURIComponent(file.name)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContentData(data);
      }
    } catch (err) {
      console.error('Erro ao carregar arquivo:', err);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleRunScript = async (fileName) => {
    setExecuting(true);
    setExecutionResult(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ filename: fileName })
      });
      const data = await res.json();
      setExecutionResult(data);
      loadWorkspace(); // Recarrega para atualizar métricas e datas
    } catch (err) {
      setExecutionResult({
        status: 'error',
        stdout: '',
        stderr: tr('Falha na conexão com o servidor ao executar script') + ': ' + err.message,
        duration_ms: 0
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleSaveEditedFile = async () => {
    if (!selectedFile || !fileContentData || !isAdmin) return;
    setSavingFile(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace/file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          name: selectedFile.name,
          content: fileContentData.content || '',
          description: selectedFile.description || ''
        })
      });
      if (res.ok) {
        setSaveToast(t('agentWorkspace.fileSaved'));
        setTimeout(() => setSaveToast(''), 2500);
        loadWorkspace();
      }
    } catch (err) {
      alert(tr('Erro ao salvar arquivo') + ': ' + err.message);
    } finally {
      setSavingFile(false);
    }
  };

  const handleDeleteFile = async (fileName) => {
    if (!isAdmin) return;
    if (!confirm(`${tr('Tem certeza que deseja excluir o arquivo')} '${fileName}'?`)) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace/file?name=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        headers: {
          'X-User-Email': user?.email || ''
        }
      });
      if (res.ok) {
        if (selectedFile?.name === fileName) {
          setSelectedFile(null);
          setFileContentData(null);
        }
        loadWorkspace();
      }
    } catch (err) {
      alert(tr('Erro ao excluir') + ': ' + err.message);
    }
  };

  const handleCreateNewFile = async (e) => {
    e.preventDefault();
    if (!newFileName.trim() || !isAdmin) return;
    setSavingFile(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/workspace/file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({
          name: newFileName.trim(),
          content: newFileContent,
          description: newFileDesc.trim() || tr('Script criado manualmente')
        })
      });
      if (res.ok) {
        setIsCreatingFile(false);
        setNewFileName('');
        setNewFileContent('');
        setNewFileDesc('');
        loadWorkspace();
      }
    } catch (err) {
      alert(tr('Erro ao criar arquivo') + ': ' + err.message);
    } finally {
      setSavingFile(false);
    }
  };

  if (!agent) return null;

  const files = workspaceData?.files || [];
  const filteredFiles = files.filter((f) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'script') return f.type === 'script';
    if (activeFilter === 'database') return f.type === 'database';
    if (activeFilter === 'cache') return f.type === 'cache' || f.type === 'document';
    return true;
  });

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[640px] md:w-[720px] bg-white border-l border-[#E2E8E4] shadow-2xl z-[60] flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200 select-none">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex items-center justify-between bg-[#F8FAF9] gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
            <Terminal className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-sm text-[#16422B] truncate">
                {t('agentWorkspace.title')}
              </h3>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 shrink-0 whitespace-nowrap">
                {t('agentWorkspace.frugalAi')}
              </span>
            </div>
            <p className="text-[11px] text-[#5A6B61] font-semibold truncate">
              {agent.data?.name || agent.data?.role}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-gray-200 text-gray-500 transition cursor-pointer shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Corpo Central Rolável */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
        {/* Banner Informativo de Frugalidade e Economia de Tokens */}
        <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-extrabold text-xs text-emerald-950">
                {t('agentWorkspace.bannerTitle')}
              </p>
              <p className="text-[11px] text-emerald-900/90 leading-relaxed font-medium">
                {t('agentWorkspace.bannerDesc')}
              </p>
            </div>
          </div>

          {/* Cards de Métricas */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200/60">
            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
              <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                {t('agentWorkspace.tokensSaved')}
              </span>
              <span className="font-black text-sm text-emerald-700">
                ~{workspaceData?.tokens_saved_estimate?.toLocaleString('pt-BR') || 0}
              </span>
            </div>
            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
              <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                {t('agentWorkspace.toolsFiles')}
              </span>
              <span className="font-black text-sm text-[#16422B]">
                {workspaceData?.total_files || 0}
              </span>
            </div>
            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100 text-center">
              <span className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                {t('agentWorkspace.localSpace')}
              </span>
              <span className="font-black text-sm text-gray-700">
                {workspaceData?.total_size_formatted || '0 B'}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Ações */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex bg-gray-100 p-1 rounded-xl border border-[#E2E8E4] gap-1 overflow-x-auto">
            {[
              { id: 'all', label: t('agentWorkspace.filterAll') },
              { id: 'script', label: t('agentWorkspace.filterScripts') },
              { id: 'database', label: t('agentWorkspace.filterDb') },
              { id: 'cache', label: t('agentWorkspace.filterCache') }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                  activeFilter === f.id
                    ? 'bg-white text-[#16422B] shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              onClick={() => setIsCreatingFile(true)}
              className="px-3 py-1.5 bg-[#16422B] hover:bg-[#2B6143] text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{t('agentWorkspace.newScript')}</span>
            </button>
          )}
        </div>

        {/* Modal de Criação de Arquivo */}
        {isCreatingFile && (
          <form
            onSubmit={handleCreateNewFile}
            className="p-4 bg-gray-50 border border-[#E2E8E4] rounded-2xl space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-[#16422B]">{t('agentWorkspace.newScriptTitle')}</span>
              <button
                type="button"
                onClick={() => setIsCreatingFile(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">{t('agentWorkspace.fileNameLabel')}</label>
              <input
                type="text"
                required
                placeholder="ex: calc_commission.py"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">{t('agentWorkspace.fileDescLabel')}</label>
              <input
                type="text"
                placeholder={tr('Ex: Script para cálculo rápido de comissão sem usar IA')}
                value={newFileDesc}
                onChange={(e) => setNewFileDesc(e.target.value)}
                className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">{t('agentWorkspace.initialCodeLabel')}</label>
              <textarea
                rows={5}
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                placeholder={'print("Running deterministic calculation...")'}
                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white leading-relaxed"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingFile(false)}
                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-200 rounded-xl whitespace-nowrap"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingFile}
                className="px-3.5 py-1.5 bg-[#16422B] text-white font-bold text-xs rounded-xl hover:bg-[#2B6143] transition whitespace-nowrap"
              >
                {savingFile ? t('common.saving') : t('agentWorkspace.saveToWorkspace')}
              </button>
            </div>
          </form>
        )}

        {/* Lista de Arquivos */}
        {loading ? (
          <div className="text-center py-10 text-gray-400 font-semibold">
            {t('agentWorkspace.loadingFiles')}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-10 bg-gray-50 border border-dashed border-[#E2E8E4] rounded-2xl p-6 text-gray-400 space-y-2">
            <HardDrive className="w-8 h-8 mx-auto text-gray-300" />
            <p className="font-bold text-xs text-gray-600">{t('agentWorkspace.noFilesTitle')}</p>
            <p className="text-[11px] text-gray-400">
              {t('agentWorkspace.noFilesDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredFiles.map((file) => {
              const isPy = file.type === 'script';
              const isDb = file.type === 'database';
              const isSelected = selectedFile?.name === file.name;

              return (
                <div
                  key={file.name}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-[#16422B] bg-[#EFF5F1]/50 shadow-sm ring-1 ring-[#16422B]/20'
                      : 'border-[#E2E8E4] bg-white hover:border-gray-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                          isPy
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : isDb
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isPy ? (
                          <Code2 className="w-4 h-4 text-blue-700" />
                        ) : isDb ? (
                          <Database className="w-4 h-4 text-emerald-700" />
                        ) : (
                          <FileText className="w-4 h-4 text-amber-700" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-[#1A202C] font-mono truncate">
                            {file.name}
                          </span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                              isPy
                                ? 'bg-blue-100 text-blue-900'
                                : isDb
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {file.type}
                          </span>
                        </div>

                        <p className="text-[11px] text-[#5A6B61] line-clamp-2 mt-0.5 font-medium">
                          {file.description}
                        </p>

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400 font-semibold flex-wrap">
                          <span>{file.size_formatted}</span>
                          <span>•</span>
                          <span>{file.updated_at}</span>
                          {file.runs_count > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-bold">
                                {file.runs_count}x
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Botões de Ação do Card */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPy && (
                        <button
                          onClick={() => {
                            handleOpenFile(file);
                            handleRunScript(file.name);
                          }}
                          disabled={executing}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] flex items-center gap-1 transition shadow-2xs cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3 h-3 fill-current shrink-0" />
                          <span>{t('agentWorkspace.run')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenFile(file)}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#16422B] rounded-xl font-bold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3 h-3 text-[#16422B] shrink-0" />
                        <span>{isDb ? t('agentWorkspace.tables') : t('agentWorkspace.code')}</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteFile(file.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Visualizador & Editor de Arquivo / Terminal de Execução */}
        {selectedFile && (
          <div className="mt-4 pt-4 border-t border-[#E2E8E4] space-y-3 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-extrabold text-xs text-[#16422B] truncate">
                  {t('agentWorkspace.inspecting')} {selectedFile.name}
                </span>
                {saveToast && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 whitespace-nowrap">
                    {saveToast}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedFile.type === 'script' && (
                  <button
                    onClick={() => handleRunScript(selectedFile.name)}
                    disabled={executing}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                    <span>{executing ? t('agentWorkspace.executing') : t('agentWorkspace.testRun')}</span>
                  </button>
                )}

                {isAdmin && selectedFile.type !== 'database' && (
                  <button
                    onClick={handleSaveEditedFile}
                    disabled={savingFile}
                    className="px-2.5 py-1 bg-[#16422B] hover:bg-[#2B6143] text-white rounded-lg font-bold text-[11px] flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-2.5 h-2.5 shrink-0" />
                    <span>{t('common.save')}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setFileContentData(null);
                    setExecutionResult(null);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loadingFile ? (
              <div className="p-6 text-center text-gray-400 font-semibold">
                {t('common.loading')}
              </div>
            ) : selectedFile.type === 'database' ? (
              // Visão do Banco de Dados SQLite
              <div className="p-3 bg-gray-50 border border-[#E2E8E4] rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    {t('agentWorkspace.localSqliteDb')}
                  </span>
                  <span className="text-gray-500 font-semibold">
                    {fileContentData?.database_info?.total_tables || 0} {t('agentWorkspace.tablesFound')}
                  </span>
                </div>

                {fileContentData?.database_info?.tables?.map((table) => (
                  <div key={table.name} className="bg-white p-3 rounded-xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-[#16422B]">
                        {table.name}
                      </span>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {table.row_count} rows
                      </span>
                    </div>

                    {/* Colunas */}
                    <div className="flex flex-wrap gap-1">
                      {table.columns?.map((c) => (
                        <span
                          key={c.name}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200"
                        >
                          {c.name} ({c.type})
                        </span>
                      ))}
                    </div>

                    {/* Amostra das linhas */}
                    {table.sample?.length > 0 && (
                      <div className="overflow-x-auto mt-2 border border-gray-100 rounded-lg">
                        <table className="w-full text-[10px] text-left border-collapse">
                          <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                            <tr>
                              {table.columns?.map((c) => (
                                <th key={c.name} className="p-1.5 font-bold font-mono">
                                  {c.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-mono">
                            {table.sample.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50/50">
                                {table.columns?.map((c) => (
                                  <td key={c.name} className="p-1.5 truncate max-w-40 text-gray-700">
                                    {String(row[c.name] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              // Visão do Script ou Arquivo de Texto
              <div className="space-y-2">
                <textarea
                  rows={9}
                  readOnly={!isAdmin}
                  value={fileContentData?.content || ''}
                  onChange={(e) =>
                    setFileContentData({
                      ...fileContentData,
                      content: e.target.value
                    })
                  }
                  className="w-full text-xs font-mono p-3 bg-gray-900 text-emerald-400 rounded-2xl border border-gray-800 leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Terminal de Saída da Execução */}
            {executionResult && (
              <div className="p-3 bg-black text-gray-200 rounded-2xl border border-gray-800 space-y-1.5 font-mono text-[11px] animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between text-gray-400 border-b border-gray-800 pb-1.5 gap-2">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {t('agentWorkspace.localOutputConsole')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold whitespace-nowrap">
                      ⏱️ {executionResult.duration_ms}ms
                    </span>
                    <span className="text-amber-400 font-bold whitespace-nowrap">
                      ⚡ 0 API tokens
                    </span>
                  </div>
                </div>

                {executionResult.stdout && (
                  <pre className="whitespace-pre-wrap text-emerald-300 max-h-48 overflow-y-auto leading-relaxed py-1">
                    {executionResult.stdout}
                  </pre>
                )}

                {executionResult.stderr && (
                  <pre className="whitespace-pre-wrap text-red-400 max-h-36 overflow-y-auto leading-relaxed py-1">
                    {executionResult.stderr}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#E2E8E4] flex flex-wrap items-center justify-between gap-2 bg-[#F8FAF9]">
        <span className="text-[11px] text-[#5A6B61] font-semibold flex items-center gap-1">
          <HardDrive className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <span>{t('agentWorkspace.safeIsolation')} <code>/data/workspaces/{agentId}</code></span>
        </span>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white hover:bg-gray-100 text-[#16422B] border border-[#E2E8E4] rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
