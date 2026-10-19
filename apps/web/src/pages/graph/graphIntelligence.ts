import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeType } from '@unmute/api-client';

export const EDGE_META: Record<GraphEdgeType, { label: string; detail: string; dashed: boolean }> = {
  TASK_OF_NOTE: { label: 'Task of note', detail: 'This task is saved on the note.', dashed: false },
  SOURCE_OF_NOTE: { label: 'Source of note', detail: 'This source produced the note.', dashed: false },
  NOTE_TAGGED: { label: 'Tagged', detail: 'The note carries this tag.', dashed: true },
  RELATED_TO: { label: 'Related', detail: 'You confirmed these notes belong together.', dashed: false },
};

export function neighborhood(neighbors: Map<string, Set<string>>, start: string, depth: number): Set<string> {
  const seen = new Set<string>([start]);
  let edge = [start];
  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const id of edge) {
      for (const other of neighbors.get(id) ?? []) {
        if (seen.has(other)) continue;
        seen.add(other);
        next.push(other);
      }
    }
    edge = next;
  }
  return seen;
}

export function edgeBetween(edges: GraphEdge[], a: string, b: string): GraphEdge | undefined {
  return edges.find(
    (edge) =>
      (edge.source === a && edge.target === b) || (edge.source === b && edge.target === a),
  );
}

export function searchNodes<T extends { id: string; label: string; type: GraphNodeType; status?: string | null }>(
  nodes: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return nodes.filter((node) => {
    const label = node.type === 'TAG' ? `#${node.label}` : node.label;
    return label.toLowerCase().includes(q) || (node.status ?? '').toLowerCase().includes(q);
  });
}

export interface FilteredLink {
  id: string;
  type: GraphEdgeType;
  origin: string;
  source: string;
  target: string;
}

/** The same node and relationship filter the graph page applies before layout. */
export function filterGraph<T extends GraphNode>(input: {
  nodes: T[];
  edges: GraphEdge[];
  visibleTypes: ReadonlySet<GraphNodeType>;
  openTasksOnly: boolean;
  hiddenEdgeTypes: ReadonlySet<GraphEdgeType>;
  suggestions?: ReadonlyArray<{ id: string; sourceKey: string; targetKey: string }>;
}): { nodes: T[]; links: FilteredLink[] } {
  const nodes = input.nodes.filter((node) => {
    if (!input.visibleTypes.has(node.type)) return false;
    if (input.openTasksOnly && node.type === 'TASK' && node.status !== 'OPEN') return false;
    return true;
  });
  const visible = new Set(nodes.map((node) => node.id));
  const links: FilteredLink[] = input.edges
    .filter((edge) => visible.has(edge.source) && visible.has(edge.target) && !input.hiddenEdgeTypes.has(edge.type))
    .map((edge) => ({
      id: edge.id,
      type: edge.type,
      origin: edge.origin ?? 'EXPLICIT',
      source: edge.source,
      target: edge.target,
    }));
  for (const suggestion of input.suggestions ?? []) {
    if (input.hiddenEdgeTypes.has('RELATED_TO')) continue;
    if (!visible.has(suggestion.sourceKey) || !visible.has(suggestion.targetKey)) continue;
    links.push({
      id: `pending:${suggestion.id}`,
      type: 'RELATED_TO',
      origin: 'PENDING',
      source: suggestion.sourceKey,
      target: suggestion.targetKey,
    });
  }
  return { nodes, links };
}

export interface GraphInsight {
  id: string;
  title: string;
  detail: string;
  nodeId: string;
}

export function buildInsights(nodes: GraphNode[], neighbors: Map<string, Set<string>>): GraphInsight[] {
  const insights: GraphInsight[] = [];
  for (const node of nodes) {
    const links = neighbors.get(node.id) ?? new Set<string>();
    const linked = [...links].map((id) => nodes.find((item) => item.id === id)).filter(Boolean) as GraphNode[];
    if (node.type === 'NOTE' && !linked.some((item) => item.type === 'TASK')) {
      insights.push({
        id: `idea-${node.id}`,
        title: 'Note without a task',
        detail: node.label || 'Untitled note',
        nodeId: node.id,
      });
    }
    if (links.size === 0) {
      insights.push({
        id: `orphan-${node.id}`,
        title: 'Nothing linked yet',
        detail: `${node.type.toLowerCase()} · ${node.label}`,
        nodeId: node.id,
      });
    }
    if (node.type === 'TAG' && links.size >= 2) {
      insights.push({
        id: `theme-${node.id}`,
        title: `Theme #${node.label}`,
        detail: `${links.size} notes use this tag`,
        nodeId: node.id,
      });
    }
  }
  const openTasks = nodes.filter((node) => node.type === 'TASK' && node.status === 'OPEN');
  const byNote = new Map<string, GraphNode[]>();
  for (const task of openTasks) {
    const noteId = [...(neighbors.get(task.id) ?? [])].find((id) => id.startsWith('note:'));
    if (!noteId) continue;
    const group = byNote.get(noteId) ?? [];
    group.push(task);
    byNote.set(noteId, group);
  }
  for (const [noteId, tasks] of byNote) {
    const first = tasks[0];
    if (tasks.length < 2 || !first) continue;
    const note = nodes.find((item) => item.id === noteId);
    insights.push({
      id: `open-${noteId}`,
      title: 'Related open tasks',
      detail: `${tasks.length} open tasks on ${note?.label ?? 'one note'}`,
      nodeId: first.id,
    });
  }
  return insights;
}

export const INSIGHT_PAGE_SIZE = 8;

/** One page of insights. An offset past the end is an empty page, not a wrapped page. */
export function pageInsights(insights: GraphInsight[], offset: number, limit: number): {
  items: GraphInsight[];
  total: number;
  offset: number;
  limit: number;
} {
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : INSIGHT_PAGE_SIZE;
  const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return {
    items: insights.slice(start, start + size),
    total: insights.length,
    offset: start,
    limit: size,
  };
}
