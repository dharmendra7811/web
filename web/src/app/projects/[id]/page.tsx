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
    const handleUpdate = () => loadProject();
    window.addEventListener('prd-updated', handleUpdate);
    return () => window.removeEventListener('prd-updated', handleUpdate);
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

  const handlePRDChange = (text: string) => setPrdText(text);

  const handlePRDSubmit = async () => {
    setLoading(true);
    try {
      await updateProjectPRD(id, prdText);
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/projects/${id}/review`, {
        method: 'POST',
      });
      await loadProject();
      setEditing(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

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

  const loadRedmineProjects = async () => {
    try {
      const data = await getRedmineProjects(id);
      setRedmineProjects(data.projects || []);
      if (data.current_project) {
        setSelectedRedmineProject(data.current_project);
      }
    } catch (err) {
      console.error('Failed to load Redmine projects:', err);
    }
  };

  useEffect(() => {
    if (project?.redmine_project_identifier) {
      setSelectedRedmineProject(project.redmine_project_identifier);
    }
    loadRedmineProjects();
  }, [id, project?.redmine_project_identifier]);

  const handleSetRedmineProject = async () => {
    if (!selectedRedmineProject) {
      alert('Please select a Redmine project');
      return;
    }
    try {
      await setRedmineProject(id, selectedRedmineProject);
      alert(`Redmine project set to: ${selectedRedmineProject}`);
      await loadProject();
      await checkRedmineStatus();
    } catch (err: any) {
      alert(`Failed to set Redmine project: ${err.message}`);
    }
  };

  if (loading && !project) {
    return (
      <div className={`h-screen w-full flex items-center justify-center font-mono text-sm ${theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#ffffff] text-[#24292f]'}`}>
        <div className="flex gap-3 items-center">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin"></div>
          <span>[SYSTEM] Initializing Workspace Data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex flex-col font-sans overflow-hidden ${theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#ffffff] text-[#24292f]'}`}>

      {/* Utility Top Nav / Header */}
      <div className={`flex-none h-14 border-b flex items-center justify-between px-4 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>

        {/* Left: Project Header Component */}
        <div className="flex-1 overflow-hidden h-full flex items-center min-w-0">
          <ProjectHeader project={project} onUpdate={setEditing} theme={theme} />
        </div>

        {/* Right: Controls Toolbar */}
        <div className="flex items-center gap-3 ml-4 flex-none">

          {/* Redmine Toolset */}
          {redmineStatus?.configured && (
            <div className={`flex items-center border rounded text-xs ${theme === 'dark' ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-white'}`}>
              <div className={`px-2 py-1 font-mono uppercase tracking-wider font-semibold border-r ${theme === 'dark' ? 'border-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] text-[#57606a]'}`}>
                REDMINE
              </div>
              <select
                value={selectedRedmineProject}
                onChange={(e) => setSelectedRedmineProject(e.target.value)}
                className={`py-1 px-2 outline-none appearance-none cursor-pointer bg-transparent max-w-[150px] ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}
              >
                <option value="">-- Target --</option>
                {redmineProjects.map((p: any) => (
                  <option key={p.identifier} value={p.identifier}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={handleSetRedmineProject}
                className={`px-3 py-1 font-medium border-l hover:bg-indigo-600 hover:text-white transition-colors ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}
              >
                Set
              </button>
              {selectedRedmineProject && (
                <button
                  onClick={handleSyncToRedmine}
                  disabled={syncing}
                  className={`px-3 py-1 font-medium border-l flex items-center gap-1 transition-colors ${syncing ? 'opacity-50 cursor-wait' : 'hover:bg-green-600 hover:text-white'} ${theme === 'dark' ? 'border-[#30363d] text-green-400' : 'border-[#d0d7de] text-green-600'}`}
                >
                  {syncing ? 'Syncing...' : 'PUSH'}
                </button>
              )}
            </div>
          )}

          {/* View Toggles */}
          <div className={`flex items-center border rounded text-xs ${theme === 'dark' ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-white'}`}>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 font-medium ${view === 'list' ? (theme === 'dark' ? 'bg-[#30363d] text-white' : 'bg-[#e5e7eb] text-black') : (theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#f6f8fa]')}`}
            >
              Workspace
            </button>
            <button
              onClick={() => setView('graph')}
              className={`px-3 py-1 font-medium border-l ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'} ${view === 'graph' ? (theme === 'dark' ? 'bg-[#30363d] text-white' : 'bg-[#e5e7eb] text-black') : (theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#f6f8fa]')}`}
            >
              Topology
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={handleToggleTheme}
            className={`p-1.5 border rounded ${theme === 'dark' ? 'border-[#30363d] hover:bg-[#30363d] text-[#8b949e]' : 'border-[#d0d7de] hover:bg-[#e5e7eb] text-[#57606a]'}`}
          >
            {theme === 'dark' ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'list' ? (
          <>
            {/* Left Sidebar: PRD Admin */}
            <div className={`w-[25%] min-w-[300px] max-w-[450px] border-r flex flex-col overflow-y-auto ${theme === 'dark' ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
              <div className={`px-4 py-2 border-b text-xs font-mono font-bold uppercase tracking-wider sticky top-0 z-10 ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22] text-[#8b949e]' : 'border-[#d0d7de] bg-[#e5e7eb] text-[#57606a]'}`}>
                PRD Configuration
              </div>
              <div className="p-4 space-y-6">
                {project?.review_state === 'reviewing' && project.review_questions ? (
                  <ReviewPanel projectId={id} questions={project.review_questions} onClarify={loadProject} theme={theme} />
                ) : (
                  <UploadZone projectId={id} onPRDChange={handlePRDChange} onPRDSubmit={handlePRDSubmit} editing={editing} theme={theme} initialText={project?.prd_text || ""} />
                )}

                {!editing && project.review_state !== 'reviewing' && (
                  <div className={`mt-6 border-t pt-4 ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}>
                    <IngestionProgress projectId={id} theme={theme} />
                  </div>
                )}
              </div>
            </div>

            {/* Center Panel: Explorer (Folder Tree) */}
            <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0d1117]' : 'bg-white'}`}>
              <div className={`px-6 py-3 border-b flex items-center justify-between shadow-sm z-10 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
                <h2 className="text-lg font-bold tracking-tight">Workspace Explorer</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                <FolderTree projectId={id} theme={theme} />
              </div>
            </div>

            {/* Right Sidebar: Chat Assistant */}
            <div className={`w-[25%] min-w-[320px] max-w-[500px] border-l flex flex-col ${theme === 'dark' ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
              <div className="flex-1 overflow-hidden relative">
                <ChatPanel projectId={id} theme={theme} />
              </div>
            </div>
          </>
        ) : (
          /* Graph View Fullscreen */
          <div className={`flex-1 w-full h-full relative ${theme === 'dark' ? 'bg-[#0d1117]' : 'bg-[#ffffff]'}`}>
            <GraphView projectId={id} />
          </div>
        )}
      </div>
    </div>
  );
}