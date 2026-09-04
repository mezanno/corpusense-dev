import { useCollectionContext } from '@/components/reducers/CollectionContext';
import { getImageForThumbnail } from '@/data/utils/canvas';
import { Canvas, IIIFExternalWebResource } from '@iiif/presentation-3';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSources from './useSources';

const useThumbnail = ({ canvas, sourceId }: { canvas: Canvas; sourceId: string }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<IIIFExternalWebResource[] | null>(null);
  const { getSourceWithContent } = useSources();
  const { getLocalObjectUrl } = useCollectionContext();

  useEffect(() => {
    const fetchThumbnail = async () => {
      setError(null);
      const sourceWithContentResutlt = await getSourceWithContent(sourceId);

      if (sourceWithContentResutlt.ok) {
        const sourceWithContent = sourceWithContentResutlt.value;
        const originalThumb = (canvas.thumbnail as IIIFExternalWebResource[]) ?? [
          getImageForThumbnail(canvas, 200),
        ];
        const thumb = [...originalThumb];
        if (sourceWithContent.content.type === 'local') {
          const content = sourceWithContent.content;
          const thumbPath = canvas.thumbnail?.[0]?.id;
          if (thumbPath === undefined) {
            setError(t('error_no_thumbnail'));
            return;
          }
          const item = { ...thumb[0] };
          item.id = await getLocalObjectUrl(thumbPath, content.localFile.outputDirectoryHandle);
          thumb[0] = item;
        }
        setThumbnail(thumb);
      }
    };

    void fetchThumbnail();
  }, [canvas, sourceId]);

  return { thumbnail, error };
};

export default useThumbnail;
