import { CircleSlash2 } from 'lucide-react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const NothingToShow = ({ children, message }: { children?: ReactNode; message?: string }) => {
  const { t } = useTranslation();

  return (
    <div className='flex w-full flex-col items-center space-y-2 text-muted-foreground'>
      <CircleSlash2 size={64} aria-hidden='true' />
      <div className='text-2xl'>{message ?? t('error_nothing_toshow')}</div>
      {children}
    </div>
  );
};

export default NothingToShow;
