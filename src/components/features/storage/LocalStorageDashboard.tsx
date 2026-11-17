import AddCardButton from '@/components/common/AddCardButton';
import AsyncState from '@/components/common/AsyncState';
import useLiveSources from '@/hooks/data/sources/useLiveSources';
import useDialog from '@/hooks/ui/useDialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ManifestCard } from './ManifestCard';

const LocalStorageDashboard = () => {
  const { t } = useTranslation();
  const { openForm } = useDialog();
  const { localSources, isLoadingLocalSources } = useLiveSources();

  const [lastManifestAddedId, setLastManifestAddedId] = useState<string | null>(null);

  const onManifestAdded = (newSourceId: string) => {
    setLastManifestAddedId(newSourceId);
  };

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex h-full flex-wrap content-start gap-2 overflow-y-auto'>
        <AddCardButton
          className='h-60 w-[180px]'
          iconSize={48}
          label={t('btn_add_pdf')}
          onClick={() => {
            void openForm('convertPdf', {}).then((sourceId) => {
              if (sourceId !== undefined) onManifestAdded(sourceId);
            });
          }}
        />

        <AsyncState
          isLoading={isLoadingLocalSources}
          isEmpty={localSources.length === 0}
          emptyMessage={t('info_no_local_sources')}
        >
          {localSources.map((source) => (
            <ManifestCard
              key={source.id}
              source={source}
              isHighlighted={source.id === lastManifestAddedId}
            />
          ))}
        </AsyncState>
      </div>
    </div>
  );
};

export default LocalStorageDashboard;
