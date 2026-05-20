"use client";

import { useState } from 'react';

interface GraphViewProps {
  projectId: string;
}

export default function GraphView({ projectId }: GraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const nodes = [
    { id: '1', label: 'User Authentication', type: 'core', desc: 'Secure login, sign up, and JWT validation' },
    { id: '2', label: 'PRD Upload', type: 'feature', desc: 'Upload zone for documents to extract key requirements' },
    { id: '3', label: 'Ingestion Engine', type: 'system', desc: 'Backend worker parsing documents into structured data' },
    { id: '4', label: 'Interactive Graph', type: 'feature', desc: 'Dependency visualizer showing system integration pathways' }
  ];

  return (
    <div className="border rounded p-4 bg-white min-h-[300px]">
      <h2 className="text-lg font-semibold mb-2">Requirements Graph</h2>
      <p className="text-xs text-gray-500 mb-4">Click nodes to inspect relationships and features.</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => setSelectedNode(node.id)}
              className={`p-3 rounded border text-left transition ${
                selectedNode === node.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-sm">{node.label}</div>
              <span className="inline-block text-[10px] uppercase font-bold text-gray-400 mt-1">{node.type}</span>
            </button>
          ))}
        </div>
        <div className="border rounded p-3 bg-gray-50 flex flex-col justify-between">
          {selectedNode ? (
            <div>
              <h3 className="font-semibold text-sm mb-1">{nodes.find(n => n.id === selectedNode)?.label}</h3>
              <p className="text-xs text-gray-600 mb-2">{nodes.find(n => n.id === selectedNode)?.desc}</p>
              <div className="text-[10px] text-gray-400 mt-4">
                Connected dependencies:
                <ul className="list-disc pl-4 mt-1">
                  <li>System Core</li>
                  <li>API Gateway</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 flex items-center justify-center h-full">
              Select a node to inspect dependencies
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
