import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@unmute/api-client';
import type { LiveConnectionStatus, LiveEvent, Note } from '@unmute/api-client';

type LiveEventListener = (event: LiveEvent) => void;

const listeners = new Set<LiveEventListener>();

function applyToCache(queryClient: QueryClient, event: LiveEvent) {
  switch (event.type) {
    case 'note.tagged': {
      const { noteId, tags } = event.data;
      // Patch tags in place rather than refetching: a refetch could race an in-flight
      // autosave and overwrite what the user is typing.
      queryClient.setQueriesData<Note[]>({ queryKey: ['notes'] }, (old) =>
        Array.isArray(old) ? old.map((n) => (n.id === noteId ? { ...n, tags } : n)) : old
      );
      queryClient.setQueryData<Note | null>(['note', noteId], (old) => (old ? { ...old, tags } : old));
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['graph'] });
      break;
    }
    case 'note.created':
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['graph'] });
      break;
    case 'source.updated':
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      if (event.data.status === 'COMPLETED') {
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        queryClient.invalidateQueries({ queryKey: ['tags'] });
        queryClient.invalidateQueries({ queryKey: ['graph'] });
      }
      break;
    case 'note.tag-failed':
      break;
    case 'calendar.updated':
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      break;
  }
}

/** Owns the single live connection for the signed-in session. Mount once, in the app shell. */
export function useLiveEventStream(enabled: boolean): LiveConnectionStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveConnectionStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;

    return apiClient.subscribeToEvents({
      onStatusChange: (next, reconnected) => {
        setStatus(next);
        if (reconnected) {
          queryClient.invalidateQueries({ queryKey: ['notes'] });
          queryClient.invalidateQueries({ queryKey: ['tags'] });
          queryClient.invalidateQueries({ queryKey: ['sources'] });
          queryClient.invalidateQueries({ queryKey: ['calendar'] });
        }
      },
      onEvent: (event) => {
        applyToCache(queryClient, event);
        listeners.forEach((listener) => listener(event));
      },
    });
  }, [enabled, queryClient]);

  return status;
}

/** Subscribes a component to live events delivered by the app shell's stream. */
export function useLiveEvent(handler: LiveEventListener): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: LiveEventListener = (event) => handlerRef.current(event);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
