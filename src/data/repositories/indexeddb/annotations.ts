import { AnnotationDraft, AnnotationDTO } from '@/data/models/annotations/annotation.dto';
import { getAnnotationType } from '@/data/models/annotations/annotation.utils';
import { Scope } from '@/data/models/scope/scope';
import { isAnnotationScope, isCanvasScope } from '@/data/models/scope/scope.utils';
import { containsAtLeast2Corners, getSurface } from '@/data/utils/annotations';
import { BaseError } from '@/utils/BaseError';
import { FunctionResult } from '@/utils/functionResult';
import { Annotation, ElementType } from '../../models/annotations/annotation';
import { InvalidImportedDatesError } from '../../utils/errors';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { validateTimestamps } from './importWrite';
import { markMigration } from './timestamps';
import { AnnotationRepository } from './types';

export class IndexedDBAnnotationRepository implements AnnotationRepository {
  private async getWrittenAnnotations(annotations: Annotation[]): Promise<Annotation[]> {
    const stored = await db.annotations.bulkGet(annotations.map(({ id }) => id));
    return stored.map((annotation) => {
      if (annotation === undefined) throw new BaseError('Written annotation not found');
      return annotation;
    });
  }

  async getById(id: string): Promise<FunctionResult<Annotation, EntityNotFoundError>> {
    const annotation = await db.annotations.get(id);
    if (annotation === undefined) {
      return FunctionResult.err(
        new EntityNotFoundError({
          id,
          entity: 'Annotation',
        }),
      );
    }

    return FunctionResult.ok(annotation);
  }

  async getByScope(scope: Scope): Promise<Annotation[]> {
    if (isAnnotationScope(scope)) {
      return FunctionResult.match(await this.getById(scope.annotationId), {
        ok: (annotation) => [annotation],
        err: () => [],
      });
    } else if (isCanvasScope(scope)) {
      return db.annotations
        .where({
          canvasId: scope.canvasId,
          collectionId: scope.collectionId,
        })
        .sortBy('order');
    } else {
      return await db.annotations.where('collectionId').equals(scope.collectionId).sortBy('order');
    }
  }

  async getByScopeAndTypes(scope: Scope, types?: ElementType[]): Promise<Annotation[]> {
    const annotations = await this.getByScope(scope);
    if (types === undefined || types.length === 0) {
      return annotations;
    }
    return annotations.filter((annotation) => types.includes(getAnnotationType(annotation)));
  }

  async getNextOrderByScopeAndType(scope: Scope, type: ElementType): Promise<number> {
    const annotations = await this.getByScopeAndTypes(scope, [type]);
    if (annotations.length === 0) {
      return 1;
    }
    return annotations[annotations.length - 1].order + 1;
  }

  /*
   * This function is used to get the parent annotation of a text line annotation. The parent annotation is the annotation that has the same canvasId and collectionId, and contains at least 2 corners of the given annotation. If there are multiple annotations that satisfy this condition, we return the one that has the smallest area. If there is no annotation that satisfies this condition, we throw an error.
   */
  async getParent(
    annotation: AnnotationDraft,
  ): Promise<FunctionResult<Annotation, EntityNotFoundError>> {
    if (
      getAnnotationType(annotation) !== ElementType.TEXT_LINE &&
      getAnnotationType(annotation) !== ElementType.TEMP
    ) {
      return FunctionResult.err(
        new EntityNotFoundError({
          entity: 'Annotation',
          id: annotation.id,
        }),
      );
    }
    const regionAnnotations = await this.getByScopeAndTypes(
      { collectionId: annotation.collectionId, canvasId: annotation.canvasId },
      [ElementType.TEXT_REGION],
    );

    const parent = regionAnnotations.reduce(
      (closest, current) => {
        if (containsAtLeast2Corners(current, annotation)) {
          const currentArea = getSurface(current);
          const closestArea = closest ? getSurface(closest) : Number.POSITIVE_INFINITY;
          if (currentArea < closestArea) {
            return current;
          }
        }
        return closest;
      },
      null as Annotation | null,
    );

    if (parent === null) {
      return FunctionResult.err(
        new EntityNotFoundError({
          entity: 'Annotation',
          id: annotation.id,
        }),
      );
    }

    return FunctionResult.ok(parent);
  }

  //TODO! il faut ordonner les annotations par collection et canvas sinon l'ordre sera faux
  async addAll(annotations: AnnotationDTO[]) {
    /* set the order for each annotation. We get the last order for the scope and type, and increment it for each new annotation.
    To optimize it, we order annotations by type and then we loop on each type */
    const newAnnotations: Annotation[] = [];
    const annotationsByType: { [key in ElementType]?: AnnotationDTO[] } = {};
    for (const annotation of annotations) {
      const type = getAnnotationType(annotation);
      if (!annotationsByType[type]) {
        annotationsByType[type] = [];
      }
      annotationsByType[type].push(annotation);
    }
    for (const type in annotationsByType) {
      const elementType = type as ElementType;
      let lastOrder = await this.getNextOrderByScopeAndType(
        { collectionId: annotations[0].collectionId, canvasId: annotations[0].canvasId },
        elementType,
      );

      for (const annotation of annotationsByType[elementType]!) {
        newAnnotations.push(this.withCreationDates({ ...annotation, order: lastOrder }));
        lastOrder++;
      }
    }
    return db.transaction('rw', db.annotations, async () => {
      await db.annotations.bulkPut(newAnnotations);
      return this.getWrittenAnnotations(newAnnotations);
    });
  }

  /**
   * Dedicated overwrite-import path (decision 3): imported dates are validated,
   * preserved and written under a migration-marked transaction, so existing rows
   * are not re-stamped by the ordinary hooks. Invalid dates fail with an i18n
   * FunctionResult error (decision 6). Order stays recomputed like addAll.
   */
  async importWithDates(
    annotations: AnnotationDTO[],
  ): Promise<FunctionResult<Annotation[], InvalidImportedDatesError>> {
    if (annotations.length === 0) {
      return FunctionResult.ok([]);
    }
    const validatedTimestamps = validateTimestamps(annotations, 'Annotation');
    if (!validatedTimestamps.ok) {
      return validatedTimestamps;
    }

    /* Same order recomputation as addAll, then assemble entities from the validated dates. */
    const entities: Annotation[] = [];
    const annotationsByType: { [key in ElementType]?: AnnotationDTO[] } = {};
    for (const annotation of annotations) {
      const type = getAnnotationType(annotation);
      if (!annotationsByType[type]) {
        annotationsByType[type] = [];
      }
      annotationsByType[type].push(annotation);
    }
    for (const type in annotationsByType) {
      const elementType = type as ElementType;
      let lastOrder = await this.getNextOrderByScopeAndType(
        { collectionId: annotations[0].collectionId, canvasId: annotations[0].canvasId },
        elementType,
      );

      for (const annotation of annotationsByType[elementType]!) {
        const dates = validatedTimestamps.value[annotations.indexOf(annotation)];
        entities.push({ ...annotation, order: lastOrder, ...dates });
        lastOrder++;
      }
    }

    await db.transaction('rw', db.annotations, async (tx) => {
      markMigration(tx);
      await db.annotations.bulkPut(entities);
    });
    return FunctionResult.ok(await this.getWrittenAnnotations(entities));
  }

  private withCreationDates(annotation: AnnotationDraft): Annotation {
    const now = new Date().toISOString();
    return { ...annotation, createdAt: now, updatedAt: now };
  }

  async update(annotation: AnnotationDraft) {
    const annotationToUpdate = await db.annotations.get(annotation.id);

    const annotationsUpdated: AnnotationDraft[] = [];
    if (annotationToUpdate !== undefined) {
      /*
      if the annotation already exists, we need to check if the type changed.
      If the type changed, we need to update the order of the annotation and the order of the annotations above it.
      */
      const actualType = getAnnotationType(annotationToUpdate);
      const newType = getAnnotationType(annotation);
      if (actualType !== newType) {
        //type changed, we need to update the order
        const newOrder = await this.getNextOrderByScopeAndType(
          { collectionId: annotation.collectionId, canvasId: annotation.canvasId },
          newType,
        );
        annotation.order = newOrder;

        //we need to update the order of the annotations above the old order

        const annotationsToUpdate = await db.annotations
          .where('[canvasId+collectionId]')
          .equals([annotation.canvasId, annotation.collectionId])
          .filter((a) => a.order > annotationToUpdate.order && getAnnotationType(a) === actualType)
          .sortBy('order');
        for (let i = 0; i < annotationsToUpdate.length; i++) {
          const a = annotationsToUpdate[i];
          annotationsUpdated.push({ ...a, order: a.order - 1 });
        }
      }
    }
    annotationsUpdated.push(annotation);

    // The repository assigns updatedAt and keeps the stored createdAt (decision 1).
    const now = new Date().toISOString();
    const storedCreationDates = new Map(
      (await db.annotations.bulkGet(annotationsUpdated.map(({ id }) => id))).map(
        (stored, index) => [annotationsUpdated[index].id, stored?.createdAt] as const,
      ),
    );
    const written: Annotation[] = annotationsUpdated.map((value) => ({
      ...value,
      createdAt: storedCreationDates.get(value.id) ?? now,
      updatedAt: now,
    }));

    return db.transaction('rw', db.annotations, async () => {
      await db.annotations.bulkPut(written);
      return this.getWrittenAnnotations(written);
    });
  }

  async updateOrder(annotationId: string, order: number) {
    const result = await this.getById(annotationId);
    if (!result.ok) {
      return [];
    }
    const annotationToUpdate = result.value;
    const actualOrder = annotationToUpdate.order;
    const { canvasId, collectionId } = annotationToUpdate;
    const type = getAnnotationType(annotationToUpdate);

    const annotationToSwapWith = await db.annotations
      .where('[canvasId+collectionId]')
      .equals([canvasId, collectionId])
      .filter((a) => a.order === order && getAnnotationType(a) === type)
      .first();

    const updatedAnnotations: Annotation[] = [];
    updatedAnnotations.push({ ...annotationToUpdate, order });
    if (annotationToSwapWith !== undefined) {
      updatedAnnotations.push({ ...annotationToSwapWith, order: actualOrder });
    }
    // The repository assigns updatedAt; createdAt comes from the stored records.
    const now = new Date().toISOString();
    const written = updatedAnnotations.map((value) => ({ ...value, updatedAt: now }));
    return db.transaction('rw', db.annotations, async () => {
      if (annotationToSwapWith !== undefined) {
        await db.annotations.bulkPut(written);
      } else {
        await db.annotations.update(annotationId, { order, updatedAt: now });
      }
      return this.getWrittenAnnotations(written);
    });
  }

  async deleteByIds(ids: string[]): Promise<string[]> {
    const now = new Date().toISOString();
    //1. get the annotations to delete and order them by scope
    const annotationsToDelete = await db.annotations.bulkGet(ids);
    const annotationsToDeleteByScopeAndType: { [key in string]?: Annotation[] } = {};
    for (const annotation of annotationsToDelete) {
      if (annotation === undefined) {
        continue;
      }
      const key = `${annotation?.canvasId}|${annotation?.collectionId}|${getAnnotationType(annotation)}`;
      if (!annotationsToDeleteByScopeAndType[key]) {
        annotationsToDeleteByScopeAndType[key] = [];
      }
      annotationsToDeleteByScopeAndType[key].push(annotation);
    }

    //2. for each scope, get the min order of the annotations to delete, and update the order of the annotations above
    const annotationsUpdated: Annotation[] = [];
    for (const key in annotationsToDeleteByScopeAndType) {
      const canvasId = key.split('|')[0];
      const collectionId = key.split('|')[1];
      const type = key.split('|')[2];
      //get the min order of the annotations to delete
      const minOrder = Math.min(...annotationsToDeleteByScopeAndType[key]!.map((a) => a.order));

      const annotationsToUpdate = await db.annotations
        .where('[canvasId+collectionId]')
        .equals([canvasId, collectionId])
        .filter(
          (a) =>
            a.order > minOrder &&
            !ids.includes(a.id) &&
            getAnnotationType(a) === (type as ElementType),
        )
        .sortBy('order');

      let newOrder = minOrder;
      for (let i = 0; i < annotationsToUpdate.length; i++) {
        const a = annotationsToUpdate[i];
        annotationsUpdated.push({ ...a, order: newOrder++, updatedAt: now });
      }
    }

    //3. update the annotations and delete the annotations
    await db.transaction('rw', db.annotations, async () => {
      if (annotationsUpdated.length > 0) {
        await db.annotations.bulkPut(annotationsUpdated);
      }
      await db.annotations.bulkDelete(ids);
    });
    return ids;
  }

  async deleteById(id: string): Promise<void> {
    await this.deleteByIds([id]);
  }

  async deleteByScope(scope: Scope): Promise<string[]> {
    const annotations = await this.getByScope(scope);
    return this.deleteByIds(annotations.map((annotation) => annotation.id));
  }

  async deleteByScopeAndType(scope: Scope, types?: ElementType[]): Promise<string[]> {
    const annotations = await this.getByScopeAndTypes(scope, types);
    return this.deleteByIds(annotations.map((annotation) => annotation.id));
  }
}
