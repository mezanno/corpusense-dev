import { WorkerStatus } from '@/data/models/worker/worker';
import { Pickaxe } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkerContext } from '../reducers/WorkerContext';
import WorkerDurationCounter from './WorkerDurationCounter';

const CollectionWorkerCounters = ({ collectionId }: { collectionId: string }) => {
  const { getWorkersByScopeAndStatus } = useWorkerContext();

  const runningWorkers = useMemo(
    () =>
      getWorkersByScopeAndStatus({ collectionId }, [
        WorkerStatus.INPROGRESS,
        WorkerStatus.INPROGRESS_WITH_ERRORS,
        WorkerStatus.POSTING,
        WorkerStatus.WAITING,
      ]),
    [collectionId, getWorkersByScopeAndStatus],
  );

  return (
    <div className='flex w-full flex-col gap-1'>
      {runningWorkers.map((worker) => (
        <div className='flex gap-2' key={`${worker.id}-${worker.estimatedDuration}`}>
          <p className='flex items-baseline gap-1 font-semibold'>
            <Pickaxe size={10} />
            {worker.name}
            <WorkerDurationCounter estimatedDuration={worker.estimatedDuration} />
          </p>
        </div>
      ))}
    </div>
  );
};

export default CollectionWorkerCounters;
