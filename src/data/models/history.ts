import z from 'zod';
import { TimeStampSchema } from './timeStampSchema';

const HistorySchema = TimeStampSchema.extend({
  url: z.string(),
});

export type History = z.infer<typeof HistorySchema>;
