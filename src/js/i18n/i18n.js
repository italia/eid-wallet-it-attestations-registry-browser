let dict = {};
let lang = 'it';

export function t(path, vars = {}) {
  const value = path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), dict);
  if (typeof value !== 'string') return path;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export async function loadLocale(nextLang) {
  lang = nextLang === 'en' ? 'en' : 'it';
  const url = new URL(`../locales/${lang}.json`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locale ${lang} HTTP ${res.status}`);
  dict = await res.json();
  localStorage.setItem('itw-lang', lang);
  return dict;
}

export function applyDocumentLang(nextLang, nextDict) {
  lang = nextLang;
  dict = nextDict;
  document.documentElement.lang = nextLang;
  const label = document.querySelector('.it-header-lang-label');
  if (label) label.textContent = nextLang === 'en' ? 'ENG' : 'ITA';
}

export function currentLang() {
  return lang;
}
