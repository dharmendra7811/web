"use client";

import { useState, useEffect } from 'react';

interface Module {
  id: string;
  name: string;
  rank: number;
  summary: string;
  entities: string[];
  status: string;
  features_count: number;
}

interface Props {
  projectId: string;
  runId: string;
  phase: string;
  theme?: 'light' | 'dark';
  onContinue: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function ModuleReviewPanel({ projectId, runId, phase, theme = 'dark', onContinue }: Props) {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState('');

  const tc = (dark: string, light: string) => theme === 'dark' ? dark : light;

  useEffect(() => {
    if (runId) fetchModules();
  }, [runId]);

  const fetchModules = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/modules`);
      if (!res.ok) throw new Error('Failed to fetch modules');
      const data = await res.json();
      setModules(data.sort((a: Module, b: Module) => a.rank - b.rank));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateModule = async (moduleId: string, updates: Partial<Module>) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      return await res.json();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSkip = async (mod: Module) => {
    const newStatus = mod.status === 'skipped' ? 'pending' : 'skipped';
    await updateModule(mod.id, { status: newStatus });
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, status: newStatus } : m));
  };

  const handleMoveUp = async (idx: number) => {
    if (idx === 0) return;
    const a = modules[idx], b = modules[idx - 1];
    await updateModule(a.id, { rank: b.rank });
    await updateModule(b.id, { rank: a.rank });
    const updated = [...modules];
    [updated[idx], updated[idx - 1]] = [updated[idx - 1], updated[idx]];
    setModules(updated);
  };

  const handleMoveDown = async (idx: number) => {
    if (idx === modules.length - 1) return;
    const a = modules[idx], b = modules[idx + 1];
    await updateModule(a.id, { rank: b.rank });
    await updateModule(b.id, { rank: a.rank });
    const updated = [...modules];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setModules(updated);
  };

  const handleContinue = async () => {
    setContinuing(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}/continue`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to continue');
      onContinue();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setContinuing(false);
    }
  };

  if (loading) {
    return (
      <div className={`p-4 text-xs font-mono ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
        Loading modules...
      </div>
    );
  }

  const activeCount = modules.filter(m => m.status !== 'skipped').length;

  return (
    <div className="flex flex-col h-full">
      <div className={`px-4 py-2 border-b shrink-0 ${tc('bg-[#161b22] border-[#30363d]', 'bg-[#f6f8fa] border-[#d0d7de]')}`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-xs font-bold uppercase tracking-wider ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
            Module Review
          </h2>
          <span className={`text-[9px] ${tc('text-[#484f58]', 'text-[#8c959f]')}`}>
            {activeCount}/{modules.length} active
          </span>
        </div>
      </div>

      {error && (
        <div className={`px-4 py-2 text-xs ${tc('text-[#f85149]', 'text-[#cf222e]')}`}>
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {modules.map((mod, idx) => (
          <div
            key={mod.id}
            className={`px-3 py-2 border-b flex items-start gap-2 transition-colors ${
              mod.status === 'skipped' ? 'opacity-40' : ''
            } ${tc('border-[#30363d] hover:bg-[#161b22]', 'border-[#d0d7de] hover:bg-[#f6f8fa]')}`}
          >
            {/* Re-rank buttons */}
            <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
              <button onClick={() => handleMoveUp(idx)} disabled={idx === 0}
                className={`text-[9px] leading-none px-0.5 rounded ${tc('hover:bg-[#30363d] text-[#8b949e]', 'hover:bg-[#e5e7eb] text-[#57606a]')}`}
              >▲</button>
              <button onClick={() => handleMoveDown(idx)} disabled={idx === modules.length - 1}
                className={`text-[9px] leading-none px-0.5 rounded ${tc('hover:bg-[#30363d] text-[#8b949e]', 'hover:bg-[#e5e7eb] text-[#57606a]')}`}
              >▼</button>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold ${tc('text-[#a371f7]', 'text-[#8250df]')}`}>
                  #{mod.rank}
                </span>
                <span className={`text-xs font-semibold truncate ${tc('text-[#c9d1d9]', 'text-[#24292f]')}`}>
                  {mod.name}
                </span>
              </div>
              <p className={`text-[10px] mt-0.5 leading-relaxed ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                {mod.summary}
              </p>
              {mod.entities && mod.entities.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {mod.entities.map((e: string) => (
                    <span key={e} className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                      tc('bg-[#21262d] text-[#8b949e]', 'bg-[#e5e7eb] text-[#57606a]')
                    }`}>{e}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Skip toggle */}
            <button
              onClick={() => handleSkip(mod)}
              className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase transition-colors ${
                mod.status === 'skipped'
                  ? tc('border-[#f85149]/30 text-[#f85149] bg-[#f85149]/10', 'border-[#cf222e]/30 text-[#cf222e] bg-[#cf222e]/10')
                  : tc('border-[#30363d] text-[#8b949e] hover:border-[#f85149]/30', 'border-[#d0d7de] text-[#57606a] hover:border-[#cf222e]/30')
              }`}
            >
              {mod.status === 'skipped' ? 'SKIP' : 'KEEP'}
            </button>
          </div>
        ))}
      </div>

      {/* Continue button */}
      {phase === 'awaiting_modules' && (
        <div className={`px-4 py-3 border-t shrink-0 ${tc('border-[#30363d]', 'border-[#d0d7de]')}`}>
          <button
            onClick={handleContinue}
            disabled={continuing || activeCount === 0}
            className={`w-full py-2 text-xs font-bold uppercase rounded border transition-colors ${
              continuing || activeCount === 0
                ? 'opacity-50 cursor-not-allowed'
                : tc(
                  'border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/10',
                  'border-[#1a7f37]/40 text-[#1a7f37] hover:bg-[#1a7f37]/10'
                )
            } ${tc('border-[#30363d]', 'border-[#d0d7de]')}`}
          >
            {continuing
              ? 'STARTING EXTRACTION...'
              : `CONTINUE WITH ${activeCount} MODULE${activeCount !== 1 ? 'S' : ''}`
            }
          </button>
          <p className={`text-[9px] mt-1 text-center ${tc('text-[#484f58]', 'text-[#8c959f]')}`}>
            Skipped modules will be removed. Extraction runs for active modules only.
          </p>
        </div>
      )}
    </div>
  );
}
