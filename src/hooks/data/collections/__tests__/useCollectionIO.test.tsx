/**
 * Lot 3 — useCollectionIO : export de collections (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : `exportCollections` — matrice d'options (annotations, modèle, workers
 * et portée `collection`/`all`, manifest) ; collection inexistante et source manquante
 * sautées avec log ; un JSON par collection demandée dans le ZIP, plus le manifest
 * quand il est demandé ; `FileSaver.saveAs` vérifié appelé une fois par export
 * (un seul ZIP). Le critère de sortie est couvert par le cycle import (lots 1–2)
 * → base réelle → export du dernier `describe`, avec comparaison du ZIP aux données
 * relues par les VRAIS repositories.
 *
 * Frontières :
 * - `file-saver` mocké à la frontière navigateur (jsdom ne sait pas sauvegarder de
 *   fichier et `saveAs` s'appuie sur `URL.createObjectURL`) : la fabrique `vi.mock`
 *   renvoie un simple espion ; le blob transmis est un vrai Blob, relu tel quel par le
 *   JSZip réel (le Blob de jsdom 27 n'expose pas `arrayBuffer()`, seuls `slice/size/
 *   type`) — le contenu du ZIP est donc vérifié comme un fichier, pas comme un objet.
 * - `blobToBase64` de `@/utils/images` est le seul autre stub, à une frontière
 *   d'environnement : fake-indexeddb (realm Node) ne reconnaît pas le Blob jsdom au
 *   clone structurel et le fait revivre en objet vide, que `FileReader` refuse — le
 *   binaire d'une vignette ne peut pas survivre au round-trip en test (en production,
 *   IndexedDB réel clone les Blobs par référence). `sources.test.ts` (couche data)
 *   stubbe exactement cette frontière pour la même raison ; `base64ToBlob`, voie
 *   d'écriture, reste réel. Conséquence : le champ `thumbnailBase64` du JSON exporté
 *   est une valeur déterministe du stub, commun aux deux côtés de chaque comparaison
 *   ZIP ↔ relure repo — la fidélité du cycle est verrouillée sur tous les autres
 *   champs (ids, names, content, manifest, timestamps).
 * - Base Dexie réelle via le harnais (lot 0) ; toutes les écritures passent par les
 *   vrais repositories ; pas de mock de Dexie ni de délai artificiel.
 * - Pas de stub `fetch` : le chemin d'export, y compris `generateManifestFromCollection`,
 *   ne sollicite que les repositories (le manifest est reconstruit depuis les contenus
 *   stockés). Contrairement au fichier des lots 1–2, le registre des plugins d'import
 *   n'a pas besoin d'être initialisé pour l'export.
 * - Transpondeurs `useCallback` sur les setters RÉELS de `useLogger`, pattern introduit
 *   dans `useCollectionImporter.test.tsx` (mêmes raisons : React 19 concentre les
 *   commits sous `act()` ; la suite des valeurs transmises aux setters est le contrat
 *   propre du hook).
 *
 * Écarts constatés / caractérisations (règle 7 — documentés, pas corrigés) :
 * - contrairement à l'importateur, l'exportateur n'utilise PAS `t()` : les messages de
 *   log sont des phrases anglaises littérales (les assertions ci-dessous les verrouillent
 *   telles quelles — incohérence de i18n avec les lots 1–2, hors périmètre) ;
 * - collection inexistante ou manifest en échec → `continue` SANS tick de `setProgress` :
 *   la progression finale peut rester sous 100 alors que le statut est `done` et que le
 *   ZIP est écrit ;
 * - échec de `generateManifestFromCollection` (seule voie observée : collection sans
 *   content → `EmptyCollectionError`) écarte du ZIP la collection ENTIÈRE — le `continue`
 *   passe aussi le `zip.file` du JSON — alors que ses données avaient été assemblées
 *   (test « manifest en échec ») ;
 * - modèle référencé par `modelId` mais absent de la base : ajouté sans log ni erreur
 *   (`ok:false` non instrumenté, test « options.model ») ;
 * - les `try/catch` autour du modèle et des workers/résultats, et celui autour du
 *   `JSON.stringify` du manifest, sont inatteignables avec les repositories réels
 *   (ils renvoient des `FunctionResult` et ne throw jamais) : ce sont les branches
 *   `ok:false` / liste vide qui sont exercées à leur place ;
 * - dédoublonnage des sources par `getSourceIdsByCollectionId` (Set) : un content avec
 *   deux canevas de la même source ne produit qu'une lecture de source ; si TOUTES les
 *   sources manquent, la clé `sources` existe mais vaut `[]` (elle est absente quand le
 *   content est vide) ;
 * - l'`id` du manifest exporté est codé en dur (`https://1.rp.mezanno.xyz/toto.json`,
 *   TODO au source de `data/utils/export.ts`) ;
 * - cycle import→export : le JSON d'une collection exportée valide l'`ExportedCollectionSchema`
 *   (ré-importable tel quel), MAIS les entrées `<name>_manifest.json` du ZIP ne passent
 *   pas ce schéma — réimportées par le pipeline des lots 1–2, elles produiraient un
 *   `error_import_collection` par manifest ; et comme l'export conserve les ids, le
 *   corps de la collection retomberait dans le défaut « collection déjà présente »
 *   caractérisé au lot 2. Verrouillé statiquement par le test de bout en bout.
 *
 * Couverture : 95,9 % des lignes et 100 % des branches de `useCollectionIO.tsx` à
 * l'issue du lot ; les seules lignes restées muettes (90, 112, 127) sont les trois
 * `catch` inatteignables justifiés ci-dessus. Tout chemin non trivial du hook est
 * atteint, y compris le `setProgress(0)` d'entrée (visible dans les suites de ticks
 * asserties).
 */
import manifestFixture from '@/__tests__/manifest.json';
import { ExportedCollection, ExportedCollectionSchema } from '@/data/models/collection/collection';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { Result } from '@/data/models/result/result';
import { SourceWithContentAndThumbnail } from '@/data/models/source/source';
import { Worker, WorkerStatus } from '@/data/models/worker/worker';
import {
  getAnnotationRepository,
  getCollectionRepository,
  getModelRepository,
  getResultRepository,
  getSourceRepository,
  getTagRepository,
  getWorkerRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  FIXTURE_CANVAS_IDS,
  makeAnnotation,
  makeCollection,
  makeCollectionElement,
  makeRemoteSource,
  makeTag,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
  seedRemoteSource,
  seedTags,
} from '@/hooks/__tests__/harness';
import useProgressLogger from '@/hooks/ui/useLogger';
import JSZip from 'jszip';
import { act, useCallback, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollectionImporter } from '../useCollectionImporter';
import { ExportCollectionOptions, useCollectionIO } from '../useCollectionIO';

// Frontière navigateur : `FileSaver.saveAs` est remplacé par un espion qui capture le
// blob au lieu de déclencher un téléchargement (cf. en-tête).
const { saveAsMock } = vi.hoisted(() => ({
  saveAsMock: vi.fn<(blob: Blob, filename?: string) => void>(),
}));
vi.mock('file-saver', () => ({ default: { saveAs: saveAsMock } }));

// Frontière d'environnement (cf. en-tête) : seule `blobToBase64` est stubbée (le blob
// relu de fake-indexeddb n'est plus un Blob exploitable par FileReader) ; le reste du
// module `@/utils/images` reste réel — notamment `base64ToBlob`, la voie d'écriture.
const { blobToBase64Mock } = vi.hoisted(() => ({
  blobToBase64Mock: vi.fn<(blob: Blob) => Promise<string>>(),
}));
vi.mock('@/utils/images', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/images')>()),
  blobToBase64: blobToBase64Mock,
}));

resetTestDbBeforeEach();
beforeEach(() => {
  saveAsMock.mockReset();
  blobToBase64Mock.mockReset();
  blobToBase64Mock.mockImplementation(
    async (blob) =>
      // Le blob relu de fake-indexeddb est un objet vide en environnement jsdom ; la
      // valeur produite ici n'est donc PAS les octets de la vignette, seulement une
      // chaîne déterministe qui traverse les mêmes deux appels (ZIP et relure repo).
      `data:${blob?.type ?? 'application/octet-stream'};base64,ZXhwb3J0LXRlc3Q=`,
  );
});

/* ------------------------------------------------------------------ */
/* Montage et helpers                                                  */
/* ------------------------------------------------------------------ */

type LoggerStatus = 'idle' | 'processing' | 'done' | 'error';

/** Setters RÉELS de useLogger relevés par transpondeurs (pattern des lots 1–2). */
function useLoggerTransponders() {
  const logger = useProgressLogger();
  const progressCalls = useRef<number[]>([]);
  const statusCalls = useRef<LoggerStatus[]>([]);

  const setProgress = useCallback(
    (value: number) => {
      progressCalls.current.push(value);
      logger.setProgress(value);
    },
    [logger.setProgress],
  );
  const setStatus = useCallback(
    (value: LoggerStatus) => {
      statusCalls.current.push(value);
      logger.setStatus(value);
    },
    [logger.setStatus],
  );

  const setters = { setStatus, setProgress, addLog: logger.addLog };
  return { logger, setters, progressCalls, statusCalls };
}

function renderIO() {
  return renderHookWithHarness(() => {
    const env = useLoggerTransponders();
    const io = useCollectionIO(env.setters);
    return { ...env, io };
  });
}

/** Montage du cycle complet : l'exportateur ET l'importateur des lots 1–2. */
function renderIOWithImporter() {
  return renderHookWithHarness(() => {
    const env = useLoggerTransponders();
    const io = useCollectionIO(env.setters);
    const importer = useCollectionImporter(env.setters);
    return { ...env, io, importer };
  });
}

type RenderedIO = ReturnType<typeof renderIO>;

async function exportCollections(
  rendered: RenderedIO,
  collectionIds: string[],
  options: ExportCollectionOptions,
) {
  await act(async () => {
    await rendered.result.current.io.exportCollections(collectionIds, options);
  });
}

/** Le Nᵉ ZIP passé à `saveAs`, relu par JSZip réel (un seul fichier par export). */
async function zipFromSave(callIndex: number): Promise<JSZip> {
  const call = saveAsMock.mock.calls[callIndex];
  if (call === undefined) throw new Error(`saveAs n'a pas été appelé ${callIndex + 1} fois`);
  expect(call[1]).toBe('exported_collections.zip');
  // Le Blob jsdom n'expose pas `arrayBuffer()` (cf. en-tête) : JSZip le lit lui-même.
  return JSZip.loadAsync(call[0]);
}

function entryNames(zip: JSZip): string[] {
  return Object.keys(zip.files).sort();
}

async function jsonFile(zip: JSZip, name: string): Promise<ExportedCollection> {
  const file = zip.file(name);
  if (file === null) throw new Error(`entrée ${name} absente du ZIP`);
  return JSON.parse(await file.async('string')) as ExportedCollection;
}

async function manifestFile(zip: JSZip, name: string): Promise<Record<string, unknown>> {
  const file = zip.file(name);
  if (file === null) throw new Error(`entrée ${name} absente du ZIP`);
  return JSON.parse(await file.async('string')) as Record<string, unknown>;
}

const messages = (rendered: RenderedIO) =>
  rendered.result.current.logger.logs.map((log) => log.message);

const messagesSince = (rendered: RenderedIO, since: number) =>
  rendered.result.current.logger.logs.slice(since).map((log) => log.message);

const errorLogs = (rendered: RenderedIO) =>
  rendered.result.current.logger.logs
    .filter((log) => log.type === 'error')
    .map((log) => log.message);

const unwrap = <T,>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error('résultat de repository attendu ok');
  return result.value;
};

/** Construit un vrai ZIP (JSZip) à partir d'entrées nommées — cf. lots 1–2. */
async function buildZip(entries: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  Object.entries(entries).forEach(([name, content]) => zip.file(name, content));
  return zip.generateAsync({ type: 'arraybuffer' });
}

/* ------------------------------------------------------------------ */
/* Fabriques d'entités pour l'export                                   */
/* ------------------------------------------------------------------ */

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function makeExportedModel(id: string, name: string): DataModel {
  return {
    id,
    name,
    prompt: `Prompt de ${name}`,
    fields: [{ id: `${id}-champ-1`, name: 'Champ', type: 'string', color: '#111111' }],
  };
}

/** Source exportée au sens du schéma courant (vignette base64 + manifest en dur). */
function makeExportedSource(id: string): SourceWithContentAndThumbnail {
  return {
    id,
    name: `Source ${id}`,
    type: 'remote',
    pageCount: FIXTURE_CANVAS_IDS.length,
    thumbnailBlobId: `blob-${id}`,
    content: {
      id,
      type: 'remote',
      manifest: {
        ...manifestFixture,
        id: `https://example.org/manifest/${id}.json`,
      } as unknown as SourceWithContentAndThumbnail['content']['manifest'],
    },
    thumbnailBase64: 'data:image/png;base64,AAAA',
  };
}

/** Worker complet tel que l'import le stocke (`addAll` = bulkAdd à l'identique). */
function makeExportedWorker(id: string, scope: Worker['scope']): Worker {
  const scopeKey =
    'collectionId' in scope && 'canvasId' in scope
      ? `${scope.collectionId}-${scope.canvasId}`
      : scope.collectionId;
  return {
    id,
    name: `Worker ${id}`,
    scope,
    params: {},
    scopeKey,
    status: WorkerStatus.COMPLETED,
    createdAt: FIXED_DATE,
    estimatedDuration: 0,
    queue: [],
  };
}

function makeExportedResult(id: number, workerId: string, taskId: number): Result {
  return {
    id,
    scope: { collectionId: 'e2e' },
    workerName: 'ocr-test',
    workerId,
    taskId,
    value: { pages: [] },
    params: {},
    scopeKey: 'e2e',
  };
}

/**
 * Scénario de la matrice workers : deux collections, un worker au scope exact de la
 * première, un worker au scope canevas de la première (descendant), un worker d'une
 * AUTRE collection, et des résultats rattachés à chaque worker.
 */
async function seedWorkerScenario() {
  const workerRepository = getWorkerRepository();
  await seedCollection(makeCollection({ id: 'io-workers', name: 'Workers io' }));
  await seedCollection(makeCollection({ id: 'io-vide-workers', name: 'Vide workers io' }));
  await seedCollection(makeCollection({ id: 'io-autres', name: 'Autres io' }));

  const workerCol = await workerRepository.add({
    id: 'worker-col',
    name: 'Worker collection',
    scope: { collectionId: 'io-workers' },
    params: {},
  });
  const workerCanvas = await workerRepository.add({
    id: 'worker-canvas',
    name: 'Worker canevas',
    scope: { collectionId: 'io-workers', canvasId: FIXTURE_CANVAS_IDS[0] },
    params: {},
  });
  const workerAutre = await workerRepository.add({
    id: 'worker-autre',
    name: 'Worker ailleurs',
    scope: { collectionId: 'io-autres' },
    params: {},
  });

  const resultRepository = getResultRepository();
  await resultRepository.add({
    scope: { collectionId: 'io-workers' },
    workerName: 'ocr-test',
    workerId: workerCol.id,
    taskId: 1,
    value: { pages: [] },
    params: {},
  });
  await resultRepository.add({
    scope: { collectionId: 'io-workers' },
    workerName: 'ocr-test',
    workerId: workerCol.id,
    taskId: 2,
    value: {},
    params: {},
  });
  await resultRepository.add({
    scope: { collectionId: 'io-workers', canvasId: FIXTURE_CANVAS_IDS[0] },
    workerName: 'ocr-test',
    workerId: workerCanvas.id,
    taskId: 3,
    value: {},
    params: {},
  });
  await resultRepository.add({
    scope: { collectionId: 'io-autres' },
    workerName: 'ocr-test',
    workerId: workerAutre.id,
    taskId: 4,
    value: {},
    params: {},
  });

  return { workerCol, workerCanvas, workerAutre };
}

/* ------------------------------------------------------------------ */

describe('useCollectionIO — exportCollections (matrice d’options)', () => {
  it('export nominal : un JSON par collection dans un seul ZIP passé à saveAs', async () => {
    const tag = (await seedTags([makeTag({ id: 'tag-io-1', label: 'Tag export' })]))[0];
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source exportée' }));
    await seedCollection(
      makeCollection({
        id: 'io-alpha',
        name: 'Alpha io',
        tags: [tag.id],
        content: [makeCollectionElement({ sourceId: source.id, manifestId: undefined })],
      }),
    );
    await seedCollection(makeCollection({ id: 'io-beta', name: 'Beta io' }));

    const rendered = renderIO();
    await exportCollections(rendered, ['io-alpha', 'io-beta'], {});

    // Un seul ZIP, une seule fois, sous le nom attendu (frontière navigateur).
    expect(saveAsMock).toHaveBeenCalledTimes(1);

    const zip = await zipFromSave(0);
    expect(entryNames(zip)).toEqual(['Alpha io.json', 'Beta io.json']);

    const alpha = await jsonFile(zip, 'Alpha io.json');
    expect(alpha.collection).toEqual(unwrap(await getCollectionRepository().getById('io-alpha')));
    expect(alpha.tags).toEqual([tag]);
    expect(alpha.sources).toEqual([
      unwrap(await getSourceRepository().getSourceWithContentAndThumbnailById(source.id)),
    ]);
    // Sans option : ni annotations, ni modèle, ni workers/résultats.
    expect('annotations' in alpha).toBe(false);
    expect('model' in alpha).toBe(false);
    expect('workers' in alpha).toBe(false);
    expect('results' in alpha).toBe(false);

    // Collection sans content : clé `sources` ABSENTE (et pas `[]`) — cf. en-tête.
    const beta = await jsonFile(zip, 'Beta io.json');
    expect('sources' in beta).toBe(false);
    expect('tags' in beta).toBe(false);

    const { logger, progressCalls, statusCalls } = rendered.result.current;
    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(progressCalls.current).toEqual([0, 50, 100]); // 0 posé à l'entrée du hook
    expect(logger.status).toBe('done');
    expect(logger.progress).toBe(100);

    expect(messages(rendered)).toEqual([
      'Exporting collection Alpha io (1/2)',
      'Collection Alpha io added to export.',
      'Exporting collection Beta io (2/2)',
      'Collection Beta io added to export.',
      'Export completed successfully.',
    ]);
    expect(errorLogs(rendered)).toEqual([]);

    rendered.unmount();
  });

  it('options.annotations : ajoute les annotations du scope, absentes sans l’option', async () => {
    await seedCollection(makeCollection({ id: 'io-ann', name: 'Gamma io' }));
    const annotationRepository = getAnnotationRepository();
    await annotationRepository.addAll([
      makeAnnotation({ id: 'ann-1', collectionId: 'io-ann', value: 'Première ligne' }),
      makeAnnotation({ id: 'ann-2', collectionId: 'io-ann', value: 'Seconde ligne' }),
    ]);

    const rendered = renderIO();
    await exportCollections(rendered, ['io-ann'], {});
    const sansOption = await jsonFile(await zipFromSave(0), 'Gamma io.json');
    expect('annotations' in sansOption).toBe(false);

    await exportCollections(rendered, ['io-ann'], { annotations: true });
    const avecOption = await jsonFile(await zipFromSave(1), 'Gamma io.json');
    expect(avecOption.annotations).toEqual(
      await annotationRepository.getByScope({ collectionId: 'io-ann' }),
    );
    expect(avecOption.annotations?.map((annotation) => annotation.id)).toEqual(['ann-1', 'ann-2']);

    // Deux exports → deux ZIP, un appel à saveAs chacun.
    expect(saveAsMock).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });

  it('options.model : modèle joint quand modelId résout, silence total sinon', async () => {
    await getModelRepository().add(makeExportedModel('modele-io', 'Modèle io'));
    await seedCollection(makeCollection({ id: 'io-m-ok', name: 'M Ok', modelId: 'modele-io' }));
    await seedCollection(
      makeCollection({ id: 'io-m-absent', name: 'M Absent', modelId: 'modele-fantome' }),
    );
    await seedCollection(makeCollection({ id: 'io-m-none', name: 'M Aucun' }));

    const rendered = renderIO();
    await exportCollections(rendered, ['io-m-ok', 'io-m-absent', 'io-m-none'], { model: true });

    const zip = await zipFromSave(0);
    expect(entryNames(zip)).toEqual(['M Absent.json', 'M Aucun.json', 'M Ok.json']);

    expect((await jsonFile(zip, 'M Ok.json')).model).toEqual(
      unwrap(await getModelRepository().getById('modele-io')),
    );
    // modelId en base mais modèle absent → pas de clé `model`, PAS de log non plus
    // (caractérisation) ; collection sans modelId → garde `modelId !== undefined`.
    expect('model' in (await jsonFile(zip, 'M Absent.json'))).toBe(false);
    expect('model' in (await jsonFile(zip, 'M Aucun.json'))).toBe(false);
    expect(errorLogs(rendered)).toEqual([]);

    rendered.unmount();
  });

  it('options.workers + workersScope collection : uniquement les workers au scope exact', async () => {
    const { workerCol, workerCanvas } = await seedWorkerScenario();
    const resultRepository = getResultRepository();

    const rendered = renderIO();
    await exportCollections(rendered, ['io-workers', 'io-vide-workers'], {
      workers: true,
      workersScope: 'collection',
    });

    const zip = await zipFromSave(0);
    const exported = await jsonFile(zip, 'Workers io.json');
    expect(exported.workers).toEqual([workerCol]);
    expect(exported.results).toEqual(await resultRepository.getAllByWorkerId(workerCol.id));
    expect(exported.results?.map((result) => result.taskId)).toEqual([1, 2]);
    // Le worker au scope canevas (descendant) est exclus par la portée `collection`.
    expect(exported.workers?.map((worker) => worker.id)).not.toContain(workerCanvas.id);

    // workers:true mais aucun worker au scope exact → ni clé workers, ni clé results.
    const vide = await jsonFile(zip, 'Vide workers io.json');
    expect('workers' in vide).toBe(false);
    expect('results' in vide).toBe(false);

    rendered.unmount();
  });

  it('options.workers + workersScope all : descendants inclus, portée omise = all', async () => {
    const { workerCol, workerCanvas, workerAutre } = await seedWorkerScenario();
    const resultRepository = getResultRepository();
    const expectedResults = [
      ...(await resultRepository.getAllByWorkerId(workerCol.id)),
      ...(await resultRepository.getAllByWorkerId(workerCanvas.id)),
    ].sort((a, b) => a.id - b.id);

    const rendered = renderIO();
    await exportCollections(rendered, ['io-workers'], { workers: true, workersScope: 'all' });
    const zipAll = await jsonFile(await zipFromSave(0), 'Workers io.json');
    expect(zipAll.workers?.map((worker) => worker.id).sort()).toEqual(
      [workerCol.id, workerCanvas.id].sort(),
    );
    expect(zipAll.results?.slice().sort((a, b) => a.id - b.id)).toEqual(expectedResults);
    // Le worker d'une autre collection n'est jamais inclus.
    expect(zipAll.workers?.map((worker) => worker.id)).not.toContain(workerAutre.id);

    // `workersScope` omis → subScope = true (comparaison `!== 'collection'`) : même résultat.
    await exportCollections(rendered, ['io-workers'], { workers: true });
    const zipSansScope = await jsonFile(await zipFromSave(1), 'Workers io.json');
    expect(zipSansScope.workers?.map((worker) => worker.id).sort()).toEqual(
      zipAll.workers?.map((worker) => worker.id).sort(),
    );
    expect(zipSansScope.results?.slice().sort((a, b) => a.id - b.id)).toEqual(expectedResults);

    rendered.unmount();
  });

  it('options.manifest : ajoute <nom>_manifest.json avec les canvases relus en base', async () => {
    const tag = (await seedTags([makeTag({ id: 'tag-io-manifest' })]))[0];
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source manifestée' }));
    await seedCollection(
      makeCollection({
        id: 'io-manifest',
        name: 'Delta io',
        tags: [tag.id],
        content: [
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[0],
            sourceId: source.id,
            manifestId: undefined,
          }),
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[1],
            sourceId: source.id,
            manifestId: undefined,
          }),
        ],
      }),
    );

    const rendered = renderIO();
    await exportCollections(rendered, ['io-manifest'], { manifest: true });

    const zip = await zipFromSave(0);
    expect(entryNames(zip)).toEqual(['Delta io.json', 'Delta io_manifest.json']);
    expect(saveAsMock).toHaveBeenCalledTimes(1);

    const manifest = await manifestFile(zip, 'Delta io_manifest.json');
    expect(manifest['@context']).toBeDefined();
    expect(manifest.type).toBe('Manifest');
    // Id codé en dur au source de generateManifestFromCollection (TODO) — caractérisé.
    expect(manifest.id).toBe('https://1.rp.mezanno.xyz/toto.json');
    expect(manifest.label).toEqual({ none: ['Delta io'] });
    const items = manifest.items as { id: string; partOf: { id: string }[] }[];
    const canvas0 = unwrap(
      await getCollectionRepository().getCanvasByScope({
        collectionId: 'io-manifest',
        canvasId: FIXTURE_CANVAS_IDS[0],
      }),
    );
    const canvas1 = unwrap(
      await getCollectionRepository().getCanvasByScope({
        collectionId: 'io-manifest',
        canvasId: FIXTURE_CANVAS_IDS[1],
      }),
    );
    expect(items.map((item) => item.id)).toEqual([canvas0.canvas.id, canvas1.canvas.id]);
    expect(manifest.tags).toEqual([tag]);

    // Le JSON de la collection accompagne le manifest dans le même ZIP.
    expect((await jsonFile(zip, 'Delta io.json')).collection.name).toBe('Delta io');

    rendered.unmount();
  });

  it('manifest en échec (collection vide) : la collection entière sort du ZIP, progression non tickée', async () => {
    await seedCollection(makeCollection({ id: 'io-vide', name: 'Vide io' }));
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source plein' }));
    await seedCollection(
      makeCollection({
        id: 'io-plein',
        name: 'Plein io',
        content: [makeCollectionElement({ sourceId: source.id, manifestId: undefined })],
      }),
    );

    const rendered = renderIO();
    await exportCollections(rendered, ['io-vide', 'io-plein'], { manifest: true });

    // CARACTÉRISATION (cf. en-tête) : l'échec du manifest fait `continue` AVANT le
    // `zip.file` du JSON — la collection existante est totalement absente du ZIP, et
    // son tick de progression avec lui.
    const zip = await zipFromSave(0);
    expect(entryNames(zip)).toEqual(['Plein io.json', 'Plein io_manifest.json']);
    expect(saveAsMock).toHaveBeenCalledTimes(1);

    expect(errorLogs(rendered)).toEqual([
      'Error generating manifest: Collection Vide io (io-vide) is empty',
    ]);
    expect(messages(rendered)).toEqual([
      'Exporting collection Vide io (1/2)',
      'Error generating manifest: Collection Vide io (io-vide) is empty',
      'Exporting collection Plein io (2/2)',
      'Collection Plein io added to export.',
      'Export completed successfully.',
    ]);
    const { logger, progressCalls, statusCalls } = rendered.result.current;
    expect(progressCalls.current).toEqual([0, 100]); // pas de tick 50 pour l'entrée sautée
    expect(logger.progress).toBe(100);
    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(logger.status).toBe('done');

    rendered.unmount();
  });

  it('collection inexistante : log d’erreur, sautée, sans impact sur les autres', async () => {
    await seedCollection(makeCollection({ id: 'io-reelle', name: 'Réelle io' }));

    const rendered = renderIO();
    await exportCollections(rendered, ['io-fantome', 'io-reelle'], {});

    const zip = await zipFromSave(0);
    expect(entryNames(zip)).toEqual(['Réelle io.json']);

    expect(errorLogs(rendered)).toEqual([
      'Collection with id io-fantome does not exist, skipping export',
    ]);
    // Le `continue` de la branche « inexistante » saute aussi le tick de progression.
    expect(messages(rendered)).toEqual([
      'Collection with id io-fantome does not exist, skipping export',
      'Exporting collection Réelle io (2/2)',
      'Collection Réelle io added to export.',
      'Export completed successfully.',
    ]);
    expect(rendered.result.current.progressCalls.current).toEqual([0, 100]);
    expect(rendered.result.current.statusCalls.current).toEqual(['processing', 'done']);

    rendered.unmount();
  });

  it('sources manquantes : log dédiée par source absente, dédoublonnage du content', async () => {
    const source = await seedRemoteSource(makeRemoteSource({ name: 'Source mixte' }));
    await seedCollection(
      makeCollection({
        id: 'io-mixte',
        name: 'Mixte io',
        content: [
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[0],
            sourceId: source.id,
            manifestId: undefined,
          }),
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[1],
            sourceId: source.id,
            manifestId: undefined,
          }),
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[2],
            sourceId: 'source-fantome',
            manifestId: undefined,
          }),
        ],
      }),
    );
    await seedCollection(
      makeCollection({
        id: 'io-tout-faux',
        name: 'Tout faux io',
        content: [makeCollectionElement({ sourceId: 'source-fantome-2', manifestId: undefined })],
      }),
    );

    const rendered = renderIO();
    await exportCollections(rendered, ['io-mixte', 'io-tout-faux'], {});

    const zip = await zipFromSave(0);
    // Les deux collections sont quand même exportées (la source absente est seulement
    // retirée du tableau `sources`).
    expect(entryNames(zip)).toEqual(['Mixte io.json', 'Tout faux io.json']);

    const mixte = await jsonFile(zip, 'Mixte io.json');
    // Deux entrées du content, même sourceId → une seule lecture de source (Set).
    expect(mixte.sources).toEqual([
      unwrap(await getSourceRepository().getSourceWithContentAndThumbnailById(source.id)),
    ]);

    // Toutes les sources manquent → clé `sources` présente mais vide (cf. en-tête).
    const toutFaux = await jsonFile(zip, 'Tout faux io.json');
    expect(toutFaux.sources).toEqual([]);

    expect(errorLogs(rendered)).toEqual([
      'Source with id source-fantome does not exist, skipping export',
      'Source with id source-fantome-2 does not exist, skipping export',
    ]);

    rendered.unmount();
  });
});

describe('useCollectionIO — cycle import → base réelle → export', () => {
  it('réimporte un ZIP par le pipeline des lots 1–2 puis exporte un ZIP fidèle à la base', async () => {
    const workerCol = makeExportedWorker('worker-e2e-col', { collectionId: 'e2e' });
    const workerCanvas = makeExportedWorker('worker-e2e-canvas', {
      collectionId: 'e2e',
      canvasId: FIXTURE_CANVAS_IDS[0],
    });
    const body: ExportedCollection = {
      collection: makeCollection({
        id: 'e2e',
        name: 'Cycle e2e',
        modelId: 'modele-e2e',
        tags: ['tag-e2e'],
        content: [
          makeCollectionElement({
            canvasId: FIXTURE_CANVAS_IDS[0],
            sourceId: 'source-e2e',
            manifestId: undefined,
          }),
        ],
      }),
      sources: [makeExportedSource('source-e2e')],
      annotations: [
        makeAnnotation({ id: 'e2e-ann-1', collectionId: 'e2e', value: 'Ligne importée 1' }),
        makeAnnotation({ id: 'e2e-ann-2', collectionId: 'e2e', value: 'Ligne importée 2' }),
      ],
      model: makeExportedModel('modele-e2e', 'Modèle e2e'),
      workers: [workerCol, workerCanvas],
      results: [
        makeExportedResult(700, 'worker-e2e-col', 1),
        makeExportedResult(701, 'worker-e2e-canvas', 1),
      ],
      tags: [makeTag({ id: 'tag-e2e' })],
    };

    const rendered = renderIOWithImporter();
    const zipIn = await buildZip({ 'cycle.json': JSON.stringify(body) });
    await act(async () => {
      await rendered.result.current.importer.importCollections(zipIn);
    });

    // L'import a bien écrit sur la base réelle (contrat des lots 1–2, revu par les repos).
    expect((await getCollectionRepository().getById('e2e')).ok).toBe(true);
    const mark = rendered.result.current.logger.logs.length;

    await act(async () => {
      await rendered.result.current.io.exportCollections(['e2e'], {
        annotations: true,
        model: true,
        workers: true,
        workersScope: 'all',
        manifest: true,
      });
    });

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const zipOut = await zipFromSave(0);
    expect(entryNames(zipOut)).toEqual(['Cycle e2e.json', 'Cycle e2e_manifest.json']);

    // Chaque morceau du JSON exporté est comparé à la relure de la base par le VRAI
    // repository (aucun mock de repository dans ce cycle).
    const exported = await jsonFile(zipOut, 'Cycle e2e.json');
    expect(exported.collection).toEqual(unwrap(await getCollectionRepository().getById('e2e')));
    expect(exported.sources).toEqual([
      unwrap(await getSourceRepository().getSourceWithContentAndThumbnailById('source-e2e')),
    ]);
    expect(exported.annotations).toEqual(
      await getAnnotationRepository().getByScope({ collectionId: 'e2e' }),
    );
    expect(exported.annotations?.map((annotation) => annotation.id)).toEqual([
      'e2e-ann-1',
      'e2e-ann-2',
    ]);
    expect(exported.model).toEqual(unwrap(await getModelRepository().getById('modele-e2e')));
    expect(exported.workers?.map((worker) => worker.id).sort()).toEqual(
      ['worker-e2e-col', 'worker-e2e-canvas'].sort(),
    );
    // Agrégation par worker (ordre d'itération des workers non garanti par la
    // requête) : comparaison triée par id, base = les deux lignes de la table.
    expect(exported.results?.slice().sort((a, b) => a.id - b.id)).toEqual(
      await getResultRepository().getAll(),
    );
    expect(exported.results?.map((result) => result.id).sort()).toEqual([700, 701]);
    expect(exported.tags).toEqual(await getTagRepository().getByIds(['tag-e2e']));

    const manifest = await manifestFile(zipOut, 'Cycle e2e_manifest.json');
    expect(manifest.label).toEqual({ none: ['Cycle e2e'] });
    const canvas = unwrap(
      await getCollectionRepository().getCanvasByScope({
        collectionId: 'e2e',
        canvasId: FIXTURE_CANVAS_IDS[0],
      }),
    );
    expect((manifest.items as { id: string }[]).map((item) => item.id)).toEqual([canvas.canvas.id]);

    // Le cycle s'est déroulé sans log d'erreur ; progression des deux phases.
    expect(errorLogs(rendered)).toEqual([]);
    expect(messagesSince(rendered, mark)).toEqual([
      'Exporting collection Cycle e2e (1/1)',
      'Collection Cycle e2e added to export.',
      'Export completed successfully.',
    ]);
    const { logger, progressCalls, statusCalls } = rendered.result.current;
    // import : tick 100 (une entrée de ZIP) ; export : remise à zéro puis tick final.
    expect(progressCalls.current).toEqual([100, 0, 100]);
    expect(statusCalls.current).toEqual(['processing', 'done', 'processing', 'done']);
    expect(logger.status).toBe('done');

    // Réimportabilité caractérisée (cf. en-tête) : le JSON de la collection passe le
    // schéma d'import ; l'entrée manifest, non — le pipeline des lots 1–2 la traiterait
    // comme un fichier illisible (log `error_import_collection`).
    expect(ExportedCollectionSchema.safeParse(exported).success).toBe(true);
    expect(ExportedCollectionSchema.safeParse(manifest).success).toBe(false);

    rendered.unmount();
  });
});
