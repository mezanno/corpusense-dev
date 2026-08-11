import { Project } from '@/data/models/Project';
import { db } from '../db';
import { ProjectLiveRepository } from './types.live';

export class IndexedDBProjectLiveRepository implements ProjectLiveRepository {
  getAll(): () => Promise<Project[]> {
    return () => db.projects.toArray();
  }
}
