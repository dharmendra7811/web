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
    <div className="border rounded-lg shadow-sm bg-white p-4 flex flex-col h-[600px] border-gray-200">
      <div className="border-b pb-3 mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">PRD Assistant</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">Triages requirements change impact and suggests atomic changes.</p>
        </div>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          ● Local AI Engine
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-1 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-lg px-3.5 py-2.5 max-w-[85%] text-xs shadow-sm leading-relaxed ${
                msg.sender === 'user' 
                  ? 'bg-blue-600 text-white font-medium rounded-br-none' 
                  : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-none'
              }`}>
                {msg.text}
              </div>
            </div>

            {/* Suggestions cards deck */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className="pl-4 border-l-2 border-indigo-200 space-y-3 mt-1 max-w-[90%]">
                <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">
                  Proposed Technical Updates
                </div>
                {msg.suggestions.map((sug) => {
                  const typeColors = {
                    add: { border: 'border-green-200', bg: 'bg-green-50/50', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
                    modify: { border: 'border-amber-200', bg: 'bg-amber-50/30', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
                    remove: { border: 'border-red-200', bg: 'bg-red-50/30', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
                    flag: { border: 'border-purple-200', bg: 'bg-purple-50/30', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' }
                  };
                  const colors = typeColors[sug.suggestion_type] || typeColors.add;
                  
                  return (
                    <div key={sug.id} className={`border rounded-lg p-3 ${colors.border} ${colors.bg} shadow-sm transition-all duration-200`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${colors.badge}`}>
                          {sug.suggestion_type} todo
                        </span>
                        <span className="text-[9px] text-gray-400">Impact Triage</span>
                      </div>
                      
                      <p className="text-xs text-gray-700 font-medium mb-2">{sug.description}</p>
                      
                      {sug.proposed_value && (
                        <div className="bg-white rounded border border-gray-100 p-2 text-[10px] text-gray-600 mb-3 space-y-1">
                          <div>
                            <span className="font-semibold text-gray-700">Title:</span> {sug.proposed_value.title}
                          </div>
                          {sug.proposed_value.detail && (
                            <div className="line-clamp-2">
                              <span className="font-semibold text-gray-700">Detail:</span> {sug.proposed_value.detail}
                            </div>
                          )}
                          {sug.proposed_value.entities && sug.proposed_value.entities.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-gray-50">
                              {sug.proposed_value.entities.map(e => (
                                <span key={e} className="bg-gray-100 text-gray-500 px-1 py-0.2 rounded text-[8px]">
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
                              className="px-2.5 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-600 transition"
                            >
                              Skip
                            </button>
                            <button
                              disabled={processingSuggestions[sug.id]}
                              onClick={() => handleApply(msg.id, sug.id)}
                              className="px-3 py-1 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition flex items-center gap-1 shadow-sm"
                            >
                              {processingSuggestions[sug.id] ? (
                                <span className="animate-spin rounded-full h-2 w-2 border-b border-white"></span>
                              ) : null}
                              Apply Changes
                            </button>
                          </>
                        ) : sug.status === 'applied' ? (
                          <span className="inline-flex items-center text-green-700 font-semibold px-2 py-0.5 bg-green-50 rounded border border-green-200">
                            ✓ Applied to System
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-gray-500 px-2 py-0.5 bg-gray-50 rounded border border-gray-200">
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
            <div className="bg-gray-50 border border-gray-100 rounded-lg rounded-bl-none px-3.5 py-2.5 text-xs text-gray-500 flex items-center gap-2">
              <span className="animate-pulse flex space-x-1">
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span>Analyzing scope impact...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a change (e.g. 'Add Google OAuth login')..."
          className="border p-2.5 flex-1 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 border-gray-300"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}
