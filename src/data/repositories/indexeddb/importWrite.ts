import { TimestampFieldsSchema } from '@/data/models/timeStampSchema';
import { InvalidImportedDatesError } from '@/data/utils/errors';
import { FunctionResult } from '@/utils/functionResult';

export type Timestamps = { createdAt: string; updatedAt: string };

/**
 * Shared validation of the dedicated overwrite-import paths (decision 3): the
 * timestamps of imported entities must be valid ISO datetimes before the
 * write; the write itself happens in a migration-marked transaction so the
 * ordinary hooks leave the imported values untouched. Invalid timestamps
 * produce an i18n FunctionResult failure (decision 6), never a raw ZodError.
 */
export function validateTimestamps(
  values: readonly object[],
  entity: string,
): FunctionResult<Timestamps[], InvalidImportedDatesError> {
  const timestamps: Timestamps[] = [];
  for (const value of values) {
    const parsed = TimestampFieldsSchema.safeParse(value);
    if (!parsed.success) {
      return FunctionResult.err(new InvalidImportedDatesError({ entity }));
    }
    timestamps.push(parsed.data);
  }
  return FunctionResult.ok(timestamps);
}
