"use client";

import { useEffect, useState } from 'react';
import { getIngestStatus } from '@/lib/api';

interface IngestionProgressProps {
  projectId: string;
  theme?: 'light' | 'dark';
}

export default function IngestionProgress({ projectId, theme = 'dark' }: IngestionProgressProps) {
  const [status, setStatus] = useState('idle'); // idle, extracting_features, generating_todos, done, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await getIngestStatus(projectId);
        setStatus(res.status);
        setProgress(res.progress);
        setMessage(res.message);
        
        if (res.status === 'done' || res.status === 'error' || res.status === 'idle') {
          if (intervalId) clearInterval(intervalId);
        }
      } catch (error) {
        console.error(error);
        setStatus('error');
        setMessage('Error checking ingestion status');
        if (intervalId) clearInterval(intervalId);
      }
    };

    // Run check immediately on mount
    checkStatus();

    intervalId = setInterval(checkStatus, 2000);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [projectId]);

  if (status === 'idle' || status === 'done' && progress >= 100) {
    if (status === 'done') {
      return (
        <div className={`border rounded-xl p-3 flex items-center justify-between transition-colors ${
          theme === 'dark' 
            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-450' 
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                theme === 'dark' ? 'bg-emerald-400' : 'bg-emerald-500'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                theme === 'dark' ? 'bg-emerald-500' : 'bg-emerald-600'
              }`}></span>
            </span>
            <span className="text-[11px] font-bold">PRD ingestion successful</span>
          </div>
          <span className={`text-[10px] font-mono font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            100% complete
          </span>
        </div>
      );
    }
    return null;
  }

  const getStatusText = (s: string) => {
    switch (s) {
      case 'extracting_features': return 'Extracting Features...';
      case 'generating_todos': return 'Decomposing Technical Tasks...';
      case 'error': return 'Triage Interrupted';
      default: return 'Processing PRD...';
    }
  };

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-colors ${
      theme === 'dark' 
        ? 'bg-slate-950/40 border-slate-850/50' 
        : 'bg-slate-50 border-slate-200/80 shadow-inner'
    }`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {status !== 'error' && (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                theme === 'dark' ? 'bg-indigo-400' : 'bg-indigo-500'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                theme === 'dark' ? 'bg-indigo-500' : 'bg-indigo-600'
              }`}></span>
            </span>
          )}
          <span className={`font-extrabold uppercase tracking-wide ${
            theme === 'dark' ? 'text-slate-350' : 'text-slate-700'
          }`}>
            {getStatusText(status)}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-indigo-550">{progress}%</span>
      </div>

      {/* Sleek Gradient Progress Bar */}
      <div className={`w-full rounded-full h-2 overflow-hidden border ${
        theme === 'dark' ? 'bg-slate-900 border-slate-800/40' : 'bg-slate-200 border-slate-300/40'
      }`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            status === 'error' 
              ? 'bg-rose-500' 
              : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 shadow-[0_0_8px_rgba(99,102,241,0.35)]'
          }`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <p className={`text-[10px] leading-relaxed italic ${
        theme === 'dark' ? 'text-slate-450' : 'text-slate-600'
      }`}>
        {message}
      </p>
    </div>
  );
}