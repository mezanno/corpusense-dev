import { NamedEntity } from '@/data/models/namedEntity/namedEntity';
import { db } from '../db';
import { NamedEntityLiveRepository } from './types.live';

export class IndexedDBNamedEntityLiveRepository implements NamedEntityLiveRepository {
  getByAnnotationIds(annotationIds: string[]): () => Promise<NamedEntity[]> {
    return () => db.namedEntities.where('annotationIds').anyOf(annotationIds).distinct().toArray();
  }
}
