import z from 'zod';
import { TimeStampSchema } from '../timeStampSchema';

const FSHandleSchema = TimeStampSchema.extend({
  handle: z.instanceof(FileSystemDirectoryHandle),
});

export type FSHandle = z.infer<typeof FSHandleSchema>;
