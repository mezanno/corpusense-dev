import z from 'zod';

export const FSHandleSchema = z.object({
  id: z.string(),
  handle: z.instanceof(FileSystemDirectoryHandle),
});

export type FSHandle = z.infer<typeof FSHandleSchema>;
