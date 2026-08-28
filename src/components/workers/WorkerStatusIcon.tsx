import { Scope } from '@/data/models/scope/scope';
import { WorkerStatus } from '@/data/models/worker/worker';
import { ClipLoader, GridLoader } from 'react-spinners';
import { useWorkerContext } from '../reducers/WorkerContext';

const WorkerStatusIcon = ({ scope }: { scope: Scope }) => {
  const status = useWorkerContext().getStatus(scope);
  if (status === undefined) {
    return null;
  }
  if (status == WorkerStatus.WAITING) {
    return (
      <div className='absolute inset-0 flex items-center justify-center'>
        <ClipLoader size={20} />
      </div>
    );
  }
  if (status == WorkerStatus.INPROGRESS || status == WorkerStatus.INPROGRESS_WITH_ERRORS) {
    return (
      <div className='absolute inset-0 flex items-center justify-center'>
        <GridLoader size={10} />
      </div>
    );
  }
};
export default WorkerStatusIcon;
