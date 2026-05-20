"use client";

import { useEffect, useState } from 'react';
import { getProject, updateFeature, deleteFeature, updateTodo, deleteTodo, createTodo, Feature, Todo } from '@/lib/api';

interface FolderTreeProps {
  projectId: string;
}

export default function FolderTree({ projectId }: FolderTreeProps) {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    root: true,
    prd: false,
    featuresList: true,
  });
  
  // Inline editing state
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [editFeatureTitle, setEditFeatureTitle] = useState('');
  const [editFeatureDesc, setEditFeatureDesc] = useState('');
  
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');
  const [editTodoDetail, setEditTodoDetail] = useState('');
  const [editTodoStatus, setEditTodoStatus] = useState<Todo['status']>('open');

  // Inline creation of todo state
  const [addingTodoToFeatureId, setAddingTodoToFeatureId] = useState<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDetail, setNewTodoDetail] = useState('');

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('prd-updated', handleUpdate);
    return () => {
      window.removeEventListener('prd-updated', handleUpdate);
    };
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getProject(projectId);
      setProject(data);
      
      // Auto-expand features that have been loaded
      if (data && data.features) {
        const initialExpanded: Record<string, boolean> = {
          root: true,
          prd: false,
          featuresList: true,
        };
        data.features.forEach((feat: Feature) => {
          // Keep existing expand state if it was toggled before, otherwise default to true
          initialExpanded[`feature-${feat.id}`] = true;
          initialExpanded[`feature-${feat.id}-todos`] = true;
        });
        setExpandedNodes(prev => ({
          ...initialExpanded,
          ...prev // preserve manual toggles
        }));
      }
    } catch (error) {
      console.error('Failed to load project tree data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (nodeKey: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeKey]: !prev[nodeKey]
    }));
  };

  // Feature actions
  const startEditFeature = (feat: Feature) => {
    setEditingFeatureId(feat.id);
    setEditFeatureTitle(feat.title);
    setEditFeatureDesc(feat.description || '');
  };

  const cancelEditFeature = () => {
    setEditingFeatureId(null);
  };

  const handleUpdateFeature = async (featId: string) => {
    if (!editFeatureTitle.trim()) return;
    setActionLoading(prev => ({ ...prev, [featId]: true }));
    try {
      await updateFeature(featId, {
        title: editFeatureTitle,
        description: editFeatureDesc
      });
      setEditingFeatureId(null);
      await loadData();
      window.dispatchEvent(new Event('prd-updated')); // sync other views
    } catch (error) {
      console.error(error);
      alert('Failed to update feature');
    } finally {
      setActionLoading(prev => ({ ...prev, [featId]: false }));
    }
  };

  const handleDeleteFeature = async (featId: string, title: string) => {
    if (!window.confirm(`Delete the feature "${title}"? This will delete all its nested todos.`)) {
      return;
    }
    setActionLoading(prev => ({ ...prev, [featId]: true }));
    try {
      await deleteFeature(featId);
      await loadData();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error(error);
      alert('Failed to delete feature');
    } finally {
      setActionLoading(prev => ({ ...prev, [featId]: false }));
    }
  };

  // Todo actions
  const startEditTodo = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditTodoTitle(todo.title);
    setEditTodoDetail(todo.detail || '');
    setEditTodoStatus(todo.status);
  };

  const cancelEditTodo = () => {
    setEditingTodoId(null);
  };

  const handleUpdateTodo = async (todoId: string) => {
    if (!editTodoTitle.trim()) return;
    setActionLoading(prev => ({ ...prev, [todoId]: true }));
    try {
      await updateTodo(todoId, {
        title: editTodoTitle,
        detail: editTodoDetail,
        status: editTodoStatus
      });
      setEditingTodoId(null);
      await loadData();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error(error);
      alert('Failed to update todo');
    } finally {
      setActionLoading(prev => ({ ...prev, [todoId]: false }));
    }
  };

  const handleDeleteTodo = async (todoId: string, title: string) => {
    if (!window.confirm(`Delete todo "${title}"?`)) {
      return;
    }
    setActionLoading(prev => ({ ...prev, [todoId]: true }));
    try {
      await deleteTodo(todoId);
      await loadData();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error(error);
      alert('Failed to delete todo');
    } finally {
      setActionLoading(prev => ({ ...prev, [todoId]: false }));
    }
  };

  // Create Todo
  const handleCreateTodo = async (featureId: string) => {
    if (!newTodoTitle.trim()) return;
    setActionLoading(prev => ({ ...prev, [`add-todo-${featureId}`]: true }));
    try {
      await createTodo(featureId, {
        project_id: projectId,
        feature_id: featureId,
        title: newTodoTitle,
        detail: newTodoDetail,
        entities: [],
        depends_on: [],
        status: 'open',
        order_index: 99,
        human_locked: true
      });
      setNewTodoTitle('');
      setNewTodoDetail('');
      setAddingTodoToFeatureId(null);
      await loadData();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error(error);
      alert('Failed to create todo');
    } finally {
      setActionLoading(prev => ({ ...prev, [`add-todo-${featureId}`]: false }));
    }
  };

  const getStatusColor = (status: Todo['status']) => {
    switch (status) {
      case 'done': return 'bg-emerald-500 text-emerald-950 border-emerald-400';
      case 'in_progress': return 'bg-sky-500 text-sky-950 border-sky-400';
      case 'blocked': return 'bg-rose-500 text-rose-950 border-rose-400';
      default: return 'bg-slate-400 text-slate-950 border-slate-300';
    }
  };

  if (loading && !project) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl h-[600px]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">Assembling folder structure...</p>
      </div>
    );
  }

  const features = project?.features || [];

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl h-[600px] text-slate-100 overflow-hidden font-sans">
      {/* Explorer Header */}
      <div className="bg-slate-950/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Requirements Explorer</span>
        </div>
        <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-900/50 px-2 py-0.5 rounded-full font-semibold">
          {features.length} Features
        </span>
      </div>

      {/* Explorer Body (Tree View) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin select-none">
        
        {/* Project Root Folder */}
        <div>
          <div 
            onClick={() => toggleExpand('root')}
            className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors group"
          >
            <span className={`transform transition-transform text-slate-500 group-hover:text-slate-300 duration-200 ${expandedNodes.root ? 'rotate-90' : ''}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </span>
            <span className="text-yellow-500">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
            </span>
            <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{project?.name}</span>
          </div>

          {/* Root Content */}
          {expandedNodes.root && (
            <div className="pl-6 mt-1 space-y-1.5 border-l border-slate-800/80 ml-4">
              
              {/* PRD Collapsible Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('prd')}
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors group"
                >
                  <span className={`transform transition-transform text-slate-600 duration-200 ${expandedNodes.prd ? 'rotate-90' : ''}`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </span>
                  <span className="text-indigo-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </span>
                  <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300">PRD Document</span>
                </div>

                {expandedNodes.prd && (
                  <div className="pl-6 py-2 pr-2 text-xs text-slate-400 border-l border-slate-800/50 ml-3.5 space-y-2 max-h-[250px] overflow-y-auto bg-slate-950/40 rounded-lg p-3">
                    <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1 mb-2">Project Summary</div>
                    <p className="leading-relaxed whitespace-pre-wrap">{project?.summary || 'No summary generated yet.'}</p>
                    {project?.prd_text && (
                      <>
                        <div className="font-semibold text-slate-300 border-b border-slate-800 pb-1 mt-4 mb-2">Full Document</div>
                        <p className="font-mono text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap">{project.prd_text}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Features Collection Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('featuresList')}
                  className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800/50 cursor-pointer transition-colors group"
                >
                  <span className={`transform transition-transform text-slate-600 duration-200 ${expandedNodes.featuresList ? 'rotate-90' : ''}`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </span>
                  <span className="text-sky-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                  </span>
                  <span className="text-xs font-semibold text-slate-350 group-hover:text-slate-200">extracted_features</span>
                </div>

                {expandedNodes.featuresList && (
                  <div className="pl-4 mt-1.5 space-y-3 border-l border-slate-800/50 ml-3.5">
                    
                    {features.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 italic">No features generated yet. Ingest a PRD to begin.</div>
                    ) : (
                      features.map((feat: any) => {
                        const featKey = `feature-${feat.id}`;
                        const todosKey = `feature-${feat.id}-todos`;
                        const isExpanded = expandedNodes[featKey];
                        const isTodosExpanded = expandedNodes[todosKey];
                        const isEditing = editingFeatureId === feat.id;
                        
                        return (
                          <div key={feat.id} className="group/feat relative bg-slate-950/20 border border-slate-800/40 rounded-xl p-1.5 hover:border-slate-800 transition-colors">
                            {/* Feature Title Expandable Header */}
                            <div className="flex items-center justify-between pr-2">
                              <div 
                                onClick={() => toggleExpand(featKey)}
                                className="flex items-center gap-2 py-1 px-1 flex-1 cursor-pointer"
                              >
                                <span className={`transform transition-transform text-slate-500 duration-150 ${isExpanded ? 'rotate-90' : ''}`}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                                <span className="text-amber-500">
                                  <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                                </span>
                                
                                {isEditing ? (
                                  <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="text" 
                                      value={editFeatureTitle} 
                                      onChange={(e) => setEditFeatureTitle(e.target.value)}
                                      className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs w-full text-white font-medium focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-200 group-hover/feat:text-indigo-300 transition-colors">
                                    {feat.title}
                                  </span>
                                )}
                              </div>

                              {/* Feature quick status badge & quick actions */}
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700/50">
                                  {feat.status}
                                </span>

                                {/* Quick inline buttons */}
                                <div className="opacity-0 group-hover/feat:opacity-100 flex items-center gap-1 transition-opacity">
                                  {isEditing ? (
                                    <>
                                      <button 
                                        disabled={actionLoading[feat.id]}
                                        onClick={() => handleUpdateFeature(feat.id)}
                                        className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                      </button>
                                      <button 
                                        onClick={cancelEditFeature}
                                        className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => startEditFeature(feat)}
                                        className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
                                        title="Rename Feature"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                      </button>
                                      <button 
                                        disabled={actionLoading[feat.id]}
                                        onClick={() => handleDeleteFeature(feat.id, feat.title)}
                                        className="text-rose-400 hover:text-rose-300 p-0.5 rounded"
                                        title="Delete Feature"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Feature Body contents if expanded */}
                            {isExpanded && (
                              <div className="pl-6 pr-2 py-2.5 mt-1 border-t border-slate-800 bg-slate-950/20 rounded-b-lg space-y-3">
                                
                                {/* Edit Feature Description Input */}
                                {isEditing ? (
                                  <div className="space-y-1.5">
                                    <span className="text-[9px] text-slate-500 uppercase font-bold">Description</span>
                                    <textarea 
                                      value={editFeatureDesc} 
                                      onChange={(e) => setEditFeatureDesc(e.target.value)}
                                      rows={2}
                                      className="bg-slate-900 border border-slate-700 rounded p-1.5 text-[11px] w-full text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                      placeholder="Feature description..."
                                    />
                                  </div>
                                ) : (
                                  feat.description && (
                                    <p className="text-[11px] text-slate-400 leading-relaxed italic">{feat.description}</p>
                                  )
                                )}

                                {/* Actors & Entities */}
                                {!isEditing && (feat.actors?.length > 0 || feat.entities?.length > 0) && (
                                  <div className="flex flex-wrap gap-2 text-[9px]">
                                    {feat.actors?.map((actor: string) => (
                                      <span key={actor} className="px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-900/40">
                                        👤 {actor}
                                      </span>
                                    ))}
                                    {feat.entities?.map((entity: string) => (
                                      <span key={entity} className="px-1.5 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-900/40">
                                        📦 {entity}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Nested Todos Folder */}
                                <div className="border-t border-slate-800/60 pt-2.5">
                                  <div 
                                    onClick={() => toggleExpand(todosKey)}
                                    className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-slate-800/40 cursor-pointer transition-colors group/todos"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={`transform transition-transform text-slate-600 duration-150 ${isTodosExpanded ? 'rotate-90' : ''}`}>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                      </span>
                                      <span className="text-violet-400">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">technical_todos</span>
                                    </div>
                                    <span className="text-[9px] bg-slate-850 text-slate-400 px-1.5 py-0.2 rounded border border-slate-805">
                                      {feat.todos?.length || 0} items
                                    </span>
                                  </div>

                                  {/* Expandable list of Todos under the feature */}
                                  {isTodosExpanded && (
                                    <div className="pl-4 mt-1.5 space-y-2 border-l border-slate-800/60 ml-2.5">
                                      {feat.todos?.map((todo: Todo) => {
                                        const isTodoEditing = editingTodoId === todo.id;
                                        const isTodoExpanded = expandedNodes[`todo-${todo.id}`];

                                        return (
                                          <div key={todo.id} className="relative group/todo bg-slate-900/60 border border-slate-800/40 rounded-lg p-2 hover:border-slate-750 transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                              <div 
                                                onClick={() => toggleExpand(`todo-${todo.id}`)}
                                                className="flex-1 cursor-pointer"
                                              >
                                                {isTodoEditing ? (
                                                  <div className="flex flex-col gap-1.5 w-full pr-4" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                      type="text" 
                                                      value={editTodoTitle} 
                                                      onChange={(e) => setEditTodoTitle(e.target.value)}
                                                      className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                    />
                                                    <textarea 
                                                      value={editTodoDetail} 
                                                      onChange={(e) => setEditTodoDetail(e.target.value)}
                                                      rows={1.5}
                                                      className="bg-slate-950 border border-slate-700 rounded p-1 text-[10px] text-white w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                                      placeholder="Acceptance criteria / description..."
                                                    />
                                                    <div className="flex gap-2 items-center">
                                                      <select 
                                                        value={editTodoStatus} 
                                                        onChange={(e) => setEditTodoStatus(e.target.value as Todo['status'])}
                                                        className="bg-slate-950 border border-slate-700 text-[10px] rounded px-1.5 py-0.5 text-slate-350 focus:outline-none"
                                                      >
                                                        <option value="open">Open</option>
                                                        <option value="in_progress">In Progress</option>
                                                        <option value="done">Done</option>
                                                        <option value="blocked">Blocked</option>
                                                      </select>
                                                      <button 
                                                        disabled={actionLoading[todo.id]}
                                                        onClick={() => handleUpdateTodo(todo.id)}
                                                        className="bg-indigo-600 hover:bg-indigo-500 text-[10px] font-semibold text-white px-2 py-0.5 rounded shadow-sm"
                                                      >
                                                        Save
                                                      </button>
                                                      <button 
                                                        onClick={cancelEditTodo}
                                                        className="text-slate-400 hover:text-slate-200 text-[10px] px-1"
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-1.5">
                                                    <span className={`transform transition-transform text-slate-600 duration-150 ${isTodoExpanded ? 'rotate-90' : ''}`}>
                                                      <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                    </span>
                                                    <div className={`w-2 h-2 rounded-full ${getStatusColor(todo.status).split(' ')[0]} border border-slate-950/20`} />
                                                    <span className="text-[11px] text-slate-300 font-medium hover:text-white transition-colors">
                                                      {todo.title}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Actions for single todo item */}
                                              {!isTodoEditing && (
                                                <div className="flex items-center gap-1">
                                                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${getStatusColor(todo.status).split(' ').slice(1).join(' ')} bg-slate-950/20`}>
                                                    {todo.status}
                                                  </span>

                                                  <div className="opacity-0 group-hover/todo:opacity-100 flex items-center gap-0.5 transition-opacity ml-1.5">
                                                    <button 
                                                      onClick={() => startEditTodo(todo)}
                                                      className="text-slate-500 hover:text-slate-300 p-0.5"
                                                      title="Edit Todo"
                                                    >
                                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button 
                                                      disabled={actionLoading[todo.id]}
                                                      onClick={() => handleDeleteTodo(todo.id, todo.title)}
                                                      className="text-rose-500 hover:text-rose-400 p-0.5"
                                                      title="Delete Todo"
                                                    >
                                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>

                                            {/* Expandable Todo Detail Panel */}
                                            {isTodoExpanded && !isTodoEditing && (
                                              <div className="mt-2 pl-4 py-1.5 border-l border-slate-800 bg-slate-950/20 rounded p-2 space-y-1.5 text-[10px] text-slate-400">
                                                {todo.detail ? (
                                                  <p className="text-slate-350 leading-relaxed">{todo.detail}</p>
                                                ) : (
                                                  <p className="text-slate-500 italic">No additional details.</p>
                                                )}
                                                {todo.entities?.length > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-1 font-mono text-[9px] text-slate-500">
                                                    <span>Entities:</span>
                                                    {todo.entities.map(e => (
                                                      <span key={e} className="bg-slate-950 px-1 py-0.2 rounded">
                                                        {e}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                                {todo.ticket_id && (
                                                  <div className="flex gap-1.5 mt-1 text-[9px] text-indigo-400 items-center">
                                                    <span>🎫 Ticket:</span>
                                                    <span className="font-semibold uppercase bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-900">
                                                      {todo.ticket_adapter} - {todo.ticket_id}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Inline "Add Todo" Button / Expand Form */}
                                      {addingTodoToFeatureId === feat.id ? (
                                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-2 mt-2">
                                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">New technical task</div>
                                          <input 
                                            type="text" 
                                            placeholder="Action-oriented title (e.g. Create user db table)"
                                            value={newTodoTitle} 
                                            onChange={(e) => setNewTodoTitle(e.target.value)}
                                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                            autoFocus
                                          />
                                          <textarea 
                                            placeholder="Details / Acceptance Criteria..."
                                            value={newTodoDetail} 
                                            onChange={(e) => setNewTodoDetail(e.target.value)}
                                            rows={2}
                                            className="bg-slate-950 border border-slate-700 rounded p-1.5 text-[10px] text-white w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                          />
                                          <div className="flex justify-end gap-1.5">
                                            <button 
                                              onClick={() => setAddingTodoToFeatureId(null)}
                                              className="text-[10px] font-semibold text-slate-400 hover:text-slate-200 px-2 py-1"
                                            >
                                              Cancel
                                            </button>
                                            <button 
                                              disabled={actionLoading[`add-todo-${feat.id}`] || !newTodoTitle.trim()}
                                              onClick={() => handleCreateTodo(feat.id)}
                                              className="bg-indigo-600 hover:bg-indigo-500 text-[10px] font-semibold text-white px-3 py-1 rounded shadow-md transition disabled:opacity-50"
                                            >
                                              Create Task
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div 
                                          onClick={() => setAddingTodoToFeatureId(feat.id)}
                                          className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-indigo-950/30 text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer border border-dashed border-indigo-950 hover:border-indigo-900/60 transition"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                          <span>Add implementation todo...</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
