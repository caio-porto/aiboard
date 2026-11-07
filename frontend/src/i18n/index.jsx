import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  LANGUAGES,
  TRANSLATIONS,
  PHRASE_DICTIONARY,
  WORD_REPLACEMENTS_EN,
  WORD_REPLACEMENTS_ES
} from './translations';

const SUPPORTED_CODES = ['en', 'pt-BR', 'es'];

export function normalizeLang(raw) {
  if (!raw || typeof raw !== 'string') return 'en';
  const trimmed = raw.trim();
  if (SUPPORTED_CODES.includes(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('pt')) return 'pt-BR';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';
  return 'en';
}

export function getSavedUserFromStorage() {
  try {
    const raw = localStorage.getItem('aiboard_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function resolveUserLanguage(userObj) {
  const effectiveUser = userObj || getSavedUserFromStorage();
  if (effectiveUser?.language && SUPPORTED_CODES.includes(normalizeLang(effectiveUser.language))) {
    return normalizeLang(effectiveUser.language);
  }
  try {
    if (effectiveUser?.email) {
      const perUser = localStorage.getItem(`aiboard_lang_${effectiveUser.email}`);
      if (perUser) return normalizeLang(perUser);
    }
    const globalSaved = localStorage.getItem('aiboard_lang');
    if (globalSaved) return normalizeLang(globalSaved);
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export function getCurrentLanguage() {
  return resolveUserLanguage(null);
}

function interpolateParams(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined && params[key] !== null ? String(params[key]) : match;
  });
}

function lookupTranslationKey(lang, key) {
  if (!key || typeof key !== 'string') return null;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) {
      cur = cur[p];
    } else {
      cur = null;
      break;
    }
  }
  if (typeof cur === 'string') return cur;

  // Fallback to English if missing in target language
  if (lang !== 'en') {
    let enCur = TRANSLATIONS.en;
    for (const p of parts) {
      if (enCur && typeof enCur === 'object' && p in enCur) {
        enCur = enCur[p];
      } else {
        enCur = null;
        break;
      }
    }
    if (typeof enCur === 'string') return enCur;
  }
  return null;
}

export function translateText(text, params = null, langOverride = null) {
  if (text === null || text === undefined) return '';
  if (typeof text !== 'string') return String(text);
  const lang = normalizeLang(langOverride || getCurrentLanguage());
  const trimmed = text.trim();
  if (!trimmed) return text;

  // 1. Check structured key first if it looks like a dot-key
  if (/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(trimmed)) {
    const byKey = lookupTranslationKey(lang, trimmed);
    if (byKey !== null) {
      return interpolateParams(byKey, params);
    }
  }

  // 2. If language is pt-BR and text is already Portuguese phrase, just interpolate params
  if (lang === 'pt-BR') {
    return interpolateParams(text, params);
  }

  // 3. Exact match in PHRASE_DICTIONARY
  const exact = PHRASE_DICTIONARY[text] || PHRASE_DICTIONARY[trimmed];
  if (exact) {
    const translated = lang === 'es' ? exact[1] : exact[0];
    return interpolateParams(translated || text, params);
  }

  // 4. Pattern / word-level replacements for dynamic strings
  const rules = lang === 'es' ? WORD_REPLACEMENTS_ES : WORD_REPLACEMENTS_EN;
  let result = text;
  for (const [regex, replacement] of rules) {
    result = result.replace(regex, replacement);
  }
  return interpolateParams(result, params);
}

const LanguageContext = createContext({
  lang: 'en',
  setLang: () => {},
  t: (k, p) => translateText(k, p, 'en'),
  tr: (txt, p) => translateText(txt, p, 'en'),
  languages: LANGUAGES
});

export function LanguageProvider({ user, children }) {
  const [lang, setLangState] = useState(() => resolveUserLanguage(user));

  // Sync language when user logs in or changes
  useEffect(() => {
    const resolved = resolveUserLanguage(user);
    setLangState(resolved);
    try {
      document.documentElement.lang = resolved;
    } catch {}
  }, [user?.email, user?.language]);

  const setLang = useCallback(
    (newLang) => {
      const normalized = normalizeLang(newLang);
      setLangState(normalized);

      try {
        document.documentElement.lang = normalized;
        localStorage.setItem('aiboard_lang', normalized);

        const activeUser = user || getSavedUserFromStorage();
        const email = activeUser?.email;

        if (email) {
          localStorage.setItem(`aiboard_lang_${email}`, normalized);
        }

        const storedUser = getSavedUserFromStorage();
        if (storedUser) {
          storedUser.language = normalized;
          localStorage.setItem('aiboard_user', JSON.stringify(storedUser));
        }

        if (email) {
          fetch('/api/users/me/language', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Email': email
            },
            body: JSON.stringify({
              language: normalized,
              email
            })
          }).catch(() => {});
        }
      } catch {
        // ignore storage errors
      }
    },
    [user]
  );

  const t = useCallback(
    (keyOrText, params) => {
      if (!keyOrText || typeof keyOrText !== 'string') return '';
      const byKey = lookupTranslationKey(lang, keyOrText);
      if (byKey !== null) {
        return interpolateParams(byKey, params);
      }
      return translateText(keyOrText, params, lang);
    },
    [lang]
  );

  const tr = useCallback(
    (ptText, params) => {
      return translateText(ptText, params, lang);
    },
    [lang]
  );

  const contextValue = useMemo(
    () => ({
      lang,
      setLang,
      t,
      tr,
      languages: LANGUAGES
    }),
    [lang, setLang, t, tr]
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
