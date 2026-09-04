import { ElementType } from '@/data/models/annotations/annotation';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import useDialog from '@/hooks/ui/useDialog';
import { useTranslation } from 'react-i18next';
import { useAnnotationContext } from '../reducers/AnnotationContext';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import CollectionInspectorGalleryItem from './CollectionInspectorGalleryItem';

const CollectionInspectorGalleryItemMenu = ({
  canvasWithSourceId,
  collectionId,
  collectionContentIndex,
  colSize,
  setCanvasToDisplay,
  canvasToDisplay,
}: {
  canvasWithSourceId: CanvasWithSourceId;
  collectionId: string;
  collectionContentIndex: number;
  colSize: number;
  canvasToDisplay: CanvasWithSourceId | null;
  setCanvasToDisplay: (canvas: CanvasWithSourceId | null) => void;
}) => {
  const { t } = useTranslation();
  const { openDuplicateLayoutDialog } = useDialog();
  const { getAnnotationsByTypes } = useAnnotationContext();

  const regionAnnotations = getAnnotationsByTypes([ElementType.TEXT_REGION]);

  const handleDuplicateLayout = () => {
    openDuplicateLayoutDialog({
      canvasId: canvasWithSourceId.canvas.id,
      collectionId,
    });
  };

  return (
    <>
      {/* modal={false} : fix a bug with the Dialog+ContextMenu : https://github.com/radix-ui/primitives/issues/1836 */}
      <ContextMenu modal={false}>
        <ContextMenuTrigger>
          <CollectionInspectorGalleryItem
            canvasWithSourceId={canvasWithSourceId}
            collectionId={collectionId}
            collectionContentIndex={collectionContentIndex}
            thumbWidth={colSize}
            thumbHeight={150}
            setCanvasToDisplay={setCanvasToDisplay}
            canvasToDisplay={canvasToDisplay}
          />
        </ContextMenuTrigger>
        <ContextMenuContent>
          {regionAnnotations.length > 0 && (
            <ContextMenuItem onClick={handleDuplicateLayout}>
              {t('btn_duplicate_regions')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
};

export default CollectionInspectorGalleryItemMenu;
