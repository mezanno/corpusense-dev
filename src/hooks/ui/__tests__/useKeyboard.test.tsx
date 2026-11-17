import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useKeyboard from '../useKeyboard';

describe('useKeyboard', () => {
  it('ignores typing and editable descendants while retaining global shortcuts', () => {
    const onKeyPressed = vi.fn();
    const Example = () => {
      useKeyboard({ onKeyPressed });
      return (
        <>
          <input aria-label='input' />
          <textarea aria-label='textarea' />
          <select aria-label='select'>
            <option>One</option>
          </select>
          <div contentEditable suppressContentEditableWarning>
            <span>editable</span>
          </div>
          <div role='combobox' aria-expanded='false' tabIndex={0}>
            combobox
          </div>
          <button>outside</button>
        </>
      );
    };
    render(<Example />);
    for (const element of [
      screen.getByLabelText('input'),
      screen.getByLabelText('textarea'),
      screen.getByLabelText('select'),
      screen.getByText('editable'),
      screen.getByRole('combobox', { name: '' }),
    ]) {
      fireEvent.keyDown(element, { key: 'ArrowRight' });
    }
    expect(onKeyPressed).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'outside' }), { key: 'ArrowLeft' });
    expect(onKeyPressed).toHaveBeenCalledExactlyOnceWith('ArrowLeft');
  });
});
