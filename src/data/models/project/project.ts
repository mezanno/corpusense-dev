import z from 'zod';
import { TimeStampSchema } from '../timeStampSchema';

const ProjectSchema = TimeStampSchema.extend({
  name: z.string(),
  description: z.string().optional(),
  sources: z.array(z.string()), // Array of source IDs (could be IIIF manifests or local files)
  collections: z.array(z.string()), // Array of collection IDs
}).strict();

export type Project = z.infer<typeof ProjectSchema>;
