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
  { code: 'en', name: 'English', tag: 'en-US' },
  { code: 'vi', name: 'Tiếng Việt', tag: 'vi-VN' },
  { code: 'zh', name: '中文', tag: 'zh-CN' },
];
const DEFAULT_LANG = 'en';

const DICTS = {
  en: require('./en.json'),
  vi: require('./vi.json'),
};

let current = null;

function normalize(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('vi')) return 'vi';
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
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
  if (!d) return null;
  if (Object.prototype.hasOwnProperty.call(d, src)) return d[src];
  const k = normKey(src);
  if (k !== src && Object.prototype.hasOwnProperty.call(d, k)) return d[k];
  return null;
}

function t(src, vars) {
  if (src == null) return '';
  const s = String(src);
  const hit = lookup(s);
  return format(hit != null ? hit : s, vars);
}

/** Dictionary for the current language (empty for Chinese) — handed to the renderer. */
function dict(lang) {
  const l = lang || getLang();
  return l === 'zh' ? {} : (DICTS[l] || {});
}

module.exports = { t, getLang, setLang, normalize, localeTag, normKey, format, dict, LANGUAGES, DEFAULT_LANG, DICTS };
