import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  LANGUAGES,
  TRANSLATIONS,
  PHRASE_DICTIONARY,
  WORD_REPLACEMENTS_EN,
  WORD_REPLACEMENTS_ES
} from './translations';

const SUPPORTED_CODES = ['en', 'pt-BR', 'es'];

// Build a normalized-whitespace lookup map once for fast O(1) matching
const NORMALIZED_PHRASE_MAP = new Map();
for (const [k, v] of Object.entries(PHRASE_DICTIONARY)) {
  NORMALIZED_PHRASE_MAP.set(k, v);
  const norm = k.replace(/\s+/g, ' ').trim();
  if (!NORMALIZED_PHRASE_MAP.has(norm)) {
    NORMALIZED_PHRASE_MAP.set(norm, v);
  }
  // Also index without trailing colon
  if (norm.endsWith(':')) {
    const noColon = norm.slice(0, -1).trim();
    if (!NORMALIZED_PHRASE_MAP.has(noColon)) {
      NORMALIZED_PHRASE_MAP.set(noColon, [
        v[0].endsWith(':') ? v[0].slice(0, -1) : v[0],
        v[1].endsWith(':') ? v[1].slice(0, -1) : v[1]
      ]);
    }
  }
}

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

function translateSingleLine(line, lang) {
  if (!line) return line;
  const leadingMatch = line.match(/^\s*/);
  const trailingMatch = line.match(/\s*$/);
  const leading = leadingMatch ? leadingMatch[0] : '';
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const trimmed = line.trim();
  if (!trimmed) return line;

  const norm = trimmed.replace(/\s+/g, ' ');
  const exact = PHRASE_DICTIONARY[trimmed] || NORMALIZED_PHRASE_MAP.get(norm);
  if (exact) {
    const out = lang === 'es' ? exact[1] : exact[0];
    return leading + (out || trimmed) + trailing;
  }

  // Check if it has a trailing colon whose base phrase is in NORMALIZED_PHRASE_MAP
  if (norm.endsWith(':')) {
    const base = norm.slice(0, -1).trim();
    const baseMatch = NORMALIZED_PHRASE_MAP.get(base);
    if (baseMatch) {
      const out = lang === 'es' ? baseMatch[1] : baseMatch[0];
      return leading + (out.endsWith(':') ? out : `${out}:`) + trailing;
    }
  }

  // Apply pattern / phrase / word replacements
  const rules = lang === 'es' ? WORD_REPLACEMENTS_ES : WORD_REPLACEMENTS_EN;
  let result = norm;
  for (const [regex, replacement] of rules) {
    result = result.replace(regex, replacement);
  }
  return leading + result + trailing;
}

export function translateText(text, params = null, langOverride = null) {
  if (text === null || text === undefined) return '';
  if (typeof text !== 'string') return String(text);
  const lang = normalizeLang(langOverride || getCurrentLanguage());
  const trimmed = text.trim();
  if (!trimmed) return text;

  // 1. Check structured dot-key first
  if (/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(trimmed)) {
    const byKey = lookupTranslationKey(lang, trimmed);
    if (byKey !== null) {
      return interpolateParams(byKey, params);
    }
  }

  // 2. If language is pt-BR, keep original Portuguese text
  if (lang === 'pt-BR') {
    return interpolateParams(text, params);
  }

  // 3. Exact match on whole text
  const normWhole = trimmed.replace(/\s+/g, ' ');
  const exactWhole = PHRASE_DICTIONARY[text] || PHRASE_DICTIONARY[trimmed] || NORMALIZED_PHRASE_MAP.get(normWhole);
  if (exactWhole) {
    const leadingMatch = text.match(/^\s*/);
    const trailingMatch = text.match(/\s*$/);
    const leading = leadingMatch ? leadingMatch[0] : '';
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const translated = lang === 'es' ? exactWhole[1] : exactWhole[0];
    return interpolateParams(leading + (translated || trimmed) + trailing, params);
  }

  // 4. Multi-line or single-line translation
  if (text.includes('\n')) {
    const lines = text.split('\n').map((l) => translateSingleLine(l, lang));
    return interpolateParams(lines.join('\n'), params);
  }

  return interpolateParams(translateSingleLine(text, lang), params);
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

function translateDomSubtree(rootNode, lang) {
  if (!rootNode || typeof document === 'undefined') return;

  const processTextNode = (textNode) => {
    const parent = textNode.parentElement;
    if (!parent || SKIP_TAGS.has(parent.tagName)) return;
    if (parent.closest && parent.closest('[data-no-i18n="true"]')) return;

    const currentVal = textNode.nodeValue;
    if (!currentVal || !currentVal.trim()) return;

    if (currentVal !== textNode.__i18nRendered) {
      textNode.__i18nOrig = currentVal;
    }
    const orig = textNode.__i18nOrig ?? currentVal;
    const nextVal = lang === 'pt-BR' ? orig : translateText(orig, null, lang);
    textNode.__i18nRendered = nextVal;
    if (textNode.nodeValue !== nextVal) {
      textNode.nodeValue = nextVal;
    }
  };

  const processElementAttrs = (el) => {
    if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) return;
    for (const attr of TRANSLATABLE_ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const curAttr = el.getAttribute(attr);
      if (!curAttr || !curAttr.trim()) continue;
      const origKey = `__i18nOrig_${attr}`;
      const rendKey = `__i18nRend_${attr}`;
      if (curAttr !== el[rendKey]) {
        el[origKey] = curAttr;
      }
      const orig = el[origKey] ?? curAttr;
      const nextVal = lang === 'pt-BR' ? orig : translateText(orig, null, lang);
      el[rendKey] = nextVal;
      if (curAttr !== nextVal) {
        el.setAttribute(attr, nextVal);
      }
    }
  };

  if (rootNode.nodeType === 3) {
    processTextNode(rootNode);
    return;
  }

  if (rootNode.nodeType === 1) {
    processElementAttrs(rootNode);
  }

  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === 3) {
      processTextNode(node);
    } else if (node.nodeType === 1) {
      processElementAttrs(node);
    }
    node = walker.nextNode();
  }
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

  useEffect(() => {
    const resolved = resolveUserLanguage(user);
    setLangState(resolved);
    try {
      document.documentElement.lang = resolved;
    } catch {}
  }, [user?.email, user?.language]);

  // Automatic DOM TreeWalker + MutationObserver so all static & dynamic strings translate
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.getElementById('root') || document.body;
    translateDomSubtree(root, lang);

    let rafId = null;
    const pendingNodes = new Set();

    const flushMutations = () => {
      rafId = null;
      for (const n of pendingNodes) {
        translateDomSubtree(n, lang);
      }
      pendingNodes.clear();
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target) {
          if (m.target.nodeValue !== m.target.__i18nRendered) {
            pendingNodes.add(m.target);
          }
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1 || n.nodeType === 3) {
              pendingNodes.add(n);
            }
          });
        } else if (m.type === 'attributes' && m.target) {
          pendingNodes.add(m.target);
        }
      }
      if (pendingNodes.size > 0 && !rafId) {
        rafId = requestAnimationFrame(flushMutations);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS
    });

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [lang]);

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
