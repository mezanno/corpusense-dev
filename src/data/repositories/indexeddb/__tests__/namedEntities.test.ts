import type { NamedEntity } from '@/data/models/namedEntity';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBNamedEntityRepository } from '../namedEntities';
import { createTestDb } from './testDb';

describe('IndexedDBNamedEntityRepository', () => {
  const repository = new IndexedDBNamedEntityRepository();
  const first: NamedEntity = {
    id: 'entity-1',
    dataFieldId: 'field-1',
    value: 'Ada',
    selector: [{ annotationId: 'annotation-1', indexes: [0] }],
    annotationIds: ['annotation-1'],
  };
  const second: NamedEntity = {
    id: 'entity-2',
    dataFieldId: 'field-1',
    value: 'Lovelace',
    selector: [{ annotationId: 'annotation-2', indexes: [1] }],
    annotationIds: ['annotation-2', 'annotation-3'],
  };

  beforeEach(async () => {
    await createTestDb();
  });

  it('finds entities by one or several annotation ids', async () => {
    await repository.add(first);
    await repository.add(second);

    expect(await repository.getByAnnotationId('annotation-1')).toEqual([first]);
    expect(await repository.getByAnnotationIds(['annotation-2', 'annotation-3'])).toEqual([second]);
    expect(await repository.getByAnnotationIds(['missing'])).toEqual([]);
  });

  it('deletes only entities linked to the requested annotation ids', async () => {
    await repository.add(first);
    await repository.add(second);

    await repository.deleteByAnnotationIds(['annotation-1', 'missing']);

    expect(await repository.getByAnnotationIds(['annotation-1', 'annotation-2'])).toEqual([second]);
  });
});
