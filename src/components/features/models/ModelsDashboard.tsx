import AddCardButton from '@/components/common/AddCardButton';
import AsyncState from '@/components/common/AsyncState';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useModels } from '@/hooks/data/models/useModels';
import useDialog from '@/hooks/ui/useDialog';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModelCard } from './ModelCard';

const ModelsDashboard = ({
  selectedModelId,
  setSelectedModelId,
}: {
  selectedModelId: string | null;
  setSelectedModelId: (id: string | null) => void;
}) => {
  const { t } = useTranslation();
  const { openForm } = useDialog();
  const { models, isLoading } = useModels();

  return (
    <ScrollArea className='h-full w-full pr-3'>
      <div className='flex w-full flex-col space-y-2'>
        <div className='flex gap-1'>
          <AddCardButton
            className='w-1/2 p-1 text-sm'
            iconSize={20}
            label={t('btn_create_model')}
            onClick={() => void openForm('createModel', {})}
          />
          <AddCardButton
            className='w-1/2 text-sm'
            icon={Download}
            iconSize={20}
            label={t('btn_import_model')}
            onClick={() => void openForm('importModel', {})}
          />
        </div>

        <AsyncState
          isLoading={isLoading}
          isEmpty={models.length === 0}
          emptyMessage={t('info_no_models')}
        >
          {models.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              setSelectedModelId={setSelectedModelId}
              selectedModelId={selectedModelId}
            />
          ))}
        </AsyncState>
      </div>
      <ScrollBar orientation='vertical' />
    </ScrollArea>
  );
};

export default ModelsDashboard;
