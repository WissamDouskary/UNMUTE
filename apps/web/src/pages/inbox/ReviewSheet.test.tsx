import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import type { Source } from '@unmute/api-client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewSheet } from './ReviewSheet';

vi.mock('@unmute/api-client', () => ({
  apiClient: {
    approveCapture: vi.fn(),
    deleteSource: vi.fn(),
  },
}));

import { apiClient } from '@unmute/api-client';

const ready: Source = {
  id: 'src-1',
  filename: 'interview.pdf',
  originalName: 'interview.pdf',
  fileType: 'application/pdf',
  fileSize: 1200,
  status: 'READY',
  reviewPayload: {
    summary: 'Call Alex tomorrow about the role.',
    tasks: [
      { title: 'Call Alex', description: 'Tomorrow' },
      { title: 'Send notes', description: 'After the call' },
    ],
    tags: ['hiring'],
  },
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
};

function renderSheet(props: Partial<ComponentProps<typeof ReviewSheet>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReviewSheet source={ready} loading={false} missing={false} onClose={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReviewSheet', () => {
  beforeEach(() => {
    vi.mocked(apiClient.approveCapture).mockReset();
  });

  it('shows the review payload and keeps only the tasks that stay selected', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.approveCapture).mockResolvedValue(ready);
    renderSheet();

    expect(screen.getByRole('heading', { name: 'Review capture' })).toBeInTheDocument();
    expect(screen.getAllByText('Call Alex tomorrow about the role.')).toHaveLength(2);
    expect(screen.getByLabelText('Title')).toHaveValue('interview');
    expect(screen.getByLabelText('Note')).toHaveValue('Call Alex tomorrow about the role.');
    expect(screen.getByRole('button', { name: '#hiring ×' })).toBeInTheDocument();

    const toggles = screen.getAllByRole('button', { pressed: true });
    await user.click(toggles[0]!);
    await user.click(screen.getByRole('button', { name: 'Approve & Save' }));

    expect(apiClient.approveCapture).toHaveBeenCalledTimes(1);
    expect(apiClient.approveCapture).toHaveBeenCalledWith('src-1', {
      title: 'interview',
      body: 'Call Alex tomorrow about the role.',
      tasks: [{ title: 'Send notes', description: 'After the call' }],
      tags: ['hiring'],
    });
  });

  it('shows loading, missing, and empty suggestion states', () => {
    const { rerender } = renderSheet({ source: null, loading: true });
    expect(screen.getByText('Loading capture…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ReviewSheet source={null} loading={false} missing onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('This capture is no longer available.')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ReviewSheet
            source={{
              ...ready,
              id: 'src-empty',
              reviewPayload: { summary: '', tasks: [], tags: [] },
              transcript: null,
            }}
            loading={false}
            missing={false}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('No tag suggestions.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve & Save' })).toBeDisabled();
  });

  it('does not send a second approval while the first is still saving', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.approveCapture).mockReturnValue(new Promise<Source>(() => {}));
    renderSheet();

    const save = screen.getByRole('button', { name: 'Approve & Save' });
    await user.click(save);

    expect(save).toBeDisabled();
    expect(apiClient.approveCapture).toHaveBeenCalledTimes(1);
  });

  it('shows the server error and leaves the capture unsaved', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.approveCapture).mockRejectedValue(new Error('The title cannot exceed 255 characters.'));
    renderSheet();

    await user.click(screen.getByRole('button', { name: 'Approve & Save' }));

    expect(await screen.findByText('The title cannot exceed 255 characters.')).toBeInTheDocument();
    expect(apiClient.approveCapture).toHaveBeenCalledTimes(1);
  });
});
