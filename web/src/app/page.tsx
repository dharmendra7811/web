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
    if (!window.confirm(`Are you sure you want to delete the project "${projectName}"? This action is irreversible and will delete all associated features, todos, and chat logs.`)) {
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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Projects</h1>
      <form onSubmit={handleCreate} className="mb-4 flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="border p-2"
          required
        />
        <textarea
          value={prdText}
          onChange={(e) => setPrdText(e.target.value)}
          placeholder="PRD text (optional)"
          className="border p-2"
          rows={4}
        />
        <button
          type="submit"
          disabled={loading}
          className={`bg-blue-500 text-white px-4 py-2 rounded ${loading ? 'opacity-50' : ''}`}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
      <div className="mt-4">
        {loading && <p>Loading projects...</p>}
        {!loading && projects.length === 0 && <p>No projects yet.</p>}
        {!loading && projects.length > 0 && (
          <ul className="space-y-3">
            {projects?.map((project) => (
              <li key={project.id} className="flex justify-between items-center border p-4 rounded-lg hover:shadow-sm transition bg-white">
                <Link href={`/projects/${project.id}`} className="text-blue-600 hover:underline font-medium text-lg">
                  {project.name}
                </Link>
                <button
                  onClick={() => handleDelete(project.id, project.name)}
                  disabled={deletingId === project.id}
                  className={`text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-md transition text-sm flex items-center gap-1.5 ${deletingId === project.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Delete project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  {deletingId === project.id ? 'Deleting...' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}