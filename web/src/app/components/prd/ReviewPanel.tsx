"use client";

import { useState, useEffect, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Question {
  module?: string;
  severity?: 'critical' | 'moderate' | 'minor';
  question: string;
  context: string;
  category: string;
  options?: string[];
  recommended_default?: string;
}

interface ReviewPanelProps {
  projectId: string;
  project: any;
  onClarify: () => void;
  theme?: 'light' | 'dark';
}

const severityOrder = { critical: 0, moderate: 1, minor: 2 };

export default function ReviewPanel({ projectId, project, onClarify, theme = 'dark' }: ReviewPanelProps) {
  const questions: Question[] = project.review_questions || [];

  // decisions: 'accepted' (default kept) | 'overridden' (user changed it) | null (pristine)
  const [decisions, setDecisions] = useState<Record<number, { answer: string; status: 'accepted' | 'overridden' }>>({});
  const [expandedOverride, setExpandedOverride] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill all with recommended_default as 'accepted' on mount
  useEffect(() => {
    if (questions.length === 0) return;
    const initial: typeof decisions = {};
    questions.forEach((q, idx) => {
      initial[idx] = { answer: q.recommended_default || '', status: 'accepted' };
    });
    setDecisions(initial);
  }, [project.review_questions]);

  // Build module list with counts, sorted by critical first
  const modules = useMemo(() => {
    const map = new Map<string, { total: number; overridden: number; critical: number }>();
    questions.forEach((q, idx) => {
      const mod = q.module || 'General';
      if (!map.has(mod)) map.set(mod, { total: 0, overridden: 0, critical: 0 });
      const entry = map.get(mod)!;
      entry.total++;
      if (decisions[idx]?.status === 'overridden') entry.overridden++;
      if (q.severity === 'critical') entry.critical++;
    });
    return [
      { name: 'ALL', total: questions.length, overridden: Object.values(decisions).filter(d => d?.status === 'overridden').length, critical: questions.filter(q => q.severity === 'critical').length },
      ...Array.from(map.entries()).map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.critical - a.critical)
    ];
  }, [questions, decisions]);

  const visibleQuestions = useMemo(() => {
    return questions
      .map((q, idx) => ({ ...q, _idx: idx }))
      .filter(q => selectedModule === 'ALL' || (q.module || 'General') === selectedModule)
      .sort((a, b) => (severityOrder[a.severity ?? 'minor'] ?? 2) - (severityOrder[b.severity ?? 'minor'] ?? 2));
  }, [questions, selectedModule]);

  const acceptedCount = Object.values(decisions).filter(d => d?.status === 'accepted').length;
  const overriddenCount = Object.values(decisions).filter(d => d?.status === 'overridden').length;

  const acceptAll = () => {
    const updated: typeof decisions = {};
    questions.forEach((q, idx) => {
      updated[idx] = { answer: q.recommended_default || '', status: 'accepted' };
    });
    setDecisions(updated);
    setExpandedOverride(null);
  };

  const acceptOne = (idx: number) => {
    const q = questions[idx];
    setDecisions(prev => ({ ...prev, [idx]: { answer: q.recommended_default || '', status: 'accepted' } }));
    setExpandedOverride(null);
  };

  const overrideOne = (idx: number, value: string) => {
    setDecisions(prev => ({ ...prev, [idx]: { answer: value, status: 'overridden' } }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: questions.map((q, i) => ({
          question: q.question,
          answer: decisions[i]?.answer || q.recommended_default || '',
          status: decisions[i]?.status || 'accepted',
        })),
      };
      const res = await fetch(`${API_URL}/api/projects/${projectId}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Clarify failed');
      }
      onClarify();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const dk = theme === 'dark';

  return (
    <div className={`flex flex-col h-full font-mono overflow-hidden`}>

      {/* TOP BAR: Accept All + stats */}
      <div className={`shrink-0 px-3 py-2 border-b flex items-center justify-between gap-3 ${dk ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] uppercase font-bold tracking-wider ${dk ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
            {questions.length} decisions
          </span>
          <span className={`text-[8px] px-1.5 border rounded ${dk ? 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/5' : 'text-[#2da44e] border-[#2da44e]/30 bg-[#2da44e]/5'}`}>
            {acceptedCount} defaulted
          </span>
          {overriddenCount > 0 && (
            <span className={`text-[8px] px-1.5 border rounded ${dk ? 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5' : 'text-[#9a6700] border-[#9a6700]/30 bg-[#9a6700]/5'}`}>
              {overriddenCount} overridden
            </span>
          )}
        </div>
        <button
          onClick={acceptAll}
          type="button"
          className={`text-[9px] uppercase font-bold px-2 py-1 border transition-colors shrink-0 ${dk ? 'border-[#3fb950] text-[#3fb950] hover:bg-[#3fb950]/10' : 'border-[#2da44e] text-[#2da44e] hover:bg-[#2da44e]/10'}`}
        >
          ✓ Accept All Defaults
        </button>
      </div>

      {/* BODY: Two-pane layout */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT PANE: Module list */}
        <div className={`w-[38%] shrink-0 border-r overflow-y-auto ${dk ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
          <div className={`px-2 py-1.5 text-[8px] uppercase font-bold tracking-wider border-b ${dk ? 'text-[#8b949e] border-[#30363d] bg-[#161b22]' : 'text-[#57606a] border-[#d0d7de] bg-[#e5e7eb]'}`}>
            Modules
          </div>
          {modules.map(mod => {
            const isActive = selectedModule === mod.name;
            return (
              <button
                key={mod.name}
                onClick={() => setSelectedModule(mod.name)}
                className={`w-full text-left px-2 py-2 border-b flex flex-col gap-0.5 transition-colors ${isActive
                  ? (dk ? 'bg-[#161b22] border-b-[#30363d]' : 'bg-[#e5e7eb] border-b-[#d0d7de]')
                  : (dk ? 'hover:bg-[#161b22]/50 border-b-[#21262d]' : 'hover:bg-[#f0f2f4] border-b-[#e5e7eb]')
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[9px] leading-tight font-bold truncate ${isActive ? (dk ? 'text-[#c9d1d9]' : 'text-[#24292f]') : (dk ? 'text-[#8b949e]' : 'text-[#57606a]')}`}>
                    {mod.name === 'ALL' ? '// ALL MODULES' : mod.name}
                  </span>
                  <span className={`text-[8px] shrink-0 font-bold ${dk ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                    {mod.total}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {mod.critical > 0 && (
                    <span className={`text-[7px] px-1 border rounded uppercase font-bold ${dk ? 'text-[#f85149] border-[#f85149]/30' : 'text-[#cf222e] border-[#cf222e]/30'}`}>
                      {mod.critical} crit
                    </span>
                  )}
                  {mod.overridden > 0 && (
                    <span className={`text-[7px] px-1 border rounded uppercase font-bold ${dk ? 'text-[#d29922] border-[#d29922]/30' : 'text-[#9a6700] border-[#9a6700]/30'}`}>
                      {mod.overridden} ovrd
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT PANE: Decision cards */}
        <div className="flex-1 overflow-y-auto">
          {visibleQuestions.length === 0 ? (
            <div className={`p-6 text-center text-xs ${dk ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
              No questions for this module.
            </div>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {visibleQuestions.map((q) => {
                const idx = q._idx;
                const decision = decisions[idx];
                const isOverriding = expandedOverride === idx;
                const isOverridden = decision?.status === 'overridden';
                const currentAnswer = decision?.answer || q.recommended_default || '';

                return (
                  <div
                    key={idx}
                    className={`px-3 py-2.5 ${dk ? 'bg-[#0d1117]' : 'bg-[#ffffff]'}`}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {q.severity === 'critical' && (
                          <span className={`text-[7px] uppercase font-bold px-1 border rounded ${dk ? 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/5' : 'text-[#cf222e] border-[#cf222e]/30 bg-[#cf222e]/5'}`}>CRIT</span>
                        )}
                        {q.severity === 'moderate' && (
                          <span className={`text-[7px] uppercase font-bold px-1 border rounded ${dk ? 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5' : 'text-[#9a6700] border-[#9a6700]/30 bg-[#9a6700]/5'}`}>MOD</span>
                        )}
                        {q.severity === 'minor' && (
                          <span className={`text-[7px] uppercase font-bold px-1 border rounded ${dk ? 'text-[#8b949e] border-[#8b949e]/30' : 'text-[#57606a] border-[#57606a]/30'}`}>MINOR</span>
                        )}
                        <span className={`text-[7px] uppercase font-bold px-1 border rounded ${dk ? 'text-[#8b949e] border-[#30363d]' : 'text-[#57606a] border-[#d0d7de]'}`}>
                          {q.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {isOverridden && (
                        <span className={`text-[7px] uppercase font-bold px-1 border rounded shrink-0 ${dk ? 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5' : 'text-[#9a6700] border-[#9a6700]/30 bg-[#9a6700]/5'}`}>
                          Overridden
                        </span>
                      )}
                    </div>

                    {/* Question */}
                    <p className={`text-[10px] font-sans font-semibold mb-2 leading-tight ${dk ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                      {q.question}
                    </p>

                    {/* Default answer chip — the primary UI element */}
                    {!isOverriding && (
                      <div className={`flex items-center gap-2 p-1.5 border rounded mb-2 ${
                        isOverridden
                          ? (dk ? 'border-[#d29922]/40 bg-[#d29922]/5' : 'border-[#9a6700]/40 bg-[#9a6700]/5')
                          : (dk ? 'border-[#3fb950]/40 bg-[#3fb950]/5' : 'border-[#2da44e]/40 bg-[#2da44e]/5')
                      }`}>
                        <span className={`text-[8px] shrink-0 font-bold ${isOverridden ? (dk ? 'text-[#d29922]' : 'text-[#9a6700]') : (dk ? 'text-[#3fb950]' : 'text-[#2da44e]')}`}>
                          {isOverridden ? '✎' : '✓'}
                        </span>
                        <span className={`text-[10px] font-sans flex-1 ${dk ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                          {currentAnswer}
                        </span>
                      </div>
                    )}

                    {/* Override expanded: show all options */}
                    {isOverriding && (
                      <div className="mb-2 space-y-1">
                        {q.options?.map((opt, optIdx) => {
                          const isSelected = currentAnswer === opt;
                          const isDefault = opt === q.recommended_default;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => overrideOne(idx, opt)}
                              type="button"
                              className={`w-full text-left text-[10px] font-sans px-2 py-1.5 border transition-colors rounded flex items-center gap-2 ${
                                isSelected
                                  ? (dk ? 'border-[#58a6ff] bg-[#1f6feb]/15 text-[#c9d1d9]' : 'border-[#0969da] bg-[#0969da]/10 text-[#24292f]')
                                  : (dk ? 'border-[#30363d] bg-[#161b22] text-[#8b949e] hover:border-[#8b949e]' : 'border-[#d0d7de] bg-[#f6f8fa] text-[#57606a] hover:border-[#57606a]')
                              }`}
                            >
                              <span className="flex-1">{opt}</span>
                              {isDefault && (
                                <span className={`text-[7px] uppercase font-bold px-1 border rounded ${dk ? 'text-[#3fb950] border-[#3fb950]/30' : 'text-[#2da44e] border-[#2da44e]/30'}`}>
                                  default
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {/* Custom text input */}
                        <input
                          type="text"
                          placeholder="Or type a custom answer..."
                          defaultValue={isOverridden && !q.options?.includes(currentAnswer) ? currentAnswer : ''}
                          onBlur={e => { if (e.target.value.trim()) overrideOne(idx, e.target.value.trim()); }}
                          className={`w-full p-2 text-[10px] font-sans border outline-none rounded ${dk ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] focus:border-[#58a6ff]' : 'bg-[#ffffff] border-[#d0d7de] text-[#24292f] focus:border-[#0969da]'}`}
                        />
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-1.5">
                      {isOverriding ? (
                        <>
                          <button
                            onClick={() => setExpandedOverride(null)}
                            type="button"
                            className={`text-[8px] uppercase font-bold px-2 py-0.5 border transition-colors rounded ${dk ? 'border-[#3fb950] text-[#3fb950] hover:bg-[#3fb950]/10' : 'border-[#2da44e] text-[#2da44e] hover:bg-[#2da44e]/10'}`}
                          >
                            Done
                          </button>
                          <button
                            onClick={() => acceptOne(idx)}
                            type="button"
                            className={`text-[8px] uppercase font-bold px-2 py-0.5 border transition-colors rounded ${dk ? 'border-[#30363d] text-[#8b949e] hover:border-[#8b949e]' : 'border-[#d0d7de] text-[#57606a] hover:border-[#57606a]'}`}
                          >
                            Reset to default
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setExpandedOverride(idx)}
                          type="button"
                          className={`text-[8px] uppercase font-bold px-2 py-0.5 border transition-colors rounded ${dk ? 'border-[#30363d] text-[#8b949e] hover:border-[#8b949e]' : 'border-[#d0d7de] text-[#57606a] hover:border-[#57606a]'}`}
                        >
                          Override
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: Finalize bar */}
      <div className={`shrink-0 border-t px-3 py-2 ${dk ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        {error && (
          <div className={`mb-2 p-1.5 border text-[9px] font-bold ${dk ? 'bg-[#f85149]/10 border-[#f85149]/30 text-[#f85149]' : 'bg-[#cf222e]/10 border-[#cf222e]/30 text-[#cf222e]'}`}>
            [ERROR] {error}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          type="button"
          className={`w-full text-[10px] font-bold uppercase py-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${dk ? 'bg-[#238636] hover:bg-[#2ea043] text-white' : 'bg-[#2da44e] hover:bg-[#2c974b] text-white'}`}
        >
          {submitting
            ? '⟳ Processing...'
            : `Finalize ${questions.length} Decisions & Generate Spec`}
        </button>
        <p className={`text-[8px] text-center mt-1.5 ${dk ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
          {acceptedCount} defaults accepted · {overriddenCount} manually overridden · all decisions are saved
        </p>
      </div>

    </div>
  );
}