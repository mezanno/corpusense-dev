import { ConvertedFile } from '@/data/models/ConvertedFile';
import useConvertedFileIO from '@/hooks/data/convertedFiles/useConvertedFileIO';
import useDialog from '@/hooks/ui/useDialog';
import useAppNavigation from '@/hooks/useAppNavigation';
import { ClipboardCopy, Clock, Cloud, Layers, Trash2, UploadCloud } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlertDialogContext } from '../reducers/useAlertDialogContext';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';

interface FileCardProps {
  file: ConvertedFile;
}

export function FileCard({ file }: FileCardProps) {
  const { t } = useTranslation();
  const { removeConvertedFile } = useConvertedFileIO();
  const { goToManifestExplorer } = useAppNavigation();
  const { openDialog } = useAlertDialogContext();
  const { openUploadSourceDialog } = useDialog();

  const thumbUrl = useMemo(() => URL.createObjectURL(file.thumbnailBlob), [file.thumbnailBlob]);

  const handleUploadToCloud: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    openUploadSourceDialog({ sourceId: file.id });
  };

  const handleRemoveConvertedFile: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    openDialog({
      title: t('title_are_you_sure'),
      description: t('description_delete_converted_file'),
      onConfirm: {
        message: t('btn_yes'),
        action: () => void removeConvertedFile(file.id),
      },
    });
  };

  const handleCopyToClipBoard: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.stopPropagation();
    if (file.githubManifestUrl !== undefined) {
      void navigator.clipboard.writeText(file.githubManifestUrl);
    }
  };

  return (
    <Card
      className='card-file flex flex-col overflow-hidden bg-white'
      onClick={() => void goToManifestExplorer({ indexeddbId: file.id })}
      style={{ cursor: 'pointer' }}
    >
      <CardHeader className='overflow-hidden'>
        <img src={thumbUrl} alt={file.title} className='rounded-t-xl object-cover' />
      </CardHeader>
      <CardContent className='flex flex-col justify-center'>
        <h3 className='font-bold' title={file.title}>
          {file.title}
        </h3>
        <div className='flex items-center space-x-2 text-sm'>
          <Layers size={14} /> <span>{file.pageCount} Pages</span>
        </div>
        <div className='flex items-center space-x-2 text-sm'>
          <Clock size={14} /> <span>{new Date(file.timestamp).toLocaleDateString()}</span>
        </div>
        {file.githubManifestUrl !== undefined && (
          <div
            className='flex items-center space-x-2 text-sm'
            title={file.githubManifestUrl}
            onClick={handleCopyToClipBoard}
          >
            <Cloud size={14} /> <span className='truncate'>This is online!</span>
            <ClipboardCopy size={14} />
          </div>
        )}
      </CardContent>
      <CardFooter className='justify cursor-pointer justify-between'>
        <div
          onClick={handleUploadToCloud}
          title={t('btn_upload_to_cloud')}
          aria-label={t('btn_upload_to_cloud')}
          className='text-blue-400 hover:text-blue-600'
        >
          <UploadCloud size={16} />
        </div>
        <div
          onClick={handleRemoveConvertedFile}
          title={t('btn_delete')}
          aria-label={t('btn_delete')}
          className='text-red-400 hover:text-red-600'
        >
          <Trash2 size={16} />
        </div>
      </CardFooter>
    </Card>
  );
}
