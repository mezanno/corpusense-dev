import { Annotation, ElementType } from '@/data/models/annotations/annotation';
import { createAnnotation } from '@/data/models/annotations/annotation.factory';

export function makeAnnotation(
  id: string,
  type: ElementType,
  scope = { collectionId: 'collection-1', canvasId: 'canvas-1' },
  order = 1,
  bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 },
): Annotation {
  return {
    ...createAnnotation({
      id,
      ...scope,
      ...bounds,
      type,
      value: id,
    }),
    order,
    // Persisted fixtures carry their timestamps, like any stored record.
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
