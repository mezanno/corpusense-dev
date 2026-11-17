import useReducedMotion from '@/hooks/ui/useReducedMotion';
import emailjs from '@emailjs/browser';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactForm from '../ContactForm';

vi.mock('@emailjs/browser', () => ({ default: { send: vi.fn().mockResolvedValue({}) } }));
vi.mock('@/hooks/ui/useReducedMotion', () => ({ default: vi.fn() }));
vi.mock('react-canvas-confetti/dist/presets/fireworks', () => ({
  default: () => <div>fireworks</div>,
}));

describe('ContactForm et mouvement réduit', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([true, false])(
    'respecte la préférence reduced-motion=%s après envoi',
    async (reduced) => {
      vi.mocked(useReducedMotion).mockReturnValue(reduced);
      const formRef = createRef<HTMLFormElement>();
      render(<ContactForm formRef={formRef} setCanSubmit={vi.fn()} />);

      fireEvent.change(screen.getByRole('textbox', { name: /form_placeholder_contact_email/ }), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /form_placeholder_contact_object/ }), {
        target: { value: 'Sujet' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /form_placeholder_contact_message/ }), {
        target: { value: 'Un message suffisamment long' },
      });
      expect(formRef.current).not.toBeNull();
      if (formRef.current) fireEvent.submit(formRef.current);

      await waitFor(() => expect(emailjs.send).toHaveBeenCalledOnce());
      if (reduced) expect(screen.queryByText('fireworks')).not.toBeInTheDocument();
      else expect(await screen.findByText('fireworks')).toBeInTheDocument();
    },
  );
});
