// Centralized date & time formatting utility in America/Sao_Paulo (UTC-3)
// Ensures consistent operational timestamps across browser and server environments.

import { getCurrentLanguage } from '../i18n';

export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Converts timestamp (seconds or milliseconds) or ISO string into a safe Date object.
 */
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(val).trim();
  const num = Number(str);
  if (!isNaN(num) && num > 0) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats full date and time in America/Sao_Paulo timezone.
 */
export function formatBrtDateTime(val, options = {}) {
  const date = toDate(val);
  if (!date) return '';
  const lang = getCurrentLanguage();
  const locale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'pt-BR';
  const defaultOptions = {
    timeZone: BRAZIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  return date.toLocaleString(locale, { ...defaultOptions, ...options });
}

/**
 * Formats time only in America/Sao_Paulo timezone.
 */
export function formatBrtTime(val, options = {}) {
  const date = toDate(val);
  if (!date) return '';
  const lang = getCurrentLanguage();
  const locale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'pt-BR';
  const defaultOptions = {
    timeZone: BRAZIL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  return date.toLocaleTimeString(locale, { ...defaultOptions, ...options });
}

/**
 * Formats date only in America/Sao_Paulo timezone.
 */
export function formatBrtDate(val, options = {}) {
  const date = toDate(val);
  if (!date) return '';
  const lang = getCurrentLanguage();
  const locale = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'pt-BR';
  const defaultOptions = {
    timeZone: BRAZIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  return date.toLocaleDateString(locale, { ...defaultOptions, ...options });
}

/**
 * Formats diagnostic tested-at timestamp (e.g., "30/10/2026 at 17:30:18").
 */
export function formatBrtTestedAt(val) {
  const date = toDate(val);
  if (!date) return null;
  const lang = getCurrentLanguage();
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const connector = lang === 'en' ? 'at' : lang === 'es' ? 'a las' : 'às';
  return `${get('day')}/${get('month')}/${get('year')} ${connector} ${get('hour')}:${get('minute')}:${get('second')}`;
}
