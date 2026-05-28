"use client";

import { useState, useEffect, useRef } from 'react';
import {
  sendBrainstormMessage,
  sendBrainstormMessageStream,
  sendBrainstormCommand,
  applySuggestion,
  skipSuggestion,
  getChatSessions,
  getChatSessionHistory,
  getChatHistory,
  getFeatures,
  getProject,
  entityFirstExtract,
  clarifyGap,
} from '@/lib/api';

interface BrainstormChatProps {
  projectId: string;
  theme?: 'light' | 'dark';
  onFeatureChange?: () => void;
}

interface Question {
  module: string;
  severity: 'critical' | 'moderate' | 'minor';
  category: string;
  question: string;
  context: string;
  options: string[];
  recommended_default: string;
}

interface ArchImplications {
  schema?: { table: string; columns: string[]; relationships: string[] }[];
  api?: { method: string; endpoint: string; module: string; auth_required: boolean }[];
  integrations?: { service: string; usage: string }[];
}

interface FeatureProposal {
  suggestion_id: string;
  title: string;
  description: string;
  entities: string[];
  confidence: number;
  module: string;
  todos: { title: string; detail: string }[];
  arch_implications: ArchImplications;
  status: 'pending' | 'applied' | 'skipped';
}

interface Completion {
  modules_done: number;
  modules_total: number;
  current_module: string | null;
  ready_to_finalize: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isTyping?: boolean;
  questions?: Question[];
  featureProposals?: FeatureProposal[];
  completion?: Completion;
  state?: string;
}

// ── Gap answer input sub-component ──
function GapAnswerInput({
  gapIndex,
  disabled,
  onSubmit,
  tc,
}: {
  gapIndex: number;
  disabled: boolean;
  onSubmit: (answer: string) => void;
  tc: (dark: string, light: string) => string;
}) {
  const [value, setValue] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };
  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); }
        }}
        disabled={disabled}
        placeholder="Type your answer... (Enter to submit, Shift+Enter for newline)"
        rows={2}
        className={`flex-1 text-xs px-2 py-1.5 border rounded resize-none outline-none transition-colors ${tc(
          'bg-[#0d1117] border-[#f0883e]/30 text-[#c9d1d9] placeholder-[#484f58] focus:border-[#f0883e]/70',
          'bg-[#fff8f5] border-[#bc4c00]/30 text-[#24292f] placeholder-[#8c959f] focus:border-[#bc4c00]/60'
        )
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={`text-[10px] font-bold uppercase px-3 py-1 border rounded self-end transition-colors ${tc(
          'border-[#f0883e]/50 text-[#f0883e] hover:bg-[#f0883e]/10 disabled:opacity-40',
          'border-[#bc4c00]/50 text-[#bc4c00] hover:bg-[#bc4c00]/10 disabled:opacity-40'
        )
          }`}
      >
        {disabled ? '...' : 'ANSWER'}
      </button>
    </form>
  );
}

export default function BrainstormChat({ projectId, theme = 'dark', onFeatureChange }: BrainstormChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    sender: 'ai',
    text: "Welcome to Requirements OS. Paste a PRD, upload a document, or describe your system to begin brainstorming.",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<any[]>([]);
  const [processingSuggestion, setProcessingSuggestion] = useState<Record<string, boolean>>({});
  const [features, setFeatures] = useState<{ id: string; title: string }[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Record<string, string>>({});
  const [answeringQuestion, setAnsweringQuestion] = useState(false);
  const [entityExtracting, setEntityExtracting] = useState(false);
  const [projectState, setProjectState] = useState<string | null>(null);
  const [blockingGaps, setBlockingGaps] = useState<{ area: string; question: string; description: string }[]>([]);
  const [currentGapIndex, setCurrentGapIndex] = useState<number>(0);
  const [answeredGapIndices, setAnsweredGapIndices] = useState<Set<number>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { getFeatures(projectId).then(setFeatures).catch(() => setFeatures([])); }, [projectId]);
  useEffect(() => { getChatSessions(projectId).then(setSessions).catch(() => { }); }, [projectId]);

  // Load chat history on mount (persistence across page refreshes)
  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      try {
        // Fetch project state and chat history in parallel
        const [proj, data] = await Promise.all([
          getProject(projectId),
          getChatHistory(projectId),
        ]);

        if (!active) return;

        // Track project state for the paused-pipeline banner
        setProjectState(proj.state ?? null);
        const gaps: { area: string; question: string; description: string }[] =
          (proj.entity_graph as any)?.blocking_gaps || [];
        setBlockingGaps(gaps);

        // Restore which gaps are already answered
        const gapAnswers = (proj.entity_graph as any)?.gap_answers || {};
        const answeredSet = new Set<number>(Object.keys(gapAnswers).map(Number));
        setAnsweredGapIndices(answeredSet);
        // Set currentGapIndex to first unanswered
        const firstUnanswered = gaps.findIndex((_, i) => !answeredSet.has(i));
        setCurrentGapIndex(firstUnanswered >= 0 ? firstUnanswered : 0);

        // Restore chat history
        if (data.session_id) setSessionId(data.session_id);
        if (data.messages && data.messages.length > 0) {
          const loaded: ChatMessage[] = data.messages.map((m: any) => ({
            id: m.id || `hist-${Date.now()}-${Math.random()}`,
            sender: m.sender === 'user' ? 'user' : 'ai',
            text: m.text || m.content || '',
          }));
          setMessages(loaded);

          // If history exists but project still paused, append gap reminder if not already present
          if (proj.state === 'needs_clarification' && gaps.length > 0) {
            const alreadyShown = loaded.some(m => m.state === 'needs_clarification');
            if (!alreadyShown) {
              setMessages(prev => [...prev, buildGapMessage(gaps)]);
            }
          }
        } else if (proj.state === 'needs_clarification' && gaps.length > 0) {
          // No history yet — replace welcome with gap prompt
          setMessages([buildGapMessage(gaps)]);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };
    loadHistory();
    return () => { active = false; };
  }, [projectId]);

  // Build the initial gap-question message
  const buildGapMessage = (gaps: { area: string; question: string; description: string }[]): ChatMessage => ({
    id: 'pipeline-paused',
    sender: 'ai',
    text: [
      `I've analysed the PRD and found ${gaps.length} blocking gap${gaps.length > 1 ? 's' : ''} that must be resolved before I can generate features.`,
      '',
      ...gaps.map((g, i) => `${i + 1}. [${g.area}]\n   ${g.question}`),
      '',
      `Let's go through these one by one. To start:\n\n→ ${gaps[0].question}`,
    ].join('\n'),
    state: 'needs_clarification',
  });

  // Poll for pipeline completion when state is 'parsing'
  useEffect(() => {
    if (projectState !== 'parsing') return;
    const interval = setInterval(async () => {
      try {
        const proj = await getProject(projectId);
        if (proj.state === projectState) return; // still parsing
        setProjectState(proj.state ?? null);
        clearInterval(interval);

        if (proj.state === 'exploring') {
          const featCount = (proj as any).features?.length ?? '?';
          setMessages(prev => [...prev, {
            id: `pipeline-done-${Date.now()}`,
            sender: 'ai',
            text: `✅ Pipeline complete! Features are ready in the Workspace Explorer. Switch to the Explorer to review them.`,
            state: 'exploring',
          }]);
          if (onFeatureChange) onFeatureChange();
          window.dispatchEvent(new Event('prd-updated'));
        } else if (proj.state === 'needs_clarification') {
          const newGaps = (proj.entity_graph as any)?.blocking_gaps || [];
          setBlockingGaps(newGaps);
          setMessages(prev => [...prev, buildGapMessage(newGaps)]);
        }
      } catch { /* silent — will retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [projectState, projectId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    await executeSend(input.trim());
  };

  const executeSend = async (text: string) => {
    setLoading(true);
    setInput('');

    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text }]);

    // Add a live streaming placeholder
    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, sender: 'ai', text: '', isTyping: true }]);

    try {
      const response = await sendBrainstormMessageStream(
        projectId,
        text,
        sessionId,
        (token) => {
          // Append each token to the live message
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, text: m.text + token } : m
          ));
        }
      );

      if (!response) throw new Error('No response from stream');
      if (response.session_id) setSessionId(response.session_id);
      if (response.state) setProjectState(response.state);

      // Replace live placeholder with final structured message
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? {
          ...m,
          text: response.assistant_response || m.text,
          isTyping: false,
          questions: response.questions || [],
          featureProposals: (response.feature_proposals || []).map((fp: any) => ({ ...fp, status: 'pending' })),
          completion: response.completion || null,
          state: response.state,
        } : m
      ));

      getChatSessions(projectId).then(setSessions).catch(() => { });
      if (onFeatureChange) onFeatureChange();
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, text: `Error: ${err.message || 'Brainstorm failed'}`, isTyping: false }
          : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = async (command: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await sendBrainstormCommand(projectId, command, sessionId);
      if (response.session_id) setSessionId(response.session_id);
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.assistant_response || '',
        completion: response.completion || null,
        state: response.state,
      }]);
      if (onFeatureChange) onFeatureChange();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        sender: 'ai',
        text: `Error: ${err.message || 'Command failed'}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleEntityExtract = async () => {
    if (entityExtracting) return;
    setEntityExtracting(true);
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: '[ENTITY-FIRST] Extracting entities and features from PRD...',
    }]);
    try {
      const response = await entityFirstExtract(projectId);

      if (response.needs_clarification) {
        // Pipeline paused — show gap questions
        const gapLines = (response.blocking_gaps || []).map((g: any) => `  ⚠ [${g.area}] ${g.question}`).join('\n');
        setMessages(prev => [...prev, {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `PRD analysis complete, but ${response.blocking_gaps.length} blocking gap(s) need your input before features can be generated:\n\n${gapLines}\n\nPlease answer each question above in the chat.`,
          state: 'needs_clarification',
        }]);
        if (onFeatureChange) onFeatureChange();
        window.dispatchEvent(new Event('prd-updated'));
        return;
      }

      // Normal success path
      let summary = `Extraction complete.\n\n`;
      summary += `**${response.entity_count} entities**, **${response.module_count} modules**, **${response.features_generated} features**, **${response.todos_generated} todos**\n`;

      if (response.gaps?.coverage_gaps?.length > 0) {
        summary += `\n── Coverage Gaps (${response.gaps.coverage_gaps.length}) ──\n`;
        for (const g of response.gaps.coverage_gaps.slice(0, 5)) summary += `  🔴 ${g.description}\n`;
      }
      if (response.gaps?.risky_assumptions?.length > 0) {
        summary += `\n── Risky Assumptions (${response.gaps.risky_assumptions.length}) ──\n`;
        for (const r of response.gaps.risky_assumptions.slice(0, 5)) summary += `  🟡 [${r.feature}] ${r.risk}\n`;
      }

      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: summary,
        state: 'exploring',
      }]);
      if (onFeatureChange) onFeatureChange();
      window.dispatchEvent(new Event('prd-updated'));
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        sender: 'ai',
        text: `Entity extraction failed: ${err.message}`,
      }]);
    } finally {
      setEntityExtracting(false);
    }
  };

  const handleAnswerGap = async (gapIndex: number, answer: string) => {
    if (answeringQuestion) return;
    setAnsweringQuestion(true);

    const gap = blockingGaps[gapIndex];
    const answerLabel = `[Gap ${gapIndex + 1}/${blockingGaps.length}] ${gap?.question}: ${answer}`;
    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: answer }]);

    const aiMsgId = `ai-clarify-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, sender: 'ai', text: '', isTyping: true }]);

    try {
      const response = await clarifyGap(
        projectId,
        gapIndex,
        answer,
        sessionId,
        (token) => {
          // tokens are JSON fragments — don't stream raw JSON, wait for done
        }
      );

      if (!response) throw new Error('No response from clarify endpoint');
      if (response.session_id) setSessionId(response.session_id);

      // Mark this gap as answered
      setAnsweredGapIndices(prev => new Set([...prev, gapIndex]));

      if (response.all_gaps_resolved) {
        setProjectState('parsing');
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, text: response.assistant_response, isTyping: false, state: 'parsing' } : m
        ));
        if (onFeatureChange) onFeatureChange();
      } else {
        const nextIdx = response.next_gap_index;
        if (nextIdx !== null && nextIdx !== undefined) {
          setCurrentGapIndex(nextIdx);
          const nextGap = blockingGaps[nextIdx];
          const nextPrompt = nextGap ? `\n\n→ Next: ${nextGap.question}` : '';
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, text: response.assistant_response + nextPrompt, isTyping: false } : m
          ));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, text: response.assistant_response, isTyping: false } : m
          ));
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, text: `Error: ${err.message || 'Clarification failed'}`, isTyping: false }
          : m
      ));
    } finally {
      setAnsweringQuestion(false);
    }
  };

  const handleAnswerQuestion = async (question: Question, option: string) => {
    setAnsweringQuestion(true);
    const answerText = `${question.question}: ${option}`;
    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: answerText }]);

    const aiMsgId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, { id: aiMsgId, sender: 'ai', text: '', isTyping: true }]);

    try {
      const response = await sendBrainstormMessageStream(
        projectId,
        answerText,
        sessionId,
        (token) => {
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, text: m.text + token } : m
          ));
        }
      );

      if (!response) throw new Error('No response');
      if (response.session_id) setSessionId(response.session_id);
      if (response.state) setProjectState(response.state);

      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? {
          ...m,
          text: response.assistant_response || m.text,
          isTyping: false,
          questions: response.questions || [],
          featureProposals: (response.feature_proposals || []).map((fp: any) => ({ ...fp, status: 'pending' })),
          completion: response.completion || null,
          state: response.state,
        } : m
      ));
      if (onFeatureChange) onFeatureChange();
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, text: `Error: ${err.message || 'Failed to answer'}`, isTyping: false }
          : m
      ));
    } finally {
      setAnsweringQuestion(false);
    }
  };

  const handleApplyProposal = async (msgId: string, proposal: FeatureProposal) => {
    setProcessingSuggestion(prev => ({ ...prev, [proposal.suggestion_id]: true }));
    try {
      await applySuggestion(proposal.suggestion_id, selectedFeatureIds[proposal.suggestion_id]);
      setMessages(prev => prev.map(msg => {
        if (msg.id === msgId && msg.featureProposals) {
          return {
            ...msg,
            featureProposals: msg.featureProposals.map(fp =>
              fp.suggestion_id === proposal.suggestion_id ? { ...fp, status: 'applied' as const } : fp
            )
          };
        }
        return msg;
      }));
      window.dispatchEvent(new Event('prd-updated'));
      if (onFeatureChange) onFeatureChange();
    } catch (err: any) {
      alert(err.message || 'Failed to apply');
    } finally {
      setProcessingSuggestion(prev => ({ ...prev, [proposal.suggestion_id]: false }));
    }
  };

  const handleSkipProposal = async (msgId: string, proposal: FeatureProposal) => {
    setProcessingSuggestion(prev => ({ ...prev, [proposal.suggestion_id]: true }));
    try {
      await skipSuggestion(proposal.suggestion_id);
      setMessages(prev => prev.map(msg => {
        if (msg.id === msgId && msg.featureProposals) {
          return {
            ...msg,
            featureProposals: msg.featureProposals.map(fp =>
              fp.suggestion_id === proposal.suggestion_id ? { ...fp, status: 'skipped' as const } : fp
            )
          };
        }
        return msg;
      }));
    } catch (err: any) {
      alert(err.message || 'Failed to skip');
    } finally {
      setProcessingSuggestion(prev => ({ ...prev, [proposal.suggestion_id]: false }));
    }
  };

  // Switch to a different session
  const handleSelectSession = async (selSessionId: string) => {
    if (!selSessionId || selSessionId === sessionId) return;
    setLoading(true);
    try {
      const data = await getChatSessionHistory(projectId, selSessionId);
      setSessionId(data.session_id);
      if (data.messages && data.messages.length > 0) {
        const loaded: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id || `hist-${Date.now()}-${Math.random()}`,
          sender: m.sender === 'user' ? 'user' : 'ai',
          text: m.text || m.content || '',
        }));
        setMessages(loaded);
      }
    } catch (err) {
      console.error('Failed to switch session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || loading) return;
    setLoading(true);

    const filenames = files.map(f => f.name).join(', ');
    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: `[Uploading ${files.length} file(s): ${filenames}]` }]);

    try {
      // Upload files sequentially — backend appends each to prd_text
      let lastResponse = null;
      for (let i = 0; i < files.length; i++) {
        const isLast = i === files.length - 1;
        setMessages(prev => {
          const msgs = [...prev];
          // Update the uploading message to show progress
          const uploadMsg = msgs.find(m => m.id === userMsgId);
          if (uploadMsg) uploadMsg.text = `[Uploading ${i + 1}/${files.length}: ${files[i].name}]`;
          return msgs;
        });
        lastResponse = await sendBrainstormMessage(projectId, '', sessionId, files[i]);
        if (lastResponse.session_id) setSessionId(lastResponse.session_id);
      }

      // Only show the last response as an AI message
      if (lastResponse) {
        setMessages(prev => prev.filter(m => m.id !== userMsgId).concat([
          { id: userMsgId, sender: 'user', text: `[Uploaded ${files.length} file(s): ${filenames}]` },
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: lastResponse.assistant_response || `${files.length} PRD(s) uploaded and parsed.`,
            questions: lastResponse.questions || [],
            featureProposals: (lastResponse.feature_proposals || []).map((fp: any) => ({ ...fp, status: 'pending' })),
            completion: lastResponse.completion || null,
            state: lastResponse.state,
          }
        ]));
        if (onFeatureChange) onFeatureChange();
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: `error-${Date.now()}`, sender: 'ai', text: `Upload error: ${err.message}` }]);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isDark = theme === 'dark';
  const tc = (dark: string, light: string) => isDark ? dark : light;

  const severityColors: Record<string, string> = {
    critical: tc('text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10', 'text-[#cf222e] border-[#cf222e]/30 bg-[#cf222e]/10'),
    moderate: tc('text-[#d29922] border-[#d29922]/30 bg-[#d29922]/10', 'text-[#9a6700] border-[#9a6700]/30 bg-[#9a6700]/10'),
    minor: tc('text-[#8b949e] border-[#30363d]', 'text-[#57606a] border-[#d0d7de]'),
  };

  const lastCompletion = [...messages].reverse().find(m => m.completion)?.completion;

  return (
    <div className={`flex flex-col h-full w-full font-mono text-sm overflow-hidden ${tc('bg-[#0d1117] text-[#c9d1d9]', 'bg-[#ffffff] text-[#24292f]')
      }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex flex-col gap-2 border-b shrink-0 ${tc('bg-[#161b22] border-[#30363d]', 'bg-[#f6f8fa] border-[#d0d7de]')
        }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase tracking-wide ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
              BRAINSTORM
            </span>
            {lastCompletion && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tc('border-[#30363d] text-[#58a6ff] bg-[#1f6feb]/10', 'border-[#d0d7de] text-[#0969da] bg-[#0969da]/10')
                }`}>
                {lastCompletion.modules_done}/{lastCompletion.modules_total} modules
              </span>
            )}
            {lastCompletion?.current_module && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tc('border-[#30363d] text-[#8b949e]', 'border-[#d0d7de] text-[#57606a]')
                }`}>
                @{lastCompletion.current_module}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.md,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className={`text-[10px] uppercase font-bold px-2 py-1 border rounded transition-colors ${tc('border-[#30363d] hover:bg-[#30363d] text-[#c9d1d9]', 'border-[#d0d7de] hover:bg-[#e5e7eb] text-[#24292f]')
                }`}
            >
              [UPLOAD PRD]
            </button>
            <button
              onClick={handleEntityExtract}
              disabled={entityExtracting}
              className={`text-[10px] uppercase font-bold px-2 py-1 border rounded transition-colors ${entityExtracting ? 'opacity-50 cursor-wait' : ''
                } ${tc('border-[#a371f7]/40 text-[#a371f7] hover:bg-[#a371f7]/10', 'border-[#8250df]/40 text-[#8250df] hover:bg-[#8250df]/10')
                }`}
            >
              {entityExtracting ? 'EXTRACTING...' : '[ENTITY-FIRST]'}
            </button>
          </div>
        </div>

        {/* Session selector */}
        {sessions.length > 0 && (
          <select
            value={sessionId || ''}
            onChange={(e) => handleSelectSession(e.target.value)}
            className={`w-full text-[10px] font-mono p-1.5 rounded border outline-none cursor-pointer ${tc('bg-[#0d1117] border-[#30363d] text-[#8b949e]', 'bg-[#ffffff] border-[#d0d7de] text-[#57606a]')
              }`}
          >
            {sessions.map((s: any) => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — {s.title?.substring(0, 60) || 'Untitled'}
              </option>
            ))}
          </select>
        )}

        {/* Progress bar */}
        {lastCompletion && lastCompletion.modules_total > 0 && (
          <div className={`w-full h-1 rounded-full ${tc('bg-[#21262d]', 'bg-[#e5e7eb]')}`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${lastCompletion.ready_to_finalize
                ? 'bg-[#3fb950]'
                : tc('bg-[#1f6feb]', 'bg-[#0969da]')
                }`}
              style={{ width: `${(lastCompletion.modules_done / lastCompletion.modules_total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Messages */}
      {/* Paused pipeline clarification panel — interactive gap Q&A */}
      {projectState === 'needs_clarification' && blockingGaps.length > 0 && (() => {
        const gap = blockingGaps[currentGapIndex];
        const answeredCount = answeredGapIndices.size;
        const allDone = answeredCount >= blockingGaps.length;
        return (
          <div className={`mx-4 mt-4 rounded border shrink-0 ${tc('border-[#f0883e]/40 bg-[#f0883e]/8', 'border-[#bc4c00]/40 bg-[#bc4c00]/8')}`}>
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-2 border-b ${tc('border-[#f0883e]/30', 'border-[#bc4c00]/30')}`}>
              <span className={`text-[10px] font-bold uppercase ${tc('text-[#f0883e]', 'text-[#bc4c00]')}`}>
                ⚠ Pipeline Paused — Clarification Required
              </span>
              <div className="flex gap-1">
                {blockingGaps.map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-2 h-2 rounded-full border transition-colors ${answeredGapIndices.has(i)
                        ? tc('bg-[#3fb950] border-[#3fb950]', 'bg-[#1a7f37] border-[#1a7f37]')
                        : i === currentGapIndex
                          ? tc('bg-[#f0883e] border-[#f0883e]', 'bg-[#bc4c00] border-[#bc4c00]')
                          : tc('bg-transparent border-[#f0883e]/40', 'bg-transparent border-[#bc4c00]/40')
                      }`}
                    title={answeredGapIndices.has(i) ? 'Answered' : `Gap ${i + 1}`}
                  />
                ))}
                <span className={`ml-1 text-[9px] font-bold ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                  {answeredCount}/{blockingGaps.length}
                </span>
              </div>
            </div>
            {/* Current gap */}
            {!allDone && gap && (
              <div className="px-3 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 border rounded shrink-0 ${tc('border-[#f0883e]/40 text-[#f0883e]', 'border-[#bc4c00]/40 text-[#bc4c00]')}`}>
                    [{gap.area}]
                  </span>
                  <span className={`text-xs font-semibold ${tc('text-[#c9d1d9]', 'text-[#24292f]')}`}>
                    {gap.question}
                  </span>
                </div>
                {gap.description && (
                  <p className={`text-[10px] ml-[3.5rem] ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>{gap.description}</p>
                )}
                <GapAnswerInput
                  gapIndex={currentGapIndex}
                  disabled={answeringQuestion}
                  onSubmit={(answer) => handleAnswerGap(currentGapIndex, answer)}
                  tc={tc}
                />
              </div>
            )}
            {allDone && (
              <div className={`px-3 py-2 text-[10px] font-bold ${tc('text-[#3fb950]', 'text-[#1a7f37]')}`}>
                ✓ All gaps answered — re-running pipeline...
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-2">
            {/* Sender */}
            <div className={`text-xs font-bold ${msg.sender === 'user'
              ? tc('text-[#58a6ff]', 'text-[#0969da]')
              : tc('text-[#a371f7]', 'text-[#8250df]')
              }`}>
              {msg.sender === 'user' ? 'you@workspace ~ %' : 'architect@brainstorm ~ %'}
            </div>

            {/* Text */}
            {/* Text — with typing cursor when streaming */}
            {(msg.text || msg.isTyping) && (
              <div className={`font-sans text-sm leading-relaxed whitespace-pre-wrap ${tc('text-[#c9d1d9]', 'text-[#24292f]')
                }`}>
                {msg.text}
                {msg.isTyping && (
                  <span className={`inline-block w-[2px] h-[1em] ml-0.5 align-middle animate-pulse ${tc('bg-[#a371f7]', 'bg-[#8250df]')
                    }`} />
                )}
              </div>
            )}

            {/* Question cards */}
            {msg.questions && msg.questions.length > 0 && (
              <div className="space-y-3 mt-2">
                {msg.questions.map((q, qi) => (
                  <div key={qi} className={`border rounded p-3 ${tc('bg-[#161b22] border-[#30363d]', 'bg-[#f6f8fa] border-[#d0d7de]')
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border rounded ${severityColors[q.severity] || severityColors.minor}`}>
                        [{q.severity}]
                      </span>
                      <span className={`text-[9px] ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                        {q.module} · {q.category}
                      </span>
                    </div>
                    <div className={`font-sans text-sm font-semibold mb-1 ${tc('text-[#c9d1d9]', 'text-[#24292f]')}`}>
                      {q.question}
                    </div>
                    <div className={`text-xs mb-3 ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                      {q.context}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {q?.options?.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => handleAnswerQuestion(q, opt)}
                          disabled={answeringQuestion || loading}
                          className={`text-xs px-3 py-1.5 border rounded transition-colors ${opt === q.recommended_default
                            ? tc('border-[#3fb950] text-[#3fb950] hover:bg-[#3fb950]/10', 'border-[#1a7f37] text-[#1a7f37] hover:bg-[#1a7f37]/10')
                            : tc('border-[#30363d] hover:bg-[#21262d]', 'border-[#d0d7de] hover:bg-[#e5e7eb]')
                            } ${answeringQuestion ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {opt} {opt === q.recommended_default ? '(default)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Feature proposal cards */}
            {msg.featureProposals && msg.featureProposals.length > 0 && (
              <div className="space-y-3 mt-2">
                {msg.featureProposals.map((fp) => (
                  <div key={fp.suggestion_id} className={`border rounded p-3 ${tc('bg-[#161b22] border-[#30363d]', 'bg-[#f6f8fa] border-[#d0d7de]')
                    }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${tc('text-[#c9d1d9]', 'text-[#24292f]')}`}>
                            🔵 {fp.title}
                          </span>
                          <span className={`text-[10px] px-1.5 border rounded ${fp.confidence >= 0.85
                            ? tc('text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/5', 'text-[#1a7f37] border-[#1a7f37]/30 bg-[#1a7f37]/5')
                            : fp.confidence >= 0.6
                              ? tc('text-[#d29922] border-[#d29922]/30 bg-[#d29922]/5', 'text-[#9a6700] border-[#9a6700]/30 bg-[#9a6700]/5')
                              : tc('text-[#f85149] border-[#f85149]/30 bg-[#f85149]/5', 'text-[#cf222e] border-[#cf222e]/30 bg-[#cf222e]/5')
                            }`}>
                            {Math.round(fp.confidence * 100)}%
                          </span>
                          <span className={`text-[9px] ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                            {fp.module}
                          </span>
                        </div>
                        <div className={`text-xs mt-1 ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                          {fp.description}
                        </div>
                        {fp?.entities?.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {fp.entities.map((e, i) => (
                              <span key={i} className={`text-[9px] px-1.5 border rounded ${tc('border-[#30363d] text-[#58a6ff] bg-[#1f6feb]/10', 'border-[#d0d7de] text-[#0969da] bg-[#0969da]/10')
                                }`}>
                                {e}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {fp.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleApplyProposal(msg.id, fp)}
                              disabled={processingSuggestion[fp.suggestion_id]}
                              className={`text-[10px] uppercase font-bold px-3 py-1 border rounded ${tc('text-[#3fb950] border-[#3fb950]/40 hover:bg-[#3fb950]/10', 'text-[#1a7f37] border-[#1a7f37]/40 hover:bg-[#1a7f37]/10')
                                }`}
                            >
                              ACCEPT
                            </button>
                            <button
                              onClick={() => handleSkipProposal(msg.id, fp)}
                              disabled={processingSuggestion[fp.suggestion_id]}
                              className={`text-[10px] uppercase font-bold px-3 py-1 border rounded ${tc('text-[#8b949e] border-[#30363d] hover:bg-[#21262d]', 'text-[#57606a] border-[#d0d7de] hover:bg-[#e5e7eb]')
                                }`}
                            >
                              SKIP
                            </button>
                          </>
                        ) : (
                          <span className={`text-[10px] uppercase font-bold ${fp.status === 'applied'
                            ? tc('text-[#3fb950]', 'text-[#1a7f37]')
                            : tc('text-[#8b949e]', 'text-[#57606a]')
                            }`}>
                            [{fp.status.toUpperCase()}]
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Todos */}
                    {fp.todos && fp.todos.length > 0 && (
                      <div className={`mt-2 pt-2 border-t ${tc('border-[#30363d]', 'border-[#d0d7de]')}`}>
                        <div className={`text-[10px] uppercase font-bold mb-1.5 ${tc('text-[#8b949e]', 'text-[#57606a]')}`}>
                          Todos ({fp.todos.length})
                        </div>
                        {fp.todos.map((t, ti) => (
                          <div key={ti} className={`text-xs ml-2 mb-0.5 ${tc('text-[#c9d1d9]', 'text-[#24292f]')}`}>
                            <span className={tc('text-[#8b949e]', 'text-[#57606a]')}>▸ </span>
                            {t.title}
                            {t.detail && <span className={`ml-1 ${tc('text-[#484f58]', 'text-[#8c959f]')}`}>— {t.detail}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Architecture implications */}
                    {fp.arch_implications && (
                      <div className={`mt-2 pt-2 border-t ${tc('border-[#30363d]', 'border-[#d0d7de]')}`}>
                        <div className={`text-[10px] uppercase font-bold mb-1 ${tc('text-[#d29922]', 'text-[#9a6700]')}`}>
                          ⚠ Architecture Impact
                        </div>
                        {fp.arch_implications.schema && fp.arch_implications.schema.length > 0 && (
                          <div className="text-[10px] ml-2">
                            <span className={tc('text-[#8b949e]', 'text-[#57606a]')}>Schema: </span>
                            {fp.arch_implications.schema.map((s, si) => (
                              <span key={si} className={tc('text-[#c9d1d9]', 'text-[#24292f]')}>
                                {s.table}({s.columns.join(', ')})
                                {si < (fp.arch_implications.schema?.length || 0) - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {fp.arch_implications.api && fp.arch_implications.api.length > 0 && (
                          <div className="text-[10px] ml-2 mt-0.5">
                            <span className={tc('text-[#8b949e]', 'text-[#57606a]')}>API: </span>
                            {fp.arch_implications.api.map((a, ai) => (
                              <span key={ai} className={tc('text-[#3fb950]', 'text-[#1a7f37]')}>
                                {a.method} {a.endpoint}
                                {ai < (fp.arch_implications.api?.length || 0) - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Completion banner */}
            {msg.completion?.ready_to_finalize && (
              <div className={`mt-2 p-3 border rounded text-center ${tc('border-[#3fb950]/30 bg-[#3fb950]/5 text-[#3fb950]', 'border-[#1a7f37]/30 bg-[#1a7f37]/5 text-[#1a7f37]')
                }`}>
                <div className="text-sm font-bold mb-1">All {msg.completion.modules_total} modules explored</div>
                <div className="text-xs">Ready to finalize the feature tree.</div>
                <button
                  onClick={() => handleCommand('finalize')}
                  disabled={loading}
                  className={`mt-2 text-xs uppercase font-bold px-4 py-1.5 border rounded ${tc('border-[#3fb950] hover:bg-[#3fb950]/20', 'border-[#1a7f37] hover:bg-[#1a7f37]/20')
                    }`}
                >
                  FINALIZE
                </button>
              </div>
            )}

            {/* State badge */}
            {msg.state && (
              <div className={`text-[9px] uppercase font-bold flex items-center gap-1 ${msg.state === 'finalized' || msg.state === 'synced'
                ? tc('text-[#3fb950]', 'text-[#1a7f37]')
                : msg.state === 'updating'
                  ? tc('text-[#d29922]', 'text-[#9a6700]')
                  : msg.state === 'needs_clarification'
                    ? tc('text-[#f0883e]', 'text-[#bc4c00]')
                    : tc('text-[#8b949e]', 'text-[#57606a]')
                }`}>
                {msg.state === 'needs_clarification' && <span>⚠</span>}
                [{msg.state.toUpperCase().replace('_', ' ')}]
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className={`text-xs animate-pulse ${tc('text-[#a371f7]', 'text-[#8250df]')}`}>
            architect@brainstorm ~ % _
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick commands */}
      <div className={`px-4 py-2 border-t flex flex-wrap gap-1.5 shrink-0 ${tc('border-[#30363d] bg-[#161b22]', 'border-[#d0d7de] bg-[#f6f8fa]')
        }`}>
        <button onClick={() => handleCommand('skip')} disabled={loading}
          className={`text-[10px] px-2 py-1 border rounded ${tc('border-[#30363d] hover:bg-[#21262d]', 'border-[#d0d7de] hover:bg-[#e5e7eb]')}`}>
          Skip Module
        </button>
        <button onClick={() => handleCommand('finalize')} disabled={loading}
          className={`text-[10px] px-2 py-1 border rounded ${tc('border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/10', 'border-[#1a7f37]/40 text-[#1a7f37] hover:bg-[#1a7f37]/10')}`}>
          Finalize
        </button>
        <button onClick={() => handleCommand('unfinalize')} disabled={loading}
          className={`text-[10px] px-2 py-1 border rounded ${tc('border-[#d29922]/40 text-[#d29922] hover:bg-[#d29922]/10', 'border-[#9a6700]/40 text-[#9a6700] hover:bg-[#9a6700]/10')}`}>
          Unfinalize
        </button>
        <button onClick={() => handleCommand('show architecture')} disabled={loading}
          className={`text-[10px] px-2 py-1 border rounded ${tc('border-[#30363d] hover:bg-[#21262d]', 'border-[#d0d7de] hover:bg-[#e5e7eb]')}`}>
          Show Architecture
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className={`flex border-t ${tc('border-[#30363d] bg-[#0d1117]', 'border-[#d0d7de] bg-[#ffffff]')}`}>
        <div className={`flex items-center px-4 text-sm font-bold ${tc('text-[#58a6ff]', 'text-[#0969da]')}`}>&gt;</div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a requirement, answer, or command..."
          className="flex-1 bg-transparent py-4 pr-4 text-sm outline-none font-mono"
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={`px-6 text-sm font-bold uppercase transition-colors disabled:opacity-50 ${tc('bg-[#238636] hover:bg-[#2ea043] text-white', 'bg-[#2da44e] hover:bg-[#2c974b] text-white')
            }`}
        >
          EXEC
        </button>
      </form>
    </div>
  );
}
