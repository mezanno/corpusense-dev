import z from 'zod';
import { ScopeSchema } from '../scope/scope';
import { WorkerCreateDTOSChema } from './worker.dto';

export enum WorkerStatus {
  ALL = 'all', // Special status to represent all workers
  WAITING = 'waiting', // Worker is waiting to be processed
  INPROGRESS = 'inprogress', // Worker is currently being processed
  POSTED = 'posted', // Worker has been posted to an external service
  INPROGRESS_WITH_ERRORS = 'inprogress_with_errors', // Worker is being processed but encountered errors
  UNFINISHED = 'unfinished', // Worker has been processed but not completed
  UNFINISHED_WITH_ERRORS = 'unfinished_with_errors', // Worker has been processed but not completed and encountered errors
  COMPLETED = 'completed', // Worker has been successfully completed
  ERROR = 'error', // Worker encountered an error during processing
  COMPLETED_WITH_ERRORS = 'completed_with_errors', // Worker has been completed but with errors
}

export const WorkerStatusSchema = z.enum(WorkerStatus);

export const TaskSchema = z
  .object({
    id: z.number(),
    scope: ScopeSchema,
    status: WorkerStatusSchema,
    statusMessage: z.string().optional(),
    previousTask: z
      .object({
        workerId: z.string(),
        taskId: z.number(),
      })
      .optional(),
  })
  .strict();

export type Task = z.infer<typeof TaskSchema>;

export const WorkerSchema = WorkerCreateDTOSChema.extend({
  scopeKey: z.string(),
  status: WorkerStatusSchema,
  statusMessage: z.string().optional(),
  createdAt: z.string(),
  estimatedDuration: z.number(),
  queue: z.array(TaskSchema),
}).strict();

export type Worker = z.infer<typeof WorkerSchema>;

export const WorkerResponseSchema = z
  .object({
    status: WorkerStatusSchema,
    statusMessage: z.string().optional(),
    content: z.unknown().optional(),
  })
  .strict();

export type WorkerResponse = z.infer<typeof WorkerResponseSchema>;
