import type { KeyboardEvent } from 'react';

/** Open a Radix context menu from a focused gallery action without requiring a mouse. */
export function openContextMenuOnKeyDown(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  event.preventDefault();
  const { left, bottom } = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: left,
      clientY: bottom,
      button: 2,
    }),
  );
}
