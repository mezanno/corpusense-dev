import { z } from 'zod';

const isoDateTime = z.iso.datetime();

/** Strict ISO value of a stored timestamp, or undefined when it must be replaced. */
export function toIsoDateTime(value: unknown): string | undefined {
  const candidate =
    value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : value;
  return isoDateTime.safeParse(candidate).success ? (candidate as string) : undefined;
}

/** True when the field already holds the strict ISO string the types promise. */
export function isStoredIsoDateTime(value: unknown): boolean {
  return typeof value === 'string' && isoDateTime.safeParse(value).success;
}

/** Repair historical timestamps independently, without changing other properties. */
export function normalizeHistoricalDates(record: Record<string, unknown>, now: string): void {
  for (const field of ['createdAt', 'updatedAt'] as const) {
    record[field] = toIsoDateTime(record[field]) ?? now;
  }
}

/** Copy only an entity, leaving its nested business data untouched. */
export function normalizeImportedEntity(value: unknown, now: string): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return value;
  }
  const record = { ...value };
  normalizeHistoricalDates(record, now);
  return record;
}

/** Normalize only the known entity positions in collection exports. */
export function normalizeImportedCollection(value: unknown, now: string): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return value;
  }
  const record: Record<string, unknown> = { ...value };
  if ('collection' in record) record.collection = normalizeImportedEntity(record.collection, now);
  if ('model' in record && record.model !== undefined) {
    record.model = normalizeImportedEntity(record.model, now);
  }
  for (const field of ['tags', 'annotations', 'workers', 'results'] as const) {
    const items = record[field];
    if (Array.isArray(items))
      record[field] = items.map((item) => normalizeImportedEntity(item, now));
  }
  if (Array.isArray(record.sources)) {
    record.sources = record.sources.map((source: unknown) => {
      const normalized = normalizeImportedEntity(source, now);
      if (typeof normalized !== 'object' || normalized === null || Array.isArray(normalized)) {
        return normalized;
      }
      if ('content' in normalized) {
        return { ...normalized, content: normalizeImportedEntity(normalized.content, now) };
      }
      return normalized;
    });
  }
  return record;
}
