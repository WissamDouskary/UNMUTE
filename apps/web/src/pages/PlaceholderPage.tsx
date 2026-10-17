import React from 'react';
import { Sparkles } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  phase: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description, phase }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 ring-1 ring-inset ring-white/10 flex items-center justify-center text-zinc-300 mb-4">
        <Sparkles className="w-8 h-8" />
      </div>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-semibold mb-3">
        <span>{phase}</span>
      </div>
      <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)] max-w-md">
        {description}
      </p>
    </div>
  );
};
