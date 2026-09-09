import { applyDocumentLang, currentLang, loadLocale, t } from './js/i18n/i18n.js';
import { MessageBoard } from './js/messages/board.js';
import { loadDump, loadDumpManifest } from './js/cache/loader.js';
import { resolveRegistryEnv } from './js/cache/environments.js';
import { buildRegistryGraph, facetOptions, visibleClosure } from './js/graph/model.js';
import { createRegistryGraphView } from './js/graph/view.js';
import { getQueryField, matchedNodeIds, parseQuery, searchDocuments, setQueryField } from './js/search/index.js';
import { artifactsForNode, renderArtifacts } from './js/artifacts/artifacts.js';
import { configurationIdsFor, credentialOfferHref } from './js/offer/offer.js';
import QRCode from 'qrcode';

const state = {
  dump: null,
  graph: null,
  view: null,
  query: '',
  selectedId: null,
  env: 'pre',
};

const board = new MessageBoard({
  list: document.getElementById('message-board-list'),
  badge: document.getElementById('message-board-badge'),
  toggle: document.getElementById('message-board-toggle'),
});

const cacheLoading = {
  el: document.getElementById('cache-loading'),
  fill: document.getElementById('cache-loading-fill'),
  bar: document.getElementById('cache-loading-bar'),
  status: document.getElementById('cache-loading-status'),
  board: document.getElementById('board-loading'),
  boardFill: document.getElementById('board-loading-fill'),
  active: false,
  current: 0,
  total: 0,
};

function cacheLoadingLabel() {
  if (cacheLoading.total > 0) {
    return t('board.loadingProgress', {
      current: String(cacheLoading.current),
      total: String(cacheLoading.total),
    });
  }
  return t('board.loading');
}

function setCacheLoading({ active, current = 0, total = 0 } = {}) {
  cacheLoading.active = Boolean(active);
  cacheLoading.current = current;
  cacheLoading.total = total;
  const indeterminate = cacheLoading.active && total <= 0;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const width = total > 0 ? `${pct}%` : '';
  const label = cacheLoading.active ? cacheLoadingLabel() : t('board.loadingDone');

  if (cacheLoading.el) {
    cacheLoading.el.hidden = !cacheLoading.active;
    cacheLoading.el.setAttribute('aria-hidden', String(!cacheLoading.active));
    cacheLoading.el.classList.toggle('is-indeterminate', indeterminate);
  }
  if (cacheLoading.board) {
    cacheLoading.board.hidden = !cacheLoading.active;
    cacheLoading.board.classList.toggle('is-indeterminate', indeterminate);
  }
  if (cacheLoading.fill) cacheLoading.fill.style.width = width;
  if (cacheLoading.boardFill) cacheLoading.boardFill.style.width = width;
  if (cacheLoading.status) cacheLoading.status.textContent = label;
  if (cacheLoading.bar) {
    cacheLoading.bar.setAttribute('aria-busy', String(cacheLoading.active));
    if (cacheLoading.active && !indeterminate) cacheLoading.bar.setAttribute('aria-valuenow', String(pct));
    else cacheLoading.bar.removeAttribute('aria-valuenow');
  }
  document.getElementById('main-content')?.setAttribute('aria-busy', String(cacheLoading.active));
  document.getElementById('message-board')?.setAttribute('aria-busy', String(cacheLoading.active));
  document.getElementById('message-board-toggle')?.setAttribute('aria-busy', String(cacheLoading.active));
  board.setPending(cacheLoading.active ? label : null);
}

const FACET_FIELDS = [
  ['facet-legal-type', 'legal_type'],
  ['facet-issuer', 'issuer'],
  ['facet-as', 'as'],
  ['facet-claim', 'claim'],
];

const els = {
  search: document.getElementById('registry-search'),
  searchError: document.getElementById('registry-search-error'),
  resultsCount: document.getElementById('results-count'),
  resultsList: document.getElementById('results-list'),
  graph: document.getElementById('registry-graph'),
  graphCaption: document.getElementById('graph-caption'),
  detail: document.getElementById('node-detail'),
  paneList: document.getElementById('pane-list'),
  paneGraph: document.getElementById('pane-graph'),
  tabList: document.getElementById('tab-list'),
  tabGraph: document.getElementById('tab-graph'),
  facetLegalType: document.getElementById('facet-legal-type'),
  facetIssuer: document.getElementById('facet-issuer'),
  facetAs: document.getElementById('facet-as'),
  facetClaim: document.getElementById('facet-claim'),
  env: document.getElementById('registry-env'),
  taLink: document.getElementById('registry-ta-link'),
};

function setPane(name) {
  const list = name === 'list';
  els.paneList.classList.toggle('is-active', list);
  els.paneGraph.classList.toggle('is-active', !list);
  els.paneList.hidden = !list && isMobile();
  els.paneGraph.hidden = list && isMobile();
  els.tabList?.setAttribute('aria-selected', String(list));
  els.tabGraph?.setAttribute('aria-selected', String(!list));
  if (!list) {
    state.view?.resize();
    state.view?.fit();
  }
}

function isMobile() {
  return window.matchMedia('(max-width: 991.98px)').matches;
}

function bindLangMenuPopper() {
  const toggle = document.getElementById('languagesDropButton');
  if (!window.bootstrap?.Dropdown || !toggle) return;
  const existing = window.bootstrap.Dropdown.getInstance(toggle);
  if (existing) existing.dispose();
  new window.bootstrap.Dropdown(toggle, {
    popperConfig(defaultConfig) {
      const base = defaultConfig || {};
      const mods = Array.isArray(base.modifiers) ? base.modifiers.slice() : [];
      let found = false;
      const next = mods.map((m) => {
        if (m.name !== 'offset') return m;
        found = true;
        return { ...m, options: { ...(m.options || {}), offset: [0, 24] } };
      });
      if (!found) next.push({ name: 'offset', options: { offset: [0, 24] } });
      return { ...base, modifiers: next };
    },
  });
}

function bindChrome() {
  bindLangMenuPopper();
  document.querySelectorAll('.it-lang-option').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const toggle = document.getElementById('languagesDropButton');
      window.bootstrap?.Dropdown?.getInstance(toggle)?.hide();
      await applyLocale(btn.getAttribute('data-lang'));
      document.querySelectorAll('.it-lang-option').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
        if (active) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      if (state.dump) rebuildGraph();
    });
  });

  document.getElementById('registry-search-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    applyQuery(els.search.value);
  });
  els.search?.addEventListener('input', () => {
    if (!els.search.value) applyQuery('');
    else syncFacetsFromQuery(els.search.value);
  });
  document.getElementById('search-clear-btn')?.addEventListener('click', () => {
    els.search.value = '';
    applyQuery('');
    els.search.focus();
  });
  for (const [id, field] of FACET_FIELDS) {
    document.getElementById(id)?.addEventListener('change', (ev) => {
      const next = setQueryField(els.search?.value || '', field, ev.target.value);
      if (els.search) els.search.value = next;
      applyQuery(next);
    });
  }
  els.env?.addEventListener('change', () => {
    setEnv(els.env.value);
    bootDump().catch((err) => {
      window.__ITW_ERROR__ = err.message || String(err);
      board.error({
        url: `${import.meta.env.BASE_URL}cache/${currentEnv().manifestFile}`,
        reason: err.message || String(err),
        retry: () => bootDump(),
      });
    });
  });

  els.tabList?.addEventListener('click', () => setPane('list'));
  els.tabGraph?.addEventListener('click', () => setPane('graph'));

  document.getElementById('graph-zoom-in')?.addEventListener('click', () => state.view?.zoomIn());
  document.getElementById('graph-zoom-out')?.addEventListener('click', () => state.view?.zoomOut());
  document.getElementById('graph-zoom-fit')?.addEventListener('click', () => state.view?.fit());

  document.getElementById('skip-board')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const canvas = document.getElementById('message-board');
    window.bootstrap?.Offcanvas?.getOrCreateInstance(canvas).show();
  });
  document.getElementById('skip-graph')?.addEventListener('click', () => {
    if (isMobile()) setPane('graph');
  });
  document.getElementById('skip-search')?.addEventListener('click', () => {
    if (isMobile()) setPane('list');
  });

  const offcanvas = document.getElementById('message-board');
  offcanvas?.addEventListener('shown.bs.offcanvas', () => {
    document.getElementById('message-board-toggle')?.setAttribute('aria-expanded', 'true');
  });
  offcanvas?.addEventListener('hidden.bs.offcanvas', () => {
    document.getElementById('message-board-toggle')?.setAttribute('aria-expanded', 'false');
    document.getElementById('message-board-toggle')?.focus();
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      els.paneList.hidden = false;
      els.paneGraph.hidden = false;
      els.paneList.classList.add('is-active');
      els.paneGraph.classList.add('is-active');
    } else {
      setPane(els.tabGraph?.getAttribute('aria-selected') === 'true' ? 'graph' : 'list');
    }
    state.view?.fit();
  });
}

async function applyLocale(lang) {
  const dict = await loadLocale(lang);
  applyDocumentLang(lang, dict);
  renderStatic(dict);
  board.setLabels(dict.board);
  if (cacheLoading.active) {
    setCacheLoading({
      active: true,
      current: cacheLoading.current,
      total: cacheLoading.total,
    });
  }
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
  set('registry-search-label', dict.search.label);
  set('search-btn', dict.search.button);
  set('registry-search-hint', dict.search.hint);
  set('search-clear-btn', dict.search.clear);
  set('search-facets-legend', dict.search.facetsLegend);
  set('facet-legal-type-label', dict.search.legalType);
  set('facet-issuer-label', dict.search.issuer);
  set('facet-as-label', dict.search.authenticSource);
  set('facet-claim-label', dict.search.claim);
  set('registry-env-label', dict.search.env);
  set('registry-ta-prefix', dict.search.trustAnchor);
  const envSelect = document.getElementById('registry-env');
  const preOpt = envSelect?.querySelector('option[value="pre"]');
  const prodOpt = envSelect?.querySelector('option[value="prod"]');
  if (preOpt) preOpt.textContent = dict.search.envPre;
  if (prodOpt) prodOpt.textContent = dict.search.envProd;
  document.querySelectorAll('.registry-search-facets select option[value=""]').forEach((opt) => {
    opt.textContent = dict.search.facetAll;
  });
  if (els.search) els.search.placeholder = dict.search.placeholder;
  set('results-heading', dict.results.heading);
  set('graph-heading', dict.graph.heading);
  set('message-board-title', dict.board.title);
  set('message-board-toggle-label', dict.board.open);
  set('footer-legal', dict.footer.legal);
  set('footer-docs', dict.footer.docs);
  set('footer-accessibility', dict.footer.accessibility);
  set('tab-list', dict.mobile.list);
  set('tab-graph', dict.mobile.graph);
  set('graph-toolbar-label', dict.graph.toolbar);
  set('graph-zoom-in-label', dict.graph.zoomIn);
  set('graph-zoom-out-label', dict.graph.zoomOut);
  set('graph-zoom-fit-label', dict.graph.fit);
  set('skip-main', dict.skip.main);
  set('skip-search', dict.skip.search);
  set('skip-graph', dict.skip.graph);
  set('skip-board', dict.skip.board);
  set('skip-footer', dict.skip.footer);
  set('offer-heading', dict.offer.heading);
  set('offer-disclaimer', dict.offer.disclaimer);
}

function fillSelect(select, items) {
  if (!select) return;
  const previous = select.value;
  const allLabel = t('search.facetAll');
  select.replaceChildren();
  select.appendChild(new Option(allLabel, ''));
  for (const item of items) {
    select.appendChild(new Option(item.label, item.value));
  }
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

function populateFacets() {
  const facets = facetOptions(state.graph);
  fillSelect(els.facetLegalType, facets.legalTypes);
  fillSelect(els.facetIssuer, facets.issuers);
  fillSelect(els.facetAs, facets.sources);
  fillSelect(els.facetClaim, facets.claims);
  syncFacetsFromQuery(state.query);
}

function syncFacetsFromQuery(query) {
  for (const [id, field] of FACET_FIELDS) {
    const select = document.getElementById(id);
    if (!select) continue;
    const value = getQueryField(query, field);
    const match = [...select.options].find((o) => o.value && o.value === value);
    const next = match ? match.value : '';
    if (select.value !== next) select.value = next;
  }
}

function currentEnv() {
  return resolveRegistryEnv(state.env);
}

function syncEnvUi() {
  const spec = currentEnv();
  if (els.env && els.env.value !== spec.id) els.env.value = spec.id;
  if (els.taLink) {
    els.taLink.href = spec.baseUrl;
    els.taLink.textContent = spec.baseUrl;
  }
}

function writeUrl() {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set('q', state.query);
  else url.searchParams.delete('q');
  url.searchParams.set('env', currentEnv().id);
  history.replaceState(null, '', url);
}

function setEnv(value) {
  state.env = resolveRegistryEnv(value).id;
  syncEnvUi();
  writeUrl();
}

function applyQuery(query) {
  state.query = query;
  writeUrl();
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.hidden = !query;
  syncFacetsFromQuery(query);

  const parsed = parseQuery(query);
  if (els.searchError) {
    els.searchError.hidden = true;
    els.search.removeAttribute('aria-invalid');
  }
  if (!state.graph) return;

  const matches = searchDocuments(state.graph.documents, query);
  const focusKinds = new Set(['credential', 'issuer', 'authentic_source', 'schema', 'claim', 'domain']);
  const resultDocs = parsed.empty
    ? state.graph.documents.filter((d) => d.kind === 'credential')
    : matches.filter((d) => focusKinds.has(d.kind));
  const matchIds = parsed.empty
    ? new Set(state.graph.nodes.map((n) => n.id))
    : visibleClosure(state.graph, matchedNodeIds(state.graph, query));

  renderResults(resultDocs);
  state.view?.applyVisible(matchIds);
  if (els.graphCaption) {
    els.graphCaption.textContent = t('graph.caption', {
      visible: String(matchIds.size),
      total: String(state.graph.nodes.length),
      query: query || t('graph.all'),
    });
  }
  exposeTestApi(matchIds, resultDocs);
}

function renderResults(docs) {
  if (els.resultsCount) els.resultsCount.textContent = t('results.count', { n: String(docs.length) });
  els.resultsList.replaceChildren();
  for (const doc of docs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action';
    btn.dataset.nodeId = doc.id;
    btn.dataset.kind = doc.kind;
    btn.textContent = doc.label;
    btn.addEventListener('click', () => selectNode(doc.id, { fromGraph: false }));
    els.resultsList.appendChild(btn);
  }
}

async function selectNode(id, { fromGraph = false } = {}) {
  state.selectedId = id;
  const node = state.graph.byId.get(id);
  if (!node) return;
  state.view?.select(id);
  els.graph?.classList.add('has-selection');
  els.resultsList.querySelectorAll('[data-node-id]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nodeId === id);
    el.setAttribute('aria-current', el.dataset.nodeId === id ? 'true' : 'false');
  });
  await renderDetail(node);
  if (els.detail) els.detail.hidden = false;
  if (window.__ITW_EXPLORER__) window.__ITW_EXPLORER__.selectedId = id;
  if (fromGraph) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('node-artifacts')?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }
}

async function renderDetail(node) {
  const title = document.getElementById('detail-title');
  const body = document.getElementById('detail-body');
  const offerBox = document.getElementById('credential-offer');
  title.textContent = node.label;
  body.replaceChildren();
  const dl = document.createElement('dl');
  dl.className = 'row mb-0';
  const rows = [
    ['kind', node.kind],
    ['credential_type', node.credential_type],
    ['legal_type', node.legal_type],
    ['format', node.format],
    ['entity_id', node.entity_id],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.className = 'col-sm-4';
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.className = 'col-sm-8';
    dd.textContent = v;
    dl.append(dt, dd);
  }
  body.appendChild(dl);

  const artifactsHost = document.createElement('div');
  artifactsHost.id = 'node-artifacts';
  artifactsHost.setAttribute('aria-labelledby', 'artifacts-heading');
  body.appendChild(artifactsHost);
  renderArtifacts(artifactsHost, artifactsForNode(node, state.dump), t);

  const showOffer = node.kind === 'credential';
  offerBox.hidden = !showOffer;
  if (!showOffer) return;

  const formats = state.graph.nodes.filter((n) => n.kind === 'schema' && n.credential_type === node.credential_type).map((n) => n.format);
  const issuer = state.graph.nodes.find((n) => n.kind === 'issuer' && state.graph.edges.some((e) => e.source === node.id && e.target === n.id));
  const href = credentialOfferHref({
    credentialIssuer: issuer?.entity_id || 'https://pre.issuer.wallet.ipzs.it',
    configurationIds: configurationIdsFor(node.credential_type, formats),
  });
  const link = document.getElementById('offer-link');
  link.href = href;
  link.textContent = href;
  const haip = document.getElementById('offer-link-haip');
  haip.href = credentialOfferHref({
    credentialIssuer: issuer?.entity_id || 'https://pre.issuer.wallet.ipzs.it',
    configurationIds: configurationIdsFor(node.credential_type, formats),
    scheme: 'haip-vci',
  });
  const img = document.getElementById('offer-qr');
  img.alt = href;
  img.src = await QRCode.toDataURL(href, { errorCorrectionLevel: 'M', margin: 1, width: 192 });
}

function rebuildGraph() {
  const keepId = state.selectedId;
  state.view?.destroy();
  state.graph = buildRegistryGraph(state.dump, { lang: currentLang() });
  els.graph.replaceChildren();
  els.graph.setAttribute('data-ready', 'false');
  exposeTestApi(new Set(state.graph.nodes.map((n) => n.id)), state.graph.documents.filter((d) => d.kind === 'credential'));
  state.view = createRegistryGraphView(els.graph, state.graph, {
    onSelect: (data) => selectNode(data.id, { fromGraph: true }),
  });
  els.graph.setAttribute('data-ready', 'true');
  els.graph.setAttribute('aria-busy', 'false');
  populateFacets();
  applyQuery(state.query);
  if (keepId && state.graph.byId.has(keepId)) {
    void selectNode(keepId);
  }
  if (isMobile()) setPane('list');
}

function exposeTestApi(visibleIds, resultDocs) {
  window.__ITW_EXPLORER__ = {
    query: state.query,
    env: currentEnv().id,
    baseUrl: currentEnv().baseUrl,
    nodeCount: state.graph?.nodes.length || 0,
    edgeCount: state.graph?.edges.length || 0,
    visibleIds: [...(visibleIds || [])],
    resultIds: (resultDocs || []).map((d) => d.id),
    kinds: Object.fromEntries(
      ['credential', 'issuer', 'authentic_source', 'schema', 'claim', 'domain'].map((k) => [
        k,
        state.graph?.nodes.filter((n) => n.kind === k).length || 0,
      ]),
    ),
    selectedId: state.selectedId,
    cy: state.view?.cy || null,
    httpCalls: state.dump?.httpCalls || [],
  };
}

let dumpGeneration = 0;

async function bootDump() {
  const gen = ++dumpGeneration;
  const spec = currentEnv();
  syncEnvUi();
  board.clear();
  setCacheLoading({ active: true, current: 0, total: 0 });
  const onProgress = (progress) => {
    if (gen !== dumpGeneration) return;
    if (progress.httpCalls?.length) {
      board.setHttpCalls(progress.httpCalls, { retry: () => bootDump() });
    }
    setCacheLoading({
      active: true,
      current: progress.current || 0,
      total: progress.total || 0,
    });
  };
  try {
    let loaded;
    try {
      loaded = await loadDumpManifest(spec.id, fetch, onProgress);
    } catch (err) {
      if (gen !== dumpGeneration) return;
      board.clear();
      if (err.httpCalls?.length) board.setHttpCalls(err.httpCalls, { retry: () => bootDump() });
      else {
        board.error({
          url: `${import.meta.env.BASE_URL}cache/${spec.manifestFile}`,
          reason: err.message || String(err),
          retry: () => bootDump(),
        });
      }
      exposeTestApi(new Set(), []);
      window.__ITW_ERROR__ = err.message || String(err);
      return;
    }
    if (gen !== dumpGeneration) return;
    const { manifest, httpCalls } = loaded;
    if (!manifest.resources?.length) {
      board.setHttpCalls(httpCalls, { retry: () => bootDump() });
      board.error({
        url: `${import.meta.env.BASE_URL}cache/${spec.manifestFile}`,
        reason: t('results.emptyDump'),
        retry: () => bootDump(),
      });
      exposeTestApi(new Set(), []);
      return;
    }
    const dump = await loadDump(manifest, { httpCalls, onProgress });
    if (gen !== dumpGeneration) return;
    state.dump = dump;
    board.setHttpCalls(dump.httpCalls, { retry: () => bootDump() });
    rebuildGraph();
  } finally {
    if (gen === dumpGeneration) setCacheLoading({ active: false });
  }
}

bindChrome();
const params = new URLSearchParams(location.search);
const initialLang = params.get('lang') || localStorage.getItem('itw-lang') || 'it';
const initialQ = params.get('q') || '';
setEnv(params.get('env') || 'pre');
if (initialQ && els.search) els.search.value = initialQ;
state.query = initialQ;
writeUrl();

applyLocale(initialLang)
  .then(() => bootDump())
  .catch((err) => {
    window.__ITW_ERROR__ = err.message || String(err);
    board.error({
      url: `${import.meta.env.BASE_URL}cache/${currentEnv().manifestFile}`,
      reason: err.message || String(err),
      retry: () => window.location.reload(),
    });
  });
