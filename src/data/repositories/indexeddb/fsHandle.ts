import { FSHandle } from '@/data/models/fSHandle/fSHandle';
import { FSHandleDTO } from '@/data/models/fSHandle/fSHandle.dto';
import { db } from './db';
import { FSHandleRepository } from './types';

export class IndexedDBFSHandleRepository implements FSHandleRepository {
  async getAll(): Promise<FSHandle[]> {
    return await db.handles.toArray();
  }

  async put(handle: FSHandleDTO): Promise<FSHandle> {
    // Upsert: creation initializes both dates, modification preserves the stored createdAt.
    return await db.transaction('rw', db.handles, async () => {
      const existing = await db.handles.get(handle.id);
      const now = new Date().toISOString();
      const written: FSHandle = {
        ...handle,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.handles.put(written);
      return written;
    });
  }
}
