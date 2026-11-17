import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CanvasViewerText from '../CanvasViewerText';

vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 400, height: 300 }),
}));
vi.mock('@annotorious/react', () => ({ useHover: () => null }));
vi.mock('@/data/utils/export', () => ({
  generateTextWithAnnotationIdFromCanvas: vi
    .fn()
    .mockResolvedValue([{ text: 'Texte annoté', annotationId: 'annotation-1' }]),
}));

describe('CanvasViewerText', () => {
  it('enables annotation highlighting and focuses text from the keyboard', async () => {
    const user = userEvent.setup();
    const setHovered = vi.fn();
    render(
      <CanvasViewerText scope={{ collectionId: 'c', canvasId: 'p' }} setHovered={setHovered} />,
    );
    const line = await screen.findByText('Texte annoté');
    expect(line).not.toHaveAttribute('tabindex');
    await user.tab();
    const toggle = screen.getByRole('button', { name: 'btn_highlight_text_annotation' });
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    expect(line).toHaveFocus();
    expect(setHovered).toHaveBeenLastCalledWith('annotation-1');
    await user.tab();
    expect(setHovered).toHaveBeenLastCalledWith(null);
  });
});
