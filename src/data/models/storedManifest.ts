import { ContentResource, Manifest } from '@iiif/presentation-3';
import z from 'zod';
import { TimeStampSchema } from './timeStampSchema';

const ManifestSchema = z.custom<Manifest>();
const ContentResourceSchema = z.custom<ContentResource>();

const StoredManifestDetailsSchema = TimeStampSchema.extend({
  name: z.string(),
  thumbnail: ContentResourceSchema.optional(),
});

const StoredManifestContentSchema = TimeStampSchema.extend({
  content: ManifestSchema,
});

export type StoredManifestDetails = z.infer<typeof StoredManifestDetailsSchema>;
export type StoredManifestContent = z.infer<typeof StoredManifestContentSchema>;
