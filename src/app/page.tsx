"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProjects, createProject } from '@/lib/api';

export default function Home() {
  const [projects, setProjects] = useState<Array<any>>([]);
  const [name, setName] = useState('');
  const [prdText, setPrdText] = useState('');
  const [loading, setLoading] = useState(false);

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
          <ul className="space-y-2">
            {projects?.map((project) => (
              <li key={project.id} className="border p-2 rounded">
                <Link href={`/projects/${project.id}`} className="text-blue-600 hover:underline">
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}