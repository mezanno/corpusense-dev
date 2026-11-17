import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

function ExampleForm() {
  const form = useForm({ defaultValues: { name: '', optional: '' } });

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(vi.fn())(event);
        }}
      >
        <FormField
          control={form.control}
          name='name'
          rules={{ required: 'Nom obligatoire' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='optional'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Facultatif</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <button type='submit'>Valider</button>
      </form>
    </Form>
  );
}

describe('FormMessage', () => {
  it('annonce les erreurs et les associe au champ concerné', async () => {
    const user = userEvent.setup();
    render(<ExampleForm />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox', { name: 'Facultatif' })).not.toHaveAttribute(
      'aria-required',
    );
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    const message = await screen.findByRole('alert');
    expect(message).toHaveTextContent('Nom obligatoire');
    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveAccessibleDescription(
      'Nom obligatoire',
    );

    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Alice');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
