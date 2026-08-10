import z from 'zod';

export const HistorySchema = z.object({
  url: z.string(),
});

export type History = z.infer<typeof HistorySchema>;
