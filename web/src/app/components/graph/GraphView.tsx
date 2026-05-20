"use client";

import { useState, useEffect } from 'react';
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

// Custom Node Components
const CustomFeatureNode = ({ data }: any) => {
  return (
    <div className="px-4 py-3 shadow-md rounded-md bg-white border-2 border-blue-500 min-w-[220px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Feature</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
          data.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {data.status}
        </span>
      </div>
      <div className="font-semibold text-xs text-gray-800 line-clamp-1">{data.label}</div>
      <div className="flex gap-3 mt-3 text-[10px] text-gray-500 border-t pt-2">
        <div>📋 <span className="font-semibold text-gray-700">{data.todo_count || 0}</span> Todos</div>
        <div>📦 <span className="font-semibold text-gray-700">{data.entity_count || 0}</span> Entities</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-500" />
    </div>
  );
};

const CustomTodoNode = ({ data }: any) => {
  return (
    <div className="px-3 py-2.5 shadow-sm rounded-md bg-white border border-gray-200 min-w-[180px] hover:border-indigo-400 transition-colors">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider">Todo</span>
        <span className={`text-[8px] px-1 py-0.5 rounded font-medium uppercase ${
          data.status === 'completed' ? 'bg-green-50 text-green-600' : 
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
  feature: CustomFeatureNode,
  todo: CustomTodoNode,
};

export default function GraphView({ projectId }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadGraphData = async () => {
      try {
        const data = await getGraphData(projectId);
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      } catch (err: any) {
        console.error('Failed to load project graph:', err);
        setError(err.message || 'Failed to load project graph data');
      } finally {
        setLoading(false);
      }
    };

    loadGraphData();

    const handleUpdate = () => {
      loadGraphData();
    };
    window.addEventListener('prd-updated', handleUpdate);
    return () => {
      window.removeEventListener('prd-updated', handleUpdate);
    };
  }, [projectId]);

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
      <div className="absolute top-6 left-6 z-10 bg-white/80 backdrop-blur shadow-sm p-3 rounded-md border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Dynamic Requirements Graph</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">Interactive feature and todo dependency hierarchy.</p>
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
