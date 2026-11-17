import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModelsManagerPage from '../ModelsManagerPage';

vi.mock('@/components/features/models/ModelsDashboard', () => ({
  default: ({ setSelectedModelId }: { setSelectedModelId: (id: string) => void }) => (
    <button onClick={() => setSelectedModelId('model')}>select model</button>
  ),
}));
vi.mock('@/components/features/models/ModelViewer', () => ({ default: () => <div>model</div> }));
vi.mock('@/components/features/canvasViewer/QuickCanvasViewer', () => ({
  default: () => <div>canvas viewer</div>,
}));

describe('ModelsManagerPage', () => {
  it('toggles the canvas panel from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ModelsManagerPage />);
    await user.click(screen.getByRole('button', { name: 'select model' }));
    const toggle = screen.getByRole('button', { name: 'btn_toggle_canvas_view' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('canvas viewer')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('canvas viewer')).not.toBeInTheDocument();
  });
});
