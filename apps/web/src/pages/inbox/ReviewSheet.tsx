import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient, type ReviewTask, type Source } from '@unmute/api-client';
import { responsiveDialogContentClass, sheetHandleClass } from '../../components/ui/responsiveDialog';

const panelClass = `${responsiveDialogContentClass} md:fixed md:left-1/2 md:top-1/2 md:z-50 md:max-h-[85dvh] md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-y-auto md:rounded-2xl md:border md:border-zinc-800 md:bg-zinc-950`;

interface DraftTask {
  key: string;
  title: string;
  description: string;
  included: boolean;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return 'Could not save this capture.';
}

function defaultTitle(name: string): string {
  if (name === 'link.txt') return 'Shared link';
  const base = name.split(/[/\\]/).pop() || name;
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base) || 'Capture';
}

function snippet(source: Source): string {
  return (source.transcript || source.reviewPayload?.summary || '').slice(0, 280);
}

export const ReviewSheet: React.FC<{
  source: Source | null;
  loading: boolean;
  missing: boolean;
  onClose: () => void;
}> = ({ source, loading, missing, onClose }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (!source || loadedId.current === source.id) return;
    loadedId.current = source.id;
    setTitle(defaultTitle(source.originalName || source.filename));
    setBody(source.reviewPayload?.summary || source.transcript || '');
    setTasks((source.reviewPayload?.tasks ?? []).map((task, index) => ({
      key: `${source.id}-${index}`,
      title: task.title,
      description: task.description ?? '',
      included: true,
    })));
    setTags([...(source.reviewPayload?.tags ?? [])]);
    setTagDraft('');
    setConfirmDiscard(false);
    setError(null);
  }, [source]);

  const approve = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error('This capture is no longer available.');
      const accepted: ReviewTask[] = tasks
        .filter((task) => task.included && task.title.trim())
        .map((task) => ({ title: task.title.trim(), description: task.description.trim() }));
      return apiClient.approveCapture(source.id, {
        title: title.trim(),
        body: body.trim(),
        tasks: accepted,
        tags,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      navigate('/inbox');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!source) return;
      await apiClient.deleteSource(source.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sources'] });
      navigate('/inbox');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const mime = ((source?.fileType || '').split(';')[0] ?? '').trim().toLowerCase();
  const previewText = source ? snippet(source) : '';

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" aria-label="Close review" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="review-title" className={panelClass}>
        <div className={sheetHandleClass} aria-hidden />
        <div className="flex flex-col gap-4 p-4">
          <h2 id="review-title" className="text-sm font-medium text-zinc-100">Review capture</h2>
          {loading && <p className="text-sm text-zinc-400">Loading capture…</p>}
          {missing && <p className="text-sm text-zinc-400">This capture is no longer available.</p>}
          {source && (
            <>
              <div className="rounded-lg border border-zinc-800 p-3">
                <p className="text-sm text-zinc-200">{source.originalName === 'link.txt' ? 'Shared link' : source.originalName}</p>
                {!mime.startsWith('audio/') && !mime.startsWith('image/') && previewText && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{previewText}</p>
                )}
              </div>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Title
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-11 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Note
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={6}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </label>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-400">Tasks</p>
                {tasks.map((task) => (
                  <div key={task.key} className="flex items-start gap-2">
                    <button
                      type="button"
                      aria-pressed={task.included}
                      onClick={() => setTasks((current) => current.map((item) => item.key === task.key ? { ...item, included: !item.included } : item))}
                      className={`mt-2 h-4 w-4 shrink-0 rounded border ${task.included ? 'border-zinc-100 bg-zinc-100' : 'border-zinc-600 bg-transparent'}`}
                    />
                    <input
                      value={task.title}
                      aria-label="Task title"
                      onChange={(event) => setTasks((current) => current.map((item) => item.key === task.key ? { ...item, title: event.target.value } : item))}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => setTasks((current) => current.filter((item) => item.key !== task.key))}
                      className="min-h-11 px-2 text-xs text-zinc-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTasks((current) => [...current, { key: `new-${current.length}-${Date.now()}`, title: '', description: '', included: true }])}
                  className="self-start text-xs text-zinc-300"
                >
                  Add task
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-400">Tags</p>
                {tags.length === 0 && <p className="text-xs text-zinc-500">No tag suggestions.</p>}
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                      className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
                <input
                  value={tagDraft}
                  aria-label="Add tag"
                  placeholder="Add tag"
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    const next = tagDraft.trim();
                    if (!next || tags.includes(next)) {
                      setTagDraft('');
                      return;
                    }
                    setTags((current) => [...current, next]);
                    setTagDraft('');
                  }}
                  className="min-h-11 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-700"
                />
              </div>
              {error && <p className="text-xs text-rose-300">{error}</p>}
              {confirmDiscard ? (
                <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
                  <p className="text-sm text-zinc-200">Discard this capture? Nothing will be saved.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={discard.isPending}
                      onClick={() => discard.mutate()}
                      className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm text-white"
                    >
                      Discard
                    </button>
                    <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-11 px-3 text-sm text-zinc-300">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setConfirmDiscard(true)} className="min-h-11 text-sm text-zinc-400">
                    Discard
                  </button>
                  <button
                    type="button"
                    disabled={approve.isPending || !title.trim() || !body.trim()}
                    onClick={() => {
                      setError(null);
                      approve.mutate();
                    }}
                    className="min-h-11 rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-40"
                  >
                    Approve & Save
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
