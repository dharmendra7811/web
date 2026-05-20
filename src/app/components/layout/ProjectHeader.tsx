"use client";

import Link from 'next/link';

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    description?: string;
  };
  onUpdate: (editing: boolean) => void;
}

export default function ProjectHeader({ project, onUpdate }: ProjectHeaderProps) {
  return (
    <div className="flex justify-between items-center border-b pb-4 mb-4">
      <div>
        <div className="text-sm text-gray-500 mb-1">
          <Link href="/" className="hover:underline">← Back to Projects</Link>
        </div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
      </div>
      <div>
        <button
          onClick={() => onUpdate(true)}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm transition"
        >
          Edit PRD
        </button>
      </div>
    </div>
  );
}
