import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { WorkerStatus } from '@/data/models/worker/worker';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import WorkersManagerPage from '../WorkersManagerPage';

vi.mock('@/components/reducers/WorkerContext', () => ({ useWorkerContext: vi.fn() }));
vi.mock('@/components/features/workers/WorkerTable', () => ({ default: () => null }));

describe('WorkersManagerPage', () => {
  it('filtre les statuts à la souris et au clavier sans double bascule', async () => {
    const getWorkersByStatus = vi.fn().mockReturnValue([]);
    vi.mocked(useWorkerContext).mockReturnValue({
      workers: [],
      getWorkersByStatus,
      getWorkerById: vi.fn(),
      getTaskById: vi.fn(),
      getStatus: vi.fn(),
      isWorkerOrTaskRunning: vi.fn(),
      hasResult: vi.fn(),
      getWorkersByScope: vi.fn(),
      getWorkersByScopeAndStatus: vi.fn(),
      getWorkersWithTrackedJobs: vi.fn(),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <WorkersManagerPage />
      </MemoryRouter>,
    );

    const all = screen.getByRole('checkbox', { name: 'worker_status_all' });
    expect(all).toBeChecked();
    await user.click(all);
    expect(all).not.toBeChecked();
    expect(getWorkersByStatus).toHaveBeenLastCalledWith([]);

    all.focus();
    await user.keyboard(' ');
    expect(all).toBeChecked();
    expect(getWorkersByStatus).toHaveBeenLastCalledWith(Object.values(WorkerStatus));

    const firstStatus = Object.values(WorkerStatus)[0];
    const checkbox = screen.getByRole('checkbox', { name: `worker_status_${firstStatus}` });
    await user.click(screen.getByText(`worker_status_${firstStatus}`));
    expect(checkbox).not.toBeChecked();
    expect(all).not.toBeChecked();
    expect(getWorkersByStatus).toHaveBeenLastCalledWith(
      Object.values(WorkerStatus).filter((status) => status !== firstStatus),
    );
  });
});
