import { Project } from '@/data/models/Project';
import { db } from './db';
import { ProjectRepository } from './types';

export class IndexedDBProjectRepository implements ProjectRepository {
  async getAll(): Promise<Project[]> {
    return await db.projects.toArray();
  }

  async getById(id: string): Promise<Project> {
    const project = await db.projects.get(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    return project;
  }

  async add(project: Project): Promise<void> {
    await db.projects.add(project);
  }
}
