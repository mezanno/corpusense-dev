import AsyncState from '@/components/common/AsyncState';
import CollectionTable from '@/components/features/collections/CollectionTable';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useCollections } from '@/hooks/data/collections/useCollections';
import useDialog from '@/hooks/ui/useDialog';
import { FilePlus, Import, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CollectionsManagerPage = () => {
  const { t } = useTranslation();
  const { collections, isLoading } = useCollections();
  const { openForm } = useDialog();

  const handleNewCollection = () => {
    void openForm('newCollection', {});
  };

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader
        title={t('page_title_collection_manager')}
        icon={List}
        actions={
          <>
            <Button
              variant='soft'
              size='soft'
              title={t('btn_create_collection')}
              onClick={handleNewCollection}
            >
              <FilePlus />
              {t('btn_create_collection')}
            </Button>
            <Button
              variant='soft'
              size='soft'
              title={t('btn_import_collection')}
              onClick={() => void openForm('importCollection', {})}
            >
              <Import />
              {t('btn_import_collection')}
            </Button>
          </>
        }
      />

      <AsyncState
        isLoading={isLoading}
        isEmpty={collections.length === 0}
        emptyMessage={t('info_no_collection')}
      >
        <section className='flex min-h-0 w-full flex-1 flex-col items-center gap-1'>
          <h2 className='text-xl'>
            <strong>{t('info_number_of_collections', { number: collections.length })}</strong>
          </h2>
          <CollectionTable />
        </section>
      </AsyncState>
    </div>
  );
};

export default CollectionsManagerPage;
