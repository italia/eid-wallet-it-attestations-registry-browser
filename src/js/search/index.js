const FIELD_ALIASES = {
  type: 'type',
  kind: 'kind',
  credential_type: 'credential_type',
  legal_type: 'legal_type',
  legal: 'legal_type',
  claim: 'claim',
  attr: 'claim',
  attribute: 'claim',
  issuer: 'issuer',
  emittente: 'issuer',
  as: 'as',
  source: 'as',
  fa: 'as',
  authentic_source: 'as',
  format: 'format',
  domain: 'domain',
  schema: 'id',
  env: 'env',
};

const ALIAS_GROUPS = {
  legal_type: ['legal_type', 'legal'],
  issuer: ['issuer', 'emittente'],
  as: ['as', 'source', 'fa', 'authentic_source'],
  claim: ['claim', 'attr', 'attribute'],
};

function tokenize(query) {
  const tokens = [];
  const re = /([+-])?([A-Za-z_]+):(?:"([^"]*)"|(\S+))|"([^"]+)"|([+-])?(\S+)/g;
  let m;
  while ((m = re.exec(query))) {
    if (m[2]) {
      tokens.push({
        kind: 'field',
        field: FIELD_ALIASES[m[2].toLowerCase()] || m[2].toLowerCase(),
        value: m[3] != null ? m[3] : m[4],
        sign: m[1] || '',
      });
    } else if (m[5] != null) {
      tokens.push({ kind: 'phrase', value: m[5], sign: '' });
    } else {
      tokens.push({
        kind: 'term',
        field: null,
        value: m[7],
        sign: m[6] || '',
      });
    }
  }
  return tokens;
}

export function parseQuery(query) {
  const q = String(query || '').trim();
  if (!q) return { empty: true, tokens: [] };
  return { empty: false, tokens: tokenize(q) };
}

export function quoteFieldValue(value) {
  const v = String(value);
  if (/[\s"']/.test(v) || v.includes('://')) return `"${v.replace(/"/g, '')}"`;
  return v;
}

export function setQueryField(query, field, value) {
  const names = ALIAS_GROUPS[field] || [field];
  const pattern = new RegExp(`(?:^|\\s)(?:[+-])?(?:${names.join('|')}):(?:"[^"]*"|\\S+)`, 'gi');
  let q = String(query || '').replace(pattern, ' ').replace(/\s+/g, ' ').trim();
  if (value) {
    const token = `${field}:${quoteFieldValue(value)}`;
    q = q ? `${q} ${token}` : token;
  }
  return q;
}

export function getQueryField(query, field) {
  const parsed = parseQuery(query);
  const tok = [...parsed.tokens].reverse().find((t) => t.kind === 'field' && t.field === field);
  return tok ? String(tok.value) : '';
}

function fieldValue(doc, field) {
  const v = doc[field];
  if (Array.isArray(v)) return v.join(' ').toLowerCase();
  return String(v ?? '').toLowerCase();
}

function haystack(doc) {
  return `${doc.text || ''} ${doc.label || ''} ${doc.id || ''}`.toLowerCase();
}

export function documentMatches(doc, parsed) {
  if (!parsed || parsed.empty) return true;
  const hay = haystack(doc);
  for (const tok of parsed.tokens) {
    const value = String(tok.value || '').replace(/\*$/, '').toLowerCase();
    if (!value || value === 'or' || value === 'and') continue;
    let hit;
    if (tok.kind === 'field') {
      hit = fieldValue(doc, tok.field).includes(value) || hay.includes(`${tok.field}:${value}`);
    } else {
      hit = hay.includes(value);
    }
    if (tok.sign === '+' && !hit) return false;
    if (tok.sign === '-' && hit) return false;
    if (!tok.sign && tok.kind !== 'field' && !hit) {
      // AND of unsigned terms
      return false;
    }
    if (!tok.sign && tok.kind === 'field' && !hit) return false;
    if (tok.kind === 'phrase' && !hit) return false;
  }
  return true;
}

export function searchDocuments(documents, query) {
  const parsed = parseQuery(query);
  if (parsed.empty) return documents;
  return documents.filter((doc) => documentMatches(doc, parsed));
}

export function matchedNodeIds(graph, query) {
  return new Set(searchDocuments(graph.documents, query).map((d) => d.id));
}
