import GalleryThumbnail from '@/components/common/GalleryThumbnail';
import { galleryItemStyle } from '@/components/common/galleryItemStyle';
import { openContextMenuOnKeyDown } from '@/components/common/openContextMenuOnKeyDown';
import WorkerStatusIcon from '@/components/features/workers/WorkerStatusIcon';
import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { Button } from '@/components/ui/button';
import { getLabel } from '@/data/utils/canvas';
import useOcrAnnotations from '@/hooks/data/annotations/useOcrAnnotations';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { useCollections } from '@/hooks/data/collections/useCollections';
import useConvertedFileIO from '@/hooks/data/convertedFiles/useConvertedFileIO';
import useThumbnail from '@/hooks/data/sources/useThumbnail';
import { cn } from '@/lib/utils';
import 'gridstack/dist/gridstack.min.css';
import { CircleX, GripVertical, SpellCheck, SpellCheck2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const CollectionInspectorGalleryItemContent = ({
  canvasWithSourceId,
  collectionId,
  collectionContentIndex,
  thumbWidth,
  thumbHeight,
  setCanvasToDisplay,
  canvasToDisplay,
  isDragging,
  dragHandleRef,
}: {
  canvasWithSourceId: CanvasWithSourceId;
  collectionId: string;
  collectionContentIndex: number;
  thumbWidth: number;
  thumbHeight: number;
  canvasToDisplay: CanvasWithSourceId | null;
  setCanvasToDisplay: (canvas: CanvasWithSourceId | null) => void;
  isDragging: boolean;
  dragHandleRef: (element: Element | null) => void;
}) => {
  const { t } = useTranslation();
  const { isWorkerOrTaskRunning } = useWorkerContext();
  const scope = useMemo(
    () => ({ collectionId, canvasId: canvasWithSourceId.canvas.id }),
    [collectionId, canvasWithSourceId.canvas.id],
  );
  // D3 (DECISIONS.md D-008, closee 2026-10-12) : verrou volontairement scope collection —
  // un traitement en cours verrouille toute la galerie, pas seulement le canvas traite.
  // Ne pas « corriger » en scope canvas lors du port UI de R1.
  const isWorkerRunning = isWorkerOrTaskRunning({ collectionId });
  const idDisplayed = canvasToDisplay?.canvas.id === canvasWithSourceId.canvas.id;
  const hasOcrAnnotations = useOcrAnnotations(scope).hasOcrAnnotations;
  const { removeElementFromCollection } = useCollections();
  const { requestPermission } = useConvertedFileIO();

  const { thumbnail, isLoading, error } = useThumbnail(canvasWithSourceId);
  const thumbUrl = thumbnail?.[0]?.id;

  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return null;
  }

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.stopPropagation();
    setDeleting(true);
    void (async () => {
      const removeResult = await removeElementFromCollection(
        collectionId,
        canvasWithSourceId.canvas.id,
      );
      if (!removeResult.ok) {
        setDeleting(false);
      } else {
        if (canvasToDisplay?.canvas.id === canvasWithSourceId.canvas.id) {
          setCanvasToDisplay(null);
        }
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
      className={cn(galleryItemStyle, 'relative')}
      data-state={idDisplayed ? 'active' : 'inactive'}
      style={{
        width: `${thumbWidth}px`,
        height: `${thumbHeight}px`,
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={() => void handleOnClick()}
      role='listitem'
    >
      <Button
        type='button'
        variant='ghost'
        className='pointer-events-none absolute inset-0 z-10 h-full w-full hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset'
        aria-label={t('btn_open_canvas', {
          name: canvasWithSourceId.canvas.label
            ? getLabel(canvasWithSourceId.canvas)
            : collectionContentIndex + 1,
        })}
        aria-pressed={idDisplayed}
        onKeyDown={openContextMenuOnKeyDown}
      />
      <div className='flex w-full justify-between text-xs'>
        <div className='w-fit rounded-xl bg-primary p-1 shadow'>
          {hasOcrAnnotations ? (
            <SpellCheck size={16} className='text-success' />
          ) : (
            <SpellCheck2 size={16} className='text-destructive' />
          )}
        </div>
        <span>{collectionContentIndex + 1}</span>
        <Button
          ref={dragHandleRef}
          type='button'
          variant='ghost'
          size='icon'
          className='relative z-20 h-auto w-auto cursor-grab p-0 focus-visible:ring-2'
          aria-label={t('btn_reorder_canvas', {
            name: canvasWithSourceId.canvas.label
              ? getLabel(canvasWithSourceId.canvas)
              : collectionContentIndex + 1,
          })}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical />
        </Button>
        {!isWorkerRunning && (
          <Button
            variant='ghost'
            size='icon'
            className='relative z-20 h-auto w-auto cursor-pointer p-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:scale-110 [&_svg]:size-6'
            title={t('btn_delete_collection')}
            onClick={handleDelete}
          >
            <CircleX className='text-destructive' />
          </Button>
        )}
      </div>
      <GalleryThumbnail
        url={thumbUrl}
        isLoading={isLoading || thumbnail === null}
        error={error}
        alt={canvasWithSourceId.canvas.label ? getLabel(canvasWithSourceId.canvas) : ''}
      />
      <div className='flex w-full justify-between p-1 text-xs'>
        {canvasWithSourceId.canvas.label !== undefined &&
          canvasWithSourceId.canvas.label !== null && (
            <span>{getLabel(canvasWithSourceId.canvas)}</span>
          )}
        <span className='text-muted-foreground italic'>{canvasItemId}</span>
      </div>
      <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
        <WorkerStatusIcon scope={scope} />
      </div>
    </div>
  );
};

export default CollectionInspectorGalleryItemContent;
