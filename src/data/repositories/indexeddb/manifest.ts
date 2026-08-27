import { StoredManifestDetails } from '@/data/models/StoredManifest';
import {
  extractCanvasById,
  extractCanvasesByIds,
  extractManifestDetails,
} from '@/data/utils/manifest';
import { FunctionResult } from '@/utils/functionResult';
import { Canvas, Manifest } from '@iiif/presentation-3';
import { EntityNotFoundError } from '../EntityNotFoundError';
import { db } from './db';
import { ManifestRepository } from './types';

export class IndexedDBManifestRepository implements ManifestRepository {
  async getCanvasById(
    manifestId: string,
    canvasId: string,
  ): Promise<FunctionResult<Canvas, EntityNotFoundError>> {
    const result = await this.getById(manifestId);
    if (!result.ok) {
      return result;
    }
    try {
      const canvas = extractCanvasById(result.value, canvasId);
      return FunctionResult.ok(canvas);
    } catch {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Canvas', id: canvasId }));
    }
  }

  async getCanvasesByIds(
    manifestId: string,
    canvasIds: string[],
  ): Promise<FunctionResult<Canvas[], EntityNotFoundError>> {
    const result = await this.getById(manifestId);
    if (!result.ok) {
      return result;
    }
    try {
      const canvases = extractCanvasesByIds(result.value, canvasIds);
      return FunctionResult.ok(canvases);
    } catch {
      return FunctionResult.err(
        new EntityNotFoundError({ entity: 'Canvas', id: canvasIds.join(',') }),
      );
    }
  }

  async getById(manifestId: string): Promise<FunctionResult<Manifest, EntityNotFoundError>> {
    const manifestContent = await db.storedManifestContents.get(manifestId);
    if (!manifestContent) {
      return FunctionResult.err(new EntityNotFoundError({ entity: 'Manifest', id: manifestId }));
    }
    return FunctionResult.ok(manifestContent.content);
  }

  async getDetailsByManifestIds(manifestIds: string[]): Promise<StoredManifestDetails[]> {
    return await db.storedManifests.where('id').anyOf(manifestIds).toArray();
  }

  async getMetadata(manifestId: string) {
    const metadata = await db.itemMetadata.where({ id: manifestId }).toArray();
    return metadata?.map((item) => item.attribute) ?? [];
  }

  async add(manifest: Manifest) {
    const { name, thumbnail } = extractManifestDetails(manifest);

    const existing = await db.storedManifests.get(manifest.id);

    if (!existing) {
      await db.transaction('rw', db.storedManifests, db.storedManifestContents, async () => {
        await db.storedManifests.add({ id: manifest.id, name, thumbnail });
        await db.storedManifestContents.add({ id: manifest.id, content: manifest });
      });
    } else {
      await db.transaction('rw', db.storedManifests, db.storedManifestContents, async () => {
        await db.storedManifests.update(manifest.id, { name, thumbnail });
        await db.storedManifestContents.put({ id: manifest.id, content: manifest });
      });
    }
  }
}
