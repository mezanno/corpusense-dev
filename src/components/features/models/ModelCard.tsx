import { cardSelection } from '@/components/common/cardSelection';
import { useAlertDialogContext } from '@/components/reducers/useAlertDialogContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { useModelIO } from '@/hooks/data/models/useModelIO';
import { cn } from '@/lib/utils';
import { Download, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// import ReactJsonView from '@microlink/react-json-view';

export function ModelCard({
  model,
  selectedModelId,
  setSelectedModelId,
}: {
  model: DataModel;
  selectedModelId: string | null;
  setSelectedModelId: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const { openDialog } = useAlertDialogContext();
  const { removeModel, exportModel } = useModelIO();

  const handleRemoveModel: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    openDialog({
      title: t('title_are_you_sure'),
      description: t('description_delete_model'),
      onConfirm: {
        message: t('btn_yes'),
        action: () => {
          void removeModel(model.id);
          if (selectedModelId === model.id) {
            setSelectedModelId(null);
          }
        },
      },
    });
  };

  const handleDownloadModel: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    void (async () => {
      await exportModel(model.id);
    })();
  };

  return (
    <Card
      className={cn(
        'card-model relative flex w-full max-w-[300px] flex-col justify-evenly overflow-hidden bg-primary/50 p-2 data-[state=selected]:bg-primary',
        cardSelection,
      )}
      data-state={model.id === selectedModelId ? 'selected' : 'unselected'}
    >
      <Button
        type='button'
        variant='ghost'
        className='absolute inset-0 z-10 h-full w-full rounded-xl hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset'
        aria-label={model.name}
        aria-pressed={model.id === selectedModelId}
        onClick={() => setSelectedModelId(model.id)}
      />
      <CardContent className='pointer-events-none flex w-full justify-between gap-1'>
        <h3 className='truncate text-left text-sm font-bold' title={model.name}>
          {model.name}
        </h3>
      </CardContent>
      <CardFooter className='pointer-events-none relative z-20 flex justify-end space-x-2'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleRemoveModel}
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          className='pointer-events-auto h-7 w-7 text-destructive'
        >
          <Trash2 size={20} />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleDownloadModel}
          title={t('btn_download_model')}
          aria-label={t('btn_download_model')}
          className='pointer-events-auto h-7 w-7 text-muted-foreground hover:text-foreground'
        >
          <Download size={20} />
        </Button>
      </CardFooter>
    </Card>
  );
}
