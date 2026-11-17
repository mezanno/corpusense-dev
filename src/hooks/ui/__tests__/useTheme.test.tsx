import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTheme, {
  THEME_MODE_STORAGE_KEY,
  THEME_PALETTE_STORAGE_KEY,
  ThemeProvider,
} from '../useTheme';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

function mockPrefersDark(initially: boolean) {
  let matches = initially;
  let listener: EventListenerOrEventListenerObject | null = null;
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    media: query,
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: string, callback: EventListenerOrEventListenerObject | null) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  return {
    setMatch: (value: boolean) => {
      matches = value;
    },
    emit: () => {
      act(() => {
        if (typeof listener === 'function') listener(new Event('change'));
        else if (listener) listener.handleEvent(new Event('change'));
      });
    },
  };
}

const html = document.documentElement;

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    html.removeAttribute('data-theme');
    html.removeAttribute('data-palette');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("pose data-palette='heritage' et le mode résolu dès le montage, sans préférence stockée", () => {
    mockPrefersDark(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('system');
    expect(result.current.palette).toBe('heritage');
    expect(result.current.resolvedMode).toBe('light');
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(html.getAttribute('data-palette')).toBe('heritage');
  });

  it("applique le mode stocké et le persiste lors d'un changement", () => {
    mockPrefersDark(false);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedMode).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');

    act(() => result.current.setMode('light'));
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('light');
  });

  it('suit prefers-color-scheme en mode système sans écraser la préférence', () => {
    const system = mockPrefersDark(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedMode).toBe('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');

    system.setMatch(false);
    system.emit();
    expect(result.current.resolvedMode).toBe('light');
    expect(html.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('system');
  });

  it('ignore un mode stocké invalide et pose palette et mode ensemble', () => {
    mockPrefersDark(false);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'nope');
    localStorage.setItem(THEME_PALETTE_STORAGE_KEY, 'heritage');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('system');
    expect(result.current.resolvedMode).toBe('light');
    expect(html.getAttribute('data-palette')).toBe('heritage');

    act(() => result.current.setMode('dark'));
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.getAttribute('data-palette')).toBe('heritage');
  });

  it('applique le thème (palette) stocké et le persiste lors d’un changement', () => {
    mockPrefersDark(false);
    localStorage.setItem(THEME_PALETTE_STORAGE_KEY, 'cuivre');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.palette).toBe('cuivre');
    expect(html.getAttribute('data-palette')).toBe('cuivre');

    act(() => result.current.setPalette('brume'));
    expect(html.getAttribute('data-palette')).toBe('brume');
    expect(localStorage.getItem(THEME_PALETTE_STORAGE_KEY)).toBe('brume');
  });

  it('ignore un thème stocké invalide et garde les deux attributs cohérents', () => {
    mockPrefersDark(true);
    localStorage.setItem(THEME_PALETTE_STORAGE_KEY, 'indigo');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.palette).toBe('heritage');
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.getAttribute('data-palette')).toBe('heritage');

    act(() => result.current.setPalette('foret'));
    expect(html.getAttribute('data-theme')).toBe('dark');
    expect(html.getAttribute('data-palette')).toBe('foret');
    expect(localStorage.getItem(THEME_PALETTE_STORAGE_KEY)).toBe('foret');
  });
});
