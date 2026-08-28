import z from 'zod';

export type WithStringId = { id: string };

export const ObjectWithStringIdSchema = z
  .object({
    id: z.string(),
  })
  .strict();
