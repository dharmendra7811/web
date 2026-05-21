"use client";

import { useState, useEffect, useRef } from 'react';
import { 
  sendChatMessage, 
  applySuggestion, 
  skipSuggestion, 
  getChatHistory, 
  getChatSessions, 
  createChatSession, 
  getChatSessionHistory 
} from '@/lib/api';

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
  
  // Sessions management
  const [sessions, setSessions] = useState<any[]>([]);
  const [showSessionsList, setShowSessionsList] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch chat sessions
  const fetchSessions = async () => {
    try {
      const data = await getChatSessions(projectId);
      setSessions(data);
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    }
  };

  // Load chat history and sessions on mount or when projectId changes
  useEffect(() => {
    let active = true;
    
    const initializeChat = async () => {
      setLoading(true);
      try {
        // Load sessions list
        const sessionsData = await getChatSessions(projectId);
        if (!active) return;
        setSessions(sessionsData);

        // Load most recent active session history
        const data = await getChatHistory(projectId);
        if (!active) return;
        
        if (data.session_id) {
          setSessionId(data.session_id);
        }
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([
            {
              id: 'welcome',
              sender: 'ai',
              text: "Hello! I am your Requirements Impact Assistant. Ask me to add features, adjust tasks, or perform impact triage. Try typing 'Add Google OAuth login' or click one of the quick commands below!"
            }
          ]);
        }
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    initializeChat();

    return () => {
      active = false;
    };
  }, [projectId]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create a new chat session
  const handleNewChat = async () => {
    setLoading(true);
    try {
      const data = await createChatSession(projectId);
      setSessionId(data.session_id);
      setMessages(data.messages);
      await fetchSessions();
    } catch (error) {
      console.error('Failed to create new chat session:', error);
    } finally {
      setLoading(false);
    }
  };

  // Switch to a specific session
  const handleSelectSession = async (selSessionId: string) => {
    setLoading(true);
    try {
      const data = await getChatSessionHistory(projectId, selSessionId);
      setSessionId(data.session_id);
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setLoading(false);
    }
  };

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
      
      // Refresh sessions to dynamically update conversation title
      await fetchSessions();
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
    <div className={`border rounded-2xl flex h-[650px] overflow-hidden font-sans transition-all duration-300 ${
      theme === 'dark' 
        ? 'border-slate-800 bg-slate-900 text-slate-100' 
        : 'border-slate-200 bg-white text-slate-800'
    }`}>
      
      {/* Dynamic Conversations List Sidebar */}
      <div className={`transition-all duration-300 flex flex-col border-r h-full relative z-10 ${
        showSessionsList ? 'w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden border-r-0'
      } ${
        theme === 'dark' ? 'bg-slate-950 border-slate-850/80' : 'bg-slate-50 border-slate-200'
      }`}>
        <div className={`p-4 border-b flex items-center justify-between ${
          theme === 'dark' ? 'border-slate-850' : 'border-slate-200'
        }`}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
            Chats
          </span>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 transition-all duration-150"
            title="Create brand new conversation"
          >
            <span>+</span> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-thin">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 font-medium">
              No sessions active.
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={`w-full text-left p-3 rounded-xl border text-xs transition-all duration-200 flex flex-col gap-1.5 ${
                  s.id === sessionId
                    ? (theme === 'dark' 
                        ? 'bg-indigo-950/40 border-indigo-500/80 text-white font-bold' 
                        : 'bg-indigo-50 border-indigo-300 text-indigo-850 font-bold')
                    : (theme === 'dark' 
                        ? 'bg-slate-900/40 border-slate-850/60 hover:bg-slate-850/30 text-slate-400 hover:text-slate-200' 
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600')
                }`}
              >
                <span className="truncate w-full block text-[11px] tracking-wide">{s.title}</span>
                <span className={`text-[8px] font-bold font-mono ${
                  s.id === sessionId ? 'text-indigo-400' : 'text-slate-500'
                }`}>
                  {new Date(s.created_at).toLocaleDateString(undefined, { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Conversational Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent">
        
        {/* Chat Panel Header */}
        <div className={`border-b px-4 py-3.5 flex items-center justify-between transition-colors ${
          theme === 'dark' ? 'bg-slate-950 border-slate-850' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            {/* Sidebar toggle button */}
            <button
              onClick={() => setShowSessionsList(!showSessionsList)}
              className={`p-2 rounded-xl border transition-all duration-200 active:scale-95 ${
                theme === 'dark' 
                  ? 'border-slate-850 bg-slate-950 hover:bg-slate-900 text-slate-400' 
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
              }`}
              title="Toggle sidebar conversation list"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <div>
                <h2 className={`text-xs font-bold uppercase tracking-widest ${
                  theme === 'dark' ? 'text-slate-250' : 'text-slate-700'
                }`}>
                  PRD Assistant
                </h2>
                <p className={`text-[9px] mt-0.5 font-semibold ${
                  theme === 'dark' ? 'text-slate-500' : 'text-slate-450'
                }`}>
                  Interactive requirements impact loop
                </p>
              </div>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold uppercase border ${
            theme === 'dark' 
              ? 'bg-indigo-950/40 text-indigo-300 border-indigo-900/40' 
              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          }`}>
            AI coprocessor
          </span>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 pr-1 scrollbar-thin select-text">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
              <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs leading-relaxed border ${
                  msg.sender === 'user' 
                    ? 'bg-indigo-600 text-white font-bold rounded-br-none border-indigo-500/20' 
                    : theme === 'dark'
                      ? 'bg-slate-950/40 text-slate-200 border-slate-850/80 rounded-bl-none'
                      : 'bg-slate-50 text-slate-700 border-slate-150 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>

              {/* Suggestions deck */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="pl-4 border-l-2 border-indigo-500/30 space-y-4 mt-2 max-w-[95%]">
                  <div className={`text-[8px] font-bold uppercase tracking-widest ${
                    theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'
                  }`}>
                    Proposed Technical Updates
                  </div>
                  {msg.suggestions.map((sug) => {
                    const typeColors = theme === 'dark' 
                      ? {
                          add: { border: 'border-emerald-900/40 hover:border-emerald-700/60', bg: 'bg-emerald-950/10', text: 'text-emerald-350', badge: 'bg-emerald-950/85 text-emerald-400 border border-emerald-900/40' },
                          modify: { border: 'border-amber-900/40 hover:border-amber-700/60', bg: 'bg-amber-950/10', text: 'text-amber-350', badge: 'bg-amber-950/85 text-amber-400 border border-amber-900/40' },
                          remove: { border: 'border-rose-900/40 hover:border-rose-700/60', bg: 'bg-rose-950/10', text: 'text-rose-350', badge: 'bg-rose-950/85 text-rose-400 border border-rose-900/40' },
                          flag: { border: 'border-purple-900/40 hover:border-purple-700/60', bg: 'bg-purple-950/10', text: 'text-purple-355', badge: 'bg-purple-950/85 text-purple-400 border border-purple-900/40' }
                        }
                      : {
                          add: { border: 'border-emerald-200 hover:border-emerald-350', bg: 'bg-emerald-50/30', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
                          modify: { border: 'border-amber-200 hover:border-amber-350', bg: 'bg-amber-50/30', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
                          remove: { border: 'border-rose-200 hover:border-rose-350', bg: 'bg-rose-50/30', text: 'text-rose-800', badge: 'bg-rose-100 text-rose-700 border border-rose-200' },
                          flag: { border: 'border-purple-200 hover:border-purple-350', bg: 'bg-purple-50/30', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-755 border border-purple-200' }
                        };
                    const colors = typeColors[sug.suggestion_type] || typeColors.add;
                    const isDetailsExpanded = expandedSuggestions[sug.id];
                    
                    return (
                      <div key={sug.id} className={`border rounded-2xl p-4 transition-all duration-300 ${colors.border} ${colors.bg}`}>
                        <div className="flex justify-between items-center mb-2.5">
                          <span className={`text-[8px] px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider ${colors.badge}`}>
                            {sug.suggestion_type} task
                          </span>
                          <span className={`text-[8px] font-bold font-mono tracking-wide ${
                            theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            IMPACT TRIAGE
                          </span>
                        </div>
                        
                        <p className={`text-xs font-bold leading-relaxed mb-3 ${
                          theme === 'dark' ? 'text-slate-200' : 'text-slate-700'
                        }`}>
                          {sug.description}
                        </p>
                        
                        {sug.proposed_value && (
                          <div className="mb-3">
                            <div 
                              onClick={() => toggleDetails(sug.id)}
                              className={`flex items-center gap-1.5 py-1 px-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wide cursor-pointer transition ${
                                theme === 'dark' ? 'hover:bg-slate-950/50 text-slate-400' : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <span className={`transform transition-transform duration-150 ${isDetailsExpanded ? 'rotate-90' : ''}`}>
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </span>
                              <span className="text-violet-450">📁 Proposed Details</span>
                            </div>

                            {isDetailsExpanded && (
                              <div className={`mt-2 rounded-xl border p-3 text-[10px] space-y-2 transition-all duration-300 animate-[fadeIn_0.2s_ease-out] ${
                                theme === 'dark' 
                                  ? 'bg-slate-950 border-slate-850/80 text-slate-350 shadow-inner' 
                                  : 'bg-white border-slate-200 text-slate-600 shadow-inner'
                              }`}>
                                <div>
                                  <span className={`font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-850'}`}>Title:</span> {sug.proposed_value.title}
                                </div>
                                {sug.proposed_value.detail && (
                                  <div className="leading-relaxed text-slate-400">
                                    <span className={`font-bold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-850'}`}>Detail:</span> {sug.proposed_value.detail}
                                  </div>
                                )}
                                {sug.proposed_value.entities && sug.proposed_value.entities.length > 0 && (
                                  <div className={`flex flex-wrap gap-1.5 mt-2 pt-2 border-t ${
                                    theme === 'dark' ? 'border-slate-900' : 'border-slate-100'
                                  }`}>
                                    {sug.proposed_value.entities.map(e => (
                                      <span key={e} className={`px-2 py-0.5 rounded-lg text-[8px] border font-bold ${
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
                                className={`px-3 py-1.5 rounded-xl border font-bold cursor-pointer transition active:scale-95 duration-150 ${
                                  theme === 'dark' 
                                    ? 'border-slate-750 hover:bg-slate-800 text-slate-300' 
                                    : 'border-slate-300 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                Skip
                              </button>
                              <button
                                disabled={processingSuggestions[sug.id]}
                                onClick={() => handleApply(msg.id, sug.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition flex items-center gap-1.5 active:bg-indigo-700 active:scale-95 duration-150 cursor-pointer"
                              >
                                {processingSuggestions[sug.id] ? (
                                  <span className="animate-spin rounded-full h-2.5 w-2.5 border-t border-b border-white mr-0.5"></span>
                                ) : null}
                                Apply Changes
                              </button>
                            </>
                          ) : sug.status === 'applied' ? (
                            <span className={`inline-flex items-center font-bold px-3 py-1.5 rounded-xl border transition-all duration-200 ${
                              theme === 'dark' 
                                ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/40' 
                                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            }`}>
                              ✓ Applied to System
                            </span>
                          ) : (
                            <span className={`inline-flex items-center font-bold px-3 py-1.5 rounded-xl border ${
                              theme === 'dark' 
                                ? 'text-slate-550 bg-slate-950/30 border-slate-850' 
                                : 'text-slate-550 bg-slate-100 border-slate-200'
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
              <div className={`border rounded-2xl rounded-bl-none px-4 py-3 text-xs flex items-center gap-2.5 transition-colors duration-300 ${
                theme === 'dark' 
                  ? 'bg-slate-950/30 border-slate-850 text-slate-400' 
                  : 'bg-slate-50 border-slate-150 text-slate-600'
              }`}>
                <span className="flex space-x-1">
                  <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s]"></span>
                  <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]"></span>
                  <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]"></span>
                </span>
                <span className="font-bold tracking-wide text-indigo-400">Analyzing scope impact...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Interactive Quick Action Pills Deck */}
        <div className={`px-4 py-2.5 border-t flex flex-wrap gap-2 transition-colors ${
          theme === 'dark' ? 'border-slate-850 bg-slate-900/40' : 'border-slate-150 bg-slate-50/50'
        }`}>
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => executeCommand(action.text)}
              disabled={loading}
              className={`text-[9px] font-bold tracking-wide uppercase px-3 py-1.5 rounded-lg border transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-950 border-slate-850 hover:border-slate-700 text-indigo-300 hover:text-indigo-200 hover:bg-slate-900'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-indigo-600 hover:text-indigo-700'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Input Message Form */}
        <form onSubmit={handleSend} className={`flex gap-2.5 p-4 border-t transition-colors ${
          theme === 'dark' ? 'border-slate-850 bg-slate-950/45' : 'border-slate-200 bg-slate-50'
        }`}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a change (e.g. 'Add Google OAuth login')..."
            className={`border p-3.5 flex-1 rounded-xl text-xs transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500/80 ${
              theme === 'dark' 
                ? 'bg-slate-950 border-slate-850/60 text-white placeholder-slate-600 focus:border-slate-700 focus:ring-indigo-500' 
                : 'bg-white border-slate-250 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
            }`}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-indigo-600 text-white font-bold uppercase tracking-wider px-5 py-3.5 rounded-xl text-xs hover:bg-indigo-500 active:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5 active:translate-y-0 duration-150 cursor-pointer"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
