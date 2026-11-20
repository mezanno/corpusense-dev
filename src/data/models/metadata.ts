import z from 'zod';
import { TimeStampSchema } from './timeStampSchema';

const ItemMetadataAttributeSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const ItemMetadataSchema = TimeStampSchema.extend({
  attribute: ItemMetadataAttributeSchema,
});

export type ItemMetadata = z.infer<typeof ItemMetadataSchema>;
