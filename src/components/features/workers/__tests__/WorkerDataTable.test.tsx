import { Worker, WorkerStatus } from '@/data/models/worker/worker';
import { ColumnDef } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkerDataTable from '../WorkerDataTable';

describe('WorkerDataTable', () => {
  it('selects a worker by keyboard without activating the row action', async () => {
    const selectWorker = vi.fn();
    const rowAction = vi.fn();
    const worker: Worker = {
      id: 'worker-1',
      name: 'Traitement',
      scope: { collectionId: 'collection-1' },
      scopeKey: 'collection-1',
      params: {},
      status: WorkerStatus.COMPLETED,
      createdAt: '2026-01-01T00:00:00Z',
      estimatedDuration: 0,
      queue: [],
    };
    const columns: ColumnDef<Worker>[] = [
      { accessorKey: 'id' },
      { accessorKey: 'name' },
      { id: 'actions', cell: () => <button onClick={rowAction}>action</button> },
    ];
    const user = userEvent.setup();
    render(
      <WorkerDataTable data={[worker]} columns={columns} setSelectedWorkerId={selectWorker} />,
    );
    const button = screen.getByRole('button', { name: 'Traitement' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(selectWorker).toHaveBeenCalledExactlyOnceWith('worker-1');
    expect(rowAction).not.toHaveBeenCalled();
  });
});
