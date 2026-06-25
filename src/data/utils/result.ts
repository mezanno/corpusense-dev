import { AnnotationPage } from '@iiif/presentation-3';
import { isNumberArray } from '@tanstack/react-table';
import { Annotation, changeValue, createAnnotation, ElementType } from '../models/Annotation';
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
  const collection = await getCollectionRepository().getById(collectionId);
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

  const dataParsed = JSON.parse(result.value as string) as unknown;
  const dataParsedArray = (Array.isArray(dataParsed) ? dataParsed : [dataParsed]) as unknown[];

  const entityAnnotations: Annotation[] = [];
  dataParsedArray.forEach((item) => {
    if (
      item !== undefined &&
      item !== null &&
      typeof item === 'object' &&
      'position' in item &&
      isNumberArray(item.position)
    ) {
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
    }
  });

  return convertW3CAnnotationsToIIIF(entityAnnotations);
};
