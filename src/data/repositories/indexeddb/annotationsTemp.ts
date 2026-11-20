import { Annotation } from '@/data/models/annotations/annotation';
import { AnnotationDraft } from '@/data/models/annotations/annotation.dto';
import { CanvasScope } from '@/data/models/scope/scope';
import { BaseError } from '@/utils/BaseError';
import { FunctionResult } from '@/utils/functionResult';
import { InvalidImportedDatesError } from '../../utils/errors';
import { db } from './db';
import { validateTimestamps } from './importWrite';
import { markMigration } from './timestamps';
import { AnnotationTempRepository } from './types';

export class IndexedDBAnnotationTempRepository implements AnnotationTempRepository {
  async getAll(): Promise<Annotation[]> {
    return await db.annotationsTemp.toArray();
  }

  async getByCanvas(scope: CanvasScope): Promise<Annotation[]> {
    return db.annotationsTemp
      .where({
        canvasId: scope.canvasId,
        collectionId: scope.collectionId,
      })
      .sortBy('order');
  }

  async addAll(annotations: AnnotationDraft[]): Promise<Annotation[]> {
    // Creation path: the repository initializes both timestamps (decision 1).
    const now = new Date().toISOString();
    const newAnnotations: Annotation[] = annotations.map((annotation) => ({
      ...annotation,
      createdAt: now,
      updatedAt: now,
    }));
    return db.transaction('rw', db.annotationsTemp, async () => {
      await db.annotationsTemp.bulkAdd(newAnnotations);
      return this.getWrittenAnnotations(newAnnotations);
    });
  }

  /**
   * Dedicated overwrite-import path (decision 3), mirroring the model one:
   * dates validated, preserved, and written under a migration-marked
   * transaction; invalid dates fail with an i18n FunctionResult (decision 6).
   */
  async importWithDates(
    annotations: Annotation[],
  ): Promise<FunctionResult<Annotation[], InvalidImportedDatesError>> {
    if (annotations.length === 0) {
      return FunctionResult.ok([]);
    }
    const validatedTimestamps = validateTimestamps(annotations, 'AnnotationTemp');
    if (!validatedTimestamps.ok) {
      return validatedTimestamps;
    }
    const entities: Annotation[] = annotations.map((annotation, index) => ({
      ...annotation,
      ...validatedTimestamps.value[index],
    }));
    await db.transaction('rw', db.annotationsTemp, async (tx) => {
      markMigration(tx);
      await db.annotationsTemp.bulkPut(entities);
    });
    return FunctionResult.ok(await this.getWrittenAnnotations(entities));
  }

  async deleteByCollection(collectionId: string): Promise<void> {
    const toDelete = await db.annotationsTemp.where('collectionId').equals(collectionId).toArray();
    const idsToDelete = toDelete.map((a) => a.id);
    await db.annotationsTemp.bulkDelete(idsToDelete);
  }

  private async getWrittenAnnotations(annotations: Annotation[]): Promise<Annotation[]> {
    const stored = await db.annotationsTemp.bulkGet(annotations.map(({ id }) => id));
    return stored.map((annotation) => {
      if (annotation === undefined) throw new BaseError('Written annotation not found');
      return annotation;
    });
  }
}
