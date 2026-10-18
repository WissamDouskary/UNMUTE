import type { SourceStatus } from '@unmute/api-client';

export type InboxPhase = 'processing' | 'ready' | 'failed' | 'saved';

export function inboxPhase(status: SourceStatus, noteId?: string | null): InboxPhase {
  if (status === 'FAILED') return 'failed';
  if (status === 'COMPLETED' && noteId) return 'saved';
  if (status === 'READY' || (status === 'COMPLETED' && !noteId)) return 'ready';
  return 'processing';
}

export function phaseLabel(phase: InboxPhase | 'uploading'): string {
  switch (phase) {
    case 'uploading':
      return 'Uploading';
    case 'processing':
      return 'Processing';
    case 'ready':
      return 'Ready for review';
    case 'failed':
      return 'Failed';
    case 'saved':
      return 'Saved';
  }
}
