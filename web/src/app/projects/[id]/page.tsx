"use client";

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import UploadZone from '@/app/components/prd/UploadZone';
import IngestionProgress from '@/app/components/prd/IngestionProgress';
import FolderTree from '@/app/components/features/FolderTree';
import ChatPanel from '@/app/components/chat/ChatPanel';
import GraphView from '@/app/components/graph/GraphView';
import ProjectHeader from '@/app/components/layout/ProjectHeader';
import { getProject, updateProjectPRD } from '@/lib/api';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [editing, setEditing] = useState(false);
  const [prdText, setPrdText] = useState('');
  
  // Theme state: default to dark, save/load from localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('requirements-os-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
    }
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('requirements-os-theme', nextTheme);
  };

  useEffect(() => {
    loadProject();
    
    const handleUpdate = () => {
      loadProject();
    };
    window.addEventListener('prd-updated', handleUpdate);
    return () => {
      window.removeEventListener('prd-updated', handleUpdate);
    };
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const data = await getProject(id);
      setProject(data);
      setPrdText(data.prd_text || '');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePRDChange = (text: string) => {
    setPrdText(text);
  };

  const handlePRDSubmit = async () => {
    setLoading(true);
    try {
      await updateProjectPRD(id, prdText);
      await loadProject(); // Reload to get updated summary
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !project) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${
        theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800'
      }`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className={`font-medium animate-pulse text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Retrieving command center...
        </p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-300 ${
      theme === 'dark' ? 'bg-[#080b11] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
    }`}>
      
      {/* Upper Navigation Mesh */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
        theme === 'dark' 
          ? 'bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.06),transparent_45%)] opacity-100' 
          : 'bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.03),transparent_45%)] opacity-100'
      }`} />
      
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 relative z-10 space-y-6">
        
        {/* Header Area */}
        <div className={`backdrop-blur-xl border rounded-2xl p-5 shadow-2xl flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between transition-all duration-300 ${
          theme === 'dark' 
            ? 'bg-slate-900/60 border-slate-800/80 shadow-slate-950/20' 
            : 'bg-white/80 border-slate-200/80 shadow-slate-200/40'
        }`}>
          <div className="space-y-1 flex-1 w-full">
            <ProjectHeader project={project} onUpdate={setEditing} theme={theme} />
          </div>

          {/* Controls (Theme Toggle + View Toggles) */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
            
            {/* Theme Toggle Button */}
            <button
              onClick={handleToggleTheme}
              className={`p-2.5 rounded-xl border cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700/85 text-yellow-400 hover:text-yellow-300 hover:bg-slate-750'
                  : 'bg-white border-slate-200 text-indigo-600 hover:text-indigo-700 hover:bg-slate-50'
              }`}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
              {theme === 'dark' ? (
                // Sun Icon
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                // Moon Icon
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Premium View Selector Toggles */}
            <div className={`flex items-center p-1.5 rounded-xl border shadow-inner transition-colors duration-300 ${
              theme === 'dark' ? 'bg-slate-950 border-slate-800/60' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setView('list')}
                className={`flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${
                  view === 'list' 
                    ? 'bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)]' 
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span>Explorer & Chat</span>
              </button>
              
              <button
                onClick={() => setView('graph')}
                className={`flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${
                  view === 'graph' 
                    ? 'bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)]' 
                    : theme === 'dark'
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1" />
                </svg>
                <span>Visual Topology</span>
              </button>
            </div>

          </div>
        </div>

        {/* View Switch */}
        {view === 'list' ? (
          /* Redesigned List view: Explorer + Chat Panel side-by-side */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left side: PRD Management & Folder Tree Explorer */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
              
              {/* Document/PRD uploads block */}
              <div className={`backdrop-blur border rounded-2xl p-5 shadow-lg space-y-4 transition-all duration-300 ${
                theme === 'dark' 
                  ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' 
                  : 'bg-white border-slate-200/80 shadow-slate-100'
              }`}>
                <div className={`flex items-center justify-between border-b pb-3 ${
                  theme === 'dark' ? 'border-slate-800/50' : 'border-slate-150'
                }`}>
                  <div className="flex items-center gap-2">
                    <svg className="w-4.5 h-4.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <h2 className={`text-xs font-extrabold uppercase tracking-wider ${
                      theme === 'dark' ? 'text-slate-350' : 'text-slate-600'
                    }`}>
                      PRD Administration
                    </h2>
                  </div>
                </div>

                <UploadZone 
                  projectId={id} 
                  onPRDChange={handlePRDChange} 
                  onPRDSubmit={handlePRDSubmit}
                  editing={editing}
                  theme={theme}
                />
                
                {!editing && <IngestionProgress projectId={id} theme={theme} />}
              </div>

              {/* High-Fidelity Interactive Folder Tree Component */}
              <FolderTree projectId={id} theme={theme} />
              
            </div>
            
            {/* Right side: AI Requirements Assistant Chat Panel */}
            <div className="lg:col-span-5 xl:col-span-4 h-full">
              <div className="sticky top-6">
                <ChatPanel projectId={id} theme={theme} />
              </div>
            </div>

          </div>
        ) : (
          /* Full Width Graph View for immersive topology mapping */
          <div className={`backdrop-blur border rounded-2xl p-5 shadow-2xl transition-all duration-300 ${
            theme === 'dark' 
              ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20' 
              : 'bg-white border-slate-200/80 shadow-slate-100'
          }`}>
            <GraphView projectId={id} />
          </div>
        )}

      </div>
    </div>
  );
}