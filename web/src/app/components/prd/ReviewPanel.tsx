"use client";

import { useState, useEffect } from 'react';

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
  questions: Question[];
  onClarify: () => void;
  theme?: 'light' | 'dark';
}

const categoryColors: Record<string, string> = {
  edge_case: 'border-amber-400 bg-amber-50',
  undefined_behavior: 'border-red-400 bg-red-50',
  vague_requirements: 'border-blue-400 bg-blue-50',
  missing_constraints: 'border-purple-400 bg-purple-50',
  unclear_scope: 'border-gray-400 bg-gray-50',
  actor_definitions: 'border-emerald-400 bg-emerald-50',
};

export default function ReviewPanel({ projectId, questions, onClarify, theme = 'dark' }: ReviewPanelProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showMinor, setShowMinor] = useState(false);

  useEffect(() => {
    if (questions && questions.length > 0) {
      setAnswers(prev => {
        const updated = { ...prev };
        questions.forEach((q, idx) => {
          if (q.recommended_default && updated[idx] === undefined) {
            updated[idx] = q.recommended_default;
          }
        });
        return updated;
      });
    }
  }, [questions]);

  const handleAnswer = (idx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [idx]: value }));
  };

  const handleSubmit = async () => {
    const unanswered = questions.findIndex((_, i) => !answers[i]?.trim());
    if (unanswered !== -1) {
      setError(`Question ${unanswered + 1} is required`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        answers: questions.map((q, i) => ({
          question: q.question,
          answer: answers[i].trim(),
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

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl border ${theme === 'dark' ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-white'
        }`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🔍</span>
          <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
            AI Review — {questions.length} Questions
          </h3>
        </div>
        <div className="flex items-center justify-between">
          <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            The PRD has gaps. Answer these to generate a complete developer spec.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} className="rounded bg-slate-100 border-slate-300 text-indigo-500" />
            <span className={`text-[10px] uppercase tracking-wider font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Show Minor Details</span>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {questions.filter(q => showMinor || q.severity !== 'minor').map((q, idx) => (
          <div key={idx} className={`p-4 rounded-xl border-l-4 ${categoryColors[q.category] || 'border-slate-300 bg-slate-50'}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700">Q{idx + 1}.</span>
                {q.severity === 'critical' && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 font-bold">Critical</span>}
                {q.severity === 'moderate' && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 font-bold">Moderate</span>}
                {q.severity === 'minor' && <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold">Minor</span>}
              </div>
              <div className="flex items-center gap-2">
                {q.module && (
                  <span className={`text-[9px] px-2 py-0.5 rounded border font-semibold uppercase ${theme === 'dark' ? 'border-indigo-500/30 text-indigo-300' : 'border-indigo-200 text-indigo-700'
                    }`}>
                    {q.module}
                  </span>
                )}
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {q?.category?.replace('_', ' ')}
                </span>
              </div>
            </div>
            <p className={`text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
              {q.question}
            </p>
            <p className={`text-xs mb-3 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              {q.context}
            </p>

            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {q.options.map((opt, optIdx) => (
                  <button
                    key={optIdx}
                    onClick={() => handleAnswer(idx, opt)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${answers[idx] === opt
                      ? (theme === 'dark' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-indigo-50 border-indigo-500 text-indigo-700')
                      : (theme === 'dark' ? 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50')
                      }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={answers[idx] || ''}
              onChange={(e) => handleAnswer(idx, e.target.value)}
              rows={3}
              placeholder="Type your own answer or select an option above..."
              className={`w-full p-3 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none ${theme === 'dark'
                ? 'bg-slate-900 border-slate-800 text-slate-200 placeholder-slate-600'
                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'
                }`}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
            Applying...
          </>
        ) : (
          <>
            <span>✓</span>
            Confirm & Generate Developer Spec
          </>
        )}
      </button>
    </div>
  );
}