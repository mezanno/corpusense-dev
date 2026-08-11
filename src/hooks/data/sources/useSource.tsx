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
      const source = await sourceRepository.getById(sourceId);
      const content = await sourceRepository.getContentById(sourceId);
      return {
        ...source,
        content,
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
