/**
 * Placeholder graph model. Real mapping is specified in docs/GRAPH.md.
 */
export function registryToElements() {
  return [
    { data: { id: 'registry', label: 'IT-Wallet Registry', kind: 'registry' } },
    { data: { id: 'catalog', label: 'Catalog', kind: 'catalog' } },
    { data: { id: 'e-catalog', source: 'registry', target: 'catalog' } },
  ];
}
