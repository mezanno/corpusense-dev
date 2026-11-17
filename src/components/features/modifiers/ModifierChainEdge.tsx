import { Button } from '@/components/ui/button';
import {
  BaseEdge,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getSimpleBezierPath,
  Position,
} from '@xyflow/react';
import { PlusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ModifierChainEdgeProps = {
  modifierSourceId: string;
  onInsertAfter: (modifierId: string) => void;
};

type ModifierChainEdgeType = Edge<ModifierChainEdgeProps>;

const ModifierChainEdge = ({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
}: EdgeProps<ModifierChainEdgeType>) => {
  const { t } = useTranslation();
  if (!data) return null; // sécurité TS
  const { modifierSourceId, onInsertAfter } = data;

  const handleAddNode = () => {
    onInsertAfter(modifierSourceId);
  };

  const [edgePath, labelX, labelY] = getSimpleBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetPosition: Position.Right,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <Button
          variant='ghost'
          size='icon'
          aria-label={t('btn_insert_modifier')}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className='nodrag nopan h-auto w-auto cursor-pointer rounded-xl bg-primary p-0 [&_svg]:size-5'
          onClick={handleAddNode}
        >
          <PlusCircle size={20} />
        </Button>
      </EdgeLabelRenderer>
    </>
  );
};

export default ModifierChainEdge;
