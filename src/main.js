/**
 * Shell: i18n, bacheca, load dump manifest, language toggle.
 * Graph/search engines are specified in docs/ and wired in later modules.
 */
import { applyDocumentLang, loadLocale, t } from './js/i18n/i18n.js';
import { MessageBoard } from './js/messages/board.js';
import { loadDumpManifest } from './js/cache/loader.js';

const board = new MessageBoard({
  list: document.getElementById('message-board-list'),
  badge: document.getElementById('message-board-badge'),
  toggle: document.getElementById('message-board-toggle'),
});

function bindLangButtons() {
  document.querySelectorAll('.it-lang-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lang = btn.getAttribute('data-lang');
      await applyLocale(lang);
      document.querySelectorAll('.it-lang-option').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
        if (active) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    });
  });
}

async function applyLocale(lang) {
  const dict = await loadLocale(lang);
  applyDocumentLang(lang, dict);
  renderStatic(dict);
  board.setLabels(dict.board);
}

function renderStatic(dict) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  };
  document.getElementById('tab-title').textContent = dict.meta.title;
  set('header-region-name', dict.meta.brand);
  set('page-heading', dict.meta.title);
  set('page-tagline', dict.meta.tagline);
  set('unofficial-disclaimer', dict.meta.disclaimer);
  set('registry-search-label', dict.search.label);
  set('search-btn', dict.search.button);
  set('registry-search-hint', dict.search.hint);
  const input = document.getElementById('registry-search');
  if (input) input.placeholder = dict.search.placeholder;
  set('results-heading', dict.results.heading);
  set('graph-heading', dict.graph.heading);
  const graph = document.getElementById('registry-graph');
  if (graph) graph.setAttribute('aria-label', dict.graph.aria);
  set('graph-placeholder', dict.graph.placeholder);
  set('message-board-title', dict.board.title);
  set('message-board-toggle-label', dict.board.open);
  set('footer-legal', dict.footer.legal);
  set('footer-docs', dict.footer.docs);
  set('footer-accessibility', dict.footer.accessibility);
}

document.getElementById('registry-search-form')?.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const q = document.getElementById('registry-search')?.value ?? '';
  const url = new URL(window.location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
  board.info(t('search.hint'));
});

bindLangButtons();

const initialLang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('itw-lang') || 'it';
const initialQ = new URLSearchParams(location.search).get('q');
if (initialQ) {
  const input = document.getElementById('registry-search');
  if (input) input.value = initialQ;
}

applyLocale(initialLang)
  .then(() => loadDumpManifest())
  .then((manifest) => {
    if (!manifest || !Array.isArray(manifest.resources) || manifest.resources.length === 0) {
      board.error({
        url: './cache/manifest.json',
        reason: t('results.emptyDump'),
        retry: () => window.location.reload(),
      });
      return;
    }
    const ok = manifest.resources.filter((r) => !r.error);
    const fail = manifest.resources.filter((r) => r.error);
    for (const r of ok) board.ok({ url: r.url || r.path });
    for (const r of fail) {
      board.error({
        url: r.url || r.path,
        reason: r.error,
        retry: () => window.location.reload(),
      });
    }
    const count = document.getElementById('results-count');
    if (count) {
      count.textContent = `Dump ${manifest.env || ''} — ${ok.length} risorse, ${fail.length} errori (${manifest.generated_at || 'n/d'})`;
    }
  })
  .catch((err) => {
    board.error({
      url: './cache/manifest.json',
      reason: err.message || String(err),
      retry: () => window.location.reload(),
    });
  });
