import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DocumentationPage from '../DocumentationPage';

vi.mock('@/components/features/documentation/DocSideBar', () => ({ default: () => null }));
vi.mock('@/hooks/ui/useReducedMotion', () => ({ default: () => false }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('DocumentationPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['http', 'réseau'])('signale une erreur %s à l’utilisateur', async (failure) => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
      },
    );
    vi.stubGlobal(
      'fetch',
      failure === 'http'
        ? vi.fn().mockResolvedValue({ ok: false })
        : vi.fn().mockRejectedValue(new TypeError('network')),
    );
    render(
      <MemoryRouter initialEntries={['/doc/test']}>
        <Routes>
          <Route path='/doc/:page' element={<DocumentationPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('error_loading_documentation'));
    expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}doc/test.md`);
  });
});
