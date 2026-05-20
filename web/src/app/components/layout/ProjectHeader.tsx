"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProject } from '@/lib/api';

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  onUpdate: (editing: boolean) => void;
  theme?: 'light' | 'dark';
}

export default function ProjectHeader({ project, onUpdate, theme = 'dark' }: ProjectHeaderProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete the project "${project.name}"? This action is irreversible and will delete all associated features, todos, and chat logs.`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteProject(project.id);
      router.push('/');
    } catch (error) {
      console.error(error);
      alert('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="text-xs mb-1 flex items-center gap-1.5">
          <Link 
            href="/" 
            className={`transition-colors flex items-center gap-1 font-semibold text-xs ${
              theme === 'dark' 
                ? 'text-slate-400 hover:text-indigo-400' 
                : 'text-slate-500 hover:text-indigo-650'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Projects</span>
          </Link>
        </div>
        <h1 className={`text-2xl font-extrabold tracking-tight ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent'
            : 'text-slate-900'
        }`}>
          {project.name}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdate(true)}
          className={`border px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-sm disabled:opacity-50 cursor-pointer ${
            theme === 'dark'
              ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700/80 hover:border-slate-650'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-755 border-slate-200 hover:border-slate-300'
          }`}
          disabled={deleting}
        >
          Edit PRD
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`border px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm cursor-pointer ${
            deleting ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            theme === 'dark'
              ? 'bg-rose-950/30 hover:bg-rose-900/50 text-rose-350 hover:text-rose-300 border-rose-900/40 hover:border-rose-800/80'
              : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200 hover:border-rose-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
          <span>{deleting ? 'Deleting...' : 'Delete Project'}</span>
        </button>
      </div>
    </div>
  );
}
