import z from 'zod';
import { AnnotationDTO } from './Annotation';
import { CollectionElementSchema } from './CollectionElement';
import { DataModelSchema } from './DataModel';
import { ResultSchema } from './Result';
import { TagSchema } from './Tag';
import { ObjectWithStringIdSchema } from './utils';
import { WorkerSchema } from './Worker';

export const CollectionDetailsSchema = ObjectWithStringIdSchema.extend({
  id: z.string(),
  name: z.string(),
  about: z.string().optional(),
  tags: z.array(z.string()),
  modelId: z.string().optional(),
  contentSize: z.number(),
  offline: z.boolean(),
  postLayoutModifierChainId: z.string().optional(),
  postOcrModifierChainId: z.string().optional(),
});

export type CollectionDetails = z.infer<typeof CollectionDetailsSchema>;

export const CollectionContentSchema = ObjectWithStringIdSchema.extend({
  content: z.array(CollectionElementSchema),
});

export type CollectionContent = z.infer<typeof CollectionContentSchema>;

export const CollectionSchema = CollectionDetailsSchema.extend(CollectionContentSchema.shape);

export type Collection = z.infer<typeof CollectionSchema>;

export const ExportedCollectionSchema = z.object({
  collection: CollectionSchema,
  tags: z.array(TagSchema).optional(),
  annotations: z.array(z.custom<AnnotationDTO>()).optional(),
  model: DataModelSchema.optional(),
  workers: z.array(WorkerSchema).optional(),
  results: z.array(ResultSchema).optional(),
});

export type ExportedCollection = z.infer<typeof ExportedCollectionSchema>;
