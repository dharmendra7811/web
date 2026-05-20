"use client";

import { useEffect, useState } from 'react';
import { getProject, updateFeature, deleteFeature, updateTodo, deleteTodo, createTodo, Feature, Todo } from '@/lib/api';

interface FolderTreeProps {
  projectId: string;
  theme?: 'light' | 'dark';
}

export default function FolderTree({ projectId, theme = 'dark' }: FolderTreeProps) {
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
          initialExpanded[`feature-${feat.id}`] = true;
          initialExpanded[`feature-${feat.id}-todos`] = true;
        });
        setExpandedNodes(prev => ({
          ...initialExpanded,
          ...prev
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
      window.dispatchEvent(new Event('prd-updated'));
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
        detail: editTodoDetail
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

  const handleStatusChange = async (todoId: string, status: Todo['status']) => {
    setActionLoading(prev => ({ ...prev, [`status-${todoId}`]: true }));
    try {
      await updateTodo(todoId, { status });
      await loadData();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error(error);
      alert('Failed to update status');
    } finally {
      setActionLoading(prev => ({ ...prev, [`status-${todoId}`]: false }));
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
      default: return 'bg-slate-450 text-slate-950 border-slate-350';
    }
  };

  if (loading && !project) {
    return (
      <div className={`flex flex-col items-center justify-center p-12 border rounded-2xl shadow-2xl h-[600px] transition-colors duration-300 ${
        theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-4 animate-[spin_0.8s_linear_infinite]"></div>
        <p className={`text-sm font-bold animate-pulse tracking-wide ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Assembling folder structure...
        </p>
      </div>
    );
  }

  const features = project?.features || [];

  return (
    <div className={`flex flex-col border rounded-2xl shadow-2xl h-[600px] overflow-hidden font-sans transition-all duration-300 ${
      theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-250 text-slate-800'
    }`}>
      {/* Explorer Header */}
      <div className={`border-b px-4 py-3 flex items-center justify-between transition-colors ${
        theme === 'dark' ? 'bg-slate-955 border-slate-800/80' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className={`text-xs font-black uppercase tracking-wider ${
            theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Requirements Explorer
          </span>
        </div>
        <span className={`text-[10px] border px-2.5 py-0.5 rounded-full font-black tracking-wide uppercase transition-all hover:scale-105 ${
          theme === 'dark' 
            ? 'bg-indigo-950/85 text-indigo-350 border-indigo-900/50 shadow-[0_2px_8px_rgba(99,102,241,0.15)]' 
            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
        }`}>
          {features.length} Features
        </span>
      </div>

      {/* Explorer Tree Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 scrollbar-thin select-none">
        
        {/* Project Root Folder */}
        <div>
          <div 
            onClick={() => toggleExpand('root')}
            className={`flex items-center gap-2 py-1.5 px-2 rounded-xl cursor-pointer transition-all duration-200 group transform hover:translate-x-1 ${
              theme === 'dark' ? 'hover:bg-slate-800/55' : 'hover:bg-slate-100/80'
            }`}
          >
            <span className={`transform transition-transform text-slate-500 group-hover:text-indigo-400 duration-200 ${expandedNodes.root ? 'rotate-90' : ''}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </span>
            <span className="text-yellow-500 drop-shadow-md group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
            </span>
            <span className={`text-sm font-extrabold transition-colors ${
              theme === 'dark' ? 'text-slate-200 group-hover:text-white' : 'text-slate-800 group-hover:text-indigo-950'
            }`}>
              {project?.name}
            </span>
          </div>

          {/* Root Folder Content */}
          {expandedNodes.root && (
            <div className={`pl-6 mt-1 space-y-2 border-l ml-4 transition-all duration-300 ${
              theme === 'dark' ? 'border-slate-800/80' : 'border-slate-200'
            }`}>
              
              {/* PRD Collapsible Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('prd')}
                  className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-all duration-200 group transform hover:translate-x-1 ${
                    theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100/50'
                  }`}
                >
                  <span className={`transform transition-transform text-slate-600 group-hover:text-indigo-400 duration-200 ${expandedNodes.prd ? 'rotate-90' : ''}`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </span>
                  <span className="text-indigo-500 group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </span>
                  <span className={`text-xs font-bold ${
                    theme === 'dark' ? 'text-slate-400 group-hover:text-slate-350' : 'text-slate-500 group-hover:text-slate-700'
                  }`}>
                    PRD Document
                  </span>
                </div>

                {expandedNodes.prd && (
                  <div className={`pl-6 py-2.5 pr-2 text-xs border-l ml-3.5 space-y-2.5 max-h-[250px] overflow-y-auto rounded-xl p-3 shadow-inner transition-all duration-300 ${
                    theme === 'dark' 
                      ? 'bg-slate-950/40 text-slate-350 border-slate-850/60 shadow-slate-950/40' 
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    <div className={`font-bold border-b pb-1 mb-2 tracking-wide uppercase text-[10px] ${
                      theme === 'dark' ? 'text-slate-250 border-slate-800' : 'text-slate-850 border-slate-205'
                    }`}>
                      Project Summary
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{project?.summary || 'No summary generated yet.'}</p>
                    {project?.prd_text && (
                      <>
                        <div className={`font-bold border-b pb-1 mt-4 mb-2 tracking-wide uppercase text-[10px] ${
                          theme === 'dark' ? 'text-slate-250 border-slate-800' : 'text-slate-850 border-slate-205'
                        }`}>
                          Full Document
                        </div>
                        <p className={`font-mono text-[10px] leading-relaxed whitespace-pre-wrap ${
                          theme === 'dark' ? 'text-slate-450' : 'text-slate-500'
                        }`}>
                          {project.prd_text}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Features Collection Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('featuresList')}
                  className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-all duration-200 group transform hover:translate-x-1 ${
                    theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100/50'
                  }`}
                >
                  <span className={`transform transition-transform text-slate-600 group-hover:text-indigo-400 duration-200 ${expandedNodes.featuresList ? 'rotate-90' : ''}`}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </span>
                  <span className="text-sky-500 group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                  </span>
                  <span className={`text-xs font-bold ${
                    theme === 'dark' ? 'text-slate-350 group-hover:text-slate-200' : 'text-slate-550 group-hover:text-slate-700'
                  }`}>
                    extracted_features
                  </span>
                </div>

                {expandedNodes.featuresList && (
                  <div className={`pl-4 mt-2 space-y-4 border-l ml-3.5 transition-all duration-300 ${
                    theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'
                  }`}>
                    
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
                          <div key={feat.id} className={`group/feat relative border rounded-xl p-2.5 transition-all duration-300 hover:-translate-y-0.5 ${
                            theme === 'dark' 
                              ? 'bg-slate-955/25 border-slate-850 hover:border-slate-750 hover:shadow-[0_4px_16px_rgba(99,102,241,0.06)]' 
                              : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                          }`}>
                            {/* Feature Title Expandable Header */}
                            <div className="flex items-center justify-between pr-2">
                              <div 
                                onClick={() => toggleExpand(featKey)}
                                className="flex items-center gap-2 py-1 px-1 flex-1 cursor-pointer"
                              >
                                <span className={`transform transition-transform text-slate-500 duration-150 group-hover/feat:text-indigo-400 ${isExpanded ? 'rotate-90' : ''}`}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                                <span className="text-amber-500 group-hover/feat:scale-110 transition-transform">
                                  <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                                </span>
                                
                                {isEditing ? (
                                  <div className="flex flex-col gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="text" 
                                      value={editFeatureTitle} 
                                      onChange={(e) => setEditFeatureTitle(e.target.value)}
                                      className={`border rounded px-2.5 py-1 text-xs w-full font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                                        theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-850'
                                      }`}
                                    />
                                  </div>
                                ) : (
                                  <span className={`text-xs font-bold transition-colors ${
                                    theme === 'dark' ? 'text-slate-200 group-hover/feat:text-indigo-455' : 'text-slate-800 group-hover/feat:text-indigo-650'
                                  }`}>
                                    {feat.title}
                                  </span>
                                )}
                              </div>

                              {/* Feature quick status badge & quick actions */}
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase tracking-wider border shadow-sm ${
                                  theme === 'dark' 
                                    ? 'bg-slate-800/80 border-slate-750 text-slate-400' 
                                    : 'bg-slate-200 border-slate-250 text-slate-655'
                                }`}>
                                  {feat.status}
                                </span>

                                {/* Quick inline buttons */}
                                <div className="opacity-0 group-hover/feat:opacity-100 flex items-center gap-1.5 transition-opacity duration-150">
                                  {isEditing ? (
                                    <>
                                      <button 
                                        disabled={actionLoading[feat.id]}
                                        onClick={() => handleUpdateFeature(feat.id)}
                                        className="text-emerald-500 hover:text-emerald-450 p-0.5 rounded cursor-pointer transition-transform hover:scale-110"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                      </button>
                                      <button 
                                        onClick={cancelEditFeature}
                                        className="text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer transition-transform hover:scale-110"
                                      >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => startEditFeature(feat)}
                                        className="text-slate-400 hover:text-indigo-500 p-0.5 rounded cursor-pointer transition-transform hover:scale-110"
                                        title="Rename Feature"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                      </button>
                                      <button 
                                        disabled={actionLoading[feat.id]}
                                        onClick={() => handleDeleteFeature(feat.id, feat.title)}
                                        className="text-rose-500 hover:text-rose-400 p-0.5 rounded cursor-pointer transition-transform hover:scale-110"
                                        title="Delete Feature"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Feature Body contents if expanded */}
                            {isExpanded && (
                              <div className={`pl-6 pr-2 py-3 mt-2 border-t rounded-b-xl space-y-3.5 transition-colors ${
                                theme === 'dark' ? 'border-slate-800 bg-slate-950/20' : 'border-slate-205 bg-white'
                              }`}>
                                
                                {/* Edit Feature Description Input */}
                                {isEditing ? (
                                  <div className="space-y-1.5 flex flex-col w-full">
                                    <span className={`text-[9px] uppercase font-bold tracking-wide ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>Description</span>
                                    <textarea 
                                      value={editFeatureDesc} 
                                      onChange={(e) => setEditFeatureDesc(e.target.value)}
                                      rows={2}
                                      className={`border rounded-lg p-2 text-[11px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none ${
                                        theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                                      }`}
                                      placeholder="Feature description..."
                                    />
                                  </div>
                                ) : (
                                  feat.description && (
                                    <p className={`text-[11px] leading-relaxed italic ${
                                      theme === 'dark' ? 'text-slate-350' : 'text-slate-600'
                                    }`}>{feat.description}</p>
                                  )
                                )}

                                {/* Actors & Entities */}
                                {!isEditing && (feat.actors?.length > 0 || feat.entities?.length > 0) && (
                                  <div className="flex flex-wrap gap-2 text-[9px]">
                                    {feat.actors?.map((actor: string) => (
                                      <span key={actor} className={`px-2 py-0.5 rounded-lg font-bold border transition-colors shadow-sm ${
                                        theme === 'dark' 
                                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40 hover:bg-emerald-950/60' 
                                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                      }`}>
                                        👤 {actor}
                                      </span>
                                    ))}
                                    {feat.entities?.map((entity: string) => (
                                      <span key={entity} className={`px-2 py-0.5 rounded-lg font-bold border transition-colors shadow-sm ${
                                        theme === 'dark' 
                                          ? 'bg-indigo-950/40 text-indigo-300 border-indigo-900/40 hover:bg-indigo-950/60' 
                                          : 'bg-indigo-50/50 text-indigo-700 border-indigo-200/60 hover:bg-indigo-100'
                                      }`}>
                                        📦 {entity}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Nested Todos Folder */}
                                <div className={`border-t pt-3 ${
                                  theme === 'dark' ? 'border-slate-800/70' : 'border-slate-150'
                                }`}>
                                  <div 
                                    onClick={() => toggleExpand(todosKey)}
                                    className={`flex items-center justify-between py-1.5 px-2 rounded-xl cursor-pointer transition-colors group/todos ${
                                      theme === 'dark' ? 'hover:bg-slate-850/65' : 'hover:bg-slate-100/60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={`transform transition-transform text-slate-500 duration-150 ${isTodosExpanded ? 'rotate-90' : ''}`}>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                      </span>
                                      <span className="text-violet-500 group-hover/todos:scale-110 transition-transform">
                                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                      </span>
                                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                                        theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                                      }`}>
                                        technical_todos
                                      </span>
                                    </div>
                                    <span className={`text-[9px] px-2 py-0.2 rounded-full border shadow-sm ${
                                      theme === 'dark' 
                                        ? 'bg-slate-850 text-slate-350 border-slate-800' 
                                        : 'bg-slate-100 text-slate-600 border-slate-205'
                                    }`}>
                                      {feat.todos?.length || 0} items
                                    </span>
                                  </div>

                                  {/* Expandable list of Todos under the feature */}
                                  {isTodosExpanded && (
                                    <div className={`pl-4 mt-2 space-y-2.5 border-l ml-2.5 transition-all duration-300 ${
                                      theme === 'dark' ? 'border-slate-800/60' : 'border-slate-200'
                                    }`}>
                                      {feat.todos?.map((todo: Todo) => {
                                        const isTodoEditing = editingTodoId === todo.id;
                                        const isTodoExpanded = expandedNodes[`todo-${todo.id}`];

                                        return (
                                          <div key={todo.id} className={`relative group/todo border rounded-xl p-2.5 transition-all duration-300 hover:translate-x-1 ${
                                            theme === 'dark' 
                                              ? 'bg-slate-900/60 border-slate-850 hover:border-slate-750 hover:shadow-sm' 
                                              : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow shadow-slate-100'
                                          }`}>
                                            <div className="flex items-center justify-between gap-2.5">
                                              <div 
                                                onClick={() => toggleExpand(`todo-${todo.id}`)}
                                                className="flex-1 cursor-pointer flex items-center gap-2"
                                              >
                                                {isTodoEditing ? (
                                                  <div className="flex flex-col gap-1.5 w-full pr-4" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                      type="text" 
                                                      value={editTodoTitle} 
                                                      onChange={(e) => setEditTodoTitle(e.target.value)}
                                                      className={`border rounded px-2.5 py-1 text-xs w-full font-bold focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                                                        theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                                                      }`}
                                                    />
                                                    <textarea 
                                                      value={editTodoDetail} 
                                                      onChange={(e) => setEditTodoDetail(e.target.value)}
                                                      rows={1.5}
                                                      className={`border rounded-lg p-2 text-[10px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none ${
                                                        theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                                                      }`}
                                                      placeholder="Acceptance criteria / description..."
                                                    />
                                                    <div className="flex gap-2 items-center">
                                                      <button 
                                                        disabled={actionLoading[todo.id]}
                                                        onClick={() => handleUpdateTodo(todo.id)}
                                                        className="bg-indigo-600 hover:bg-indigo-550 active:bg-indigo-700 text-[10px] font-bold text-white px-3 py-1 rounded shadow cursor-pointer transition"
                                                      >
                                                        Save
                                                      </button>
                                                      <button 
                                                        onClick={cancelEditTodo}
                                                        className={`text-[10px] px-1.5 font-bold cursor-pointer ${
                                                          theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-2">
                                                    <span className={`transform transition-transform text-slate-500 group-hover/todo:text-indigo-400 duration-150 ${isTodoExpanded ? 'rotate-90' : ''}`}>
                                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                    </span>
                                                    <span className={`text-[11px] font-bold transition-colors ${
                                                      theme === 'dark' ? 'text-slate-300 group-hover/todo:text-white' : 'text-slate-750 group-hover/todo:text-slate-900'
                                                    }`}>
                                                      {todo.title}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Actions for single todo item */}
                                              {!isTodoEditing && (
                                                <div className="flex items-center gap-2">
                                                  
                                                  {/* Highly Interactive Status Selector Dropdown */}
                                                  <select
                                                    value={todo.status}
                                                    disabled={actionLoading[`status-${todo.id}`]}
                                                    onChange={(e) => handleStatusChange(todo.id, e.target.value as Todo['status'])}
                                                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border transition-all duration-200 cursor-pointer shadow-sm focus:outline-none hover:scale-105 active:scale-95 ${
                                                      todo.status === 'done'
                                                        ? theme === 'dark' ? 'bg-emerald-950/45 text-emerald-350 border-emerald-900/60 hover:bg-emerald-900/40 shadow-emerald-950/20' : 'bg-emerald-50 text-emerald-700 border-emerald-250 hover:bg-emerald-100'
                                                        : todo.status === 'in_progress'
                                                          ? theme === 'dark' ? 'bg-sky-950/45 text-sky-350 border-sky-900/60 hover:bg-sky-900/40 shadow-sky-950/20' : 'bg-sky-50 text-sky-700 border-sky-250 hover:bg-sky-100'
                                                          : todo.status === 'blocked'
                                                            ? theme === 'dark' ? 'bg-rose-950/45 text-rose-350 border-rose-900/60 hover:bg-rose-900/40 shadow-rose-950/20' : 'bg-rose-50 text-rose-700 border-rose-250 hover:bg-rose-100'
                                                            : theme === 'dark' ? 'bg-slate-800 text-slate-350 border-slate-700 hover:bg-slate-750' : 'bg-slate-100 text-slate-655 border-slate-205 hover:bg-slate-200/80'
                                                    }`}
                                                  >
                                                    <option value="open">Open</option>
                                                    <option value="in_progress">In Progress</option>
                                                    <option value="done">Done</option>
                                                    <option value="blocked">Blocked</option>
                                                  </select>

                                                  {/* Inline buttons */}
                                                  <div className="opacity-0 group-hover/todo:opacity-100 flex items-center gap-1 transition-opacity ml-1 duration-150">
                                                    <button 
                                                      onClick={() => startEditTodo(todo)}
                                                      className="text-slate-500 hover:text-indigo-400 p-0.5 cursor-pointer transition-transform hover:scale-110"
                                                      title="Edit Task"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button 
                                                      disabled={actionLoading[todo.id]}
                                                      onClick={() => handleDeleteTodo(todo.id, todo.title)}
                                                      className="text-rose-550 hover:text-rose-400 p-0.5 cursor-pointer transition-transform hover:scale-110"
                                                      title="Delete Task"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>

                                            {/* Expandable Todo Detail Panel */}
                                            {isTodoExpanded && !isTodoEditing && (
                                              <div className={`mt-2 pl-4 py-2 border-l rounded-lg p-2.5 space-y-2 text-[10px] transition-all duration-350 animate-[fadeIn_0.2s_ease-out] ${
                                                theme === 'dark' 
                                                  ? 'border-slate-800 bg-slate-950/20 text-slate-350' 
                                                  : 'border-slate-200 bg-slate-50/50 text-slate-655 shadow-inner'
                                              }`}>
                                                {todo.detail ? (
                                                  <p className="leading-relaxed whitespace-pre-wrap">{todo.detail}</p>
                                                ) : (
                                                  <p className="italic opacity-60">No additional details.</p>
                                                )}
                                                {todo.entities?.length > 0 && (
                                                  <div className="flex flex-wrap gap-1 mt-1.5 font-mono text-[9px] opacity-80">
                                                    <span>Entities:</span>
                                                    {todo.entities.map(e => (
                                                      <span key={e} className={`px-1.5 py-0.2 rounded border ${
                                                        theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
                                                      }`}>
                                                        {e}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                                {todo.ticket_id && (
                                                  <div className="flex gap-1.5 mt-2 text-[9px] text-indigo-500 items-center">
                                                    <span>🎫 Ticket:</span>
                                                    <span className={`font-black uppercase px-2 py-0.2 rounded border shadow-sm ${
                                                      theme === 'dark' 
                                                        ? 'bg-indigo-950/60 border-indigo-900/60 text-indigo-300' 
                                                        : 'bg-indigo-50 border-indigo-200 text-indigo-755'
                                                    }`}>
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
                                        <div className={`border rounded-xl p-3 space-y-2.5 mt-2 shadow-md transition-all ${
                                          theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-205'
                                        }`}>
                                          <div className={`text-[9px] font-black uppercase tracking-wider ${
                                            theme === 'dark' ? 'text-slate-450' : 'text-slate-500'
                                          }`}>
                                            New technical task
                                          </div>
                                          <input 
                                            type="text" 
                                            placeholder="Action-oriented title (e.g. Create user db table)"
                                            value={newTodoTitle} 
                                            onChange={(e) => setNewTodoTitle(e.target.value)}
                                            className={`border rounded-lg px-2.5 py-1.5 text-xs w-full font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none ${
                                              theme === 'dark' ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-800'
                                            }`}
                                            autoFocus
                                          />
                                          <textarea 
                                            placeholder="Details / Acceptance Criteria..."
                                            value={newTodoDetail} 
                                            onChange={(e) => setNewTodoDetail(e.target.value)}
                                            rows={2}
                                            className={`border rounded-lg p-2 text-[10px] w-full focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none ${
                                              theme === 'dark' ? 'bg-slate-955 border-slate-700 text-white placeholder-slate-650' : 'bg-white border-slate-300 text-slate-800'
                                            }`}
                                          />
                                          <div className="flex justify-end gap-1.5">
                                            <button 
                                              onClick={() => setAddingTodoToFeatureId(null)}
                                              className={`text-[10px] font-bold px-2.5 py-1 cursor-pointer ${
                                                theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                                              }`}
                                            >
                                              Cancel
                                            </button>
                                            <button 
                                              disabled={actionLoading[`add-todo-${feat.id}`] || !newTodoTitle.trim()}
                                              onClick={() => handleCreateTodo(feat.id)}
                                              className="bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black text-white px-3.5 py-1.5 rounded-lg shadow shadow-indigo-600/10 transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
                                            >
                                              Create Task
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div 
                                          onClick={() => setAddingTodoToFeatureId(feat.id)}
                                          className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl text-[10px] font-black uppercase cursor-pointer border border-dashed transition-all duration-200 shadow-sm hover:-translate-y-0.5 ${
                                            theme === 'dark' 
                                              ? 'bg-slate-950/20 text-indigo-400 hover:text-indigo-300 border-indigo-950 hover:border-indigo-900/60 shadow-indigo-950/30' 
                                              : 'bg-white text-indigo-650 hover:text-indigo-755 border-indigo-150 hover:border-indigo-250 shadow-slate-100'
                                          }`}
                                        >
                                          <svg className="w-3.5 h-3.5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
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
