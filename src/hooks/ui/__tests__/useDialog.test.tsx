import { renderWithProviders } from '@/__tests__/utils';
import useDialog from '@/hooks/ui/useDialog';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/common/forms/ImportCollectionForm', () => ({
  default: () => <div />,
}));

vi.mock('@/components/common/forms/SelectLlmForm', () => ({
  default: ({
    formRef,
    onResult,
  }: {
    formRef: React.RefObject<HTMLFormElement | null>;
    onResult: (result: string) => void;
  }) => (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        onResult('profile-1');
      }}
    />
  ),
}));

const DialogHarness = () => {
  const { openForm } = useDialog();
  const [result, setResult] = useState<string>('pending');

  return (
    <>
      <button
        onClick={() =>
          void openForm('selectLlm', {}).then((value) => setResult(value ?? 'cancelled'))
        }
      >
        Open result form
      </button>
      <button
        onClick={() => void openForm('importCollection', {}).then(() => setResult('confirmed'))}
      >
        Open action form
      </button>
      <output>{result}</output>
    </>
  );
};

describe('useDialog', () => {
  it('resolves a typed form result after submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    await user.click(screen.getByRole('button', { name: 'btn_start' }));

    expect(await screen.findByText('profile-1')).toBeInTheDocument();
  });

  it('resolves with undefined when the form is cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    await user.click(screen.getByRole('button', { name: 'btn_cancel' }));

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
  });

  it('resolves when a form is confirmed without a result', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open action form' }));
    await user.click(screen.getByRole('button', { name: 'btn_import_collection' }));

    expect(await screen.findByText('confirmed')).toBeInTheDocument();
  });
});
