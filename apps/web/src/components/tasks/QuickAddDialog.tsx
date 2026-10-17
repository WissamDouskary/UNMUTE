import { useState, useRef, useEffect, FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CornerDownLeft, Loader2, Sparkles, X } from 'lucide-react';
import { TaskPriority, CreateTaskRequest } from '@unmute/api-client';
import { PriorityPicker } from './PriorityPicker';
import { DatePickerPopover } from '../ui/DatePickerPopover';
import { responsiveDialogContentClass, sheetHandleClass } from '../ui/responsiveDialog';

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateTaskRequest) => void;
  isPending: boolean;
}

export function QuickAddDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: QuickAddDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDate(undefined);
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() || isPending) return;

    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm animate-in fade-in-0 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className={`${responsiveDialogContentClass} p-5 outline-none md:fixed md:left-1/2 md:top-[28%] md:z-50 md:w-full md:max-w-xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border md:border-zinc-800/80 md:bg-zinc-950 md:ring-1 md:ring-inset md:ring-white/10 animate-in fade-in-0 zoom-in-95 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95`}>
          <div className={sheetHandleClass} aria-hidden />
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span>Create Task</span>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex min-h-11 min-w-11 max-md:items-center max-md:justify-center items-center justify-center text-zinc-500 hover:text-zinc-300 rounded-lg p-1 hover:bg-zinc-850 transition-colors cursor-pointer md:min-h-0 md:min-w-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Massive frictionless input */}
            <input
              ref={titleInputRef}
              type="text"
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="w-full text-2xl font-medium text-zinc-100 placeholder:text-zinc-600 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 py-1"
            />

            {/* Optional Description Textarea */}
            <textarea
              placeholder="Add description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-xs text-zinc-300 placeholder:text-zinc-600 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 resize-none leading-relaxed"
            />

            {/* Controls Row: Pill-shaped badges for Priority and Due Date */}
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-zinc-850">
              <div className="flex items-center gap-2">
                <PriorityPicker
                  value={priority}
                  onChange={setPriority}
                  size="sm"
                />
                <DatePickerPopover
                  date={dueDate}
                  onChange={setDueDate}
                  size="sm"
                  placeholder="Set due date"
                />
              </div>

              {/* Action buttons with keyboard shortcut badges */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline-block">
                  esc to cancel
                </span>
                <button
                  type="submit"
                  disabled={!title.trim() || isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white disabled:opacity-40 text-zinc-950 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-200 ease-out active:scale-[0.98]"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CornerDownLeft className="w-3.5 h-3.5" />
                  )}
                  <span>Create</span>
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
