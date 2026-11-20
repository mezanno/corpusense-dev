import { ImageAnnotation } from '@annotorious/annotorious';
import { ElementType } from './annotation';

export interface AnnotationDTO extends ImageAnnotation {
  canvasId: string;
  collectionId: string;
  type: ElementType;
}

/**
 * Annotation under construction or transformation: everything except the
 * timestamps, which repositories assign at write time. Persisted `Annotation` values
 * are assignable to this draft type.
 */
export type AnnotationDraft = AnnotationDTO & { order: number };

export interface AnnotationCreateDTO {
  canvasId: string;
  collectionId: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  type: ElementType;
  value: string | undefined;
}

export interface AnnotationWithIdCreateDTO extends AnnotationCreateDTO {
  id: string;
}
