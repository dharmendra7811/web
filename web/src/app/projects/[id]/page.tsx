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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-400 font-medium animate-pulse text-sm">Retrieving command center...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Upper Navigation Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.06),transparent_45%)] pointer-events-none" />
      
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 relative z-10 space-y-6">
        
        {/* Header Area */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="space-y-1">
            <ProjectHeader project={project} onUpdate={setEditing} />
          </div>

          {/* Premium View Selector Toggles */}
          <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800/60 shadow-inner w-full lg:w-auto">
            <button
              onClick={() => setView('list')}
              className={`flex-1 lg:flex-none flex items-center justify-center gap-2 py-2 px-5 text-xs font-semibold rounded-lg transition-all duration-300 ${
                view === 'list' 
                  ? 'bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span>Explorer & Chat</span>
            </button>
            
            <button
              onClick={() => setView('graph')}
              className={`flex-1 lg:flex-none flex items-center justify-center gap-2 py-2 px-5 text-xs font-semibold rounded-lg transition-all duration-300 ${
                view === 'graph' 
                  ? 'bg-indigo-600 text-white shadow-[0_4px_12px_rgba(79,70,229,0.3)]' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1" />
              </svg>
              <span>Visual Topology</span>
            </button>
          </div>
        </div>

        {/* View Switch */}
        {view === 'list' ? (
          /* Redesigned List view: Explorer + Chat Panel side-by-side */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left side: PRD Management & Folder Tree Explorer */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-6">
              
              {/* Document/PRD uploads block */}
              <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-350">PRD Administration</h2>
                  </div>
                </div>

                <UploadZone 
                  projectId={id} 
                  onPRDChange={handlePRDChange} 
                  onPRDSubmit={handlePRDSubmit}
                  editing={editing}
                />
                
                {!editing && <IngestionProgress projectId={id} />}
              </div>

              {/* High-Fidelity Interactive Folder Tree Component */}
              <FolderTree projectId={id} />
              
            </div>
            
            {/* Right side: AI Requirements Assistant Chat Panel */}
            <div className="lg:col-span-5 xl:col-span-4 h-full">
              <div className="sticky top-6">
                <ChatPanel projectId={id} />
              </div>
            </div>

          </div>
        ) : (
          /* Full Width Graph View for immersive topology mapping */
          <div className="bg-slate-900/40 backdrop-blur border border-slate-800/80 rounded-2xl p-5 shadow-2xl">
            <GraphView projectId={id} />
          </div>
        )}

      </div>
    </div>
  );
}