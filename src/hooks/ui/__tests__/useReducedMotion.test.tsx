import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useReducedMotion from '../useReducedMotion';

describe('useReducedMotion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('suit les changements de préférence et se désabonne', () => {
    let matches = false;
    let listener: EventListenerOrEventListenerObject | null = null;
    const removeEventListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      media: query,
      get matches() {
        return matches;
      },
      onchange: null,
      addEventListener: (_type: string, callback: EventListenerOrEventListenerObject | null) => {
        listener = callback;
      },
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      matches = true;
      if (typeof listener === 'function') listener(new Event('change'));
      else if (listener) listener.handleEvent(new Event('change'));
    });
    expect(result.current).toBe(true);
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
