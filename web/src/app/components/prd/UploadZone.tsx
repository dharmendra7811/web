"use client";

import { useState } from 'react';

interface UploadZoneProps {
  projectId: string;
  onPRDChange: (text: string) => void;
  onPRDSubmit: () => void;
  editing: boolean;
}

export default function UploadZone({ 
  projectId, 
  onPRDChange, 
  onPRDSubmit,
  editing
}: UploadZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Simulating file content parsing
      const simText = `PRD content from ${selectedFile.name}\n\n[Parsed Feature Specifications and Objectives]`;
      setPrdText(simText);
      onPRDChange(simText);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrdText(e.target.value);
    onPRDChange(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onPRDSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* File Upload Zone */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
          Upload PRD File (.pdf, .docx, .md, .txt)
        </label>
        <div className="relative group">
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={editing}
          />
          <div className={`border border-dashed border-slate-800 rounded-xl p-4 text-center transition-all bg-slate-950/20 group-hover:bg-slate-950/50 group-hover:border-slate-700/80 ${editing ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <svg className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-80 group-hover:scale-110 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-xs text-slate-350 font-semibold block">
              {file ? `Selected: ${file.name}` : "Drag and drop or click to choose file"}
            </span>
            <span className="text-[10px] text-slate-500 mt-1 block">Supported up to 20MB</span>
          </div>
        </div>
      </div>
      
      {/* Text Area पेस्ट */}
      {!editing && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
            Or Paste Raw PRD Content
          </label>
          <textarea
            value={prdText}
            onChange={handleTextChange}
            rows={4}
            placeholder="Type or paste the complete PRD technical contents here..."
            className="bg-slate-950 border border-slate-850/60 rounded-xl p-3 w-full text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/80 transition-all resize-none"
            disabled={editing}
          />
        </div>
      )}
      
      {/* Action Button */}
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={editing || !prdText.trim()}
          className={`flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:shadow-indigo-750/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {editing ? (
            <>
              <span className="animate-spin rounded-full h-3 w-3 border-t border-b border-white"></span>
              <span>Saving Document...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Submit PRD</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}