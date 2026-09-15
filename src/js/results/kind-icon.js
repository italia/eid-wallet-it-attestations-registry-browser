/** Bootstrap Italia sprite ids for search-result kinds. */

import KIND_ICONS from './kind-icons.json' with { type: 'json' };

export { KIND_ICONS };

export function kindIconId(kind) {
  return KIND_ICONS[kind] || 'it-file';
}

export function kindLabelKey(kind) {
  return `kind.${kind}`;
}
