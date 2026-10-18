import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckSquare, Sparkles, X } from 'lucide-react';
import { apiClient, type GraphEdge, type GraphNode, type GraphNodeType, type Note, type Source, type Task } from '@unmute/api-client';
import { EDGE_META, edgeBetween } from './graphIntelligence';

type InspectNode = GraphNode & { id: string };

const TYPE_COLOR: Record<GraphNodeType, string> = {
  NOTE: '#a78bfa',
  TASK: '#34d399',
  SOURCE: '#fbbf24',
  TAG: '#38bdf8',
};

function preview(value?: string | null): string {
  if (!value) return '';
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 280 ? `${text.slice(0, 277)}…` : text;
}

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GraphInspector({
  node,
  nodes,
  edges,
  neighborIds,
  onSelect,
  onOpen,
  onAsk,
  onClose,
}: {
  node: InspectNode;
  nodes: Map<string, InspectNode>;
  edges: GraphEdge[];
  neighborIds: string[];
  onSelect: (id: string) => void;
  onOpen: () => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmTask, setConfirmTask] = useState(false);
  const [copied, setCopied] = useState(false);
  const entityId = node.entityId ?? null;

  const detail = useQuery({
    queryKey: ['graph-inspector', node.type, entityId],
    enabled: !!entityId && node.type !== 'TAG',
    queryFn: async (): Promise<Note | Task | Source> => {
      if (node.type === 'NOTE') return apiClient.getNote(entityId!);
      if (node.type === 'TASK') return apiClient.getTask(entityId!);
      return apiClient.getSource(entityId!);
    },
  });

  const createTask = useMutation({
    mutationFn: () =>
      apiClient.createTask({
        title: node.label || 'Follow up',
        noteId: node.type === 'NOTE' ? entityId! : undefined,
      }),
    onSuccess: () => {
      setConfirmTask(false);
      void queryClient.invalidateQueries({ queryKey: ['graph'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const note = node.type === 'NOTE' ? (detail.data as Note | undefined) : undefined;
  const task = node.type === 'TASK' ? (detail.data as Task | undefined) : undefined;
  const source = node.type === 'SOURCE' ? (detail.data as Source | undefined) : undefined;
  const body = preview(note?.summary || note?.content || task?.description || source?.transcript);
  const linked = neighborIds
    .map((id) => nodes.get(id))
    .filter((item): item is InspectNode => !!item);

  const copyRef = async () => {
    await navigator.clipboard.writeText(entityId ?? node.id);
    setCopied(true);
  };

  return (
    <aside className="absolute z-20 flex flex-col overflow-hidden border-zinc-800 bg-zinc-950/95 backdrop-blur max-md:inset-x-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:max-h-[55dvh] max-md:rounded-t-2xl max-md:border-t md:bottom-0 md:right-0 md:top-16 md:w-80 md:border-l">
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-600 md:hidden" aria-hidden />
      <div className="flex items-start gap-2 border-b border-zinc-800 px-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{node.type}</p>
          <h2 className="truncate text-sm font-medium text-zinc-100">{node.type === 'TAG' ? `#${node.label}` : node.label}</h2>
          {node.status && <p className="mt-1 text-xs text-zinc-400">{node.status}{node.priority ? ` · ${node.priority}` : ''}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector" className="flex min-h-11 min-w-11 items-center justify-center text-zinc-400 md:min-h-0 md:min-w-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm text-zinc-300">
        {detail.isLoading && <p className="text-xs text-zinc-500">Loading details…</p>}
        {detail.isError && <p className="text-xs text-zinc-500">The original record could not be loaded.</p>}
        {note && (
          <div className="space-y-1 text-xs text-zinc-400">
            {formatWhen(note.createdAt) && <p>Created {formatWhen(note.createdAt)}</p>}
            {formatWhen(note.updatedAt) && <p>Updated {formatWhen(note.updatedAt)}</p>}
            {note.tags.length > 0 && <p>{note.tags.map((tag) => `#${tag}`).join(' ')}</p>}
          </div>
        )}
        {task && (
          <div className="space-y-1 text-xs text-zinc-400">
            <p>{task.isCompleted ? 'Completed' : 'Open'}</p>
            {task.dueDate && <p>Due {formatWhen(task.dueDate)}</p>}
            {!task.dueDate && <p>No due date</p>}
          </div>
        )}
        {source && (
          <div className="space-y-1 text-xs text-zinc-400">
            <p>{source.fileType} · {source.status}</p>
            {formatWhen(source.createdAt) && <p>Added {formatWhen(source.createdAt)}</p>}
          </div>
        )}
        {body && <p className="text-sm leading-relaxed text-zinc-300">{body}</p>}
        {!body && !detail.isLoading && node.type !== 'TAG' && <p className="text-xs text-zinc-500">No preview is stored for this item.</p>}

        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Relationships</p>
          {linked.length === 0 && <p className="text-xs text-zinc-500">Nothing links here yet.</p>}
          <ul className="space-y-1">
            {linked.map((item) => {
              const edge = edgeBetween(edges, node.id, item.id as string);
              const meta = edge ? EDGE_META[edge.type] : null;
              return (
                <li key={item.id as string}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id as string)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-800/70"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TYPE_COLOR[item.type] }} />
                    <span className="min-w-0 flex-1 truncate text-zinc-200">{item.type === 'TAG' ? `#${item.label}` : item.label}</span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{meta?.label ?? item.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-zinc-800 p-2">
        {node.type !== 'TAG' && (
          <button type="button" onClick={onOpen} className="flex min-h-11 items-center justify-between rounded-lg px-2 text-xs text-zinc-100 hover:bg-zinc-800/70">
            Open {node.type.toLowerCase()}
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        )}
        <button type="button" onClick={onAsk} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-zinc-100 hover:bg-zinc-800/70">
          <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
          Ask UNMUTE
        </button>
        {node.type === 'NOTE' && entityId && !confirmTask && (
          <button type="button" onClick={() => setConfirmTask(true)} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-zinc-100 hover:bg-zinc-800/70">
            <CheckSquare className="h-3.5 w-3.5 text-zinc-400" />
            Create task
          </button>
        )}
        {confirmTask && (
          <div className="rounded-lg border border-zinc-800 p-2 text-xs text-zinc-400">
            <p>Create a task titled “{node.label || 'Follow up'}”?</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => createTask.mutate()} disabled={createTask.isPending} className="min-h-11 rounded-lg bg-zinc-100 px-3 text-zinc-950">
                {createTask.isPending ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => setConfirmTask(false)} className="min-h-11 rounded-lg px-3 text-zinc-300">
                Cancel
              </button>
            </div>
          </div>
        )}
        <button type="button" onClick={() => void copyRef()} className="flex min-h-11 items-center rounded-lg px-2 text-xs text-zinc-400 hover:bg-zinc-800/70">
          {copied ? 'Copied' : 'Copy reference'}
        </button>
      </div>
    </aside>
  );
}
