import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelCard } from '../ModelCard';

const { openDialog, exportModel } = vi.hoisted(() => ({
  openDialog: vi.fn(),
  exportModel: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/components/reducers/useAlertDialogContext', () => ({
  useAlertDialogContext: () => ({ openDialog }),
}));
vi.mock('@/hooks/data/models/useModelIO', () => ({
  useModelIO: () => ({ removeModel: vi.fn(), exportModel }),
}));

describe('ModelCard', () => {
  it('selects by keyboard without selecting when an action is activated', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelCard
        model={{
          id: 'm1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          name: 'Modèle',
          prompt: '',
          fields: [],
        }}
        selectedModelId={null}
        setSelectedModelId={onSelect}
      />,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Modèle' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('m1');
    await user.tab();
    await user.keyboard(' ');
    expect(openDialog).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(exportModel).toHaveBeenCalledExactlyOnceWith('m1');
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
