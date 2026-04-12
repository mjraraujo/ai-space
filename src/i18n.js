/**
 * i18n.js — Internationalization and localization engine.
 * Translation, plural rules, formatting (numbers, dates, currency),
 * locale detection, RTL support, lazy loading, message compilation.
 */

// ─── Plural rules ─────────────────────────────────────────────────────────────
export const pluralRules = {
  // English-like (1 = singular)
  en: n => n === 1 ? 'one' : 'other',
  // German, Dutch, etc.
  de: n => n === 1 ? 'one' : 'other',
  fr: n => n === 0 || n === 1 ? 'one' : 'other',
  // Arabic (complex)
  ar: n => {
    if (n === 0) return 'zero';
    if (n === 1) return 'one';
    if (n === 2) return 'two';
    if (n % 100 >= 3 && n % 100 <= 10) return 'few';
    if (n % 100 >= 11) return 'many';
    return 'other';
  },
  // Russian
  ru: n => {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'few';
    return 'other';
  },
  // Japanese (no plurals)
  ja: () => 'other',
  zh: () => 'other',
  ko: () => 'other',
  // Polish
  pl: n => {
    const mod10 = n % 10, mod100 = n % 100;
    if (n === 1) return 'one';
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'few';
    return 'other';
  },
};

// ─── Message compiler ─────────────────────────────────────────────────────────
function compileMessage(template) {
  // Support: {name}, {count, plural, =0{zero} one{#} other{# items}}, {gender, select, male{he} female{she} other{they}}
  const parts = [];
  const re = /\{([^{}]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: template.slice(last, m.index) });
    const inner = m[1].trim();
    if (inner.includes(',')) {
      const [varName, format, ...rest] = inner.split(',').map(s => s.trim());
      parts.push({ type: format === 'plural' ? 'plural' : 'select', varName, cases: parseCases(rest.join(',')) });
    } else {
      parts.push({ type: 'var', name: inner });
    }
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ type: 'text', value: template.slice(last) });

  return (params = {}, locale = 'en') => {
    return parts.map(part => {
      if (part.type === 'text') return part.value;
      if (part.type === 'var') return params[part.name] ?? `{${part.name}}`;
      if (part.type === 'plural' || part.type === 'select') {
        const val = params[part.varName];
        if (part.type === 'plural') {
          const n = Number(val);
          const exact = `=${n}`;
          if (part.cases[exact]) return part.cases[exact].replace(/#/g, String(n));
          const rule = (pluralRules[locale] ?? pluralRules.en)(n);
          const msg = part.cases[rule] ?? part.cases.other ?? '';
          return msg.replace(/#/g, String(n));
        }
        if (part.type === 'select') {
          return part.cases[val] ?? part.cases.other ?? '';
        }
      }
      return '';
    }).join('');
  };
}

function parseCases(str) {
  const cases = {};
  const re = /(\w+|=\d+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(str)) !== null) cases[m[1]] = m[2];
  return cases;
}

// ─── Formatter ────────────────────────────────────────────────────────────────
export class Formatter {
  constructor(locale = 'en') { this.locale = locale; }

  number(value, opts = {}) {
    try { return new Intl.NumberFormat(this.locale, opts).format(value); }
    catch { return String(value); }
  }

  currency(value, currency = 'USD', opts = {}) {
    try { return new Intl.NumberFormat(this.locale, { style: 'currency', currency, ...opts }).format(value); }
    catch { return `${currency} ${value}`; }
  }

  percent(value, opts = {}) {
    try { return new Intl.NumberFormat(this.locale, { style: 'percent', ...opts }).format(value); }
    catch { return `${(value * 100).toFixed(0)}%`; }
  }

  date(value, opts = {}) {
    try { return new Intl.DateTimeFormat(this.locale, opts).format(new Date(value)); }
    catch { return new Date(value).toLocaleDateString(); }
  }

  time(value, opts = {}) {
    try { return new Intl.DateTimeFormat(this.locale, { timeStyle: 'short', ...opts }).format(new Date(value)); }
    catch { return new Date(value).toLocaleTimeString(); }
  }

  datetime(value, opts = {}) {
    try { return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short', ...opts }).format(new Date(value)); }
    catch { return new Date(value).toLocaleString(); }
  }

  relativeTime(value, unit = 'second') {
    try { return new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' }).format(value, unit); }
    catch { return `${value} ${unit}(s) ago`; }
  }

  timeAgo(date) {
    const now = Date.now();
    const d = new Date(date).getTime();
    const diff = Math.floor((d - now) / 1000);
    const abs = Math.abs(diff);
    if (abs < 60) return this.relativeTime(diff, 'second');
    if (abs < 3600) return this.relativeTime(Math.round(diff / 60), 'minute');
    if (abs < 86400) return this.relativeTime(Math.round(diff / 3600), 'hour');
    if (abs < 604800) return this.relativeTime(Math.round(diff / 86400), 'day');
    if (abs < 2592000) return this.relativeTime(Math.round(diff / 604800), 'week');
    if (abs < 31536000) return this.relativeTime(Math.round(diff / 2592000), 'month');
    return this.relativeTime(Math.round(diff / 31536000), 'year');
  }

  fileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes; let i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${this.number(+size.toFixed(1))} ${units[i]}`;
  }

  duration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  list(items, opts = {}) {
    try { return new Intl.ListFormat(this.locale, opts).format(items); }
    catch { return items.join(', '); }
  }

  ordinal(n) {
    try { return new Intl.PluralRules(this.locale, { type: 'ordinal' }).select(n); }
    catch { return String(n); }
  }
}

// ─── Locale detection ─────────────────────────────────────────────────────────
export function detectLocale(fallback = 'en') {
  if (typeof navigator !== 'undefined') {
    const langs = navigator.languages ?? [navigator.language ?? navigator.userLanguage];
    for (const lang of langs) { if (lang) return lang.split('-')[0]; }
  }
  return fallback;
}

export function parseLocale(locale) {
  const parts = locale.split(/[-_]/);
  return { language: parts[0]?.toLowerCase() ?? 'en', region: parts[1]?.toUpperCase(), script: parts[2] };
}

export function isRTL(locale) {
  const lang = parseLocale(locale).language;
  return ['ar', 'he', 'fa', 'ur', 'dv', 'ps', 'ug', 'ku'].includes(lang);
}

// ─── Translation store ────────────────────────────────────────────────────────
export class TranslationStore {
  constructor() {
    this._messages = new Map();   // locale -> flat key map
    this._compiled = new Map();   // locale+key -> compiled fn
    this._fallback = 'en';
  }

  add(locale, messages, namespace = '') {
    if (!this._messages.has(locale)) this._messages.set(locale, new Map());
    const store = this._messages.get(locale);
    this._flatten(messages, namespace ? namespace + '.' : '', store);
    return this;
  }

  _flatten(obj, prefix, store) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix + k;
      if (typeof v === 'string') store.set(key, v);
      else if (typeof v === 'object') this._flatten(v, key + '.', store);
    }
  }

  get(locale, key) {
    return this._messages.get(locale)?.get(key) ?? this._messages.get(this._fallback)?.get(key);
  }

  translate(locale, key, params = {}, count = null) {
    let template = this.get(locale, key);
    if (!template) return key;

    // Plural key suffix
    if (count !== null) {
      const rule = (pluralRules[locale] ?? pluralRules.en)(count);
      const pluralKey = `${key}.${rule}`;
      const pluralTemplate = this.get(locale, pluralKey) ?? this.get(locale, `${key}.other`);
      if (pluralTemplate) template = pluralTemplate.replace(/#/g, String(count));
    }

    // Compile and cache
    const cacheKey = `${locale}::${key}`;
    if (!this._compiled.has(cacheKey)) this._compiled.set(cacheKey, compileMessage(template));
    return this._compiled.get(cacheKey)({ ...params, count }, locale);
  }

  has(locale, key) {
    return this._messages.get(locale)?.has(key) ?? false;
  }

  locales() { return [...this._messages.keys()]; }
  keys(locale) { return [...(this._messages.get(locale)?.keys() ?? [])]; }
  setFallback(locale) { this._fallback = locale; return this; }
  clear(locale) { if (locale) this._messages.delete(locale); else this._messages.clear(); this._compiled.clear(); return this; }
}

// ─── i18n instance ────────────────────────────────────────────────────────────
export class I18n {
  constructor(options = {}) {
    this._store = new TranslationStore();
    this._locale = options.locale ?? detectLocale(options.fallback ?? 'en');
    this._fallback = options.fallback ?? 'en';
    this._formatter = new Formatter(this._locale);
    this._store.setFallback(this._fallback);
    this._listeners = [];
    this._namespace = options.namespace ?? '';
    if (options.messages) {
      for (const [locale, msgs] of Object.entries(options.messages)) this._store.add(locale, msgs);
    }
  }

  get locale() { return this._locale; }
  get direction() { return isRTL(this._locale) ? 'rtl' : 'ltr'; }
  get isRTL() { return isRTL(this._locale); }

  setLocale(locale) {
    this._locale = locale;
    this._formatter = new Formatter(locale);
    for (const fn of this._listeners) fn(locale);
    return this;
  }

  addMessages(locale, messages, namespace) { this._store.add(locale, messages, namespace ?? this._namespace); return this; }

  t(key, params = {}, count = null) {
    const ns = this._namespace ? this._namespace + '.' + key : key;
    return this._store.translate(this._locale, ns, params, count);
  }

  tc(key, count, params = {}) { return this.t(key, params, count); }
  te(key) { return this._store.has(this._locale, this._namespace ? this._namespace + '.' + key : key); }

  n(value, opts) { return this._formatter.number(value, opts); }
  c(value, currency, opts) { return this._formatter.currency(value, currency, opts); }
  d(value, opts) { return this._formatter.date(value, opts); }
  p(value, opts) { return this._formatter.percent(value, opts); }
  timeAgo(date) { return this._formatter.timeAgo(date); }
  fileSize(bytes) { return this._formatter.fileSize(bytes); }
  duration(secs) { return this._formatter.duration(secs); }
  list(items, opts) { return this._formatter.list(items, opts); }

  onLocaleChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(f => f !== fn); }; }

  createNamespace(ns) {
    const child = new I18n({ locale: this._locale, fallback: this._fallback, namespace: ns });
    child._store = this._store;
    return child;
  }

  async loadAsync(locale, loader) {
    const messages = await loader(locale);
    this._store.add(locale, messages);
    return this;
  }

  locales() { return this._store.locales(); }
  has(key) { return this.te(key); }
}

// ─── String utilities ─────────────────────────────────────────────────────────
export const string = {
  capitalize: s => s.charAt(0).toUpperCase() + s.slice(1),
  titleCase: s => s.replace(/\b\w/g, c => c.toUpperCase()),
  camelToKebab: s => s.replace(/([A-Z])/g, m => '-' + m.toLowerCase()),
  kebabToCamel: s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
  snakeToCamel: s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
  camelToSnake: s => s.replace(/([A-Z])/g, m => '_' + m.toLowerCase()),
  truncate: (s, n, suffix = '…') => s.length > n ? s.slice(0, n - suffix.length) + suffix : s,
  pad: (s, len, char = ' ') => String(s).padStart(len, char),
  repeat: (s, n) => s.repeat(n),
  stripHtml: s => s.replace(/<[^>]+>/g, ''),
  escapeHtml: s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
  unescapeHtml: s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"),
  wordCount: s => s.trim().split(/\s+/).filter(Boolean).length,
  charCount: (s, includeSpaces = true) => includeSpaces ? s.length : s.replace(/\s/g,'').length,
  readingTime: (s, wpm = 200) => Math.ceil(string.wordCount(s) / wpm),
  slug: s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
  countOccurrences: (s, sub) => s.split(sub).length - 1,
  interpolate: (template, params) => template.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`),
};

// ─── Number formatting helpers ────────────────────────────────────────────────
export const format = {
  bytes: (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + ['Bytes','KB','MB','GB','TB','PB'][i];
  },
  duration: (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  },
  compact: (n) => {
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  },
  ordinal: (n) => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
  },
  roman: (n) => {
    const nums = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let out = '';
    for (let i = 0; i < nums.length; i++) while (n >= nums[i]) { out += syms[i]; n -= nums[i]; }
    return out;
  },
};

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createI18n(options) { return new I18n(options); }

export default {
  I18n, TranslationStore, Formatter, pluralRules, string, format,
  detectLocale, parseLocale, isRTL, compileMessage, createI18n,
};
