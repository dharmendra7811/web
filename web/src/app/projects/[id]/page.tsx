"use client";

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import BrainstormChat from '@/app/components/chat/BrainstormChat';
import ArchitecturePanel from '@/app/components/prd/ArchitecturePanel';
import FolderTree from '@/app/components/features/FolderTree';
import GraphView from '@/app/components/graph/GraphView';
import PipelineStatus from '@/app/components/prd/PipelineStatus';
import CheckpointPanel from '@/app/components/prd/CheckpointPanel';
import ModuleReviewPanel from '@/app/components/prd/ModuleReviewPanel';
import ProjectHeader from '@/app/components/layout/ProjectHeader';
import { getProject, syncProjectToRedmine, getRedmineStatus, getRedmineProjects, setRedmineProject } from '@/lib/api';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'graph' | 'arch'>('list');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Redmine sync state
  const [redmineStatus, setRedmineStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [redmineProjects, setRedmineProjects] = useState<any[]>([]);
  const [selectedRedmineProject, setSelectedRedmineProject] = useState<string>('');
  const [pipelinePhase, setPipelinePhase] = useState<string>('idle');
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('requirements-os-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('requirements-os-theme', nextTheme);
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const data = await getProject(id);
      setProject(data);
      return data;
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Poll while entity-first extraction runs in background (state === 'parsing')
  useEffect(() => {
    if (!project || project.state !== 'parsing') return;
    const interval = setInterval(async () => {
      try {
        const data = await getProject(id);
        setProject(data);
        if (data.state !== 'parsing') {
          clearInterval(interval);
        }
      } catch (e) { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [project?.state]);

  const handleFeatureChange = () => loadProject();

  useEffect(() => { checkRedmineStatus(); }, [id]);

  const checkRedmineStatus = async () => {
    try {
      const status = await getRedmineStatus(id);
      setRedmineStatus(status);
    } catch (err) { console.error('Redmine status:', err); }
  };

  const handleSyncToRedmine = async () => {
    setSyncing(true);
    try {
      const result = await syncProjectToRedmine(id);
      alert(`Synced! ${result.features?.length || 0} features and ${result.todos?.length || 0} todos.`);
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
      if (data.current_project) setSelectedRedmineProject(data.current_project);
    } catch (err) { console.error('Redmine projects:', err); }
  };

  useEffect(() => {
    if (project?.redmine_project_identifier) setSelectedRedmineProject(project.redmine_project_identifier);
    loadRedmineProjects();
  }, [id, project?.redmine_project_identifier]);

  const handleSetRedmineProject = async () => {
    if (!selectedRedmineProject) { alert('Please select a Redmine project'); return; }
    try {
      await setRedmineProject(id, selectedRedmineProject);
      alert(`Redmine project set to: ${selectedRedmineProject}`);
      await loadProject();
      await checkRedmineStatus();
    } catch (err: any) { alert(`Failed: ${err.message}`); }
  };

  if (loading && !project) {
    return (
      <div className={`h-screen w-full flex items-center justify-center font-mono text-sm ${theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#ffffff] text-[#24292f]'}`}>
        <div className="flex gap-3 items-center">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent animate-spin"></div>
          <span>[SYSTEM] Initializing Workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full flex flex-col font-sans overflow-hidden ${theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#ffffff] text-[#24292f]'}`}>

      {/* Top Header */}
      <div className={`flex-none h-14 border-b flex items-center justify-between px-4 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
        <div className="flex-1 overflow-hidden h-full flex items-center min-w-0">
          <ProjectHeader project={project} onUpdate={loadProject} theme={theme} />
        </div>

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

          <PipelineStatus projectId={id} theme={theme} onPhaseChange={setPipelinePhase} onRunChange={(run) => setPipelineRunId(run?.id || null)} />

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
            <button
              onClick={() => setView('arch')}
              className={`px-3 py-1 font-medium border-l ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'} ${view === 'arch' ? (theme === 'dark' ? 'bg-[#30363d] text-white' : 'bg-[#e5e7eb] text-black') : (theme === 'dark' ? 'hover:bg-[#161b22]' : 'hover:bg-[#f6f8fa]')}`}
            >
              Architecture
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Brainstorm Chat — primary panel */}
        <div className={`flex-1 min-w-0 border-r ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}>
          <BrainstormChat projectId={id} pipelineRunId={pipelineRunId} theme={theme} onFeatureChange={handleFeatureChange} />
        </div>

        {/* Right panel: Workspace Explorer / Graph / Architecture */}
        {view === 'list' && (
          <div className="w-[35%] min-w-[500px] max-w-[800px] flex flex-col overflow-hidden">
            <div className={`px-4 py-2 border-b flex items-center justify-between shrink-0 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                Workspace Explorer
              </h2>
              <span className={`text-[9px] ${theme === 'dark' ? 'text-[#484f58]' : 'text-[#8c959f]'}`}>
                {pipelinePhase !== 'idle' ? pipelinePhase : project?.state || 'idle'}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {pipelinePhase === 'awaiting_modules' && pipelineRunId ? (
                <ModuleReviewPanel
                  projectId={id}
                  runId={pipelineRunId}
                  phase={pipelinePhase}
                  theme={theme}
                  onContinue={() => { loadProject(); setPipelinePhase('extract'); }}
                />
              ) : (
                <>
                  <CheckpointPanel projectId={id} theme={theme} onResolved={loadProject} />
                  <FolderTree projectId={id} theme={theme} />
                </>
              )}
            </div>
          </div>
        )}

        {view === 'graph' && (
          <div className="flex-1 w-full h-full relative">
            <GraphView projectId={id} />
          </div>
        )}

        {view === 'arch' && (
          <div className="w-[35%] min-w-[320px] max-w-[500px] flex flex-col overflow-hidden">
            <div className={`px-4 py-2 border-b shrink-0 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                Architecture Foundation
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ArchitecturePanel project={project} theme={theme} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
