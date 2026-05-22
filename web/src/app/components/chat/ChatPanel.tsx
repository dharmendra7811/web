"use client";

import { useState, useEffect, useRef } from 'react';
import { 
  sendChatMessage, 
  applySuggestion, 
  skipSuggestion, 
  getChatHistory, 
  getChatSessions, 
  createChatSession, 
  getChatSessionHistory,
  getFeatures
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
  
  // Features for feature_id selector on suggestions that lack it
  const [features, setFeatures] = useState<{ id: string; title: string }[]>([]);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Record<string, string>>({});
  
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

  // Fetch features for feature_id selector
  useEffect(() => {
    getFeatures(projectId).then(setFeatures).catch(() => setFeatures([]));
  }, [projectId]);

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

  const handleApply = async (messageId: string, suggestionId: string, featureId?: string) => {
    setProcessingSuggestions(prev => ({ ...prev, [suggestionId]: true }));
    try {
      await applySuggestion(suggestionId, featureId);
      
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
    } catch (error: any) {
      console.error('Failed to apply suggestion:', error);
      alert(error.message || 'Failed to apply suggestion');
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
    <div className={`flex flex-col h-full w-full font-mono text-sm overflow-hidden transition-colors duration-200 ${
      theme === 'dark' ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-[#ffffff] text-[#24292f]'
    }`}>
      {/* Top Header */}
      <div className={`px-4 py-3 flex flex-col gap-3 border-b ${
        theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 font-bold tracking-wide uppercase text-xs">
            <span className={theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}>TERMINAL: AI ASSISTANT</span>
          </div>
          <button
            onClick={handleNewChat}
            className={`px-3 py-1 text-xs uppercase font-bold rounded transition-colors ${
              theme === 'dark' ? 'bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d]' : 'bg-[#f6f8fa] hover:bg-[#e5e7eb] text-[#24292f] border border-[#d0d7de]'
            }`}
          >
            [NEW SESSION]
          </button>
        </div>
        
        {/* Session Selector */}
        {sessions.length > 0 && (
          <select 
            value={sessionId || ''} 
            onChange={(e) => handleSelectSession(e.target.value)}
            className={`w-full text-xs font-mono p-2 rounded border outline-none cursor-pointer ${
              theme === 'dark' ? 'bg-[#0d1117] border-[#30363d] text-[#8b949e]' : 'bg-[#ffffff] border-[#d0d7de] text-[#57606a]'
            }`}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - {s.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-2">
            {/* Sender Label */}
            <div className={`text-xs font-bold ${
              msg.sender === 'user' ? (theme === 'dark' ? 'text-[#58a6ff]' : 'text-[#0969da]') : (theme === 'dark' ? 'text-[#a371f7]' : 'text-[#8250df]')
            }`}>
              {msg.sender === 'user' ? 'user@workspace ~ %' : 'ai@assistant ~ %'}
            </div>
            
            {/* Message Body */}
            <div className={`font-sans text-sm leading-relaxed whitespace-pre-wrap ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
              {msg.text}
            </div>

            {/* Suggestions Blocks */}
            {msg.suggestions && msg.suggestions.length > 0 && (
              <div className={`mt-3 flex flex-col gap-3 pl-4 border-l-4 ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}>
                {msg.suggestions.map((sug) => {
                  const typeColors = theme === 'dark' 
                    ? {
                        add: { border: 'border-[#3fb950]', bg: 'bg-[#3fb950]/10', text: 'text-[#3fb950]' },
                        modify: { border: 'border-[#d29922]', bg: 'bg-[#d29922]/10', text: 'text-[#d29922]' },
                        remove: { border: 'border-[#f85149]', bg: 'bg-[#f85149]/10', text: 'text-[#f85149]' },
                        flag: { border: 'border-[#a371f7]', bg: 'bg-[#a371f7]/10', text: 'text-[#a371f7]' }
                      }
                    : {
                        add: { border: 'border-[#1a7f37]', bg: 'bg-[#1a7f37]/10', text: 'text-[#1a7f37]' },
                        modify: { border: 'border-[#9a6700]', bg: 'bg-[#9a6700]/10', text: 'text-[#9a6700]' },
                        remove: { border: 'border-[#cf222e]', bg: 'bg-[#cf222e]/10', text: 'text-[#cf222e]' },
                        flag: { border: 'border-[#8250df]', bg: 'bg-[#8250df]/10', text: 'text-[#8250df]' }
                      };
                  const colors = typeColors[sug.suggestion_type] || typeColors.add;

                  return (
                    <div key={sug.id} className={`border border-l-4 rounded p-3 ${colors.border} ${theme === 'dark' ? 'bg-[#161b22]' : 'bg-[#f6f8fa]'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>[{sug.suggestion_type}]</span>
                        <div className="flex items-center gap-2">
                          {sug.status === 'pending' ? (
                            <>
                              <button onClick={() => handleApply(msg.id, sug.id, selectedFeatureIds[sug.id])} className={`text-xs px-3 py-1 border rounded hover:bg-opacity-20 font-bold ${colors.text} ${colors.border}`}>APPLY</button>
                              <button onClick={() => handleSkip(msg.id, sug.id)} className={`text-xs px-3 py-1 border rounded ${theme === 'dark' ? 'text-[#8b949e] border-[#30363d] hover:bg-[#30363d]' : 'text-[#57606a] border-[#d0d7de] hover:bg-[#d0d7de]'}`}>SKIP</button>
                            </>
                          ) : (
                            <span className={`text-xs font-bold ${sug.status === 'applied' ? colors.text : (theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]')}`}>
                              [{sug.status.toUpperCase()}]
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="font-sans text-xs mb-3 leading-relaxed">{sug.description}</div>

                      {sug.proposed_value && (
                        <div className={`mt-2 pt-2 border-t ${theme === 'dark' ? 'border-[#30363d]' : 'border-[#d0d7de]'}`}>
                          <div className={`font-mono text-xs font-bold ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
                            + {sug.proposed_value.title}
                          </div>
                          {sug.proposed_value.detail && (
                            <div className={`font-mono text-xs pl-3 mt-1 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
                              {sug.proposed_value.detail}
                            </div>
                          )}
                        </div>
                      )}

                      {sug.suggestion_type === 'add' && sug.status === 'pending' && (
                        <div className="mt-3">
                          <select
                            value={selectedFeatureIds[sug.id] !== undefined ? selectedFeatureIds[sug.id] : (sug.proposed_value?.feature_id || '')}
                            onChange={(e) => setSelectedFeatureIds(prev => ({ ...prev, [sug.id]: e.target.value }))}
                            className={`w-full text-xs p-2 rounded border outline-none ${theme === 'dark' ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9]' : 'bg-white border-[#d0d7de] text-[#24292f]'}`}
                          >
                            <option value="">[TARGET FEATURE]</option>
                            {features.map(f => (
                              <option key={f.id} value={f.id}>{f.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-xs animate-pulse text-[#a371f7]">
            ai@assistant ~ % _
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className={`px-5 py-3 border-t flex flex-wrap gap-2 ${theme === 'dark' ? 'border-[#30363d] bg-[#161b22]' : 'border-[#d0d7de] bg-[#f6f8fa]'}`}>
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => executeCommand(action.text)}
            disabled={loading}
            className={`text-xs border rounded px-3 py-1.5 hover:opacity-80 transition-opacity disabled:opacity-50 ${
              theme === 'dark' ? 'border-[#30363d] text-[#c9d1d9] bg-[#0d1117]' : 'border-[#d0d7de] text-[#24292f] bg-white'
            }`}
          >
            {action.label.replace('✦ ', '> ')}
          </button>
        ))}
      </div>

      {/* Command Input */}
      <form onSubmit={handleSend} className={`flex border-t ${theme === 'dark' ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#d0d7de] bg-[#ffffff]'}`}>
        <div className={`flex items-center px-4 text-sm font-bold ${theme === 'dark' ? 'text-[#58a6ff]' : 'text-[#0969da]'}`}>
          &gt;
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Execute command..."
          className="flex-1 bg-transparent py-4 pr-4 text-sm outline-none font-mono"
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className={`px-6 text-sm font-bold uppercase transition-colors disabled:opacity-50 ${
            theme === 'dark' ? 'bg-[#238636] hover:bg-[#2ea043] text-white' : 'bg-[#2da44e] hover:bg-[#2c974b] text-white'
          }`}
        >
          EXEC
        </button>
      </form>
    </div>
  );
}
