"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { getPipelineRuns, retryPipelineRun } from '@/lib/api';
import type { PipelineRun } from '@/lib/api';

interface PipelineStatusProps {
  projectId: string;
  theme: 'light' | 'dark';
  onPhaseChange?: (phase: string) => void;
}

// The 6 display phases (ordered left-to-right in the progress bar)
const PHASES = ['chunking', 'features', 'critic', 'schema', 'api', 'todo'] as const;
const PHASE_LABELS: Record<string, string> = {
  chunking: 'Chunking',
  features: 'Features',
  critic: 'Critic',
  schema: 'Schema',
  api: 'API',
  todo: 'Todo',
};

// Phases that are considered "completed" before a given phase index
function phaseIndex(phase: string): number {
  // awaiting_human is the Critic phase waiting for input
  if (phase === 'awaiting_human') return PHASES.indexOf('critic');
  if (phase === 'done') return PHASES.length; // all done
  if (phase === 'failed') return -1; // handled separately
  if (phase === 'idle') return -1;
  return PHASES.indexOf(phase as (typeof PHASES)[number]);
}

type PhaseStatus = 'complete' | 'current' | 'awaiting_human' | 'pending' | 'failed';

function getPhaseStatus(run: PipelineRun | null, target: string): PhaseStatus {
  if (!run || run.phase === 'idle') return 'pending';

  const currentIdx = phaseIndex(run.phase);
  const targetIdx = PHASES.indexOf(target as (typeof PHASES)[number]);

  if (run.phase === 'failed') {
    // The failed phase itself is marked failed, earlier ones are complete
    const failedIdx = phaseIndex(run.resume_from_phase || run.phase);
    if (targetIdx < failedIdx) return 'complete';
    if (targetIdx === failedIdx) return 'failed';
    return 'pending';
  }

  // awaiting_human on critic phase
  if (run.phase === 'awaiting_human' && target === 'critic') return 'awaiting_human';

  if (targetIdx < currentIdx) return 'complete';
  if (targetIdx === currentIdx) return 'current';
  return 'pending';
}

export default function PipelineStatus({ projectId, theme, onPhaseChange }: PipelineStatusProps) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const runs = await getPipelineRuns(projectId);
      const latest = runs.length > 0 ? runs[0] : null;
      setRun(latest);
      setError(null);

      // Notify parent of phase changes
      if (latest && latest.phase !== prevPhaseRef.current) {
        prevPhaseRef.current = latest.phase;
        onPhaseChange?.(latest.phase);
      }
    } catch (err) {
      console.error('Failed to fetch pipeline runs:', err);
      setError('Could not load pipeline status');
    }
  }, [projectId, onPhaseChange]);

  // Initial fetch
  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Poll every 3s while pipeline is actively running
  useEffect(() => {
    const isRunning = run && !['done', 'failed', 'idle'].includes(run.phase);

    if (isRunning) {
      pollRef.current = setInterval(fetchRun, 3000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [run?.phase, fetchRun]);

  const handleRetry = async () => {
    if (!run) return;
    setRetrying(true);
    try {
      await retryPipelineRun(projectId, run.id);
      // Re-fetch after retry
      await fetchRun();
    } catch (err) {
      console.error('Retry failed:', err);
      setError('Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  // Don't render anything if there's no run or it's idle
  if (!run || run.phase === 'idle') return null;

  const t = theme;
  const isRunning = !['done', 'failed'].includes(run.phase);
  const allDone = run.phase === 'done';

  return (
    <div
      className={`border rounded-lg px-4 py-3 space-y-2 transition-colors ${
        t === 'dark'
          ? 'bg-[#161b22] border-[#30363d]'
          : 'bg-[#f6f8fa] border-[#d0d7de]'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  t === 'dark' ? 'bg-blue-400' : 'bg-blue-500'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  t === 'dark' ? 'bg-blue-500' : 'bg-blue-600'
                }`}
              />
            </span>
          )}
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              t === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'
            }`}
          >
            Pipeline
          </span>
          {run.run_number > 1 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                t === 'dark'
                  ? 'bg-[#0d1117] text-[#8b949e] border border-[#30363d]'
                  : 'bg-white text-[#57606a] border border-[#d0d7de]'
              }`}
            >
              Run #{run.run_number}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allDone && (
            <span
              className={`text-[10px] font-semibold ${
                t === 'dark' ? 'text-green-400' : 'text-green-600'
              }`}
            >
              Complete
            </span>
          )}
          {run.phase === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded border transition-colors ${
                t === 'dark'
                  ? 'border-[#30363d] text-orange-400 hover:bg-[#30363d]'
                  : 'border-[#d0d7de] text-orange-600 hover:bg-[#e5e7eb]'
              } ${retrying ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
            >
              {retrying ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>
      </div>

      {/* Phase progress indicator */}
      <div className="flex items-center gap-1">
        {PHASES.map((phase, idx) => {
          const status = getPhaseStatus(run, phase);
          const label = PHASES[idx];

          return (
            <div key={phase} className="flex items-center flex-1 min-w-0">
              {/* Phase node */}
              <div className="flex flex-col items-center min-w-0 flex-1">
                {/* Status icon */}
                <span
                  className={`text-sm font-mono leading-none ${
                    status === 'complete'
                      ? t === 'dark'
                        ? 'text-green-400'
                        : 'text-green-600'
                      : status === 'current'
                      ? t === 'dark'
                        ? 'text-blue-400 animate-pulse'
                        : 'text-blue-600 animate-pulse'
                      : status === 'awaiting_human'
                      ? t === 'dark'
                        ? 'text-yellow-400'
                        : 'text-yellow-600'
                      : status === 'failed'
                      ? t === 'dark'
                        ? 'text-red-400'
                        : 'text-red-600'
                      : t === 'dark'
                      ? 'text-[#484f58]'
                      : 'text-[#8c959f]'
                  }`}
                >
                  {status === 'complete'
                    ? '✓'
                    : status === 'current'
                    ? '→'
                    : status === 'awaiting_human'
                    ? '?'
                    : status === 'failed'
                    ? '✗'
                    : '·'}
                </span>

                {/* Phase label */}
                <span
                  className={`text-[9px] font-medium mt-0.5 truncate max-w-full ${
                    status === 'complete'
                      ? t === 'dark'
                        ? 'text-green-400'
                        : 'text-green-600'
                      : status === 'current'
                      ? t === 'dark'
                        ? 'text-blue-400'
                        : 'text-blue-600'
                      : status === 'awaiting_human'
                      ? t === 'dark'
                        ? 'text-yellow-400'
                        : 'text-yellow-600'
                      : status === 'failed'
                      ? t === 'dark'
                        ? 'text-red-400'
                        : 'text-red-600'
                      : t === 'dark'
                      ? 'text-[#484f58]'
                      : 'text-[#8c959f]'
                  }`}
                >
                  {PHASE_LABELS[label]}
                </span>
              </div>

              {/* Connector line between phases */}
              {idx < PHASES.length - 1 && (
                <div
                  className={`h-px flex-none w-4 mx-0.5 ${
                    status === 'complete'
                      ? t === 'dark'
                        ? 'bg-green-400'
                        : 'bg-green-600'
                      : t === 'dark'
                      ? 'bg-[#30363d]'
                      : 'bg-[#d0d7de]'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {(run.error || error) && (
        <p
          className={`text-[10px] leading-relaxed ${
            t === 'dark' ? 'text-red-400' : 'text-red-600'
          }`}
        >
          {run.error || error}
        </p>
      )}
    </div>
  );
}
