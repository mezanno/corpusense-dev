import { Source } from '@/data/models/Sources';
import {
  getCollectionRepository,
  getProjectRepository,
  getSourceLiveRepository,
  getSourceRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

const useLiveSources = () => {
  const sourceLiveRepository = useMemo(() => getSourceLiveRepository(), []);

  const remoteSources = useLiveQuery(
    sourceLiveRepository.getAll('remote'),
    [sourceLiveRepository],
    [] as Source[],
  );

  const localSources = useLiveQuery(
    sourceLiveRepository.getAll('local'),
    [sourceLiveRepository],
    [] as Source[],
  );

  const removeUnusedSources = async () => {
    const allRemoteSourceIds = remoteSources.map((s) => s.id);

    // Get all projects and their source IDs
    const projectRepository = getProjectRepository();
    const allProjects = await projectRepository.getAll();
    const projectSourceIds = [...new Set(allProjects.flatMap((project) => project.sources))];

    const unusedSourceIds = allRemoteSourceIds.filter((id) => !projectSourceIds.includes(id));

    //Get all sources used in collections
    const collectionRepository = getCollectionRepository();
    const allCollectionIds = (await collectionRepository.getAllDetails()).map(
      (collection) => collection.id,
    );
    const collectionSourceIdsArrays = await Promise.all(
      allCollectionIds.map((collectionId) =>
        collectionRepository.getSourceIdsByCollectionId(collectionId),
      ),
    );
    const collectionSourceIds = [...new Set(collectionSourceIdsArrays.flat())];

    const trulyUnusedSourceIds = unusedSourceIds.filter((id) => !collectionSourceIds.includes(id));
    const sourceRepository = getSourceRepository();
    await Promise.all(trulyUnusedSourceIds.map((id) => sourceRepository.deleteById(id)));
  };

  return {
    remoteSources,
    localSources,
    removeUnusedSources,
  };
};

export default useLiveSources;
