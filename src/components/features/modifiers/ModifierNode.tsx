import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Modifier } from '@/data/models/modifiers/Modifier';
import { modifierRegistry } from '@/data/models/modifiers/ModifierFactory';
import { Handle, Node, NodeProps, Position, useNodeConnections } from '@xyflow/react';
import { PlusCircle, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import z, { ZodObject, ZodRawShape } from 'zod';
import ModifierForm from './ModifierForm';

type ModifierNodeProps<TSchema extends ZodObject<ZodRawShape>> = {
  modifier: Modifier<TSchema>;
  initialValues: z.infer<TSchema>;
  onDelete: (modifierId: string) => void;
  onInsertAfter: (modifierId: string) => void;
  onInsertBefore: (modifierId: string) => void;
  onChange: (modifierId: string, values: z.infer<TSchema>) => void;
  onTypeChange: (id: string, newType: string) => void;
};

type ModifierNodeType = Node<ModifierNodeProps<ZodObject<ZodRawShape>>>;

const ModifierNode = ({ id, data }: NodeProps<ModifierNodeType>) => {
  const { t } = useTranslation();
  const { modifier, onDelete, onChange, onTypeChange, initialValues } = data;
  const connections = useNodeConnections({ id });

  const isSource = connections.some((conn) => conn.source === id);
  const isTarget = connections.some((conn) => conn.target === id);

  return (
    <>
      {isTarget ? (
        <Handle type='target' position={Position.Left} className='cursor-pointer'></Handle>
      ) : (
        <Handle
          position={Position.Left}
          type='target'
          style={{
            background: 'white',
            border: 'none',
            width: 25,
            height: 25,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            left: -12, // ajuste la position
          }}
          className='cursor-pointer'
        >
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='nodrag nopan pointer-events-auto h-6 w-6 [&_svg]:size-5'
            aria-label={t('btn_insert_modifier_before')}
            onClick={() => data.onInsertBefore(modifier.id)}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <PlusCircle />
          </Button>
        </Handle>
      )}
      <div
        className='flex max-w-50 flex-col items-end space-y-1 p-2 text-left'
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className='flex w-full justify-between'>
          <Select value={modifier.type} onValueChange={(value) => onTypeChange(modifier.id, value)}>
            <SelectTrigger>
              <SelectValue placeholder={t('form_placeholder_modifier')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(modifierRegistry).map(([key, entry]) => (
                <SelectItem key={key} value={key}>
                  {t(entry.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('btn_delete_modifier')}
            onClick={() => onDelete(modifier.id)}
            className='nodrag nopan h-8 w-8 text-muted-foreground hover:text-foreground'
          >
            <Trash size={16} />
          </Button>
        </div>

        <ModifierForm
          modifier={modifier}
          onChange={(formData) => onChange(modifier.id, formData)}
          initialValues={initialValues}
        />
      </div>
      {isSource ? (
        <Handle type='source' position={Position.Right}></Handle>
      ) : (
        <Handle
          position={Position.Right}
          type='source'
          style={{
            background: 'white',
            border: 'none',
            width: 25,
            height: 25,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            right: -12, // ajuste la position
          }}
        >
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='nodrag nopan pointer-events-auto h-6 w-6 [&_svg]:size-5'
            aria-label={t('btn_insert_modifier_after')}
            onClick={() => data.onInsertAfter(modifier.id)}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <PlusCircle />
          </Button>
        </Handle>
      )}
    </>
  );
};

export default ModifierNode;
