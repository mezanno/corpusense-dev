import { AnnotationPage } from '@iiif/presentation-3';
import { isNumberArray } from '@tanstack/react-table';
import { Annotation, changeValue, ElementType } from '../models/Annotation';
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
  const collection = await getCollectionRepository().getById(result.scope.collectionId);
  const modelId = collection.modelId;
  if (modelId === undefined) {
    throw new Error(`No model found for collection ${collection.name}`);
  }

  const lineAnnotations = await getAnnotationRepository().getByScopeAndTypes(result.scope, [
    ElementType.TEXT_LINE,
  ]);
  if (lineAnnotations.length === 0) {
    throw new Error(
      `No line annotations found for canvas ${result.scope.canvasId} in collection ${result.scope.collectionId}`,
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
      console.log(annotationsForItem.map((a) => a.id));
      const stringValue = JSON.stringify(item);
      const mergedAnnotation = mergeMultipleAnnotations(annotationsForItem);
      const mergedAnnotationUpdated = changeValue(mergedAnnotation, stringValue);
      entityAnnotations.push(mergedAnnotationUpdated);
    }
  });

  return convertW3CAnnotationsToIIIF(entityAnnotations);
};
