/**
 * Registry → cytoscape elements + search documents.
 * Hierarchy: IT-Wallet Registry → five registers → credentials / schemas / claims / FA / taxonomy.
 */

import { issuerIdOf, issuerOptionLabel } from '../issuers/entity-id.js';

const CONTAINERS = [
  { id: 'catalog', kind: 'catalog', label: 'Catalogo', labelEn: 'Catalog' },
  { id: 'schemas', kind: 'schemas', label: 'Schemi', labelEn: 'Schemas' },
  { id: 'claims', kind: 'claims', label: 'Claims', labelEn: 'Claims' },
  { id: 'authentic_sources', kind: 'authentic_sources', label: 'Fonti autentiche', labelEn: 'Authentic sources' },
  { id: 'taxonomy', kind: 'taxonomy', label: 'Tassonomia', labelEn: 'Taxonomy' },
];

export function l10nLookup(bundles, lang, key, fallback) {
  if (!key) return fallback;
  const primary = bundles?.[lang]?.[key];
  const secondary = bundles?.[lang === 'it' ? 'en' : 'it']?.[key];
  return primary || secondary || fallback;
}

function asIdOf(source) {
  return source?.id || source?.entity_id || '';
}

function claimNamesFromCddl(text) {
  const acc = new Set();
  const re = /elementIdentifier:\s*DataElementIdentifier\s*\.enum\s*\("([^"]+)"\)/g;
  let match;
  while ((match = re.exec(String(text || '')))) {
    if (match[1]) acc.add(match[1]);
  }
  return acc;
}

function resourceForUri(dump, uri) {
  const clean = String(uri || '').split('#')[0];
  if (!clean) return null;
  return (
    (dump?.resources || []).find((r) => {
      if (r.url && String(r.url).split('#')[0] === clean) return true;
      const path = String(r.path || '');
      return path && (clean.endsWith(path) || clean.endsWith(`/${path.replace(/^[^/]+\//, '')}`));
    }) || null
  );
}

function availableClaimNames(authenticSources) {
  const acc = new Set();
  for (const as of authenticSources || []) {
    for (const cap of as.data_capabilities || []) {
      for (const claim of cap.available_claims || []) {
        if (claim.claim_name) acc.add(claim.claim_name);
      }
    }
  }
  return acc;
}

export function claimVocabulary(dump) {
  return new Set([...Object.keys(dump?.claims || {}), ...availableClaimNames(dump?.authenticSources)]);
}

export function schemaClaimNamesByType(dump) {
  const byType = new Map();
  for (const schema of dump?.schemas || []) {
    const type = schema.credential_type;
    if (!type) continue;
    const res = resourceForUri(dump, schema.schema_uri);
    const raw = res?.raw != null ? String(res.raw) : '';
    const acc = byType.get(type) || new Set();
    if (raw.includes('elementIdentifier')) {
      for (const name of claimNamesFromCddl(raw)) acc.add(name);
    }
    byType.set(type, acc);
  }
  return byType;
}

export function claimNamesFromL10n(bundles) {
  const acc = new Set();
  for (const bundle of Object.values(bundles || {})) {
    for (const key of Object.keys(bundle || {})) {
      const m = /^claim\.(.+)\.description$/.exec(key);
      if (m) acc.add(m[1]);
    }
  }
  return acc;
}

export function buildRegistryGraph(dump, { lang = 'it' } = {}) {
  const nodes = [];
  const edges = [];
  const byId = new Map();

  const addNode = (node) => {
    if (byId.has(node.id)) return byId.get(node.id);
    const full = {
      parents: [],
      legal_type: '',
      credential_type: '',
      format: '',
      domain: [],
      claim: [],
      issuer: '',
      as: '',
      text: '',
      ...node,
    };
    full.text = [full.label, full.kind, full.legal_type, full.credential_type, full.format, full.issuer, full.as, ...(full.domain || []), ...(full.claim || []), full.text]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    byId.set(full.id, full);
    nodes.push(full);
    return full;
  };

  const addEdge = (source, target, relation = 'child') => {
    if (!byId.has(source) || !byId.has(target)) return;
    const id = `e:${source}>${target}:${relation}`;
    if (edges.some((e) => e.id === id)) return;
    edges.push({ id, source, target, relation });
    const child = byId.get(target);
    if (child && !child.parents.includes(source)) child.parents.push(source);
  };

  const catalogL10n = dump.l10n?.catalog || {};
  const asL10n = dump.l10n?.authenticSources || {};
  const taxL10n = dump.l10n?.taxonomy || {};
  const claimL10n = dump.l10n?.claims || {};

  const env = dump.manifest?.env || '';
  const baseUrl = dump.manifest?.base_url || '';

  addNode({
    id: 'registry',
    kind: 'registry',
    label: 'IT-Wallet Registry',
    env,
    text: `it-wallet registry trust anchor ${env} ${baseUrl}`,
  });

  for (const c of CONTAINERS) {
    addNode({
      id: c.id,
      kind: c.kind,
      label: lang === 'en' ? c.labelEn : c.label,
    });
    addEdge('registry', c.id);
  }

  const credentials = dump.catalog?.credentials || [];
  const schemaRows = dump.schemas || [];
  const authenticSources = dump.authenticSources || [];
  const claimDefs = dump.claims || {};
  const schemaClaimsByType = schemaClaimNamesByType(dump);
  const parentLinks = [];

  const addClaimNode = (name) => {
    if (!name) return '';
    const cid = `claim:${name}`;
    addNode({
      id: cid,
      kind: 'claim',
      label: name,
      claim: [name],
      text: [name, l10nLookup(claimL10n, lang, `claim.${name}.description`, '')].join(' '),
    });
    addEdge('claims', cid);
    return cid;
  };

  const vocabulary = new Set([...Object.keys(claimDefs), ...availableClaimNames(authenticSources)]);
  if (!vocabulary.size) {
    for (const name of claimNamesFromL10n(claimL10n)) vocabulary.add(name);
  }
  for (const name of vocabulary) addClaimNode(name);

  for (const cred of credentials) {
    const type = cred.credential_type;
    const id = `credential:${type}`;
    const nameKey = cred.credential_name_l10n_id || `${type}.name`;
    const issuerTokens = [];
    const asTokens = [];
    const claimTokens = [];
    const credNode = addNode({
      id,
      kind: 'credential',
      label: l10nLookup(catalogL10n, lang, nameKey, type),
      credential_type: type,
      legal_type: cred.legal_type || '',
      domain: cred.domains || [],
      class: cred.classes || [],
      purpose: cred.purposes || [],
      text: [type, cred.legal_type, ...(cred.domains || []), ...(cred.classes || []), ...(cred.purposes || [])].join(' '),
    });
    addEdge('catalog', id);

    for (const issuer of cred.issuers || []) {
      const iid = issuerIdOf(issuer);
      if (!iid) continue;
      const nid = `issuer:${iid}`;
      issuerTokens.push(iid, issuer.organization_code, issuer.organization_name_l10n_id);
      addNode({
        id: nid,
        kind: 'issuer',
        label: l10nLookup(catalogL10n, lang, issuer.organization_name_l10n_id, issuer.organization_code || iid),
        legal_type: issuer.legal_type || '',
        issuer: [iid, issuer.organization_code, issuer.organization_name_l10n_id].filter(Boolean).join(' '),
        homepage: issuer.homepage_uri,
        entity_id: iid,
        text: [iid, issuer.organization_code, issuer.legal_type, 'issuer emittente'].join(' '),
      });
      addEdge(id, nid, 'issued-by');
    }

    for (const source of cred.authentic_sources || []) {
      const sid = asIdOf(source);
      if (!sid) continue;
      const nid = `as:${sid}`;
      asTokens.push(sid);
      const asRow = authenticSources.find((a) => asIdOf(a) === sid);
      for (const cap of asRow?.data_capabilities || []) {
        for (const claim of cap.available_claims || []) {
          if (claim.claim_name) claimTokens.push(claim.claim_name);
        }
      }
      addNode({
        id: nid,
        kind: 'authentic_source',
        label: l10nLookup(
          asL10n,
          lang,
          asRow?.organization_info?.organization_name_l10n_id,
          sid.replace(/^https:\/\//, ''),
        ),
        as: sid,
        dataset_id: source.dataset_id,
        entity_id: sid,
        text: [sid, source.dataset_id, 'authentic source fonte'].join(' '),
      });
      addEdge(id, nid, 'sourced-from');
    }
    for (const name of schemaClaimsByType.get(type) || []) {
      if (vocabulary.has(name)) claimTokens.push(name);
    }
    credNode.issuer = [...new Set(issuerTokens.filter(Boolean))].join(' ');
    credNode.as = [...new Set(asTokens.filter(Boolean))].join(' ');
    credNode.claim = [...new Set(claimTokens.filter(Boolean))];
    credNode.text = [credNode.text, credNode.issuer, credNode.as, ...credNode.claim].filter(Boolean).join(' ');
    for (const name of credNode.claim) {
      const cid = addClaimNode(name);
      if (cid) addEdge(id, cid, 'has-claim');
    }

    for (const parent of cred.parent_credentials || []) {
      parentLinks.push([`credential:${parent}`, id]);
    }

    for (const domain of cred.domains || []) {
      const did = `domain:${domain}`;
      addNode({
        id: did,
        kind: 'domain',
        label: l10nLookup(taxL10n, lang, `domain.${domain.toLowerCase()}.name`, domain),
        domain: [domain],
        text: domain,
      });
      addEdge('taxonomy', did);
      addEdge(id, did, 'in-domain');
    }
  }

  for (const [parentId, childId] of parentLinks) {
    if (byId.has(parentId)) addEdge(parentId, childId, 'parent');
  }

  for (const schema of schemaRows) {
    const id = `schema:${schema.id}`;
    addNode({
      id,
      kind: 'schema',
      label: `${schema.credential_type} (${schema.format})`,
      credential_type: schema.credential_type,
      format: schema.format,
      schema_id: schema.id,
      schema_uri: schema.schema_uri,
      text: [schema.id, schema.credential_type, schema.format, schema.description, schema.vct, schema.docType]
        .filter(Boolean)
        .join(' '),
    });
    addEdge('schemas', id);
    if (schema.credential_type) addEdge(`credential:${schema.credential_type}`, id, 'has-schema');
  }

  for (const as of authenticSources) {
    const sid = asIdOf(as);
    const nid = `as:${sid}`;
    if (!byId.has(nid)) {
      addNode({
        id: nid,
        kind: 'authentic_source',
        label: l10nLookup(asL10n, lang, as.organization_info?.organization_name_l10n_id, sid),
        as: sid,
        entity_id: sid,
        text: sid,
      });
      addEdge('authentic_sources', nid);
    } else {
      addEdge('authentic_sources', nid);
    }
    for (const cap of as.data_capabilities || []) {
      for (const claim of cap.available_claims || []) {
        const cid = addClaimNode(claim.claim_name);
        if (cid) addEdge(nid, cid, 'provides');
      }
    }
  }

  const taxonomy = dump.taxonomy;
  if (taxonomy?.domains) {
    for (const domain of taxonomy.domains) {
      const did = `domain:${domain.id}`;
      addNode({
        id: did,
        kind: 'domain',
        label: l10nLookup(taxL10n, lang, domain.name_l10n_id, domain.id),
        domain: [domain.id],
        text: domain.id,
      });
      addEdge('taxonomy', did);
      for (const cls of domain.classes || []) {
        const cid = `class:${cls.id}`;
        addNode({
          id: cid,
          kind: 'class',
          label: l10nLookup(taxL10n, lang, cls.name_l10n_id, cls.id),
          domain: [domain.id],
          class: [cls.id],
          text: cls.id,
        });
        addEdge(did, cid);
      }
    }
  }

  const documents = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    legal_type: n.legal_type || '',
    type: n.credential_type || n.kind,
    credential_type: n.credential_type || '',
    claim: Array.isArray(n.claim) ? n.claim.join(' ') : n.claim || '',
    issuer: n.issuer || n.entity_id || '',
    as: n.as || '',
    format: n.format || '',
    domain: (n.domain || []).join(' '),
    env: n.env || '',
    text: n.text,
  }));

  return { nodes, edges, byId, documents };
}

function uniqueByValue(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    out.push(item);
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function facetOptions(graph) {
  const issuers = [];
  const sources = [];
  const claims = [];
  const legalTypes = [];
  for (const n of graph?.nodes || []) {
    if (n.legal_type) legalTypes.push({ value: n.legal_type, label: n.legal_type });
    if (n.kind === 'issuer' && n.entity_id) {
      issuers.push({ value: n.entity_id, label: issuerOptionLabel(n.label, n.entity_id) });
    }
    if (n.kind === 'authentic_source' && (n.entity_id || n.as)) {
      const value = n.entity_id || n.as;
      sources.push({ value, label: n.label || value });
    }
    if (n.kind === 'claim') {
      const value = Array.isArray(n.claim) && n.claim[0] ? n.claim[0] : n.label;
      if (value) claims.push({ value, label: value });
    }
  }
  return {
    legal_type: uniqueByValue(legalTypes),
    issuer: uniqueByValue(issuers),
    as: uniqueByValue(sources),
    claim: uniqueByValue(claims),
  };
}

export function toCytoscapeElements(graph) {
  return [
    ...graph.nodes.map((n) => ({ data: { ...n } })),
    ...graph.edges.map((e) => ({ data: e })),
  ];
}

export function visibleClosure(graph, matchedIds) {
  const vis = new Set(matchedIds);
  const byId = graph.byId;
  const walkAncestors = (id) => {
    const node = byId.get(id);
    if (!node) return;
    for (const parent of node.parents || []) {
      if (!vis.has(parent)) {
        vis.add(parent);
        walkAncestors(parent);
      }
    }
  };
  for (const id of [...matchedIds]) {
    walkAncestors(id);
    const node = byId.get(id);
    if (node?.kind === 'credential') {
      for (const e of graph.edges) {
        if (e.source === id && (e.relation === 'issued-by' || e.relation === 'sourced-from' || e.relation === 'has-schema' || e.relation === 'in-domain' || e.relation === 'has-claim')) {
          vis.add(e.target);
        }
      }
    }
  }
  vis.add('registry');
  return vis;
}
