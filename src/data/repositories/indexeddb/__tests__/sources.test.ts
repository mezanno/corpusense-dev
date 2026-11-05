import type { SourceContent, SourceWithContentAndThumbnail } from '@/data/models/source/source';
import { EntityNotFoundError } from '@/data/repositories/EntityNotFoundError';
import { NotFoundError } from '@/utils/NotFoundError';
import * as imageUtils from '@/utils/images';
import * as manifestUtils from '@/utils/manifest';
import type { Manifest } from '@iiif/presentation-3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { IndexedDBSourceRepository } from '../sources';
import { createTestDb } from './testDb';

const repository = new IndexedDBSourceRepository();

const manifest = (id: string, canvasIds: string[] = []): Manifest => ({
  id,
  type: 'Manifest',
  label: { en: [id] },
  items: canvasIds.map((canvasId) => ({ id: canvasId, type: 'Canvas', items: [] })),
});

const localFile = {
  outputDirectoryHandle: {} as FileSystemDirectoryHandle,
  timestamp: 1_762_000_000_000,
  manifestName: 'manifest.json',
  folderName: 'converted-document',
};

const importedRemoteSource = (id: string, manifestId: string): SourceWithContentAndThumbnail => ({
  id,
  name: `Source ${id}`,
  type: 'remote',
  pageCount: 1,
  thumbnailBlobId: `thumbnail-${id}`,
  content: { id, type: 'remote', manifest: manifest(manifestId) },
  thumbnailBase64: 'data:image/png;base64,dGh1bWJuYWls',
});

describe('IndexedDBSourceRepository', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await createTestDb();
  });

  it('stores a remote source, its manifest content and thumbnail in one operation', async () => {
    const sourceManifest = manifest('https://example.test/manifest.json', ['canvas-1']);
    const thumbnailBlob = new Blob(['thumbnail-bytes'], { type: 'image/png' });

    const result = await repository.add({
      type: 'remote',
      name: 'Remote source',
      pageCount: 1,
      thumbnailBlob,
      manifest: sourceManifest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const storedSource = await repository.getById(result.value.id);
    expect(storedSource.ok).toBe(true);
    if (!storedSource.ok) return;
    expect(storedSource.value).toMatchObject({
      id: result.value.id,
      name: 'Remote source',
      type: 'remote',
      thumbnailBlobId: result.value.thumbnailBlobId,
    });
    expect(await repository.getContentById(result.value.id)).toEqual({
      ok: true,
      value: { id: result.value.id, type: 'remote', manifest: sourceManifest },
    });
    const storedThumbnail = await repository.getBlob(result.value.thumbnailBlobId);
    expect(storedThumbnail.ok).toBe(true);
    if (!storedThumbnail.ok) return;
    expect(storedThumbnail.value).toMatchObject({ id: result.value.thumbnailBlobId });
    expect(storedThumbnail.value.blob).toBeDefined();
  });

  it('stores a local source with its filesystem metadata', async () => {
    const sourceManifest = manifest('local-manifest', ['local-canvas']);

    const result = await repository.add({
      type: 'local',
      name: 'Local source',
      pageCount: 1,
      thumbnailBlob: new Blob(['local-thumbnail']),
      manifest: sourceManifest,
      localFile,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await repository.getContentById(result.value.id)).toEqual({
      ok: true,
      value: {
        id: result.value.id,
        type: 'local',
        manifest: sourceManifest,
        localFile,
      },
    });
  });

  it('imports a source with content and a base64 thumbnail', async () => {
    const source = importedRemoteSource('imported-source', 'imported-manifest');
    vi.spyOn(imageUtils, 'blobToBase64').mockResolvedValue(source.thumbnailBase64);

    expect(await repository.addSourceWithContentAndThumbnail(source)).toEqual({
      ok: true,
      value: true,
    });
    expect(await repository.getSourceWithContentAndThumbnailById(source.id)).toEqual({
      ok: true,
      value: source,
    });
  });

  it('rolls back every imported table when the content id already exists', async () => {
    const source = importedRemoteSource('conflicting-source', 'existing-manifest');
    await db.sourceContents.add({
      id: source.id,
      type: 'remote',
      manifest: manifest('existing-manifest'),
    });

    const result = await repository.addSourceWithContentAndThumbnail(source);

    expect(result.ok).toBe(false);
    expect(await db.sources.get(source.id)).toBeUndefined();
    expect(await db.storedBlobs.get(source.thumbnailBlobId)).toBeUndefined();
    expect(await db.sourceContents.get(source.id)).toMatchObject({
      id: source.id,
      type: 'remote',
      manifest: { id: 'existing-manifest' },
    });
  });

  it('returns typed not-found results for missing source, content, blob, and canvas', async () => {
    const source = await repository.getById('missing-source');
    const content = await repository.getContentById('missing-source');
    const blob = await repository.getBlob('missing-blob');
    const canvas = await repository.getCanvasById('missing-source', 'missing-canvas');
    const joined = await repository.getSourceWithContentById('missing-source');
    const joinedWithThumbnail =
      await repository.getSourceWithContentAndThumbnailById('missing-source');
    const manifestContent = await repository.getContentByManifestUrl('missing-manifest');

    for (const result of [
      source,
      content,
      blob,
      canvas,
      joined,
      joinedWithThumbnail,
      manifestContent,
    ]) {
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBeInstanceOf(EntityNotFoundError);
    }
    expect(source.ok === false && source.error.message).toBe(
      'Source with id missing-source not found',
    );
    expect(content.ok === false && content.error.message).toBe(
      'SourceContent with id missing-source not found',
    );
    expect(blob.ok === false && blob.error.message).toBe('Blob with id missing-blob not found');
    expect(canvas.ok === false && canvas.error.message).toBe(
      'SourceContent with id missing-source not found',
    );
  });

  it('joins source data, resolves a canvas and finds content by manifest URL', async () => {
    const sourceManifest = manifest('https://example.test/joined.json', ['canvas-1', 'canvas-2']);
    const added = await repository.add({
      type: 'remote',
      name: 'Joined source',
      pageCount: 2,
      thumbnailBlob: new Blob(['image']),
      manifest: sourceManifest,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(await repository.getSourceWithContentById(added.value.id)).toEqual({
      ok: true,
      value: added.value,
    });
    expect(await repository.getCanvasById(added.value.id, 'canvas-2')).toEqual({
      ok: true,
      value: sourceManifest.items?.[1],
    });
    const absentCanvas = await repository.getCanvasById(added.value.id, 'absent-canvas');
    expect(absentCanvas.ok).toBe(false);
    expect(absentCanvas.ok === false && absentCanvas.error.message).toBe(
      'Canvas with id absent-canvas not found',
    );
    expect(await repository.getContentByManifestUrl(sourceManifest.id)).toEqual({
      ok: true,
      value: added.value.content,
    });
  });

  it('updates source fields and the GitHub manifest URL only on local content', async () => {
    const localAdded = await repository.add({
      type: 'local',
      name: 'Before',
      pageCount: 1,
      thumbnailBlob: new Blob(['local-thumbnail']),
      manifest: manifest('local-before'),
      localFile,
    });
    const remoteAdded = await repository.add({
      type: 'remote',
      name: 'Remote before',
      pageCount: 1,
      thumbnailBlob: new Blob(['remote-thumbnail']),
      manifest: manifest('remote-before'),
    });
    expect(localAdded.ok && remoteAdded.ok).toBe(true);
    if (!localAdded.ok || !remoteAdded.ok) return;

    await repository.updateName(localAdded.value.id, 'After');
    await repository.update(localAdded.value.id, {
      pageCount: 2,
      githubManifestUrl: 'https://github.com/example/manifest.json',
    });
    await repository.update(remoteAdded.value.id, {
      githubManifestUrl: 'https://github.com/ignored/manifest.json',
    });

    expect(await repository.getById(localAdded.value.id)).toMatchObject({
      ok: true,
      value: { name: 'After', pageCount: 2 },
    });
    expect(await repository.getContentById(localAdded.value.id)).toMatchObject({
      ok: true,
      value: { type: 'local', githubManifestUrl: 'https://github.com/example/manifest.json' },
    });
    expect(await repository.getContentById(remoteAdded.value.id)).toMatchObject({
      ok: true,
      value: { type: 'remote', manifest: { id: 'remote-before' } },
    });
  });

  it('deletes source, content and thumbnail together and reports an absent source', async () => {
    const added = await repository.add({
      type: 'remote',
      name: 'To delete',
      pageCount: 1,
      thumbnailBlob: new Blob(['thumbnail']),
      manifest: manifest('delete-manifest'),
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    expect(await repository.deleteById(added.value.id)).toEqual({ ok: true, value: undefined });
    expect(await repository.getById(added.value.id)).toMatchObject({ ok: false });
    expect(await repository.getContentById(added.value.id)).toMatchObject({ ok: false });
    expect(await repository.getBlob(added.value.thumbnailBlobId)).toMatchObject({ ok: false });

    const missing = await repository.deleteById('missing-source');
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error).toBeInstanceOf(NotFoundError);
  });

  it('reports a missing thumbnail when reading a joined source and deletes all source data', async () => {
    const added = await repository.add({
      type: 'remote',
      name: 'Source without thumbnail',
      pageCount: 1,
      thumbnailBlob: new Blob(['thumbnail']),
      manifest: manifest('no-thumbnail-manifest'),
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    await db.storedBlobs.delete(added.value.thumbnailBlobId);

    const missingThumbnail = await repository.getSourceWithContentAndThumbnailById(added.value.id);
    expect(missingThumbnail.ok).toBe(false);
    expect(missingThumbnail.ok === false && missingThumbnail.error.message).toBe(
      `Blob with id ${added.value.thumbnailBlobId} not found`,
    );

    const second = await repository.add({
      type: 'remote',
      name: 'Second source',
      pageCount: 1,
      thumbnailBlob: new Blob(['second-thumbnail']),
      manifest: manifest('second-manifest'),
    });
    expect(second.ok).toBe(true);

    await repository.deleteAll();

    expect(await db.sources.count()).toBe(0);
    expect(await db.sourceContents.count()).toBe(0);
    expect(await db.storedBlobs.count()).toBe(0);
  });

  it('counts only legacy manifests and files that have not already been migrated', async () => {
    const migratedManifest = manifest('https://example.test/migrated.json');
    await db.storedManifests.bulkAdd([
      { id: migratedManifest.id, name: 'Already migrated' },
      { id: 'https://example.test/pending.json', name: 'Pending' },
    ]);
    await db.storedManifestContents.add({ id: migratedManifest.id, content: migratedManifest });
    await db.sourceContents.add({
      id: 'source-migrated',
      type: 'remote',
      manifest: migratedManifest,
    });
    const migratedLocalContent: SourceContent = {
      id: 'file-migrated',
      type: 'local',
      manifest: manifest('file-manifest'),
      localFile,
    };
    await db.sourceContents.add(migratedLocalContent);
    await db.convertedFiles.bulkAdd([
      {
        id: 'file-migrated',
        title: 'Already migrated',
        pageCount: 1,
        thumbnailBlob: new Blob(),
        ...localFile,
      },
      {
        id: 'file-pending',
        title: 'Pending',
        pageCount: 1,
        thumbnailBlob: new Blob(),
        ...localFile,
      },
    ]);

    expect(await repository.getPendingMigrationCount()).toBe(2);
  });

  it('migrates remote manifests and local files, updates collection references and clears legacy tables', async () => {
    vi.spyOn(manifestUtils, 'getManifestFromConvertedFile').mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacyManifest = manifest('https://example.test/legacy.json', ['legacy-canvas']);
    await db.storedManifests.add({ id: legacyManifest.id, name: 'Legacy remote' });
    await db.storedManifestContents.add({ id: legacyManifest.id, content: legacyManifest });
    await db.storedManifests.add({ id: 'manifest-without-content', name: 'Retry later' });
    await db.convertedFiles.add({
      id: 'legacy-file',
      title: 'Legacy local',
      pageCount: 1,
      thumbnailBlob: new Blob(['old-thumbnail']),
      githubManifestUrl: 'https://github.com/example/legacy-manifest.json',
      ...localFile,
    });
    await db.collectionContents.add({
      id: 'collection-1',
      content: [
        { canvasId: 'legacy-canvas', sourceId: '', manifestId: legacyManifest.id },
        { canvasId: 'local-canvas', sourceId: '', manifestId: 'legacy-file' },
        { canvasId: 'unrelated-canvas', sourceId: '', manifestId: 'unrelated-manifest' },
      ],
    });

    await repository.migrateAllSources();

    const migratedRemoteContent = await repository.getContentByManifestUrl(legacyManifest.id);
    expect(migratedRemoteContent.ok).toBe(true);
    if (!migratedRemoteContent.ok) return;
    const migratedRemote = await repository.getById(migratedRemoteContent.value.id);
    expect(migratedRemote).toMatchObject({
      ok: true,
      value: { name: 'Legacy remote', type: 'remote', pageCount: 1 },
    });
    expect(await repository.getContentById('legacy-file')).toMatchObject({
      ok: true,
      value: {
        type: 'local',
        localFile,
        githubManifestUrl: 'https://github.com/example/legacy-manifest.json',
      },
    });
    expect(await db.collectionContents.get('collection-1')).toMatchObject({
      content: [
        { sourceId: migratedRemoteContent.value.id },
        { sourceId: 'legacy-file' },
        { sourceId: 'unrelated-manifest' },
      ],
    });
    expect(await db.storedManifests.toArray()).toEqual([
      { id: 'manifest-without-content', name: 'Retry later' },
    ]);
    expect(await db.storedManifestContents.count()).toBe(0);
    expect(await db.convertedFiles.count()).toBe(0);
    expect(await repository.getPendingMigrationCount()).toBe(1);
  });
});
