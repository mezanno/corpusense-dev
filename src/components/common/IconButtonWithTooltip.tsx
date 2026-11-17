import { Button, ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReactNode } from 'react';

type IconButtonWithTooltipProps = {
  tooltip: string;
  children: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
};

export function IconButtonWithTooltip({
  tooltip,
  children,
  onClick,
  className = '',
  disabled = false,
  variant = 'soft',
}: IconButtonWithTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <Button
          className={className}
          variant={variant}
          size='icon'
          type='button'
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(event);
          }}
          aria-label={tooltip}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent key='top' align='center'>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
