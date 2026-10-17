import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Maximize2, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { ChatTranscript } from './ChatTranscript';
import { clock, useAskChat } from '../../context/AskChatContext';

export function AskCompanion() {
  const location = useLocation();
  const navigate = useNavigate();
  const chat = useAskChat();
  const [open, setOpen] = useState(false);
  const onAsk = location.pathname.startsWith('/ask');

  useEffect(() => {
    if (onAsk) setOpen(false);
  }, [onAsk]);

  if (onAsk) return null;

  const openNote = (noteId: string) => {
    setOpen(false);
    navigate(`/notes?noteId=${encodeURIComponent(noteId)}`);
  };

  const pending = chat.isAsking || chat.isSearching;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-950 transition-colors duration-200 hover:bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700 sm:bottom-6 sm:right-6"
          title="Ask UNMUTE AI Assistant"
          aria-label="Ask UNMUTE AI Assistant"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ask UNMUTE</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in-0 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-3 right-3 z-50 flex h-[min(720px,calc(100dvh-1.5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 outline-none sm:bottom-5 sm:right-5"
        >
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3.5 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <Sparkles className="h-4 w-4 text-zinc-300" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-medium tracking-tight text-zinc-100">Ask UNMUTE</Dialog.Title>
              <p className="text-xs text-zinc-500">Search your notes</p>
            </div>
            <button
              type="button"
              onClick={chat.startNewChat}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer outline-none"
              aria-label="New chat"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/ask');
              }}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer outline-none"
              aria-label="Open full Ask page"
              title="Open full Ask page"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <Dialog.Close
              aria-label="Close Ask UNMUTE"
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer outline-none"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-40 shrink-0 overflow-y-auto border-b border-zinc-800 px-2 py-2">
            {chat.sessions.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-zinc-500">No saved threads yet</p>
            ) : (
              <ul className="space-y-0.5">
                {chat.sessions.map((session) => (
                  <li key={session.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => chat.openSession(session.id)}
                      className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-start cursor-pointer ${
                        session.id === chat.activeSessionId ? 'bg-zinc-800/80' : 'hover:bg-zinc-900'
                      }`}
                    >
                      <p dir="auto" className="truncate text-xs text-zinc-200">{session.title}</p>
                      <p className="truncate text-[10px] text-zinc-500">{clock(session.updatedAt)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => chat.deleteSession(session.id)}
                      aria-label={`Delete ${session.title}`}
                      className="rounded-md p-1 text-zinc-600 opacity-0 hover:text-red-400 group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ChatTranscript
            messages={chat.messages}
            pending={pending}
            pendingLabel="Searching your notes…"
            compact
            onOpenNote={openNote}
          />

          <form
            className="shrink-0 border-t border-zinc-800 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void chat.send('rag');
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500">
              <textarea
                rows={2}
                value={chat.input}
                onChange={(event) => chat.setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void chat.send('rag');
                  }
                }}
                placeholder="Ask about your notes…"
                className="max-h-24 min-h-[40px] flex-1 resize-none bg-transparent p-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={!chat.input.trim() || pending}
                aria-label="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-zinc-700"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
