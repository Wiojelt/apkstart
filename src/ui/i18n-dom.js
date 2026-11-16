'use strict';
/**
 * Renderer-side i18n helpers. Loaded before app.js / shell.js.
 *
 *  - window.t(src, vars): translate a Chinese source string (see src/i18n/index.js)
 *  - translateDom(root): translate static markup in place:
 *      · elements with [data-i18n-html]  → whole innerHTML is one key (mixed text + <b>/<code>…)
 *      · every other text node           → its trimmed text is the key
 *      · title / placeholder / alt / aria-label attributes
 */
(function () {
  const i18n = (window.apkstart && window.apkstart.i18n) || null;
  const lang = (i18n && i18n.lang) || 'en';
  const t = (src, vars) => (i18n ? i18n.t(src, vars) : String(src));
  const CJK = /[　-〿一-鿿＀-￯]/;
  const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];

  function translateText(node) {
    const raw = node.nodeValue;
    if (!raw || !CJK.test(raw)) return;
    const key = raw.replace(/\s+/g, ' ').trim();
    const out = t(key);
    if (out === key) return;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    node.nodeValue = (lead ? ' ' : '') + out + (trail ? ' ' : '');
  }

  function translateEl(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && CJK.test(v)) el.setAttribute(a, t(v));
    }
  }

  function translateDom(root) {
    if (!i18n || lang === 'zh') return;
    root = root || document.body;
    if (root.nodeType === 1) translateEl(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'STYLE')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const skip = [];
    let n = walker.currentNode;
    while ((n = walker.nextNode())) {
      if (skip.length && skip.some((s) => s.contains(n))) continue;
      if (n.nodeType === 3) { translateText(n); continue; }
      translateEl(n);
      if (n.hasAttribute('data-i18n-html')) {
        const key = n.innerHTML.replace(/\s+/g, ' ').trim();
        const out = t(key);
        if (out !== key) n.innerHTML = out;
        skip.push(n);
      }
    }
  }

  window.t = t;
  window.translateDom = translateDom;
  window.I18N_LANG = lang;
  window.I18N_TAG = (i18n && i18n.tag) || 'en-US';
  try {
    document.documentElement.lang = window.I18N_TAG;
    document.documentElement.dataset.lang = lang;
  } catch (_) { /* ignore */ }
})();
