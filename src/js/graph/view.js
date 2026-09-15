import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { toCytoscapeElements } from './model.js';

let dagreRegistered = false;
if (!dagreRegistered) {
  cytoscape.use(dagre);
  dagreRegistered = true;
}

export function graphColorsFromCss(container) {
  if (!container || typeof getComputedStyle !== 'function') return {};
  const style = getComputedStyle(container);
  const kinds = String(container.dataset.cyKinds || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const colors = {};
  for (const kind of kinds) {
    const bg = style.getPropertyValue(`--cy-${kind}-bg`).trim();
    if (!bg) continue;
    colors[kind] = {
      bg,
      color: style.getPropertyValue(`--cy-${kind}-color`).trim() || '#17324d',
      border: style.getPropertyValue(`--cy-${kind}-border`).trim() || bg,
    };
  }
  return colors;
}

function stylesheet(container) {
  const colors = graphColorsFromCss(container);
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        'font-size': 11,
        'font-family': 'Titillium Web, system-ui, sans-serif',
        'text-valign': 'center',
        'text-halign': 'center',
        width: 160,
        height: 44,
        shape: 'round-rectangle',
        'border-width': 1,
        'overlay-padding': 4,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'line-color': '#5C6F82',
        'target-arrow-color': '#5C6F82',
      },
    },
    ...Object.entries(colors).map(([kind, c]) => ({
      selector: `node[kind = "${kind}"]`,
      style: {
        'background-color': c.bg,
        color: c.color,
        'border-color': c.border || c.bg,
      },
    })),
    {
      selector: 'node:selected',
      style: { 'border-width': 3, 'border-color': '#003366' },
    },
  ];
}

export function createRegistryGraphView(container, graph, { onSelect } = {}) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cy = cytoscape({
    container,
    elements: toCytoscapeElements(graph),
    style: stylesheet(container),
    minZoom: 0.2,
    maxZoom: 2.5,
    autoungrabify: false,
    autounselectify: false,
    userPanningEnabled: true,
    userZoomingEnabled: true,
    pixelRatio: 'auto',
  });

  const runLayout = (eles = cy.elements(':visible')) => {
    eles.layout({
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 28,
      rankSep: 56,
      padding: 24,
      animate: false,
      fit: true,
    }).run();
  };

  runLayout();
  cy.nodes().grabify();

  const setGrabCursor = (on) => {
    if (container) container.style.cursor = on ? 'grabbing' : '';
  };
  cy.on('grab', 'node', () => setGrabCursor(true));
  cy.on('free', 'node', () => setGrabCursor(false));

  cy.on('tap', 'node', (ev) => {
    onSelect?.({ ...ev.target.data(), id: ev.target.id() });
  });

  return {
    cy,
    runLayout,
    applyVisible(visibleIds) {
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          node.style('display', visibleIds.has(node.id()) ? 'element' : 'none');
        });
        cy.edges().forEach((edge) => {
          const show = visibleIds.has(edge.source().id()) && visibleIds.has(edge.target().id());
          edge.style('display', show ? 'element' : 'none');
        });
      });
      const vis = cy.elements().filter((el) => el.style('display') !== 'none');
      if (vis.nonempty()) runLayout(vis);
    },
    select(id) {
      cy.$(':selected').unselect();
      const node = cy.getElementById(id);
      if (node.nonempty()) {
        node.select();
        cy.animate({ center: { eles: node }, duration: reduceMotion ? 0 : 200 });
      }
    },
    zoomIn() {
      cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    },
    zoomOut() {
      cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    },
    fit() {
      cy.resize();
      cy.fit(cy.elements(':visible'), 24);
    },
    resize() {
      cy.resize();
    },
    visibleNodeIds() {
      return cy.nodes().filter((n) => n.style('display') !== 'none').map((n) => n.id());
    },
    destroy() {
      cy.destroy();
    },
  };
}
