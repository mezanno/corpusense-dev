import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';

const ProgressPanel = ({ progress }: { progress: number }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center space-x-2 border border-dashed bg-sidebar p-2 text-sidebar-foreground'>
      <p>{t('info_progress', { progress: progress })}</p>
      <Progress value={progress} className='flex-1' />
    </div>
  );
};

export default ProgressPanel;
