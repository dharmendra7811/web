"use client";

import { useState, useEffect, useRef } from 'react';
import { sendChatMessage, applySuggestion, skipSuggestion } from '@/lib/api';

interface ChatPanelProps {
  projectId: string;
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

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Hello! I am your Requirements Impact Assistant. Ask me to add features, adjust tasks, or perform impact triage. Try typing 'Add Google OAuth login'."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [processingSuggestions, setProcessingSuggestions] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMsgId = `user-${Date.now()}`;
    
    // Add user message to UI
    setMessages(prev => [...prev, { id: userMsgId, sender: 'user', text: userText }]);
    setInput('');
    setLoading(true);

    try {
      // Post to Fastify chat endpoint
      const response = await sendChatMessage(projectId, userText, sessionId);
      
      // Update session ID if generated
      if (response.session_id) {
        setSessionId(response.session_id);
      }

      // Add AI response and suggestions
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

  const handleApply = async (messageId: string, suggestionId: string) => {
    setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: true }));
    try {
      await applySuggestion(suggestionId);
      
      // Update local state to show applied
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

      // Broadcast event so details & graph views update immediately
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
      
      // Update local state to show skipped
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

  return (
    <div className="border border-slate-800 rounded-2xl bg-slate-900 shadow-2xl flex flex-col h-[600px] text-slate-100 overflow-hidden font-sans">
      
      {/* Chat Panel Header */}
      <div className="bg-slate-950/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-350">PRD Assistant</h2>
            <p className="text-[9px] text-slate-500 mt-0.5 font-medium">Triage scope modifications via English prompt</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-900/50">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
          AI coprocessor
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pr-1 scrollbar-thin select-text">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] text-xs shadow-md leading-relaxed ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white font-medium rounded-br-none shadow-indigo-600/10 border border-indigo-500/30' 
                  : 'bg-slate-950/50 text-slate-200 border border-slate-800/80 rounded-bl-none'
              }`}>
                {msg.text}
              </div>
            </div>

            {/* Suggestions cards deck */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="pl-4 border-l-2 border-indigo-500/40 space-y-3 mt-1.5 max-w-[95%]">
                <div className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-widest mb-1.5">
                  Proposed Technical Updates
                </div>
                {msg.suggestions.map((sug) => {
                  const typeColors = {
                    add: { border: 'border-emerald-900/40', bg: 'bg-emerald-950/15', text: 'text-emerald-300', badge: 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' },
                    modify: { border: 'border-amber-900/40', bg: 'bg-amber-950/10', text: 'text-amber-300', badge: 'bg-amber-950/80 text-amber-400 border border-amber-900/50' },
                    remove: { border: 'border-rose-900/40', bg: 'bg-rose-950/10', text: 'text-rose-300', badge: 'bg-rose-950/80 text-rose-400 border border-rose-900/50' },
                    flag: { border: 'border-purple-900/40', bg: 'bg-purple-950/10', text: 'text-purple-300', badge: 'bg-purple-950/80 text-purple-400 border border-purple-900/50' }
                  };
                  const colors = typeColors[sug.suggestion_type] || typeColors.add;
                  
                  return (
                    <div key={sug.id} className={`border rounded-xl p-3 ${colors.border} ${colors.bg} shadow-md transition-all duration-200`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${colors.badge}`}>
                          {sug.suggestion_type} task
                        </span>
                        <span className="text-[9px] text-slate-500 font-semibold font-mono">IMPACT TRIAGE</span>
                      </div>
                      
                      <p className="text-xs text-slate-350 font-medium leading-relaxed mb-2.5">{sug.description}</p>
                      
                      {sug.proposed_value && (
                        <div className="bg-slate-950/80 rounded-lg border border-slate-850 p-2.5 text-[10px] text-slate-400 mb-3 space-y-1.5">
                          <div>
                            <span className="font-semibold text-slate-300">Title:</span> {sug.proposed_value.title}
                          </div>
                          {sug.proposed_value.detail && (
                            <div className="line-clamp-2">
                              <span className="font-semibold text-slate-300">Detail:</span> {sug.proposed_value.detail}
                            </div>
                          )}
                          {sug.proposed_value.entities && sug.proposed_value.entities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-slate-900">
                              {sug.proposed_value.entities.map(e => (
                                <span key={e} className="bg-slate-900 text-slate-450 border border-slate-800/80 px-1 py-0.2 rounded text-[8px]">
                                  {e}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex justify-end gap-2 text-[10px]">
                        {sug.status === 'pending' ? (
                          <>
                            <button
                              disabled={processingSuggestions[sug.id]}
                              onClick={() => handleSkip(msg.id, sug.id)}
                              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold transition"
                            >
                              Skip
                            </button>
                            <button
                              disabled={processingSuggestions[sug.id]}
                              onClick={() => handleApply(msg.id, sug.id)}
                              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition flex items-center gap-1 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:bg-indigo-700"
                            >
                              {processingSuggestions[sug.id] ? (
                                <span className="animate-spin rounded-full h-2 w-2 border-b border-white mr-0.5"></span>
                              ) : null}
                              Apply Changes
                            </button>
                          </>
                        ) : sug.status === 'applied' ? (
                          <span className="inline-flex items-center text-emerald-400 font-bold px-2.5 py-1 bg-emerald-950/20 rounded-lg border border-emerald-900/40">
                            ✓ Applied to System
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-slate-500 px-2.5 py-1 bg-slate-950/30 rounded-lg border border-slate-850">
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
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl rounded-bl-none px-3.5 py-2.5 text-xs text-slate-400 flex items-center gap-2.5">
              <span className="flex space-x-1">
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span>Analyzing scope impact...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-slate-800 bg-slate-950/40">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a change (e.g. 'Add Google OAuth login')..."
          className="bg-slate-950 border border-slate-800 p-2.5 flex-1 rounded-xl text-xs text-white placeholder-slate-650 focus:outline-none focus:ring-1 focus:ring-indigo-500/80 transition-all border-slate-800/60"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-indigo-500 active:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 active:shadow-indigo-750/30 transform hover:-translate-y-0.5 active:translate-y-0 duration-150"
        >
          Send
        </button>
      </form>
    </div>
  );
}
