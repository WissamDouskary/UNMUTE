import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CheckSquare, FileText, LayoutDashboard, Mic, Sparkles, Square } from 'lucide-react';

const leftTabs = [
  { name: 'Home', to: '/', icon: LayoutDashboard, end: true },
  { name: 'Notes', to: '/notes', icon: FileText, end: false },
];

const rightTabs = [
  { name: 'Tasks', to: '/tasks', icon: CheckSquare, end: false },
  { name: 'Ask', to: '/ask', icon: Sparkles, end: false },
];

const press =
  'transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700';

function TabLink({
  tab,
}: {
  tab: { name: string; to: string; icon: typeof LayoutDashboard; end: boolean };
}) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className={({ isActive }) =>
        `flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] ${press} ${
          isActive ? 'text-zinc-100' : 'text-zinc-500'
        }`
      }
    >
      <Icon className="h-5 w-5" />
      <span>{tab.name}</span>
    </NavLink>
  );
}

export function MobileTabBar() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const onRecording = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setRecording(Boolean(detail?.active));
    };
    window.addEventListener('unmute:recording', onRecording);
    return () => window.removeEventListener('unmute:recording', onRecording);
  }, []);

  const onRecord = () => {
    if (recording) {
      window.dispatchEvent(new Event('unmute:stop-recording'));
      return;
    }
    navigate(`/sources?record=1&t=${Date.now().toString(36)}`);
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid h-14 grid-cols-5">
        {leftTabs.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
        <div className="relative flex items-center justify-center">
          <button
            type="button"
            onClick={onRecord}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            className={`absolute left-1/2 -top-5 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full ${press} ${
              recording
                ? 'bg-rose-600 text-white shadow-rose-600/40'
                : 'border border-violet-400/40 bg-zinc-950 text-zinc-100 shadow-[0_0_15px_rgba(167,139,250,0.45)]'
            }`}
          >
            {recording ? <Square className="h-5 w-5 fill-current" /> : <Mic className="h-6 w-6" />}
          </button>
        </div>
        {rightTabs.map((tab) => (
          <TabLink key={tab.to} tab={tab} />
        ))}
      </div>
    </nav>
  );
}
