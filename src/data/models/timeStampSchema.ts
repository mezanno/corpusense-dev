import z from 'zod';

export const TimeStampSchema = z.object({
  id: z.string(),
  // Timestamps are mandatory for every persisted entity; repositories assign
  // them at write time and historical data is repaired by migrations v33/v34.
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Validation stricte des deux timestamps, partagee par les voies dediees d'import. */
export const TimestampFieldsSchema = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Entry types for repository creation/update methods: timestamps never belong to them. */
export type WithoutTimestamps<T> = Omit<T, 'createdAt' | 'updatedAt'>;
