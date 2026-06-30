import z from 'zod';

export const ItemMetadataAttributeSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const ItemMetadataSchema = z.object({
  id: z.string(),
  attribute: ItemMetadataAttributeSchema,
});

export type ItemMetadata = z.infer<typeof ItemMetadataSchema>;
export type ItemMetadataAttribute = z.infer<typeof ItemMetadataAttributeSchema>;
