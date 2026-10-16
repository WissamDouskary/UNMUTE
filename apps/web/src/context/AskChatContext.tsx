import React, { createContext, useContext, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiClient,
  type ChatSessionSummary,
  type ChatThreadMessage,
  type Citation,
  type SemanticSearchResult,
} from '@unmute/api-client';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  citations?: Citation[];
  mode?: 'rag' | 'semantic';
  semanticResults?: SemanticSearchResult[];
}

export type AskMode = 'rag' | 'semantic';

export function clock(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: "Hello! I am **Ask UNMUTE**, your neural second brain assistant. I'm connected to your notes, tasks, and audio transcripts via **pgvector semantic search**. Ask me anything, and I'll synthesize answers grounded strictly in your personal data.",
  timestamp: clock(),
};

function freshWelcome(): ChatMessage {
  return { ...WELCOME, timestamp: clock() };
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

interface AskChatValue {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isAsking: boolean;
  isSearching: boolean;
  isFreshThread: boolean;
  startNewChat: () => void;
  openSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  send: (mode: AskMode, text?: string) => Promise<void>;
}

const AskChatContext = createContext<AskChatValue | undefined>(undefined);

export function AskChatProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([freshWelcome()]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const loadToken = useRef(0);

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => apiClient.listChatSessions(),
  });

  const searchMutation = useMutation({
    mutationFn: ({ query }: { query: string; token: number }) => apiClient.semanticSearch(query, 8),
    onSuccess: (results, { query, token }) => {
      if (loadToken.current !== token) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `search-${Date.now()}`,
          sender: 'ai',
          text: results.length > 0
            ? `Found **${results.length} notes** matching your query based on vector cosine similarity:`
            : `No notes found semantically matching "${query}".`,
          semanticResults: results,
          timestamp: clock(),
          mode: 'semantic',
        },
      ]);
    },
    onError: (err: { message?: string }, { token }) => {
      if (loadToken.current !== token) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Semantic Search failed**: ${err?.message || 'Error executing pgvector query'}.`,
          timestamp: clock(),
        },
      ]);
    },
  });

  const startNewChat = () => {
    loadToken.current += 1;
    setActiveSessionId(null);
    setMessages([freshWelcome()]);
  };

  const openSession = async (id: string) => {
    const token = ++loadToken.current;
    setActiveSessionId(id);
    try {
      const detail = await apiClient.getChatSession(id);
      if (loadToken.current !== token) return;
      setMessages(detail.messages.length > 0 ? detail.messages.map(toLocal) : [freshWelcome()]);
    } catch (err: unknown) {
      if (loadToken.current !== token) return;
      const message = err instanceof Error ? err.message : '';
      setMessages([
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `Could not open that thread. ${message}`.trim(),
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

  const send = async (mode: AskMode, text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isAsking || searchMutation.isPending) return;

    const token = ++loadToken.current;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: clock(),
    };
    setMessages((prev) => [...prev.filter((message) => message.id !== 'welcome'), userMsg]);
    if (text === undefined) setInput('');

    if (mode === 'semantic') {
      searchMutation.mutate({ query, token });
      return;
    }

    setIsAsking(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const created = await apiClient.createChatSession();
        sessionId = created.id;
        if (loadToken.current !== token) return;
        setActiveSessionId(created.id);
        queryClient.setQueryData<ChatSessionSummary[]>(['chat-sessions'], (old) => [
          created,
          ...(old ?? []).filter((session) => session.id !== created.id),
        ]);
      }
      const turn = await apiClient.sendChatMessage(sessionId, query, 5);
      if (loadToken.current !== token) return;
      setMessages((prev) => [
        ...prev.filter((message) => message.id !== userMsg.id && message.id !== 'welcome'),
        toLocal(turn.userMessage),
        toLocal(turn.assistantMessage),
      ]);
    } catch (err: unknown) {
      if (loadToken.current !== token) return;
      const message = err instanceof Error ? err.message : 'Server error occurred while connecting to RAG pipeline';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Unable to synthesize response**: ${message}. Please verify backend status and try again.`,
          timestamp: clock(),
        },
      ]);
    } finally {
      setIsAsking(false);
      await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    }
  };

  const isFreshThread = activeSessionId === null && messages.length === 1 && messages[0]?.id === 'welcome';

  return (
    <AskChatContext.Provider
      value={{
        sessions: sessionsQuery.data ?? [],
        activeSessionId,
        messages,
        input,
        setInput,
        isAsking,
        isSearching: searchMutation.isPending,
        isFreshThread,
        startNewChat,
        openSession,
        deleteSession,
        send,
      }}
    >
      {children}
    </AskChatContext.Provider>
  );
}

export function useAskChat(): AskChatValue {
  const value = useContext(AskChatContext);
  if (!value) throw new Error('useAskChat must be used within AskChatProvider');
  return value;
}
