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

  async addSource(projectId: string, sourceId: string): Promise<void> {
    const project = await this.getById(projectId);
    if (project.sources.includes(sourceId)) {
      throw new Error(`Source with id ${sourceId} already exists in project ${projectId}`);
    }
    project.sources.push(sourceId);
    await db.projects.put(project);
  }
}
