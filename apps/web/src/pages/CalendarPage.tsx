import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient, type CalendarEvent, type Task } from '@unmute/api-client';
import { DatePickerPopover } from '../components/ui/DatePickerPopover';

const SLOT_MINUTES = 30;
const SLOTS = (24 * 60) / SLOT_MINUTES;
const SLOT_PX = 36;

function dayKey(day: Date) {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

function startOfLocalDay(day: Date) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

function initialDay(param: string | null): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [year, month, date] = param.split('-').map(Number);
    if (year && month && date) return new Date(year, month - 1, date);
  }
  return startOfLocalDay(new Date());
}

const press =
  'transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700';

export function CalendarPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [day, setDay] = useState(() => initialDay(params.get('day')));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const key = dayKey(day);
  const offsetMinutes = new Date().getTimezoneOffset();
  const connectedFlag = params.get('connected');

  const status = useQuery({
    queryKey: ['calendar', 'status'],
    queryFn: () => apiClient.getCalendarStatus(),
  });

  const agenda = useQuery({
    queryKey: ['calendar', 'agenda', key, offsetMinutes],
    queryFn: () => apiClient.getAgenda(key, offsetMinutes),
    enabled: status.data?.connected === true,
  });

  const tasks = useQuery({
    queryKey: ['tasks', 'calendar-rail'],
    queryFn: () => apiClient.getTasks({ completed: false }),
    enabled: status.data?.connected === true,
  });

  const unscheduled = useMemo(
    () => (tasks.data ?? []).filter((task) => !task.scheduledStart && task.id !== pendingTaskId),
    [tasks.data, pendingTaskId],
  );

  const selected = (agenda.data?.events ?? []).find((event) => event.googleEventId === selectedId) ?? null;

  const block = useMutation({
    mutationFn: (input: { task: Task; slot: number }) => {
      const start = new Date(startOfLocalDay(day).getTime() + input.slot * SLOT_MINUTES * 60_000);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
      return apiClient.blockCalendar({ taskId: input.task.id, start: start.toISOString(), end: end.toISOString() });
    },
    onMutate: (input) => setPendingTaskId(input.task.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ]);
      setPendingTaskId(null);
      setNotice(null);
    },
    onError: (error: { message?: string }) => {
      setPendingTaskId(null);
      if (/not connected/i.test(error.message ?? '')) {
        navigate('/calendar');
        return;
      }
      setNotice(error.message || 'Could not add that task to the calendar.');
    },
  });

  const meetingNote = useMutation({
    mutationFn: (event: CalendarEvent) => apiClient.createMeetingNote(event.googleEventId),
    onSuccess: (result) => navigate(`/notes?noteId=${result.noteId}`),
    onError: () => setNotice('Could not create the meeting note.'),
  });

  const connect = useMutation({
    mutationFn: () => apiClient.startGoogleCalendar(),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (error: { message?: string }) => {
      setNotice(error.message || 'Google Calendar is not configured.');
    },
  });

  const disconnect = useMutation({
    mutationFn: () => apiClient.disconnectCalendar(),
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  function slotFromPointer(clientY: number) {
    const timeline = timelineRef.current;
    if (!timeline) return null;
    const rect = timeline.getBoundingClientRect();
    const y = clientY - rect.top + timeline.scrollTop;
    const slot = Math.floor(y / SLOT_PX);
    return slot >= 0 && slot < SLOTS ? slot : null;
  }

  function onChipPointerDown(event: PointerEvent<HTMLButtonElement>, task: Task) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ task, x: event.clientX, y: event.clientY });
    setHoverSlot(slotFromPointer(event.clientY));
  }

  function onChipPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    setDrag({ ...drag, x: event.clientX, y: event.clientY });
    setHoverSlot(slotFromPointer(event.clientY));
  }

  function onChipPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const slot = slotFromPointer(event.clientY);
    const task = drag?.task;
    setDrag(null);
    setHoverSlot(null);
    if (task && slot != null) {
      block.mutate({ task, slot });
    }
  }

  if (status.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!status.data?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <p className="max-w-md text-sm text-zinc-400">
          Connect Google Calendar to see your day and drop a task onto a time.
        </p>
        <button
          type="button"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
          className={`mt-6 min-h-11 rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 hover:bg-white cursor-pointer disabled:opacity-60 ${press}`}
        >
          {connect.isPending ? 'Opening Google…' : 'Connect Google Calendar'}
        </button>
        {notice && <p className="mt-4 max-w-md text-sm text-zinc-400">{notice}</p>}
      </div>
    );
  }

  const dayStart = startOfLocalDay(day).getTime();

  return (
    <div className="flex h-full min-h-0 bg-zinc-950 text-zinc-100">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-800 md:flex">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-medium tracking-tight">Unscheduled</h2>
          <p className="mt-1 text-xs text-zinc-400">Drag a task onto a half hour.</p>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {unscheduled.length === 0 && (
            <p className="px-1 text-sm text-zinc-400">Every open task already has a time.</p>
          )}
          {unscheduled.map((task) => (
            <button
              key={task.id}
              type="button"
              onPointerDown={(event) => onChipPointerDown(event, task)}
              onPointerMove={onChipPointerMove}
              onPointerUp={onChipPointerUp}
              className={`w-full max-md:min-h-11 cursor-grab rounded-lg bg-zinc-900 px-3 py-2 text-left text-sm ring-1 ring-inset ring-white/10 select-none hover:bg-zinc-800/50 ${press}`}
            >
              {task.title}
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDay((current) => startOfLocalDay(addDays(current, -1)))}
            className={`flex h-9 w-9 max-md:h-11 max-md:w-11 max-md:min-h-11 max-md:min-w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800/50 cursor-pointer ${press}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <DatePickerPopover
            date={day}
            onChange={(next) => next && setDay(startOfLocalDay(next))}
            showClearButton={false}
            placeholder="Day"
          />
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDay((current) => startOfLocalDay(addDays(current, 1)))}
            className={`flex h-9 w-9 max-md:h-11 max-md:w-11 max-md:min-h-11 max-md:min-w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800/50 cursor-pointer ${press}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm tracking-tight text-zinc-200">{format(day, 'EEEE, MMM d')}</span>
          <button
            type="button"
            onClick={() => disconnect.mutate()}
            className={`ml-auto text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer ${press}`}
          >
            Disconnect
          </button>
        </header>

        {connectedFlag === '1' && (
          <p className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">Google Calendar connected.</p>
        )}
        {connectedFlag === '0' && (
          <p className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">
            Google did not return a refresh token. Remove UNMUTE in your Google account and connect again.
          </p>
        )}
        {notice && <p className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">{notice}</p>}

        <div ref={timelineRef} className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="relative" style={{ height: SLOTS * SLOT_PX }}>
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="pointer-events-none absolute left-0 right-0 border-t border-zinc-800"
                style={{ top: hour * 2 * SLOT_PX }}
              >
                <span className="absolute left-3 -translate-y-1/2 bg-zinc-950 px-1 text-[11px] text-zinc-500">
                  {format(new Date(2000, 0, 1, hour), 'HH:mm')}
                </span>
              </div>
            ))}
            {hoverSlot != null && (
              <div
                className="pointer-events-none absolute left-16 right-3 rounded-md bg-zinc-800/50 ring-1 ring-inset ring-white/10"
                style={{ top: hoverSlot * SLOT_PX, height: SLOT_PX }}
              />
            )}
            {(agenda.data?.events ?? []).map((event) => {
              const start = new Date(event.startsAt).getTime();
              const end = new Date(event.endsAt).getTime();
              const top = ((start - dayStart) / 60_000 / SLOT_MINUTES) * SLOT_PX;
              const height = Math.max(SLOT_PX - 4, ((end - start) / 60_000 / SLOT_MINUTES) * SLOT_PX);
              if (top > SLOTS * SLOT_PX || top + height < 0) return null;
              return (
                <button
                  key={event.googleEventId}
                  type="button"
                  onClick={() => setSelectedId(event.googleEventId)}
                  className={`absolute left-16 right-3 overflow-hidden rounded-lg bg-zinc-900 px-3 py-1.5 text-left ring-1 ring-inset ring-white/10 hover:bg-zinc-800/50 cursor-pointer ${press}`}
                  style={{ top: Math.max(0, top), height }}
                >
                  <span className="block truncate text-sm text-zinc-100">{event.title}</span>
                  <span className="block text-xs text-zinc-400">
                    {format(new Date(event.startsAt), 'HH:mm')} – {format(new Date(event.endsAt), 'HH:mm')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {selected && (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950 md:flex">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-medium tracking-tight">{selected.title}</h2>
              <p className="mt-1 text-xs text-zinc-400">
                {format(new Date(selected.startsAt), 'HH:mm')} – {format(new Date(selected.endsAt), 'HH:mm')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer ${press}`}
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm text-zinc-300">
            {selected.attendees.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-zinc-400">Attendees</p>
                <ul className="space-y-1">
                  {selected.attendees.map((attendee) => (
                    <li key={attendee.email ?? attendee.name}>{attendee.name || attendee.email}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.description && <p className="whitespace-pre-wrap leading-relaxed">{selected.description}</p>}
          </div>
          <div className="border-t border-zinc-800 p-4">
            <button
              type="button"
              onClick={() => meetingNote.mutate(selected)}
              disabled={meetingNote.isPending}
              className={`min-h-11 w-full rounded-lg bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white cursor-pointer disabled:opacity-60 ${press}`}
            >
              {meetingNote.isPending ? 'Creating…' : 'Create Meeting Note'}
            </button>
          </div>
        </aside>
      )}

      <button
        type="button"
        onClick={() => setTasksOpen((open) => !open)}
        className={`fixed right-4 z-30 min-h-11 rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 md:hidden bottom-[calc(4.5rem+env(safe-area-inset-bottom))] ${press}`}
      >
        Tasks
      </button>

      {tasksOpen && (
        <div className="fixed inset-x-0 z-50 max-h-[40dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 md:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600" aria-hidden />
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-sm font-medium tracking-tight">Unscheduled</h2>
            <button
              type="button"
              onClick={() => setTasksOpen(false)}
              className={`min-h-11 text-xs text-zinc-400 ${press}`}
            >
              Close
            </button>
          </div>
          <div className="space-y-2 px-3 pb-3">
            {unscheduled.length === 0 && (
              <p className="px-1 text-sm text-zinc-400">Every open task already has a time.</p>
            )}
            {unscheduled.map((task) => (
              <button
                key={task.id}
                type="button"
                onPointerDown={(event) => onChipPointerDown(event, task)}
                onPointerMove={onChipPointerMove}
                onPointerUp={onChipPointerUp}
                className={`min-h-11 w-full cursor-grab rounded-lg bg-zinc-900 px-3 py-2 text-left text-sm ring-1 ring-inset ring-white/10 select-none hover:bg-zinc-800/50 ${press}`}
              >
                {task.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-x-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 md:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="text-sm font-medium tracking-tight">{selected.title}</h2>
              <p className="mt-1 text-xs text-zinc-400">
                {format(new Date(selected.startsAt), 'HH:mm')} – {format(new Date(selected.endsAt), 'HH:mm')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`min-h-11 text-xs text-zinc-400 ${press}`}
            >
              Close
            </button>
          </div>
          <div className="space-y-4 px-4 pb-4 text-sm text-zinc-300">
            {selected.attendees.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-zinc-400">Attendees</p>
                <ul className="space-y-1">
                  {selected.attendees.map((attendee) => (
                    <li key={attendee.email ?? attendee.name}>{attendee.name || attendee.email}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.description && <p className="whitespace-pre-wrap leading-relaxed">{selected.description}</p>}
            <button
              type="button"
              onClick={() => meetingNote.mutate(selected)}
              disabled={meetingNote.isPending}
              className={`min-h-11 w-full rounded-lg bg-zinc-100 text-sm font-medium text-zinc-950 hover:bg-white cursor-pointer disabled:opacity-60 ${press}`}
            >
              {meetingNote.isPending ? 'Creating…' : 'Create Meeting Note'}
            </button>
          </div>
        </div>
      )}

      {drag && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-100 ring-1 ring-inset ring-white/10"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          {drag.task.title}
        </div>
      )}
    </div>
  );
}
