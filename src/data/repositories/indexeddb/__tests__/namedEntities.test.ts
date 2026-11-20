import { NamedEntityDTO } from '@/data/models/namedEntity/namedEntity.dto';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IndexedDBNamedEntityRepository } from '../namedEntities';
import { createTestDb } from './testDb';

describe('IndexedDBNamedEntityRepository', () => {
  const repository = new IndexedDBNamedEntityRepository();
  const first: NamedEntityDTO = {
    id: 'entity-1',
    dataFieldId: 'field-1',
    value: 'Ada',
    selector: [{ annotationId: 'annotation-1', indexes: [0] }],
    annotationIds: ['annotation-1'],
  };
  const second: NamedEntityDTO = {
    id: 'entity-2',
    dataFieldId: 'field-1',
    value: 'Lovelace',
    selector: [{ annotationId: 'annotation-2', indexes: [1] }],
    annotationIds: ['annotation-2', 'annotation-3'],
  };

  beforeEach(async () => {
    await createTestDb();
  });

  // The repository initializes the two timestamps at creation (decision 1).
  const expectValidTimestamps = (entity: { createdAt?: string; updatedAt?: string }) => {
    expect(z.iso.datetime().safeParse(entity.createdAt).success).toBe(true);
    expect(z.iso.datetime().safeParse(entity.updatedAt).success).toBe(true);
    expect(entity.updatedAt).toBe(entity.createdAt);
  };

  it('finds entities by one or several annotation ids', async () => {
    const createdFirst = await repository.add(first);
    const createdSecond = await repository.add(second);
    expectValidTimestamps(createdFirst);
    expectValidTimestamps(createdSecond);

    expect(await repository.getByAnnotationId('annotation-1')).toEqual([createdFirst]);
    expect(await repository.getByAnnotationIds(['annotation-2', 'annotation-3'])).toEqual([
      createdSecond,
    ]);
    expect(await repository.getByAnnotationIds(['missing'])).toEqual([]);
  });

  it('deletes only entities linked to the requested annotation ids', async () => {
    await repository.add(first);
    const createdSecond = await repository.add(second);

    await repository.deleteByAnnotationIds(['annotation-1', 'missing']);

    expect(await repository.getByAnnotationIds(['annotation-1', 'annotation-2'])).toEqual([
      createdSecond,
    ]);
  });
});
