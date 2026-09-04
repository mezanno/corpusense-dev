import WorkerStatusIcon from '@/components/workers/WorkerStatusIcon';
import { getLabel } from '@/data/utils/canvas';
import useOcrAnnotations from '@/hooks/data/annotations/useOcrAnnotations';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { useCollections } from '@/hooks/data/collections/useCollections';
import useConvertedFileIO from '@/hooks/data/convertedFiles/useConvertedFileIO';
import useThumbnail from '@/hooks/data/sources/useThumbnail';
import { useSortable } from '@dnd-kit/react/sortable';
import { Thumbnail } from '@samvera/clover-iiif/primitives';
import 'gridstack/dist/gridstack.min.css';
import { CircleX, SpellCheck, SpellCheck2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AutoSizer from 'react-virtualized-auto-sizer';
import Loading from '../Loading';
import { useWorkerContext } from '../reducers/WorkerContext';

const CollectionInspectorGalleryItem = ({
  canvasWithSourceId,
  collectionId,
  collectionContentIndex,
  thumbWidth,
  thumbHeight,
  setCanvasToDisplay,
  canvasToDisplay,
}: {
  canvasWithSourceId: CanvasWithSourceId;
  collectionId: string;
  collectionContentIndex: number;
  thumbWidth: number;
  thumbHeight: number;
  canvasToDisplay: CanvasWithSourceId | null;
  setCanvasToDisplay: (canvas: CanvasWithSourceId | null) => void;
}) => {
  const { t } = useTranslation();
  const scope = useMemo(
    () => ({ collectionId, canvasId: canvasWithSourceId.canvas.id }),
    [collectionId, canvasWithSourceId.canvas.id],
  );
  const isWorkerRunning = useWorkerContext().isWorkerOrTaskRunning(scope);
  const idDisplayed = canvasToDisplay?.canvas.id === canvasWithSourceId.canvas.id;
  const hasOcrAnnotations = useOcrAnnotations(scope).hasOcrAnnotations;
  const { removeElementFromCollection } = useCollections();
  const { requestPermission } = useConvertedFileIO();

  const { thumbnail, error } = useThumbnail(canvasWithSourceId);

  const [element, setElement] = useState<HTMLDivElement | null>(null);

  const { isDragging } = useSortable({
    id: canvasWithSourceId.canvas.id,
    index: canvasWithSourceId.position,
    element,
  });

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.stopPropagation();
    void (async () => {
      await removeElementFromCollection(collectionId, canvasWithSourceId.canvas.id);
      if (canvasToDisplay?.canvas.id === canvasWithSourceId.canvas.id) {
        setCanvasToDisplay(null);
      }
    })();
  };

  const handleOnClick = async () => {
    if (error === null) {
      setCanvasToDisplay(canvasWithSourceId);
    } else {
      await requestPermission();
    }
  };

  const match = canvasWithSourceId.canvas.id.match(/f\d+/);
  const canvasItemId = match ? match[0] : '';

  return (
    <div
      ref={setElement}
      className={`group flex h-fit w-fit cursor-pointer flex-col items-center rounded-md p-1 shadow transition duration-200 hover:scale-105 ${idDisplayed ? 'bg-saffron-400' : 'bg-saffron-900'} `}
      style={{
        width: `${thumbWidth}px`,
        height: `${thumbHeight}px`,
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={() => void handleOnClick()}
      role='listitem'
    >
      <div className='flex w-full justify-between text-xs'>
        <div className='w-fit rounded-xl bg-white p-1 shadow'>
          {hasOcrAnnotations ? (
            <SpellCheck size={16} color='green' />
          ) : (
            <SpellCheck2 size={16} color='red' />
          )}
        </div>
        <span>{collectionContentIndex + 1}</span>
        {!isWorkerRunning && (
          <button
            className='cursor-pointer opacity-0 group-hover:opacity-100 hover:scale-110'
            title={t('btn_delete_collection')}
            onClick={handleDelete}
          >
            <CircleX className='text-red-400 hover:text-red-800' />
          </button>
        )}
      </div>
      {error !== null ? (
        <div className='text-sm wrap-anywhere text-red-400'>{error}</div>
      ) : thumbnail !== null ? (
        <div className='w-fit flex-1'>
          <AutoSizer disableWidth>
            {({ height }) => (
              <Thumbnail
                thumbnail={thumbnail}
                style={{ width: 'auto', height: `${height}px`, objectFit: 'contain' }}
                aria-label='canvas thumbnail'
              />
            )}
          </AutoSizer>
        </div>
      ) : (
        <Loading />
      )}
      <div className='flex w-full justify-between p-1 text-xs'>
        {canvasWithSourceId.canvas.label !== undefined &&
          canvasWithSourceId.canvas.label !== null && (
            <span>{getLabel(canvasWithSourceId.canvas)}</span>
          )}
        <span className='text-dark-slate-gray-300 italic'>{canvasItemId}</span>
      </div>
      <WorkerStatusIcon scope={scope} />
    </div>
  );
};

export default CollectionInspectorGalleryItem;
