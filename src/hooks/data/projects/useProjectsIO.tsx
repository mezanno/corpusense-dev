import { getProjectRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useMemo } from 'react';
import { v4 as uuid } from 'uuid';

const useProjectsIO = () => {
  const projectRespository = useMemo(() => getProjectRepository(), []);

  const getProjectById = async (id: string) => {
    return await projectRespository.getById(id);
  };

  const createProject = async (name: string) => {
    const newProject = {
      id: uuid(),
      name,
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: [],
      collections: [],
    };
    await projectRespository.add(newProject);
    return newProject;
  };

  const addSourceToProject = async (projectId: string, sourceId: string) => {
    await projectRespository.addSource(projectId, sourceId);
  };

  return {
    createProject,
    getProjectById,
    addSourceToProject,
  };
};

export default useProjectsIO;
