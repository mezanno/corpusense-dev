import useLiveSources from '@/hooks/data/sources/useLiveSources';
import useDialog from '@/hooks/ui/useDialog';
import { Globe, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/card';
import { ManifestCard } from './ManifestCard';

const IIIFSourcesDashboard = () => {
  const { t } = useTranslation();
  const { openOpenManifestDialog } = useDialog();
  const { remoteSources } = useLiveSources();
  const [lastManifestAddedId, setLastManifestAddedId] = useState<string | null>(null);

  const onManifestAdded = (newSourceId: string) => {
    setLastManifestAddedId(newSourceId);
  };

  return (
    <div className='flex h-full flex-col'>
      <h1 className='flex items-center text-2xl font-bold'>
        <Globe className='mr-2' /> {t('page_title_iiif_storage')}
      </h1>

      <div className='flex max-h-[70vh] flex-wrap gap-2 overflow-y-auto'>
        <Card
          className='card-file border-dashed'
          onClick={() => openOpenManifestDialog(onManifestAdded)}
        >
          <CardContent className='flex h-full w-full flex-col items-center justify-center text-secondary hover:text-primary'>
            <Plus size={48} />
            <span className='text-center'>{t('btn_add_pdf')}</span>
          </CardContent>
        </Card>

        {remoteSources.map((source) => (
          <ManifestCard
            key={source.id}
            source={source}
            isHighlighted={source.id === lastManifestAddedId}
          />
        ))}
      </div>
    </div>
  );
};

export default IIIFSourcesDashboard;
