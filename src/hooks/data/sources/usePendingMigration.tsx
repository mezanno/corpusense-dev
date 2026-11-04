import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useState } from 'react';

/**
 * Detects legacy data still present in storedManifests or convertedFiles
 * tables that has not yet been migrated to the new sources/sourceContents schema.
 * Provides a `migrateAll` function to trigger the full migration on user action.
 */
const usePendingMigration = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const sourceRepository = useMemo(() => getSourceRepository(), []);

  // Dexie tracks the tables queried by the repository and reruns this live query when they change.
  const pendingCount = useLiveQuery<number>(() => sourceRepository.getPendingMigrationCount()) ?? 0;

  const migrateAll = useCallback(async () => {
    setIsMigrating(true);
    try {
      await sourceRepository.migrateAllSources();
    } finally {
      setIsMigrating(false);
    }
  }, []);

  return {
    pendingCount,
    isMigrating,
    migrateAll,
  };
};

export default usePendingMigration;
