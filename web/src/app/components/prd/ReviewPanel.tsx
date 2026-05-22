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
  edge_case: 'border-[#d29922]',
  undefined_behavior: 'border-[#f85149]',
  vague_requirements: 'border-[#58a6ff]',
  missing_constraints: 'border-[#a371f7]',
  unclear_scope: 'border-[#8b949e]',
  actor_definitions: 'border-[#3fb950]',
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
    <div className="flex flex-col gap-4 font-mono h-full">
      <div className={`p-3 border-b flex flex-col gap-2 ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}>// AI REVIEW:</span>
            <span className={`text-xs font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
              {questions.length} QUESTIONS
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} className="accent-[#58a6ff]" />
            <span className={`text-[10px] uppercase tracking-wider font-bold ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>SHOW MINOR</span>
          </label>
        </div>
        <p className={`text-xs font-sans ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
          The PRD has gaps. Answer these to generate a complete developer spec.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 px-1 scrollbar-thin">
        {questions.filter(q => showMinor || q.severity !== 'minor').map((q, idx) => (
          <div key={idx} className={`p-3 border-l-4 border ${categoryColors[q.category] || 'border-l-[#8b949e]'} ${
            theme === 'dark' ? 'bg-[#0d1117] border-y-[#30363d] border-r-[#30363d]' : 'bg-[#ffffff] border-y-[#d0d7de] border-r-[#d0d7de]'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${theme === 'dark' ? 'text-[#58a6ff]' : 'text-[#0969da]'}`}>Q{idx + 1}.</span>
                {q.severity === 'critical' && <span className={`text-[9px] uppercase font-bold px-1 border ${theme === 'dark' ? 'text-[#f85149] border-[#f85149]/30' : 'text-[#cf222e] border-[#cf222e]/30'}`}>CRITICAL</span>}
                {q.severity === 'moderate' && <span className={`text-[9px] uppercase font-bold px-1 border ${theme === 'dark' ? 'text-[#d29922] border-[#d29922]/30' : 'text-[#9a6700] border-[#9a6700]/30'}`}>MODERATE</span>}
                {q.severity === 'minor' && <span className={`text-[9px] uppercase font-bold px-1 border ${theme === 'dark' ? 'text-[#58a6ff] border-[#58a6ff]/30' : 'text-[#0969da] border-[#0969da]/30'}`}>MINOR</span>}
              </div>
              <div className="flex items-center gap-2">
                {q.module && (
                  <span className={`text-[9px] uppercase font-bold ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                    [{q.module}]
                  </span>
                )}
                <span className={`text-[9px] uppercase font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                  {q?.category?.replace('_', ' ')}
                </span>
              </div>
            </div>
            <p className={`text-sm font-sans font-semibold mb-2 ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
              {q.question}
            </p>
            <p className={`text-xs font-sans mb-3 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
              {q.context}
            </p>

            {q.options && q.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {q.options.map((opt, optIdx) => (
                  <button
                    key={optIdx}
                    onClick={() => handleAnswer(idx, opt)}
                    className={`text-xs px-2 py-1 border transition-colors ${answers[idx] === opt
                      ? (theme === 'dark' ? 'bg-[#1f6feb]/20 border-[#1f6feb] text-[#c9d1d9]' : 'bg-[#0969da]/10 border-[#0969da] text-[#24292f]')
                      : (theme === 'dark' ? 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]' : 'bg-[#f6f8fa] border-[#d0d7de] text-[#57606a] hover:border-[#57606a]')
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
              rows={2}
              placeholder="Type your own answer or select an option above..."
              className={`w-full p-2 text-xs font-sans border outline-none resize-none ${theme === 'dark'
                ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] focus:border-[#58a6ff]'
                : 'bg-[#ffffff] border-[#d0d7de] text-[#24292f] focus:border-[#0969da]'
                }`}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className={`p-2 border text-xs font-bold ${theme === 'dark' ? 'bg-[#f85149]/10 border-[#f85149]/30 text-[#f85149]' : 'bg-[#cf222e]/10 border-[#cf222e]/30 text-[#cf222e]'}`}>
          [ERROR] {error}
        </div>
      )}

      <div className={`p-3 border-t mt-auto ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full text-xs font-bold uppercase py-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
            theme === 'dark'
              ? 'bg-[#238636] hover:bg-[#2ea043] text-white'
              : 'bg-[#2da44e] hover:bg-[#2c974b] text-white'
          }`}
        >
          {submitting ? 'PROCESSING...' : 'CONFIRM & GENERATE SPEC'}
        </button>
      </div>
    </div>
  );
}