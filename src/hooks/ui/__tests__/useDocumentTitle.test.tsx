import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import useDocumentTitle from '../useDocumentTitle';

const language = vi.hoisted(() => ({
  language: 'fr',
  resolvedLanguage: 'fr',
  listener: undefined as (() => void) | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `${language.language}:${key}`,
    i18n: {
      get language() {
        return language.language;
      },
      get resolvedLanguage() {
        return language.resolvedLanguage;
      },
      on: (_event: string, listener: () => void) => {
        language.listener = listener;
      },
      off: () => {
        language.listener = undefined;
      },
    },
  }),
}));

function Page() {
  useDocumentTitle();
  return <Link to='/workers/123'>Workers</Link>;
}

describe('useDocumentTitle', () => {
  it('updates the title on navigation and syncs the document language', async () => {
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={['/collections/123']}>
        <Page />
      </MemoryRouter>,
    );
    expect(document.title).toBe('fr:page_title_collection_manager | CorpuSense');
    expect(document.documentElement.lang).toBe('fr');
    await user.click(screen.getByRole('link', { name: 'Workers' }));
    expect(document.title).toBe('fr:page_title_workers_manager | CorpuSense');
    language.language = 'en';
    language.resolvedLanguage = 'en';
    act(() => language.listener?.());
    view.rerender(
      <MemoryRouter initialEntries={['/collections/123']}>
        <Page />
      </MemoryRouter>,
    );
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('en:page_title_workers_manager | CorpuSense');
    view.unmount();
    expect(language.listener).toBeUndefined();
    language.language = 'fr';
    language.resolvedLanguage = 'fr';
  });
});
