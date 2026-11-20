import { z } from 'zod';
import { TimeStampSchema } from './timeStampSchema';

const ConvertedFileSchema = TimeStampSchema.extend({
  title: z.string(),
  pageCount: z.number().int().nonnegative(),
  thumbnailBlob: z.instanceof(Blob),
  outputDirectoryHandle: z.instanceof(FileSystemDirectoryHandle),
  timestamp: z.number(),
  manifestName: z.string(),
  folderName: z.string(),
  githubManifestUrl: z.string().optional(),
}).strict();

export type ConvertedFile = z.infer<typeof ConvertedFileSchema>;
