import { DataModel } from '@/data/models/dataModel/dataModel';
import { DataModelDTO } from '@/data/models/dataModel/dataModel.dto';
import { FunctionResult } from '@/utils/functionResult';
import { InvalidImportedDatesError } from '../../utils/errors';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { validateTimestamps } from './importWrite';
import { markMigration } from './timestamps';
import { ModelRepository } from './types';

export class IndexedDBModelRepository implements ModelRepository {
  async getAll(): Promise<DataModel[]> {
    return await db.models.orderBy('name').toArray();
  }

  async getById(id: string): Promise<FunctionResult<DataModel, EntityNotFoundError>> {
    const result = await db.models.get(id);
    if (result === undefined) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'DataModel', id }));
    }
    return FunctionResult.ok(result);
  }

  async getByName(name: string): Promise<FunctionResult<DataModel, EntityNotFoundError>> {
    const models = await db.models.where('name').equals(name).toArray();
    if (models.length === 0) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'DataModel', id: name }));
    }
    return FunctionResult.ok(models[0]);
  }

  async add(model: DataModelDTO): Promise<DataModel> {
    // Creation path: the repository initializes both timestamps (decision 1).
    const now = new Date().toISOString();
    const newModel: DataModel = { ...model, createdAt: now, updatedAt: now };
    await db.models.add(newModel);
    return newModel;
  }

  async update(model: DataModelDTO): Promise<DataModel> {
    // Modification path: stored createdAt is preserved, updatedAt is assigned here.
    return await db.transaction('rw', db.models, async () => {
      const existing = await db.models.get(model.id);
      const now = new Date().toISOString();
      const written: DataModel = {
        ...model,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.models.put(written);
      return written;
    });
  }

  async importWithDates(
    model: DataModel,
  ): Promise<FunctionResult<void, InvalidImportedDatesError>> {
    const validated = validateTimestamps([model], 'DataModel');
    if (!validated.ok) {
      return validated;
    }
    await db.transaction('rw', db.models, async (tx) => {
      markMigration(tx);
      await db.models.put({ ...model, ...validated.value[0] });
    });
    return FunctionResult.ok(undefined);
  }

  async deleteById(id: string): Promise<void> {
    await db.models.delete(id);
  }
}
