import { cardSelection } from '@/components/common/cardSelection';
import { useAlertDialogContext } from '@/components/reducers/useAlertDialogContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Source } from '@/data/models/source/source';
import useBlob from '@/hooks/data/sources/useBlob';
import useSource from '@/hooks/data/sources/useSource';
import useSources from '@/hooks/data/sources/useSources';
import useDialog from '@/hooks/ui/useDialog';
import useIsDarkImage from '@/hooks/ui/useIsDarkImage';
import useAppNavigation from '@/hooks/useAppNavigation';
import { cn } from '@/lib/utils';
import { ClipboardCopy, Clock, Cloud, Layers, Pen, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ManifestCardProps {
  source: Source;
  isHighlighted: boolean;
}

export function ManifestCard({ source, isHighlighted }: ManifestCardProps) {
  const { t } = useTranslation();
  const { goToManifestExplorer } = useAppNavigation();
  const { openDialog } = useAlertDialogContext();
  const { openForm } = useDialog();
  const { removeSourceFromLibrary } = useSources();
  const { thumbUrl } = useBlob(source.thumbnailBlobId);
  const { sourceWithContent } = useSource(source.id);
  const isDarkImage = useIsDarkImage(thumbUrl);

  const handleRemoveRemoteSource: React.MouseEventHandler<HTMLButtonElement> = (event) => {
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

  const handleUploadToCloud: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    void openForm('uploadSource', { sourceId: source.id });
  };

  const handleEditRemoteSource: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    if (sourceWithContent !== undefined) {
      void openForm('openManifest', { existingSource: sourceWithContent });
    }
  };

  const handleCopyToClipBoard: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.stopPropagation();
    if (
      sourceWithContent?.content.type === 'local' &&
      sourceWithContent.content.githubManifestUrl !== undefined
    ) {
      void navigator.clipboard.writeText(sourceWithContent.content.githubManifestUrl);
    }
  };

  return (
    <Card
      className={cn(
        'card-file relative flex min-w-40 flex-col overflow-hidden bg-primary',
        cardSelection,
      )}
      data-state={isHighlighted ? 'selected' : 'unselected'}
      style={{
        backgroundImage: thumbUrl !== null ? `url(${thumbUrl})` : undefined,
        backgroundSize: 'cover', // couvre tout le card
        backgroundPosition: 'center', // centre l'image
        backgroundRepeat: 'no-repeat', // évite la répétition
      }}
    >
      <Button
        type='button'
        variant='ghost'
        className='absolute inset-0 z-10 h-full w-full rounded-xl hover:bg-transparent focus-visible:ring-2 focus-visible:ring-inset'
        aria-label={source.name}
        onClick={() => void goToManifestExplorer(source.id)}
      />
      <CardContent
        className={cn(
          'pointer-events-none flex min-h-0 flex-1 flex-col items-end justify-end rounded-t-xl p-2',
          isDarkImage
            ? 'bg-sidebar/60 text-sidebar-foreground'
            : 'bg-primary/60 text-secondary-foreground',
        )}
        title={source.name}
      >
        <h3 className='font-bold wrap-anywhere'>{source.name}</h3>
        <div className='flex items-center space-x-2 text-sm'>
          <Layers size={14} /> <span>{source.pageCount} Pages</span>
        </div>
        {sourceWithContent?.content.type === 'local' && (
          <>
            <div className='flex items-center space-x-2 text-sm'>
              <Clock size={14} /> <span>{new Date().toLocaleDateString()}</span>
            </div>
            {sourceWithContent.content.githubManifestUrl !== undefined && (
              <Button
                type='button'
                variant='ghost'
                size='soft'
                className='pointer-events-auto relative z-20 h-auto gap-2 p-0 text-sm'
                title={sourceWithContent.content.githubManifestUrl}
                aria-label={t('menu_copy_clipboard')}
                onClick={handleCopyToClipBoard}
              >
                <Cloud size={14} /> <span className='truncate'>{t('info_manifest_online')}</span>
                <ClipboardCopy size={14} />
              </Button>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className='pointer-events-none relative z-20 flex shrink-0 justify-between rounded-b-xl bg-primary p-2'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleEditRemoteSource}
          className='pointer-events-auto h-7 w-7'
          title={t('btn_edit_source')}
          aria-label={t('btn_edit_source')}
          disabled={sourceWithContent === undefined}
        >
          <Pen size={20} className='text-success' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleUploadToCloud}
          title={t('btn_upload_to_cloud')}
          aria-label={t('btn_upload_to_cloud')}
          className='pointer-events-auto h-7 w-7 text-info'
        >
          <UploadCloud size={16} />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={handleRemoveRemoteSource}
          className='pointer-events-auto h-7 w-7'
          title={t('btn_delete_source')}
          aria-label={t('btn_delete_source')}
        >
          <Trash2 size={20} className='text-destructive' />
        </Button>
      </CardFooter>
    </Card>
  );
}
