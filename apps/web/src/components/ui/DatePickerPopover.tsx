import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, isToday, isTomorrow, addDays, startOfToday } from 'date-fns';
import { Calendar as CalendarIcon, X, Clock } from 'lucide-react';

interface DatePickerPopoverProps {
  date: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  align?: 'left' | 'right';
  className?: string;
  size?: 'sm' | 'md';
}

export function DatePickerPopover({
  date,
  onChange,
  placeholder = 'Due date',
  align = 'left',
  className = '',
  size = 'md',
}: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const getDateLabel = () => {
    if (!date) return placeholder;
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d, yyyy');
  };

  const handleQuickSelect = (daysToAdd: number) => {
    const target = addDays(startOfToday(), daysToAdd);
    onChange(target);
    setIsOpen(false);
  };

  const handleDaySelect = (selectedDate: Date | undefined) => {
    onChange(selectedDate);
    if (selectedDate) {
      setIsOpen(false);
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : 'px-3 py-2 text-xs rounded-xl';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`flex items-center gap-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition-all cursor-pointer shadow-sm focus:outline-none focus:border-violet-500/80 ${sizeClasses} ${
            date ? 'text-violet-300 border-violet-500/30 bg-violet-950/20' : ''
          }`}
        >
          <CalendarIcon
            className={`w-3.5 h-3.5 ${
              date ? 'text-violet-400' : 'text-zinc-500'
            }`}
          />
          <span className="font-medium truncate">{getDateLabel()}</span>
        </button>

        {date && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(undefined);
            }}
            title="Clear due date"
            className="ml-1 p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Popover Calendar */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Choose due date"
          className={`absolute z-50 mt-2 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl shadow-black/80 p-3.5 animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 pb-3 mb-2 border-b border-zinc-800/80">
            <button
              type="button"
              onClick={() => handleQuickSelect(0)}
              className="flex-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Today</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(1)}
              className="flex-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Clock className="w-3 h-3 text-blue-400" />
              <span>Tomorrow</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect(7)}
              className="flex-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
            >
              <Clock className="w-3 h-3 text-violet-400" />
              <span>+1 Week</span>
            </button>
          </div>

          {/* Calendar */}
          <DayPicker
            mode="single"
            selected={date}
            onSelect={handleDaySelect}
            className="m-0"
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
                  setIsOpen(false);
                }}
                className="text-[11px] text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear date
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
