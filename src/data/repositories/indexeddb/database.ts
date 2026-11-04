import Dexie from 'dexie';
import { ExportProgress, exportDB, importInto } from 'dexie-export-import';
import { db } from './db';

export class IndexedDBDatabaseRepository {
  export(progressCallback: (progress: ExportProgress) => boolean): Promise<Blob> {
    return exportDB(db, { progressCallback });
  }

  import(file: Blob, progressCallback: (progress: ExportProgress) => boolean): Promise<void> {
    return importInto(db, file, {
      clearTablesBeforeImport: true,
      overwriteValues: true,
      progressCallback,
    });
  }

  clear(): Promise<void> {
    return Dexie.delete('mezanno');
  }
}
