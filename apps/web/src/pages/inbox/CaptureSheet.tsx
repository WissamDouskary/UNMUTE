import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Mic, Upload } from 'lucide-react';
import { apiClient, type Source } from '@unmute/api-client';
import { responsiveDialogContentClass, sheetHandleClass } from '../../components/ui/responsiveDialog';

const ACCEPT = 'audio/*,image/png,image/jpeg,image/webp,application/pdf,text/plain';

const panelClass = `${responsiveDialogContentClass} md:fixed md:left-1/2 md:top-1/2 md:z-50 md:max-h-[85dvh] md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-y-auto md:rounded-2xl md:border md:border-zinc-800 md:bg-zinc-950`;

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return 'The file could not be uploaded.';
}

export const CaptureSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onPending: (name: string | null) => void;
}> = ({ open, onClose, onPending }) => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    onPending(file.name === 'link.txt' ? 'Shared link' : file.name);
    try {
      const source: Source = await apiClient.uploadSource(file, file.name);
      onPending(null);
      onClose();
      navigate(`/inbox/${source.id}`);
    } catch (err) {
      onPending(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" aria-label="Close capture" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="capture-title" className={panelClass}>
        <div className={sheetHandleClass} aria-hidden />
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 id="capture-title" className="text-sm font-medium text-zinc-100">New capture</h2>
            <p className="mt-1 text-xs text-zinc-400">Nothing is saved until you review it.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onClose();
              navigate(`/sources?record=1&t=${Date.now().toString(36)}`);
            }}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-100 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700"
          >
            <Mic className="h-4 w-4 text-zinc-400" />
            Record
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-100 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700"
          >
            <Upload className="h-4 w-4 text-zinc-400" />
            Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const url = link.trim();
              if (!url || busy) return;
              setLink('');
              void upload(new File([url], 'link.txt', { type: 'text/plain' }));
            }}
          >
            <label htmlFor="capture-link" className="text-xs text-zinc-400">Add link</label>
            <div className="flex gap-2">
              <input
                id="capture-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-700"
              />
              <button
                type="submit"
                disabled={busy || !link.trim()}
                className="flex min-h-11 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-950 transition-all duration-200 ease-out active:scale-[0.98] disabled:opacity-40"
              >
                <Link2 className="h-4 w-4" />
                Add
              </button>
            </div>
          </form>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
};
