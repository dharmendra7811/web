"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import cytoscape from 'cytoscape';

// Track dagre registration outside of cytoscape type
let dagreRegistered = false;

// Dynamically register dagre to avoid TypeScript declaration issues
const loadDagre = async () => {
  if (!dagreRegistered) {
    const dagre = await import('cytoscape-dagre');
    cytoscape.use(dagre.default || dagre);
    dagreRegistered = true;
  }
};

const CytoscapeComponent = dynamic(() => import('react-cytoscapejs'), { ssr: false });

interface GraphViewProps {
  projectId: string;
}

const LAYER_FILTERS = ['all', 'capability', 'service', 'risk', 'infra', 'execution'] as const;
type LayerFilter = typeof LAYER_FILTERS[number];

// Cytoscape stylesheet for different node/edge types
const cyStylesheet: cytoscape.StylesheetCSS[] = [
  // Feature nodes (compound parents)
  {
    selector: 'node[type = "feature"]',
    css: {
      'background-color': '#6366f1',
      'shape': 'round-rectangle',
      'width': 'label',
      'height': 'label',
      'padding': '12px',
      'border-width': 2,
      'border-color': '#4f46e5',
      'text-valign': 'top',
      'text-halign': 'center',
      'color': '#ffffff',
      'font-size': '11px',
      'font-weight': 'bold',
      'text-max-width': '180px',
      'text-wrap': 'wrap',
      'label': 'data(label)',
      'opacity': 0.95,
    }
  },
  // Todo nodes (children of features)
  {
    selector: 'node[type = "todo"]',
    css: {
      'background-color': '#22c55e',
      'shape': 'ellipse',
      'width': 'label',
      'height': 'label',
      'padding': '8px',
      'border-width': 1.5,
      'border-color': '#16a34a',
      'text-valign': 'center',
      'text-halign': 'center',
      'color': '#1e293b',
      'font-size': '10px',
      'font-weight': 'normal',
      'text-max-width': '140px',
      'text-wrap': 'wrap',
      'label': 'data(label)',
    }
  },
  // Node type-specific colors
  {
    selector: 'node[graph_type = "capability"]',
    css: { 'background-color': '#6366f1', 'border-color': '#4f46e5' }
  },
  {
    selector: 'node[graph_type = "service"]',
    css: { 'background-color': '#22c55e', 'border-color': '#16a34a' }
  },
  {
    selector: 'node[graph_type = "risk"]',
    css: { 'background-color': '#ef4444', 'border-color': '#dc2626', 'shape': 'diamond' }
  },
  {
    selector: 'node[graph_type = "infra"]',
    css: { 'background-color': '#f59e0b', 'border-color': '#d97706' }
  },
  {
    selector: 'node[graph_type = "execution"]',
    css: { 'background-color': '#8b5cf6', 'border-color': '#7c3aed' }
  },
  // Dependency edges
  {
    selector: 'edge[type = "depends_on"]',
    css: {
      'width': 2,
      'line-color': '#94a3b8',
      'target-arrow-color': '#94a3b8',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
    }
  },
  // Compound node parent styling
  {
    selector: 'node[parent]',
    css: {
      'padding': '5px',
    }
  },
];

export default function GraphView({ projectId }: GraphViewProps) {
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [elements, setElements] = useState<cytoscape.ElementDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerFilter>('all');

  const loadGraph = useCallback(async () => {
    await loadDagre();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/projects/${projectId}/graph`);
      if (!res.ok) throw new Error('Failed to fetch graph data');
      const data = await res.json();
      setElements(data.elements || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load graph');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Handle layer filtering
  const handleLayerFilter = (layer: LayerFilter) => {
    setActiveLayer(layer);
    const cy = cyRef.current;
    if (!cy) return;

    if (layer === 'all') {
      cy.elements().style('display', 'element');
    } else {
      cy.elements().style('display', 'none');
      // Show nodes matching the graph_type
      cy.nodes(`[graph_type = "${layer}"]`).style('display', 'element');
      // Show parent nodes of visible children
      cy.nodes().filter(n => (n as any).isParent() && (n as any).children().length > 0).style('display', 'element');
      // Show edges connected to visible nodes
      cy.edges().forEach((edge: any) => {
        if (edge.source().style('display') !== 'none' && edge.target().style('display') !== 'none') {
          edge.style('display', 'element');
        }
      });
    }
  };

  if (loading) {
    return (
      <div className="border rounded p-8 bg-white min-h-[400px] flex items-center justify-center flex-col">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3"></div>
        <p className="text-sm text-gray-500">Loading dependency graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded p-8 bg-white min-h-[400px] flex items-center justify-center flex-col text-red-500">
        <span className="text-xl mb-2">⚠️</span>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="border rounded p-4 bg-gray-50 min-h-[500px] h-[600px] relative">
      {/* Header */}
      <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur shadow-sm p-3 rounded-md border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Typed Architecture Graph</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {elements.length} elements
        </p>
      </div>

      {/* Layer filter tabs */}
      <div className="absolute top-6 right-6 z-10 flex gap-1 bg-white/90 backdrop-blur shadow-sm p-1 rounded-md border border-gray-100">
        {LAYER_FILTERS.map(layer => (
          <button
            key={layer}
            onClick={() => handleLayerFilter(layer)}
            className={`text-[10px] px-2 py-1 rounded font-semibold transition capitalize ${
              activeLayer === layer
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {layer}
          </button>
        ))}
      </div>

      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '100%' }}
        stylesheet={cyStylesheet}
        layout={{
          name: 'dagre',
          rankDir: 'TB',
          spacingFactor: 1.5,
          animate: true,
          nodeSep: 40,
          rankSep: 60,
        } as any}
        cy={(cy) => { cyRef.current = cy; }}
        wheelSensitivity={0.3}
      />
    </div>
  );
}
