import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import { TaskPriority } from '@unmute/api-client';
import { PriorityIcon } from './PriorityIcon';
import { cn } from '../../lib/utils';

interface PriorityPickerProps {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  size?: 'sm' | 'md';
  className?: string;
}

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

export function PriorityPicker({
  value,
  onChange,
  size = 'md',
  className = '',
}: PriorityPickerProps) {
  const [open, setOpen] = useState(false);

  const sizeClasses =
    size === 'sm'
      ? 'h-7 px-2.5 text-[11px] rounded-lg'
      : 'h-8 px-3 text-xs rounded-xl';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer border select-none',
            'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-700',
            'focus:outline-none focus:ring-1 focus:ring-violet-500/50',
            sizeClasses,
            className
          )}
        >
          <PriorityIcon priority={value} />
          <span className="capitalize">{value.toLowerCase()}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[140px] rounded-xl bg-zinc-950/95 backdrop-blur-2xl border border-zinc-800 p-1 shadow-2xl shadow-black/80',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          {PRIORITIES.map((p) => {
            const isSelected = p.value === value;
            return (
              <button
                type="button"
                key={p.value}
                onClick={() => {
                  onChange(p.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium select-none transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-violet-600/15 text-violet-300 font-semibold'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                )}
              >
                <div className="flex items-center gap-2">
                  <PriorityIcon priority={p.value} />
                  <span>{p.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
