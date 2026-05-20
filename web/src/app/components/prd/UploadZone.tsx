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
      // In a real app, you would parse the file here
      // For now, we'll just set a placeholder
      setPrdText(`PRD content from ${selectedFile.name}\n\n[Content would be extracted here]`);
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
    <div className="border rounded p-4">
      <h2 className="text-lg font-semibold mb-2">PRD Upload</h2>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="block text-sm font-medium mb-1">Upload PRD File</label>
          <input
            type="file"
            accept=".pdf,.docx,.md,.txt"
            onChange={handleFileChange}
            className="border p-2 w-full"
            disabled={editing}
          />
          {file && (
            <p className="text-xs text-gray-500 mt-1">
              Selected: {file.name}
            </p>
          )}
        </div>
        
        {!editing && (
          <div>
            <label className="block text-sm font-medium mb-1">Or paste PRD text</label>
            <textarea
              value={prdText}
              onChange={handleTextChange}
              rows={4}
              className="border p-2 w-full"
              disabled={editing}
            />
          </div>
        )}
        
        <button
          type="submit"
          disabled={editing || !prdText.trim()}
          className={`bg-blue-500 text-white px-4 py-2 rounded ${editing || !prdText.trim() ? 'opacity-50' : ''}`}
        >
          {editing ? 'Saving...' : 'Submit PRD'}
        </button>
      </form>
    </div>
  );
}