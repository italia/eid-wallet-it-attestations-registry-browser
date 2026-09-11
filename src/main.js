import { applyDocumentLang, currentLang, dictionary, loadLocale, t } from './js/i18n/i18n.js';
import { MessageBoard } from './js/messages/board.js';
import { loadDump, loadDumpManifest, timedFetch } from './js/cache/loader.js';
import { resolveRegistryEnv } from './js/cache/environments.js';
import {
  annotateDumpTrust,
  applyLiveBody,
  fetchLiveResource,
  isCorsFailure,
  overlayFromIdb,
  refreshDumpLive,
} from './js/cache/browser.js';
import { buildRegistryGraph, facetOptions, visibleClosure } from './js/graph/model.js';
import { createRegistryGraphView } from './js/graph/view.js';
import { getQueryField, matchedNodeIds, parseQuery, searchDocuments, setQueryField, understoodQuery } from './js/search/index.js';
import { kindIconId, kindLabelKey } from './js/results/kind-icon.js';
import {
  appendDetailAccordionItem,
  artifactsForNode,
  createDetailAccordion,
  isIssuerWellKnownArtifact,
  issuerWellKnownGroupsForCredential,
  openidCredentialIssuerMetadata,
  renderArtifacts,
  resolveDumpedIssuerId,
} from './js/artifacts/artifacts.js';
import { configurationIdsFor, credentialOfferHref, credentialOfferObject, decryptIssuerState, encryptIssuerState, issuerStateUrn } from './js/offer/offer.js';
import { buildDemoCredentials } from './js/demo/example.js';
import { demoCardModels } from './js/demo/card.js';
import { demoEncPrivateJwkText } from './js/demo/material.js';
import demoEncPublicPem from '../demo/keys/issuer-state-enc.public.pem?raw';
import QRCode from 'qrcode';
import { version as appVersion } from '../package.json';

const state = {
  dump: null,
  graph: null,
  view: null,
  query: '',
  selectedId: null,
  env: 'pre',
  offerDraft: { objectId: '', publicKey: String(demoEncPublicPem || '').trim() },
  pendingNode: null,
  liveRefreshing: false,
};

const board = new MessageBoard({
  list: document.getElementById('message-board-list'),
  badge: document.getElementById('message-board-badge'),
  toggle: document.getElementById('message-board-toggle'),
  corsHelp: document.getElementById('board-cors-help'),
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
  if (state.graph) applyQuery(state.query, { restoreSelection: false });
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
  const understood = document.getElementById('query-understood');
  if (understood && !state.query) understood.textContent = '';
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
  set('cors-fault-text', dict.board.corsBanner);
  set('board-cors-body', dict.board.corsBody);
  const corsHref = dict.board.corsDocsHref;
  const corsLink = document.getElementById('cors-fault-link');
  if (corsLink) {
    corsLink.textContent = dict.board.corsReadMore;
    if (corsHref) corsLink.setAttribute('href', corsHref);
  }
  const boardCorsLink = document.getElementById('board-cors-link');
  if (boardCorsLink) {
    boardCorsLink.textContent = dict.board.corsReadMore;
    if (corsHref) boardCorsLink.setAttribute('href', corsHref);
  }
  set('footer-legal', dict.footer.legal);
  set('footer-docs', dict.footer.docs);
  set('footer-accessibility', dict.footer.accessibility);
  set('footer-github', dict.footer.github);
  const versionEl = document.getElementById('footer-version');
  if (versionEl) versionEl.textContent = `v${appVersion}`;
  set('footer-specs-label', dict.footer.specsLabel);
  set('footer-specs', dict.footer.specs);
  const specsLink = document.getElementById('footer-specs');
  if (specsLink && dict.footer.specsHref) specsLink.setAttribute('href', dict.footer.specsHref);
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
  set('example-warning-title', dict.example.warningTitle);
  fillExampleDisclaimer(document.getElementById('example-disclaimer'));
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
  if (state.selectedId) url.searchParams.set('node', state.selectedId);
  else url.searchParams.delete('node');
  history.replaceState(null, '', url);
}

function setEnv(value) {
  state.env = resolveRegistryEnv(value).id;
  syncEnvUi();
  writeUrl();
}

function applyQuery(query, options = {}) {
  state.query = query;
  writeUrl();
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.hidden = !query;
  syncFacetsFromQuery(query);

  const parsed = parseQuery(query);
  const understood = document.getElementById('query-understood');
  if (understood) understood.textContent = understoodQuery(query, currentLang());
  if (els.searchError) {
    els.searchError.hidden = true;
    els.search.removeAttribute('aria-invalid');
  }
  if (!state.graph) return;

  const matches = searchDocuments(state.graph.documents, query);
  const focusKinds = new Set(['credential', 'issuer', 'authentic_source', 'schema', 'claim', 'domain']);
  let resultDocs = parsed.empty
    ? state.graph.documents.filter((d) => d.kind === 'credential')
    : matches.filter((d) => focusKinds.has(d.kind));
  const matchIds = parsed.empty
    ? new Set(state.graph.nodes.map((n) => n.id))
    : visibleClosure(state.graph, matchedNodeIds(state.graph, query));

  if (state.selectedId && state.graph.byId.has(state.selectedId) && !resultDocs.some((d) => d.id === state.selectedId)) {
    const extra = state.graph.documents.find((d) => d.id === state.selectedId);
    if (extra) resultDocs = [extra, ...resultDocs];
  }
  renderResults(resultDocs, { restoreSelection: options.restoreSelection !== false });
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

function renderResults(docs, { restoreSelection = true } = {}) {
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
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('icon', 'icon-primary', 'result-kind-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${kindIconId(doc.kind)}`);
    icon.appendChild(use);
    const kindText = field('span', { className: 'visually-hidden' }, t(kindLabelKey(doc.kind)));
    const label = field('span', { className: 'result-label' }, doc.label);
    btn.replaceChildren(icon, kindText, label);

    const collapse = document.createElement('div');
    collapse.id = collapseId;
    collapse.className = 'accordion-collapse collapse';
    collapse.setAttribute('aria-labelledby', headingId);
    const body = document.createElement('div');
    body.className = 'accordion-body result-detail';
    collapse.appendChild(body);
    collapse.addEventListener('show.bs.collapse', (ev) => {
      if (ev.target !== collapse) return;
      els.resultsList.querySelectorAll(':scope > .accordion-item > .accordion-collapse.show').forEach((other) => {
        if (other === collapse) return;
        window.bootstrap?.Collapse.getOrCreateInstance(other, { toggle: false }).hide();
      });
      if (collapse.querySelector('#node-detail')) return;
      void selectNode(doc.id, { fromGraph: false, fromAccordion: true });
    });

    heading.appendChild(btn);
    item.append(heading, collapse);
    els.resultsList.appendChild(item);
  }
  if (restoreSelection && state.selectedId && docs.some((d) => d.id === state.selectedId)) {
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
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    const onShown = (ev) => {
      if (ev.target !== panel) return;
      panel.removeEventListener('shown.bs.collapse', onShown);
      finish();
    };
    panel.addEventListener('shown.bs.collapse', onShown);
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
  const resolvedIssuerId = resolveDumpedIssuerId(state.dump, issuer?.entity_id, {
    credentialType: node.credential_type,
    formats,
  });
  const metadata =
    state.dump?.issuerMetadata?.[resolvedIssuerId] ||
    openidCredentialIssuerMetadata(state.dump?.issuerFederation?.[resolvedIssuerId]) ||
    null;
  const config = configurationIdsFor(node.credential_type, formats, metadata);
  const metaSource = metadata?.credential_configurations_supported?.[config.ids[0]]?.authentic_sources;
  return {
    credentialIssuer:
      metadata?.credential_issuer || resolvedIssuerId || issuer?.entity_id || 'https://pre.issuer.wallet.ipzs.it',
    configurationIds: config.ids,
    configurationDerived: config.derived,
    authenticSourceId: metaSource?.entity_id || source?.entity_id || source?.as || '',
    datasetId: metaSource?.dataset_id || source?.dataset_id || '',
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

function fillExampleDisclaimer(el) {
  if (!el) return;
  const example = dictionary().example || {};
  const parts = String(example.disclaimer || '').split('{{keys}}');
  el.replaceChildren();
  if (parts[0]) el.appendChild(document.createTextNode(parts[0]));
  el.appendChild(
    field(
      'a',
      {
        id: 'example-keys-link',
        className: 'alert-link',
        href: example.keysHref,
        target: '_blank',
        rel: 'noopener',
      },
      example.keysLink,
    ),
  );
  if (parts[1]) el.appendChild(document.createTextNode(parts[1]));
}

let selectGen = 0;

async function selectNode(id, { fromGraph = false, fromAccordion = false } = {}) {
  const gen = ++selectGen;
  state.selectedId = id;
  writeUrl();
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
  if (gen !== selectGen) return;
  await renderDetail(node, gen);
  if (gen !== selectGen) return;
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

function clearOtherNodeDetails(keepId) {
  els.resultsList?.querySelectorAll('.result-detail').forEach((el) => {
    const item = el.closest('[data-node-id]');
    if (item?.dataset.nodeId === keepId) return;
    el.removeAttribute('id');
    el.replaceChildren();
  });
}

function offerRootFor(nodeId) {
  const panel = resultPanel(nodeId);
  return panel?.querySelector('.credential-offer-body') || panel?.querySelector('#credential-offer') || null;
}

async function renderDetail(node, gen = selectGen) {
  if (gen !== selectGen) return;
  const panel = resultPanel(node.id);
  const host = panel?.querySelector('.result-detail');
  if (!host) return;
  clearOtherNodeDetails(node.id);
  host.id = 'node-detail';
  host.replaceChildren();
  const resultHeadingId = `${domId(node.id)}-heading`;
  host.setAttribute('aria-labelledby', resultHeadingId);

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

  const heading = field('h3', { className: 'h6 mt-3', id: 'artifacts-heading' }, t('artifacts.heading'));
  const artifactsHost = field('div', { id: 'node-artifacts' });
  artifactsHost.setAttribute('aria-labelledby', 'artifacts-heading');
  const accordion = createDetailAccordion({
    id: 'detail-accordion',
    labelledBy: 'artifacts-heading',
  });
  artifactsHost.appendChild(accordion);
  body.append(heading, artifactsHost);
  const nodeArtifacts = artifactsForNode(node, state.dump);
  const dumpArtifacts =
    node.kind === 'credential' ? nodeArtifacts.filter((art) => !isIssuerWellKnownArtifact(art)) : nodeArtifacts;
  renderArtifacts(artifactsHost, dumpArtifacts, t, {
    accordion,
    heading: false,
  });

  host.appendChild(body);

  if (node.kind !== 'credential') return;
  if (gen !== selectGen) return;

  const issuer = appendDetailAccordionItem(accordion, {
    id: 'credential-issuer',
    className: 'credential-issuer',
    title: t('issuer.heading'),
    headingId: 'issuer-heading',
    toggleId: 'credential-issuer-toggle',
    panelId: 'credential-issuer-panel',
  });
  renderCredentialIssuer(issuer.body, node, { heading: false });

  const example = appendDetailAccordionItem(accordion, {
    id: 'credential-example',
    className: 'credential-example',
    title: t('example.heading'),
    headingId: 'example-heading',
    toggleId: 'credential-example-toggle',
    panelId: 'credential-example-panel',
  });

  const offer = appendDetailAccordionItem(accordion, {
    id: 'credential-offer',
    className: 'credential-offer',
    title: t('offer.heading'),
    headingId: 'offer-heading',
    toggleId: 'credential-offer-toggle',
    panelId: 'credential-offer-panel',
  });
  const offerShell = buildOfferShell({ heading: false });
  offer.body.appendChild(offerShell);
  bindOfferForm(node, offerShell);
  await Promise.all([
    renderCredentialExample(example.body, node, { heading: false }),
    refreshOffer(node, offerShell),
  ]);
  if (gen !== selectGen) return;
}

function buildOfferShell(options = {}) {
  const withHeading = options.heading !== false;
  const box = field('div', {
    className: withHeading ? 'credential-offer mt-3' : 'credential-offer-body',
  });
  if (withHeading) {
    box.id = 'credential-offer';
    box.setAttribute('aria-labelledby', 'offer-heading');
    box.append(
      field('h3', { className: 'h6', id: 'offer-heading' }, t('offer.heading')),
      field('p', { className: 'small', id: 'offer-disclaimer' }, t('offer.disclaimer')),
    );
  } else {
    box.setAttribute('aria-labelledby', 'offer-heading');
    box.append(field('p', { className: 'small', id: 'offer-disclaimer' }, t('offer.disclaimer')));
  }

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
    field('p', { className: 'form-text', id: 'offer-decrypt-hint' }, t('offer.decryptHint')),
  );
  const decryptDetails = field('details', { id: 'offer-decrypt-help', className: 'offer-decrypt-help mb-3' });
  decryptDetails.append(
    field('summary', { id: 'offer-decrypt-summary' }, t('offer.decryptSummary')),
    field('p', { className: 'form-text', id: 'offer-decrypt-body' }, t('offer.decryptHelp')),
    field('pre', { id: 'offer-decrypt-command', className: 'artifact-pre offer-decrypt-command' }),
  );
  keyWrap.append(decryptDetails);
  fieldset.append(objWrap, keyWrap);
  form.append(fieldset);
  form.addEventListener('submit', (ev) => ev.preventDefault());

  const urnLabel = field('p', { className: 'small mb-1', id: 'offer-urn-label' }, t('offer.urn'));
  const urn = field('code', { id: 'offer-urn', className: 'd-block text-break mb-3' });
  const decLabel = field('p', { className: 'small mb-1', id: 'offer-decrypted-label' }, t('offer.decrypted'));
  const decrypted = field('code', { id: 'offer-decrypted', className: 'd-block text-break mb-3' });
  decrypted.hidden = true;
  decLabel.hidden = true;
  const jsonLabel = field('p', { className: 'small mb-1', id: 'offer-json-label' }, t('offer.json'));
  const jsonPre = field('pre', { id: 'offer-json', className: 'artifact-pre offer-json' });
  const derived = field('p', { id: 'offer-derived', className: 'form-text' });
  derived.hidden = true;
  const err = field('p', { id: 'offer-enc-error', className: 'text-danger small', role: 'alert' });
  err.hidden = true;

  const urlLabel = field('h4', { className: 'h6 mt-3 mb-1', id: 'offer-url-label' }, t('offer.url'));
  const link = field('a', { id: 'offer-link', className: 'd-block text-break mb-2', href: '#' });
  link.setAttribute('aria-labelledby', 'offer-url-label');
  const haip = field('a', { id: 'offer-link-haip', className: 'visually-hidden', href: '#' }, 'haip');
  const qrLabel = field('h4', { className: 'h6 mt-3 mb-2', id: 'offer-qr-label' }, t('offer.qr'));
  const qr = field('img', { id: 'offer-qr', className: 'offer-qr', width: '192', height: '192', alt: '' });
  qr.setAttribute('aria-labelledby', 'offer-qr-label');

  box.append(form, urnLabel, urn, decLabel, decrypted, jsonLabel, jsonPre, derived, err, urlLabel, link, haip, qrLabel, qr);
  return box;
}

function previewMismatchValue(value) {
  if (value == null || value === '') return '';
  const text = String(value);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

function formatIssuerMismatch(mismatch) {
  const vars = {
    url: mismatch.url || '',
    path: mismatch.path || '',
    left: previewMismatchValue(mismatch.left),
    right: previewMismatchValue(mismatch.right),
    iss: previewMismatchValue(mismatch.left),
    sub: previewMismatchValue(mismatch.right),
    value: previewMismatchValue(mismatch.left || mismatch.right),
  };
  if (mismatch.code === 'missing-credential-issuer') return t('issuer.mismatchMissingIssuer', vars);
  if (mismatch.code === 'missing-federation') return t('issuer.mismatchMissingFederation', vars);
  if (mismatch.code === 'missing-nested-oci') return t('issuer.mismatchMissingNested');
  if (mismatch.code === 'iss-sub') return t('issuer.mismatchIssSub', vars);
  if (mismatch.code === 'issuer-id') return t('issuer.mismatchIssuerId', vars);
  if (mismatch.code === 'only-issuer') return t('issuer.mismatchOnlyIssuer', vars);
  if (mismatch.code === 'only-federation') return t('issuer.mismatchOnlyFederation', vars);
  return t('issuer.mismatchField', vars);
}

function renderCredentialIssuer(host, node, options = {}) {
  host.replaceChildren();
  if (options.heading !== false) {
    host.setAttribute('aria-labelledby', 'issuer-heading');
    host.appendChild(field('h3', { className: 'h6', id: 'issuer-heading' }, t('issuer.heading')));
  }
  const groups = issuerWellKnownGroupsForCredential(node, state.dump);
  if (!groups.length) {
    host.appendChild(field('p', { className: 'form-text', id: 'issuer-empty' }, t('issuer.empty')));
    return;
  }
  groups.forEach((group, gi) => {
    const wrap = field('div', { className: 'issuer-wellknown', id: `issuer-group-${gi}` });
    wrap.dataset.issuerId = group.issuerId;
    wrap.appendChild(
      field('p', { className: 'small mb-2', id: gi === 0 ? 'issuer-id' : `issuer-id-${gi}` }, group.issuerId),
    );
    if (group.mismatches.length) {
      const alert = field('div', {
        id: `issuer-mismatch-${gi}`,
        className: 'alert alert-warning issuer-mismatch',
        role: 'alert',
      });
      alert.append(
        field('p', { className: 'alert-heading h6 mb-1', id: `issuer-mismatch-${gi}-title` }, t('issuer.mismatchHeading')),
        field('p', { className: 'small mb-2', id: `issuer-mismatch-${gi}-lead` }, group.issuerId),
      );
      const list = field('ul', { className: 'mb-0', id: `issuer-mismatch-${gi}-list` });
      for (const mismatch of group.mismatches) {
        list.appendChild(field('li', {}, formatIssuerMismatch(mismatch)));
      }
      alert.appendChild(list);
      wrap.appendChild(alert);
    }
    if (!group.artifacts.length) {
      wrap.appendChild(
        field('p', { className: 'form-text', id: gi === 0 ? 'issuer-empty' : `issuer-empty-${gi}` }, t('issuer.empty')),
      );
    } else {
      const arts = field('div', {
        id: gi === 0 ? 'credential-issuer-artifacts' : `credential-issuer-artifacts-${gi}`,
      });
      wrap.appendChild(arts);
      renderArtifacts(arts, group.artifacts, t, {
        heading: false,
        idPrefix: gi === 0 ? 'issuer-artifact' : `issuer-artifact-${gi}`,
      });
    }
    host.appendChild(wrap);
  });
}

function renderDemoCard(model, index) {
  const style = [
    model.backgroundColor ? `--demo-card-bg: ${model.backgroundColor}` : '',
    model.textColor ? `--demo-card-fg: ${model.textColor}` : '',
    model.mutedColor ? `--demo-card-muted: ${model.mutedColor}` : '',
    model.backgroundImage ? `--demo-card-image: url("${model.backgroundImage}")` : '',
  ]
    .filter(Boolean)
    .join('; ');
  const card = field('article', {
    className: `demo-card${model.themedFromMetadata ? ' demo-card--metadata' : ''}`,
    id: `example-card-${index}`,
  });
  card.setAttribute('aria-label', model.name);
  if (style) card.setAttribute('style', style);

  const header = field('header', { className: 'demo-card-header' });
  if (model.logoUri) {
    const logo = field('img', {
      className: 'demo-card-logo',
      src: model.logoUri,
      alt: model.logoAlt || '',
      id: `example-card-${index}-logo`,
    });
    logo.referrerPolicy = 'no-referrer';
    logo.addEventListener('error', () => {
      logo.hidden = true;
    });
    header.appendChild(logo);
  }
  const titles = field('div', { className: 'demo-card-titles' });
  titles.append(
    field('p', { className: 'demo-card-name', id: `example-card-${index}-name` }, model.name),
    field('p', { className: 'demo-card-description', id: `example-card-${index}-description` }, model.description),
  );
  header.appendChild(titles);
  if (model.format) {
    header.appendChild(field('p', { className: 'demo-card-format', id: `example-card-${index}-format` }, model.format));
  }
  card.appendChild(header);

  const identity = field('div', { className: 'demo-card-identity' });
  const photo = field('div', { className: 'demo-card-photo', id: `example-card-${index}-photo` });
  photo.setAttribute('aria-hidden', 'true');
  if (model.photoSrc) {
    const img = field('img', { className: 'demo-card-photo-img', src: model.photoSrc, alt: '' });
    img.addEventListener('error', () => {
      img.remove();
      photo.textContent = model.initials;
    });
    photo.appendChild(img);
  } else {
    photo.textContent = model.initials;
  }
  const who = field('div', { className: 'demo-card-who' });
  const fullName = [model.givenName, model.familyName].filter(Boolean).join(' ');
  if (fullName) who.appendChild(field('p', { className: 'demo-card-fullname', id: `example-card-${index}-fullname` }, fullName));
  if (model.issuerName) {
    who.appendChild(field('p', { className: 'demo-card-issuer', id: `example-card-${index}-issuer` }, `${t('example.cardIssuer')}: ${model.issuerName}`));
  }
  identity.append(photo, who);
  card.appendChild(identity);

  if (model.claims.length) {
    const dl = field('dl', { className: 'demo-card-claims', id: `example-card-${index}-claims` });
    for (const claim of model.claims) {
      const wrap = field('div', { className: 'demo-card-claim' });
      const dt = field('dt', {}, claim.label);
      if (claim.description) dt.title = claim.description;
      const dd = field('dd', {});
      if (claim.boolean) dd.textContent = claim.booleanValue ? t('example.yes') : t('example.no');
      else dd.textContent = claim.value;
      wrap.append(dt, dd);
      dl.appendChild(wrap);
    }
    card.appendChild(dl);
  }

  if (model.configurationId) {
    card.appendChild(field('p', { className: 'demo-card-config', id: `example-card-${index}-config` }, model.configurationId));
  }
  return card;
}

async function renderCredentialExample(host, node, options = {}) {
  host.replaceChildren();
  host.setAttribute('aria-labelledby', 'example-heading');
  const warning = field('div', {
    id: 'example-warning',
    className: 'alert alert-warning',
    role: 'alert',
  });
  const disclaimer = field('p', { id: 'example-disclaimer', className: 'mb-0' });
  fillExampleDisclaimer(disclaimer);
  warning.append(
    field('p', { id: 'example-warning-title', className: 'alert-heading h6 mb-1' }, t('example.warningTitle')),
    disclaimer,
  );
  if (options.heading !== false) {
    host.append(field('h3', { className: 'h6', id: 'example-heading' }, t('example.heading')), warning);
  } else {
    host.append(warning);
  }
  try {
    const items = await buildDemoCredentials(node, state.dump);
    if (!items.length) {
      host.appendChild(field('p', { className: 'form-text', id: 'example-empty' }, t('example.empty')));
      return;
    }
    const models = demoCardModels(items, { dump: state.dump, node, lang: currentLang() });
    if (models.length) {
      const cards = field('div', { id: 'example-cards', className: 'example-cards' });
      cards.setAttribute('aria-labelledby', 'example-cards-heading');
      cards.append(
        field('h4', { className: 'h6', id: 'example-cards-heading' }, t('example.cardHeading')),
        field('p', { className: 'form-text', id: 'example-cards-hint' }, t('example.cardHint')),
      );
      const row = field('div', { className: 'example-cards-row', id: 'example-cards-row' });
      models.forEach((model, index) => row.appendChild(renderDemoCard(model, index)));
      cards.appendChild(row);
      host.appendChild(cards);
    }
    const artifacts = items.map((item) => {
      const artifact = item.artifact;
      artifact.excerptLabel = item.format === 'mso_mdoc' ? t('example.mdocExcerpt') : t('example.reconstructed');
      return artifact;
    });
    const arts = field('div', { id: 'credential-example-artifacts' });
    host.appendChild(arts);
    renderArtifacts(arts, artifacts, t, {
      heading: false,
      idPrefix: 'example-artifact',
    });
  } catch {
    host.appendChild(field('p', { className: 'text-danger small', id: 'example-error', role: 'alert' }, t('example.error')));
  }
}

function bindOfferForm(node, root) {
  const objectInput = root.querySelector('#offer-object-id');
  const keyInput = root.querySelector('#offer-enc-key');
  const onChange = () => {
    state.offerDraft.objectId = objectInput?.value || '';
    state.offerDraft.publicKey = keyInput?.value || '';
    window.clearTimeout(root._offerTimer);
    root._offerTimer = window.setTimeout(() => void refreshOffer(node, root), 280);
  };
  objectInput?.addEventListener('input', onChange);
  keyInput?.addEventListener('input', onChange);
}

function paintOfferHref(root, ctx, body) {
  const href = credentialOfferHref({ ...ctx, body });
  const link = root.querySelector('#offer-link');
  if (link) {
    link.href = href;
    link.textContent = href;
  }
  const haip = root.querySelector('#offer-link-haip');
  if (haip) haip.href = credentialOfferHref({ ...ctx, body, scheme: 'haip-vci' });
  return href;
}

async function refreshOffer(node, root = offerRootFor(node.id)) {
  if (!root?.isConnected) return;
  const seq = Number(root.dataset.offerSeq || '0') + 1;
  root.dataset.offerSeq = String(seq);
  const stillThis = () => root.isConnected && Number(root.dataset.offerSeq) === seq;
  const q = (id) => root.querySelector(`#${id}`);

  const ctx = offerContext(node);
  const urn = issuerStateUrn({
    authenticSourceId: ctx.authenticSourceId,
    datasetId: ctx.datasetId,
    objectId: state.offerDraft.objectId,
  });
  const urnEl = q('offer-urn');
  const errEl = q('offer-enc-error');
  if (urnEl) urnEl.textContent = urn || t('offer.urnMissing');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }

  const pendingBody = credentialOfferObject({
    credentialIssuer: ctx.credentialIssuer,
    configurationIds: ctx.configurationIds,
  });
  paintOfferHref(root, ctx, pendingBody);

  let issuerState;
  if (urn && state.offerDraft.publicKey.trim()) {
    try {
      issuerState = await encryptIssuerState(urn, state.offerDraft.publicKey);
    } catch {
      if (!stillThis()) return;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = t('offer.encryptError');
      }
    }
  }
  if (!stillThis()) return;

  const cmdEl = q('offer-decrypt-command');
  const decEl = q('offer-decrypted');
  const decLabel = q('offer-decrypted-label');
  let decrypted = '';
  if (issuerState) {
    if (cmdEl) {
      cmdEl.textContent = `node scripts/decrypt-issuer-state.mjs --jwe '${issuerState}'`;
    }
    try {
      decrypted = await decryptIssuerState(issuerState, demoEncPrivateJwkText());
    } catch {
      decrypted = '';
    }
  } else if (cmdEl) {
    cmdEl.textContent = 'node scripts/decrypt-issuer-state.mjs --jwe \'<issuer_state JWE>\'';
  }
  if (decEl) {
    decEl.textContent = decrypted;
    decEl.hidden = !decrypted;
  }
  if (decLabel) decLabel.hidden = !decrypted;
  if (!stillThis()) return;

  const body = credentialOfferObject({
    credentialIssuer: ctx.credentialIssuer,
    configurationIds: ctx.configurationIds,
    issuerState,
  });
  const jsonEl = q('offer-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(body, null, 2);
  const derived = q('offer-derived');
  if (derived) {
    derived.hidden = !ctx.configurationDerived;
    derived.textContent = t('offer.derivedIds');
  }

  const href = paintOfferHref(root, ctx, body);
  let qrData = '';
  try {
    qrData = await QRCode.toDataURL(href, { errorCorrectionLevel: 'M', margin: 1, width: 192 });
  } catch {
    qrData = '';
  }
  if (!stillThis()) return;
  const img = q('offer-qr');
  if (img && qrData) {
    img.alt = href;
    img.src = qrData;
  }
}

function rebuildGraph() {
  const keepId = state.selectedId || state.pendingNode;
  state.view?.destroy();
  state.graph = buildRegistryGraph(state.dump, { lang: currentLang() });
  els.graph.replaceChildren();
  els.graph.setAttribute('data-ready', 'false');
  exposeTestApi(new Set(state.graph.nodes.map((n) => n.id)), state.graph.documents.filter((d) => d.kind === 'credential'));
  try {
    state.view = createRegistryGraphView(els.graph, state.graph, {
      onSelect: (data) => selectNode(data.id, { fromGraph: true }),
    });
  } catch (err) {
    window.__ITW_ERROR__ = err.message || String(err);
    board.error({ url: 'graph', reason: window.__ITW_ERROR__, retry: () => rebuildGraph() });
  }
  els.graph.setAttribute('data-ready', 'true');
  els.graph.setAttribute('aria-busy', 'false');
  populateFacets();
  applyQuery(state.query, { restoreSelection: false });
  if (keepId && state.graph.byId.has(keepId)) {
    void selectNode(keepId);
    state.pendingNode = null;
  }
}

function liveCorsFaults(calls) {
  return (calls || []).some((call) => call.source === 'live' && isCorsFailure(call));
}

function syncCorsFaultUi() {
  const visible = liveCorsFaults(state.dump?.httpCalls);
  const alertEl = document.getElementById('cors-fault-alert');
  if (alertEl) {
    alertEl.hidden = !visible;
    alertEl.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  board.setCorsVisible(visible);
}

function publishBoard() {
  const calls = state.dump?.httpCalls || [];
  board.setHttpCalls(calls, { retry: retryCall });
  syncCorsFaultUi();
}

function findManifestEntry(call) {
  const endpoint = call?.endpoint || call?.url || '';
  return (state.dump?.manifest?.resources || []).find(
    (r) => r.url === endpoint || cacheLooksLike(call, r),
  );
}

function cacheLooksLike(call, entry) {
  const req = call?.requestUrl || call?.endpoint || '';
  return entry.path && req.includes(entry.path);
}

async function retryCall(call) {
  const entry = findManifestEntry(call);
  if (!entry) {
    await bootDump();
    return;
  }
  if (call?.source === 'live' || (call?.endpoint && call.endpoint.startsWith('http') && !String(call.requestUrl || '').includes('/cache/'))) {
    await retryLive(entry);
    return;
  }
  await retryDumpEntry(entry);
}

async function retryDumpEntry(entry) {
  const result = await timedFetch(entry.path ? `${import.meta.env.BASE_URL}cache/${entry.path.split('/').map(encodeURIComponent).join('/')}` : entry.url);
  result.http.endpoint = entry.url || result.http.endpoint;
  result.http.requestUrl = result.http.requestUrl;
  const idx = state.dump.httpCalls.findIndex((c) => c.endpoint === entry.url || c.requestUrl === result.http.requestUrl);
  if (idx >= 0) state.dump.httpCalls[idx] = result.http;
  else state.dump.httpCalls.push(result.http);
  if (result.http.ok && result.text != null) {
    await applyLiveBody(state.dump, entry, result.text, result.http.contentType);
    rebuildGraph();
  }
  publishBoard();
}

async function retryLive(entry) {
  const result = await fetchLiveResource(entry);
  upsertHttpCall(result.http);
  if (result.http.ok && result.text != null) {
    await applyLiveBody(state.dump, entry, result.text, result.http.contentType);
    rebuildGraph();
  }
  publishBoard();
}

function upsertHttpCall(http) {
  if (!state.dump) return;
  const idx = state.dump.httpCalls.findIndex((c) => c.endpoint === http.endpoint && c.source === http.source);
  if (idx >= 0) state.dump.httpCalls[idx] = http;
  else state.dump.httpCalls.push(http);
}

function appendTrustRows(dump) {
  const sig = dump.catalogSignature;
  if (sig && !sig.skipped) {
    dump.httpCalls.push({
      method: 'VERIFY',
      endpoint: 'credential-catalog JWT',
      status: sig.ok ? 200 : 0,
      ok: Boolean(sig.ok),
      durationMs: null,
      applicationType: 'application/jose',
      error: sig.ok ? null : sig.error,
      source: 'trust',
    });
  }
  const badIntegrity = (dump.integrity || []).filter((row) => !row.skipped && !row.ok);
  if (badIntegrity.length) {
    dump.httpCalls.push({
      method: 'SRI',
      endpoint: t('board.integrityMismatch', { n: String(badIntegrity.length) }),
      status: 0,
      ok: false,
      durationMs: null,
      applicationType: 'sha256',
      error: badIntegrity.map((row) => row.url.replace(/^https:\/\//, '')).join(', '),
      source: 'trust',
    });
  }
  const schemaNote = (dump.schemas || []).some((s) => /\/schemas\/v1\.3\.3\//.test(s.schema_uri || ''));
  if (schemaNote) {
    dump.httpCalls.push({
      method: 'NOTE',
      endpoint: t('board.schemaPathNote'),
      status: 200,
      ok: true,
      durationMs: null,
      applicationType: 'text/plain',
      error: null,
      source: 'trust',
    });
  }
}

async function probeLiveCors(baseUrl) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/.well-known/it-wallet-registry`;
  const result = await timedFetch(url, fetch, {
    headers: { Accept: 'application/json, application/jwt;q=0.9, */*;q=0.1' },
  });
  result.http.source = 'live';
  result.http.endpoint = url;
  return result.http;
}

async function startLiveRefresh(gen) {
  if (!state.dump) return;
  state.liveRefreshing = true;
  board.setPending(t('board.liveRefresh'));
  const probe = await probeLiveCors(currentEnv().baseUrl);
  if (gen !== dumpGeneration) return;
  if (isCorsFailure(probe)) {
    upsertHttpCall(probe);
    publishBoard();
  }
  const { changed, httpCalls } = await refreshDumpLive(state.dump, {
    shouldAbort: () => gen !== dumpGeneration,
    onCall: (http) => {
      if (gen !== dumpGeneration) return;
      upsertHttpCall(http);
      publishBoard();
    },
  });
  if (gen !== dumpGeneration) return;
  for (const http of httpCalls) upsertHttpCall(http);
  if (changed) rebuildGraph();
  state.liveRefreshing = false;
  board.setPending(null);
  publishBoard();
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
    catalogSignature: state.dump?.catalogSignature || null,
    understood: understoodQuery(state.query, currentLang()),
  };
  window.__ITW_CY__ = state.view?.cy || null;
}

let dumpGeneration = 0;

async function bootDump() {
  const gen = ++dumpGeneration;
  const spec = currentEnv();
  syncEnvUi();
  board.clear();
  board.setCorsVisible(false);
  const corsAlert = document.getElementById('cors-fault-alert');
  if (corsAlert) {
    corsAlert.hidden = true;
    corsAlert.setAttribute('aria-hidden', 'true');
  }
  setCacheLoading({ active: true, current: 0, total: 0 });
  const onProgress = (progress) => {
    if (gen !== dumpGeneration) return;
    if (progress.httpCalls?.length) {
      board.setHttpCalls(progress.httpCalls, { retry: retryCall });
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
      if (err.httpCalls?.length) board.setHttpCalls(err.httpCalls, { retry: retryCall });
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
      board.setHttpCalls(httpCalls, { retry: retryCall });
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
    try {
      await Promise.race([
        overlayFromIdb(dump),
        new Promise((_, reject) => setTimeout(() => reject(new Error('idb overlay timeout')), 2500)),
      ]);
    } catch {
      /* dump remains the source of truth */
    }
    try {
      await annotateDumpTrust(dump);
      appendTrustRows(dump);
    } catch {
      /* verification is best-effort */
    }
    state.dump = dump;
    syncCorsFaultUi();
    publishBoard();
    rebuildGraph();
    const liveParam = new URLSearchParams(location.search).get('live');
    const wantLive = liveParam === '1' || (liveParam !== '0' && !navigator.webdriver);
    if (wantLive) {
      const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 1));
      idle(() => {
        void startLiveRefresh(gen);
      });
    }
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
state.pendingNode = params.get('node') || null;
if (state.pendingNode) state.selectedId = state.pendingNode;
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
