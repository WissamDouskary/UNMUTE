import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLiveEventStream } from '../hooks/useLiveEvents';
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Calendar,
  Radio,
  LogOut,
  Sparkles,
  Waypoints,
  Search,
  Ellipsis,
} from 'lucide-react';
import { CommandPalette, OPEN_PALETTE_EVENT } from './CommandPalette';
import { AskChatProvider } from '../context/AskChatContext';
import { AskCompanion } from './ask/AskCompanion';
import { InstallAppButton } from './InstallAppButton';
import { MobileTabBar } from './MobileTabBar';
import { sheetHandleClass } from './ui/responsiveDialog';

export const AppShell: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const liveStatus = useLiveEventStream(isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const isFullBleed =
    location.pathname.startsWith('/notes') ||
    location.pathname.startsWith('/tasks') ||
    location.pathname.startsWith('/sources') ||
    location.pathname.startsWith('/ask') ||
    location.pathname.startsWith('/graph') ||
    location.pathname.startsWith('/calendar');
  const getPageTitle = () => {
    if (location.pathname.startsWith('/graph')) return 'Knowledge Graph';
    if (location.pathname.startsWith('/notes')) return 'Notes';
    if (location.pathname.startsWith('/tasks')) return 'Tasks';
    if (location.pathname.startsWith('/calendar')) return 'Calendar';
    if (location.pathname.startsWith('/sources')) return 'Sources';
    if (location.pathname.startsWith('/ask')) return 'Ask UNMUTE';
    return 'Home';
  };
  const pageTitle = getPageTitle();

  useEffect(() => {
    const show = () => setOfflineNotice(true);
    const hide = () => setOfflineNotice(false);
    const onFailedWrite = () => {
      setOfflineNotice(true);
      if (navigator.onLine) {
        window.setTimeout(() => {
          if (navigator.onLine) setOfflineNotice(false);
        }, 4000);
      }
    };
    window.addEventListener('offline', show);
    window.addEventListener('online', hide);
    window.addEventListener('unmute:offline', onFailedWrite);
    return () => {
      window.removeEventListener('offline', show);
      window.removeEventListener('online', hide);
      window.removeEventListener('unmute:offline', onFailedWrite);
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems = [
    { name: 'Home', to: '/', icon: LayoutDashboard, exact: true },
    { name: 'Ask UNMUTE', to: '/ask', icon: Sparkles },
    { name: 'Notes', to: '/notes', icon: FileText },
    { name: 'Tasks', to: '/tasks', icon: CheckSquare },
    { name: 'Calendar', to: '/calendar', icon: Calendar },
    { name: 'Sources', to: '/sources', icon: Radio },
    { name: 'Graph', to: '/graph', icon: Waypoints },
  ];

  // User initials
  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase();

  return (
    <AskChatProvider>
    <div
      className={`bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] flex flex-col md:flex-row ${
        isFullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      {/* Sidebar stays mounted and is hidden below md */}
      <aside className="hidden md:flex md:static md:h-dvh md:sticky md:top-0 w-60 bg-zinc-950 border-r border-zinc-800 flex-col justify-between">
        <div className="flex flex-col flex-1 p-4 overflow-y-auto">
          {/* Logo and App Title */}
          <div className="hidden md:flex items-center gap-2.5 px-2 py-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d4d4d8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <div>
              <span className="font-semibold tracking-tight text-sm leading-none block text-zinc-100">UNMUTE</span>
              <span className="text-[11px] text-zinc-500">
                Workspace
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-0.5 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700 ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </div>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Logout Bottom Bar */}
        <div className="p-3 border-t border-zinc-800">
          <InstallAppButton />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-zinc-300 flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                  {user?.displayName || 'User'}
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                  {user?.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700 cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0 ${
          isFullBleed ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <h2 className="min-w-0 truncate text-sm font-medium tracking-tight text-zinc-200">{pageTitle}</h2>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Search"
              onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
              className="flex min-h-11 min-w-11 items-center justify-center text-zinc-400 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="More"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center text-zinc-400 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <Ellipsis className="h-5 w-5" />
            </button>
          </div>
        </header>
        {/* Top Header Bar */}
        <header className="hidden md:flex items-center justify-between h-12 px-6 border-b border-zinc-800 bg-zinc-950 sticky top-0 z-20 flex-shrink-0">
          <h2 className="text-sm font-medium tracking-tight text-zinc-200">{pageTitle}</h2>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900 text-xs text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
              <kbd className="font-mono text-[10px] text-zinc-500">Ctrl K</kbd>
            </button>
            <button
              onClick={() => navigate('/ask')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-zinc-900 text-xs font-medium text-zinc-200 hover:bg-zinc-800/50 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-700"
              title="Launch Ask UNMUTE RAG Assistant"
            >
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ask UNMUTE</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-surface-secondary)] border border-[var(--color-border)] text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  liveStatus === 'open'
                    ? 'bg-emerald-400'
                    : liveStatus === 'reconnecting'
                      ? 'bg-amber-400'
                      : 'bg-zinc-500'
                }`}
              />
              <span className="text-[var(--color-text-secondary)]">
                {liveStatus === 'open'
                  ? 'Live'
                  : liveStatus === 'reconnecting'
                    ? 'Reconnecting'
                    : liveStatus === 'connecting'
                      ? 'Connecting'
                      : 'Offline'}
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Logged in as <strong className="text-[var(--color-text-primary)]">{user?.email}</strong>
            </div>
          </div>
        </header>

        {offlineNotice && (
          <div role="status" className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-center text-xs text-zinc-200">
            No connection
          </div>
        )}

        {/* Dynamic Nested View */}
        <main className={`flex-1 flex flex-col min-h-0 w-full ${isFullBleed ? 'overflow-hidden' : 'px-4 py-4 sm:px-6 lg:px-8'}`}>
          <Outlet />
        </main>
        <CommandPalette />

        <AskCompanion />
      </div>

      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
            <div className={sheetHandleClass} aria-hidden />
            <nav className="flex flex-col px-2 py-2" aria-label="More">
              {navItems
                .filter((item) => item.to === '/calendar' || item.to === '/sources' || item.to === '/graph')
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-zinc-300 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700"
                    >
                      <Icon className="h-4 w-4 text-zinc-400" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
            </nav>
            <div className="px-3 pb-2">
              <InstallAppButton />
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-zinc-300 transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 text-zinc-400" />
                <span>{isLoggingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileTabBar />
    </div>
    </AskChatProvider>
  );
};
