import useReducedMotion from '@/hooks/ui/useReducedMotion';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

const LogConsole = ({
  children,
  scrollKey,
  className,
}: {
  children: ReactNode;
  scrollKey?: unknown;
  className?: string;
}) => {
  const endRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (scrollKey !== undefined)
      endRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
  }, [scrollKey, reducedMotion]);

  return (
    <div
      className={cn(
        'h-37.5 overflow-y-auto rounded-md bg-sidebar p-2 font-mono text-sm text-sidebar-foreground',
        className,
      )}
    >
      {children}
      <div ref={endRef} />
    </div>
  );
};

export default LogConsole;
