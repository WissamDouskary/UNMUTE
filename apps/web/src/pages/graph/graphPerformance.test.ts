import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@unmute/api-client';
import { buildInsights, filterGraph, neighborhood } from './graphIntelligence';
import { inboxPhase } from '../inbox/inboxPhase';

function graph(size: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let index = 0; index < size; index += 1) {
    const noteId = `note:${index}`;
    nodes.push({ id: noteId, type: 'NOTE', label: `Note ${index}`, status: 'ACTIVE' });
    if (index % 2 === 0) {
      const taskId = `task:${index}`;
      nodes.push({ id: taskId, type: 'TASK', label: `Task ${index}`, status: 'OPEN' });
      edges.push({ id: `e:${index}`, source: noteId, target: taskId, type: 'TASK_OF_NOTE', origin: 'EXPLICIT' });
    }
    if (index > 0 && index % 5 === 0) {
      edges.push({
        id: `r:${index}`,
        source: noteId,
        target: `note:${index - 1}`,
        type: 'RELATED_TO',
        origin: 'ACCEPTED',
      });
    }
  }
  return { nodes, edges };
}

function neighborsOf(edges: GraphEdge[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const next = neighbors.get(a) ?? new Set<string>();
    next.add(b);
    neighbors.set(a, next);
  };
  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  return neighbors;
}

describe('graph and inbox baselines', () => {
  it.each([100, 500, 1000, 5000])('filters and scores a graph of %i notes', (notes) => {
    const data = graph(notes);
    const started = performance.now();
    const visible = filterGraph({
      nodes: data.nodes,
      edges: data.edges,
      visibleTypes: new Set(['NOTE', 'TASK', 'SOURCE', 'TAG']),
      openTasksOnly: false,
      hiddenEdgeTypes: new Set(['NOTE_TAGGED']),
    });
    const neighbors = neighborsOf(data.edges);
    const focus = neighborhood(neighbors, visible.nodes[0]?.id ?? '', 2);
    const insights = buildInsights(visible.nodes, neighbors);
    const elapsed = performance.now() - started;
    console.log(`GRAPH_${notes}_MS ${elapsed.toFixed(1)} nodes=${visible.nodes.length} insights=${insights.length} focus=${focus.size}`);
    expect(visible.nodes.length).toBeGreaterThan(notes);
    expect(elapsed).toBeLessThan(5000);
  });

  it('classifies two thousand inbox sources', () => {
    const statuses = Array.from({ length: 2000 }, (_, index) =>
      index % 11 === 0 ? 'READY' as const : index % 17 === 0 ? 'FAILED' as const : 'COMPLETED' as const,
    );
    const started = performance.now();
    const phases = statuses.map((status) => inboxPhase(status, status === 'COMPLETED' ? 'note' : null));
    const elapsed = performance.now() - started;
    console.log(`INBOX_2000_MS ${elapsed.toFixed(1)}`);
    expect(phases.filter((phase) => phase === 'ready')).toHaveLength(statuses.filter((status) => status === 'READY').length);
    expect(elapsed).toBeLessThan(1000);
  });
});
