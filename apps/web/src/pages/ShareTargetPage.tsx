import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@unmute/api-client';
import { shareInbox, type SharePayload } from '../lib/shareInbox';

let claimedShareId: string | null = null;

function textBody(payload: SharePayload): string {
  return [payload.title, payload.text, payload.url].map((part) => part.trim()).filter(Boolean).join('\n\n');
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return 'The share could not be uploaded.';
}

export const ShareTargetPage: React.FC = () => {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const payload = await shareInbox.take();
      if (cancelled) return;
      if (!payload) {
        setEmpty(true);
        return;
      }
      if (claimedShareId === payload.id) return;
      claimedShareId = payload.id;
      const files = payload.files.filter((file) => file.blob && file.blob.size > 0);
      try {
        if (files.length === 0) {
          const body = textBody(payload);
          if (!body) {
            claimedShareId = null;
            setEmpty(true);
            return;
          }
          setNotice('The file did not arrive.');
          const file = new File([body], 'share.txt', { type: 'text/plain' });
          const source = await apiClient.uploadSource(file, 'share.txt');
          await shareInbox.clear();
          if (!cancelled) navigate(`/inbox/${source.id}`, { replace: true });
          return;
        }
        if (payload.files.length > 1) setNotice('Only the first file was captured.');
        const first = files[0];
        if (!first) {
          claimedShareId = null;
          setEmpty(true);
          return;
        }
        const file = new File([first.blob], first.name || 'shared', { type: first.type || 'application/octet-stream' });
        const source = await apiClient.uploadSource(file, file.name);
        await shareInbox.clear();
        if (!cancelled) navigate(`/inbox/${source.id}`, { replace: true });
      } catch (err) {
        claimedShareId = null;
        if (!cancelled) setError(errorMessage(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 py-6">
      <h1 className="text-sm font-medium text-zinc-100">Shared capture</h1>
      {empty && <p className="text-sm text-zinc-300">Nothing was shared.</p>}
      {notice && <p className="text-sm text-zinc-300">{notice}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!empty && !error && <p className="text-sm text-zinc-400">Sending the capture to your inbox…</p>}
    </div>
  );
};
