import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  data: {
    onAdd: () => void;
  };
};

const AddNode = ({ data }: Props) => {
  const { t } = useTranslation();
  return (
    <Button
      type='button'
      variant='ghost'
      size='soft'
      onClick={data.onAdd}
      onKeyDown={(event) => event.stopPropagation()}
      className='nodrag nopan flex h-auto cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-primary p-8 hover:border-primary [&_svg]:size-8'
    >
      <Plus size={32} />
      <span>{t('btn_add_first_modifier')}</span>
    </Button>
  );
};

export default AddNode;
