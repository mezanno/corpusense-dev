import { Toggle } from '@/components/ui/toggle';
import { CanvasScope } from '@/data/models/scope/scope';
import { generateTextWithAnnotationIdFromCanvas, TextWithAnnotationId } from '@/data/utils/export';
import { useHover } from '@annotorious/react';
import { Magnet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AutoSizer from 'react-virtualized-auto-sizer';

const CanvasViewerText = ({
  scope,
  setHovered,
}: {
  scope: CanvasScope;
  setHovered: (id: string | null) => void;
}) => {
  const { t } = useTranslation();
  const hover = useHover();
  const [text, setText] = useState<TextWithAnnotationId>([]);
  const [snapToAnnotation, setSnapToAnnotation] = useState(false);

  useEffect(() => {
    async function fetchText() {
      const txt = await generateTextWithAnnotationIdFromCanvas(scope.canvasId, scope.collectionId);
      setText(txt);
    }
    void fetchText();
  }, [scope]);

  const divText = useMemo(
    () =>
      text.map((line, i) => (
        <div
          key={i}
          className={`mb-1 min-h-5 rounded-md border border-input/30 pr-1 pl-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${hover?.id === line.annotationId ? 'bg-accent' : ''}`}
          tabIndex={snapToAnnotation ? 0 : undefined}
          onFocus={() => {
            if (snapToAnnotation) setHovered(line.annotationId);
          }}
          onBlur={() => {
            if (snapToAnnotation) setHovered(null);
          }}
          onMouseOver={() => {
            if (snapToAnnotation) setHovered(line.annotationId);
          }}
        >
          {line.text}
        </div>
      )),
    [text, hover, setHovered, snapToAnnotation],
  );

  return (
    <div className='flex h-full w-1/2'>
      <div>
        <Toggle
          size='icon'
          className='m-1 p-1'
          aria-label={t('btn_highlight_text_annotation')}
          pressed={snapToAnnotation}
          onPressedChange={setSnapToAnnotation}
        >
          <Magnet />
        </Toggle>
      </div>
      <div className='flex-1 overflow-y-auto'>
        <AutoSizer>
          {({ width, height }) => {
            return (
              <div
                style={{
                  width,
                  height,
                  overflow: 'auto',
                  position: 'relative',
                  marginRight: '1px',
                }}
              >
                {divText}
              </div>
            );
          }}
        </AutoSizer>
      </div>
    </div>
  );
};

export default CanvasViewerText;
