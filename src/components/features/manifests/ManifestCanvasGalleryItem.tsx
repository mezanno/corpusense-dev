import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Canvas } from '@iiif/presentation-3';

import GalleryThumbnail from '@/components/common/GalleryThumbnail';
import { galleryItemStyle } from '@/components/common/galleryItemStyle';
import { openContextMenuOnKeyDown } from '@/components/common/openContextMenuOnKeyDown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getLabel } from '@/data/utils/canvas';
import { useCollections } from '@/hooks/data/collections/useCollections';
import useThumbnail from '@/hooks/data/sources/useThumbnail';
import useDialog from '@/hooks/ui/useDialog';
import { useCanvasSelection } from '@/hooks/useCanvasSelection';
import { cn } from '@/lib/utils';
import { truncateMiddle } from '@/utils/utils';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ManifestCanvasGalleryItemProps {
  index: number;
  canvas: Canvas;
  sourceId: string;
  thumbWidth: number;
  thumbHeight: number;
  canvasToDisplay: Canvas | null;
  setCanvasToDisplay: (canvas: Canvas) => void;
}

const ManifestCanvasGalleryItem = ({
  index,
  canvas,
  sourceId,
  thumbWidth,
  thumbHeight,
  setCanvasToDisplay,
  canvasToDisplay,
}: ManifestCanvasGalleryItemProps) => {
  const { t } = useTranslation();
  const { collections, addSelectionToCollection } = useCollections();
  const {
    isSelected,
    hasSelectedElements,
    getSelectedCanvases,
    getSelectionCount,
    setSelectionEnd,
    setSelectionStart,
    setSelection,
  } = useCanvasSelection();

  const { openForm } = useDialog();
  const [search, setSearch] = useState<string>('');

  const filteredCollections = useMemo(() => {
    return collections.filter((col) => col.name.toLowerCase().includes(search.toLowerCase()));
  }, [collections, search]);

  const { thumbnail, isLoading, error } = useThumbnail({ canvas, sourceId });

  const thumbUrl = thumbnail?.[0]?.id;

  const handleSetSelectionStart = useCallback(() => {
    setSelectionStart(index);
  }, [index, setSelectionStart]);

  const handleSetSelectionEnd = useCallback(() => {
    setSelectionEnd(index);
  }, [index, setSelectionEnd]);

  const handleResetSelection = useCallback(() => {
    setSelection([]);
  }, [setSelection]);

  const handleAddSelectionToCollection = useCallback(
    (collectionId: string | undefined) => {
      void (async () => {
        if (collectionId === undefined) return;

        await addSelectionToCollection({
          selection: getSelectedCanvases(),
          collectionId,
          sourceId,
        });
      })();
    },
    [addSelectionToCollection, getSelectedCanvases, sourceId],
  );

  const handleOnClick = useCallback(() => {
    setCanvasToDisplay(canvas);
  }, [canvas, setCanvasToDisplay]);

  const handleCopyToClipboard = useCallback(() => {
    if (canvas.items !== undefined) {
      const body = canvas.items?.[0]?.items?.[0]?.body;
      if (body !== undefined && typeof body !== 'string' && 'id' in body && body.id !== undefined) {
        void navigator.clipboard.writeText(body.id);
      }
    }
  }, [canvas.items]);

  const handleCreateCollection = useCallback(() => {
    void openForm('newCollection', {
      params: { selection: getSelectedCanvases(), sourceId },
    });
  }, [openForm, getSelectedCanvases, sourceId]);

  const idDisplayed = canvasToDisplay?.id === canvas?.id;
  const match = canvas.id.match(/f\d+/);
  const canvasItemId = match ? match[0] : '';
  const itemIsSelected = isSelected(index);

  return (
    <>
      {/* modal={false} : fix a bug with the Dialog+ContextMenu : https://github.com/radix-ui/primitives/issues/1836 */}
      <ContextMenu modal={false}>
        <div className='no-select flex h-full w-full justify-center' draggable={false}>
          <ContextMenuTrigger>
            <div
              className={cn(
                galleryItemStyle,
                'selectable-item relative',
                itemIsSelected && 'ring-3 ring-ring',
              )}
              data-state={idDisplayed ? 'active' : 'inactive'}
              style={{ width: `${thumbWidth}px`, height: `${thumbHeight}px` }}
              onClick={handleOnClick}
              data-index={index}
              data-canvas-id={canvas.id}
              role='listitem'
            >
              <Button
                type='button'
                variant='ghost'
                className='pointer-events-none absolute inset-0 z-10 h-full w-full hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset'
                aria-label={t('btn_open_canvas', {
                  name: canvas.label ? getLabel(canvas) : index + 1,
                })}
                aria-pressed={idDisplayed}
                onKeyDown={openContextMenuOnKeyDown}
              />
              <GalleryThumbnail
                url={thumbUrl}
                isLoading={isLoading || thumbnail === null}
                error={error}
                alt={canvas.label ? getLabel(canvas) : 'canvas thumbnail'}
              />
              <div className='flex w-full justify-between p-1 text-xs'>
                {canvas.label !== undefined && canvas.label !== null && (
                  <span>{truncateMiddle(getLabel(canvas))}</span>
                )}
                <span className='text-muted-foreground italic'>{canvasItemId}</span>
              </div>
            </div>
          </ContextMenuTrigger>
        </div>

        <ContextMenuContent>
          {hasSelectedElements() && (
            <>
              <ContextMenuItem onClick={handleCreateCollection}>
                {t('menu_create_from_selection')}
              </ContextMenuItem>
              {collections?.length > 0 && (
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    {t('menu_add_selection_to_collection')}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    <div className='p-2'>
                      <Input
                        type='text'
                        placeholder={t('form_placeholder_search_collection')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='w-full rounded-md border px-2 py-1 text-sm'
                        autoFocus={true}
                      />
                    </div>
                    <ScrollArea className='h-96'>
                      {filteredCollections.map((col) => (
                        <ContextMenuItem
                          key={col.id}
                          onClick={() => handleAddSelectionToCollection(col.id)}
                        >
                          {col.name}
                        </ContextMenuItem>
                      ))}
                      {filteredCollections.length === 0 && (
                        <div className='p-2 text-sm text-muted-foreground'>
                          {t('info_no_results')}
                        </div>
                      )}
                    </ScrollArea>
                  </ContextMenuSubContent>
                </ContextMenuSub>
              )}
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={handleSetSelectionStart}>
            {t('menu_define_start')}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleSetSelectionEnd}>{t('menu_define_end')}</ContextMenuItem>
          {hasSelectedElements() && (
            <>
              <ContextMenuSeparator />

              <ContextMenuItem onClick={handleResetSelection}>
                {t('menu_reset_selection')}
              </ContextMenuItem>
            </>
          )}
          {getSelectionCount() <= 1 && (
            <>
              <ContextMenuSeparator />

              <ContextMenuItem onClick={handleCopyToClipboard}>
                {t('menu_copy_clipboard')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </>
  );
};

export default memo(ManifestCanvasGalleryItem);
