import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import { format, isToday, isTomorrow, addDays, startOfToday } from 'date-fns';
import { Calendar as CalendarIcon, X, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DatePickerPopoverProps {
  date: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
  size?: 'sm' | 'md';
}

export function DatePickerPopover({
  date,
  onChange,
  placeholder = 'Due date',
  align = 'start',
  className = '',
  size = 'md',
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);

  const getDateLabel = () => {
    if (!date) return placeholder;
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const handleQuickSelect = (daysToAdd: number) => {
    const target = addDays(startOfToday(), daysToAdd);
    onChange(target);
    setOpen(false);
  };

  const handleDaySelect = (selectedDate: Date | undefined) => {
    onChange(selectedDate);
    if (selectedDate) {
      setOpen(false);
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-7 px-2.5 text-[11px] rounded-lg'
      : 'h-8 px-3 text-xs rounded-xl';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('inline-flex items-center gap-1', className)}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 font-medium transition-all cursor-pointer border select-none',
              'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-700',
              'focus:outline-none focus:ring-1 focus:ring-violet-500/50',
              date && 'text-violet-300 border-violet-500/30 bg-violet-950/20',
              sizeClasses
            )}
          >
            <CalendarIcon
              className={cn(
                'w-3.5 h-3.5',
                date ? 'text-violet-400' : 'text-zinc-500'
              )}
            />
            <span className="truncate">{getDateLabel()}</span>
          </button>
        </Popover.Trigger>

        {date && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
            }}
            title="Clear date"
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 w-auto rounded-2xl bg-zinc-950/95 backdrop-blur-2xl border border-zinc-800/90 p-3 shadow-2xl shadow-black/90',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1 pb-2.5 mb-2 border-b border-zinc-800/80">
            <button
              type="button"
              onClick={() => handleQuickSelect(0)}
              className="flex-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1 border border-zinc-800/60"
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Today</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(1)}
              className="flex-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1 border border-zinc-800/60"
            >
              <Clock className="w-3 h-3 text-blue-400" />
              <span>Tomorrow</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(7)}
              className="flex-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1 border border-zinc-800/60"
            >
              <Clock className="w-3 h-3 text-violet-400" />
              <span>+1 Week</span>
            </button>
          </div>

          {/* Calendar DayPicker */}
          <DayPicker
            mode="single"
            selected={date}
            onSelect={handleDaySelect}
            className="m-0 select-none"
          />

          {/* Footer */}
          {date && (
            <div className="pt-2.5 mt-1 border-t border-zinc-800/80 flex items-center justify-between text-xs">
              <span className="text-zinc-500 font-mono text-[11px]">
                {format(date, 'EEE, MMM d, yyyy')}
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setOpen(false);
                }}
                className="text-[11px] text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear date
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
