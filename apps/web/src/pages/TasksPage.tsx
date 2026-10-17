import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  FileText,
  Trash2,
  X,
  ArrowUpRight,
  Loader2,
  Check,
  ListTodo,
} from 'lucide-react';
import {
  apiClient,
  Task,
  TaskPriority,
  CreateTaskRequest,
  UpdateTaskRequest,
} from '@unmute/api-client';
import { CustomSelect, SelectOption } from '../components/ui/CustomSelect';
import { PriorityPicker } from '../components/tasks/PriorityPicker';
import { DatePickerPopover } from '../components/ui/DatePickerPopover';
import { QuickAddDialog } from '../components/tasks/QuickAddDialog';
import { TaskDetailDrawer } from '../components/tasks/TaskDetailDrawer';
import { cn } from '../lib/utils';

type TaskFilterStatus = 'all' | 'pending' | 'completed';

const STATUS_OPTIONS: SelectOption<TaskFilterStatus>[] = [
  { value: 'all', label: 'All Statuses', dotColor: 'bg-zinc-500' },
  { value: 'pending', label: 'Pending', dotColor: 'bg-amber-400' },
  { value: 'completed', label: 'Completed', dotColor: 'bg-emerald-400' },
];

const PRIORITY_OPTIONS: SelectOption<TaskPriority | 'ALL'>[] = [
  { value: 'ALL', label: 'All Priorities', dotColor: 'bg-zinc-500' },
  { value: 'URGENT', label: 'Urgent', dotColor: 'bg-red-500' },
  { value: 'HIGH', label: 'High', dotColor: 'bg-amber-400' },
  { value: 'MEDIUM', label: 'Medium', dotColor: 'bg-blue-400' },
  { value: 'LOW', label: 'Low', dotColor: 'bg-zinc-500' },
];

export function TasksPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Filter & Search State
  const [statusFilter, setStatusFilter] = useState<TaskFilterStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Add Dialog State
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);

  // Delete confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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

  useEffect(() => {
    const token = searchParams.get('compose') === '1' ? searchParams.get('t') : null;
    if (!token || sessionStorage.getItem('unmute-task') === token) return;
    sessionStorage.setItem('unmute-task', token);
    setIsQuickAddOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('compose');
    next.delete('t');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  // 2. Update Task Mutation (Inline Priority or Due Date)
  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTaskRequest }) =>
      apiClient.updateTask(taskId, data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData<Task[]>(tasksQueryKey);

      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => {
        if (!old) return [];
        return old.map((t) => (t.id === taskId ? { ...t, ...data } : t));
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(tasksQueryKey, context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // 3. Create Task Mutation (Optimistic)
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

  // 4. Delete Task Mutation (Optimistic)
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

  return (
    <div className="flex-1 w-full flex flex-col bg-transparent text-zinc-100 overflow-y-auto">
      {/* =========================================================================
          TOP HEADER: Minimalist Title + Create Trigger (Centered Alignment)
      ========================================================================== */}
      <div className="border-b border-zinc-850/40 bg-transparent px-4 sm:px-8 xl:px-12 py-2.5">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Tasks
            </h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800/60">
              {stats.pending}
            </span>
          </div>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-medium transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-zinc-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
            <kbd className="hidden sm:inline-block ml-1 px-1 rounded bg-zinc-950/10 text-[10px] text-zinc-700">
              C
            </kbd>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full px-4 sm:px-8 xl:px-12">
        <div className="w-full pt-8 pb-12">
          {/* =========================================================================
              STATS CARDS: Unified Control Panel with bg-zinc-900/30 border-zinc-800/50 backdrop-blur-sm
          ========================================================================== */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            <div className="px-3 py-2 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Total
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-zinc-200">{stats.total}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Pending
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-amber-300">{stats.pending}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Completed
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-emerald-300">{stats.completed}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg border border-zinc-800 ring-1 ring-inset ring-white/10 bg-gradient-to-b from-zinc-800/50 to-zinc-900/50 flex items-center justify-between">
              <span className="text-xs text-zinc-400">
                Urgent
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-red-400">{stats.urgent}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              </div>
            </div>
          </div>

          {/* =========================================================================
              FILTER CONTROLS BAR: Tight Fluid Spacing with Radix Dropdowns
          ========================================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
            <div className="flex items-center gap-2">
              {/* Status Dropdown via Radix Select */}
              <CustomSelect<TaskFilterStatus>
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                placeholder="Filter Status"
                align="start"
                size="sm"
                buttonClassName="w-32 justify-between h-7 text-[11px]"
              />

              {/* Priority Dropdown via Radix Select */}
              <CustomSelect<TaskPriority | 'ALL'>
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={PRIORITY_OPTIONS}
                placeholder="All Priorities"
                align="start"
                size="sm"
                buttonClassName="w-32 justify-between h-7 text-[11px]"
              />
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64 rounded-lg border border-zinc-800/70 ring-1 ring-inset ring-white/5 bg-zinc-900/60 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all">
              <Search className="w-3 h-3 absolute start-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                placeholder="Filter tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-7 pe-6 py-1 bg-transparent border-0 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:outline-none focus:ring-0 h-7"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* =========================================================================
              TASK LIST: Seamless Flow with Beautiful Empty State
          ========================================================================== */}
          <div className="w-full">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-zinc-400 text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span>Loading tasks...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-6 mt-8 border border-dashed border-zinc-800/60 ring-1 ring-inset ring-white/10 rounded-2xl bg-gradient-to-b from-zinc-800/50 to-zinc-900/50">
                <ListTodo className="w-12 h-12 text-zinc-700 mb-4" />
                <h3 className="text-zinc-300 font-medium text-base mb-1">
                  {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                    ? 'No matching tasks'
                    : 'Clear runway'}
                </h3>
                <p className="text-zinc-400 text-sm max-w-sm mb-5 text-center leading-relaxed">
                  {searchQuery || priorityFilter !== 'ALL' || statusFilter !== 'all'
                    ? 'No tasks match your active filters. Try adjusting search or priority.'
                    : 'You have no tasks left to complete. Press C to quickly create a task or type /extract-tasks in any note.'}
                </p>
                <button
                  onClick={() => setIsQuickAddOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-200 transition-all duration-200 ease-out active:scale-[0.98] cursor-pointer border border-zinc-800 ring-1 ring-inset ring-white/10"
                >
                  Create Task
                </button>
              </div>
            ) : (
              <div className="w-full">
                {filteredTasks.map((task) => {
                  const dueDateObj = task.dueDate ? new Date(task.dueDate) : undefined;

                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={cn(
                        'group relative flex items-center gap-2.5 px-2 py-1.5 border-b border-zinc-800/80 transition-all duration-200 ease-out active:scale-[0.98] select-none cursor-pointer',
                        task.isCompleted
                          ? 'text-zinc-400 hover:bg-zinc-800/50'
                          : 'hover:bg-zinc-800/50 text-zinc-200'
                      )}
                    >
                      {/* Linear Checkbox Toggle */}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMutation.mutate(task.id);
                        }}
                        title={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                        className="cursor-pointer flex-shrink-0 transition-transform active:scale-95"
                      >
                        {task.isCompleted ? (
                          <div className="w-4 h-4 rounded-[5px] bg-zinc-100 flex items-center justify-center text-zinc-950 border border-zinc-200">
                            <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-[5px] bg-zinc-950 border border-zinc-700 group-hover:border-zinc-400 transition-colors duration-200 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-transparent group-hover:text-zinc-500 transition-colors stroke-[2.5]" />
                          </div>
                        )}
                      </button>

                      {/* Linear Priority Icon (Clickable Popover for inline update) */}
                      <div onClick={(event) => event.stopPropagation()}>
                        <PriorityPicker
                          value={task.priority}
                          onChange={(newPriority) =>
                            updateMutation.mutate({
                              taskId: task.id,
                              data: { priority: newPriority },
                            })
                          }
                          iconOnly
                        />
                      </div>

                      {/* Task Title & Description */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span
                          dir="auto"
                          className={cn(
                            'text-xs font-medium truncate text-start transition-all',
                            task.isCompleted
                              ? 'line-through text-zinc-500'
                              : 'text-zinc-200 group-hover:text-white'
                          )}
                        >
                          {task.title}
                        </span>

                        {task.description && (
                          <span dir="auto" className="text-[11px] text-zinc-400 truncate text-start hidden lg:inline min-w-0 flex-1">
                            — {task.description}
                          </span>
                        )}
                      </div>

                      {/* Linked Note Badge */}
                      {task.noteId && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/notes?noteId=${encodeURIComponent(task.noteId!)}`);
                          }}
                          title="Open parent note"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-900 hover:bg-zinc-800/50 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors duration-200 cursor-pointer flex-shrink-0"
                        >
                          <FileText className="w-3 h-3 text-zinc-500" />
                          <span dir="auto" className="truncate max-w-[10rem] xl:max-w-xs hidden sm:inline-block text-start">
                            {task.noteTitle || 'Note'}
                          </span>
                          <ArrowUpRight className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      )}

                      {/* Due Date Indicator (Clickable Popover for inline rescheduling) */}
                      <div onClick={(event) => event.stopPropagation()}>
                      <DatePickerPopover
                        date={dueDateObj}
                        onChange={(newDate) =>
                          updateMutation.mutate({
                            taskId: task.id,
                            data: { dueDate: newDate ? newDate.toISOString() : undefined },
                          })
                        }
                        size="sm"
                        placeholder="Add date"
                        buttonClassName="border-0 bg-transparent hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 h-6 px-1 text-[11px]"
                        showClearButton={false}
                      />
                      </div>

                      {/* Quick-action buttons (ONLY shown on row hover) */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteConfirmId(task.id);
                          }}
                          title="Delete task"
                          className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
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
      </div>

      {/* =========================================================================
          QUICK ADD MODAL (Command Palette Style Dialog via Radix)
      ========================================================================== */}
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />

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
