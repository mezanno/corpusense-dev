import { Collection } from '@/data/models/collection';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { useVirtualizer } from '@tanstack/react-virtual';
import 'gridstack/dist/gridstack.min.css';
import { Fragment, useEffect, useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import GridThumb from './GridThumb';

type Props = {
  collection: Collection;
  canvases: CanvasWithSourceId[];
  setCanvasToDisplay: (canvas: CanvasWithSourceId | null) => void;
  canvasToDisplay: CanvasWithSourceId | null;
};

const CollectionInspectorGallery = (props: Props) => {
  const { collection, canvases, setCanvasToDisplay, canvasToDisplay } = props;
  const [colCount, setColCount] = useState(5);

  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    return () => {
      containerRef.current = null;
    };
  }, []);

  // calcule les lignes en fonction des colonnes
  const rowCount = Math.ceil(collection.contentSize ?? 0 / colCount);

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

  return (
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
  );
};

export default CollectionInspectorGallery;
