/** Bootstrap Italia sprite ids for search-result kinds. */

export const KIND_ICONS = {
  credential: 'it-card',
  issuer: 'it-pa',
  authentic_source: 'it-inbox',
  authentic_sources: 'it-inbox',
  schema: 'it-file',
  schemas: 'it-files',
  claim: 'it-list',
  claims: 'it-list',
  domain: 'it-folder',
  class: 'it-bookmark',
  catalog: 'it-files',
  taxonomy: 'it-funnel',
  registry: 'it-flag',
};

export function kindIconId(kind) {
  return KIND_ICONS[kind] || 'it-file';
}

export function kindLabelKey(kind) {
  return `kind.${kind}`;
}
