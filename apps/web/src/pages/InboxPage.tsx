import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Inbox, Plus } from 'lucide-react';
import { apiClient, type Source } from '@unmute/api-client';
import { CaptureSheet } from './inbox/CaptureSheet';
import { ReviewSheet } from './inbox/ReviewSheet';
import { inboxPhase, phaseLabel } from './inbox/inboxPhase';

function rowTitle(source: Source): string {
  if (source.originalName === 'link.txt') return 'Shared link';
  return source.originalName || source.filename;
}

export const InboxPage: React.FC = () => {
  const { sourceId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ['sources'],
    queryFn: () => apiClient.getSources(),
    refetchInterval: (query) => {
      const busy = query.state.data?.some((source) =>
        source.status === 'PENDING' || source.status === 'TRANSCRIBING' || source.status === 'EXTRACTING');
      return busy ? 1500 : 8000;
    },
  });

  const sources = sourcesQuery.data ?? [];
  const visible = sources.filter((source) => inboxPhase(source.status, source.noteId) !== 'saved');
  const selected = sourceId ? sources.find((source) => source.id === sourceId) ?? null : null;
  const selectedPhase = selected ? inboxPhase(selected.status, selected.noteId) : null;
  const reviewOpen = Boolean(sourceId) && (sourcesQuery.isLoading || !selected || selectedPhase === 'ready');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-medium text-zinc-100">Inbox</h1>
          <p className="mt-1 text-xs text-zinc-400">Captures stay here until you approve them.</p>
        </div>
        <button
          type="button"
          onClick={() => setCaptureOpen(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-950 transition-all duration-200 ease-out active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Capture
        </button>
      </div>

      {sourcesQuery.isLoading && visible.length === 0 && !pendingName ? (
        <p className="text-sm text-zinc-400">Loading captures…</p>
      ) : visible.length === 0 && !pendingName ? (
        <div className="rounded-xl border border-zinc-800 px-4 py-10 text-center">
          <Inbox className="mx-auto h-5 w-5 text-zinc-500" />
          <p className="mt-3 text-sm text-zinc-300">Captures show up here while UNMUTE reads them.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pendingName && (
            <li className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
              <p className="truncate text-sm text-zinc-100">{pendingName}</p>
              <p className="mt-1 text-xs text-zinc-400">Uploading</p>
            </li>
          )}
          {visible.map((source) => {
            const phase = inboxPhase(source.status, source.noteId);
            return (
              <li key={source.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                <button
                  type="button"
                  onClick={() => {
                    if (phase === 'ready') navigate(`/inbox/${source.id}`);
                  }}
                  className="w-full text-left"
                >
                  <p className="truncate text-sm text-zinc-100">{rowTitle(source)}</p>
                  <p className="mt-1 text-xs text-zinc-400">{phaseLabel(phase)}</p>
                </button>
                {phase === 'failed' && (
                  <div className="mt-2 flex flex-col gap-2">
                    {source.errorMessage && <p className="text-xs text-rose-300">{source.errorMessage}</p>}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="min-h-11 text-xs text-zinc-200"
                        onClick={async () => {
                          await apiClient.retrySource(source.id);
                          await queryClient.invalidateQueries({ queryKey: ['sources'] });
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="min-h-11 text-xs text-zinc-400"
                        onClick={async () => {
                          await apiClient.deleteSource(source.id);
                          await queryClient.invalidateQueries({ queryKey: ['sources'] });
                          if (sourceId === source.id) navigate('/inbox');
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} onPending={setPendingName} />
      {reviewOpen && (
        <ReviewSheet
          source={selectedPhase === 'ready' ? selected : null}
          loading={sourcesQuery.isLoading}
          missing={!sourcesQuery.isLoading && (!selected || selectedPhase !== 'ready')}
          onClose={() => navigate('/inbox')}
        />
      )}
    </div>
  );
};
