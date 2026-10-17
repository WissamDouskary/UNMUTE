import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const ios = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || ios.standalone === true;
}

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!promptEvent || isStandalone()) return null;

  return (
    <button
      type="button"
      className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 ring-1 ring-inset ring-white/10 transition-all duration-200 ease-out hover:bg-zinc-800/50 active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700 cursor-pointer"
      onClick={() => {
        void promptEvent.prompt().then(() => setPromptEvent(null));
      }}
    >
      <Download className="h-4 w-4 shrink-0 text-zinc-400" />
      <span>Install App</span>
    </button>
  );
}
