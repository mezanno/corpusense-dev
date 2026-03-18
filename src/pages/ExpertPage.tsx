import { useTranslation } from 'react-i18next';

const ExpertPage = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full w-full flex-col'>
      <h1 className='mb-4 text-2xl font-bold'>Tiens tiens tiens</h1>
      <div className='grid h-full w-full grid-cols-4 gap-4'>
        <div className='m-1 rounded-md border p-2'>{t('nav_sources')}</div>
        <div className='m-1 rounded-md border p-2'>{t('page_title_collection_manager')}</div>
        <div className='m-1 rounded-md border p-2'>{t('page_title_models_manager')}</div>
        <div className='m-1 rounded-md border p-2'>{t('page_title_modifierchain_manager')}</div>
        <div className='m-1 rounded-md border p-2'>{t('page_title_workers_manager')}</div>
      </div>
    </div>
  );
};

export default ExpertPage;
