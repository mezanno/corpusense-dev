import { workerPlugins } from '@/App';
import { useWorkerContext } from '@/components/reducers/WorkerContext';
import { WorkerStatus } from '@/data/models/worker/worker';
import { getWorkerRepository } from '@/data/repositories/indexeddb/dbFactory';
import { updateTaskStatus } from '@/data/utils/worker';
import { JobRow, supabase } from '@/utils/config';
import {
  REALTIME_SUBSCRIBE_STATES,
  RealtimeChannel,
  RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

const useJobRealtime = () => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { getPostedWorkers } = useWorkerContext();

  const workersPosted = getPostedWorkers();
  const workersPostedRef = useRef(workersPosted);

  useEffect(() => {
    workersPostedRef.current = workersPosted;
  }, [workersPosted]);

  useEffect(() => {
    // Serializes async work per worker id, so concurrent polling/realtime updates for the same worker never overlap
    const workerLocks = new Map<string, Promise<unknown>>();
    const withWorkerLock = <T,>(workerId: string, task: () => Promise<T>): Promise<T> => {
      const previous = workerLocks.get(workerId) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(task);
      workerLocks.set(
        workerId,
        run.catch(() => undefined),
      );
      return run;
    };

    /**
     * Processes a single task update from a Supabase JobRow.
     * Re-reads the worker from IndexedDB (must be called under withWorkerLock) to avoid acting on stale state.
     * Deletes completed jobs from Supabase.
     */
    const processSingleTask = async (workerId: string, job: JobRow) => {
      const workerRepository = getWorkerRepository();
      const workerResult = await workerRepository.getById(workerId);
      if (!workerResult.ok) {
        console.warn(`Worker not found: ${workerId}`);
        return;
      }
      const worker = workerResult.value;
      const task = worker.queue.find((t) => t.id === job.task_id);

      if (!task) {
        console.warn(`Task not found in worker ${worker.id} for task_id: ${job.task_id}`);
        return;
      }

      // Map Supabase job status to WorkerStatus
      const statusMap: Record<string, WorkerStatus> = {
        pending: WorkerStatus.POSTED,
        processing: WorkerStatus.INPROGRESS,
        failed: WorkerStatus.ERROR,
        completed: WorkerStatus.COMPLETED,
      };
      let taskStatus = statusMap[job.status] ?? WorkerStatus.ERROR;
      let statusMessage = '';

      // Skip processing if task is already finished locally; only clean up Supabase if it was a success
      if (task.status === WorkerStatus.COMPLETED || task.status === WorkerStatus.ERROR) {
        if (task.status === WorkerStatus.COMPLETED && job.status === 'completed') {
          await supabase.from('cs_jobs').delete().eq('id', job.id);
        }
        return;
      }

      // Handle successful results
      if (job.status === 'completed') {
        const plugin = workerPlugins[job.plugin_name];

        if (job.result !== null && plugin?.processResult) {
          try {
            const response = await plugin.processResult(job.result, task, job.worker_category);
            if (response.status === WorkerStatus.ERROR) {
              taskStatus = WorkerStatus.ERROR;
              statusMessage = response.statusMessage ?? 'Plugin processing error';
            }
          } catch (error) {
            console.error(`Error in processResult for plugin ${job.plugin_name}:`, error);
            taskStatus = WorkerStatus.ERROR;
            statusMessage = 'Result processing failed';
          }
        }
      } else if (job.status === 'failed') {
        // Handle failures
        statusMessage = typeof job.error === 'string' ? job.error : JSON.stringify(job.error);
      }

      // Update the local queue
      const updatedQueue = updateTaskStatus(worker.queue, task.id, taskStatus, statusMessage);

      // Determine the overall worker status based on the entire queue
      const allFinished = updatedQueue.every(
        (t) => t.status === WorkerStatus.COMPLETED || t.status === WorkerStatus.ERROR,
      );
      const anyError = updatedQueue.some((t) => t.status === WorkerStatus.ERROR);

      let overallStatus: WorkerStatus;
      if (allFinished) {
        overallStatus = anyError ? WorkerStatus.COMPLETED_WITH_ERRORS : WorkerStatus.COMPLETED;
      } else {
        // If not all tasks are finished, it's either in progress or in progress with errors
        overallStatus = anyError ? WorkerStatus.INPROGRESS_WITH_ERRORS : WorkerStatus.INPROGRESS;
      }

      // Persist changes to IndexedDB
      await workerRepository.patch(worker.id, {
        status: overallStatus,
        queue: updatedQueue,
      });

      // Only remove the job once it succeeded and its result was processed without error; keep it otherwise for troubleshooting
      if (job.status === 'completed' && taskStatus === WorkerStatus.COMPLETED) {
        const { error } = await supabase
          .from('cs_jobs')
          .delete()
          .eq('task_id', task.id)
          .eq('worker_id', worker.id);

        if (error) console.error('Error deleting processed job from Supabase:', error);
      }
    };

    /**
     * Fetches updates from Supabase for all workers currently in POSTED state.
     */
    const fetchJobUpdates = async () => {
      const postedWorkers = workersPostedRef.current;
      for (const worker of postedWorkers) {
        const { data, error } = await supabase
          .from('cs_jobs')
          .select('*')
          .eq('worker_id', worker.id);

        if (error) {
          console.error(`Error fetching updates for worker ${worker.id}:`, error);
          continue;
        }

        if (data?.length) {
          for (const job of data) {
            await withWorkerLock(worker.id, () => processSingleTask(worker.id, job));
          }
        } else {
          // No job left in Supabase for this worker: everything it posted succeeded, mark it completed (never delete)
          await withWorkerLock(worker.id, () => {
            // Mark all tasks as completed if they are still in progress, since Supabase has no record of them anymore
            const currentQueue = worker.queue;
            const updatedQueue = currentQueue.map((task) => {
              return { ...task, status: WorkerStatus.COMPLETED };
            });
            return getWorkerRepository().patch(worker.id, {
              status: WorkerStatus.COMPLETED,
              queue: updatedQueue,
            });
          });
        }
      }
    };

    /**
     * Handles live updates from Supabase Realtime.
     */
    const handleJobRowUpdate = async (payload: RealtimePostgresUpdatePayload<JobRow>) => {
      const job = payload.new;
      try {
        await withWorkerLock(job.worker_id, () => processSingleTask(job.worker_id, job));
      } catch (error) {
        console.error('Error processing realtime job update:', error);
      }
    };

    // Initialize Realtime Subscription
    const channel = supabase
      .channel('job-updates')
      .on<JobRow>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cs_jobs' },
        (payload) => void handleJobRowUpdate(payload),
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          console.log('Successfully subscribed to REALTIME job updates');
        }
      });

    channelRef.current = channel;

    // Trigger initial sync immediately
    void fetchJobUpdates();

    // Setup periodic polling every 20 seconds
    const interval = setInterval(() => {
      void fetchJobUpdates();
    }, 20000);

    return () => {
      clearInterval(interval);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
};

export default useJobRealtime;
