/** Resolve dump resources to show when an entity is selected. */

import { renderJsonTree, tryParseJson } from './json-tree.js';

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

function issuerIdOf(issuer) {
  return issuer?.id || issuer?.entity_id || issuer?.organization_code || '';
}

function asIdOf(source) {
  return source?.id || source?.entity_id || '';
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
  if (pane === 'payload') return artifact.payload;
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
  const parsed = tryParseJson(value);
  if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
    renderJsonTree(panel, parsed.value, { t, openDepth: 1 });
    return;
  }
  const pre = document.createElement('pre');
  pre.className = 'artifact-pre';
  pre.textContent = formatArtifactView(artifact, paneId);
  panel.appendChild(pre);
}

export function renderArtifacts(container, artifacts, t) {
  container.replaceChildren();
  if (!artifacts.length) {
    const empty = document.createElement('p');
    empty.className = 'form-text';
    empty.textContent = t('artifacts.empty');
    container.appendChild(empty);
    return;
  }

  const heading = document.createElement('h3');
  heading.className = 'h6 mt-3';
  heading.id = 'artifacts-heading';
  heading.textContent = t('artifacts.heading');
  container.appendChild(heading);

  for (const [index, artifact] of artifacts.entries()) {
    const block = document.createElement('article');
    block.className = 'artifact-block';
    block.dataset.artifactIndex = String(index);

    const title = document.createElement('h4');
    title.className = 'h6 mb-1';
    title.textContent = artifact.title;
    block.appendChild(title);

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
      block.appendChild(meta);
    }

    const panes = [];
    if (artifact.jwt && artifact.raw) {
      panes.push(['signed', t('artifacts.signed')]);
      panes.push(['header', t('artifacts.header')]);
      panes.push(['payload', t('artifacts.payload')]);
    } else if (artifact.raw || artifact.json) {
      panes.push(['signed', t('artifacts.original')]);
    }
    if (artifact.excerpt) panes.push(['excerpt', t('artifacts.excerpt')]);

    const tablist = document.createElement('div');
    tablist.className = 'artifact-tabs btn-group mb-2';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', t('artifacts.heading'));

    const panels = document.createElement('div');
    for (const [paneId, label] of panes) {
      const tabId = `artifact-${index}-${paneId}-tab`;
      const panelId = `artifact-${index}-${paneId}`;
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
        tablist.querySelectorAll('[role="tab"]').forEach((btn) => {
          const on = btn === tab;
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
          btn.classList.toggle('active', on);
        });
        panels.querySelectorAll('[role="tabpanel"]').forEach((el) => {
          el.hidden = el !== panel;
        });
      };
      tab.addEventListener('click', activate);
      tablist.appendChild(tab);
      panels.appendChild(panel);
    }
    block.appendChild(tablist);
    block.appendChild(panels);
    const first = tablist.querySelector('[role="tab"]');
    first?.click();
    container.appendChild(block);
  }
}
