import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../i18n';

/**
 * Reusable LanguageSelector component.
 * Supports:
 *  - variant="compact" (default): Globe + EN / PT-BR / ES dropdown or pill selector for Topbar & Login
 *  - variant="pills": Direct inline segmented button pills (EN | PT-BR | ES)
 *  - variant="card": Full configuration card for StatusView.jsx (Per-User Language & Regional Preferences)
 */
export function LanguageSelector({ variant = 'compact', className = '' }) {
  const { lang, setLang, t, languages } = useLanguage();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentLang = languages.find((l) => l.code === lang) || languages[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (variant === 'card') {
    return (
      <div className={`bg-white border border-[#E2E8E4] rounded-3xl p-5 shadow-xs space-y-4 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8E4]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#EFF5F1] border border-[#E2E8E4] flex items-center justify-center text-[#16422B] shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-[#16422B] truncate">
                {t('language.title')}
              </h3>
              <p className="text-xs text-[#5A6B61] leading-relaxed">
                {t('language.subtitle')}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold whitespace-nowrap shrink-0">
            <span>{currentLang.flag}</span>
            <span>{currentLang.label}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {languages.map((item) => {
            const isSelected = item.code === lang;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => setLang(item.code)}
                className={`p-3.5 rounded-2xl border text-left transition flex items-start justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#EFF5F1] border-[#16422B] ring-2 ring-[#16422B]/15 shadow-xs'
                    : 'bg-[#F9FAF9] hover:bg-white border-[#E2E8E4] hover:border-[#16422B]/40'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">{item.flag}</span>
                    <span className="text-xs font-extrabold text-[#16422B] truncate">
                      {item.label}
                    </span>
                    {item.code === 'en' && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#16422B] text-white whitespace-nowrap shrink-0">
                        {t('language.defaultBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#5A6B61] font-medium mt-1 truncate">
                    {item.description}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-[#16422B] text-white'
                      : 'border border-gray-300 bg-white text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-[#5A6B61] font-medium flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-[#16422B] shrink-0" />
          <span>{t('language.savedNote')}</span>
        </p>
      </div>
    );
  }

  if (variant === 'pills') {
    return (
      <div
        className={`inline-flex items-center gap-1 bg-[#EFF5F1] border border-[#E2E8E4] p-1 rounded-xl shrink-0 ${className}`}
        title={t('language.label')}
      >
        <Globe className="w-3.5 h-3.5 text-[#16422B] ml-1.5 mr-0.5 shrink-0" />
        {languages.map((item) => {
          const active = item.code === lang;
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => setLang(item.code)}
              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#16422B] text-white shadow-2xs'
                  : 'text-[#5A6B61] hover:text-[#16422B] hover:bg-white/70'
              }`}
            >
              {item.short}
            </button>
          );
        })}
      </div>
    );
  }

  // Default compact dropdown selector for Topbar & Login screen
  return (
    <div className={`relative inline-block text-left shrink-0 ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={t('language.label')}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#EFF5F1] hover:bg-[#E2EFE7] border border-[#E2E8E4] text-[#16422B] text-xs font-extrabold transition whitespace-nowrap cursor-pointer shadow-2xs"
      >
        <Globe className="w-3.5 h-3.5 text-[#16422B] shrink-0" />
        <span className="text-[11px] tracking-tight">{currentLang.short}</span>
        <ChevronDown className={`w-3 h-3 text-[#5A6B61] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E2E8E4] rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95">
          <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#5A6B61] border-b border-[#E2E8E4] mb-1">
            {t('language.label')}
          </div>
          {languages.map((item) => {
            const active = item.code === lang;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  setLang(item.code);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  active
                    ? 'bg-[#EFF5F1] text-[#16422B]'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-[#16422B]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm shrink-0">{item.flag}</span>
                  <span className="truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-[#5A6B61]">{item.short}</span>
                  {active && <Check className="w-3.5 h-3.5 text-[#16422B] stroke-[2.5]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
