import { IconButtonWithTooltip } from '@/components/common/IconButtonWithTooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('IconButtonWithTooltip', () => {
  it('exposes a named button that can be activated by keyboard without bubbling', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <IconButtonWithTooltip tooltip='Voir le résultat' onClick={onClick}>
          <span aria-hidden='true'>icon</span>
        </IconButtonWithTooltip>
      </div>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Voir le résultat' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('does not activate when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButtonWithTooltip tooltip='Voir le résultat' onClick={onClick} disabled>
        <span aria-hidden='true'>icon</span>
      </IconButtonWithTooltip>,
    );

    const button = screen.getByRole('button', { name: 'Voir le résultat' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
