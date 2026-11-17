import { Spinner } from '@/components/ui/spinner';
import { TaskStatus, WorkerStatus } from '@/data/models/worker/worker';
import { CalendarClock, CircleAlert, CircleCheck, Clock3, OctagonPause } from 'lucide-react';
import type { ReactNode } from 'react';

type StatusPresentation = {
  color: string;
  icon: ReactNode;
};

export const workerStatusPresentation: Record<WorkerStatus, StatusPresentation> = {
  [WorkerStatus.INPROGRESS]: {
    color: 'text-info',
    icon: <Spinner size='small' className='text-current' />,
  },
  [WorkerStatus.INPROGRESS_WITH_ERRORS]: {
    color: 'text-warning',
    icon: <Spinner size='small' className='text-current' />,
  },
  [WorkerStatus.COMPLETED]: {
    color: 'text-success',
    icon: <CircleCheck />,
  },
  [WorkerStatus.COMPLETED_WITH_ERRORS]: {
    color: 'text-destructive',
    icon: <CircleAlert />,
  },
  [WorkerStatus.UNFINISHED]: {
    color: 'text-muted-foreground',
    icon: <OctagonPause />,
  },
  [WorkerStatus.UNFINISHED_WITH_ERRORS]: {
    color: 'text-destructive',
    icon: <CircleAlert />,
  },
};

export const taskStatusPresentation: Record<TaskStatus, StatusPresentation> = {
  [TaskStatus.WAITING]: {
    color: 'text-warning',
    icon: <Clock3 size={20} />,
  },
  [TaskStatus.POSTING]: {
    color: 'text-info',
    icon: <Spinner size='small' className='text-current' />,
  },
  [TaskStatus.POSTED]: {
    color: 'text-info',
    icon: <CalendarClock />,
  },
  [TaskStatus.INPROGRESS]: {
    color: 'text-info',
    icon: <Spinner size='small' className='text-current' />,
  },
  [TaskStatus.COMPLETED]: {
    color: 'text-success',
    icon: null,
  },
  [TaskStatus.COMPLETED_WITH_ERRORS]: {
    color: 'text-destructive',
    icon: <CircleAlert size={20} />,
  },
};
