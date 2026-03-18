import { getProjectRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useMemo } from 'react';
import { v4 as uuid } from 'uuid';

const useProjectsIO = () => {
  const projectRespository = useMemo(() => getProjectRepository(), []);

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

  return {
    createProject,
  };
};

export default useProjectsIO;
