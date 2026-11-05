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
  };
}
