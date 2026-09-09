import { Scope } from '@/data/models/scope/scope';
import { WorkerStatus } from '@/data/models/worker/worker';
import { CalendarClock } from 'lucide-react';
import { BarLoader, ClipLoader, GridLoader } from 'react-spinners';
import { useWorkerContext } from '../reducers/WorkerContext';

const WorkerStatusIcon = ({ scope }: { scope: Scope }) => {
  const status = useWorkerContext().getStatus(scope);
  if (status === undefined) {
    return null;
  }
  if (status == WorkerStatus.WAITING) {
    return <ClipLoader size={20} />;
  }
  if (status == WorkerStatus.POSTING) {
    return <BarLoader />;
  }
  if (status == WorkerStatus.POSTED) {
    return <CalendarClock size={20} />;
  }
  if (status == WorkerStatus.INPROGRESS || status == WorkerStatus.INPROGRESS_WITH_ERRORS) {
    return <GridLoader size={10} />;
  }
};
export default WorkerStatusIcon;
