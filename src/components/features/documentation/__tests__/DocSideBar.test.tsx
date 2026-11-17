import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocsSidebar from '../DocSideBar';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('DocsSidebar', () => {
  afterEach(() => vi.restoreAllMocks());

  it('charge le sommaire depuis la base de l’application même sur une sous-route', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([{ slug: 'howto', title: 'Manuel' }]), { status: 200 }),
      );
    render(
      <MemoryRouter initialEntries={['/doc/howto']}>
        <DocsSidebar />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Manuel' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}doc/index.json`);
  });

  it('signale une erreur HTTP du sommaire', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    render(
      <MemoryRouter>
        <DocsSidebar />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('error_loading_documentation_index'),
    );
  });
});
