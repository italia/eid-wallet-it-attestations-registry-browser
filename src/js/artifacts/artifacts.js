/** Resolve dump resources to show when an entity is selected. */

import { renderJsonTree, tryParseJson } from './json-tree.js';
import { configurationIdsFor, configurationIdsFromMetadata } from '../offer/offer.js';
import { canonicalizeIssuerEntityId, issuerIdOf, issuerWellKnownUrl } from '../issuers/entity-id.js';

function findResource(dump, predicate) {
  return (dump?.resources || []).find(predicate) || null;
}

function resourceByPath(dump, fragment) {
  return findResource(
    dump,
    (r) =>
      ((r.path || '').includes(fragment) || (r.url || '').includes(fragment)) &&
      !(r.path || '').includes('/l10n/') &&
      !(r.url || '').includes('/l10n/'),
  );
}

function resourceByUrl(dump, url) {
  if (!url) return null;
  const clean = String(url).split('#')[0];
  return findResource(dump, (r) => r.url === clean || (r.path && clean.endsWith(r.path.replace(/^\//, ''))));
}

function pretty(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function fromResource(res, extras = {}) {
  if (!res) return null;
  return {
    title: extras.title || res.kind || res.url || res.path,
    url: res.url || '',
    path: res.path || '',
    contentType: res.content_type || '',
    jwt: Boolean(res.jwt),
    raw: res.raw ?? null,
    header: res.header ?? null,
    payload: res.jwt ? res.json : res.json,
    excerpt: extras.excerpt ?? null,
    excerptTitle: extras.excerptTitle || '',
  };
}

function asIdOf(source) {
  return source?.id || source?.entity_id || '';
}

const JOSE_METADATA_NOISE = new Set(['iat', 'exp', 'nbf', 'jti']);

function issuerMetadataUrl(issuerId) {
  return issuerWellKnownUrl(issuerId, 'openid-credential-issuer');
}

function issuerFederationUrl(issuerId) {
  return issuerWellKnownUrl(issuerId, 'openid-federation');
}

function dumpedIssuerIds(dump) {
  return new Set([
    ...Object.keys(dump?.issuerMetadata || {}),
    ...Object.keys(dump?.issuerFederation || {}),
  ]);
}

function issuerHasDump(dump, issuerId) {
  const id = canonicalizeIssuerEntityId(issuerId);
  if (!id) return false;
  if (dump?.issuerMetadata?.[id] || dump?.issuerFederation?.[id]) return true;
  const oci = issuerMetadataUrl(id);
  const fed = issuerFederationUrl(id);
  return (dump?.resources || []).some(
    (r) => !r.error && (r.url === oci || r.url === fed) && (r.bytes == null || r.bytes > 0),
  );
}

function issuerDocScore(dump, issuerId, credentialType, formats) {
  const doc = dump?.issuerMetadata?.[issuerId] || dump?.issuerFederation?.[issuerId];
  const meta = openidCredentialIssuerMetadata(doc);
  if (!meta) return 0;
  if (credentialType) return configurationIdsFromMetadata(meta, credentialType, formats).ids.length;
  const supported = meta.credential_configurations_supported;
  return supported && typeof supported === 'object' ? Object.keys(supported).length : 0;
}

/** Catalog issuer id, or a dumped issuer whose OpenID4VCI metadata covers the credential. */
export function resolveDumpedIssuerId(dump, preferredId, { credentialType, formats = [] } = {}) {
  const preferred = canonicalizeIssuerEntityId(preferredId);
  if (preferred && issuerHasDump(dump, preferred)) return preferred;
  let best = '';
  let bestScore = 0;
  for (const id of dumpedIssuerIds(dump)) {
    const score = issuerDocScore(dump, id, credentialType, formats);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return bestScore > 0 ? best : preferred;
}

function wellKnownResource(dump, issuerId, name, kind) {
  const url = issuerWellKnownUrl(issuerId, name);
  if (!url) return null;
  const res =
    findResource(
      dump,
      (r) =>
        !r.error &&
        r.kind === kind &&
        (r.url === url || String(r.url || '').replace(/\/$/, '') === url),
    ) || resourceByUrl(dump, url);
  if (!res || res.error) return null;
  return res;
}

function issuerMetadataResource(dump, issuerId) {
  return wellKnownResource(dump, issuerId, 'openid-credential-issuer', 'issuer-metadata');
}

function issuerFederationResource(dump, issuerId) {
  return wellKnownResource(dump, issuerId, 'openid-federation', 'issuer-federation');
}

function previewValue(value) {
  if (value == null) return '';
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return String(value);
  }
}

/** OpenID4VCI object from a credential-issuer document or a federation entity configuration. */
export function openidCredentialIssuerMetadata(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const nested = doc.metadata?.openid_credential_issuer;
  if (nested && typeof nested === 'object') return nested;
  if (doc.credential_issuer || doc.credential_configurations_supported) {
    const out = { ...doc };
    for (const key of JOSE_METADATA_NOISE) delete out[key];
    return out;
  }
  return null;
}

function diffJson(left, right, path, out) {
  if (left === right) return;
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftArr = Array.isArray(left);
    const rightArr = Array.isArray(right);
    if (leftArr !== rightArr) {
      out.push({
        code: 'field',
        path: path || '/',
        left: previewValue(left),
        right: previewValue(right),
      });
      return;
    }
    if (leftArr) {
      if (left.length !== right.length) {
        out.push({
          code: 'field',
          path: path || '/',
          left: previewValue(left),
          right: previewValue(right),
        });
      }
      const n = Math.min(left.length, right.length);
      for (let i = 0; i < n; i += 1) diffJson(left[i], right[i], `${path}[${i}]`, out);
      return;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in left)) {
        out.push({ code: 'only-federation', path: next, right: previewValue(right[key]) });
      } else if (!(key in right)) {
        out.push({ code: 'only-issuer', path: next, left: previewValue(left[key]) });
      } else {
        diffJson(left[key], right[key], next, out);
      }
    }
    return;
  }
  out.push({
    code: 'field',
    path: path || '/',
    left: previewValue(left),
    right: previewValue(right),
  });
}

export function compareIssuerWellKnown(ociDoc, fedDoc, { ociUrl, fedUrl } = {}) {
  const mismatches = [];
  if (!ociDoc) mismatches.push({ code: 'missing-credential-issuer', url: ociUrl || '' });
  if (!fedDoc) mismatches.push({ code: 'missing-federation', url: fedUrl || '' });
  if (!ociDoc || !fedDoc) return mismatches;

  const oci = openidCredentialIssuerMetadata(ociDoc);
  const nested = fedDoc.metadata?.openid_credential_issuer;
  if (!nested) mismatches.push({ code: 'missing-nested-oci' });

  const iss = fedDoc.iss || '';
  const sub = fedDoc.sub || '';
  const ociId = oci?.credential_issuer || '';
  const nestedId = nested?.credential_issuer || '';
  if (iss && sub && iss !== sub) {
    mismatches.push({ code: 'iss-sub', path: 'iss/sub', left: iss, right: sub });
  }
  if (ociId && iss && ociId !== iss) {
    mismatches.push({
      code: 'issuer-id',
      path: 'credential_issuer vs iss',
      left: ociId,
      right: iss,
    });
  } else if (ociId && sub && ociId !== sub) {
    mismatches.push({
      code: 'issuer-id',
      path: 'credential_issuer vs sub',
      left: ociId,
      right: sub,
    });
  }
  if (ociId && nestedId && ociId !== nestedId) {
    mismatches.push({
      code: 'issuer-id',
      path: 'credential_issuer',
      left: ociId,
      right: nestedId,
    });
  }

  if (oci && nested) diffJson(oci, nested, '', mismatches);
  return mismatches;
}

function artifactFromWellKnown(res, metadata, { title, url, excerpt, excerptTitle, excerptLabel, config }) {
  const item = res
    ? fromResource(res, { title, excerpt, excerptTitle })
    : metadata
      ? {
          title,
          url,
          path: '',
          contentType: 'application/json',
          jwt: false,
          raw: pretty(metadata),
          header: null,
          payload: metadata,
          excerpt,
          excerptTitle,
        }
      : null;
  if (!item) return null;
  if (!item.url) item.url = url;
  item.showDecoded = !item.jwt;
  if (config) {
    item.configurationIds = config.ids;
    item.configurationDerived = config.derived;
  }
  if (excerptLabel) item.excerptLabel = excerptLabel;
  return item;
}

function credentialFormats(dump, credentialType) {
  return (dump?.schemas || [])
    .filter((row) => row.credential_type === credentialType)
    .map((row) => row.format)
    .filter(Boolean);
}

function configurationExcerpt(metadata, ids) {
  const supported = metadata?.credential_configurations_supported;
  if (!supported || typeof supported !== 'object' || !ids?.length) return null;
  const excerpt = {};
  for (const id of ids) {
    if (supported[id]) excerpt[id] = supported[id];
  }
  return Object.keys(excerpt).length ? excerpt : null;
}

export function issuerWellKnownGroupsForCredential(node, dump) {
  if (!node || node.kind !== 'credential' || !dump) return [];
  const cred = (dump.catalog?.credentials || []).find((c) => c.credential_type === node.credential_type);
  if (!cred) return [];
  const formats = credentialFormats(dump, node.credential_type);
  const groups = [];
  for (const issuer of cred.issuers || []) {
    const catalogId = issuerIdOf(issuer);
    const iid = resolveDumpedIssuerId(dump, catalogId, {
      credentialType: node.credential_type,
      formats,
    });
    if (!iid) continue;
    const ociUrl = issuerMetadataUrl(iid);
    const fedUrl = issuerFederationUrl(iid);
    const ociRes = issuerMetadataResource(dump, iid);
    const fedRes = issuerFederationResource(dump, iid);
    const ociDoc = dump.issuerMetadata?.[iid] || ociRes?.json || null;
    const fedDoc = dump.issuerFederation?.[iid] || fedRes?.json || null;
    const ociMeta = openidCredentialIssuerMetadata(ociDoc);
    const fedMeta = openidCredentialIssuerMetadata(fedDoc);
    const config = configurationIdsFor(node.credential_type, formats, ociMeta || fedMeta);
    const excerptLabel = config.ids.length
      ? `credential_configuration_id · ${config.ids.join(', ')}`
      : '';
    const excerptTitle = config.ids.join(', ') || iid;
    const artifacts = [];
    const ociArt = artifactFromWellKnown(ociRes, ociDoc, {
      title: 'openid-credential-issuer',
      url: ociUrl,
      excerpt: configurationExcerpt(ociMeta, config.ids),
      excerptTitle,
      excerptLabel,
      config,
    });
    const fedArt = artifactFromWellKnown(fedRes, fedDoc, {
      title: 'openid-federation',
      url: fedUrl,
      excerpt: configurationExcerpt(fedMeta, config.ids),
      excerptTitle,
      excerptLabel,
      config,
    });
    if (ociArt) artifacts.push(ociArt);
    if (fedArt) artifacts.push(fedArt);
    groups.push({
      issuerId: iid,
      artifacts,
      mismatches: compareIssuerWellKnown(ociDoc, fedDoc, { ociUrl, fedUrl }),
    });
  }
  return groups;
}

export function issuerMetadataArtifactsForCredential(node, dump) {
  return issuerWellKnownGroupsForCredential(node, dump).flatMap((group) => group.artifacts);
}

export function issuerWellKnownArtifactsForIssuer(issuerId, dump) {
  const iid = resolveDumpedIssuerId(dump, issuerId);
  if (!iid || !dump) return [];
  const ociUrl = issuerMetadataUrl(iid);
  const fedUrl = issuerFederationUrl(iid);
  const ociRes = issuerMetadataResource(dump, iid);
  const fedRes = issuerFederationResource(dump, iid);
  const ociDoc = dump.issuerMetadata?.[iid] || ociRes?.json || null;
  const fedDoc = dump.issuerFederation?.[iid] || fedRes?.json || null;
  const artifacts = [];
  const ociArt = artifactFromWellKnown(ociRes, ociDoc, {
    title: 'openid-credential-issuer',
    url: ociUrl,
  });
  const fedArt = artifactFromWellKnown(fedRes, fedDoc, {
    title: 'openid-federation',
    url: fedUrl,
  });
  if (ociArt) artifacts.push(ociArt);
  if (fedArt) artifacts.push(fedArt);
  return artifacts;
}

export function isIssuerWellKnownArtifact(artifact) {
  return artifact?.title === 'openid-credential-issuer' || artifact?.title === 'openid-federation';
}

export function artifactsForNode(node, dump) {
  if (!node || !dump) return [];
  const out = [];
  const add = (item) => {
    if (item) out.push(item);
  };

  const discovery = resourceByPath(dump, 'it-wallet-registry');
  const catalog = resourceByPath(dump, 'credential-catalog');
  const schemasIndex = resourceByPath(dump, '/.well-known/schemas') || resourceByPath(dump, 'well-known/schemas');
  const claimsReg = resourceByPath(dump, 'claims-registry');
  const sourcesReg = resourceByPath(dump, 'authentic-sources');
  const taxonomy = resourceByPath(dump, 'credential-taxonomy');

  switch (node.kind) {
    case 'registry':
      add(fromResource(discovery, { title: 'it-wallet-registry' }));
      break;
    case 'catalog':
      add(fromResource(catalog, { title: 'credential-catalog' }));
      break;
    case 'credential': {
      const cred = (dump.catalog?.credentials || []).find((c) => c.credential_type === node.credential_type);
      add(
        fromResource(catalog, {
          title: 'credential-catalog',
          excerpt: cred || null,
          excerptTitle: node.credential_type,
        }),
      );
      const rows = (dump.schemas || []).filter((row) => row.credential_type === node.credential_type);
      for (const row of rows) {
        const file = fromResource(resourceByUrl(dump, row.schema_uri), {
          title: row.format ? `data-model · ${row.format}` : row.schema_uri,
        });
        if (file) add(file);
      }
      for (const [i, art] of issuerMetadataArtifactsForCredential(node, dump).entries()) {
        add({ ...art, idPrefix: 'issuer-artifact', idIndex: i });
      }
      break;
    }
    case 'issuer': {
      const matches = [];
      for (const cred of dump.catalog?.credentials || []) {
        for (const issuer of cred.issuers || []) {
          if (issuerIdOf(issuer) === node.entity_id) {
            matches.push({ credential_type: cred.credential_type, issuer });
          }
        }
      }
      add(
        fromResource(catalog, {
          title: 'credential-catalog',
          excerpt: matches.length ? matches : null,
          excerptTitle: node.entity_id,
        }),
      );
      for (const [i, art] of issuerWellKnownArtifactsForIssuer(node.entity_id, dump).entries()) {
        add({ ...art, idPrefix: 'issuer-artifact', idIndex: i });
      }
      break;
    }
    case 'schemas':
      add(fromResource(schemasIndex, { title: 'schemas' }));
      break;
    case 'schema': {
      const row = (dump.schemas || []).find((s) => s.id === node.schema_id);
      add(fromResource(schemasIndex, { title: 'schemas', excerpt: row || null, excerptTitle: node.schema_id }));
      add(fromResource(resourceByUrl(dump, node.schema_uri || row?.schema_uri), { title: node.schema_uri || row?.schema_uri }));
      break;
    }
    case 'claims':
      add(fromResource(claimsReg, { title: 'claims-registry' }));
      break;
    case 'claim': {
      const name = Array.isArray(node.claim) ? node.claim[0] : node.label;
      const def = dump.claims?.[name];
      add(fromResource(claimsReg, { title: 'claims-registry', excerpt: def ? { [name]: def } : null, excerptTitle: name }));
      break;
    }
    case 'authentic_sources':
      add(fromResource(sourcesReg, { title: 'authentic-sources' }));
      break;
    case 'authentic_source': {
      const sid = node.entity_id || node.as;
      const row = (dump.authenticSources || []).find((a) => asIdOf(a) === sid);
      add(fromResource(sourcesReg, { title: 'authentic-sources', excerpt: row || null, excerptTitle: sid }));
      break;
    }
    case 'taxonomy':
      add(fromResource(taxonomy, { title: 'credential-taxonomy' }));
      break;
    case 'domain':
    case 'class': {
      const key = node.kind === 'domain' ? node.domain?.[0] : node.class?.[0];
      let excerpt = null;
      if (node.kind === 'domain') {
        excerpt = dump.taxonomy?.domains?.find((d) => d.id === key) || null;
      } else {
        for (const domain of dump.taxonomy?.domains || []) {
          const cls = (domain.classes || []).find((c) => c.id === key);
          if (cls) {
            excerpt = { domain: domain.id, class: cls };
            break;
          }
        }
      }
      add(fromResource(taxonomy, { title: 'credential-taxonomy', excerpt, excerptTitle: key }));
      break;
    }
    default:
      break;
  }

  return out.filter((a, i, arr) => arr.findIndex((b) => b.url === a.url && b.excerptTitle === a.excerptTitle) === i);
}

export function formatArtifactView(artifact, pane) {
  const value = artifactViewValue(artifact, pane);
  if (value !== null && typeof value === 'object') return pretty(value);
  return value == null ? '' : String(value);
}

export function artifactViewValue(artifact, pane) {
  if (pane === 'header') return artifact.header;
  if (pane === 'payload') return artifact.payload ?? artifact.json;
  if (pane === 'diagnostic') return artifact.diagnostic;
  if (pane === 'excerpt') return artifact.excerpt;
  if (artifact.jwt && artifact.raw) return artifact.raw;
  if (artifact.raw) {
    const parsed = tryParseJson(artifact.raw);
    return parsed.ok ? parsed.value : artifact.raw;
  }
  return artifact.payload ?? artifact.json ?? '';
}

function fillArtifactPanel(panel, artifact, paneId, t) {
  const value = artifactViewValue(artifact, paneId);
  const preferRaw = paneId === 'signed' && artifact.showDecoded && !artifact.jwt;
  const parsed = preferRaw ? { ok: false } : tryParseJson(value);
  if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
    renderJsonTree(panel, parsed.value, { t, openDepth: 1 });
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'artifact-pre';
  pre.textContent = formatArtifactView(artifact, paneId);
  panel.appendChild(pre);
}

export function createDetailAccordion({ id, labelledBy, label } = {}) {
  const accordion = document.createElement('div');
  accordion.className = 'accordion artifacts-accordion';
  if (id) accordion.id = id;
  if (labelledBy) accordion.setAttribute('aria-labelledby', labelledBy);
  else if (label) accordion.setAttribute('aria-label', label);
  return accordion;
}

export function appendDetailAccordionItem(accordion, { id, title, headingId, toggleId, panelId, className = '' } = {}) {
  const hid = headingId || `${id}-heading`;
  const pid = panelId || `${id}-panel`;
  const tid = toggleId || `${id}-toggle`;

  const item = document.createElement('div');
  item.className = `accordion-item${className ? ` ${className}` : ''}`;
  if (id) item.id = id;

  const heading = document.createElement('h4');
  heading.className = 'accordion-header';
  heading.id = hid;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'accordion-button collapsed';
  btn.id = tid;
  btn.dataset.bsToggle = 'collapse';
  btn.dataset.bsTarget = `#${pid}`;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', pid);
  btn.textContent = title;
  heading.appendChild(btn);

  const collapse = document.createElement('div');
  collapse.id = pid;
  collapse.className = 'accordion-collapse collapse';
  collapse.setAttribute('aria-labelledby', hid);

  const body = document.createElement('div');
  body.className = 'accordion-body';
  collapse.appendChild(body);
  item.append(heading, collapse);
  accordion.appendChild(item);
  return { item, heading, toggle: btn, panel: collapse, body };
}

export function renderArtifacts(container, artifacts, t, options = {}) {
  const existing = options.accordion || null;
  if (!existing) container.replaceChildren();
  if (!artifacts.length) {
    if (existing) return existing;
    const empty = document.createElement('p');
    empty.className = 'form-text';
    empty.textContent = t('artifacts.empty');
    container.appendChild(empty);
    return null;
  }

  const headingText = options.heading === false ? t('artifacts.heading') : options.heading || t('artifacts.heading');
  if (!existing && options.heading !== false) {
    const heading = document.createElement('h3');
    heading.className = 'h6 mt-3';
    heading.id = options.headingId || 'artifacts-heading';
    heading.textContent = headingText;
    container.appendChild(heading);
  }

  const defaultPrefix = options.idPrefix || 'artifact';
  const accordion =
    existing ||
    createDetailAccordion({
      id: options.accordionId || `${defaultPrefix}-accordion`,
      labelledBy: options.heading === false ? undefined : options.headingId || 'artifacts-heading',
      label: headingText,
    });

  for (const [index, artifact] of artifacts.entries()) {
    const idPrefix = artifact.idPrefix || defaultPrefix;
    const artIndex = Number.isInteger(artifact.idIndex) ? artifact.idIndex : index;
    const slot = appendDetailAccordionItem(accordion, {
      className: 'artifact-block',
      headingId: `${idPrefix}-${artIndex}-heading`,
      toggleId: `${idPrefix}-${artIndex}-toggle`,
      panelId: `${idPrefix}-${artIndex}-panel`,
      title: artifact.title,
    });
    slot.item.dataset.artifactIndex = String(artIndex);
    const body = slot.body;

    if (artifact.url) {
      const meta = document.createElement('p');
      meta.className = 'small mb-2';
      const link = document.createElement('a');
      link.href = artifact.url;
      link.rel = 'noopener';
      link.textContent = artifact.url;
      meta.appendChild(link);
      if (artifact.contentType) {
        meta.appendChild(document.createTextNode(` · ${artifact.contentType}`));
      }
      body.appendChild(meta);
    }

    const panes = [];
    if (artifact.jwt && artifact.raw) {
      panes.push(['signed', t('artifacts.signed')]);
      panes.push(['header', t('artifacts.header')]);
      panes.push(['payload', t('artifacts.payload')]);
    } else if (artifact.raw || artifact.json) {
      panes.push(['signed', t('artifacts.original')]);
      if (artifact.showDecoded && (artifact.payload || artifact.json)) {
        panes.push(['payload', t('artifacts.decoded')]);
      }
    }
    if (artifact.diagnostic) panes.push(['diagnostic', t('artifacts.diagnostic')]);
    if (artifact.excerpt) panes.push(['excerpt', artifact.excerptLabel || t('artifacts.excerpt')]);

    const tablist = document.createElement('div');
    tablist.className = 'artifact-tabs btn-group mb-2';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', artifact.title || headingText);

    const panels = document.createElement('div');
    for (const [paneId, label] of panes) {
      const tabId = `${idPrefix}-${artIndex}-${paneId}-tab`;
      const panelId = `${idPrefix}-${artIndex}-${paneId}`;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'btn btn-sm btn-outline-primary';
      tab.id = tabId;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.textContent = label;

      const panel = document.createElement('div');
      panel.id = panelId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      fillArtifactPanel(panel, artifact, paneId, t);

      const activate = () => {
        tablist.querySelectorAll('[role="tab"]').forEach((tabBtn) => {
          const on = tabBtn === tab;
          tabBtn.setAttribute('aria-selected', on ? 'true' : 'false');
          tabBtn.classList.toggle('active', on);
        });
        panels.querySelectorAll('[role="tabpanel"]').forEach((el) => {
          el.hidden = el !== panel;
        });
      };
      tab.addEventListener('click', activate);
      tablist.appendChild(tab);
      panels.appendChild(panel);
    }
    body.append(tablist, panels);
    tablist.querySelector('[role="tab"]')?.click();
  }
  if (!existing) container.appendChild(accordion);
  return accordion;
}
