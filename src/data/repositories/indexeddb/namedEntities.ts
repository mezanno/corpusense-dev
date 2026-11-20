import { NamedEntity } from '@/data/models/namedEntity/namedEntity';
import { NamedEntityDTO } from '@/data/models/namedEntity/namedEntity.dto';
import { db } from './db';
import { NamedEntityRepository } from './types';

export class IndexedDBNamedEntityRepository implements NamedEntityRepository {
  async getByAnnotationId(annotationId: string): Promise<NamedEntity[]> {
    return await db.namedEntities.where('annotationIds').equals(annotationId).toArray();
  }
  async getByAnnotationIds(annotationIds: string[]): Promise<NamedEntity[]> {
    return await db.namedEntities.where('annotationIds').anyOf(annotationIds).distinct().toArray();
  }
  async add(entity: NamedEntityDTO): Promise<NamedEntity> {
    //TODO! vérifier si un mot de l'entité existe déjà dans une autre entité
    // Creation path: the repository initializes both timestamps (decision 1).
    const now = new Date().toISOString();
    const newEntity: NamedEntity = { ...entity, createdAt: now, updatedAt: now };
    await db.namedEntities.add(newEntity);
    return newEntity;
  }

  async deleteByAnnotationIds(annotationIds: string[]): Promise<void> {
    // Get all named entities that contain any of the specified annotation IDs
    const entitiesToRemove = await this.getByAnnotationIds(annotationIds);

    // If there are no entities to remove, return early
    if (entitiesToRemove.length === 0) return;

    // Delete all found entities from the database
    await db.namedEntities.bulkDelete(entitiesToRemove.map((entity) => entity.id));
  }
}
