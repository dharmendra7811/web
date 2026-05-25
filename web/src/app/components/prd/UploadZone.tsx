"use client";

import { useState, useEffect } from 'react';

interface Section {
  heading: string;
  text: string;
  preview?: string;
}

interface UploadZoneProps {
  projectId: string;
  onPRDChange: (text: string) => void;
  onPRDSubmit: (confirmedSections?: Section[]) => void;
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
  const [view, setView] = useState<'editor' | 'confirm'>('editor');
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSectionIdx, setActiveSectionIdx] = useState<number | null>(null);

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

  const handleShowConfirm = async () => {
    setParsing(true);
    try {
      // Call endpoint to detect sections, sending the current unsaved text
      const res = await fetch(`${API_URL}/api/projects/${projectId}/detect-sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prdText }),
      });
      if (!res.ok) throw new Error('Failed to detect sections');
      const data = await res.json();
      setSections(data.sections || []);
      setView('confirm');
    } catch (err: any) {
      alert(`Section detection failed: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleSectionHeadingChange = (idx: number, newHeading: string) => {
    setSections(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], heading: newHeading };
      return updated;
    });
  };

  const handleSectionTextChange = (idx: number, newText: string) => {
    setSections(prev => {
      const updated = [...prev];
      updated[idx] = { 
        ...updated[idx], 
        text: newText,
        preview: newText.substring(0, 200) + (newText.length > 200 ? '...' : '')
      };
      return updated;
    });
  };

  const handleAddSection = () => {
    setSections(prev => [
      ...prev,
      { heading: 'New Section', text: 'Section details...', preview: 'Section details...' }
    ]);
    setActiveSectionIdx(sections.length);
  };

  const handleDeleteSection = (idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx));
    if (activeSectionIdx === idx) setActiveSectionIdx(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // When submitting from confirm view, we send confirmedSections
    await onPRDSubmit(view === 'confirm' ? sections : undefined);
    setSubmitting(false);
  };

  if (view === 'confirm') {
    return (
      <div className="flex flex-col h-full gap-4 font-mono">
        <div className={`p-3 border-b flex flex-col gap-2 ${
          theme === 'dark' ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'
        }`}>
          <span className={theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}>// REVIEW STRUCTURE:</span>
          <p className={`text-xs font-sans ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
            Confirm the detected sections below. You can edit names, modify details, or remove irrelevant parts to ensure high accuracy.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin pr-1 max-h-[350px]">
          {sections.map((section, idx) => (
            <div key={idx} className={`p-3 border rounded ${
              activeSectionIdx === idx 
                ? (theme === 'dark' ? 'border-[#58a6ff] bg-[#0d1117]' : 'border-[#0969da] bg-[#ffffff]')
                : (theme === 'dark' ? 'border-[#30363d] bg-[#161b22]/40' : 'border-[#d0d7de] bg-[#f6f8fa]/40')
            }`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <input
                  type="text"
                  value={section.heading}
                  onChange={(e) => handleSectionHeadingChange(idx, e.target.value)}
                  className={`text-xs font-bold px-2 py-1 border flex-1 rounded outline-none ${
                    theme === 'dark' 
                      ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] focus:border-[#58a6ff]' 
                      : 'bg-[#ffffff] border-[#d0d7de] text-[#24292f] focus:border-[#0969da]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setActiveSectionIdx(activeSectionIdx === idx ? null : idx)}
                  className={`text-[10px] px-2 py-1 border hover:bg-opacity-85 ${
                    theme === 'dark' ? 'border-[#30363d] bg-[#21262d] text-[#c9d1d9]' : 'border-[#d0d7de] bg-[#e5e7eb] text-[#24292f]'
                  }`}
                >
                  {activeSectionIdx === idx ? 'HIDE' : 'EDIT'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSection(idx)}
                  className="text-red-500 hover:text-red-400 p-1 text-xs"
                  title="Delete Section"
                >
                  ✕
                </button>
              </div>

              {activeSectionIdx === idx ? (
                <textarea
                  value={section.text}
                  onChange={(e) => handleSectionTextChange(idx, e.target.value)}
                  rows={6}
                  className={`w-full p-2 text-xs font-sans border rounded outline-none resize-none ${
                    theme === 'dark' 
                      ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] focus:border-[#58a6ff]' 
                      : 'bg-[#ffffff] border-[#d0d7de] text-[#24292f] focus:border-[#0969da]'
                  }`}
                />
              ) : (
                <p className={`text-xs font-sans line-clamp-2 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                  {section.preview || section.text}
                </p>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddSection}
            className={`w-full border border-dashed text-xs p-2 text-center transition-colors ${
              theme === 'dark' 
                ? 'border-[#30363d] hover:bg-[#161b22]/40 text-[#8b949e]' 
                : 'border-[#d0d7de] hover:bg-[#f6f8fa]/40 text-[#57606a]'
            }`}
          >
            + ADD CUSTOM SECTION
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 mt-2 border-t pt-3">
          <button
            type="button"
            onClick={() => setView('editor')}
            className={`px-4 py-2 text-xs font-bold uppercase border transition-colors ${
              theme === 'dark'
                ? 'border-[#30363d] bg-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#8b949e]'
                : 'border-[#d0d7de] bg-transparent text-[#57606a] hover:text-[#24292f] hover:border-[#57606a]'
            }`}
          >
            ← BACK
          </button>
          
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || sections.length === 0}
            className={`px-4 py-2 text-xs font-bold uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              theme === 'dark'
                ? 'bg-[#238636] hover:bg-[#2ea043] text-white border-transparent'
                : 'bg-[#2da44e] hover:bg-[#2c974b] text-white border-transparent'
            }`}
          >
            {submitting ? 'ANALYZING...' : 'RUN PIPELINE →'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleShowConfirm(); }} className="flex flex-col h-full gap-4 font-mono">
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
          {parsing ? 'DETECTING...' : 'PROCESS PRD'}
        </button>
      </div>
    </form>
  );
}
