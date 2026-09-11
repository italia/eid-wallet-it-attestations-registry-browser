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
  class: 'class',
  purpose: 'purpose',
  schema: 'id',
  env: 'env',
};

const ALIAS_GROUPS = {
  legal_type: ['legal_type', 'legal'],
  issuer: ['issuer', 'emittente'],
  as: ['as', 'source', 'fa', 'authentic_source'],
  claim: ['claim', 'attr', 'attribute'],
};

export function quoteFieldValue(value) {
  const v = String(value);
  if (/[\s"']/.test(v) || v.includes('://')) return `"${v.replace(/"/g, '')}"`;
  return v;
}

function unescapeValue(value) {
  return String(value ?? '').replace(/\\([\\:*?"^()])/g, '$1');
}

function splitBoost(raw) {
  const text = String(raw ?? '');
  const m = text.match(/^(.*)\^(\d+(?:\.\d+)?)$/);
  if (!m) return { value: unescapeValue(text), boost: 1 };
  return { value: unescapeValue(m[1]), boost: Number(m[2]) || 1 };
}

function lex(query) {
  const tokens = [];
  const src = String(query || '');
  let i = 0;
  const peek = () => src[i];
  const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (i < src.length) {
    while (i < src.length && isWs(peek())) i += 1;
    if (i >= src.length) break;
    const c = peek();
    if (c === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (c === '+' || c === '-') {
      const sign = c;
      i += 1;
      while (i < src.length && isWs(peek())) i += 1;
      if (peek() === '(') {
        tokens.push({ kind: 'sign', sign });
        continue;
      }
      const atom = readAtom();
      if (atom) tokens.push({ ...atom, sign });
      continue;
    }
    const atom = readAtom();
    if (atom) tokens.push(atom);
  }

  function readQuoted() {
    i += 1;
    let out = '';
    while (i < src.length && peek() !== '"') {
      if (peek() === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      out += peek();
      i += 1;
    }
    if (peek() === '"') i += 1;
    return out;
  }

  function readBare() {
    let out = '';
    while (i < src.length) {
      const ch = peek();
      if (isWs(ch) || ch === '(' || ch === ')') break;
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  function readAtom() {
    if (i >= src.length) return null;
    if (peek() === '"') {
      const { value, boost } = splitBoost(readQuoted());
      return { kind: 'phrase', value, boost, sign: '' };
    }
    const start = i;
    const word = readBare();
    if (!word) return null;
    const fieldMatch = word.match(/^([A-Za-z_][A-Za-z0-9_]*):(.*)$/);
    if (fieldMatch) {
      let rawVal = fieldMatch[2];
      if (rawVal.startsWith('"')) {
        i = start + fieldMatch[1].length + 1;
        rawVal = readQuoted();
        let boost = 1;
        if (peek() === '^') {
          const rest = readBare();
          const split = splitBoost(`x${rest}`);
          boost = split.boost;
        }
        return {
          kind: 'field',
          field: FIELD_ALIASES[fieldMatch[1].toLowerCase()] || fieldMatch[1].toLowerCase(),
          value: unescapeValue(rawVal),
          boost,
          sign: '',
        };
      }
      const { value, boost } = splitBoost(rawVal);
      return {
        kind: 'field',
        field: FIELD_ALIASES[fieldMatch[1].toLowerCase()] || fieldMatch[1].toLowerCase(),
        value,
        boost,
        sign: '',
      };
    }
    if (/^or$/i.test(word)) return { kind: 'or' };
    if (/^and$/i.test(word)) return { kind: 'and' };
    const { value, boost } = splitBoost(word);
    return { kind: 'term', value, boost, sign: '' };
  }

  return tokens;
}

function parseExpr(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  function parseOr() {
    const left = parseAnd();
    const rest = [];
    while (peek()?.kind === 'or') {
      take();
      rest.push(parseAnd());
    }
    if (!rest.length) return left;
    return { type: 'or', children: [left, ...rest] };
  }

  function parseAnd() {
    const children = [];
    while (peek() && peek().kind !== 'or' && peek().kind !== 'rparen') {
      if (peek().kind === 'and') {
        take();
        continue;
      }
      children.push(parseUnary());
    }
    if (!children.length) return { type: 'and', children: [] };
    if (children.length === 1) return children[0];
    return { type: 'and', children };
  }

  function parseUnary() {
    const tok = peek();
    if (tok?.kind === 'sign') {
      take();
      const inner = parseUnary();
      return { type: 'unary', sign: tok.sign, child: inner };
    }
    return parseAtom();
  }

  function parseAtom() {
    const tok = peek();
    if (!tok) return { type: 'and', children: [] };
    if (tok.kind === 'lparen') {
      take();
      const inner = parseOr();
      if (peek()?.kind === 'rparen') take();
      return inner;
    }
    take();
    if (tok.kind === 'field') {
      return { type: 'field', field: tok.field, value: tok.value, boost: tok.boost || 1, sign: tok.sign || '' };
    }
    if (tok.kind === 'phrase') {
      return { type: 'phrase', value: tok.value, boost: tok.boost || 1, sign: tok.sign || '' };
    }
    return { type: 'term', value: tok.value, boost: tok.boost || 1, sign: tok.sign || '' };
  }

  const ast = parseOr();
  return ast;
}

export function parseQuery(query) {
  const q = String(query || '').trim();
  if (!q) return { empty: true, tokens: [], ast: { type: 'empty' } };
  const tokens = lex(q);
  const ast = parseExpr(tokens);
  return { empty: false, tokens: tokens.filter((t) => t.kind === 'field' || t.kind === 'term' || t.kind === 'phrase'), ast };
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

function escapeRe(src) {
  return String(src).replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  const src = String(pattern).toLowerCase();
  if (!/[*?]/.test(src)) return null;
  let out = '';
  for (const ch of src) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += escapeRe(ch);
  }
  return new RegExp(out);
}

function textMatches(hay, pattern, { phrase = false } = {}) {
  const p = String(pattern || '').toLowerCase();
  if (!p) return false;
  const re = globToRegExp(p);
  if (re) return re.test(hay);
  if (phrase || p.length > 4 || /[/:._-]/.test(p)) return hay.includes(p);
  return new RegExp(`(^|[^a-z0-9])${escapeRe(p)}([^a-z0-9]|$)`).test(hay);
}

function evalNode(doc, node) {
  if (!node || node.type === 'empty') return { hit: true, score: 1 };
  if (node.type === 'and') {
    let score = 0;
    for (const child of node.children) {
      const r = evalNode(doc, child);
      if (!r.hit) return { hit: false, score: 0 };
      score += r.score;
    }
    return { hit: true, score: score || 1 };
  }
  if (node.type === 'or') {
    let score = 0;
    let hit = false;
    for (const child of node.children) {
      const r = evalNode(doc, child);
      if (r.hit) {
        hit = true;
        score += r.score;
      }
    }
    return { hit, score };
  }
  if (node.type === 'unary') {
    const inner = evalNode(doc, node.child);
    if (node.sign === '-') return { hit: !inner.hit, score: inner.hit ? 0 : 1 };
    if (node.sign === '+') return inner;
    return inner;
  }

  const hay = haystack(doc);
  let hit;
  if (node.type === 'field') {
    hit = textMatches(fieldValue(doc, node.field), node.value) || textMatches(hay, `${node.field}:${node.value}`);
  } else {
    hit = textMatches(hay, node.value, { phrase: node.type === 'phrase' });
  }
  if (node.sign === '-') return { hit: !hit, score: hit ? 0 : 1 };
  if (node.sign === '+' && !hit) return { hit: false, score: 0 };
  if (!node.sign && !hit) return { hit: false, score: 0 };
  return { hit, score: hit ? node.boost || 1 : 0 };
}

export function documentMatches(doc, parsed) {
  if (!parsed || parsed.empty) return true;
  return evalNode(doc, parsed.ast).hit;
}

export function documentScore(doc, parsed) {
  if (!parsed || parsed.empty) return 1;
  const r = evalNode(doc, parsed.ast);
  return r.hit ? r.score : 0;
}

export function searchDocuments(documents, query) {
  const parsed = parseQuery(query);
  if (parsed.empty) return documents;
  return documents
    .map((doc) => ({ doc, score: documentScore(doc, parsed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.label.localeCompare(b.doc.label))
    .map((row) => row.doc);
}

export function matchedNodeIds(graph, query) {
  return new Set(searchDocuments(graph.documents, query).map((d) => d.id));
}

function describeNode(node, lang) {
  const it = lang !== 'en';
  if (!node || node.type === 'empty') return it ? 'nessun filtro' : 'no filter';
  if (node.type === 'and') {
    const parts = node.children.map((c) => describeNode(c, lang)).filter(Boolean);
    if (!parts.length) return it ? 'nessun filtro' : 'no filter';
    const joiner = it ? ' e ' : ' and ';
    return parts.length === 1 ? parts[0] : `(${parts.join(joiner)})`;
  }
  if (node.type === 'or') {
    const parts = node.children.map((c) => describeNode(c, lang)).filter(Boolean);
    const joiner = it ? ' oppure ' : ' or ';
    return `(${parts.join(joiner)})`;
  }
  if (node.type === 'unary') {
    const inner = describeNode(node.child, lang);
    if (node.sign === '-') return it ? `escludi ${inner}` : `exclude ${inner}`;
    if (node.sign === '+') return it ? `obbligatorio ${inner}` : `required ${inner}`;
    return inner;
  }
  const boost = node.boost && node.boost !== 1 ? `^${node.boost}` : '';
  if (node.type === 'field') {
    const body = `${node.field}:${node.value}${boost}`;
    if (node.sign === '-') return it ? `escludi ${body}` : `exclude ${body}`;
    return body;
  }
  const quoted = node.type === 'phrase' ? `"${node.value}"` : node.value;
  const body = `${quoted}${boost}`;
  if (node.sign === '-') return it ? `escludi ${body}` : `exclude ${body}`;
  if (node.sign === '+') return it ? `obbligatorio ${body}` : `required ${body}`;
  return body;
}

export function understoodQuery(query, lang = 'it') {
  const parsed = parseQuery(query);
  if (parsed.empty) return '';
  const it = lang !== 'en';
  const body = describeNode(parsed.ast, lang);
  return it ? `Interpretata come: ${body}` : `Understood as: ${body}`;
}
