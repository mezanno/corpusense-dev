import { AddSourceDTO, SourceContent } from '@/data/models/Sources';
import { extractCanvasById } from '@/data/utils/manifest';
import { Canvas } from '@iiif/presentation-3';
import { v4 as uuid } from 'uuid';
import { db } from './db';
import { SourceRepository } from './types';

export class IndexedDBSourceRepository implements SourceRepository {
  async add(dto: AddSourceDTO): Promise<string> {
    const sourceId = uuid();
    try {
      await db.transaction('rw', db.storedBlobs, db.sources, db.sourceContents, async () => {
        const thumbnailBlobId = uuid();

        await db.storedBlobs.add({
          id: thumbnailBlobId,
          blob: dto.thumbnailBlob,
        });
        await db.sources.add({
          id: sourceId,
          name: dto.name,
          type: dto.type,
          pageCount: dto.pageCount,
          thumbnailBlobId,
        });
        if (dto.type === 'local') {
          await db.sourceContents.add({
            id: sourceId,
            type: 'local',
            manifest: dto.manifest,
            localFile: {
              ...dto.localFile,
            },
          } as SourceContent);
        } else {
          await db.sourceContents.add({
            id: sourceId,
            type: 'remote',
            manifest: dto.manifest,
          } as SourceContent);
        }
      });

      return sourceId;
    } catch (error) {
      console.error('Error adding source: ', error);
      throw error;
    }
  }

  async getBlob(blobId: string): Promise<Blob> {
    const storedBlob = await db.storedBlobs.get(blobId);
    if (!storedBlob) {
      throw new Error(`Blob with id ${blobId} not found`);
    }
    return storedBlob.blob;
  }

  async getById(sourceId: string) {
    const source = await db.sources.get(sourceId);
    if (!source) {
      throw new Error(`Source with id ${sourceId} not found`);
    }
    return source;
  }

  async getContentById(sourceId: string): Promise<SourceContent> {
    const content = await db.sourceContents.get(sourceId);
    if (!content) {
      throw new Error(`Content for source with id ${sourceId} not found`);
    }
    return content;
  }

  async getCanvasById(sourceId: string, canvasId: string): Promise<Canvas> {
    const content = await db.sourceContents.get(sourceId);
    if (!content) {
      throw new Error(`Content for source with id ${sourceId} not found`);
    }
    return extractCanvasById(content.manifest, canvasId);
  }

  async deleteById(sourceId: string): Promise<void> {
    await db.transaction('rw', db.storedBlobs, db.sources, db.sourceContents, async () => {
      const source = await db.sources.get(sourceId);
      if (!source) {
        throw new Error(`Source with id ${sourceId} not found`);
      }
      await db.storedBlobs.delete(source.thumbnailBlobId);
      await db.sources.delete(sourceId);
      await db.sourceContents.delete(sourceId);
    });
  }
}
