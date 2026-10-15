import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Square,
  Plus,
  Search,
  Calendar,
  FileText,
  Trash2,
  Clock,
  Sparkles,
  X,
  ChevronDown,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { apiClient, Task, TaskPriority, CreateTaskRequest } from '@unmute/api-client';

type TaskFilterStatus = 'all' | 'pending' | 'completed';

const PRIORITY_CONFIG: Record<
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

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filter & Search State
  const [statusFilter, setStatusFilter] = useState<TaskFilterStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Add State
  const [quickTitle, setQuickTitle] = useState<string>('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('MEDIUM');
  const [quickDueDate, setQuickDueDate] = useState<string>('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);

  // Delete modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
      setQuickDueDate('');
      setQuickPriority('MEDIUM');
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
  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    let dueInstant: string | undefined = undefined;
    if (quickDueDate) {
      dueInstant = new Date(quickDueDate).toISOString();
    }

    createMutation.mutate({
      title: quickTitle.trim(),
      priority: quickPriority,
      dueDate: dueInstant,
    });
  };

  const formatDueDate = (isoString?: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0 && !isToday) {
      return { text: `Overdue (${Math.abs(diffDays)}d)`, isOverdue: true };
    }
    if (isToday) {
      return { text: 'Today', isToday: true };
    }
    if (diffDays === 1) {
      return { text: 'Tomorrow', isUpcoming: true };
    }
    if (diffDays <= 7) {
      return { text: `In ${diffDays} days`, isUpcoming: true };
    }
    return {
      text: date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      isFuture: true,
    };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* Top Banner & Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10 px-6 sm:px-10 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <CheckSquare className="w-6 h-6 text-violet-400" />
                Actionable Tasks
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-mono">
                {stats.pending} pending
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Manage actionable items extracted by AI or created manually from your notes.
            </p>
          </div>

          {/* Quick Create Button */}
          <button
            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-violet-600/20 active:scale-95 transition-all cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-6 sm:px-10 py-8 flex-1 flex flex-col">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-8">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1">
              Total Tasks
            </span>
            <span className="text-2xl font-extrabold text-white">{stats.total}</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col">
            <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider mb-1">
              Pending
            </span>
            <span className="text-2xl font-extrabold text-amber-300">
              {stats.pending}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col">
            <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider mb-1">
              Completed
            </span>
            <span className="text-2xl font-extrabold text-emerald-300">
              {stats.completed}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col">
            <span className="text-[11px] font-medium text-red-400 uppercase tracking-wider mb-1">
              Urgent / High
            </span>
            <span className="text-2xl font-extrabold text-red-400">
              {stats.urgent}
            </span>
          </div>
        </div>

        {/* Expandable Quick Add Panel */}
        {isQuickAddOpen && (
          <form
            onSubmit={handleQuickAdd}
            className="mb-8 p-4 rounded-2xl bg-zinc-900 border border-violet-500/30 shadow-xl shadow-purple-950/20 flex flex-col gap-3 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Quick Add Task
              </span>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="What needs to be done? (e.g., Review API specs with team)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              autoFocus
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/80"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Priority Selector */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map(
                    (p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setQuickPriority(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                          quickPriority === p
                            ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].text} font-bold`
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                {/* Due Date Input */}
                <div className="flex items-center gap-1.5 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="date"
                    value={quickDueDate}
                    onChange={(e) => setQuickDueDate(e.target.value)}
                    className="bg-transparent text-xs text-zinc-200 focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!quickTitle.trim() || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-md shadow-violet-600/30"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Save Task</span>
              </button>
            </div>
          </form>
        )}

        {/* Filter Controls & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          {/* Status Tabs */}
          <div className="flex items-center p-1 bg-zinc-900 rounded-xl border border-zinc-800/80 text-xs self-start">
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

          <div className="flex items-center gap-2">
            {/* Priority Filter Dropdown */}
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) =>
                  setPriorityFilter(e.target.value as TaskPriority | 'ALL')
                }
                className="appearance-none pl-3 pr-8 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-violet-500/80 cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent Only</option>
                <option value="HIGH">High Only</option>
                <option value="MEDIUM">Medium Only</option>
                <option value="LOW">Low Only</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/80 w-36 sm:w-48 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Task Rows List */}
        <div className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span>Loading tasks...</span>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-700/60 flex items-center justify-center mb-3 text-zinc-400">
                <CheckCircle2 className="w-6 h-6 text-violet-400" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200 mb-1">No tasks found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mb-4 leading-relaxed">
                {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                  ? 'No tasks match your active filters. Try resetting search or filter criteria.'
                  : 'You have clear runway! Add a task using the button above or type /extract-tasks in any note.'}
              </p>
              <button
                onClick={() => setIsQuickAddOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                Create First Task
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const priorityMeta = PRIORITY_CONFIG[task.priority];
                const dueMeta = formatDueDate(task.dueDate);

                return (
                  <div
                    key={task.id}
                    className={`group relative flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                      task.isCompleted
                        ? 'bg-zinc-950/60 border-zinc-850 opacity-70 hover:opacity-100'
                        : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700/80 shadow-sm'
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
                        <Square className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
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

                        {/* Due Date Pill */}
                        {dueMeta && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md ${
                              dueMeta.isOverdue
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : dueMeta.isToday
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'bg-zinc-800 text-zinc-400'
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
                        <div className="inline-flex items-center gap-1 mt-1">
                          <button
                            onClick={() => navigate(`/notes`)}
                            title="Open parent note in editor"
                            className="group/note inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-850 hover:bg-violet-950/40 border border-zinc-800 hover:border-violet-500/40 text-[11px] text-zinc-400 hover:text-violet-300 transition-all cursor-pointer"
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100 mb-2">Delete this task?</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              This will permanently delete this task from your system.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors cursor-pointer"
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
