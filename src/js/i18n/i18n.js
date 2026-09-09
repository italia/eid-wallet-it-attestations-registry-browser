import it from '../../locales/it.json';
import en from '../../locales/en.json';

const dictionaries = { it, en };
let dict = dictionaries.it;
let lang = 'it';

export function t(path, vars = {}) {
  const value = path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), dict);
  if (typeof value !== 'string') return path;
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export async function loadLocale(nextLang) {
  lang = nextLang === 'en' ? 'en' : 'it';
  dict = dictionaries[lang];
  localStorage.setItem('itw-lang', lang);
  return dict;
}

export function applyDocumentLang(nextLang, nextDict) {
  lang = nextLang === 'en' ? 'en' : 'it';
  dict = nextDict || dictionaries[lang];
  document.documentElement.lang = lang;
  const label = document.querySelector('.it-header-lang-label');
  if (label) label.textContent = lang === 'en' ? 'EN' : 'ITA';
  const hint = document.getElementById('header-lang-active-hint');
  if (hint) hint.textContent = lang === 'en' ? 'active language:' : 'lingua attiva:';
  const toggle = document.getElementById('languagesDropButton');
  if (toggle) {
    toggle.setAttribute(
      'aria-label',
      lang === 'en' ? 'Language selection, English selected' : 'Selezione lingua, Italiano selezionata',
    );
  }
}

export function currentLang() {
  return lang;
}

export function dictionary() {
  return dict;
}
