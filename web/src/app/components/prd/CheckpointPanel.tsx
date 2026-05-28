"use client";

import { useEffect, useState, useCallback } from 'react';
import { getPipelineRuns, getPipelineCheckpoint, submitCheckpointAnswers } from '@/lib/api';
import type { PipelineRun, PipelineCheckpoint } from '@/lib/api';

interface CheckpointPanelProps {
  projectId: string;
  theme: 'light' | 'dark';
  onResolved?: () => void;
}

export default function CheckpointPanel({ projectId, theme, onResolved }: CheckpointPanelProps) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [checkpoint, setCheckpoint] = useState<PipelineCheckpoint | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dk = theme === 'dark';

  // Fetch pipeline runs and find the one awaiting human input
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runs = await getPipelineRuns(projectId);
      const awaiting = runs.find(r => r.phase === 'awaiting_human') || null;
      setRun(awaiting);

      if (awaiting) {
        const cp = await getPipelineCheckpoint(projectId, awaiting.id);
        setCheckpoint(cp);
        // Pre-fill any existing answers
        if (cp?.answers) {
          setAnswers(cp.answers);
        }
      } else {
        setCheckpoint(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch checkpoint data:', err);
      setError(err.message || 'Failed to load checkpoint');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const allAnswered = checkpoint
    ? checkpoint.questions.every(q => {
        const answer = answers[q.id];
        return answer !== undefined && answer.trim() !== '';
      })
    : false;

  const handleSubmit = async () => {
    if (!run || !checkpoint || !allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCheckpointAnswers(projectId, run.id, answers);
      onResolved?.();
    } catch (err: any) {
      console.error('Failed to submit checkpoint answers:', err);
      setError(err.message || 'Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  // Don't render anything if loading, no run awaiting input, or no checkpoint
  if (loading) return null;
  if (!run || !checkpoint) return null;

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        dk
          ? 'bg-yellow-900/10 border-yellow-600/30'
          : 'bg-yellow-50 border-yellow-300'
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 py-2.5 border-b flex items-center justify-between ${
          dk ? 'border-yellow-600/20 bg-yellow-900/15' : 'border-yellow-200 bg-yellow-100/60'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-sm ${
              dk ? 'text-yellow-400' : 'text-yellow-600'
            }`}
          >
            ?
          </span>
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              dk ? 'text-yellow-400' : 'text-yellow-700'
            }`}
          >
            Conflict Resolution Needed
          </span>
        </div>
        <span
          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
            dk
              ? 'bg-[#0d1117] text-[#8b949e] border border-[#30363d]'
              : 'bg-white text-[#57606a] border border-[#d0d7de]'
          }`}
        >
          Run #{run.run_number}
        </span>
      </div>

      {/* Questions */}
      <div className="px-4 py-3 space-y-4">
        {checkpoint.questions.map((question, idx) => (
          <div key={question.id} className="space-y-2">
            {/* Question number and text */}
            <div className="flex items-start gap-2">
              <span
                className={`text-[9px] font-bold mt-0.5 shrink-0 ${
                  dk ? 'text-yellow-400' : 'text-yellow-600'
                }`}
              >
                Q{idx + 1}
              </span>
              <p
                className={`text-[11px] font-semibold leading-snug ${
                  dk ? 'text-[#c9d1d9]' : 'text-[#24292f]'
                }`}
              >
                {question.question}
              </p>
            </div>

            {/* Context */}
            {question.context && (
              <div
                className={`ml-5 text-[10px] leading-relaxed px-2.5 py-1.5 border rounded ${
                  dk
                    ? 'bg-[#0d1117] border-[#30363d] text-[#8b949e]'
                    : 'bg-[#f6f8fa] border-[#d0d7de] text-[#57606a]'
                }`}
              >
                {question.context}
              </div>
            )}

            {/* Options (radio buttons) or text input */}
            {question.options && question.options.length > 0 ? (
              <div className="ml-5 space-y-1">
                {question.options.map((opt, optIdx) => {
                  const isSelected = answers[question.id] === opt;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleAnswerChange(question.id, opt)}
                      className={`w-full text-left text-[10px] font-sans px-2.5 py-1.5 border transition-colors rounded flex items-center gap-2 ${
                        isSelected
                          ? dk
                            ? 'border-[#58a6ff] bg-[#1f6feb]/15 text-[#c9d1d9]'
                            : 'border-[#0969da] bg-[#0969da]/10 text-[#24292f]'
                          : dk
                          ? 'border-[#30363d] bg-[#161b22] text-[#8b949e] hover:border-[#8b949e]'
                          : 'border-[#d0d7de] bg-white text-[#57606a] hover:border-[#57606a]'
                      }`}
                    >
                      {/* Radio circle */}
                      <span
                        className={`w-3 h-3 rounded-full border shrink-0 flex items-center justify-center ${
                          isSelected
                            ? dk
                              ? 'border-[#58a6ff] bg-[#58a6ff]'
                              : 'border-[#0969da] bg-[#0969da]'
                            : dk
                            ? 'border-[#484f58]'
                            : 'border-[#8c959f]'
                        }`}
                      >
                        {isSelected && (
                          <span className="w-1 h-1 rounded-full bg-white" />
                        )}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ml-5">
                <input
                  type="text"
                  value={answers[question.id] || ''}
                  onChange={e => handleAnswerChange(question.id, e.target.value)}
                  placeholder="Type your answer..."
                  className={`w-full p-2 text-[10px] font-sans border outline-none rounded transition-colors ${
                    dk
                      ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] placeholder:text-[#484f58] focus:border-[#58a6ff]'
                      : 'bg-white border-[#d0d7de] text-[#24292f] placeholder:text-[#8c959f] focus:border-[#0969da]'
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className={`mx-4 mb-3 p-2 border text-[9px] font-bold rounded ${
            dk
              ? 'bg-[#f85149]/10 border-[#f85149]/30 text-[#f85149]'
              : 'bg-[#cf222e]/10 border-[#cf222e]/30 text-[#cf222e]'
          }`}
        >
          [ERROR] {error}
        </div>
      )}

      {/* Submit bar */}
      <div
        className={`px-4 py-2.5 border-t flex items-center justify-between ${
          dk ? 'border-yellow-600/20 bg-yellow-900/15' : 'border-yellow-200 bg-yellow-100/60'
        }`}
      >
        <p
          className={`text-[9px] ${
            dk ? 'text-[#8b949e]' : 'text-[#57606a]'
          }`}
        >
          {Object.values(answers).filter(a => a.trim() !== '').length} of{' '}
          {checkpoint.questions.length} answered
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            dk
              ? 'bg-[#238636] hover:bg-[#2ea043] text-white'
              : 'bg-[#2da44e] hover:bg-[#2c974b] text-white'
          }`}
        >
          {submitting ? 'Resolving...' : 'Resolve & Continue'}
        </button>
      </div>
    </div>
  );
}
