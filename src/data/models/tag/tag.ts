import z from 'zod';
import { TimeStampSchema } from '../timeStampSchema';

export const TagSchema = TimeStampSchema.extend({
  label: z.string(),
  category: z.string().optional(),
}).strict();

export type Tag = z.infer<typeof TagSchema>;
