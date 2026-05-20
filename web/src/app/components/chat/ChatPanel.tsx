"use client";

import { useState, useEffect, useRef } from 'react';
import { sendChatMessage, applySuggestion, skipSuggestion } from '@/lib/api';

interface ChatPanelProps {
  projectId: string;
  theme?: 'light' | 'dark';
}

interface Suggestion {
  id: string;
  suggestion_type: 'add' | 'modify' | 'remove' | 'flag';
  description: string;
  proposed_value?: {
    title: string;
    detail?: string;
    entities?: string[];
    feature_id?: string;
  };
  status: 'pending' | 'applied' | 'skipped';
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  suggestions?: Suggestion[];
}

export default function ChatPanel({ projectId, theme = 'dark' }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Hello! I am your Requirements Impact Assistant. Ask me to add features, adjust tasks, or perform impact triage. Try typing 'Add Google OAuth login' or click one of the quick commands below!"
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [processingSuggestions, setProcessingSuggestions] = useState<Record<string, boolean>>({});
  
  // Interactive expanded suggestion details state
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const executeCommand = async (commandText: string) => {
    if (loading) return;
    setInput('');
    setLoading(true);

    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: commandText }]);

    try {
      const response = await sendChatMessage(projectId, commandText, sessionId);
      if (response.session_id) {
        setSessionId(response.session_id);
      }

      const aiMsgId = `ai-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          id: aiMsgId,
          sender: 'ai',
          text: response.assistant_response,
          suggestions: response.suggestions || []
        }
      ]);
    } catch (error: any) {
      console.error('Failed to send chat message:', error);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          sender: 'ai',
          text: "I encountered an error analyzing your requirements. Please verify that the local Fastify backend is active."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const commandText = input.trim();
    executeCommand(commandText);
  };

  const handleApply = async (messageId: string, suggestionId: string) => {
    setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: true }));
    try {
      await applySuggestion(suggestionId);
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.suggestions) {
          return {
            ...msg,
            suggestions: msg.suggestions.map(sug => 
              sug.id === suggestionId ? { ...sug, status: 'applied' } : sug
            )
          };
        }
        return msg;
      }));

      // Trigger hot reload on explorer list and visual graph views
      window.dispatchEvent(new Event('prd-updated'));
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
      alert('Failed to apply suggestion');
    } finally {
      setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: false }));
    }
  };

  const handleSkip = async (messageId: string, suggestionId: string) => {
    setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: true }));
    try {
      await skipSuggestion(suggestionId);
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.suggestions) {
          return {
            ...msg,
            suggestions: msg.suggestions.map(sug => 
              sug.id === suggestionId ? { ...sug, status: 'skipped' } : sug
            )
          };
        }
        return msg;
      }));
    } catch (error) {
      console.error('Failed to skip suggestion:', error);
      alert('Failed to skip suggestion');
    } finally {
      setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: false }));
    }
  };

  const toggleDetails = (sugId: string) => {
    setExpandedSuggestions(prev => ({
      ...prev,
      [sugId]: !prev[sugId]
    }));
  };

  // Quick Action Pills list
  const quickActions = [
    { label: "✦ Add Google OAuth", text: "Add Google OAuth login feature and create technical tasks" },
    { label: "✦ Mark as Done", text: "Mark all Design tasks as Done" },
    { label: "✦ Triage Scope", text: "Analyze project scope and list missing database components" }
  ];

  return (
    <div className={`border rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden font-sans transition-all duration-300 ${
      theme === 'dark' ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-205 bg-white text-slate-800'
    }`}>
      
      {/* Chat Panel Header */}
      <div className={`border-b px-4 py-3 flex items-center justify-between transition-colors ${
        theme === 'dark' ? 'bg-slate-955 border-slate-800/80' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <div>
            <h2 className={`text-xs font-black uppercase tracking-wider ${
              theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
            }`}>
              PRD Assistant
            </h2>
            <p className={`text-[9px] mt-0.5 font-bold ${
              theme === 'dark' ? 'text-slate-500' : 'text-slate-450'
            }`}>
              Triage scope modifications via English prompt
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border transition-all hover:scale-105 ${
          theme === 'dark' 
            ? 'bg-indigo-950/80 text-indigo-355 border-indigo-900/50 shadow-[0_2px_8px_rgba(99,102,241,0.15)]' 
            : 'bg-indigo-50 text-indigo-755 border-indigo-200'
        }`}>
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping"></span>
          AI coprocessor
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pr-1 scrollbar-thin select-text">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2.5 animate-[fadeIn_0.2s_ease-out]">
            <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] text-xs shadow-md leading-relaxed transform hover:scale-[1.01] transition-transform duration-200 ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white font-bold rounded-br-none shadow-indigo-600/10 border border-indigo-500/30' 
                  : theme === 'dark'
                    ? 'bg-slate-950/50 text-slate-200 border border-slate-800/80 rounded-bl-none'
                    : 'bg-slate-50 text-slate-700 border-slate-150 rounded-bl-none'
              }`}>
                {msg.text}
              </div>
            </div>

            {/* Suggestions cards deck */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="pl-4 border-l-2 border-indigo-500/40 space-y-3.5 mt-1.5 max-w-[95%]">
                <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${
                  theme === 'dark' ? 'text-indigo-400' : 'text-indigo-650'
                }`}>
                  Proposed Technical Updates
                </div>
                {msg.suggestions.map((sug) => {
                  const typeColors = theme === 'dark' 
                    ? {
                        add: { border: 'border-emerald-900/40', bg: 'bg-emerald-950/15', text: 'text-emerald-350', badge: 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' },
                        modify: { border: 'border-amber-900/40', bg: 'bg-amber-950/10', text: 'text-amber-350', badge: 'bg-amber-950/80 text-amber-400 border border-amber-900/50' },
                        remove: { border: 'border-rose-900/40', bg: 'bg-rose-950/10', text: 'text-rose-350', badge: 'bg-rose-950/80 text-rose-450 border border-rose-900/50' },
                        flag: { border: 'border-purple-900/40', bg: 'bg-purple-950/10', text: 'text-purple-355', badge: 'bg-purple-950/80 text-purple-400 border border-purple-900/50' }
                      }
                    : {
                        add: { border: 'border-emerald-250', bg: 'bg-emerald-50/50', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
                        modify: { border: 'border-amber-250', bg: 'bg-amber-50/50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
                        remove: { border: 'border-rose-250', bg: 'bg-rose-50/50', text: 'text-rose-800', badge: 'bg-rose-100 text-rose-700 border border-rose-200' },
                        flag: { border: 'border-purple-250', bg: 'bg-purple-50/50', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-755 border border-purple-200' }
                      };
                  const colors = typeColors[sug.suggestion_type] || typeColors.add;
                  const isDetailsExpanded = expandedSuggestions[sug.id];
                  
                  return (
                    <div key={sug.id} className={`border rounded-2xl p-3 shadow-md transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-indigo-500/5 ${colors.border} ${colors.bg}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider ${colors.badge}`}>
                          {sug.suggestion_type} task
                        </span>
                        <span className={`text-[9px] font-black font-mono tracking-wide ${
                          theme === 'dark' ? 'text-slate-500' : 'text-slate-450'
                        }`}>
                          IMPACT TRIAGE
                        </span>
                      </div>
                      
                      <p className={`text-xs font-extrabold leading-relaxed mb-2 ${
                        theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        {sug.description}
                      </p>
                      
                      {sug.proposed_value && (
                        <div className="mb-2">
                          <div 
                            onClick={() => toggleDetails(sug.id)}
                            className={`flex items-center gap-1.5 py-1 px-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wide cursor-pointer transition ${
                              theme === 'dark' ? 'hover:bg-slate-950/50 text-slate-450' : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span className={`transform transition-transform duration-150 ${isDetailsExpanded ? 'rotate-90' : ''}`}>
                              <svg className="w-2 h-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </span>
                            <span className="text-violet-500">📁 proposed_changes</span>
                          </div>

                          {isDetailsExpanded && (
                            <div className={`mt-1.5 rounded-xl border p-2.5 text-[10px] space-y-1.5 transition-all duration-300 animate-[fadeIn_0.2s_ease-out] ${
                              theme === 'dark' 
                                ? 'bg-slate-950/80 border-slate-850 text-slate-350 shadow-inner' 
                                : 'bg-white border-slate-200 text-slate-655 shadow-inner'
                            }`}>
                              <div>
                                <span className={`font-black ${theme === 'dark' ? 'text-slate-250' : 'text-slate-850'}`}>Title:</span> {sug.proposed_value.title}
                              </div>
                              {sug.proposed_value.detail && (
                                <div className="line-clamp-3">
                                  <span className={`font-black ${theme === 'dark' ? 'text-slate-250' : 'text-slate-855'}`}>Detail:</span> {sug.proposed_value.detail}
                                </div>
                              )}
                              {sug.proposed_value.entities && sug.proposed_value.entities.length > 0 && (
                                <div className={`flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t ${
                                  theme === 'dark' ? 'border-slate-900' : 'border-slate-100'
                                }`}>
                                  {sug.proposed_value.entities.map(e => (
                                    <span key={e} className={`px-1.5 py-0.2 rounded-lg text-[8px] border font-bold ${
                                      theme === 'dark' 
                                        ? 'bg-slate-900 text-slate-400 border-slate-800' 
                                        : 'bg-slate-50 text-slate-600 border-slate-150'
                                    }`}>
                                      {e}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex justify-end gap-2 text-[10px] pt-1">
                        {sug.status === 'pending' ? (
                          <>
                            <button
                              disabled={processingSuggestions[sug.id]}
                              onClick={() => handleSkip(msg.id, sug.id)}
                              className={`px-3 py-1.5 rounded-xl border font-black cursor-pointer transition hover:scale-105 active:scale-95 duration-150 ${
                                theme === 'dark' 
                                  ? 'border-slate-700 hover:bg-slate-800 text-slate-300 shadow-sm' 
                                  : 'border-slate-300 hover:bg-slate-100 text-slate-600 shadow-sm'
                              }`}
                            >
                              Skip
                            </button>
                            <button
                              disabled={processingSuggestions[sug.id]}
                              onClick={() => handleApply(msg.id, sug.id)}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition flex items-center gap-1 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:bg-indigo-700 hover:scale-105 active:scale-95 duration-150 cursor-pointer"
                            >
                              {processingSuggestions[sug.id] ? (
                                <span className="animate-spin rounded-full h-2.5 w-2.5 border-t border-b border-white mr-0.5"></span>
                              ) : null}
                              Apply Changes
                            </button>
                          </>
                        ) : sug.status === 'applied' ? (
                          <span className={`inline-flex items-center font-black px-2.5 py-1.5 rounded-xl border shadow-sm transition-all duration-200 hover:scale-105 ${
                            theme === 'dark' 
                              ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/40 shadow-emerald-950/10' 
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}>
                            ✓ Applied to System
                          </span>
                        ) : (
                          <span className={`inline-flex items-center font-bold px-2.5 py-1.5 rounded-xl border ${
                            theme === 'dark' 
                              ? 'text-slate-500 bg-slate-950/30 border-slate-850' 
                              : 'text-slate-500 bg-slate-100 border-slate-200'
                          }`}>
                            ✕ Skipped
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className={`border rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs flex items-center gap-2.5 shadow-sm transition-colors duration-300 ${
              theme === 'dark' 
                ? 'bg-slate-955/50 border-slate-800/80 text-slate-400' 
                : 'bg-slate-50 border-slate-150 text-slate-600'
            }`}>
              <span className="flex space-x-1">
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s]"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></span>
              </span>
              <span className="font-semibold tracking-wide">Analyzing scope impact...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Quick Action Pills Deck */}
      <div className={`px-4 py-2 border-t flex flex-wrap gap-2 transition-colors ${
        theme === 'dark' ? 'border-slate-850 bg-slate-900/60' : 'border-slate-150 bg-slate-50/50'
      }`}>
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => executeCommand(action.text)}
            disabled={loading}
            className={`text-[9px] font-black tracking-wide uppercase px-2.5 py-1 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              theme === 'dark'
                ? 'bg-slate-950 border-slate-800 hover:border-slate-700 text-indigo-300 hover:text-indigo-200 hover:bg-slate-900 shadow-md shadow-slate-950/20'
                : 'bg-white border-slate-205 hover:border-slate-300 text-indigo-650 hover:text-indigo-755 shadow-sm'
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className={`flex gap-2 p-3 border-t transition-colors ${
        theme === 'dark' ? 'border-slate-850 bg-slate-950/45' : 'border-slate-200 bg-slate-50'
      }`}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a change (e.g. 'Add Google OAuth login')..."
          className={`border p-2.5 flex-1 rounded-xl text-xs transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500/80 ${
            theme === 'dark' 
              ? 'bg-slate-950 border-slate-850/60 text-white placeholder-slate-600 focus:border-slate-700' 
              : 'bg-white border-slate-250 text-slate-900 placeholder-slate-400 shadow-inner focus:border-slate-350'
          }`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-indigo-600 text-white font-extrabold px-4.5 py-2.5 rounded-xl text-xs hover:bg-indigo-500 active:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:shadow-indigo-750/30 transform hover:-translate-y-0.5 active:translate-y-0 duration-150 cursor-pointer"
        >
          Send
        </button>
      </form>
    </div>
  );
}
