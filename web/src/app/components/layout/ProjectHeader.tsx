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
    <div className="w-full flex items-center gap-3 h-full px-2">
      <Link 
        href="/" 
        className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs uppercase tracking-wider border rounded transition-colors ${
          theme === 'dark' 
            ? 'border-[#30363d] hover:bg-[#30363d] text-[#c9d1d9]' 
            : 'border-[#d0d7de] hover:bg-[#e5e7eb] text-[#24292f]'
        }`}
      >
        <span>&larr; BACK</span>
      </Link>
      
      <div className={`h-6 w-px hidden sm:block ${theme === 'dark' ? 'bg-[#30363d]' : 'bg-[#d0d7de]'}`}></div>
      
      <h1 className={`font-mono font-bold text-sm truncate flex-1 ${
        theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'
      }`}>
        <span className={theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}>PROJECT: </span>
        {project.name}
      </h1>
      
      <div className="flex items-center gap-2">
        {/* Removed redundant EDIT PRD button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`px-3 py-1.5 text-xs font-bold uppercase rounded border transition-colors ${
            deleting ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            theme === 'dark'
              ? 'border-[#f85149]/30 bg-[#f85149]/10 hover:bg-[#f85149]/20 text-[#f85149]'
              : 'border-[#cf222e]/30 bg-[#cf222e]/10 hover:bg-[#cf222e]/20 text-[#cf222e]'
          }`}
        >
          {deleting ? 'DELETING...' : 'DELETE'}
        </button>
      </div>
    </div>
  );
}
