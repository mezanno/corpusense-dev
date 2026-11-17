import NothingToShow from '@/components/common/NothingToShow';
import ScopeLabel from '@/components/common/ScopeLabel';
import { useAlertDialogContext } from '@/components/reducers/useAlertDialogContext';
import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { Button } from '@/components/ui/button';
import {
  canInterruptWorker,
  canRecoverWorker,
  isTaskWaiting,
} from '@/data/models/worker/workerStatusLaw';
import useWorkers from '@/hooks/data/workers/useWorkers';
import { useAppDispatch } from '@/hooks/hooks';
import useDialog from '@/hooks/ui/useDialog';
import { recoverWorkerRequest, stopWorkerProcessRequest } from '@/state/reducers/workers';
import { CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { taskStatusPresentation } from './statusPresentation';

const WorkerDetails = ({ workerId }: { workerId: string }) => {
  const { t } = useTranslation();
  const appDispatch = useAppDispatch();
  const worker = useWorkerContext().getWorkerById(workerId);
  const resultExists = useWorkerContext().hasResult(workerId);
  const { removeResult } = useWorkers();
  const { openForm } = useDialog();
  const { openDialog } = useAlertDialogContext();

  if (worker === undefined) {
    return <NothingToShow message={t('info_no_worker_selected')} />;
  }

  const displayRestartButton = canRecoverWorker(worker.status);
  const displayStopButton = canInterruptWorker(worker.status);

  const handleRecoverWorker = () => {
    appDispatch(recoverWorkerRequest(worker));
  };

  const handleStopWorker = () => {
    appDispatch(stopWorkerProcessRequest(worker));
  };

  const handleExportResult = () => {
    void openForm('selectFormat', { worker });
  };

  const handleRemoveResult = (taskId: number) => {
    openDialog({
      title: t('title_are_you_sure'),
      description: t('description_delete_worker'),
      onConfirm: {
        message: t('btn_yes'),
        action: () => void removeResult(workerId, taskId),
      },
    });
  };

  return (
    <div className='flex h-full w-full flex-col p-2'>
      {/* Partie haute : infos worker + boutons */}
      <div className='w-full'>
        <h2 className='text-lg font-bold'>{t('title_worker_details')}</h2>

        <ul className='my-2 w-full border-b pb-2'>
          <li>
            {t('list_title_worker_name')} : {worker.name}
          </li>
          <li className='my-2 border-b pb-2'>
            {t('list_title_worker_createdAt')} {new Date(worker.createdAt).toLocaleString()}
          </li>
          <li className='my-2 w-full border-b pb-2'>
            {t('list_title_worker_scope')} : <ScopeLabel scope={worker.scope} />
          </li>
          <li>
            {t('list_title_worker_status')} : {t(`worker_status_${worker.status}`)}
          </li>
        </ul>

        <div className='flex gap-2'>
          {displayRestartButton && (
            <Button variant='recovery' size='soft' onClick={handleRecoverWorker}>
              {t('btn_recover')}
            </Button>
          )}
          {displayStopButton && (
            <Button variant='stop' size='soft' onClick={handleStopWorker}>
              {t('btn_stop_worker')}
            </Button>
          )}
          {resultExists && (
            <Button variant='export' size='soft' onClick={handleExportResult}>
              {t('btn_export_result', { name: worker.name })}
            </Button>
          )}
        </div>
      </div>

      {/* Partie basse : liste scrollable */}
      <div className='mt-3 min-h-0 flex-1 overflow-y-auto rounded-md p-2'>
        <h3 className='text-md mt-2 font-semibold'>
          {t('title_worker_queue')}{' '}
          <span>({t('info_worker_queue_size', { size: worker.queue.length })})</span>
        </h3>

        <ul className='p-1'>
          {worker.queue.map((task) => (
            <li
              key={task.id}
              className={`flex items-center gap-2 ${taskStatusPresentation[task.status].color}`}
            >
              <span
                className={`rounded-md px-2 py-1 text-sm ${taskStatusPresentation[task.status].color} bg-opacity-10`}
              >
                {taskStatusPresentation[task.status].icon}
              </span>
              <strong>{t('table_col_title_taskID')}</strong> {task.id} -{' '}
              <strong>{t('table_col_title_status')}</strong> {t(`worker_status_${task.status}`)}
              {task.statusMessage !== undefined && (
                <span>
                  - <em>{task.statusMessage}</em>
                </span>
              )}
              {!isTaskWaiting(task.status) && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-7 w-7 hover:scale-110'
                  aria-label={t('btn_delete_task_result', { id: task.id })}
                  onClick={() => handleRemoveResult(task.id)}
                >
                  <CircleX />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default WorkerDetails;
