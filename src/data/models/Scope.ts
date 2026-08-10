import z from 'zod';

//TODO! il va falloir utiliser un discriminant pour le type de scope, sinon on ne pourra pas faire de union type avec zod

export const CollectionScopeSchema = z
  .object({
    collectionId: z.string(),
  })
  .strict();

export const CanvasScopeSchema = z
  .object({
    collectionId: z.string(),
    canvasId: z.string(),
  })
  .strict();

export const AnnotationScopeSchema = z
  .object({
    collectionId: z.string(),
    canvasId: z.string(),
    annotationId: z.string(),
  })
  .strict();

export const ScopeSchema = z.union([
  CollectionScopeSchema,
  CanvasScopeSchema,
  AnnotationScopeSchema,
]);

export type Scope = z.infer<typeof ScopeSchema>;
export type CollectionScope = z.infer<typeof CollectionScopeSchema>;
export type CanvasScope = z.infer<typeof CanvasScopeSchema>;
export type AnnotationScope = z.infer<typeof AnnotationScopeSchema>;

export function isCollectionScope(scope: Scope): scope is CollectionScope {
  return 'collectionId' in scope && !('canvasId' in scope) && !('annotationId' in scope);
}

export function isCanvasScope(scope: Scope): scope is CanvasScope {
  return 'collectionId' in scope && 'canvasId' in scope && !('annotationId' in scope);
}

export function isAnnotationScope(scope: Scope): scope is AnnotationScope {
  return 'collectionId' in scope && 'canvasId' in scope && 'annotationId' in scope;
}

export function isSameScope(s1: Scope, s2: Scope): boolean {
  if (isCollectionScope(s1) && isCollectionScope(s2)) {
    return s1.collectionId === s2.collectionId;
  }
  if (isCanvasScope(s1) && isCanvasScope(s2)) {
    return s1.canvasId === s2.canvasId && s1.collectionId === s2.collectionId;
  }
  if (isAnnotationScope(s1) && isAnnotationScope(s2)) {
    return s1.annotationId === s2.annotationId;
  }
  return false;
}

export function toString(scope: Scope): string {
  if (isAnnotationScope(scope)) {
    return `annotation ${scope.annotationId} - canvas ${scope.canvasId} - collection ${scope.collectionId}`;
  }
  if (isCanvasScope(scope)) {
    return `canvas ${scope.canvasId} - collection ${scope.collectionId}`;
  }
  if (isCollectionScope(scope)) {
    return `collection ${scope.collectionId}`;
  }

  return 'unknown';
}
