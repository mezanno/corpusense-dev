import CanvasViewer from '@/components/canvasViewer/CanvasViewer';
import { useAnnotationContext } from '@/components/reducers/AnnotationContext';
import { useCollectionContext } from '@/components/reducers/CollectionContext';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import useKeyboard from '@/hooks/ui/useKeyboard';
import { useVirtualizer } from '@tanstack/react-virtual';
import 'gridstack/dist/gridstack.min.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AutoSizer from 'react-virtualized-auto-sizer';
import LlmStatus from '../collectionPage/LlmStatus';
import OcrStatus from '../collectionPage/OcrStatus';
import { useCollectionInspectorContext } from '../reducers/CollectionInspectorContext';
import ResultsAvailable from '../ResultsAvailable';
import CollectionInspectorHeader from './CollectionInspectorHeader';
import CollectionToolbar from './CollectionToolbar';
import GridThumb from './GridThumb';

const CollectionInspectorContent = ({
  collectionId,
  defaultCanvasId,
}: {
  collectionId: string;
  defaultCanvasId: string | null;
}) => {
  const { t } = useTranslation();
  const {
    collection,
    canvases,
    getCanvasById,
    setCanvasToDisplay,
    canvasToDisplay,
    handleNext,
    handlePrevious,
  } = useCollectionInspectorContext();
  const { openCollection } = useCollectionContext();
  const { setScope } = useAnnotationContext();
  const canvas = defaultCanvasId !== null ? getCanvasById(defaultCanvasId) : null;

  const [colCount, setColCount] = useState(5);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onKeyPressed = (key: string) => {
    if (key === 'ArrowRight') {
      handleNext();
    } else if (key === 'ArrowLeft') {
      handlePrevious();
    }
  };

  useKeyboard({ onKeyPressed });

  useEffect(() => {
    return () => {
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    openCollection(collectionId);
  }, [collectionId]);

  useEffect(() => {
    setCanvasToDisplay(canvas);
  }, [collectionId, canvas?.canvas.id]);

  useEffect(() => {
    if (canvasToDisplay !== null) {
      setScope({ canvasId: canvasToDisplay.canvas.id, collectionId });
    }
  }, [canvasToDisplay]);

  // calcule les lignes en fonction des colonnes
  const rowCount = Math.ceil(collection?.contentSize ?? 0 / colCount);

  /** Virtualizer vertical (pour les lignes) */
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    gap: 10,
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 165 + 10, // hauteur de ligne
    overscan: 2,
  });

  /** Virtualizer horizontal (pour les colonnes) */
  const colVirtualizer = useVirtualizer({
    gap: 10,
    horizontal: true,
    count: colCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 100, // largeur (sera mise à jour dynamiquement)
    overscan: 2,
  });

  const currentCollectionScope = useMemo(
    () => ({
      collectionId,
    }),
    [collectionId],
  );

  return (
    <section className='h-full max-h-full w-full max-w-full'>
      <ResizablePanelGroup direction='horizontal'>
        <ResizablePanel className='mr-1 flex min-h-0 min-w-0' minSize={30}>
          {collection ? (
            <div className='flex h-full max-h-full w-full max-w-full flex-col gap-2'>
              <CollectionInspectorHeader {...collection} />
              {collection.content.length > 0 && (
                <div className='flex w-full items-center justify-between'>
                  <CollectionToolbar collection={collection} />
                  <div className='flex items-center gap-2'>
                    <OcrStatus collectionId={collectionId} />
                    <LlmStatus collectionId={collectionId} />
                    <ResultsAvailable scope={currentCollectionScope} />
                  </div>
                </div>
              )}
              <div className='panel h-full w-full overflow-hidden'>
                {collection.contentSize > 0 ? (
                  <AutoSizer
                    onResize={(size) => {
                      setColCount(Math.max(2, Math.floor(size.width / 115)));
                    }}
                  >
                    {({ width, height }) => {
                      return (
                        <div
                          ref={containerRef}
                          style={{
                            width,
                            height,
                            overflow: 'auto',
                            position: 'relative',
                          }}
                        >
                          <div
                            className='m-2'
                            style={{
                              height: `${rowVirtualizer.getTotalSize()}px`,
                              width: `${colVirtualizer.getTotalSize()}px`,
                              position: 'relative',
                            }}
                          >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                              <Fragment key={virtualRow.key}>
                                {colVirtualizer.getVirtualItems().map((virtualColumn) => {
                                  const index = virtualRow.index * colCount + virtualColumn.index;

                                  if (index >= canvases.length) return null;
                                  const gtCanvas = canvases[index];
                                  if (gtCanvas === null || gtCanvas === undefined) return null;
                                  // console.log('gtCanvas ', gtCanvas);

                                  return (
                                    <div
                                      key={`${virtualRow.key}-${virtualColumn.key}`}
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: `${virtualColumn.size}px`,
                                        height: `${virtualRow.size}px`,
                                        transform: `translateX(${virtualColumn.start}px) translateY(${virtualRow.start}px)`,
                                      }}
                                    >
                                      <GridThumb
                                        canvasWithSourceId={gtCanvas}
                                        collectionId={collection.id}
                                        collectionContentIndex={index}
                                        thumbWidth={virtualColumn.size}
                                        thumbHeight={virtualRow.size}
                                        setCanvasToDisplay={setCanvasToDisplay}
                                        canvasToDisplay={canvasToDisplay}
                                      />
                                    </div>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  </AutoSizer>
                ) : (
                  <div className='flex h-full w-full items-center justify-center text-muted-foreground'>
                    {t('info_empty_collection')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className='p-4 text-center text-muted-foreground'>
              {t('info_empty_collection')}
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle className='w-1 cursor-col-resize bg-dark-slate-gray' />
        <ResizablePanel className='ml-1 flex-1 overflow-hidden' minSize={30}>
          {canvasToDisplay === null ? (
            <div className='panel flex h-full w-full items-center justify-center text-2xl text-red-500'>
              {t('info_no_canvas_selected')}
            </div>
          ) : (
            <div className='flex h-full w-full flex-col'>
              <CanvasViewer
                collectionId={collectionId}
                sourceId={canvasToDisplay.sourceId}
                canvas={canvasToDisplay.canvas}
                setCanvasToDisplay={setCanvasToDisplay}
              />
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
};

export default CollectionInspectorContent;
