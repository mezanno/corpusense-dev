import { Button } from '@/components/ui/button';
import { StepBack, StepForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CanvasNavigation = ({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex w-full justify-center space-x-2 p-2'>
      {hasPrevious && (
        <Button
          variant='soft'
          size='soft'
          onClick={onPrevious}
          title={t('btn_previous_canvas')}
          aria-label={t('btn_previous_canvas')}
        >
          <StepBack size={14} />
        </Button>
      )}
      {hasNext && (
        <Button
          variant='soft'
          size='soft'
          onClick={onNext}
          title={t('btn_next_canvas')}
          aria-label={t('btn_next_canvas')}
        >
          <StepForward size={14} />
        </Button>
      )}
    </div>
  );
};

export default CanvasNavigation;
