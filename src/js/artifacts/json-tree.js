/** Pretty JSON tree with native expand/collapse of nested objects and arrays. */

export function tryParseJson(value) {
  if (value !== null && typeof value === 'object') return { ok: true, value };
  if (typeof value !== 'string') return { ok: false, value };
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { ok: false, value };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, value };
  }
}

export function jsonPreview(value) {
  if (Array.isArray(value)) return `[ ${value.length} ]`;
  if (value && typeof value === 'object') return `{ ${Object.keys(value).length} }`;
  return '';
}

function token(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function appendLiteral(parent, value) {
  if (value === null) {
    parent.appendChild(token('null', 'json-null'));
    return;
  }
  if (typeof value === 'string') {
    parent.appendChild(token(JSON.stringify(value), 'json-string'));
    return;
  }
  if (typeof value === 'boolean') {
    parent.appendChild(token(String(value), 'json-bool'));
    return;
  }
  parent.appendChild(token(JSON.stringify(value), 'json-number'));
}

function appendValue(parent, value, { depth, openDepth }) {
  if (value === null || typeof value !== 'object') {
    appendLiteral(parent, value);
    return;
  }

  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((item, i) => [i, item]) : Object.entries(value);
  if (!entries.length) {
    parent.appendChild(token(isArr ? '[]' : '{}', 'json-punct'));
    return;
  }

  const details = document.createElement('details');
  details.className = 'json-node';
  details.open = depth < openDepth;

  const summary = document.createElement('summary');
  summary.className = 'json-summary';
  summary.appendChild(token(isArr ? '[' : '{', 'json-punct'));
  const preview = token(` ${entries.length} `, 'json-preview');
  summary.appendChild(preview);
  summary.appendChild(token(isArr ? ']' : '}', 'json-punct'));
  details.appendChild(summary);

  const children = document.createElement('div');
  children.className = 'json-children';
  for (const [key, child] of entries) {
    const line = document.createElement('div');
    line.className = 'json-line';
    if (isArr) {
      line.appendChild(token(`${key}`, 'json-index'));
      line.appendChild(token(': ', 'json-punct'));
    } else {
      line.appendChild(token(JSON.stringify(key), 'json-key'));
      line.appendChild(token(': ', 'json-punct'));
    }
    appendValue(line, child, { depth: depth + 1, openDepth });
    children.appendChild(line);
  }
  details.appendChild(children);

  const closer = document.createElement('div');
  closer.className = 'json-closer';
  closer.appendChild(token(isArr ? ']' : '}', 'json-punct'));
  details.appendChild(closer);

  parent.appendChild(details);
}

export function renderJsonTree(host, value, { t, openDepth = 1 } = {}) {
  host.replaceChildren();
  host.classList.add('json-tree', 'artifact-pre');

  const toolbar = document.createElement('div');
  toolbar.className = 'json-tree-toolbar';

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'btn btn-xs btn-sm btn-outline-primary';
  expand.textContent = t('artifacts.expandAll');

  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'btn btn-xs btn-sm btn-outline-primary';
  collapse.textContent = t('artifacts.collapseAll');

  const setAll = (open) => {
    host.querySelectorAll('details.json-node').forEach((node) => {
      node.open = open;
    });
  };
  expand.addEventListener('click', () => setAll(true));
  collapse.addEventListener('click', () => setAll(false));
  toolbar.append(expand, collapse);

  const body = document.createElement('div');
  body.className = 'json-tree-body';
  appendValue(body, value, { depth: 0, openDepth });

  host.append(toolbar, body);
}
