import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  FolderGit2,
  Radio,
  Settings,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Sparkles,
  Waypoints,
} from 'lucide-react';

export const AppShell: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isFullBleed =
    location.pathname.startsWith('/notes') ||
    location.pathname.startsWith('/tasks') ||
    location.pathname.startsWith('/sources') ||
    location.pathname.startsWith('/ask') ||
    location.pathname.startsWith('/graph');
  const getPageTitle = () => {
    if (location.pathname.startsWith('/graph')) return 'Knowledge Graph';
    if (location.pathname.startsWith('/notes')) return 'Notes & Knowledge';
    if (location.pathname.startsWith('/tasks')) return 'Tasks & Actions';
    if (location.pathname.startsWith('/projects')) return 'Projects';
    if (location.pathname.startsWith('/sources')) return 'Sources';
    if (location.pathname.startsWith('/ask')) return 'Ask UNMUTE (RAG)';
    if (location.pathname.startsWith('/settings')) return 'Settings';
    return 'Overview';
  };
  const pageTitle = getPageTitle();

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
    { name: 'Dashboard', to: '/', icon: LayoutDashboard, exact: true },
    { name: 'Ask UNMUTE', to: '/ask', icon: Sparkles, badge: 'Phase 5' },
    { name: 'Notes', to: '/notes', icon: FileText, badge: 'Phase 2' },
    { name: 'Tasks', to: '/tasks', icon: CheckSquare, badge: 'Phase 3' },
    { name: 'Projects', to: '/projects', icon: FolderGit2, badge: 'Phase 3' },
    { name: 'Sources', to: '/sources', icon: Radio, badge: 'Phase 4' },
    { name: 'Graph', to: '/graph', icon: Waypoints, badge: 'Phase 6' },
    { name: 'Settings', to: '/settings', icon: Settings },
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
    <div
      className={`bg-[var(--color-surface-primary)] text-[var(--color-text-primary)] flex flex-col md:flex-row ${
        isFullBleed ? 'h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)] sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)] shadow-md shadow-[var(--color-accent-muted)]">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
          <span className="font-bold tracking-tight text-lg">UNMUTE</span>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)] hover:text-white focus:outline-none"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar for Desktop & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-dvh md:sticky md:top-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 p-4 overflow-y-auto">
          {/* Logo and App Title */}
          <div className="hidden md:flex items-center gap-3 px-2 py-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent-muted)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <div>
              <span className="font-bold tracking-tight text-lg leading-none block">UNMUTE</span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono tracking-wider uppercase">
                Enterprise v0.1
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent)] text-white shadow-md shadow-[var(--color-accent-muted)]'
                        : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-tertiary)]'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Security Architecture Badge */}
          <div className="mt-4 p-3 rounded-xl bg-[var(--color-surface-tertiary)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>In-Memory Auth</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)] leading-tight">
              Access token isolated in memory against XSS exploits.
            </p>
          </div>
        </div>

        {/* User Profile & Logout Bottom Bar */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-accent-hover)] flex items-center justify-center shrink-0">
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
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${isFullBleed ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Top Header Bar */}
        <header className="hidden md:flex items-center justify-between h-16 px-8 border-b border-[var(--color-border)] bg-[var(--color-surface-primary)] sticky top-0 z-20 backdrop-blur-md bg-opacity-80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
              UNMUTE Platform
            </h2>
            <span className="text-[var(--color-border)]">/</span>
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              {pageTitle}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/ask')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/30 text-xs font-medium text-violet-300 hover:text-white transition-all shadow-sm cursor-pointer"
              title="Launch Ask UNMUTE RAG Assistant"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Ask UNMUTE</span>
            </button>

            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-surface-secondary)] border border-[var(--color-border)] text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[var(--color-text-secondary)]">API Live</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Logged in as <strong className="text-[var(--color-text-primary)]">{user?.email}</strong>
            </div>
          </div>
        </header>

        {/* Dynamic Nested View */}
        <main className={`flex-1 flex flex-col min-h-0 w-full ${isFullBleed ? 'overflow-hidden' : 'p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto'}`}>
          <Outlet />
        </main>

        {/* Floating Quick Ask Assistant Trigger (available everywhere except /ask) */}
        {!location.pathname.startsWith('/ask') && (
          <button
            onClick={() => navigate('/ask')}
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-2.5 p-3 sm:px-4 sm:py-2.5 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-xl shadow-violet-600/30 hover:scale-105 active:scale-95 transition-all cursor-pointer font-medium text-xs group"
            title="Ask UNMUTE AI Assistant"
            aria-label="Ask UNMUTE AI Assistant"
          >
            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline font-semibold">Ask UNMUTE</span>
            <span className="hidden sm:inline text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-mono">RAG</span>
          </button>
        )}
      </div>
    </div>
  );
};
