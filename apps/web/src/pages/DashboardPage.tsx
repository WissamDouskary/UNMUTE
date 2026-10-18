import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@unmute/api-client';
import type { BriefingAttention, BriefingDeadline, BriefingResponse, BriefingTask, Task } from '@unmute/api-client';
import { useAuth } from '../context/AuthContext';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';

const press =
  'transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700';

const card = 'rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900 px-3.5 py-2.5';

function startOfToday(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

function dueLabel(dueDate?: string | null): { text: string; tone: string } {
  if (!dueDate) return { text: 'No date', tone: 'text-zinc-400' };
  const due = new Date(dueDate);
  const start = startOfToday();
  const next = new Date(start);
  next.setDate(start.getDate() + 1);
  if (due < start) return { text: 'Overdue', tone: 'text-red-400' };
  if (due < next) return { text: 'Today', tone: 'text-amber-300' };
  return {
    text: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    tone: 'text-zinc-400',
  };
}

function sameLocalDay(iso: string, day = new Date()): boolean {
  const date = new Date(iso);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function eventLabel(event: BriefingDeadline): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const now = new Date();
  if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) return 'Now';
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameLocalDay(event.startsAt)) return `Today ${time}`;
  const date = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

function attentionHref(row: BriefingAttention): string {
  if (row.kind === 'note') return `/notes?noteId=${encodeURIComponent(row.id)}`;
  if (row.reason === 'Failed') return '/sources';
  return `/inbox/${row.id}`;
}

function readingCopy(count: number): string | null {
  if (count === 1) return '1 capture is still being read.';
  if (count > 1) return `${count} captures are still being read.`;
  return null;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const name = user?.displayName || user?.email?.split('@')[0] || 'there';
  const offsetMinutes = new Date().getTimezoneOffset();
  const heading = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const briefing = useQuery({
    queryKey: ['briefing', offsetMinutes],
    queryFn: () => apiClient.getBriefing(offsetMinutes),
    refetchInterval: (query) => ((query.state.data?.readingCount ?? 0) > 0 ? 1500 : 8000),
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'home'],
    queryFn: () => apiClient.getTasks({}),
  });

  const openTask = (id: string) => {
    const task = tasksQuery.data?.find((item) => item.id === id);
    if (task) setSelectedTask(task);
  };

  const data = briefing.data;
  const showValues = Boolean(data) && !briefing.isLoading && !briefing.isError;

  return (
    <div className="w-full max-w-[90rem] mx-auto px-1 sm:px-2 py-2 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{heading}</h1>
        <p className="mt-1 text-sm text-zinc-400">{name}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Open tasks" value={showValues ? data?.openCount : undefined} href="/tasks" />
        <Stat label="Due today" value={showValues ? data?.dueTodayCount : undefined} href="/tasks" />
        <Stat label="Ready" value={showValues ? data?.readyCount : undefined} href="/inbox" />
      </div>

      {briefing.isLoading ? (
        <BriefingSections />
      ) : briefing.isError || !data ? (
        <section className={card}>
          <p className="text-sm text-zinc-400">The briefing could not be loaded.</p>
          <button
            type="button"
            onClick={() => void briefing.refetch()}
            className={`mt-3 min-h-11 rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white cursor-pointer ${press}`}
          >
            Retry
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <Section title="Do this next">
              {data.focus ? (
                <TaskButton task={data.focus} onOpen={openTask} />
              ) : (
                <p className="py-4 text-sm text-zinc-400">No open tasks.</p>
              )}
            </Section>
            {data.nextTasks.length > 0 && (
              <Section title="Also open" href="/tasks" action="View all">
                <ul className="divide-y divide-zinc-800/80">
                  {data.nextTasks.map((task) => (
                    <li key={task.id}>
                      <TaskButton task={task} onOpen={openTask} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
          <div className="space-y-6">
            <Section title="Coming up" href={data.calendar.connected ? '/calendar' : undefined} action={data.calendar.connected ? 'View calendar' : undefined}>
              <ComingUp calendar={data.calendar} />
            </Section>
            <Section title="Needs a look">
              <NeedsALook attention={data.attention} readingCount={data.readingCount} />
            </Section>
          </div>
        </div>
      )}
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
};

function BriefingSections() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-6">
        <Section title="Do this next">
          <p className="py-6 text-sm text-zinc-400">Loading</p>
        </Section>
      </div>
      <div className="space-y-6">
        <Section title="Coming up">
          <p className="py-6 text-sm text-zinc-400">Loading</p>
        </Section>
        <Section title="Needs a look">
          <p className="py-6 text-sm text-zinc-400">Loading</p>
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number | undefined; href: string }) {
  return (
    <Link to={href} className={`flex min-h-11 items-center justify-between gap-2 ${card} hover:bg-zinc-800/50 ${press}`}>
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-zinc-100">{value === undefined ? '—' : value}</span>
    </Link>
  );
}

function Section({
  title,
  href,
  action,
  children,
}: {
  title: string;
  href?: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={card}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium tracking-tight text-zinc-200">{title}</h2>
        {href && action && (
          <Link to={href} className={`text-[11px] text-zinc-400 hover:text-zinc-200 ${press}`}>
            {action}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function TaskButton({ task, onOpen }: { task: BriefingTask; onOpen: (id: string) => void }) {
  const label = dueLabel(task.dueDate);
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg py-2 text-start hover:bg-zinc-800/50 cursor-pointer ${press}`}
    >
      <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-zinc-200">
        {task.title}
      </p>
      <span className={`shrink-0 text-[11px] ${label.tone}`}>{label.text}</span>
    </button>
  );
}

function ComingUp({ calendar }: { calendar: BriefingResponse['calendar'] }) {
  if (!calendar.connected) {
    return (
      <div className="py-4">
        <p className="text-sm text-zinc-400">Google Calendar is not connected.</p>
        <Link to="/calendar" className={`mt-2 inline-flex min-h-11 items-center text-sm text-zinc-200 hover:text-zinc-100 ${press}`}>
          Connect Google Calendar
        </Link>
      </div>
    );
  }
  if (calendar.deadlines.length === 0) {
    return <p className="py-4 text-sm text-zinc-400">Nothing on the calendar in the next 7 days.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800/80">
      {calendar.deadlines.map((event) => (
        <li key={event.googleEventId}>
          <Link
            to={`/calendar?day=${dayKey(event.startsAt)}`}
            className={`flex min-h-11 items-center gap-3 rounded-lg py-2 hover:bg-zinc-800/50 ${press}`}
          >
            <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-zinc-200">
              {event.title}
            </p>
            <span className="shrink-0 text-[11px] text-zinc-400">{eventLabel(event)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NeedsALook({ attention, readingCount }: { attention: BriefingAttention[]; readingCount: number }) {
  const reading = readingCopy(readingCount);
  return (
    <div className="py-1">
      {reading && <p className="py-2 text-sm text-zinc-400">{reading}</p>}
      {attention.length === 0 && !reading && <p className="py-4 text-sm text-zinc-400">Nothing is waiting.</p>}
      {attention.length > 0 && (
        <ul className="divide-y divide-zinc-800/80">
          {attention.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link to={attentionHref(row)} className={`flex min-h-11 items-center gap-3 rounded-lg py-2 hover:bg-zinc-800/50 ${press}`}>
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {row.title}
                </p>
                <span className="shrink-0 text-[11px] text-zinc-400">{row.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
