import { describe, expect, it } from 'vitest';
import { normalizeImportedCollection, normalizeImportedEntity } from './historicalDates';

describe('historical import dates', () => {
  const now = '2025-03-04T05:06:07.000Z';
  const valid = '2020-01-01T00:00:00.000Z';

  it.each([
    undefined,
    null,
    '',
    'not a date',
    '2020-01-01',
    new Date(NaN),
    new Date('+010000-01-01T00:00:00.000Z'),
  ])('repairs invalid dates independently: %s', (invalid) => {
    expect(
      normalizeImportedEntity({ id: 'id', createdAt: invalid, updatedAt: valid }, now),
    ).toEqual({
      id: 'id',
      createdAt: now,
      updatedAt: valid,
    });
  });

  it('converts valid Date objects and leaves unknown nested data and input untouched', () => {
    const manifest = { createdAt: 'business date', nested: { updatedAt: '' } };
    const input = {
      collection: { createdAt: new Date(valid) },
      sources: [{ content: { manifest } }],
    };
    const output = normalizeImportedCollection(input, now);
    expect(output).toMatchObject({
      collection: { createdAt: valid, updatedAt: now },
      sources: [
        { createdAt: now, updatedAt: now, content: { createdAt: now, updatedAt: now, manifest } },
      ],
    });
    expect(input.collection.createdAt).toBeInstanceOf(Date);
    expect(manifest).toEqual({ createdAt: 'business date', nested: { updatedAt: '' } });
  });
});
