import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

const AddCardButton = ({
  label,
  onClick,
  className,
  icon: Icon = Plus,
  iconSize = 24,
  disabled = false,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  icon?: LucideIcon;
  iconSize?: number;
  disabled?: boolean;
}) => (
  <Button
    type='button'
    variant='ghost'
    size='soft'
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'flex flex-col gap-0 rounded-xl border-2 border-dashed border-primary bg-card-foreground whitespace-normal text-primary shadow-sm transition duration-150 ease-linear hover:-translate-y-0.5 hover:border-foreground hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
  >
    <Icon style={{ width: iconSize, height: iconSize }} aria-hidden='true' />
    <span className='text-center'>{label}</span>
  </Button>
);

export default AddCardButton;
