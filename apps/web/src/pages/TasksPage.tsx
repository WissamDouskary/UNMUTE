import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Square,
  Plus,
  Search,
  FileText,
  Trash2,
  Clock,
  Sparkles,
  X,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import { apiClient, Task, TaskPriority, CreateTaskRequest } from '@unmute/api-client';
import { CustomSelect, SelectOption } from '../components/ui/CustomSelect';
import { DatePickerPopover } from '../components/ui/DatePickerPopover';
import { isToday, isTomorrow, differenceInCalendarDays, format } from 'date-fns';

type TaskFilterStatus = 'all' | 'pending' | 'completed';

const PRIORITY_META: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  URGENT: {
    label: 'Urgent',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    dot: 'bg-red-400',
  },
  HIGH: {
    label: 'High',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
  },
  MEDIUM: {
    label: 'Medium',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
  },
  LOW: {
    label: 'Low',
    bg: 'bg-zinc-800/80',
    text: 'text-zinc-400',
    border: 'border-zinc-700/60',
    dot: 'bg-zinc-500',
  },
};

const PRIORITY_OPTIONS: SelectOption<TaskPriority | 'ALL'>[] = [
  { value: 'ALL', label: 'All Priorities', dotColor: 'bg-zinc-500' },
  { value: 'URGENT', label: 'Urgent', dotColor: 'bg-red-400' },
  { value: 'HIGH', label: 'High', dotColor: 'bg-amber-400' },
  { value: 'MEDIUM', label: 'Medium', dotColor: 'bg-blue-400' },
  { value: 'LOW', label: 'Low', dotColor: 'bg-zinc-500' },
];

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filter & Search State
  const [statusFilter, setStatusFilter] = useState<TaskFilterStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Add State
  const [quickTitle, setQuickTitle] = useState<string>('');
  const [quickDescription, setQuickDescription] = useState<string>('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('MEDIUM');
  const [quickDueDate, setQuickDueDate] = useState<Date | undefined>(undefined);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [showDescriptionInput, setShowDescriptionInput] = useState<boolean>(false);

  // Delete modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Quick add input ref for auto-focus
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isQuickAddOpen) {
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    }
  }, [isQuickAddOpen]);

  // Global keyboard shortcut to open quick add
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'c' || e.key === 'C') &&
        !isQuickAddOpen &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsQuickAddOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuickAddOpen]);

  // 1. Fetch Tasks Query
  const tasksQueryKey = [
    'tasks',
    {
      completed:
        statusFilter === 'all' ? undefined : statusFilter === 'completed',
      priority: priorityFilter === 'ALL' ? undefined : priorityFilter,
    },
  ];

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: tasksQueryKey,
    queryFn: async () => {
      return apiClient.getTasks({
        completed:
          statusFilter === 'all' ? undefined : statusFilter === 'completed',
        priority: priorityFilter === 'ALL' ? undefined : priorityFilter,
      });
    },
  });

  // Client-side search filtering
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.noteTitle && t.noteTitle.toLowerCase().includes(q))
    );
  }, [tasks, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.isCompleted).length;
    const pending = total - completed;
    const urgent = tasks.filter(
      (t) => !t.isCompleted && (t.priority === 'URGENT' || t.priority === 'HIGH')
    ).length;
    return { total, completed, pending, urgent };
  }, [tasks]);

  // --- Mutations ---

  // 1. Toggle Completed Mutation (Optimistic)
  const toggleMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.toggleTaskCompleted(taskId),
    onMutate: async (taskId: string) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);

      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return [];
        return old.map((t) =>
          t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
        );
      });

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // 2. Create Task Mutation (Optimistic)
  const createMutation = useMutation({
    mutationFn: (data: CreateTaskRequest) => apiClient.createTask(data),
    onSuccess: (newTask) => {
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return [newTask];
        return [newTask, ...old];
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setQuickTitle('');
      setQuickDescription('');
      setQuickDueDate(undefined);
      setQuickPriority('MEDIUM');
      setShowDescriptionInput(false);
      setIsQuickAddOpen(false);
    },
  });

  // 3. Delete Task Mutation (Optimistic)
  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.deleteTask(taskId),
    onMutate: async (taskId: string) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);

      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return [];
        return old.filter((t) => t.id !== taskId);
      });

      setDeleteConfirmId(null);
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Handlers
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickTitle.trim()) return;

    createMutation.mutate({
      title: quickTitle.trim(),
      description: quickDescription.trim() || undefined,
      priority: quickPriority,
      dueDate: quickDueDate ? quickDueDate.toISOString() : undefined,
    });
  };

  const formatDueDate = (isoString?: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();

    if (isToday(date)) {
      return { text: 'Today', isToday: true };
    }
    if (isTomorrow(date)) {
      return { text: 'Tomorrow', isUpcoming: true };
    }

    const diffDays = differenceInCalendarDays(date, now);

    if (diffDays < 0) {
      return { text: `Overdue (${Math.abs(diffDays)}d)`, isOverdue: true };
    }
    if (diffDays <= 7) {
      return { text: `In ${diffDays} days`, isUpcoming: true };
    }
    return {
      text: format(date, 'MMM d'),
      isFuture: true,
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* Top Header & Compact Metrics Bar */}
      <div className="border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20 px-6 sm:px-10 py-5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Tasks
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  {stats.pending} remaining
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Actionable items synced across notes and AI workflows
              </p>
            </div>
          </div>

          {/* Action buttons & Stats bar */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Elegant Compact Stats Bar */}
            <div className="hidden sm:flex items-center gap-4 py-1.5 px-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-500 font-medium">Total</span>
                <span className="font-semibold text-zinc-200">{stats.total}</span>
              </div>
              <div className="h-3 w-px bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-zinc-500 font-medium">Pending</span>
                <span className="font-semibold text-amber-300">{stats.pending}</span>
              </div>
              <div className="h-3 w-px bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-zinc-500 font-medium">Done</span>
                <span className="font-semibold text-emerald-300">{stats.completed}</span>
              </div>
              {stats.urgent > 0 && (
                <>
                  <div className="h-3 w-px bg-zinc-800" />
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="text-zinc-500 font-medium">Urgent</span>
                    <span className="font-semibold text-red-400">{stats.urgent}</span>
                  </div>
                </>
              )}
            </div>

            {/* New Task Trigger Button */}
            <button
              onClick={() => setIsQuickAddOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono text-white/80">
                C
              </kbd>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto w-full px-6 sm:px-10 py-6 flex-1 flex flex-col">
        {/* =========================================================================
            FRICTIONLESS QUICK ADD COMPOSER (Massive input, sleek pills)
        ========================================================================== */}
        {isQuickAddOpen && (
          <div className="mb-6 rounded-2xl bg-zinc-900 border border-violet-500/30 shadow-2xl shadow-purple-950/20 p-4 transition-all animate-in fade-in zoom-in-98 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/60">
              <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Quick Create Task
              </span>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 rounded-lg p-1 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Massive frictionless input */}
            <input
              ref={titleInputRef}
              type="text"
              placeholder="What needs to be done? (e.g., Finalize Q3 roadmap & push to GitHub)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleQuickAdd();
                } else if (e.key === 'Escape') {
                  setIsQuickAddOpen(false);
                }
              }}
              className="w-full text-base sm:text-lg font-medium text-white placeholder:text-zinc-600 bg-transparent border-0 focus:outline-none focus:ring-0 py-2"
            />

            {/* Optional Description Expander */}
            {showDescriptionInput ? (
              <textarea
                placeholder="Add optional context or notes..."
                value={quickDescription}
                onChange={(e) => setQuickDescription(e.target.value)}
                rows={2}
                className="w-full text-xs text-zinc-300 placeholder:text-zinc-600 bg-zinc-950/50 border border-zinc-800 rounded-xl p-2.5 focus:outline-none focus:border-violet-500/60 mb-2 resize-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowDescriptionInput(true)}
                className="text-[11px] text-zinc-500 hover:text-zinc-400 mb-2 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add notes or description</span>
              </button>
            )}

            {/* Control Bar: Tactile Priority Pills + Custom Date Picker */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/60">
              <div className="flex flex-wrap items-center gap-2">
                {/* Priority Selector Pills */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => {
                    const isSelected = quickPriority === p;
                    const meta = PRIORITY_META[p];
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setQuickPriority(p)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? `${meta.bg} ${meta.text} border ${meta.border} font-semibold shadow-sm`
                            : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Headless Date Picker Popover */}
                <DatePickerPopover
                  date={quickDueDate}
                  onChange={setQuickDueDate}
                  placeholder="Set due date"
                  size="sm"
                />
              </div>

              {/* Submit Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickAdd()}
                  disabled={!quickTitle.trim() || createMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold cursor-pointer transition-all shadow-md shadow-violet-600/30 active:scale-95"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Save Task</span>
                  <CornerDownLeft className="w-3 h-3 opacity-60 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls Bar (Status Segmented Control, Custom Priority Dropdown, Search) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          {/* Status Tabs */}
          <div className="flex items-center p-1 bg-zinc-900 rounded-xl border border-zinc-800 text-xs self-start shadow-sm">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                statusFilter === 'pending'
                  ? 'bg-zinc-800 text-amber-300 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                statusFilter === 'completed'
                  ? 'bg-zinc-800 text-emerald-300 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Completed
            </button>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            {/* Custom Headless Priority Dropdown (NO native select) */}
            <CustomSelect<TaskPriority | 'ALL'>
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={PRIORITY_OPTIONS}
              placeholder="All Priorities"
              align="right"
              buttonClassName="w-36 justify-between"
            />

            {/* Search Input */}
            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/80 transition-all shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Task Rows List */}
        <div className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-zinc-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span>Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-3 text-zinc-400">
                <CheckCircle2 className="w-6 h-6 text-violet-400" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200 mb-1">
                {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                  ? 'No matching tasks'
                  : 'Clear Runway'}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">
                {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                  ? 'No tasks found for your active filters. Try adjusting search or priority.'
                  : 'All caught up! Add a new task using the button above or type /extract-tasks in your notes.'}
              </p>
              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer border border-zinc-700/60 shadow-sm"
              >
                Create First Task
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredTasks.map((task) => {
                const priorityMeta = PRIORITY_META[task.priority];
                const dueMeta = formatDueDate(task.dueDate);

                return (
                  <div
                    key={task.id}
                    className={`group relative flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      task.isCompleted
                        ? 'bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-90'
                        : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-850 hover:border-zinc-750 shadow-sm'
                    }`}
                  >
                    {/* Toggle Checkbox */}
                    <button
                      onClick={() => toggleMutation.mutate(task.id)}
                      title={
                        task.isCompleted
                          ? 'Mark as incomplete'
                          : 'Mark as completed'
                      }
                      className="mt-0.5 text-zinc-500 hover:text-violet-400 cursor-pointer flex-shrink-0 transition-colors"
                    >
                      {task.isCompleted ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-600 hover:text-zinc-300" />
                      )}
                    </button>

                    {/* Task Title & Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-sm font-medium leading-snug transition-all ${
                            task.isCompleted
                              ? 'line-through text-zinc-500'
                              : 'text-zinc-100'
                          }`}
                        >
                          {task.title}
                        </span>

                        {/* Priority Pill */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${priorityMeta.bg} ${priorityMeta.text} ${priorityMeta.border}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${priorityMeta.dot}`}
                          />
                          {priorityMeta.label}
                        </span>

                        {/* Custom Due Date Pill */}
                        {dueMeta && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md ${
                              dueMeta.isOverdue
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20 font-semibold'
                                : dueMeta.isToday
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-750'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            {dueMeta.text}
                          </span>
                        )}
                      </div>

                      {/* Description if present */}
                      {task.description && (
                        <p className="text-xs text-zinc-400 mb-1.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      {/* Note Link Badge */}
                      {task.noteId && (
                        <div className="inline-flex items-center gap-1 mt-0.5">
                          <button
                            onClick={() => navigate('/notes')}
                            title="Open parent note in editor"
                            className="group/note inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-850 hover:bg-violet-950/40 border border-zinc-800 hover:border-violet-500/40 text-[11px] text-zinc-400 hover:text-violet-300 transition-all cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-violet-400" />
                            <span className="truncate max-w-[200px]">
                              {task.noteTitle || 'Linked Note'}
                            </span>
                            <ArrowUpRight className="w-2.5 h-2.5 opacity-60 group-hover/note:opacity-100" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Quick Delete Action */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setDeleteConfirmId(task.id)}
                        title="Delete task"
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sleek Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl shadow-black/80">
            <h3 className="text-base font-bold text-zinc-100 mb-2">Delete this task?</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              This action cannot be undone. The task will be permanently removed.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer shadow-md shadow-red-600/30"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
