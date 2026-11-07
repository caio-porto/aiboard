import React, { useState, useEffect } from 'react';
import { VisualStudio } from './components/VisualStudio';
import { ChatConsole } from './components/ChatConsole';
import { HistoryView } from './components/HistoryView';
import { StatusView } from './components/StatusView';
import { EvolutionCenterView } from './components/EvolutionCenterView';
import { CompanyLogo } from './components/CompanyLogo';
import { LanguageSelector } from './components/LanguageSelector';
import { LanguageProvider, useLanguage } from './i18n';
import {
  Layers,
  MessageSquare,
  History,
  Server,
  LogOut,
  Sparkles,
  ShieldAlert,
  Crown,
  UserCheck
} from 'lucide-react';

function AppContent({ user, setUser, companyConfig }) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'studio' | 'history' | 'evolution' | 'status'
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devName, setDevName] = useState('');

  const companyName = companyConfig?.company_name || 'AI Board';
  const googleClientId =
    companyConfig?.google_client_id || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    if (companyName) {
      document.title = `${companyName} • ${t('app.titleSuffix')}`;
    }
    try {
      const faviconLink = document.querySelector("link[rel*='icon']");
      if (faviconLink) {
        faviconLink.href = `/favicon.svg?v=aiboard-${Date.now()}`;
      }
    } catch {}
  }, [companyName, companyConfig?.company_logo_url, t]);

  // Check if there is a Google OAuth code in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setLoginLoading(true);
      fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          redirect_uri: window.location.origin
        })
      })
        .then(async (r) => {
          if (!r.ok) {
            const errData = await r.json().catch(() => null);
            throw new Error(errData?.detail || t('login.authFailed'));
          }
          return r.json();
        })
        .then((data) => {
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('aiboard_user', JSON.stringify(data.user));
            if (data.user.language) {
              localStorage.setItem('aiboard_lang', data.user.language);
              if (data.user.email) {
                localStorage.setItem(`aiboard_lang_${data.user.email}`, data.user.language);
              }
            }
          }
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          setLoginError(err.message);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .finally(() => setLoginLoading(false));
    }
  }, [setUser, t]);

  const handleGoogleLogin = () => {
    if (!googleClientId) {
      setLoginError(t('login.googleNotConfiguredDesc'));
      return;
    }
    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
      googleClientId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20email%20profile&access_type=online&prompt=select_account`;
    window.location.href = authUrl;
  };

  const handleDevLogin = (e) => {
    e.preventDefault();
    const email = (devEmail || 'admin@localhost').trim().toLowerCase();
    const name = (devName || email.split('@')[0] || 'Admin').trim();
    const savedLang =
      localStorage.getItem(`aiboard_lang_${email}`) ||
      localStorage.getItem('aiboard_lang') ||
      'en';
    const localUser = {
      email,
      name,
      role: 'admin',
      language: savedLang
    };
    setUser(localUser);
    localStorage.setItem('aiboard_user', JSON.stringify(localUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('aiboard_user');
  };

  // If unauthenticated, render the enterprise AI Board Login screen
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F9FAF9] to-[#EFF3F0] flex flex-col items-center justify-center p-4 relative">
        {/* Top-right Language Selector */}
        <div className="fixed top-4 right-4 z-50">
          <LanguageSelector />
        </div>

        <div className="w-full max-w-md bg-white border border-[#E2E8E4] rounded-3xl p-8 shadow-xl text-center space-y-6">
          <CompanyLogo className="h-12 max-w-[240px] mx-auto object-contain" />

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#16422B] text-white text-[11px] font-extrabold uppercase tracking-wider mb-2 whitespace-nowrap">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{t('app.intelligenceHub')}</span>
            </div>
            <p className="text-xs font-semibold text-[#5A6B61] leading-relaxed">
              {t('app.corporatePlatformDesc', { company: companyName })}
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-semibold flex items-center gap-2 text-left">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span className="min-w-0 break-words">{loginError}</span>
            </div>
          )}

          <div className="space-y-4 pt-2">
            {googleClientId ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loginLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white hover:bg-[#F4F7F5] border-2 border-[#E2E8E4] hover:border-[#16422B] text-[#16422B] font-bold text-sm py-3.5 px-4 rounded-2xl shadow-2xs transition disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="truncate">
                    {loginLoading
                      ? t('login.connecting')
                      : `${t('login.signInGoogle')}${
                          companyConfig?.allowed_domains ? ` (@${companyConfig.allowed_domains})` : ''
                        }`}
                  </span>
                </button>

                <p className="text-[11px] text-[#5A6B61] font-medium pt-1">
                  {t('login.restrictedAccess')}{' '}
                  <span className="font-semibold text-[#16422B]">
                    {companyConfig?.allowed_domains
                      ? `@${companyConfig.allowed_domains}`
                      : t('login.corporateAccount')}
                  </span>
                  .
                </p>
              </>
            ) : (
              <div className="space-y-4 text-left">
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>{t('login.googleNotConfiguredTitle')}</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {t('login.googleNotConfiguredDesc')}
                  </p>
                </div>

                <form onSubmit={handleDevLogin} className="space-y-2.5 pt-1">
                  <div className="text-[11px] font-extrabold text-[#16422B] uppercase tracking-wider">
                    {t('login.devLoginTitle')}
                  </div>
                  <input
                    type="text"
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                    placeholder={t('login.devNamePlaceholder')}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                  />
                  <input
                    type="email"
                    required
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={t('login.devEmailPlaceholder')}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                  />
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-2xl bg-[#16422B] hover:bg-[#1E5738] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                  >
                    {t('login.devLoginBtn')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';

  return (
    <div className="h-[100dvh] w-full bg-[#F8FAF9] flex flex-col overflow-hidden">
      {/* Enterprise Topbar */}
      <header className="h-14 md:h-16 bg-white border-b border-[#E2E8E4] px-3 md:px-6 lg:px-8 flex items-center justify-between gap-2 shrink-0 z-40">
        <div className="flex items-center gap-3 lg:gap-6 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <CompanyLogo className="h-7 md:h-9 max-w-[140px] lg:max-w-[170px] object-contain" />
            <span
              className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#16422B] text-white text-[10px] md:text-[11px] font-black flex items-center justify-center tracking-tight shadow-xs select-none shrink-0"
              title={`${companyName} AI - ${t('app.corporateAiHub')}`}
            >
              AI
            </span>
          </div>

          {/* Desktop Navigation Tabs with Overflow Protection */}
          <nav
            className="hidden md:flex items-center gap-1 bg-[#EFF5F1] p-1 rounded-2xl border border-[#E2E8E4] min-w-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-white text-[#16422B] shadow-xs'
                  : 'text-[#5A6B61] hover:text-[#16422B]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('nav.chat')}</span>
            </button>

            <button
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'studio'
                  ? 'bg-white text-[#16422B] shadow-xs'
                  : 'text-[#5A6B61] hover:text-[#16422B]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('nav.studio')}</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white text-[#16422B] shadow-xs'
                  : 'text-[#5A6B61] hover:text-[#16422B]'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('nav.history')}</span>
            </button>

            <button
              onClick={() => setActiveTab('evolution')}
              className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'evolution'
                  ? 'bg-white text-[#16422B] shadow-xs'
                  : 'text-[#5A6B61] hover:text-[#16422B]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('nav.evolution')}</span>
            </button>

            <button
              onClick={() => setActiveTab('status')}
              className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'status'
                  ? 'bg-white text-[#16422B] shadow-xs'
                  : 'text-[#5A6B61] hover:text-[#16422B]'
              }`}
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t('nav.status')}</span>
            </button>
          </nav>
        </div>

        {/* User Profile, Language Selector & Logout */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <LanguageSelector />

          <div className="text-right hidden sm:block min-w-0 max-w-[200px] lg:max-w-[240px]">
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              <span className="text-xs font-extrabold text-[#16422B] truncate">{user.name}</span>
              {isAdmin ? (
                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0">
                  <Crown className="w-3 h-3 text-amber-700 shrink-0" />
                  <span>{t('app.adminBadge')}</span>
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs whitespace-nowrap shrink-0">
                  <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>{t('app.userBadge')}</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#5A6B61] font-semibold truncate">{user.email}</div>
          </div>

          <button
            onClick={handleLogout}
            title={t('app.logoutTitle')}
            className="p-2 rounded-xl text-[#5A6B61] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Active Tab Content */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <div className={`h-full w-full ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
          <ChatConsole user={user} />
        </div>
        {activeTab === 'studio' && <VisualStudio user={user} />}
        {activeTab === 'history' && <HistoryView user={user} />}
        {activeTab === 'evolution' && <EvolutionCenterView user={user} />}
        {activeTab === 'status' && <StatusView user={user} />}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden h-16 bg-white/95 backdrop-blur-md border-t border-[#E2E8E4] px-2 flex items-center justify-around shrink-0 z-40 pb-[env(safe-area-inset-bottom,0px)] shadow-lg">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold min-w-0 px-1 whitespace-nowrap ${
            activeTab === 'chat' ? 'text-[#16422B]' : 'text-gray-400'
          }`}
        >
          <MessageSquare className="w-5 h-5 shrink-0" />
          <span className="truncate">{t('nav.chatShort')}</span>
        </button>

        <button
          onClick={() => setActiveTab('studio')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold min-w-0 px-1 whitespace-nowrap ${
            activeTab === 'studio' ? 'text-[#16422B]' : 'text-gray-400'
          }`}
        >
          <Layers className="w-5 h-5 shrink-0" />
          <span className="truncate">{t('nav.studioShort')}</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold min-w-0 px-1 whitespace-nowrap ${
            activeTab === 'history' ? 'text-[#16422B]' : 'text-gray-400'
          }`}
        >
          <History className="w-5 h-5 shrink-0" />
          <span className="truncate">{t('nav.historyShort')}</span>
        </button>

        <button
          onClick={() => setActiveTab('evolution')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold min-w-0 px-1 whitespace-nowrap ${
            activeTab === 'evolution' ? 'text-[#16422B]' : 'text-gray-400'
          }`}
        >
          <Sparkles className="w-5 h-5 shrink-0" />
          <span className="truncate">{t('nav.evolutionShort')}</span>
        </button>

        <button
          onClick={() => setActiveTab('status')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold min-w-0 px-1 whitespace-nowrap ${
            activeTab === 'status' ? 'text-[#16422B]' : 'text-gray-400'
          }`}
        >
          <Server className="w-5 h-5 shrink-0" />
          <span className="truncate">{t('nav.statusShort')}</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('aiboard_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [companyConfig, setCompanyConfig] = useState(() => {
    try {
      const cached = localStorage.getItem('aiboard_company_config');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  // Synchronize company configuration (Logo, Name, Domains, Google Client ID, Installed Tools/Triggers)
  useEffect(() => {
    const fetchCompanyConfig = () => {
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            const config = {
              company_name: data.company_name || 'AI Board',
              company_legal_name: data.company_legal_name || '',
              company_logo_url: data.company_logo_url || '/logo.svg',
              allowed_domains: data.allowed_domains || '',
              google_client_id: data.google_client_id || '',
              installed_tools: Array.isArray(data.installed_tools) ? data.installed_tools : [],
              installed_triggers: Array.isArray(data.installed_triggers) ? data.installed_triggers : []
            };
            setCompanyConfig(config);
            localStorage.setItem('aiboard_company_config', JSON.stringify(config));
          }
        })
        .catch(() => {});
    };

    fetchCompanyConfig();

    const handleConfigUpdate = (e) => {
      if (e?.detail) {
        setCompanyConfig((prev) => {
          const next = { ...(prev || {}), ...e.detail };
          try {
            localStorage.setItem('aiboard_company_config', JSON.stringify(next));
          } catch {}
          return next;
        });
      } else {
        fetchCompanyConfig();
      }
    };

    window.addEventListener('company_settings_updated', handleConfigUpdate);
    return () => window.removeEventListener('company_settings_updated', handleConfigUpdate);
  }, []);

  return (
    <LanguageProvider user={user}>
      <AppContent user={user} setUser={setUser} companyConfig={companyConfig} />
    </LanguageProvider>
  );
}
