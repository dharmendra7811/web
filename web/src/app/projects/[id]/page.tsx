"use client";

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import UploadZone from '@/app/components/prd/UploadZone';
import ReviewPanel from '@/app/components/prd/ReviewPanel';
import IngestionProgress from '@/app/components/prd/IngestionProgress';
import FolderTree from '@/app/components/features/FolderTree';
import ChatPanel from '@/app/components/chat/ChatPanel';
import GraphView from '@/app/components/graph/GraphView';
import ProjectHeader from '@/app/components/layout/ProjectHeader';
import { getProject, updateProjectPRD, syncProjectToRedmine, getRedmineStatus, getRedmineProjects, setRedmineProject } from '@/lib/api';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [editing, setEditing] = useState(false);
  const [prdText, setPrdText] = useState('');

  // Theme state: default to dark, save/load from localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Redmine sync state
  const [redmineStatus, setRedmineStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [redmineProjects, setRedmineProjects] = useState<any[]>([]);
  const [selectedRedmineProject, setSelectedRedmineProject] = useState<string>('');

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
      // Trigger review instead of direct extraction
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/projects/${id}/review`, {
        method: 'POST',
      });
      await loadProject(); // Reload to get review state
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Redmine status check on mount
  useEffect(() => {
    checkRedmineStatus();
  }, [id]);

  const checkRedmineStatus = async () => {
    try {
      const status = await getRedmineStatus(id);
      setRedmineStatus(status);
    } catch (err) {
      console.error('Failed to check Redmine status:', err);
    }
  };

  const handleSyncToRedmine = async () => {
    setSyncing(true);
    try {
      const result = await syncProjectToRedmine(id);
      alert(`Successfully synced to Redmine! Synced ${result.features?.length || 0} features and ${result.todos?.length || 0} todos.`);
      await checkRedmineStatus();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Load available Redmine projects
  const loadRedmineProjects = async () => {
    try {
      const data = await getRedmineProjects(id);
      setRedmineProjects(data.projects || []);
      // If a Redmine project is already set for this project, pre-select it
      if (data.current_project) {
        setSelectedRedmineProject(data.current_project);
      }
    } catch (err) {
      console.error('Failed to load Redmine projects:', err);
    }
  };

  // Load current Redmine project setting for this project
  useEffect(() => {
    if (project?.redmine_project_identifier) {
      setSelectedRedmineProject(project.redmine_project_identifier);
    }
    loadRedmineProjects();
  }, [id, project?.redmine_project_identifier]);

  // Set Redmine project for this requirements-os project
  const handleSetRedmineProject = async () => {
    if (!selectedRedmineProject) {
      alert('Please select a Redmine project');
      return;
    }
    try {
      await setRedmineProject(id, selectedRedmineProject);
      alert(`Redmine project set to: ${selectedRedmineProject}`);
      await loadProject(); // Reload project to get updated setting
      await checkRedmineStatus(); // Refresh status with new project
    } catch (err: any) {
      alert(`Failed to set Redmine project: ${err.message}`);
    }
  };

  if (loading && !project) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800'
        }`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className={`font-medium animate-pulse text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
          Retrieving command center...
        </p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500/30 selection:text-indigo-200 transition-colors duration-300 ${theme === 'dark' ? 'bg-[#080b11] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
      }`}>

      {/* Upper Navigation Mesh */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${theme === 'dark'
        ? 'bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.06),transparent_45%)] opacity-100'
        : 'bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.03),transparent_45%)] opacity-100'
        }`} />

      <div className="max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 relative z-10 space-y-6">

        {/* Header Area */}
        <div className={`backdrop-blur-xl border rounded-2xl p-5 shadow-2xl flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between transition-all duration-300 ${theme === 'dark'
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
              className={`p-2.5 rounded-xl border cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 ${theme === 'dark'
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

            {/* Redmine Sync Button */}
            {redmineStatus?.configured && (
              <button
                onClick={handleSyncToRedmine}
                disabled={syncing}
                className={`p-2.5 rounded-xl border cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2
                  ${syncing ? 'opacity-50 cursor-not-allowed' : ''}
                  ${theme === 'dark'
                    ? 'bg-slate-800 border-slate-700/85 text-orange-400 hover:text-orange-300 hover:bg-slate-750'
                    : 'bg-white border-slate-200 text-orange-600 hover:text-orange-700 hover:bg-slate-50'
                  }`}
                title="Sync to Redmine"
              >
                {syncing ? (
                  <div className="w-4 h-4 border-2 border-t-orange-400 rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.953 8.953 0 0112 21c-4.478 0-8.268-2.943-9.542-7h5.742m-5.742 7H4m12-12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="text-xs font-bold">Sync to Redmine</span>
              </button>
            )}

            {/* Redmine Project Configuration */}
            {redmineStatus?.configured && (
              <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${theme === 'dark' ? 'bg-slate-800 border-slate-700/85' : 'bg-white border-slate-200'}`}>
                <span className="text-slate-500">Syncing to:</span>
                <select
                  value={selectedRedmineProject}
                  onChange={(e) => setSelectedRedmineProject(e.target.value)}
                  className="text-xs p-1 border rounded bg-transparent"
                >
                  <option value="">-- Select Redmine Project --</option>
                  {redmineProjects.map((p: any) => (
                    <option key={p.identifier} value={p.identifier}>{p.name} ({p.identifier})</option>
                  ))}
                </select>
                <button
                  onClick={handleSetRedmineProject}
                  className="px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 text-xs"
                >
                  Save
                </button>
                {selectedRedmineProject && (
                  <span className="text-xs text-green-600">✓ {selectedRedmineProject}</span>
                )}
              </div>
            )}

            {/* Premium View Selector Toggles */}
            <div className={`flex items-center p-1.5 rounded-xl border shadow-inner transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 border-slate-800/60' : 'bg-slate-100 border-slate-200'
              }`}>
              <button
                onClick={() => setView('list')}
                className={`flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${view === 'list'
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
                className={`flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-bold rounded-lg cursor-pointer transition-all duration-300 ${view === 'graph'
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
              <div className={`backdrop-blur border rounded-2xl p-5 shadow-lg space-y-4 transition-all duration-300 ${theme === 'dark'
                ? 'bg-slate-900/40 border-slate-800/80 shadow-slate-950/20'
                : 'bg-white border-slate-200/80 shadow-slate-100'
                }`}>
                <div className={`flex items-center justify-between border-b pb-3 ${theme === 'dark' ? 'border-slate-800/50' : 'border-slate-150'
                  }`}>
                  <div className="flex items-center gap-2">
                    <svg className="w-4.5 h-4.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <h2 className={`text-xs font-extrabold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-350' : 'text-slate-600'
                      }`}>
                      PRD Administration
                    </h2>
                  </div>
                </div>

                {project?.review_state === 'reviewing' && project.review_questions ? (
                  <ReviewPanel
                    projectId={id}
                    questions={project.review_questions}
                    onClarify={loadProject}
                    theme={theme}
                  />
                ) : (
                  <UploadZone
                    projectId={id}
                    onPRDChange={handlePRDChange}
                    onPRDSubmit={handlePRDSubmit}
                    editing={editing}
                    theme={theme}
                  />
                )}

                {!editing && project.review_state !== 'reviewing' && <IngestionProgress projectId={id} theme={theme} />}
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
          <div className={`backdrop-blur border rounded-2xl p-5 shadow-2xl transition-all duration-300 ${theme === 'dark'
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