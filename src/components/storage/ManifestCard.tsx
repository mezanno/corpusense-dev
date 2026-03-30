import { Source } from '@/data/models/Sources';
import useBlob from '@/hooks/data/sources/useBlob';
import useSources from '@/hooks/data/sources/useSources';
import useAppNavigation from '@/hooks/useAppNavigation';
import { cn } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAlertDialogContext } from '../reducers/useAlertDialogContext';
import { Card, CardContent, CardFooter } from '../ui/card';

interface ManifestCardProps {
  source: Source;
  isHighlighted: boolean;
}

export function ManifestCard({ source, isHighlighted }: ManifestCardProps) {
  const { t } = useTranslation();
  const { goToManifestExplorer } = useAppNavigation();
  const { openDialog } = useAlertDialogContext();
  const { removeSourceFromLibrary } = useSources();
  const { thumbUrl } = useBlob(source.thumbnailBlobId);

  const handleRemoveRemoteSource: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    openDialog({
      title: t('title_are_you_sure'),
      description: t('description_delete_converted_file'),
      onConfirm: {
        message: t('btn_yes'),
        action: () => void removeSourceFromLibrary(source.id),
      },
    });
  };

  return (
    <Card
      className={cn(
        'card-file flex min-w-40 flex-col bg-white',
        isHighlighted && 'border-4 border-primary-foreground',
      )}
      onClick={() => void goToManifestExplorer(source.id)}
      style={{
        backgroundImage: thumbUrl !== null ? `url(${thumbUrl})` : undefined,
        backgroundSize: 'cover', // couvre tout le card
        backgroundPosition: 'center', // centre l'image
        backgroundRepeat: 'no-repeat', // évite la répétition
        cursor: 'pointer',
      }}
    >
      <CardContent className='flex h-fit w-full flex-1 items-end rounded-t-xl p-0'>
        <h3
          className='w-full bg-white/50 p-1 text-center text-sm font-bold text-secondary-foreground'
          title={source.name}
        >
          {source.name}
        </h3>
      </CardContent>
      <CardFooter
        className='cursor-pointer justify-end rounded-b-xl bg-white p-1 text-red-400 hover:text-red-600'
        onClick={handleRemoveRemoteSource}
      >
        <Trash2 size={14} />
      </CardFooter>
    </Card>
  );
}
