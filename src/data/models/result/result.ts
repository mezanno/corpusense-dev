import { v4 as uuid } from 'uuid';
import z from 'zod';
import { TimeStampSchema } from '../timeStampSchema';
import { ResultCreateDTOSchema } from './result.dto';

export const ResultSchema = TimeStampSchema.extend(ResultCreateDTOSchema.shape)
  .extend({
    scopeKey: z.string(),
  })
  .strict();

export type Result = z.infer<typeof ResultSchema>;

// Collection exports produced before the timestamp migration used numeric IDs.
export const ImportedResultSchema = z.preprocess((value) => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number'
  ) {
    return { ...value, id: uuid() };
  }
  return value;
}, ResultSchema);
