"use client";

import { useState, useEffect } from 'react';

interface UploadZoneProps {
  projectId: string;
  onPRDChange: (text: string) => void;
  onPRDSubmit: () => void;
  editing: boolean;
  theme?: 'light' | 'dark';
  initialText?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function UploadZone({ 
  projectId, 
  onPRDChange, 
  onPRDSubmit,
  editing,
  theme = 'dark',
  initialText = ''
}: UploadZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPrdText(initialText);
  }, [initialText, editing]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsing(true);

    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();

      if (ext === 'txt' || ext === 'md') {
        const text = await readFileAsText(selectedFile);
        setPrdText(text);
        onPRDChange(text);
      } else if (ext === 'pdf' || ext === 'docx') {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const res = await fetch(`${API_URL}/api/parse`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
        const { text } = await res.json();
        setPrdText(text);
        onPRDChange(text);
      } else {
        setPrdText(`Unsupported file type: .${ext}`);
        onPRDChange(`Unsupported file type: .${ext}`);
      }
    } catch (err: any) {
      console.error('File parse error:', err);
      setPrdText(`Error parsing file: ${err.message}`);
      onPRDChange(`Error parsing file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrdText(e.target.value);
    onPRDChange(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onPRDSubmit();
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full gap-4 font-mono">
      {/* File Upload Zone - Only show if not editing existing PRD or explicitly requested */}
      <div className="flex flex-col gap-2">
        <label className={`text-[10px] font-bold uppercase tracking-wider ${
          theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'
        }`}>
          // UPLOAD DOCUMENT (.MD, .TXT, .PDF, .DOCX)
        </label>
        <div className="relative group">
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            disabled={parsing || submitting}
          />
          <div className={`border border-dashed p-3 text-center transition-colors ${
            parsing || submitting ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            theme === 'dark' 
              ? 'border-[#30363d] bg-[#161b22] group-hover:bg-[#21262d] group-hover:border-[#8b949e]' 
              : 'border-[#d0d7de] bg-[#f6f8fa] group-hover:bg-[#e5e7eb] group-hover:border-[#57606a]'
          }`}>
            {parsing ? (
              <span className={`text-xs ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>Parsing {file?.name}...</span>
            ) : (
              <span className={`text-xs font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                {file ? `[ ${file.name} ]` : "[ DROP FILE OR CLICK ]"}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Text Editor Area */}
      <div className="flex flex-col gap-2 flex-1 min-h-[300px]">
        <label className={`text-[10px] font-bold uppercase tracking-wider ${
          theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'
        }`}>
          // RAW TEXT EDITOR
        </label>
        <textarea
          value={prdText}
          onChange={handleTextChange}
          placeholder="Paste PRD content here..."
          className={`flex-1 p-3 text-xs outline-none resize-none border ${
            theme === 'dark' 
              ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] focus:border-[#58a6ff]' 
              : 'bg-[#ffffff] border-[#d0d7de] text-[#24292f] focus:border-[#0969da]'
          }`}
          disabled={parsing || submitting}
        />
      </div>
      
      {/* Action Button */}
      <div className="flex justify-end mt-2">
        <button
          type="submit"
          disabled={parsing || submitting || !prdText.trim()}
          className={`px-4 py-2 text-xs font-bold uppercase border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            theme === 'dark'
              ? 'bg-[#238636] hover:bg-[#2ea043] text-white border-transparent'
              : 'bg-[#2da44e] hover:bg-[#2c974b] text-white border-transparent'
          }`}
        >
          {submitting ? 'PROCESSING...' : (editing ? 'SAVE CHANGES' : 'PROCESS PRD')}
        </button>
      </div>
    </form>
  );
}
