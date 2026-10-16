import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CheckSquare, FileText, Loader2, Radio } from 'lucide-react';
import { apiClient } from '@unmute/api-client';
import type { Note, Source, Task } from '@unmute/api-client';
import { useAuth } from '../context/AuthContext';
import { OPEN_PALETTE_EVENT } from '../components/CommandPalette';

function parseDue(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

function sameLocalDay(iso: string, day = new Date()): boolean {
  const date = parseDue(iso);
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

function isOverdue(iso: string): boolean {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return parseDue(iso) < start;
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const name = user?.displayName || user?.email?.split('@')[0] || 'there';

  const notesQuery = useQuery({
    queryKey: ['notes', 'home'],
    queryFn: () => apiClient.getNotes({ archived: false, size: 8 }),
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'home'],
    queryFn: () => apiClient.getTasks({}),
  });
  const sourcesQuery = useQuery({
    queryKey: ['sources'],
    queryFn: () => apiClient.getSources(),
  });

  const notes = notesQuery.data?.content ?? [];
  const tasks = tasksQuery.data ?? [];
  const sources = sourcesQuery.data ?? [];
  const openTasks = tasks.filter((task) => !task.isCompleted);
  const dueToday = openTasks.filter((task) => task.dueDate && sameLocalDay(task.dueDate));
  const upcoming = [...openTasks]
    .sort((a, b) => dueRank(a) - dueRank(b))
    .slice(0, 6);
  const recent = [...notes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6);
  const running = sources.filter((source) => source.status === 'PENDING' || source.status === 'TRANSCRIBING');
  const failed = sources.filter((source) => source.status === 'FAILED');
  const workflows = [...running, ...failed].slice(0, 5);
  const loading = notesQuery.isLoading || tasksQuery.isLoading;

  return (
    <div className="w-full max-w-[90rem] mx-auto px-1 sm:px-2 py-2 space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Home</h1>
          <p className="mt-1 text-sm text-zinc-500">{name}</p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 cursor-pointer"
        >
          <span>Search</span>
          <kbd className="font-mono text-[10px] text-zinc-500">Ctrl K</kbd>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Notes" value={notesQuery.data?.totalElements} href="/notes" loading={notesQuery.isLoading} />
        <Stat label="Open tasks" value={tasksQuery.isLoading ? undefined : openTasks.length} href="/tasks" loading={tasksQuery.isLoading} />
        <Stat label="Due today" value={tasksQuery.isLoading ? undefined : dueToday.length} href="/tasks" loading={tasksQuery.isLoading} />
        <Stat label="In progress" value={sourcesQuery.isLoading ? undefined : running.length} href="/sources" loading={sourcesQuery.isLoading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Widget title="Recently captured" icon={FileText} href="/notes">
          {loading ? (
            <Loading />
          ) : recent.length === 0 ? (
            <Empty text="No notes yet." action="New note" href="/notes?compose=1" />
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {recent.map((note) => (
                <NoteRow key={note.id} note={note} />
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Upcoming tasks" icon={CheckSquare} href="/tasks">
          {tasksQuery.isLoading ? (
            <Loading />
          ) : upcoming.length === 0 ? (
            <Empty text="No open tasks." action="New task" href="/tasks?compose=1" />
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {upcoming.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Active AI workflows" icon={Radio} href="/sources">
          {sourcesQuery.isLoading ? (
            <Loading />
          ) : workflows.length === 0 ? (
            <Empty text="Nothing is processing." action="Record voice" href="/sources?record=1" />
          ) : (
            <ul className="divide-y divide-zinc-800/80">
              {workflows.map((source) => (
                <WorkflowRow key={source.id} source={source} />
              ))}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  );
};

function Stat({
  label,
  value,
  href,
  loading,
}: {
  label: string;
  value: number | undefined;
  href: string;
  loading: boolean;
}) {
  return (
    <Link
      to={href}
      className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 hover:border-zinc-700 transition-colors"
    >
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-zinc-100">
        {loading || value === undefined ? '—' : value}
      </span>
    </Link>
  );
}

function dueRank(task: Task): number {
  if (!task.dueDate) return Number.POSITIVE_INFINITY;
  return parseDue(task.dueDate).getTime();
}

function dueLabel(task: Task): { text: string; tone: string } {
  if (!task.dueDate) return { text: 'No date', tone: 'text-zinc-500' };
  if (isOverdue(task.dueDate) && !sameLocalDay(task.dueDate)) return { text: 'Overdue', tone: 'text-red-400' };
  if (sameLocalDay(task.dueDate)) return { text: 'Today', tone: 'text-amber-300' };
  return {
    text: parseDue(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'text-zinc-500',
  };
}

function Widget({
  title,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  icon: React.ElementType;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </h2>
        <Link to={href} className="text-[11px] text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1">
          View all
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function NoteRow({ note }: { note: Note }) {
  return (
    <li>
      <Link
        to={`/notes?noteId=${encodeURIComponent(note.id)}`}
        className="flex items-center gap-3 py-2.5 hover:bg-zinc-900/50 -mx-2 px-2 rounded-lg"
      >
        <div className="min-w-0 flex-1">
          <p dir="auto" className="text-sm text-zinc-200 truncate text-start">
            {note.title || 'Untitled'}
          </p>
          {note.tags.length > 0 && (
            <p className="text-[11px] text-zinc-500 truncate">
              {note.tags.slice(0, 3).map((tag) => `#${tag}`).join('  ')}
            </p>
          )}
        </div>
        <span className="text-[11px] text-zinc-500 shrink-0">{relativeTime(note.updatedAt)}</span>
      </Link>
    </li>
  );
}

function TaskRow({ task }: { task: Task }) {
  const label = dueLabel(task);
  return (
    <li>
      <Link
        to={task.noteId ? `/notes?noteId=${encodeURIComponent(task.noteId)}` : '/tasks'}
        className="flex items-center gap-3 py-2.5 hover:bg-zinc-900/50 -mx-2 px-2 rounded-lg"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${label.text === 'Overdue' ? 'bg-red-400' : label.text === 'Today' ? 'bg-amber-400' : 'bg-zinc-600'}`} />
        <p dir="auto" className="min-w-0 flex-1 text-sm text-zinc-200 truncate text-start">
          {task.title}
        </p>
        <span className={`text-[11px] shrink-0 ${label.tone}`}>{label.text}</span>
      </Link>
    </li>
  );
}

function WorkflowRow({ source }: { source: Source }) {
  const live = source.status === 'PENDING' || source.status === 'TRANSCRIBING';
  return (
    <li>
      <Link to="/sources" className="flex items-center gap-3 py-2.5 hover:bg-zinc-900/50 -mx-2 px-2 rounded-lg">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${live ? 'bg-violet-400 animate-pulse' : 'bg-red-400'}`} />
        <p dir="auto" className="min-w-0 flex-1 text-sm text-zinc-200 truncate text-start">
          {source.originalName}
        </p>
        <span className={`text-[11px] shrink-0 ${live ? 'text-violet-300' : 'text-red-400'}`}>
          {live ? 'Running' : 'Failed'}
        </span>
      </Link>
    </li>
  );
}

function Empty({ text, action, href }: { text: string; action: string; href: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-zinc-500">{text}</p>
      <Link to={href} className="inline-block mt-2 text-xs text-violet-300 hover:text-violet-200">
        {action}
      </Link>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 py-8 text-xs text-zinc-500">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      Loading
    </div>
  );
}
