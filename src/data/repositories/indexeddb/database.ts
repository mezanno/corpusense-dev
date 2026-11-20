import { BaseError } from '@/utils/BaseError';
import Dexie from 'dexie';
import { ExportProgress, exportDB, importInto, peakImportFile } from 'dexie-export-import';
import { db } from './db';
import {
  markMigration,
  normalizeHistoricalDates,
  normalizeStoredRecord,
  repairDeferredTimestamps,
  timestampedStores,
  type DeferredTimestampRepairReport,
} from './timestamps';

export class IndexedDBDatabaseRepository {
  export(progressCallback: (progress: ExportProgress) => boolean): Promise<Blob> {
    return exportDB(db, { progressCallback });
  }

  async import(file: Blob, progressCallback: (progress: ExportProgress) => boolean): Promise<void> {
    const metadata = await peakImportFile(file);
    if (![32, 33, db.verno].includes(metadata.data.databaseVersion)) {
      throw new BaseError(`Unsupported database backup version: ${metadata.data.databaseVersion}`);
    }
    const now = new Date().toISOString();
    await db.transaction('rw', db.tables, async (tx) => {
      markMigration(tx);
      // The library clears tables before its own transaction; the outer transaction
      // makes both clearing and insertion atomic, including asynchronous file reads.
      await Dexie.waitFor(
        importInto(db, file, {
          noTransaction: true,
          acceptVersionDiff: true,
          clearTablesBeforeImport: true,
          overwriteValues: true,
          progressCallback,
          filter: (table, value: unknown) => {
            if (
              timestampedStores.some((name) => name === table) &&
              typeof value === 'object' &&
              value !== null
            ) {
              normalizeStoredRecord(value as Record<string, unknown>, now);
              normalizeHistoricalDates(value as Record<string, unknown>, now);
            }
            return true;
          },
        }),
      );
    });
  }

  clear(): Promise<void> {
    return Dexie.delete('mezanno');
  }

  /**
   * Completes the timestamp repair an upgrade transaction had to leave out:
   * rows carrying a blob or a file system handle cannot be rewritten during a
   * versionchange transaction, so they are normalized afterwards instead.
   */
  repairDeferredTimestamps(): Promise<DeferredTimestampRepairReport> {
    return repairDeferredTimestamps(db);
  }
}
