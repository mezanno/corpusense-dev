import { Collection } from '@/data/models/collection/collection';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CollectionMetadataForm from '../CollectionMetadataForm';

const updateCollection = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/data/collections/useCollections', () => ({
  useCollections: () => ({ updateCollection }),
}));
vi.mock('@/hooks/data/models/useModels', () => ({
  useModels: () => ({ models: [{ id: 'model-1', name: 'Modèle 1' }] }),
}));
vi.mock('@/hooks/data/modifiers/useModifierChainLive', () => ({
  default: () => ({ modifierChains: [], applyModifierChainToCollection: vi.fn() }),
}));
const storedTags: never[] = [];
vi.mock('@/hooks/data/tags/useTags', () => ({
  useTags: () => ({ tags: storedTags, createNewTag: vi.fn() }),
}));

describe('CollectionMetadataForm', () => {
  it('permet de sélectionner puis de retirer le modèle facultatif', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const collection: Collection = {
      id: 'collection-1',
      name: 'Collection',
      tags: [],
      content: [],
      contentSize: 0,
    };
    render(
      <MemoryRouter>
        <CollectionMetadataForm collection={collection} />
      </MemoryRouter>,
    );

    const model = screen.getByRole('combobox', { name: 'form_label_model' });
    model.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(updateCollection).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelId: 'model-1' }),
      ),
    );

    model.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Home}{Enter}');
    await waitFor(() =>
      expect(updateCollection).toHaveBeenLastCalledWith(expect.objectContaining({ modelId: '' })),
    );
  });
});
