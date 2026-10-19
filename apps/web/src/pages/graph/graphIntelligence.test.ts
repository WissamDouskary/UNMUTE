import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, GraphNodeType } from '@unmute/api-client';
import { buildInsights, filterGraph, neighborhood, pageInsights, searchNodes } from './graphIntelligence';

const note: GraphNode = { id: 'note:a', entityId: 'a', type: 'NOTE', label: 'Interview notes', status: 'ACTIVE' };
const openTask: GraphNode = { id: 'task:1', entityId: 't1', type: 'TASK', label: 'Call Alex', status: 'OPEN' };
const doneTask: GraphNode = { id: 'task:2', entityId: 't2', type: 'TASK', label: 'Send notes', status: 'COMPLETED' };
const source: GraphNode = { id: 'source:s', entityId: 's', type: 'SOURCE', label: 'interview.pdf', status: 'COMPLETED' };
const tag: GraphNode = { id: 'tag:hiring', type: 'TAG', label: 'hiring' };
const alone: GraphNode = { id: 'note:alone', entityId: 'z', type: 'NOTE', label: 'Orphan', status: 'ACTIVE' };

const nodes = [note, openTask, doneTask, source, tag, alone];
const allTypes = new Set<GraphNodeType>(['NOTE', 'TASK', 'SOURCE', 'TAG']);

const edges: GraphEdge[] = [
  { id: 'e1', source: 'note:a', target: 'task:1', type: 'TASK_OF_NOTE', origin: 'EXPLICIT' },
  { id: 'e2', source: 'note:a', target: 'task:2', type: 'TASK_OF_NOTE', origin: 'EXPLICIT' },
  { id: 'e3', source: 'source:s', target: 'note:a', type: 'SOURCE_OF_NOTE', origin: 'EXPLICIT' },
  { id: 'e4', source: 'note:a', target: 'tag:hiring', type: 'NOTE_TAGGED', origin: 'EXPLICIT' },
  { id: 'e5', source: 'note:a', target: 'note:missing', type: 'RELATED_TO', origin: 'ACCEPTED' },
];

function neighborsOf(list: GraphEdge[]): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const next = neighbors.get(a) ?? new Set<string>();
    next.add(b);
    neighbors.set(a, next);
  };
  for (const edge of list) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  return neighbors;
}

describe('filterGraph', () => {
  it('keeps every node and drops an edge whose other end is not in the graph', () => {
    const visible = filterGraph({
      nodes,
      edges,
      visibleTypes: allTypes,
      openTasksOnly: false,
      hiddenEdgeTypes: new Set(),
    });

    expect(visible.nodes.map((node) => node.id)).toEqual(nodes.map((node) => node.id));
    expect(visible.links.map((link) => link.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('returns an empty graph when every node type is hidden', () => {
    const visible = filterGraph({
      nodes,
      edges,
      visibleTypes: new Set(),
      openTasksOnly: true,
      hiddenEdgeTypes: new Set(['TASK_OF_NOTE', 'SOURCE_OF_NOTE', 'NOTE_TAGGED', 'RELATED_TO']),
    });
    expect(visible.nodes).toEqual([]);
    expect(visible.links).toEqual([]);
  });

  it('hides completed tasks and the relationships that depended on them', () => {
    const visible = filterGraph({
      nodes,
      edges,
      visibleTypes: allTypes,
      openTasksOnly: true,
      hiddenEdgeTypes: new Set(),
    });

    expect(visible.nodes.map((node) => node.id)).not.toContain('task:2');
    expect(visible.links.map((link) => link.id)).toEqual(['e1', 'e3', 'e4']);
  });

  it('hides a relationship type without removing the nodes it joined', () => {
    const visible = filterGraph({
      nodes,
      edges,
      visibleTypes: allTypes,
      openTasksOnly: false,
      hiddenEdgeTypes: new Set(['NOTE_TAGGED', 'RELATED_TO']),
      suggestions: [{ id: 'sug-1', sourceKey: 'note:a', targetKey: 'note:alone' }],
    });

    expect(visible.nodes).toHaveLength(nodes.length);
    expect(visible.links.map((link) => link.type)).not.toContain('NOTE_TAGGED');
    expect(visible.links.map((link) => link.type)).not.toContain('RELATED_TO');
  });

  it('shows a pending suggestion only while both ends and Related are visible', () => {
    const shown = filterGraph({
      nodes,
      edges,
      visibleTypes: allTypes,
      openTasksOnly: false,
      hiddenEdgeTypes: new Set(),
      suggestions: [{ id: 'sug-1', sourceKey: 'note:a', targetKey: 'note:alone' }],
    });
    expect(shown.links).toContainEqual({
      id: 'pending:sug-1',
      type: 'RELATED_TO',
      origin: 'PENDING',
      source: 'note:a',
      target: 'note:alone',
    });

    const notesHidden = filterGraph({
      nodes,
      edges,
      visibleTypes: new Set<GraphNodeType>(['TASK', 'SOURCE', 'TAG']),
      openTasksOnly: false,
      hiddenEdgeTypes: new Set(),
      suggestions: [{ id: 'sug-1', sourceKey: 'note:a', targetKey: 'note:alone' }],
    });
    expect(notesHidden.links.map((link) => link.id)).not.toContain('pending:sug-1');
  });
});

describe('searchNodes', () => {
  it('returns nothing for a blank query', () => {
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });

  it('matches a label, a tag hash, and a status on the already filtered nodes', () => {
    const visible = filterGraph({
      nodes,
      edges,
      visibleTypes: allTypes,
      openTasksOnly: true,
      hiddenEdgeTypes: new Set(),
    });
    expect(searchNodes(visible.nodes, 'alex').map((node) => node.id)).toEqual(['task:1']);
    expect(searchNodes(visible.nodes, '#hiring').map((node) => node.id)).toEqual(['tag:hiring']);
    expect(searchNodes(nodes, 'completed').map((node) => node.id)).toEqual(['task:2', 'source:s']);
    expect(searchNodes(visible.nodes, 'completed').map((node) => node.id)).toEqual(['source:s']);
  });
});

describe('pageInsights', () => {
  const insights = Array.from({ length: 10 }, (_, index) => ({
    id: `idea-${index}`,
    title: 'Note without a task',
    detail: `Note ${index}`,
    nodeId: `note:${index}`,
  }));

  it('returns an empty page when there are no insights', () => {
    expect(pageInsights([], 0, 8)).toEqual({ items: [], total: 0, offset: 0, limit: 8 });
  });

  it('pages past the old cap of eight and returns nothing after the last page', () => {
    expect(pageInsights(insights, 0, 8).items).toHaveLength(8);
    expect(pageInsights(insights, 8, 8).items.map((item) => item.id)).toEqual(['idea-8', 'idea-9']);
    expect(pageInsights(insights, 16, 8).items).toEqual([]);
    expect(pageInsights(insights, 16, 8).total).toBe(10);
  });

  it('keeps every note without a task instead of stopping at eight', () => {
    const nodes: GraphNode[] = Array.from({ length: 9 }, (_, index) => ({
      id: `note:${index}`,
      type: 'NOTE',
      label: `Note ${index}`,
      status: 'ACTIVE',
    }));
    expect(buildInsights(nodes, new Map())).toHaveLength(18);
  });
});

describe('neighborhood', () => {
  const neighbors = neighborsOf(edges.filter((edge) => edge.id !== 'e5'));

  it('keeps an isolated node as a one-node focus set', () => {
    expect(neighborhood(neighbors, 'note:alone', 1)).toEqual(new Set(['note:alone']));
    expect(neighborhood(neighbors, 'note:alone', 3)).toEqual(new Set(['note:alone']));
  });

  it('includes every direct relationship at one hop and the next hop after that', () => {
    expect(neighborhood(neighbors, 'note:a', 1)).toEqual(
      new Set(['note:a', 'task:1', 'task:2', 'source:s', 'tag:hiring']),
    );
    neighbors.get('task:1')?.add('note:extra');
    expect(neighborhood(neighbors, 'note:a', 2)).toEqual(
      new Set(['note:a', 'task:1', 'task:2', 'source:s', 'tag:hiring', 'note:extra']),
    );
  });
});
