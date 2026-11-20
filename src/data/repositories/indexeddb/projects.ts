import { Project } from '@/data/models/project/project';
import { ProjectDTO } from '@/data/models/project/project.dto';
import { SourceAlreadyInProjectError } from '@/data/utils/errors';
import { FunctionResult } from '@/utils/functionResult';
import { NotFoundError } from '@/utils/NotFoundError';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { ProjectRepository } from './types';

export class IndexedDBProjectRepository implements ProjectRepository {
  async getAll(): Promise<Project[]> {
    return await db.projects.toArray();
  }

  async getById(id: string): Promise<FunctionResult<Project, EntityNotFoundError>> {
    const project = await db.projects.get(id);
    if (!project) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Project', id }));
    }
    return FunctionResult.ok(project);
  }

  async add(project: ProjectDTO): Promise<Project> {
    // Creation path: the repository initializes both timestamps (decision 1).
    const now = new Date().toISOString();
    const newProject: Project = { ...project, createdAt: now, updatedAt: now };
    await db.projects.add(newProject);
    return newProject;
  }

  async addSource(
    projectId: string,
    sourceId: string,
  ): Promise<FunctionResult<void, NotFoundError | SourceAlreadyInProjectError>> {
    const result = await this.getById(projectId);
    if (!result.ok) {
      return result;
    }
    const project = result.value;
    if (project.sources.includes(sourceId)) {
      return FunctionResult.err(new SourceAlreadyInProjectError({ projectId, sourceId }));
    }
    project.sources.push(sourceId);
    // Modification path: createdAt is the stored one, updatedAt is assigned here.
    await db.projects.put({ ...project, updatedAt: new Date().toISOString() });
    return FunctionResult.ok(undefined);
  }
}
