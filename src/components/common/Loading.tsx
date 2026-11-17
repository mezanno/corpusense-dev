import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';

const Loading = () => {
  const { t } = useTranslation();

  return (
    <div
      className='flex h-full w-full flex-col items-center justify-center text-muted-foreground'
      aria-busy='true'
      aria-live='polite'
      role='status'
    >
      <Spinner size={'large'} className='text-muted-foreground' />
      <span className='text-muted-foreground'>{t('info_loading')}</span>
    </div>
  );
};

export default Loading;
