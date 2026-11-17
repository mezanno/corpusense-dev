import LocalStorageDashboard from '@/components/features/storage/LocalStorageDashboard';
import PageHeader from '@/components/layout/PageHeader';
import { Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const StoragePage = () => {
  const { t } = useTranslation();

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader title={t('page_title_local_storage')} icon={Archive} />
      <LocalStorageDashboard />
    </div>
  );
};

export default StoragePage;
