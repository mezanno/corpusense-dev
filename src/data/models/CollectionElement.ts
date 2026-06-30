import z from 'zod';

export const CollectionElementSchema = z.object({
  canvasId: z.string(),
  sourceId: z.string(),
  position: z.number(),
  manifestId: z.string().optional(),
});

export type CollectionElement = z.infer<typeof CollectionElementSchema>;
