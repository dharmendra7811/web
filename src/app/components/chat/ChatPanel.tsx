"use client";

import { useState } from 'react';

interface ChatPanelProps {
  projectId: string;
}

export default function ChatPanel({ projectId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    { sender: 'ai', text: "Hello! I have analyzed your PRD. Ask me anything about the requirements, features, or design constraints." }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setInput('');

    // Simulate AI response
    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { sender: 'ai', text: `Regarding "${userMessage}": I am currently processing the project context to provide precise information about this feature.` }
      ]);
    }, 1000);
  };

  return (
    <div className="border rounded p-4 flex flex-col h-[500px]">
      <h2 className="text-lg font-semibold mb-2">PRD Assistant</h2>
      <div className="flex-1 overflow-y-auto mb-4 space-y-2 border-b pb-2">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the PRD..."
          className="border p-2 flex-1 rounded text-sm"
        />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition">
          Send
        </button>
      </form>
    </div>
  );
}
