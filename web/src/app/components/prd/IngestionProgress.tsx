"use client";

import { useEffect, useState } from 'react';
import { getIngestStatus } from '@/lib/api';

interface IngestionProgressProps {
  projectId: string;
}

export default function IngestionProgress({ projectId }: IngestionProgressProps) {
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
    // If done or idle, don't show large blocking indicator or keep it very subtle
    if (status === 'done') {
      return (
        <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-400">PRD ingestion successful</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">100% complete</span>
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
    <div className="bg-slate-950/40 border border-slate-850/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {status !== 'error' && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          )}
          <span className="font-bold text-slate-300 uppercase tracking-wide">
            {getStatusText(status)}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-indigo-400">{progress}%</span>
      </div>

      {/* Sleek Gradient Progress Bar */}
      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/40">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            status === 'error' 
              ? 'bg-rose-500' 
              : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]'
          }`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <p className="text-[10px] text-slate-450 leading-relaxed italic">{message}</p>
    </div>
  );
}