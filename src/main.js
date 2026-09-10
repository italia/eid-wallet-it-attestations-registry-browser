import { applyDocumentLang, currentLang, loadLocale, t } from './js/i18n/i18n.js';
import { MessageBoard } from './js/messages/board.js';
import { loadDump, loadDumpManifest } from './js/cache/loader.js';
import { resolveRegistryEnv } from './js/cache/environments.js';
import { buildRegistryGraph, facetOptions, visibleClosure } from './js/graph/model.js';
import { createRegistryGraphView } from './js/graph/view.js';
import { getQueryField, matchedNodeIds, parseQuery, searchDocuments, setQueryField } from './js/search/index.js';
import { artifactsForNode, renderArtifacts } from './js/artifacts/artifacts.js';
import { configurationIdsFor, credentialOfferHref, credentialOfferObject, encryptIssuerState, issuerStateUrn } from './js/offer/offer.js';
import QRCode from 'qrcode';

const state = {
  dump: null,
  graph: null,
  view: null,
  query: '',
  selectedId: null,
  env: 'pre',
  offerDraft: { objectId: '', publicKey: '' },
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
  paneList: document.getElementById('section-results'),
  paneGraph: document.getElementById('section-graph'),
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
  els.tabList?.setAttribute('aria-selected', String(list));
  els.tabGraph?.setAttribute('aria-selected', String(!list));
  const target = list ? els.paneList : els.paneGraph;
  target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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
  set('search-section-heading', dict.search.section);
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
  els.resultsList.classList.add('accordion');
  for (const doc of docs) {
    const collapseId = `${domId(doc.id)}-panel`;
    const headingId = `${domId(doc.id)}-heading`;
    const item = document.createElement('div');
    item.className = 'accordion-item';
    item.dataset.nodeId = doc.id;

    const heading = document.createElement('h3');
    heading.className = 'accordion-header';
    heading.id = headingId;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'accordion-button collapsed';
    btn.dataset.nodeId = doc.id;
    btn.dataset.kind = doc.kind;
    btn.dataset.bsToggle = 'collapse';
    btn.dataset.bsTarget = `#${collapseId}`;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', collapseId);
    btn.textContent = doc.label;

    const collapse = document.createElement('div');
    collapse.id = collapseId;
    collapse.className = 'accordion-collapse collapse';
    collapse.setAttribute('aria-labelledby', headingId);
    collapse.dataset.bsParent = '#results-list';
    const body = document.createElement('div');
    body.className = 'accordion-body result-detail';
    collapse.appendChild(body);
    collapse.addEventListener('show.bs.collapse', () => {
      void selectNode(doc.id, { fromGraph: false, fromAccordion: true });
    });

    heading.appendChild(btn);
    item.append(heading, collapse);
    els.resultsList.appendChild(item);
  }
  if (state.selectedId && docs.some((d) => d.id === state.selectedId)) {
    expandResult(state.selectedId);
  }
}

function domId(id) {
  return `result-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function resultPanel(id) {
  const btn = els.resultsList?.querySelector(`button.accordion-button[data-node-id="${CSS.escape(id)}"]`);
  if (!btn) return null;
  return document.getElementById(btn.getAttribute('aria-controls'));
}

function expandResult(id) {
  const panel = resultPanel(id);
  if (!panel) return Promise.resolve(false);
  if (panel.classList.contains('show')) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = () => resolve(true);
    panel.addEventListener('shown.bs.collapse', finish, { once: true });
    if (window.bootstrap?.Collapse) {
      window.bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).show();
    } else {
      panel.classList.add('show');
      const btn = els.resultsList.querySelector(`button.accordion-button[data-node-id="${CSS.escape(id)}"]`);
      btn?.classList.remove('collapsed');
      btn?.setAttribute('aria-expanded', 'true');
      finish();
    }
    window.setTimeout(finish, 700);
  });
}

function offerContext(node) {
  const formats = state.graph.nodes
    .filter((n) => n.kind === 'schema' && n.credential_type === node.credential_type)
    .map((n) => n.format);
  const issuer = state.graph.nodes.find(
    (n) => n.kind === 'issuer' && state.graph.edges.some((e) => e.source === node.id && e.target === n.id),
  );
  const source = state.graph.nodes.find(
    (n) => n.kind === 'authentic_source' && state.graph.edges.some((e) => e.source === node.id && e.target === n.id),
  );
  return {
    credentialIssuer: issuer?.entity_id || 'https://pre.issuer.wallet.ipzs.it',
    configurationIds: configurationIdsFor(node.credential_type, formats),
    authenticSourceId: source?.entity_id || source?.as || '',
    datasetId: source?.dataset_id || '',
  };
}

function field(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  if (text != null) el.textContent = text;
  return el;
}

async function selectNode(id, { fromGraph = false, fromAccordion = false } = {}) {
  state.selectedId = id;
  const node = state.graph.byId.get(id);
  if (!node) return;
  state.view?.select(id);
  els.graph?.classList.add('has-selection');
  els.resultsList.querySelectorAll('button.accordion-button[data-node-id]').forEach((el) => {
    const on = el.dataset.nodeId === id;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  if (!fromAccordion) await expandResult(id);
  await renderDetail(node);
  if (window.__ITW_EXPLORER__) window.__ITW_EXPLORER__.selectedId = id;
  if (fromGraph) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('section-results')?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    document.getElementById('credential-offer')?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }
}

async function renderDetail(node) {
  const panel = resultPanel(node.id);
  const host = panel?.querySelector('.result-detail');
  if (!host) return;
  host.id = 'node-detail';
  host.replaceChildren();

  const title = field('h3', { className: 'h6', id: 'detail-title' }, node.label);
  const body = field('div', { id: 'detail-body' });
  const dl = field('dl', { className: 'row mb-0' });
  const rows = [
    ['kind', node.kind],
    ['credential_type', node.credential_type],
    ['legal_type', node.legal_type],
    ['format', node.format],
    ['entity_id', node.entity_id],
  ].filter(([, v]) => v);
  for (const [k, v] of rows) {
    const dt = field('dt', { className: 'col-sm-4' }, k);
    const dd = field('dd', { className: 'col-sm-8' }, v);
    dl.append(dt, dd);
  }
  body.appendChild(dl);

  const artifactsHost = field('div', { id: 'node-artifacts' });
  artifactsHost.setAttribute('aria-labelledby', 'artifacts-heading');
  body.appendChild(artifactsHost);
  renderArtifacts(artifactsHost, artifactsForNode(node, state.dump), t);

  host.append(title, body);

  if (node.kind !== 'credential') return;
  host.appendChild(buildOfferShell());
  bindOfferForm(node);
  await refreshOffer(node);
}

function buildOfferShell() {
  const box = field('div', { id: 'credential-offer', className: 'credential-offer mt-3' });
  box.setAttribute('aria-labelledby', 'offer-heading');
  box.append(
    field('h3', { className: 'h6', id: 'offer-heading' }, t('offer.heading')),
    field('p', { className: 'small', id: 'offer-disclaimer' }, t('offer.disclaimer')),
  );

  const form = field('form', { id: 'offer-state-form', className: 'offer-state-form mb-3' });
  const fieldset = field('fieldset', { className: 'offer-state-fieldset' });
  fieldset.append(field('legend', { className: 'h6', id: 'offer-state-legend' }, t('offer.stateLegend')));

  const objWrap = field('div', { className: 'mb-3' });
  objWrap.append(
    field('label', { className: 'form-label', for: 'offer-object-id', id: 'offer-object-id-label' }, t('offer.objectId')),
    field('input', {
      id: 'offer-object-id',
      className: 'form-control',
      name: 'objectId',
      autocomplete: 'off',
      value: state.offerDraft.objectId,
    }),
    field('p', { className: 'form-text', id: 'offer-object-id-hint' }, t('offer.objectIdHint')),
  );

  const keyWrap = field('div', { className: 'mb-3' });
  const keyArea = field('textarea', {
    id: 'offer-enc-key',
    className: 'form-control',
    name: 'publicKey',
    rows: '4',
    spellcheck: 'false',
  });
  keyArea.value = state.offerDraft.publicKey;
  keyWrap.append(
    field('label', { className: 'form-label', for: 'offer-enc-key', id: 'offer-enc-key-label' }, t('offer.publicKey')),
    keyArea,
    field('p', { className: 'form-text', id: 'offer-enc-key-hint' }, t('offer.publicKeyHint')),
  );
  fieldset.append(objWrap, keyWrap);
  form.append(fieldset);
  form.addEventListener('submit', (ev) => ev.preventDefault());

  const urnLabel = field('p', { className: 'small mb-1', id: 'offer-urn-label' }, t('offer.urn'));
  const urn = field('code', { id: 'offer-urn', className: 'd-block text-break mb-3' });
  const jsonLabel = field('p', { className: 'small mb-1', id: 'offer-json-label' }, t('offer.json'));
  const jsonPre = field('pre', { id: 'offer-json', className: 'artifact-pre offer-json' });
  const err = field('p', { id: 'offer-enc-error', className: 'text-danger small', role: 'alert' });
  err.hidden = true;

  const urlLabel = field('h4', { className: 'h6 mt-3 mb-1', id: 'offer-url-label' }, t('offer.url'));
  const link = field('a', { id: 'offer-link', className: 'd-block text-break mb-2', href: '#' });
  link.setAttribute('aria-labelledby', 'offer-url-label');
  const haip = field('a', { id: 'offer-link-haip', className: 'visually-hidden', href: '#' }, 'haip');
  const qrLabel = field('h4', { className: 'h6 mt-3 mb-2', id: 'offer-qr-label' }, t('offer.qr'));
  const qr = field('img', { id: 'offer-qr', className: 'offer-qr', width: '192', height: '192', alt: '' });
  qr.setAttribute('aria-labelledby', 'offer-qr-label');

  box.append(form, urnLabel, urn, jsonLabel, jsonPre, err, urlLabel, link, haip, qrLabel, qr);
  return box;
}

function bindOfferForm(node) {
  const objectInput = document.getElementById('offer-object-id');
  const keyInput = document.getElementById('offer-enc-key');
  const onChange = () => {
    state.offerDraft.objectId = objectInput?.value || '';
    state.offerDraft.publicKey = keyInput?.value || '';
    window.clearTimeout(bindOfferForm.timer);
    bindOfferForm.timer = window.setTimeout(() => void refreshOffer(node), 280);
  };
  objectInput?.addEventListener('input', onChange);
  keyInput?.addEventListener('input', onChange);
}

let offerGen = 0;

async function refreshOffer(node) {
  const gen = ++offerGen;
  const ctx = offerContext(node);
  const urn = issuerStateUrn({
    authenticSourceId: ctx.authenticSourceId,
    datasetId: ctx.datasetId,
    objectId: state.offerDraft.objectId,
  });
  const urnEl = document.getElementById('offer-urn');
  const errEl = document.getElementById('offer-enc-error');
  if (urnEl) urnEl.textContent = urn || t('offer.urnMissing');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }

  let issuerState;
  if (urn && state.offerDraft.publicKey.trim()) {
    try {
      issuerState = await encryptIssuerState(urn, state.offerDraft.publicKey);
    } catch {
      if (gen !== offerGen) return;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = t('offer.encryptError');
      }
    }
  }
  if (gen !== offerGen) return;

  const body = credentialOfferObject({
    credentialIssuer: ctx.credentialIssuer,
    configurationIds: ctx.configurationIds,
    issuerState,
  });
  const jsonEl = document.getElementById('offer-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(body, null, 2);

  const href = credentialOfferHref({ ...ctx, body });
  const link = document.getElementById('offer-link');
  if (link) {
    link.href = href;
    link.textContent = href;
  }
  const haip = document.getElementById('offer-link-haip');
  if (haip) haip.href = credentialOfferHref({ ...ctx, body, scheme: 'haip-vci' });
  const img = document.getElementById('offer-qr');
  if (img) {
    img.alt = href;
    img.src = await QRCode.toDataURL(href, { errorCorrectionLevel: 'M', margin: 1, width: 192 });
  }
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
    httpCalls: state.dump?.httpCalls || [],
  };
  window.__ITW_CY__ = state.view?.cy || null;
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
