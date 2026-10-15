import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  FileText,
  Trash2,
  Clock,
  X,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
  Circle,
  Check,
} from 'lucide-react';
import { apiClient, Task, TaskPriority, CreateTaskRequest } from '@unmute/api-client';
import { CustomSelect, SelectOption } from '../components/ui/CustomSelect';
import { PriorityIcon } from '../components/tasks/PriorityIcon';
import { QuickAddDialog } from '../components/tasks/QuickAddDialog';
import { isToday, isTomorrow, differenceInCalendarDays, format } from 'date-fns';
import { cn } from '../lib/utils';

type TaskFilterStatus = 'all' | 'pending' | 'completed';

const PRIORITY_OPTIONS: SelectOption<TaskPriority | 'ALL'>[] = [
  { value: 'ALL', label: 'All Priorities', dotColor: 'bg-zinc-500' },
  { value: 'URGENT', label: 'Urgent', dotColor: 'bg-red-500' },
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

  // Quick Add Dialog State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);

  // Delete confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Global 'C' shortcut to trigger Quick Add modal
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

  // Fetch Tasks Query
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
      return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    }
    if (diffDays <= 7) {
      return { text: `In ${diffDays}d`, isUpcoming: true };
    }
    return {
      text: format(date, 'MMM d'),
      isFuture: true,
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* =========================================================================
          TOP HEADER: Minimalist Title + Create Trigger
      ========================================================================== */}
      <div className="border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20 px-6 sm:px-10 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">
              Tasks
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800">
              {stats.pending}
            </span>
          </div>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/20 transition-all cursor-pointer select-none"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
            <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-mono">
              C
            </kbd>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 sm:px-10 py-5 flex-1 flex flex-col">
        {/* =========================================================================
            STATS CARDS: Compact & Elegant with Tracked-Out Uppercase Labels
        ========================================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="px-3.5 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <span className="block text-[10px] tracking-wider text-zinc-500 uppercase font-semibold">
                Total Tasks
              </span>
              <span className="text-lg font-bold text-zinc-100">{stats.total}</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <span className="block text-[10px] tracking-wider text-amber-500/80 uppercase font-semibold">
                Pending
              </span>
              <span className="text-lg font-bold text-amber-300">{stats.pending}</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <span className="block text-[10px] tracking-wider text-emerald-500/80 uppercase font-semibold">
                Completed
              </span>
              <span className="text-lg font-bold text-emerald-300">
                {stats.completed}
              </span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>

          <div className="px-3.5 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 flex items-center justify-between">
            <div>
              <span className="block text-[10px] tracking-wider text-red-500/80 uppercase font-semibold">
                Urgent / High
              </span>
              <span className="text-lg font-bold text-red-400">{stats.urgent}</span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          </div>
        </div>

        {/* =========================================================================
            FILTER CONTROLS BAR: Status Segmented Control, Radix Priority, Search
        ========================================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          {/* Status Tabs */}
          <div className="flex items-center p-0.5 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-xs self-start">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-all cursor-pointer',
                statusFilter === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-all cursor-pointer',
                statusFilter === 'pending'
                  ? 'bg-zinc-800 text-amber-300 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={cn(
                'px-3 py-1 rounded-lg font-medium transition-all cursor-pointer',
                statusFilter === 'completed'
                  ? 'bg-zinc-800 text-emerald-300 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              Completed
            </button>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            {/* Radix Headless Select for Priority */}
            <CustomSelect<TaskPriority | 'ALL'>
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={PRIORITY_OPTIONS}
              placeholder="All Priorities"
              align="end"
              size="sm"
              buttonClassName="w-36 justify-between"
            />

            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/80 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            TASK LIST: Seamless Linear-Style Data Grid (1px border-b border-zinc-800/50)
        ========================================================================== */}
        <div className="flex-1 rounded-xl border border-zinc-850/80 bg-zinc-900/20 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span>Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-850 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                <CheckCircle2 className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                  ? 'No matching tasks'
                  : 'No tasks yet'}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">
                {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                  ? 'Try clearing your filters or search query.'
                  : 'Press C to quickly capture a task or use /extract-tasks in your notes.'}
              </p>
              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer border border-zinc-700"
              >
                Create Task
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {filteredTasks.map((task) => {
                const dueMeta = formatDueDate(task.dueDate);

                return (
                  <div
                    key={task.id}
                    className={cn(
                      'group relative flex items-center gap-3 px-4 py-2.5 transition-colors select-none',
                      task.isCompleted
                        ? 'bg-zinc-950/30 text-zinc-500 hover:bg-zinc-900/40'
                        : 'hover:bg-zinc-850/40 text-zinc-200'
                    )}
                  >
                    {/* Linear Checkbox Toggle */}
                    <button
                      onClick={() => toggleMutation.mutate(task.id)}
                      title={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                      className="text-zinc-600 hover:text-zinc-300 cursor-pointer flex-shrink-0 transition-colors"
                    >
                      {task.isCompleted ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                      )}
                    </button>

                    {/* Linear Priority Icon */}
                    <PriorityIcon priority={task.priority} className="flex-shrink-0" />

                    {/* Task Title & Description */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xs font-medium truncate transition-all',
                          task.isCompleted
                            ? 'line-through text-zinc-500'
                            : 'text-zinc-200 group-hover:text-white'
                        )}
                      >
                        {task.title}
                      </span>

                      {task.description && (
                        <span className="text-[11px] text-zinc-500 truncate hidden md:inline-block max-w-[280px]">
                          — {task.description}
                        </span>
                      )}
                    </div>

                    {/* Linked Note Badge */}
                    {task.noteId && (
                      <button
                        onClick={() => navigate('/notes')}
                        title="Open parent note"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-850 hover:bg-violet-950/30 border border-zinc-800 hover:border-violet-500/30 text-[10px] text-zinc-400 hover:text-violet-300 transition-all cursor-pointer flex-shrink-0"
                      >
                        <FileText className="w-3 h-3 text-violet-400" />
                        <span className="truncate max-w-[120px] hidden sm:inline-block">
                          {task.noteTitle || 'Note'}
                        </span>
                        <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    )}

                    {/* Due Date Indicator */}
                    {dueMeta && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md flex-shrink-0',
                          dueMeta.isOverdue
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20 font-semibold'
                            : dueMeta.isToday
                            ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                            : 'text-zinc-500'
                        )}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{dueMeta.text}</span>
                      </span>
                    )}

                    {/* Quick-action buttons (ONLY shown on row hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => setDeleteConfirmId(task.id)}
                        title="Delete task"
                        className="p-1 rounded-md hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
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

      {/* =========================================================================
          QUICK ADD MODAL (Command Palette Style Dialog via Radix)
      ========================================================================== */}
      <QuickAddDialog
        open={isQuickAddOpen}
        onOpenChange={setIsQuickAddOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in-0 duration-100">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 shadow-2xl shadow-black/80">
            <h3 className="text-sm font-bold text-zinc-100 mb-1.5">Delete task?</h3>
            <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
              This task will be permanently removed. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer shadow-md shadow-red-600/30"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
