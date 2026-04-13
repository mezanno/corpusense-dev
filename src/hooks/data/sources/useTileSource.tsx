import { useCollectionContext } from '@/components/reducers/CollectionContext';
import { getImage } from '@/data/utils/canvas';
import { Canvas, ImageService } from '@iiif/presentation-3';
import { Cozy } from 'cozy-iiif';
import { TileSource } from 'openseadragon';
import { useEffect, useState } from 'react';
import useSources from './useSources';

const useTileSource = ({ canvas, sourceId }: { canvas: Canvas; sourceId: string }) => {
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<TileSource[] | null>([]);
  const { getSourceWithContent } = useSources();
  const { getLocalObjectUrl } = useCollectionContext();

  useEffect(() => {
    const fetchThumbnail = async () => {
      setError(null);
      const sourceWithContent = await getSourceWithContent(sourceId);
      const parsedManifest = Cozy.parse(sourceWithContent.content.manifest);

      if (sourceWithContent.content.type === 'local' && parsedManifest.type === 'manifest') {
        const imageUrl = parsedManifest.resource.canvases[0].getImageURL();
        const objectUrl = await getLocalObjectUrl(
          imageUrl,
          sourceWithContent.content.localFile.outputDirectoryHandle,
        );
        setSource([{ url: objectUrl, type: 'image' }] as unknown as TileSource[]);
      } else {
        const image = getImage(canvas);
        if (image?.service?.length != null && image.service.length > 0) {
          const service = image.service[0] as ImageService;
          if (service !== undefined) {
            const id = service['@id'] ?? service.id;
            if (id !== undefined) {
              setSource([`${id}/info.json`] as unknown as TileSource[]);
            }
          }
        }
      }
    };

    void fetchThumbnail();
  }, [canvas, sourceId]);

  return { source, error };
};

export default useTileSource;
