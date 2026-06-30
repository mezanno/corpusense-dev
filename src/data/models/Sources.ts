import { Manifest } from '@iiif/presentation-3';
import z from 'zod';

export const SourceTypeSchema = z.enum(['local', 'remote']);

export type SourceType = z.infer<typeof SourceTypeSchema>;

export const StoredBlobSchema = z
  .object({
    id: z.string(),
    blob: z.instanceof(Blob),
  })
  .strict();

export type StoredBlob = z.infer<typeof StoredBlobSchema>;

export const SourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: SourceTypeSchema,
    pageCount: z.number().int().nonnegative(),
    thumbnailBlobId: z.string(),
  })
  .strict();

export type Source = z.infer<typeof SourceSchema>;

const ManifestSchema = z.custom<Manifest>();

const LocalFileSchema = z
  .object({
    outputDirectoryHandle: z.instanceof(FileSystemDirectoryHandle),
    timestamp: z.number(),
    manifestName: z.string(),
    folderName: z.string(),
  })
  .strict();

export const SourceContentSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('remote'),
    manifest: ManifestSchema,
  }),

  z.object({
    id: z.string(),
    type: z.literal('local'),
    manifest: ManifestSchema,
    localFile: LocalFileSchema,
    githubManifestUrl: z.string().optional(),
  }),
]);

export type SourceContent = z.infer<typeof SourceContentSchema>;

export const SourceWithContentSchema = SourceSchema.extend({
  content: SourceContentSchema,
});

export type SourceWithContent = z.infer<typeof SourceWithContentSchema>;

export const AddSourceDTOSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('remote'),
    name: z.string(),
    pageCount: z.number().int().nonnegative(),
    thumbnailBlob: z.instanceof(Blob),
    manifest: ManifestSchema,
  }),

  z.object({
    type: z.literal('local'),
    name: z.string(),
    pageCount: z.number().int().nonnegative(),
    thumbnailBlob: z.instanceof(Blob),
    manifest: ManifestSchema,
    localFile: LocalFileSchema,
  }),
]);

export type AddSourceDTO = z.infer<typeof AddSourceDTOSchema>;
