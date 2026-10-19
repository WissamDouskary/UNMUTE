import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GraphEdge, GraphNode, Note } from '@unmute/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphInspector } from './GraphInspector';

vi.mock('@unmute/api-client', () => ({
  apiClient: {
    getNote: vi.fn(),
    getTask: vi.fn(),
    getSource: vi.fn(),
    createTask: vi.fn(),
  },
}));

import { apiClient } from '@unmute/api-client';

const note: GraphNode & { id: string } = {
  id: 'note:a',
  entityId: 'a',
  type: 'NOTE',
  label: 'Interview notes',
  status: 'ACTIVE',
};
const task: GraphNode & { id: string } = {
  id: 'task:1',
  entityId: 't1',
  type: 'TASK',
  label: 'Call Alex',
  status: 'OPEN',
};
const tag: GraphNode & { id: string } = {
  id: 'tag:hiring',
  type: 'TAG',
  label: 'hiring',
};

const record: Note = {
  id: 'a',
  title: 'Interview notes',
  content: '<p>Call Alex tomorrow.</p>',
  summary: null,
  isPinned: false,
  isArchived: false,
  tags: ['hiring'],
  createdAt: '2026-10-18T12:00:00Z',
  updatedAt: '2026-10-18T12:00:00Z',
};

const edges: GraphEdge[] = [
  { id: 'e1', source: 'note:a', target: 'task:1', type: 'TASK_OF_NOTE' },
  { id: 'e2', source: 'note:a', target: 'tag:hiring', type: 'NOTE_TAGGED' },
];

function renderInspector(neighborIds: string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GraphInspector
        node={note}
        nodes={new Map([
          [note.id, note],
          [task.id, task],
          [tag.id, tag],
        ])}
        edges={edges}
        neighborIds={neighborIds}
        onSelect={onSelect}
        onOpen={vi.fn()}
        onAsk={vi.fn()}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { onSelect };
}

describe('GraphInspector', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getNote).mockReset();
  });

  it('opens the selected note and lists each relationship', async () => {
    vi.mocked(apiClient.getNote).mockResolvedValue(record);
    const { onSelect } = renderInspector(['task:1', 'tag:hiring']);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: 'Interview notes' })).toBeInTheDocument();
    expect(screen.getByText('NOTE')).toBeInTheDocument();
    expect(await screen.findByText('Call Alex tomorrow.')).toBeInTheDocument();
    expect(screen.getAllByText('#hiring').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Call Alex/ }));
    expect(onSelect).toHaveBeenCalledWith('task:1');
    expect(screen.getByRole('button', { name: /#hiring/ })).toHaveTextContent('Tagged');
    expect(apiClient.getNote).toHaveBeenCalledTimes(1);
    expect(apiClient.getNote).toHaveBeenCalledWith('a');
  });

  it('says when the selected node has no relationships', async () => {
    vi.mocked(apiClient.getNote).mockResolvedValue(record);
    renderInspector([]);

    expect(await screen.findByText('Nothing links here yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Call Alex/ })).not.toBeInTheDocument();
  });

  it('says when the original record cannot be loaded', async () => {
    vi.mocked(apiClient.getNote).mockRejectedValue(new Error('not found'));
    renderInspector(['task:1']);

    expect(await screen.findByText('The original record could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Interview notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Call Alex/ })).toBeInTheDocument();
  });
});
