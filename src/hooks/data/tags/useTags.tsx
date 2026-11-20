import { Tag } from '@/data/models/tag/tag';
import { TagDTO } from '@/data/models/tag/tag.dto';
import { getTagLiveRepository, getTagRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';

export const useTags = () => {
  const tagLiveRepository = useMemo(() => getTagLiveRepository(), []);
  const tagRepository = useMemo(() => getTagRepository(), []);

  const tags = useLiveQuery(tagLiveRepository.getAll(), [tagLiveRepository], [] as Tag[]);

  const getTagsByIds = useCallback(
    (ids: string[]) => ids?.map((id) => tags.find((t) => t.id === id)).filter(Boolean) ?? [],
    [tags],
  );

  const createNewTag = async (newTag: TagDTO) => {
    try {
      // Timestamps are assigned by the repository (decision 1).
      await tagRepository.add(newTag);
    } catch (error) {
      console.warn(error);
    }
  };

  const getLabelById = useCallback(
    (id: string) => {
      const tag = tags.find((t) => t.id === id);
      return tag ? tag.label : null;
    },
    [tags],
  );

  return {
    tags,
    createNewTag,
    getTagsByIds,
    getLabelById,
  };
};
