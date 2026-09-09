import { Collection } from '@/data/models/collection/collection';
import { useAnnotationActions } from '@/hooks/data/annotations/useAnnotationActions';
import useDialog from '@/hooks/ui/useDialog';
import { Copy, DownloadIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButtonWithTooltip } from '../IconButtonWithTooltip';
import { useWorkerContext } from '../reducers/WorkerContext';
import Toolbar from '../ToolBar';

const CollectionToolbar = memo(function CollectionToolbarFunc({
  collection,
}: {
  collection: Collection;
}) {
  const { t } = useTranslation();
  const { openRemoveAnnotationsDialog, openDupicateCollectionDialog, openExportCollectionDialog } =
    useDialog();
  const isWorkerRunning = useWorkerContext().isWorkerOrTaskRunning({ collectionId: collection.id });

  const { recomputeRegions } = useAnnotationActions();

  if (isWorkerRunning) {
    return (
      <div className='panel'>
        <strong>{t('info_worker_running')}</strong>
      </div>
    );
  }

  const handleDeleteAllAnnotations = () => {
    openRemoveAnnotationsDialog({ collectionId: collection.id });
  };

  const handleRecomputeRegions = () => {
    void (async () => {
      await recomputeRegions(collection.id);
    })();
  };

  const handleDuplicate = () => {
    openDupicateCollectionDialog(collection);
  };

  const handleExport = () => {
    openExportCollectionDialog([collection.id]);
  };

  return (
    <div className='flex gap-2'>
      <Toolbar
        handleDeleteAllAnnotations={handleDeleteAllAnnotations}
        handleRecomputeRegions={handleRecomputeRegions}
        scope={{ collectionId: collection.id }}
      />
      <IconButtonWithTooltip tooltip={t('btn_duplicate')} onClick={() => void handleDuplicate()}>
        <Copy />
      </IconButtonWithTooltip>
      <button
        className='soft-button'
        onClick={handleExport}
        aria-label={t('btn_export_collection')}
        title={t('btn_export_collection')}
      >
        <DownloadIcon />
      </button>
    </div>
  );
});

export default CollectionToolbar;
