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

  const toggleAllFeatures = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project?.features) return;
    
    const anyExpanded = project.features.some((feat: Feature) => expandedNodes[`feature-${feat.id}`]);
    const shouldExpand = !anyExpanded;
    
    const nextState = { ...expandedNodes };
    project.features.forEach((feat: Feature) => {
      nextState[`feature-${feat.id}`] = shouldExpand;
      if (feat.todos) {
        feat.todos.forEach((todo: Todo) => {
          nextState[`todo-${todo.id}`] = shouldExpand;
        });
      }
    });
    setExpandedNodes(nextState);
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
    <div className={`flex flex-col h-full overflow-hidden font-mono text-sm transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#f6f8fa] text-[#24292f]'
    }`}>
      {/* Explorer Header */}
      <div className={`px-4 py-3 flex items-center justify-between transition-colors ${
        theme === 'dark' ? 'bg-[#161b22] border-b border-[#30363d]' : 'bg-[#ffffff] border-b border-[#d0d7de]'
      }`}>
        <div className="flex items-center gap-3 font-bold tracking-wide uppercase text-xs">
          <span className={theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}>EXPLORER: REQUIREMENTS</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded font-bold transition-colors ${
          theme === 'dark' ? 'bg-[#30363d] text-[#c9d1d9]' : 'bg-[#e5e7eb] text-[#24292f]'
        }`}>
          {features.length} FEAT
        </span>
      </div>

      {/* Explorer Tree Body */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin select-none">
        
        {/* Project Root Folder */}
        <div className="px-3">
          <div 
            onClick={() => toggleExpand('root')}
            className={`flex items-center gap-2 py-2 px-2 cursor-pointer rounded transition-colors ${
              theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#e5e7eb]'
            }`}
          >
            <span className={`transform transition-transform duration-100 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'} ${expandedNodes.root ? 'rotate-90' : ''}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </span>
            <span className="text-[#e3b341]">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
            </span>
            <span className={`font-bold truncate text-base ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
              {project?.name || 'Workspace'}
            </span>
          </div>

          {/* Root Folder Content */}
          {expandedNodes.root && (
            <div className="ml-4 pl-3 border-l-2 border-[#30363d] mt-2 flex flex-col gap-2">
              
              {/* PRD Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('prd')}
                  className={`flex items-center gap-2 py-2 px-2 cursor-pointer rounded transition-colors ${
                    theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#e5e7eb]'
                  }`}
                >
                  <span className={`transform transition-transform duration-100 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'} ${expandedNodes.prd ? 'rotate-90' : ''}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </span>
                  <span className="text-[#a371f7]">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>
                  </span>
                  <span className={`text-sm ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>prd_document.md</span>
                </div>

                {expandedNodes.prd && (
                  <div className={`ml-5 pl-4 py-3 my-2 border-l-2 text-xs leading-relaxed whitespace-pre-wrap font-mono ${
                    theme === 'dark' ? 'border-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] text-[#57606a]'
                  }`}>
                    <div className="font-bold text-[#a371f7] mb-2 text-sm">// SUMMARY</div>
                    <p className="mb-4">{project?.summary || 'No summary.'}</p>
                    {project?.prd_text && (
                      <>
                        <div className="font-bold text-[#a371f7] mb-2 text-sm">// FULL TEXT</div>
                        <p className="line-clamp-[20] overflow-hidden">{project.prd_text}</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Features Folder */}
              <div>
                <div 
                  onClick={() => toggleExpand('featuresList')}
                  className={`flex items-center justify-between py-2 px-2 cursor-pointer rounded transition-colors ${
                    theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#e5e7eb]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`transform transition-transform duration-100 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'} ${expandedNodes.featuresList ? 'rotate-90' : ''}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </span>
                    <span className="text-[#3fb950]">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                    </span>
                    <span className={`text-sm ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>features/</span>
                  </div>
                  
                  {expandedNodes.featuresList && project?.features?.length > 0 && (
                    <button 
                      onClick={toggleAllFeatures}
                      className={`text-xs px-2 py-0.5 border rounded hover:bg-opacity-20 font-bold transition-colors ${
                        theme === 'dark' ? 'text-[#8b949e] border-[#30363d] hover:text-[#c9d1d9]' : 'text-[#57606a] border-[#d0d7de] hover:text-[#24292f]'
                      }`}
                    >
                      {project.features.some((f: any) => expandedNodes[`feature-${f.id}`]) ? '[-] COLLAPSE ALL' : '[+] EXPAND ALL'}
                    </button>
                  )}
                </div>

                {expandedNodes.featuresList && (
                  <div className="ml-5 pl-3 mt-2 border-l-2 border-[#30363d] flex flex-col gap-1.5">
                    {features.length === 0 ? (
                      <div className={`px-3 py-2 text-xs italic ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>// empty</div>
                    ) : (
                      features.map((feat: Feature) => {
                        const featKey = `feature-${feat.id}`;
                        const isExpanded = expandedNodes[featKey];
                        const isEditing = editingFeatureId === feat.id;
                        
                        return (
                          <div key={feat.id} className="group/feat flex flex-col">
                            <div className={`flex items-center justify-between gap-4 px-2 py-1.5 cursor-pointer rounded transition-colors ${
                              theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#e5e7eb]'
                            }`}>
                              <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => toggleExpand(featKey)}>
                                <span className={`transform transition-transform duration-100 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'} ${isExpanded ? 'rotate-90' : ''}`}>
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                                <span className="text-[#58a6ff]">
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                                </span>
                                
                                {isEditing ? (
                                  <input 
                                    type="text" 
                                    value={editFeatureTitle} 
                                    onChange={(e) => setEditFeatureTitle(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`w-full bg-transparent border-2 rounded px-2 py-1 outline-none ${theme === 'dark' ? 'border-[#58a6ff] text-[#c9d1d9] bg-[#0d1117]' : 'border-[#0969da] text-black bg-white'}`}
                                    autoFocus
                                  />
                                ) : (
                                  <span className={`truncate text-sm font-semibold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>{feat.title}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {isEditing ? (
                                  <div className="flex items-center gap-2 ml-3">
                                    <button onClick={() => handleUpdateFeature(feat.id)} className="text-[#3fb950] px-2 py-1 bg-[#3fb950]/10 hover:bg-[#3fb950]/20 rounded font-bold">SAVE</button>
                                    <button onClick={cancelEditFeature} className="text-[#f85149] px-2 py-1 bg-[#f85149]/10 hover:bg-[#f85149]/20 rounded font-bold">CANCEL</button>
                                  </div>
                                ) : (
                                  <div className="opacity-0 group-hover/feat:opacity-100 flex items-center gap-2">
                                    <button onClick={() => startEditFeature(feat)} className="text-[#8b949e] hover:text-[#58a6ff] px-2 py-1 rounded hover:bg-[#58a6ff]/10">✎ Edit</button>
                                    <button onClick={() => handleDeleteFeature(feat.id, feat.title)} className="text-[#8b949e] hover:text-[#f85149] px-2 py-1 rounded hover:bg-[#f85149]/10">🗑 Delete</button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Feature Body */}
                            {isExpanded && (
                              <div className="ml-5 pl-4 border-l-2 border-[#30363d] py-2 flex flex-col gap-2 text-xs">
                                {isEditing ? (
                                  <textarea 
                                    value={editFeatureDesc} 
                                    onChange={(e) => setEditFeatureDesc(e.target.value)}
                                    className={`w-full bg-transparent border-2 p-2 rounded outline-none resize-none mt-1 ${theme === 'dark' ? 'border-[#58a6ff] text-[#8b949e] bg-[#0d1117]' : 'border-[#0969da] bg-white'}`}
                                    rows={3}
                                    placeholder="Feature description..."
                                  />
                                ) : (
                                  feat.description && <div className={`px-2 py-1 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>/* {feat.description} */</div>
                                )}

                                {/* Critic notes — flagged by pipeline Stage 4/5 */}
                                {feat.critic_notes && (
                                  <div className={`px-2 py-1.5 border-l-2 text-xs leading-relaxed ${
                                    theme === 'dark'
                                      ? 'border-[#d29922] bg-[#d29922]/5 text-[#d29922]'
                                      : 'border-[#9a6700] bg-[#fff8c5] text-[#9a6700]'
                                  }`}>
                                    <span className="font-bold uppercase tracking-wide text-[10px] mr-1">⚠ CRITIC</span>
                                    {feat.critic_notes}
                                  </div>
                                )}

                                {/* Todos */}
                                <div className="mt-2 flex flex-col gap-1.5">
                                  {feat.todos?.map((todo: Todo) => {
                                    const isTodoEditing = editingTodoId === todo.id;
                                    const isTodoExpanded = expandedNodes[`todo-${todo.id}`];

                                    return (
                                      <div key={todo.id} className="group/todo flex flex-col">
                                        <div className={`flex items-center justify-between gap-4 px-2 py-1.5 cursor-pointer rounded ${theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#e5e7eb]'}`}>
                                          <div className="flex items-center gap-2 flex-1 min-w-0 pt-0.5" onClick={() => toggleExpand(`todo-${todo.id}`)}>
                                            <span className={`mt-0.5 transform transition-transform duration-100 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'} ${isTodoExpanded ? 'rotate-90' : ''}`}>
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </span>
                                            
                                            <div className="flex flex-col flex-1 min-w-0">
                                              {isTodoEditing ? (
                                                <input 
                                                  type="text" 
                                                  value={editTodoTitle} 
                                                  onChange={(e) => setEditTodoTitle(e.target.value)}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className={`w-full bg-transparent border-2 rounded px-2 py-1 outline-none ${theme === 'dark' ? 'border-[#3fb950] text-[#c9d1d9] bg-[#0d1117]' : 'border-[#2da44e] text-black bg-white'}`}
                                                  autoFocus
                                                />
                                              ) : (
                                                <span className={`truncate text-sm ${todo.status === 'done' ? 'line-through opacity-50' : ''} ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-black'}`}>
                                                  {todo.title}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 mt-0.5 shrink-0">
                                            <select
                                              value={todo.status}
                                              onChange={(e) => handleStatusChange(todo.id, e.target.value as Todo['status'])}
                                              onClick={(e) => e.stopPropagation()}
                                              className={`text-xs uppercase font-bold py-1 px-2 rounded border outline-none appearance-none cursor-pointer ${
                                                todo.status === 'done' ? 'bg-[#3fb950]/10 text-[#3fb950] border-[#3fb950]/30' :
                                                todo.status === 'in_progress' ? 'bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/30' :
                                                todo.status === 'blocked' ? 'bg-[#f85149]/10 text-[#f85149] border-[#f85149]/30' :
                                                theme === 'dark' ? 'bg-[#161b22] text-[#8b949e] border-[#30363d]' : 'bg-[#f6f8fa] text-[#57606a] border-[#d0d7de]'
                                              }`}
                                            >
                                              <option value="open">[OPEN]</option>
                                              <option value="in_progress">[PROG]</option>
                                              <option value="done">[DONE]</option>
                                              <option value="blocked">[BLCK]</option>
                                            </select>

                                            {isTodoEditing ? (
                                              <div className="flex items-center gap-1 ml-2">
                                                <button onClick={() => handleUpdateTodo(todo.id)} className="text-[#3fb950] px-2 py-1 bg-[#3fb950]/10 hover:bg-[#3fb950]/20 rounded font-bold">SAVE</button>
                                                <button onClick={cancelEditTodo} className="text-[#f85149] px-2 py-1 bg-[#f85149]/10 hover:bg-[#f85149]/20 rounded font-bold">CANCEL</button>
                                              </div>
                                            ) : (
                                              <div className="opacity-0 group-hover/todo:opacity-100 flex items-center gap-1">
                                                <button onClick={() => startEditTodo(todo)} className="text-[#8b949e] hover:text-[#58a6ff] px-2 py-1 rounded hover:bg-[#58a6ff]/10">✎ Edit</button>
                                                <button onClick={() => handleDeleteTodo(todo.id, todo.title)} className="text-[#8b949e] hover:text-[#f85149] px-2 py-1 rounded hover:bg-[#f85149]/10">🗑 Delete</button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {isTodoExpanded && (
                                          <div className={`ml-5 pl-3 py-2 mb-2 border-l-2 text-xs ${theme === 'dark' ? 'border-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] text-[#57606a]'}`}>
                                            {isTodoEditing ? (
                                              <textarea 
                                                value={editTodoDetail} 
                                                onChange={(e) => setEditTodoDetail(e.target.value)}
                                                className={`w-full bg-transparent border-2 p-2 rounded outline-none resize-none ${theme === 'dark' ? 'border-[#3fb950] bg-[#0d1117]' : 'border-[#2da44e] bg-white'}`}
                                                rows={3}
                                                placeholder="Task details..."
                                              />
                                            ) : (
                                              todo.detail && <p className="whitespace-pre-wrap leading-relaxed">{todo.detail}</p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Add Todo */}
                                {addingTodoToFeatureId === feat.id ? (
                                  <div className="mt-2 pl-5 flex flex-col gap-2">
                                    <input 
                                      type="text" 
                                      placeholder="Task title..."
                                      value={newTodoTitle} 
                                      onChange={(e) => setNewTodoTitle(e.target.value)}
                                      className={`w-full bg-transparent border-2 rounded p-2 outline-none ${theme === 'dark' ? 'border-[#3fb950] text-[#c9d1d9] bg-[#0d1117]' : 'border-[#2da44e] text-black bg-white'}`}
                                      autoFocus
                                    />
                                    <textarea 
                                      placeholder="Details..."
                                      value={newTodoDetail} 
                                      onChange={(e) => setNewTodoDetail(e.target.value)}
                                      className={`w-full bg-transparent border-2 p-2 rounded outline-none ${theme === 'dark' ? 'border-[#3fb950] text-[#c9d1d9] bg-[#0d1117]' : 'border-[#2da44e] text-black bg-white'}`}
                                      rows={3}
                                    />
                                    <div className="flex justify-end gap-2 mt-1">
                                      <button onClick={() => setAddingTodoToFeatureId(null)} className="text-[#8b949e] hover:text-[#c9d1d9] px-3 py-1.5">Cancel</button>
                                      <button onClick={() => handleCreateTodo(feat.id)} className="text-[#3fb950] bg-[#3fb950]/10 hover:bg-[#3fb950]/20 px-3 py-1.5 rounded font-bold">Add Task</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setAddingTodoToFeatureId(feat.id)}
                                    className={`mt-2 pl-5 text-left font-mono text-sm py-1 transition-colors ${theme === 'dark' ? 'text-[#8b949e] hover:text-[#c9d1d9]' : 'text-[#57606a] hover:text-black'}`}
                                  >
                                    + add_todo()
                                  </button>
                                )}

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
