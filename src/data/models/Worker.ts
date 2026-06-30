import z from 'zod';
import { ScopeSchema } from './Scope';

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

export const WorkerCreateDTOSChema = z
  .object({
    id: z.string(),
    name: z.string(),
    scope: ScopeSchema,
    params: z.unknown(),
  })
  .strict();

export type WorkerCreateDTO = z.infer<typeof WorkerCreateDTOSChema>;

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

/*
 * Type guard to check if an object is a Worker.
 * This is used to differentiate between Worker and WorkerCreateDTO. A worker has an id, scopeKey, status, and createdAt properties.
 */
export function isWorker(obj: Worker | WorkerCreateDTO): obj is Worker {
  return 'id' in obj && 'scopeKey' in obj && 'status' in obj && 'createdAt' in obj;
}
