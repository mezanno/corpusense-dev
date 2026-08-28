import { AnnotationPage } from '@iiif/presentation-3';
import z from 'zod';
import {
  Annotation,
  changeValue,
  createAnnotation,
  ElementType,
} from '../models/annotations/annotation';
import { convertW3CAnnotationsToIIIF } from '../models/converters/iiif';
import { Result } from '../models/Result';
import { isCanvasScope } from '../models/Scope';
import {
  getAnnotationRepository,
  getCollectionRepository,
} from '../repositories/indexeddb/dbFactory';
import { mergeMultipleAnnotations } from './annotations';

export const convertResultToIIIFAnnotation = async (result: Result): Promise<AnnotationPage> => {
  //AnnotationPage
  if (!isCanvasScope(result.scope)) {
    throw new Error(`Result scope is not a canvas scope`);
  }
  const { canvasId, collectionId } = result.scope;
  const collectionResult = await getCollectionRepository().getById(collectionId);
  if (!collectionResult.ok) {
    throw new Error(`Collection with id ${collectionId} not found`);
  }
  const collection = collectionResult.value;
  const modelId = collection.modelId;
  if (modelId === undefined) {
    throw new Error(`No model found for collection ${collection.name}`);
  }

  const lineAnnotations = await getAnnotationRepository().getByScopeAndTypes(result.scope, [
    ElementType.TEXT_LINE,
  ]);
  if (lineAnnotations.length === 0) {
    throw new Error(
      `No line annotations found for canvas ${canvasId} in collection ${collectionId}`,
    );
  }

  const dataSchema = z.array(
    z.object({
      position: z.array(z.number()),
    }),
  );

  const dataValidation = dataSchema.safeParse(
    typeof result.value === 'string' ? JSON.parse(result.value) : result.value,
  );
  if (!dataValidation.success) {
    throw new Error(
      `Result value is not a valid array of objects with position property: ${dataValidation.error.message}`,
    );
  }
  const dataParsedArray = dataValidation.data;

  const entityAnnotations: Annotation[] = [];
  dataParsedArray.forEach((item) => {
    const positions = item.position;
    const annotationsForItem: Annotation[] = lineAnnotations.filter((_, index) =>
      positions.includes(index),
    );
    const stringValue = JSON.stringify(item);

    //if there is no annotation for the item, we create a new one at position 0,0
    const mergedAnnotation =
      annotationsForItem.length === 0
        ? {
            ...createAnnotation({
              canvasId,
              collectionId,
              minX: 0,
              minY: 0,
              maxX: 200,
              maxY: 100,
              type: ElementType.TEXT_LINE,
              value: JSON.stringify(item),
            }),
            order: 0,
          }
        : mergeMultipleAnnotations(annotationsForItem);

    const mergedAnnotationUpdated = changeValue(mergedAnnotation, stringValue);
    entityAnnotations.push(mergedAnnotationUpdated);
  });

  return convertW3CAnnotationsToIIIF(entityAnnotations);
};
