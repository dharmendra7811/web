"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProjects, createProject, deleteProject } from '@/lib/api';

export default function Home() {
  const [projects, setProjects] = useState<Array<any>>([]);
  const [name, setName] = useState('');
  const [prdText, setPrdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createProject(name, prdText);
      setName('');
      setPrdText('');
      await fetchProjects();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, projectName: string) => {
    if (!window.confirm(`Are you sure you want to delete the project "${projectName}"? This action is irreversible.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteProject(id);
      await fetchProjects();
    } catch (error) {
      console.error(error);
      alert('Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-200">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="mb-12 text-center sm:text-left">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 mb-2">
            Workspaces
          </h1>
          <p className="text-lg text-zinc-500">Plan and manage your Redmine projects with ease.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Create Project Form */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 sticky top-6">
              <h2 className="text-xl font-bold mb-4 text-zinc-800">New Workspace</h2>
              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1">Project Name</label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Phoenix Redesign"
                    className="w-full border border-zinc-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200 bg-zinc-50 focus:bg-white"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="prd" className="block text-sm font-medium text-zinc-700 mb-1">PRD Details</label>
                  <textarea
                    id="prd"
                    value={prdText}
                    onChange={(e) => setPrdText(e.target.value)}
                    placeholder="Enter project requirements..."
                    className="w-full border border-zinc-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200 bg-zinc-50 focus:bg-white resize-none"
                    rows={5}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-sm shadow-indigo-200 transition-all duration-200 flex justify-center items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    'Create Workspace'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Project List */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-zinc-800">Active Projects</h2>
              <span className="bg-zinc-100 text-zinc-600 text-sm font-semibold px-3 py-1 rounded-full border border-zinc-200">
                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
              </span>
            </div>

            {loading && projects.length === 0 && (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse bg-white border border-zinc-200 rounded-2xl p-6 h-24"></div>
                ))}
              </div>
            )}

            {!loading && projects.length === 0 && (
              <div className="bg-white border border-dashed border-zinc-300 rounded-2xl p-12 text-center">
                <div className="mx-auto w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-medium text-zinc-900 mb-1">No projects yet</h3>
                <p className="text-zinc-500">Get started by creating a new workspace.</p>
              </div>
            )}

            {!loading && projects.length > 0 && (
              <div className="grid gap-4">
                {projects.map((project) => (
                  <div key={project.id} className="group flex flex-col sm:flex-row justify-between sm:items-center bg-white border border-zinc-200 p-5 rounded-2xl hover:border-indigo-300 hover:shadow-md transition-all duration-300">
                    <Link href={`/projects/${project.id}`} className="flex-1 block focus:outline-none">
                      <h3 className="text-xl font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors duration-200 mb-1">
                        {project.name}
                      </h3>
                      <p className="text-sm text-zinc-500 line-clamp-1">
                        {project.prd || 'No PRD description provided.'}
                      </p>
                    </Link>
                    <div className="mt-4 sm:mt-0 sm:ml-4 flex items-center justify-end">
                      <Link 
                        href={`/projects/${project.id}`}
                        className="mr-3 text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        Open Workspace
                      </Link>
                      <button
                        onClick={(e) => { e.preventDefault(); handleDelete(project.id, project.name); }}
                        disabled={deletingId === project.id}
                        className={`text-zinc-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-all duration-200 ${deletingId === project.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Delete project"
                      >
                        {deletingId === project.id ? (
                          <svg className="animate-spin h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}