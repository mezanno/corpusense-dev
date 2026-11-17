import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AsyncState from '../AsyncState';

describe('AsyncState', () => {
  it('affiche successivement chargement, état vide et contenu', () => {
    const { rerender } = render(
      <AsyncState isLoading isEmpty emptyMessage='Liste vide'>
        Contenu
      </AsyncState>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('info_loading');
    expect(screen.queryByText('Liste vide')).not.toBeInTheDocument();

    rerender(
      <AsyncState isLoading={false} isEmpty emptyMessage='Liste vide'>
        Contenu
      </AsyncState>,
    );
    expect(screen.getByText('Liste vide')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <AsyncState isLoading={false} isEmpty={false} emptyMessage='Liste vide'>
        Contenu
      </AsyncState>,
    );
    expect(screen.getByText('Contenu')).toBeInTheDocument();
    expect(screen.queryByText('Liste vide')).not.toBeInTheDocument();
  });
});
