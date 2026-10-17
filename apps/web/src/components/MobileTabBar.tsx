import { NavLink } from 'react-router-dom';
import { CheckSquare, FileText, LayoutDashboard, Sparkles } from 'lucide-react';

const tabs = [
  { name: 'Home', to: '/', icon: LayoutDashboard, end: true },
  { name: 'Notes', to: '/notes', icon: FileText, end: false },
  { name: 'Ask', to: '/ask', icon: Sparkles, end: false },
  { name: 'Tasks', to: '/tasks', icon: CheckSquare, end: false },
];

export function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid h-14 grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-zinc-700 ${
                  isActive ? 'text-zinc-100' : 'text-zinc-500'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{tab.name}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
