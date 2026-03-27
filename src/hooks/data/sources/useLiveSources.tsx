import { Source } from '@/data/models/Sources';
import { getSourceLiveRepository } from '@/data/repositories/indexeddb/dbFactory';
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

  return {
    remoteSources,
    localSources,
  };
};

export default useLiveSources;
