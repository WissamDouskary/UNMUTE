import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ChatThreadMessage, Citation, SemanticSearchResult } from '@unmute/api-client';
import {
  Sparkles,
  Send,
  Bot,
  User as UserIcon,
  FileText,
  ExternalLink,
  Plus,
  Search,
  MessageSquare,
  Clock,
  ArrowRight,
  Database,
  Tag,
  Zap,
  Trash2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  citations?: Citation[];
  mode?: 'rag' | 'semantic';
  semanticResults?: SemanticSearchResult[];
}

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

const stripHtmlTags = (html: string | null | undefined): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const WELCOME: ChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: "Hello! I am **Ask UNMUTE**, your neural second brain assistant. I'm connected to your notes, tasks, and audio transcripts via **pgvector semantic search**. Ask me anything, and I'll synthesize answers grounded strictly in your personal data.",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

function clock(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toLocal(message: ChatThreadMessage): ChatMessage {
  return {
    id: message.id,
    sender: message.role === 'USER' ? 'user' : 'ai',
    text: message.content,
    citations: message.citations ?? [],
    timestamp: clock(message.createdAt),
    mode: 'rag',
  };
}

export const AskUnmutePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'chat' | 'search'>('chat');
  const [inputQuery, setInputQuery] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [isAsking, setIsAsking] = useState(false);
  const loadToken = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => apiClient.listChatSessions(),
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startNewChat = () => {
    loadToken.current += 1;
    setActiveSessionId(null);
    setActiveTab('chat');
    setMessages([{ ...WELCOME, timestamp: clock() }]);
  };

  const openSession = async (id: string) => {
    const token = ++loadToken.current;
    setActiveSessionId(id);
    setActiveTab('chat');
    try {
      const detail = await apiClient.getChatSession(id);
      if (loadToken.current !== token) return;
      setMessages(detail.messages.length > 0 ? detail.messages.map(toLocal) : [{ ...WELCOME, timestamp: clock() }]);
    } catch (err: any) {
      if (loadToken.current !== token) return;
      setMessages([
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `Could not open that thread. ${err?.message || ''}`.trim(),
          timestamp: clock(),
        },
      ]);
    }
  };

  const deleteSession = async (id: string) => {
    await apiClient.deleteChatSession(id);
    if (activeSessionId === id) startNewChat();
    await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
  };

  // Mutation for Direct Semantic Search
  const searchMutation = useMutation({
    mutationFn: (query: string) => apiClient.semanticSearch(query, 8),
    onSuccess: (results: SemanticSearchResult[], query: string) => {
      const aiMessage: ChatMessage = {
        id: `search-${Date.now()}`,
        sender: 'ai',
        text: results.length > 0
          ? `Found **${results.length} notes** matching your query based on vector cosine similarity:`
          : `No notes found semantically matching "${query}".`,
        semanticResults: results,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'semantic',
      };
      setMessages((prev) => [...prev, aiMessage]);
    },
    onError: (err: any) => {
      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `⚠️ **Semantic Search failed**: ${err?.message || 'Error executing pgvector query'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const isSubmitting = isAsking || searchMutation.isPending;

  const handleSend = async () => {
    const query = inputQuery.trim();
    if (!query || isSubmitting) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: clock(),
    };

    setMessages((prev) => [...prev.filter((message) => message.id !== 'welcome'), userMsg]);
    setInputQuery('');

    if (activeTab === 'search') {
      searchMutation.mutate(query);
      return;
    }

    setIsAsking(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const created = await apiClient.createChatSession();
        sessionId = created.id;
        setActiveSessionId(created.id);
      }
      const turn = await apiClient.sendChatMessage(sessionId, query, 5);
      setMessages((prev) => [
        ...prev.filter((message) => message.id !== userMsg.id && message.id !== 'welcome'),
        toLocal(turn.userMessage),
        toLocal(turn.assistantMessage),
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Unable to synthesize response**: ${err?.message || 'Server error occurred while connecting to RAG pipeline'}. Please verify backend status and try again.`,
          timestamp: clock(),
        },
      ]);
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCitationClick = (noteId: string) => {
    navigate(`/notes?noteId=${encodeURIComponent(noteId)}`);
  };

  const sessions = sessionsQuery.data ?? [];
  const isFreshThread = activeSessionId === null && messages.length === 1 && messages[0]?.id === 'welcome';

  // Helper to render simple markdown formatting (bold, bullet lines, inline code)
  const renderFormattedText = (content: string, citations: Citation[] = []) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-2 text-sm leading-relaxed text-zinc-200">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-2" />;

          // Bullet items
          if (line.startsWith('• ') || line.startsWith('- ')) {
            const bulletText = line.replace(/^[•-]\s+/, '');
            return (
              <div key={idx} className="flex items-start gap-2.5 ml-1">
                <span className="text-violet-400 mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                <span>{renderInlineMarkdown(bulletText, citations)}</span>
              </div>
            );
          }

          return <div key={idx}>{renderInlineMarkdown(line, citations)}</div>;
        })}
      </div>
    );
  };

  const renderInlineMarkdown = (text: string, citations: Citation[] = []) => {
    const parts = text.split(/(\[Note:\s*[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`)/g);

    return parts.map((part, i) => {
      if (part.startsWith('[Note:') && part.endsWith(']')) {
        const title = part.replace(/^\[Note:\s*/, '').replace(/\]$/, '').trim();
        const citation = citations.find((item) => item.title.trim().toLowerCase() === title.toLowerCase());
        const chipClass =
          'inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-violet-950/70 border border-violet-500/30 text-violet-200 text-xs font-medium align-baseline';
        if (!citation) {
          return (
            <span key={i} className={chipClass}>
              <FileText className="w-3 h-3 text-violet-400" />
              {title}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleCitationClick(citation.noteId)}
            className={`${chipClass} cursor-pointer hover:border-violet-400 hover:bg-violet-900/50`}
            title={`Open ${citation.title}`}
          >
            <FileText className="w-3 h-3 text-violet-400" />
            {title}
          </button>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="text-white font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1 py-0.5 rounded bg-zinc-800 text-violet-300 text-xs font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex h-full min-h-0 bg-[#09090b] text-zinc-100">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950">
        <div className="p-3">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-600 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {sessions.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-zinc-500">No saved threads yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${
                  session.id === activeSessionId ? 'bg-zinc-800/80' : 'hover:bg-zinc-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openSession(session.id)}
                  className="min-w-0 flex-1 text-start cursor-pointer"
                >
                  <p dir="auto" className="truncate text-xs text-zinc-200">
                    {session.title}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500">{clock(session.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(session.id)}
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
        <button type="button" onClick={startNewChat} className="shrink-0 rounded-full border border-zinc-800 px-3 py-1 text-[11px] text-zinc-300 cursor-pointer">
          New
        </button>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => openSession(session.id)}
            className={`shrink-0 max-w-[10rem] truncate rounded-full border px-3 py-1 text-[11px] cursor-pointer ${
              session.id === activeSessionId ? 'border-violet-500/50 text-violet-200' : 'border-zinc-800 text-zinc-400'
            }`}
          >
            {session.title}
          </button>
        ))}
      </div>
      {/* Top Header / Mode Switcher */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-purple-500 shadow-lg shadow-violet-500/20">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#09090b] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">Ask UNMUTE</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
                RAG 2026
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Retrieval-Augmented Second Brain grounded in your notes & voice transcripts
            </p>
          </div>
        </div>

        {/* Tab switcher: RAG Chat vs Semantic Search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'chat'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>RAG Assistant</span>
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'search'
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Vector Search</span>
            </button>
          </div>

          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-zinc-800 transition-colors cursor-pointer"
            title="Start a new chat"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </header>

      {/* Main Messages Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start gap-3.5 max-w-4xl ${
              message.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            {/* Avatar */}
            {message.sender === 'user' ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
                <UserIcon className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20">
                <Bot className="h-4 w-4" />
              </div>
            )}

            {/* Bubble Content */}
            <div
              className={`flex flex-col gap-2 max-w-[85%] sm:max-w-2xl ${
                message.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`p-4 rounded-2xl shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-violet-600/20 border border-violet-500/30 text-white rounded-tr-sm'
                    : 'bg-zinc-900/90 border border-zinc-800/80 text-zinc-200 rounded-tl-sm shadow-[0_4px_20px_rgba(0,0,0,0.25)]'
                }`}
              >
                {renderFormattedText(message.text, message.citations ?? [])}
              </div>

              {/* RAG Clickable Reference Chips (Crucial Requirement) */}
              {message.citations && message.citations.length > 0 && (
                <div className="w-full mt-1.5 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 shadow-inner">
                  <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-zinc-400">
                    <Database className="w-3.5 h-3.5 text-violet-400" />
                    <span>Cited Sources ({message.citations.length})</span>
                    <span className="text-[10px] text-zinc-500">• Grounded Knowledge</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.citations.map((citation) => (
                      <button
                        key={citation.noteId}
                        onClick={() => handleCitationClick(citation.noteId)}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-violet-950/50 border border-zinc-700/60 hover:border-violet-500/50 text-xs font-medium text-zinc-200 hover:text-violet-200 transition-all text-left cursor-pointer shadow-sm"
                        title={`Click to open note "${citation.title}": ${citation.snippet}`}
                      >
                        <FileText className="w-3.5 h-3.5 text-violet-400 group-hover:scale-110 transition-transform" />
                        <span className="truncate max-w-[180px] sm:max-w-[240px]">
                          [Note: {citation.title}]
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                          {Math.round(citation.similarity * 100)}%
                        </span>
                        <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Semantic Search Results Grid */}
              {message.semanticResults && message.semanticResults.length > 0 && (
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {message.semanticResults.map((result) => (
                    <div
                      key={result.noteId}
                      onClick={() => handleCitationClick(result.noteId)}
                      className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-850 cursor-pointer transition-all flex flex-col justify-between group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <h4 className="text-xs font-bold text-white group-hover:text-violet-300 truncate">
                            {result.title}
                          </h4>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                            {Math.round(result.similarity * 100)}% match
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {stripHtmlTags(result.summary) || stripHtmlTags(result.content)?.slice(0, 140) || 'Empty note content'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-zinc-500" />
                          <span>{result.tags?.length ? result.tags.join(', ') : 'No tags'}</span>
                        </div>
                        <span className="flex items-center gap-1 text-violet-400 group-hover:translate-x-0.5 transition-transform">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div className="flex items-center gap-1 text-[10px] text-zinc-500 px-1">
                <Clock className="w-3 h-3" />
                <span>{message.timestamp}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Typing / Retrieval Indicator */}
        {isSubmitting && (
          <div className="flex items-start gap-3.5 max-w-2xl mr-auto animate-fade-in">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/20">
              <Bot className="h-4 w-4" />
            </div>
            <div className="p-4 rounded-2xl rounded-tl-sm bg-zinc-900 border border-violet-500/30 text-zinc-300 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-ping" />
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
                <span className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
              </div>
              <span className="text-xs text-zinc-400 font-medium">
                {activeTab === 'chat'
                  ? 'Searching pgvector embeddings & synthesizing response...'
                  : 'Computing cosine similarity against 384d note vectors...'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts (when only welcome message exists) */}
      {isFreshThread && (
        <div className="px-6 py-2">
          <div className="max-w-4xl mx-auto">
            <div className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Suggested Explorations</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROMPT_SUGGESTIONS.map((item, i) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setInputQuery(item.query);
                      textareaRef.current?.focus();
                    }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-violet-500/40 text-left transition-all group"
                  >
                    <div className="p-2 rounded-lg bg-zinc-800 group-hover:bg-violet-950 text-zinc-400 group-hover:text-violet-300 shrink-0 transition-colors">
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                        {item.query}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sleek Bottom Input Bar */}
      <div className="p-4 sm:p-6 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md shrink-0">
        <div className="max-w-4xl mx-auto relative">
          <div className="flex items-end gap-2 p-2 rounded-2xl bg-zinc-900 border border-zinc-700/80 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all shadow-lg">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeTab === 'chat'
                  ? 'Ask anything about your notes, roadmap, tasks, or transcripts... (Enter to send)'
                  : 'Enter vector search query to find semantically related notes...'
              }
              className="flex-1 bg-transparent border-0 resize-none text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0 p-2 min-h-[44px] max-h-32"
            />

            <button
              onClick={handleSend}
              disabled={!inputQuery.trim() || isSubmitting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-violet-600/30 transition-all cursor-pointer"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between px-2 pt-2 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>pgvector cosine similarity • Grounded RAG</span>
            </span>
            <span className="hidden sm:inline">Press Shift + Enter for new line</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
