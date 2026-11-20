import { cardSelection } from '@/components/common/cardSelection';
import { useAlertDialogContext } from '@/components/reducers/useAlertDialogContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ModifierChainDTO } from '@/data/models/modifiers/modifierChain.dto';
import useModifierChainIO from '@/hooks/data/modifiers/useModifierChainIO';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ModifierChainCard({
  chain,
  selectedChainId,
  setSelectedChainId,
}: {
  chain: ModifierChainDTO;
  selectedChainId: string | null;
  setSelectedChainId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const { openDialog } = useAlertDialogContext();
  const { removeModifierChain } = useModifierChainIO();

  const handleRemoveModifierChain: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    openDialog({
      title: t('title_are_you_sure'),
      description: t('description_delete_modifierchain'),
      onConfirm: {
        message: t('btn_yes'),
        action: () => {
          void removeModifierChain(chain.id);
          if (selectedChainId === chain.id) {
            setSelectedChainId(null);
          }
        },
      },
    });
  };

  return (
    <Card
      className={cn(
        'card-model relative flex flex-col justify-evenly overflow-hidden bg-primary/50 data-[state=selected]:bg-primary',
        cardSelection,
      )}
      data-state={chain.id === selectedChainId ? 'selected' : 'unselected'}
    >
      <Button
        type='button'
        variant='ghost'
        className='absolute inset-0 z-10 h-full w-full rounded-xl hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset'
        aria-label={chain.name}
        aria-pressed={chain.id === selectedChainId}
        onClick={() => setSelectedChainId(chain.id)}
      />
      <CardContent className='pointer-events-none flex flex-col justify-center'>
        <h3 className='font-bold wrap-break-word' title={chain.name}>
          {chain.name}
        </h3>
      </CardContent>
      <CardFooter className='pointer-events-none relative z-20 flex justify-end space-x-2'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleRemoveModifierChain}
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          className='pointer-events-auto h-7 w-7 text-destructive'
        >
          <Trash2 size={20} />
        </Button>
      </CardFooter>
    </Card>
  );
}
