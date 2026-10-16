import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CheckSquare,
  FileText,
  Home,
  Mic,
  Radio,
  Search,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import { apiClient } from '@unmute/api-client';

export const OPEN_PALETTE_EVENT = 'unmute:open-palette';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: React.ElementType;
  run: () => void;
}

function stamp() {
  return Date.now().toString(36);
}

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const commands = useMemo<Command[]>(
    () => [
      { id: 'home', label: 'Go to Home', group: 'Navigate', icon: Home, run: () => go('/') },
      { id: 'notes', label: 'Go to Notes', group: 'Navigate', icon: FileText, run: () => go('/notes') },
      { id: 'tasks', label: 'Go to Tasks', group: 'Navigate', icon: CheckSquare, run: () => go('/tasks') },
      { id: 'sources', label: 'Go to Sources', group: 'Navigate', icon: Radio, run: () => go('/sources') },
      { id: 'ask', label: 'Go to Ask UNMUTE', group: 'Navigate', icon: Sparkles, run: () => go('/ask') },
      { id: 'graph', label: 'Go to Graph', group: 'Navigate', icon: Waypoints, run: () => go('/graph') },
      {
        id: 'new-note',
        label: 'New note',
        group: 'Create',
        icon: FileText,
        run: () => go(`/notes?compose=1&t=${stamp()}`),
      },
      {
        id: 'new-task',
        label: 'New task',
        group: 'Create',
        icon: CheckSquare,
        run: () => go(`/tasks?compose=1&t=${stamp()}`),
      },
      {
        id: 'record',
        label: 'Record voice',
        group: 'Create',
        icon: Mic,
        run: () => go(`/sources?record=1&t=${stamp()}`),
      },
    ],
    // go closes over navigate; commands are rebuilt when the palette opens via query changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate]
  );

  const trimmed = query.trim();
  const { data: noteHits } = useQuery({
    queryKey: ['notes', 'palette', trimmed],
    queryFn: () => apiClient.getNotes({ search: trimmed, size: 5 }),
    enabled: open && trimmed.length >= 2,
  });

  const items = useMemo(() => {
    const q = trimmed.toLowerCase();
    const matched = commands.filter((command) => command.label.toLowerCase().includes(q));
    const notes: Command[] = (noteHits?.content ?? []).map((note) => ({
      id: `note-${note.id}`,
      label: note.title || 'Untitled',
      group: 'Notes',
      icon: FileText,
      run: () => go(`/notes?noteId=${encodeURIComponent(note.id)}`),
    }));
    return [...matched, ...notes];
  }, [commands, noteHits, trimmed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [trimmed]);

  if (!open) return null;

  const runActive = () => {
    const item = items[Math.min(active, items.length - 1)];
    item?.run();
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-zinc-950/80 backdrop-blur-sm flex items-start justify-center px-4 pt-[12vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60 overflow-hidden focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            dir="auto"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => (items.length === 0 ? 0 : (index + 1) % items.length));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                runActive();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Jump to a page, note, or action…"
            className="flex-1 bg-transparent py-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0"
          />
          <kbd className="hidden sm:inline text-[10px] font-mono text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-zinc-500">No matches</p>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              const previous = items[index - 1];
              const showGroup = index === 0 || previous?.group !== item.group;
              return (
                <React.Fragment key={item.id}>
                  {showGroup && (
                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">{item.group}</p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={item.run}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-start text-sm cursor-pointer ${
                      index === active ? 'bg-violet-600/20 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
                    <span dir="auto" className="truncate">
                      {item.label}
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
