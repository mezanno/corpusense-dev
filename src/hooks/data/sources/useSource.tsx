import { SourceWithContent } from '@/data/models/Sources';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useQuery } from '@tanstack/react-query';

export const QUERY_KEY_CURRENT_SOURCE = 'currentSource';

const useSource = (sourceId: string) => {
  const {
    error,
    isLoading,
    data: sourceWithContent,
  } = useQuery<SourceWithContent, Error>({
    queryKey: [QUERY_KEY_CURRENT_SOURCE, sourceId],
    queryFn: async () => {
      const sourceRepository = getSourceRepository();
      const sourceResult = await sourceRepository.getById(sourceId);
      if (!sourceResult.ok) {
        throw new Error(sourceResult.error.message);
      }
      const contentResult = await sourceRepository.getContentById(sourceId);
      if (!contentResult.ok) {
        throw new Error(contentResult.error.message);
      }
      return {
        ...sourceResult.value,
        content: contentResult.value,
      };
    },
  });

  const manifest = sourceWithContent?.content.manifest;

  return {
    error,
    isLoading,
    manifest,
    sourceWithContent,
  };
};

export default useSource;
