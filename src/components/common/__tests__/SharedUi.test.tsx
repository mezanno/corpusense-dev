import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddCardButton from '../AddCardButton';
import CanvasNavigation from '../CanvasNavigation';
import GalleryThumbnail from '../GalleryThumbnail';
import ProgressPanel from '../logger/ProgressPanel';

describe('shared UI', () => {
  it('activates an add card with the keyboard and respects disabled state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<AddCardButton label='Ajouter' onClick={onClick} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<AddCardButton label='Ajouter' onClick={onClick} disabled />);
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  });

  it('only shows available navigation and invokes the matching callback', async () => {
    const user = userEvent.setup();
    const previous = vi.fn();
    const next = vi.fn();
    const { rerender } = render(
      <CanvasNavigation hasPrevious={false} hasNext onPrevious={previous} onNext={next} />,
    );
    expect(screen.queryByRole('button', { name: 'btn_previous_canvas' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'btn_next_canvas' }));
    expect(next).toHaveBeenCalledOnce();
    rerender(<CanvasNavigation hasPrevious hasNext={false} onPrevious={previous} onNext={next} />);
    await user.click(screen.getByRole('button', { name: 'btn_previous_canvas' }));
    expect(previous).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'btn_next_canvas' })).not.toBeInTheDocument();
  });

  it('shows loading until the current thumbnail loads and displays errors', () => {
    const { rerender } = render(
      <GalleryThumbnail url='/one.jpg' isLoading={false} error={null} alt='Page' />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.load(screen.getByRole('img', { name: 'Page' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<GalleryThumbnail url='/two.jpg' isLoading={false} error={null} alt='Page' />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.error(screen.getByRole('img', { name: 'Page' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<GalleryThumbnail isLoading={false} error='Erreur' alt='Page' />);
    expect(screen.getByText('Erreur')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('reports the current progress', () => {
    render(<ProgressPanel progress={42} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });
});
