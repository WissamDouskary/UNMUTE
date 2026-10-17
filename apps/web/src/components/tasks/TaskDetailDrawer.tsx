import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { FileText, Loader2, X } from 'lucide-react';
import { apiClient, type Note, type Task, type TaskPriority } from '@unmute/api-client';
import { PriorityPicker } from './PriorityPicker';

function stripHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceExcerpt(note: Note): string {
  const summary = stripHtml(note.summary);
  const body = summary || stripHtml(note.content);
  if (!body) return 'This note has no text yet.';
  return body.length > 420 ? `${body.slice(0, 417)}…` : body;
}

function formatDue(value?: string | null): string {
  if (!value) return 'No due date';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TaskDetailDrawer({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'MEDIUM');

  useEffect(() => {
    if (task) setPriority(task.priority);
  }, [task]);

  const priorityMutation = useMutation({
    mutationFn: (next: TaskPriority) => apiClient.updateTask(task!.id, { priority: next }),
    onMutate: async (next) => {
      setPriority(next);
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((item) => (item.id === task!.id ? { ...item, priority: next } : item))
      );
    },
    onError: () => {
      if (task) setPriority(task.priority);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const noteQuery = useQuery({
    queryKey: ['note', task?.noteId],
    queryFn: () => apiClient.getNote(task!.noteId!),
    enabled: !!task?.noteId,
  });

  return (
    <Dialog.Root open={!!task} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in-0 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-radix-popper-content-wrapper]')) {
              event.preventDefault();
            }
          }}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 outline-none focus:outline-none"
        >
          {task && (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
                <div className="min-w-0">
                  <Dialog.Title dir="auto" className="text-base font-semibold tracking-tight text-zinc-100 text-start">
                    {task.title}
                  </Dialog.Title>
                  <p className="mt-1 text-xs text-zinc-500">Task</p>
                </div>
                <Dialog.Close
                  aria-label="Close task details"
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 cursor-pointer outline-none"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                <div className="flex flex-wrap gap-2">
                  <Meta label="Status" value={task.isCompleted ? 'Completed' : 'Open'} />
                  <PriorityPicker
                    value={priority}
                    size="sm"
                    onChange={(next) => priorityMutation.mutate(next)}
                  />
                  <Meta label="Due" value={formatDue(task.dueDate)} />
                </div>

                <section>
                  <h3 className="text-xs text-zinc-500">Description</h3>
                  <p dir="auto" className="mt-2 text-sm leading-relaxed text-zinc-300 text-start whitespace-pre-wrap">
                    {task.description?.trim() || 'No description.'}
                  </p>
                </section>

                <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-3.5">
                  <h3 className="text-xs text-zinc-500">From a note</h3>
                  {!task.noteId ? (
                    <p className="mt-2 text-sm text-zinc-400">This task was created directly, without a source note.</p>
                  ) : noteQuery.isLoading ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading source
                    </p>
                  ) : noteQuery.isError ? (
                    <p className="mt-2 text-sm text-zinc-400">The source note could not be loaded.</p>
                  ) : (
                    <>
                      <p dir="auto" className="mt-3 text-sm leading-relaxed text-zinc-300 text-start">
                        {sourceExcerpt(noteQuery.data!)}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigate(`/notes?noteId=${encodeURIComponent(task.noteId!)}`);
                          onClose();
                        }}
                        className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800/50 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                        title={`Open ${noteQuery.data?.title || task.noteTitle || 'note'}`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        <span dir="auto" className="truncate">
                          {noteQuery.data?.title || task.noteTitle || 'Note'}
                        </span>
                      </button>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </span>
  );
}
