"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getGraphData } from '@/lib/api';

interface GraphViewProps {
  projectId: string;
}

// Per-layer visual config
const layerConfig: Record<string, { border: string; bg: string; badge: string; label: string }> = {
  capability: { border: 'border-blue-500', bg: 'bg-blue-50/80', badge: 'bg-blue-100 text-blue-700', label: 'Capability' },
  service:    { border: 'border-emerald-500', bg: 'bg-emerald-50/70', badge: 'bg-emerald-100 text-emerald-700', label: 'Service' },
  risk:       { border: 'border-red-500', bg: 'bg-red-50/80', badge: 'bg-red-100 text-red-700', label: 'Risk' },
  infra:      { border: 'border-amber-500', bg: 'bg-amber-50/70', badge: 'bg-amber-100 text-amber-700', label: 'Infra' },
  execution:  { border: 'border-violet-500', bg: 'bg-violet-50/70', badge: 'bg-violet-100 text-violet-700', label: 'Execution' },
};

function layerStyle(type: string) {
  return layerConfig[type] || layerConfig.service;
}

// Feature-level node (capability / service / risk)
const FeatureNode = ({ data }: any) => {
  const style = layerStyle(data.graph_type);
  const isLowConfidence = data.confidence != null && data.confidence < 0.7;
  const isInferred = data.source === 'inferred';

  return (
    <div className={`px-4 py-3 shadow-md rounded-md ${style.bg} border-2 ${style.border} min-w-[220px] ${isLowConfidence ? 'opacity-70' : ''}`}>
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${style.badge}`}>
          {style.label}
        </span>
        {isInferred && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">INFERRED</span>
        )}
        {isLowConfidence && (
          <span className="text-[8px] px-1 py-0.5 rounded bg-gray-100 text-gray-600">{(data.confidence * 100).toFixed(0)}%</span>
        )}
        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
          data.status === 'ready' ? 'bg-green-100 text-green-700' : data.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {data.status}
        </span>
      </div>
      <div className="font-semibold text-xs text-gray-800 line-clamp-1">{data.label}</div>
      {data.constraints && data.constraints.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {data.constraints.slice(0, 3).map((c: string) => (
            <span key={c} className="text-[8px] bg-red-50 text-red-600 px-1 rounded border border-red-100">{c}</span>
          ))}
        </div>
      )}
      <div className="flex gap-3 mt-2 text-[10px] text-gray-500 border-t pt-2">
        <div>📋 <span className="font-semibold text-gray-700">{data.todo_count || 0}</span> Todos</div>
        <div>📦 <span className="font-semibold text-gray-700">{data.entity_count || 0}</span> Entities</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500" />
    </div>
  );
};

// Todo-level node (service / infra / execution)
const TodoNode = ({ data }: any) => {
  const style = layerStyle(data.graph_type);

  return (
    <div className={`px-3 py-2.5 shadow-sm rounded-md border ${style.border} ${style.bg} min-w-[180px] hover:border-indigo-400 transition-colors`}>
      <div className="flex justify-between items-center mb-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${style.badge}`}>
          {style.label}
        </span>
        <span className={`text-[8px] px-1 py-0.5 rounded font-medium uppercase ${
          data.status === 'done' ? 'bg-green-50 text-green-600' :
          data.status === 'in_progress' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
        }`}>
          {data.status}
        </span>
      </div>
      <div className="text-[11px] font-medium text-gray-700 line-clamp-2">{data.label}</div>
      <div className="flex justify-between items-center mt-2 text-[9px] text-gray-400 border-t pt-1.5">
        <div>📦 {data.entity_count || 0} Entities</div>
      </div>
      <Handle type="target" position={Position.Top} className="w-1.5 h-1.5 !bg-indigo-400" />
      <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5 !bg-indigo-400" />
    </div>
  );
};

const nodeTypes = {
  capability: FeatureNode,
  service: FeatureNode,
  risk: FeatureNode,
  infra: TodoNode,
  execution: TodoNode,
  // legacy fallbacks
  feature: FeatureNode,
  todo: TodoNode,
};

const LAYER_FILTERS = ['all', 'capability', 'service', 'risk', 'infra', 'execution'] as const;
type LayerFilter = typeof LAYER_FILTERS[number];

export default function GraphView({ projectId }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerFilter>('all');

  const loadGraphData = useCallback(async () => {
    try {
      const data = await getGraphData(projectId);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load project graph:', err);
      setError(err.message || 'Failed to load project graph data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadGraphData();

    const handleUpdate = () => loadGraphData();
    window.addEventListener('prd-updated', handleUpdate);
    return () => {
      window.removeEventListener('prd-updated', handleUpdate);
    };
  }, [loadGraphData]);

  // Filter nodes/edges by active layer
  const filteredNodes = activeLayer === 'all'
    ? nodes
    : nodes.filter(n => {
        const gt = n.data?.graph_type || n.type || '';
        // feature-level types: capability, service, risk
        // todo-level types: service, infra, execution
        // Map legacy types
        if (n.type === 'feature') return activeLayer === 'capability';
        if (n.type === 'todo') return activeLayer === 'service';
        return gt === activeLayer;
      });

  const filteredEdges = activeLayer === 'all'
    ? edges
    : edges.filter(e => {
        const src = filteredNodes.find(n => n.id === e.source);
        const tgt = filteredNodes.find(n => n.id === e.target);
        return src && tgt;
      });

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
          {filteredNodes.length} nodes · {filteredEdges.length} edges
        </p>
      </div>

      {/* Layer filter tabs */}
      <div className="absolute top-6 right-6 z-10 flex gap-1 bg-white/90 backdrop-blur shadow-sm p-1 rounded-md border border-gray-100">
        {LAYER_FILTERS.map(layer => (
          <button
            key={layer}
            onClick={() => setActiveLayer(layer)}
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

      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap zoomable pannable nodeStrokeWidth={3} />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}