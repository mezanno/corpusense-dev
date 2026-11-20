import { isStoredIsoDateTime, normalizeHistoricalDates } from '@/data/utils/historicalDates';
import type { Dexie, Transaction } from 'dexie';
import { v4 as uuid } from 'uuid';

export { normalizeHistoricalDates } from '@/data/utils/historicalDates';

// Only application stores: dexie-observable maintains its own internal stores.
export const timestampedStores = [
  'collections',
  'collectionContents',
  'history',
  'storedManifests',
  'storedManifestContents',
  'typesList',
  'itemMetadata',
  'tags',
  'annotations',
  'annotationsTemp',
  'models',
  'namedEntities',
  'results',
  'workers',
  'handles',
  'convertedFiles',
  'modifierChains',
  'projects',
  'sources',
  'sourceContents',
  'storedBlobs',
] as const;

type StoredRecord = Record<string, unknown>;

const migrationTransactions = new WeakSet<Transaction>();

/**
 * Repair semantic of one migration pass: `needsRepair` keeps a pass from
 * rewriting rows it would not change, `repair` is what it writes otherwise.
 */
type TimestampPolicy = {
  needsRepair: (row: StoredRecord) => boolean;
  repair: (row: StoredRecord, now: string) => void;
};

/** Stores whose rows an upgrade had to skip, kept until they are repaired. */
const deferredStoresKey = 'mezanno-timestamps-deferred-stores';

/** Properties explored per row while looking for a non clonable payload. */
const payloadScanBudget = 4096;

/**
 * Stores whose model puts side data in every row: an upgrade transaction never
 * rewrites them, whatever the row looks like once read back. Other stores are
 * decided row by row by the walk below.
 */
export const binaryPayloadStores = ['handles', 'convertedFiles', 'storedBlobs'] as const;

export function markMigration(tx: Transaction): void {
  migrationTransactions.add(tx);
}

function timestamp(value: unknown, now: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return typeof value === 'string' && value.length > 0 ? value : now;
}

/** Normalize legacy rows without changing their existing creation or update dates. */
export function normalizeStoredRecord(record: StoredRecord, now: string): void {
  if (typeof record.id !== 'string' || record.id.length === 0) record.id = uuid();
  record.createdAt = timestamp(record.createdAt, now);
  record.updatedAt = timestamp(record.updatedAt, now);
}

/** A value the tolerant pass leaves untouched: an identifier or a stored date. */
function isFilledString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

const tolerantPolicy: TimestampPolicy = {
  needsRepair: (row) =>
    !isFilledString(row.id) || !isFilledString(row.createdAt) || !isFilledString(row.updatedAt),
  repair: normalizeStoredRecord,
};

const strictPolicy: TimestampPolicy = {
  needsRepair: (row) => !isStoredIsoDateTime(row.createdAt) || !isStoredIsoDateTime(row.updatedAt),
  repair: (row, now) => normalizeHistoricalDates(row, now),
};

/** What the data must look like once every migration pass is over. */
const endStatePolicy: TimestampPolicy = {
  needsRepair: (row) => tolerantPolicy.needsRepair(row) || strictPolicy.needsRepair(row),
  repair: (row, now) => {
    tolerantPolicy.repair(row, now);
    strictPolicy.repair(row, now);
  },
};

function isOpaqueLeaf(value: object): boolean {
  if (typeof Blob === 'function' && value instanceof Blob) return true;
  const handle = globalThis.FileSystemHandle;
  return typeof handle === 'function' && value instanceof handle;
}

/**
 * Blob, File and file system handle content lives in browser side data a
 * versionchange transaction cannot reach: rewriting such a row aborts the whole
 * migration and leaves the database closed. The walk stops at the first payload
 * found; a row it cannot decide about within its budget counts as opaque, since
 * deferring a row is always safe and rewriting it blindly is not.
 */
function hasOpaquePayload(
  value: unknown,
  state = { budget: payloadScanBudget },
  seen = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (isOpaqueLeaf(value)) return true;
  if (seen.has(value)) return false;
  if (state.budget-- <= 0) return true;
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => hasOpaquePayload(child, state, seen));
}

/**
 * Rows an upgrade must leave alone: either their store always carries side data,
 * or this very row carries some (a worker result value, an annotation body). The
 * store rule keeps the decision independent from how faithfully the environment
 * preserves a Blob identity across a round trip; the walk covers the rest.
 */
function isDeferredRow(store: string, row: StoredRecord): boolean {
  return binaryPayloadStores.some((name) => name === store) || hasOpaquePayload(row);
}

function readDeferredStores(): Record<string, number> {
  try {
    const stored: unknown = localStorage.getItem(deferredStoresKey);
    if (typeof stored !== 'string') return {};
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries: [string, unknown][] = Object.entries(parsed);
    const deferred: Record<string, number> = {};
    for (const [store, rows] of entries) {
      if (typeof rows === 'number') deferred[store] = rows;
    }
    return deferred;
  } catch {
    return {};
  }
}

/** Last pass leaves `rows` unfixed rows in `store`, for the pass after open. */
function rememberDeferredStore(store: string, rows: number): void {
  try {
    const deferred = readDeferredStores();
    deferred[store] = rows;
    localStorage.setItem(deferredStoresKey, JSON.stringify(deferred));
  } catch {
    // No storage available: the write hooks still stamp the next change of the row.
  }
}

function sameKey(a: unknown, b: unknown): boolean {
  return Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
}

async function runTimestampPass(tx: Transaction, policy: TimestampPolicy): Promise<void> {
  markMigration(tx);
  const now = new Date().toISOString();
  for (const name of timestampedStores) {
    let deferred = 0;
    await tx
      .table<StoredRecord, IDBValidKey>(name)
      .toCollection()
      .modify((row) => {
        if (!policy.needsRepair(row)) return false;
        if (isDeferredRow(name, row)) {
          deferred += 1;
          return false;
        }
        policy.repair(row, now);
      });
    if (deferred > 0) rememberDeferredStore(name, deferred);
  }
}

/** v33: complete missing identifiers and timestamps, tolerantly. */
export async function migrateTimestamps(tx: Transaction): Promise<void> {
  await runTimestampPass(tx, tolerantPolicy);
}

/** v34: verify every timestamp field against the strict ISO rule. */
export async function migrateStrictTimestamps(tx: Transaction): Promise<void> {
  await runTimestampPass(tx, strictPolicy);
}

export type DeferredTimestampRepairReport = {
  /** Stores visited because an upgrade skipped rows in them. */
  stores: number;
  repaired: number;
  failed: number;
};

/**
 * Finish the work an upgrade transaction could not do: rows carrying a blob or
 * a file system handle are rewritten here, in plain transactions, one row at a
 * time, so that a single unreadable payload can neither abort a migration nor
 * take the whole database down. Called once at startup, and cheap otherwise:
 * without a deferred store it never touches IndexedDB.
 */
export async function repairDeferredTimestamps(
  database: Dexie,
): Promise<DeferredTimestampRepairReport> {
  const report: DeferredTimestampRepairReport = { stores: 0, repaired: 0, failed: 0 };
  const deferred = readDeferredStores();
  const now = new Date().toISOString();
  for (const name of Object.keys(deferred)) {
    if (!timestampedStores.some((store) => store === name)) continue;
    report.stores += 1;
    const table = database.table<StoredRecord, IDBValidKey>(name);
    const keys = await table.toCollection().primaryKeys();
    for (const key of keys) {
      try {
        await database.transaction('rw', table, async (tx: Transaction) => {
          markMigration(tx);
          const row = await table.get(key);
          if (row === undefined || !endStatePolicy.needsRepair(row)) return;
          const extractKey = table.core.schema.primaryKey.extractKey;
          const keyOf = (value: StoredRecord): IDBValidKey =>
            (extractKey?.(value) as IDBValidKey | undefined) ?? key;
          const storedKey = keyOf(row);
          endStatePolicy.repair(row, now);
          // An inline key the repair moved (a numeric legacy result id) cannot be
          // overwritten in place: drop the old row before writing the new one.
          if (!sameKey(storedKey, keyOf(row))) await table.delete(storedKey);
          await table.put(row);
          report.repaired += 1;
        });
      } catch (error) {
        report.failed += 1;
        console.warn(`Unable to repair timestamps of ${name} row ${JSON.stringify(key)}:`, error);
      }
    }
  }
  if (report.failed === 0) {
    try {
      localStorage.removeItem(deferredStoresKey);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
  }
  return report;
}

/** Stores waiting for a deferred repair, exposed for tests and diagnostics. */
export function deferredTimestampStores(): Record<string, number> {
  return readDeferredStores();
}

export function installTimestampHooks(db: Dexie): void {
  for (const name of timestampedStores) {
    const table = db.table(name);
    table.hook('creating', (_key, record: StoredRecord, tx) => {
      if (!migrationTransactions.has(tx)) normalizeStoredRecord(record, new Date().toISOString());
    });
    table.hook('updating', (_changes, _key, record: StoredRecord, tx) => {
      if (migrationTransactions.has(tx)) return;
      const now = new Date().toISOString();
      return { createdAt: timestamp(record.createdAt, now), updatedAt: now };
    });
  }
}
