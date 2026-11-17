import { render, screen } from '@testing-library/react';
import { Archive } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
  it('rend un unique titre de niveau 1 avec son icône masquée', () => {
    const { container } = render(<PageHeader title='Mes documents locaux' icon={Archive} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mes documents locaux' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('expose les actions dans l’en-tête, à la suite du titre', () => {
    const onClick = vi.fn();
    render(
      <PageHeader
        title='Collections'
        actions={
          <button type='button' onClick={onClick}>
            Créer
          </button>
        }
      />,
    );
    const action = screen.getByRole('button', { name: 'Créer' });
    expect(action.closest('header')).not.toBeNull();
  });
});
