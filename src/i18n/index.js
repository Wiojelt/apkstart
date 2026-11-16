'use strict';
/**
 * i18n: interface language (English / Tiếng Việt / 中文).
 *
 * The UI was originally written in Chinese, so the Chinese source text itself is the
 * translation key (gettext style): `t('安装完成')` returns the English / Vietnamese text
 * for the current language, or the Chinese text unchanged when the language is `zh`
 * or when a translation is missing.
 *
 * Placeholders use `{name}`: `t('{n} 分钟前', { n: 5 })`.
 *
 * Shared by the main process and (via preload) the renderer. Default language: English.
 */

const LANGUAGES = [
  { code: 'tr', name: 'Türkçe', tag: 'tr-TR' },
  { code: 'en', name: 'English', tag: 'en-US' },
];
const DEFAULT_LANG = 'tr';

const DICTS = {
  tr: require('./tr.json'),
  en: require('./en.json'),
};

let current = null;

function normalize(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('tr')) return 'tr';
  return DEFAULT_LANG;
}

function getLang() {
  if (current) return current;
  try {
    // Lazy require: store.js must stay free of i18n so there is no require cycle.
    current = normalize(require('../core/store').getSettings().language);
  } catch (_) {
    current = DEFAULT_LANG;
  }
  return current;
}

function setLang(lang) {
  current = normalize(lang);
  return current;
}

/** BCP-47 tag for Intl / toLocaleString. */
function localeTag(lang) {
  const l = normalize(lang || getLang());
  return (LANGUAGES.find((x) => x.code === l) || LANGUAGES[0]).tag;
}

/** Collapse whitespace so multi-line HTML text maps to a single dictionary key. */
function normKey(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function format(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

function lookup(src, lang) {
  const l = lang || getLang();
  if (l === 'zh') return null;
  const d = DICTS[l];
  if (d) {
    if (Object.prototype.hasOwnProperty.call(d, src)) return d[src];
    const k = normKey(src);
    if (k !== src && Object.prototype.hasOwnProperty.call(d, k)) return d[k];
  }
  if (l !== 'en' && DICTS.en) {
    if (Object.prototype.hasOwnProperty.call(DICTS.en, src)) return DICTS.en[src];
    const k = normKey(src);
    if (k !== src && Object.prototype.hasOwnProperty.call(DICTS.en, k)) return DICTS.en[k];
  }
  return null;
}

function t(src, vars) {
  if (src == null) return '';
  const s = String(src);
  const hit = lookup(s);
  return format(hit != null ? hit : s, vars);
}

/** Dictionary for the current language — handed to the renderer. */
function dict(lang) {
  const l = lang || getLang();
  if (l === 'zh') return {};
  return DICTS[l] || DICTS[DEFAULT_LANG] || {};
}

module.exports = { t, getLang, setLang, normalize, localeTag, normKey, format, dict, LANGUAGES, DEFAULT_LANG, DICTS };
