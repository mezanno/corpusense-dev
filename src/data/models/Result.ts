import z from 'zod';
import { ScopeSchema } from './Scope';

export const ResultCreateDTOSchema = z
  .object({
    scope: ScopeSchema,
    workerName: z.string(),
    workerCategory: z.string().optional(),
    workerId: z.string(),
    taskId: z.number(),
    value: z.unknown(),
    params: z.unknown(),
  })
  .strict();

export type ResultCreateDTO = z.infer<typeof ResultCreateDTOSchema>;

export const ResultSchema = ResultCreateDTOSchema.extend({
  id: z.number(),
  scopeKey: z.string(),
}).strict();

export type Result = z.infer<typeof ResultSchema>;
