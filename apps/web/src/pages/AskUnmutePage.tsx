import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  FileText,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { ChatTranscript } from '../components/ask/ChatTranscript';
import { clock, useAskChat } from '../context/AskChatContext';

const PROMPT_SUGGESTIONS = [
  {
    title: 'Architecture & Decisions',
    query: 'What are the core architectural decisions and components of UNMUTE?',
    icon: Database,
  },
  {
    title: 'Sprint Roadmap & Tasks',
    query: 'What are our current priorities and active action items?',
    icon: Zap,
  },
  {
    title: 'Voice Notes & Transcripts',
    query: 'What was discussed in my latest voice captures and transcripts?',
    icon: FileText,
  },
  {
    title: 'High-Priority Deliverables',
    query: 'List all urgent or high priority tasks across my notes',
    icon: Sparkles,
  },
];

export const AskUnmutePage: React.FC = () => {
  const navigate = useNavigate();
  const chat = useAskChat();
  const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pending = chat.isAsking || chat.isSearching;

  useEffect(() => {
    const seed = sessionStorage.getItem('unmute-ask-seed');
    if (!seed) return;
    chat.setInput(seed);
    const timer = window.setTimeout(() => sessionStorage.removeItem('unmute-ask-seed'), 0);
    return () => window.clearTimeout(timer);
  }, [chat]);

  const beginNewChat = () => {
    chat.startNewChat();
    setActiveTab('chat');
  };

  const resume = (id: string) => {
    setActiveTab('chat');
    void chat.openSession(id);
  };

  const openNote = (noteId: string) => {
    navigate(`/notes?noteId=${encodeURIComponent(noteId)}`);
  };

  return (
    <div className="flex h-full min-h-0 bg-[#09090b] text-zinc-100">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="p-3">
          <button
            type="button"
            onClick={beginNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {chat.sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-zinc-500">No saved threads yet</p>
          ) : (
            chat.sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${
                  session.id === chat.activeSessionId ? 'bg-zinc-800/80' : 'hover:bg-zinc-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => resume(session.id)}
                  className="min-w-0 flex-1 text-start cursor-pointer"
                >
                  <p dir="auto" className="truncate text-xs text-zinc-200">{session.title}</p>
                  <p className="truncate text-[10px] text-zinc-500">{clock(session.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => chat.deleteSession(session.id)}
                  aria-label={`Delete ${session.title}`}
                  className="p-1 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col h-full">
        <div className="md:hidden flex gap-2 overflow-x-auto border-b border-zinc-800 px-3 py-2">
          <button
            type="button"
            onClick={beginNewChat}
            className="shrink-0 rounded-full border border-zinc-800 px-3 py-1 text-[11px] text-zinc-300 cursor-pointer"
          >
            New
          </button>
          {chat.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => resume(session.id)}
              className={`shrink-0 max-w-[10rem] truncate rounded-full border px-3 py-1 text-[11px] cursor-pointer ${
                session.id === chat.activeSessionId
                  ? 'border-zinc-600 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400'
              }`}
            >
              {session.title}
            </button>
          ))}
        </div>

        <header className="flex flex-wrap items-center justify-between gap-4 px-4 md:px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900">
              <Sparkles className="h-5 w-5 text-zinc-300" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#09090b] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">Ask UNMUTE</h1>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                  RAG 2026
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Retrieval-Augmented Second Brain grounded in your notes & voice transcripts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 ring-1 ring-inset ring-white/10 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer ${
                  activeTab === 'chat'
                    ? 'border border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-[0_0_15px_rgba(167,139,250,0.45)] font-semibold'
                    : 'border border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>RAG Assistant</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer ${
                  activeTab === 'search'
                    ? 'border border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-[0_0_15px_rgba(167,139,250,0.45)] font-semibold'
                    : 'border border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Vector Search</span>
              </button>
            </div>
            <button
              type="button"
              onClick={beginNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-zinc-800 ring-1 ring-inset ring-white/10 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer"
              title="Start a new chat"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </header>

        <ChatTranscript
          messages={chat.messages}
          pending={pending}
          pendingLabel={
            activeTab === 'chat'
              ? 'Searching pgvector embeddings & synthesizing response...'
              : 'Computing cosine similarity against note vectors...'
          }
          onOpenNote={openNote}
        />

        {chat.isFreshThread && activeTab === 'chat' && (
          <div className="px-4 md:px-6 py-2">
            <div className="max-w-4xl mx-auto">
              <div className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
                <span>Suggested Explorations</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROMPT_SUGGESTIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        chat.setInput(item.query);
                        textareaRef.current?.focus();
                      }}
                      className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 ring-1 ring-inset ring-white/10 text-left transition-all duration-200 ease-out active:scale-[0.98] group cursor-pointer"
                    >
                      <div className="p-2 rounded-lg bg-zinc-800 text-zinc-400 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">{item.title}</h4>
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{item.query}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="p-4 sm:p-6 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md shrink-0">
          <form
            className="max-w-4xl mx-auto relative"
            onSubmit={(event) => {
              event.preventDefault();
              void chat.send(activeTab === 'chat' ? 'rag' : 'semantic');
            }}
          >
            <div className="flex items-end gap-2 p-2 rounded-2xl bg-zinc-900 border border-zinc-700/80 ring-1 ring-inset ring-white/5 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all">
              <textarea
                ref={textareaRef}
                rows={2}
                value={chat.input}
                onChange={(event) => chat.setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void chat.send(activeTab === 'chat' ? 'rag' : 'semantic');
                  }
                }}
                placeholder={
                  activeTab === 'chat'
                    ? 'Ask anything about your notes, roadmap, tasks, or transcripts... (Enter to send)'
                    : 'Enter vector search query to find semantically related notes...'
                }
                className="flex-1 bg-transparent border-0 resize-none text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0 p-2 min-h-[44px] max-h-32"
              />
              <button
                type="submit"
                disabled={!chat.input.trim() || pending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-[0_0_15px_rgba(167,139,250,0.45)] hover:bg-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer"
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between px-2 pt-2 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>pgvector cosine similarity • Grounded RAG</span>
              </span>
              <span className="hidden sm:inline">Press Shift + Enter for new line</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
