import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';

const useSources = () => {
  const removeSourceFromLibrary = async (sourceId: string) => {
    const sourceRepository = getSourceRepository();
    await sourceRepository.deleteById(sourceId);
  };

  return {
    removeSourceFromLibrary,
  };
};

export default useSources;
