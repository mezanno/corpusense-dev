import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useState } from 'react';

const useBlob = (blobId: string) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const { data } = useQuery<Blob, Error>({
    queryKey: ['blob', blobId],
    queryFn: async () => {
      const sourceRepository = getSourceRepository();
      const blob = await sourceRepository.getBlob(blobId);
      if (blob === undefined || blob === null) throw new Error(`Blob not found: ${blobId}`);
      return blob;
    },
  });

  const onNewUrl = useEffectEvent((url: string) => {
    setThumbUrl(url);
  });

  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data);
      onNewUrl(url);
      return () => URL.revokeObjectURL(url); // libère la mémoire quand le composant se détruit
    }
  }, [data]);

  return {
    thumbUrl,
  };
};

export default useBlob;
