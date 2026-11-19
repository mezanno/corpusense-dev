/**
 * Lots 1 et 2 — useCollectionImporter (cf. docs/roadmap.md, Q11).
 *
 * Lot 1 — pipeline d'import ZIP (`importCollections`) :
 * - ZIP réel construit avec JSZip, un JSON par collection (schéma courant) ;
 * - progression et statut portés par les `ProgressLoggerSetters` RÉELS de `useLogger` :
 *   l'état final asserti vient du vrai hook ; des transpondeurs `useCallback` se
 *   contentent d'enregistrer les valeurs passées aux setters avant de déléguer aux
 *   setters réels. Les transpondeurs existent parce que React 19 concentre les commits
 *   d'état sous `act()` : la séquence des rendus intermédiaires dépendrait du
 *   ordonnanceur, alors que la suite des valeurs transmises aux setters est le contrat
 *   propre du pipeline (un tick de progression par entrée du ZIP).
 * - fichier illisible (JSON non parsable) → log d'erreur du pipeline sans interrompre
 *   les entrées suivantes.
 *
 * Lot 2 — import d'une collection (`importOneCollection`) et isolation des échecs :
 * - schéma courant accepté : collection, sources, annotations, modèle, workers,
 *   résultats, tags écrits via les VRAIS repositories, vérifiés en base ;
 * - schéma legacy → log d'avertissement, re-fetch des manifests (`fetch` stubbé au
 *   bord réseau sur le fixture `src/__tests__/manifest.json`) et création des sources ;
 * - JSON ne matchant aucun schéma → log d'erreur sans throw, aucune écriture ;
 * - conflits par entité : ils loggent et poursuivent (modèle, workers, résultats,
 *   source en échec) — caractérisés tels qu'implémentés, sans les légitimer.
 *
 * Écarts constatés sur le comportement attendu (rule 7 du plan — documentés, pas
 * corrigés, hors périmètre d'un lot de tests) :
 * - branche `ConstraintError` de `importCollection` MORTE : `IndexedDBCollectionRepository.add`
 *   encapsule l'erreur Dexie dans un `FunctionResult.err` et ne throw jamais, alors que
 *   le hook ne réagit qu'au `throw`. Réimporter une collection existante produit donc
 *   `log_collection_created` + `log_collection_imported_success` (succès trompeur),
 *   AUCUN message `error_import_collection_already_exists`, et le flux POURSUIT :
 *   la garantie « aucune écriture partielle » n'est pas assurée — la ligne collection
 *   elle-même est préservée (transaction Dexie annulée), mais les entités suivantes
 *   sont ré-écrites (les tags existants sont silencieusement écrasés par `bulkPut`).
 *   Même inatteignable, le test « collection déjà présente » verrouille ce comportement
 *   observable et échouera si la branche redevient vivante (à réévaluer alors).
 * - branche `catch` des TAGS morte aussi : `tagRepository.addAll` fait un `bulkPut`
 *   qui n'échoue jamais sur un id déjà présent ; `error_importing_tags` est
 *   inatteignable par un import JSON valide.
 * - échec des ANNOTATIONS non isolé : leur boucle n'a pas de `try/catch` ; un rejet
 *   remonte au catch d'`importOneCollection` (`error_import_collection`, type `'error'`),
 *   la collection et les sources déjà écrites restent en base, le modèle/workers/
 *   résultats/tags du même corps ne sont pas importés.
 * - résultat du re-fetch des manifests de `collection.content` ignoré (pas de vérif
 *   `ok`, pas de log d'échec) ; en conversion legacy, le tableau `sources` du payload
 *   converti est volontairement vide (`sources: []` + TODO au source) : les sources
 *   sont créées pendant la conversion, pas par la boucle d'import des sources ;
 * - `bulkAdd` (workers, résultats) n'est pas atomique sur un lot en collision : les
 *   entrées écrites avant le rejet restent en base (caractérisé par les tests
 *   « workers en collision » et « résultats en collision »).
 *
 * Limites caractérisées par le lot 1 :
 * - l'entrée illisible est loggée par le catch du pipeline SANS sévérité `'error'`
 *   (message `error_import_collection` de type `'info'`) — documenté par le test
 *   « fichier illisible », à ne pas confondre avec le catch d'`importCollection` qui,
 *   lui, loggue en `'error'` ;
 * - le catch d'`importCollections` loggue aussi les `SyntaxError` de `JSON.parse` sans
 *   jamais interrompre la boucle : le statut final reste `'done'` même après échec
 *   d'une entrée (pas de statut `'error'` pour le pipeline).
 *
 * Frontières du lot 2 : pas de mock de Dexie ni du stockage ; `fetch` stubbé uniquement
 * au bord réseau ; le registre des plugins d'import (frontière interne du vrai stack,
 * initialisé par `main.tsx` en production) est initialisé par le fichier pour que la
 * chaîne `fetchManifest → importer` tourne réellement.
 */
import manifestFixture from '@/__tests__/manifest.json';
import { AnnotationDTO } from '@/data/models/annotations/annotation.dto';
import { ExportedCollection, LegacyExportedCollection } from '@/data/models/collection/collection';
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
  makeTag,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import useProgressLogger from '@/hooks/ui/useLogger';
import { initializePluginRegistries } from '@/state/sagas/plugins/registry';
import JSZip from 'jszip';
import { act, useCallback, useRef } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollectionImporter } from '../useCollectionImporter';

resetTestDbBeforeEach();

// Le registre des plugins d'import (`importerPlugins`) est peuplé par `main.tsx` en
// production ; sans initialisation, `fetchManifestFromURL` retomberait sur un importer
// absent. On démarre le vrai stack — seule `fetch` sera stubbée, au bord réseau.
beforeAll(() => {
  initializePluginRegistries();
});

// Un seul espion `fetch` pour tout le fichier, avec implémentation par test. Le
// défaut est bruyant : toute URL réseau inattendue fait échouer le test au lieu de
// sortir sur le réseau (et n'interfère pas avec les autres stubs globaux du setup).
const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();
beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
});
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    throw new Error(`réseau inattendu dans les tests : ${String(input)}`);
  });
});

/* ------------------------------------------------------------------ */
/* Fabriques du pipeline                                               */
/* ------------------------------------------------------------------ */

/** Corps JSON d'une entrée de ZIP au schéma courant : collection + sources vides. */
function exportedCollectionBody(id: string): ExportedCollection {
  return {
    collection: makeCollection({
      id,
      name: `Importée ${id}`,
      content: [makeCollectionElement({ sourceId: `source-${id}`, manifestId: undefined })],
    }),
    sources: [],
  };
}

function jsonEntry(id: string): string {
  return JSON.stringify(exportedCollectionBody(id));
}

/** Construit un vrai ZIP (JSZip) à partir d'entrées nommées. */
async function buildZip(entries: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  Object.entries(entries).forEach(([name, content]) => zip.file(name, content));
  return zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Monte `useCollectionImporter` sur les setters RÉELS de `useLogger`, relevés en
 * passage par des transpondeurs qui délèguent immédiatement (voir en-tête du fichier).
 */
function renderZipImporter() {
  return renderHookWithHarness(() => {
    const logger = useProgressLogger();
    const progressCalls = useRef<number[]>([]);
    const statusCalls = useRef<(typeof logger.status)[]>([]);

    const setProgress = useCallback(
      (value: number) => {
        progressCalls.current.push(value);
        logger.setProgress(value);
      },
      [logger.setProgress],
    );
    const setStatus = useCallback(
      (value: typeof logger.status | 'error') => {
        statusCalls.current.push(value);
        logger.setStatus(value);
      },
      [logger.setStatus],
    );

    const importer = useCollectionImporter({
      setStatus,
      setProgress,
      addLog: logger.addLog,
    });
    return { logger, importer, progressCalls, statusCalls };
  });
}

async function importZip(rendered: ReturnType<typeof renderZipImporter>, data: ArrayBuffer) {
  await act(async () => {
    await rendered.result.current.importer.importCollections(data);
  });
}

const logMessages = (rendered: ReturnType<typeof renderZipImporter>) =>
  rendered.result.current.logger.logs.map((log) => log.message);

/* ------------------------------------------------------------------ */
/* Fabriques du lot 2 — import d'une collection                        */
/* ------------------------------------------------------------------ */

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

function makeImportedModel(id: string, name: string): DataModel {
  return {
    id,
    name,
    prompt: `Prompt de ${name}`,
    fields: [{ id: `${id}-champ-1`, name: 'Champ', type: 'string', color: '#111111' }],
  };
}

function makeImportedWorker(id: string, collectionId: string, name = `Worker ${id}`): Worker {
  return {
    id,
    name,
    scope: { collectionId },
    params: {},
    scopeKey: `sk-${collectionId}`,
    status: WorkerStatus.COMPLETED,
    createdAt: FIXED_DATE,
    estimatedDuration: 0,
    queue: [],
  };
}

function makeImportedResult(id: number, collectionId: string, workerId: string): Result {
  return {
    id,
    scope: { collectionId },
    workerName: 'ocr-test',
    workerId,
    taskId: 1,
    value: { pages: [] },
    params: {},
    scopeKey: `sk-${collectionId}`,
  };
}

/** Source exportée (schéma `SourceWithContentAndThumbnail`) avec vignette base64 valide. */
function makeImportedSource(
  id: string,
  overrides: Partial<SourceWithContentAndThumbnail> = {},
): SourceWithContentAndThumbnail {
  const manifest = {
    ...manifestFixture,
    id: `https://example.org/manifest/${id}.json`,
  } as unknown as SourceWithContentAndThumbnail['content']['manifest'];
  return {
    id,
    name: `Source ${id}`,
    type: 'remote',
    pageCount: FIXTURE_CANVAS_IDS.length,
    thumbnailBlobId: `blob-${id}`,
    content: { id, type: 'remote', manifest },
    thumbnailBase64: 'data:image/png;base64,AAAA',
    ...overrides,
  };
}

/** Corps JSON complet au schéma courant : une entité de chaque sorte, sans manifestId. */
function fullCollectionBody(id: string): ExportedCollection {
  return {
    collection: makeCollection({
      id,
      name: `Courante ${id}`,
      content: [makeCollectionElement({ sourceId: `source-${id}`, manifestId: undefined })],
    }),
    sources: [makeImportedSource(`source-${id}`)],
    annotations: [
      makeAnnotation({ id: `${id}-ann-1`, collectionId: id }),
      makeAnnotation({ id: `${id}-ann-2`, collectionId: id }),
    ],
    model: makeImportedModel(`modele-${id}`, `Modèle ${id}`),
    workers: [makeImportedWorker(`worker-${id}`, id)],
    results: [makeImportedResult(500, id, `worker-${id}`)],
    tags: [makeTag({ id: `tag-${id}` })],
  };
}

/** Monte l'importateur et déclenche l'entrée unique `importOneCollection`. */
async function importOne(
  rendered: ReturnType<typeof renderZipImporter>,
  filename: string,
  json: object,
) {
  await act(async () => {
    await rendered.result.current.importer.importOneCollection(filename, json);
  });
}

/** Messages des logs apparus depuis l'index `since` (le logger s'accumule entre imports). */
const messagesSince = (rendered: ReturnType<typeof renderZipImporter>, since: number): string[] =>
  rendered.result.current.logger.logs.slice(since).map((log) => log.message);

const errorMessages = (rendered: ReturnType<typeof renderZipImporter>) =>
  rendered.result.current.logger.logs
    .filter((log) => log.type === 'error')
    .map((log) => log.message);

const unwrap = <T,>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!result.ok) throw new Error('résultat de repository attendu ok');
  return result.value;
};

/* ------------------------------------------------------------------ */

describe('useCollectionImporter — importCollections (pipeline ZIP)', () => {
  it('importe chaque collection du ZIP, porte progression et statut via useLogger, et écrit sur la base réelle', async () => {
    const rendered = renderZipImporter();
    const zip = await buildZip({
      'alpha.json': jsonEntry('alpha'),
      'beta.json': jsonEntry('beta'),
    });

    await importZip(rendered, zip);

    const { logger, progressCalls, statusCalls } = rendered.result.current;

    // Contrat de progression/porté par les setters réels : un tick par entrée,
    // statut de début et de fin, état final cohérent dans useLogger.
    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(progressCalls.current).toEqual([50, 100]);
    expect(logger.status).toBe('done');
    expect(logger.progress).toBe(100);

    // Déclenchement par entrée : un cycle de logs complet par fichier, dans l'ordre.
    expect(logMessages(rendered)).toEqual([
      'log_starting_import_zip',
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_collection_imported_success',
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_collection_imported_success',
    ]);
    expect(logger.logs.filter((log) => log.type === 'error')).toEqual([]);

    // Écritures observées via le vrai repository : exactement les deux collections.
    const details = await getCollectionRepository().getAllDetails();
    expect(details.map((collection) => collection.id).sort()).toEqual(['alpha', 'beta']);

    const alpha = await getCollectionRepository().getById('alpha');
    if (!alpha.ok) throw new Error('collection alpha absente de la base');
    expect(alpha.value.name).toBe('Importée alpha');
    expect(alpha.value.content).toEqual([
      { canvasId: FIXTURE_CANVAS_IDS[0], sourceId: 'source-alpha' },
    ]);
    expect(alpha.value.createdAt).toBeDefined();

    rendered.unmount();
  });

  it('un fichier illisible produit un log d’erreur du pipeline sans interrompre les entrées suivantes', async () => {
    const rendered = renderZipImporter();
    const zip = await buildZip({
      'corrompu.json': '{ ceci n’est pas du JSON',
      'beta.json': jsonEntry('beta'),
    });

    await importZip(rendered, zip);

    const { logger, progressCalls, statusCalls } = rendered.result.current;

    // Le pipeline loggue l'entrée en échec puis poursuit : beta est bien importée.
    // Caractérisation : ce log passe par le catch du pipeline, qui ne précise pas de
    // sévérité — le message est donc émis en type 'info' alors qu'il signale une erreur
    // (défaut de sévérité documenté, cf. en-tête du fichier ; le catch d'importCollection,
    // lui, loggue en 'error' — lot 2).
    const errorLogs = logger.logs.filter((log) => log.message === 'error_import_collection');
    expect(errorLogs).toHaveLength(1);

    expect(logMessages(rendered)).toEqual([
      'log_starting_import_zip',
      'error_import_collection',
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_collection_imported_success',
    ]);

    // Aucune écriture pour l'entrée illisible, beta présente.
    const details = await getCollectionRepository().getAllDetails();
    expect(details.map((collection) => collection.id)).toEqual(['beta']);

    // Le pipeline va au bout : progression complète, statut done même après échec d'entrée.
    expect(progressCalls.current).toEqual([50, 100]);
    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(logger.status).toBe('done');
    expect(logger.progress).toBe(100);

    rendered.unmount();
  });

  it('ignore les entrées de type dossier et compte la progression par entrée du ZIP', async () => {
    const rendered = renderZipImporter();
    const zip = new JSZip();
    const folder = zip.folder('sous-dossier');
    folder?.file('gamma.json', jsonEntry('gamma'));
    const data = await zip.generateAsync({ type: 'arraybuffer' });

    await importZip(rendered, data);

    const { logger, progressCalls } = rendered.result.current;

    // L'entrée dossier ne déclenche aucun import et aucun log d'erreur ; le JSON
    // qu'elle contient est traité comme les autres. La progression compte bien
    // l'entrée dossier (2 entrées dans le ZIP → ticks 50 puis 100).
    expect(logger.logs.filter((log) => log.message === 'error_import_collection')).toEqual([]);
    expect(logMessages(rendered)).toEqual([
      'log_starting_import_zip',
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_collection_imported_success',
    ]);
    expect(progressCalls.current).toEqual([50, 100]);
    expect(logger.status).toBe('done');

    const gamma = await getCollectionRepository().getById('gamma');
    expect(gamma.ok).toBe(true);

    rendered.unmount();
  });

  it('un ZIP vide laisse la progression à 0 et conclut sans erreur', async () => {
    const rendered = renderZipImporter();
    const zip = new JSZip();
    const data = await zip.generateAsync({ type: 'arraybuffer' });

    await importZip(rendered, data);

    const { logger, progressCalls, statusCalls } = rendered.result.current;

    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(progressCalls.current).toEqual([]);
    expect(logger.status).toBe('done');
    expect(logger.progress).toBe(0);
    expect(logMessages(rendered)).toEqual(['log_starting_import_zip']);
    const details = await getCollectionRepository().getAllDetails();
    expect(details).toEqual([]);

    rendered.unmount();
  });
});

describe('useCollectionImporter — importOneCollection (import d’une collection)', () => {
  it('accepte le schéma courant et écrit toutes les entités via les vrais repositories', async () => {
    const rendered = renderZipImporter();

    await importOne(rendered, 'c1.json', fullCollectionBody('c1'));

    const { logger, progressCalls, statusCalls } = rendered.result.current;

    // Point d'entrée direct : statut processing → done, aucune progression (le
    // pipeline ZIP seul ticking `setProgress`).
    expect(statusCalls.current).toEqual(['processing', 'done']);
    expect(progressCalls.current).toEqual([]);
    expect(logger.status).toBe('done');

    expect(logMessages(rendered)).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_sources',
      'log_importing_source',
      'log_source_imported',
      'log_importing_annotations',
      'log_imported_annotations',
      'log_importing_model',
      'log_model_imported',
      'log_importing_workers',
      'log_imported_workers',
      'log_importing_results',
      'log_imported_results',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(errorMessages(rendered)).toEqual([]);

    // Base réelle : chaque entité relue par son repository.
    const collection = unwrap(await getCollectionRepository().getById('c1'));
    expect(collection.name).toBe('Courante c1');
    expect(collection.content).toEqual([
      { canvasId: FIXTURE_CANVAS_IDS[0], sourceId: 'source-c1' },
    ]);

    const sourceRepository = getSourceRepository();
    const source = unwrap(await sourceRepository.getById('source-c1'));
    expect(source.name).toBe('Source source-c1');
    expect(unwrap(await sourceRepository.getContentById('source-c1')).type).toBe('remote');
    expect((await sourceRepository.getBlob('blob-source-c1')).ok).toBe(true);

    const annotations = await getAnnotationRepository().getByScope({ collectionId: 'c1' });
    expect(annotations.map((annotation) => annotation.id).sort()).toEqual(['c1-ann-1', 'c1-ann-2']);

    expect(unwrap(await getModelRepository().getById('modele-c1')).name).toBe('Modèle c1');
    expect((await getWorkerRepository().getById('worker-c1')).ok).toBe(true);
    const results = await getResultRepository().getAll();
    expect(results.map((result) => result.id)).toEqual([500]);
    expect(await getTagRepository().getByIds(['tag-c1'])).toHaveLength(1);

    rendered.unmount();
  });

  it('relance le fetch des manifestId du content — et en ignore le résultat (échec sans impact)', async () => {
    const rendered = renderZipImporter();
    fetchMock.mockImplementation(
      async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        }) as unknown as Response,
    );
    const body: ExportedCollection = {
      collection: makeCollection({
        id: 'relance',
        content: [
          makeCollectionElement({
            sourceId: 'source-relance',
            manifestId: 'https://example.org/manifest/inexistant.json',
          }),
        ],
      }),
      sources: [],
    };

    await importOne(rendered, 'relance.json', body);

    // Caractérisation : le résultat de `fetchManifest` n'est pas vérifié dans la
    // boucle de re-fetch — un 404 réseau ne loggue rien et n'interrompt pas l'import.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'log_fetching_manifest',
      'log_collection_created',
      'log_collection_imported_success',
    ]);
    expect(errorMessages(rendered)).toEqual([]);
    expect((await getCollectionRepository().getById('relance')).ok).toBe(true);

    rendered.unmount();
  });

  it('un JSON hors schéma loggue une erreur sans throw et sans écrire en base', async () => {
    const rendered = renderZipImporter();

    await importOne(rendered, 'invalide.json', { collection: { id: 'invalide' } });

    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'error_import_collection',
    ]);
    // Le catch d'`importCollection` loggue bien en sévérité 'error' (contrastant
    // avec le catch du pipeline ZIP, en 'info').
    expect(
      rendered.result.current.logger.logs.find((log) => log.message === 'error_import_collection')
        ?.type,
    ).toBe('error');
    expect(rendered.result.current.logger.status).toBe('done');

    expect(await getCollectionRepository().getAllDetails()).toEqual([]);
    expect(await getModelRepository().getAll()).toEqual([]);

    rendered.unmount();
  });

  it('convertit une collection legacy : warning, fetch des manifests et création des sources', async () => {
    const rendered = renderZipImporter();
    // Frontière réseau : le manifeste du fixture répond sur toute URL de manifeste,
    // la vignette du fixture sur son URL propre.
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('.thumbnail')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          blob: async () => new Blob(['vignette de test']),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => structuredClone(manifestFixture),
      } as unknown as Response;
    });

    const legacyBody: LegacyExportedCollection = {
      collection: {
        id: 'legacy',
        name: 'Collection legacy',
        tags: [],
        contentSize: 2,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
        content: [
          { canvasId: FIXTURE_CANVAS_IDS[0], position: 1, manifestId: manifestFixture.id },
          { canvasId: FIXTURE_CANVAS_IDS[1], position: 2, manifestId: manifestFixture.id },
        ],
      },
      tags: [makeTag({ id: 'tag-legacy' })],
    };

    await importOne(rendered, 'legacy.json', legacyBody);

    // Le tableau `sources` du payload converti est vide au source (TODO) : la source
    // est créée pendant la conversion, pas par la boucle d'import des sources.
    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'log_legacy_collection_detected',
      'log_fetched_manifest',
      'log_manifest_added_to_library',
      'log_fetching_manifest',
      'log_collection_created',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(
      rendered.result.current.logger.logs.find(
        (log) => log.message === 'log_legacy_collection_detected',
      )?.type,
    ).toBe('warning');
    expect(errorMessages(rendered)).toEqual([]);

    // Un fetch réseau pour le manifeste (via l'importer Gallica réel, endpoint
    // openapi) et un pour sa vignette ; le re-fetch de la boucle d'import touche la
    // base (source déjà ajoutée pendant la conversion) et ne re-sollicite pas le réseau.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openapi.bnf.fr/iiif/presentation/v3/ark:/12148/bpt6k2012653g/manifest.json',
      expect.anything(),
    );

    // Le content porté par la collection réécrite référence la source créée, et
    // conserve le manifestId ; `position` a été retiré par le schéma courant.
    const collection = unwrap(await getCollectionRepository().getById('legacy'));
    const storedContent = unwrap(
      await getSourceRepository().getContentByManifestUrl(manifestFixture.id),
    );
    expect(collection.content).toEqual([
      {
        canvasId: FIXTURE_CANVAS_IDS[0],
        manifestId: manifestFixture.id,
        sourceId: storedContent.id,
      },
      {
        canvasId: FIXTURE_CANVAS_IDS[1],
        manifestId: manifestFixture.id,
        sourceId: storedContent.id,
      },
    ]);
    expect(await getTagRepository().getByIds(['tag-legacy'])).toHaveLength(1);

    rendered.unmount();
  });

  it('collection déjà présente : la branche ConstraintError n’est JAMAIS prise — réimport annoncé réussi avec écrasement partiel', async () => {
    const rendered = renderZipImporter();

    await importOne(rendered, 'doublon.json', {
      collection: makeCollection({ id: 'doublon', name: 'Collection première' }),
      sources: [],
      tags: [makeTag({ id: 'tag-doublon', label: 'Premier libellé' })],
    });
    const mark = rendered.result.current.logger.logs.length;

    await importOne(rendered, 'doublon.json', {
      collection: makeCollection({ id: 'doublon', name: 'Collection seconde' }),
      sources: [],
      tags: [makeTag({ id: 'tag-doublon', label: 'Libellé écrasé' })],
    });

    // CARACTÉRISATION D'UN DÉFAUT (cf. en-tête) : `IndexedDBCollectionRepository.add`
    // ne throw jamais — il renvoie un `FunctionResult.err` que le hook ignore. Le
    // second import se conduite donc comme un succès : message dédié
    // `error_import_collection_already_exists` inatteignable, aucun log d'erreur, et
    // le flux continue sur les entités.
    expect(messagesSince(rendered, mark)).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(logMessages(rendered)).not.toContain('error_import_collection_already_exists');
    expect(errorMessages(rendered)).toEqual([]);

    // La ligne collection est préservée (transaction Dexie annulée, add non mis à
    // jour) : pas de doublon, pas d'écrasement. Mais la poursuite du flux écrit les
    // autres entités — « aucune écriture partielle » n'est PAS garantie : le tag
    // existant est silencieusement écrasé.
    const details = await getCollectionRepository().getAllDetails();
    expect(details).toHaveLength(1);
    expect(unwrap(await getCollectionRepository().getById('doublon')).name).toBe(
      'Collection première',
    );
    expect(await getTagRepository().getByIds(['tag-doublon'])).toEqual([
      { id: 'tag-doublon', label: 'Libellé écrasé' },
    ]);

    rendered.unmount();
  });

  it('modèle déjà présent : échec isolé (ConstraintError levée par le repository), l’import poursuit', async () => {
    const rendered = renderZipImporter();
    await getModelRepository().add(makeImportedModel('modele-dup', 'Modèle existant'));

    const body = fullCollectionBody('dup');
    body.model = makeImportedModel('modele-dup', 'Modèle importé');
    await importOne(rendered, 'dup-modele.json', body);

    const messages = messagesSince(rendered, 0);
    expect(messages).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_sources',
      'log_importing_source',
      'log_source_imported',
      'log_importing_annotations',
      'log_imported_annotations',
      'log_importing_model',
      'error_importing_model',
      'log_importing_workers',
      'log_imported_workers',
      'log_importing_results',
      'log_imported_results',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(errorMessages(rendered)).toEqual(['error_importing_model']);

    // Le modèle existant n'est pas écrasé (`add` jette avant d'écrire) ; tout le
    // reste du corps est importé malgré l'échec.
    expect(unwrap(await getModelRepository().getById('modele-dup')).name).toBe('Modèle existant');
    expect((await getWorkerRepository().getById('worker-dup')).ok).toBe(true);
    expect(await getResultRepository().getAll()).toHaveLength(1);
    expect(await getTagRepository().getByIds(['tag-dup'])).toHaveLength(1);

    rendered.unmount();
  });

  it('workers en collision bulkAdd : échec isolé, aucun worker écrit, l’import poursuit', async () => {
    const rendered = renderZipImporter();
    const body = fullCollectionBody('workers');
    body.workers = [
      makeImportedWorker('worker-stable', 'workers'),
      makeImportedWorker('worker-stable', 'workers', 'Worker doublon'),
    ];

    await importOne(rendered, 'workers.json', body);

    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_sources',
      'log_importing_source',
      'log_source_imported',
      'log_importing_annotations',
      'log_imported_annotations',
      'log_importing_model',
      'log_model_imported',
      'log_importing_workers',
      'error_importing_workers',
      'log_importing_results',
      'log_imported_results',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(errorMessages(rendered)).toEqual(['error_importing_workers']);

    // Caractérisation : `bulkAdd` n'est pas atomique sur ce lot — le premier worker
    // est déjà écrit quand le second (même id) fait rejeter l'opération ; le doublon
    // est exclus et les entités suivantes passent quand même.
    const workers = await getWorkerRepository().getAll();
    expect(workers.map((worker) => worker.name)).toEqual(['Worker worker-stable']);
    expect(await getResultRepository().getAll()).toHaveLength(1);
    expect(await getTagRepository().getByIds(['tag-workers'])).toHaveLength(1);

    rendered.unmount();
  });

  it('résultats en collision (id explicite dupliqué) : échec isolé, l’import poursuit', async () => {
    const rendered = renderZipImporter();
    const body = fullCollectionBody('resultats');
    body.workers = [makeImportedWorker('worker-resultats', 'resultats')];
    body.results = [
      makeImportedResult(501, 'resultats', 'worker-resultats'),
      makeImportedResult(501, 'resultats', 'worker-doublon'),
    ];

    await importOne(rendered, 'resultats.json', body);

    const messages = messagesSince(rendered, 0);
    expect(messages).toContain('log_importing_results');
    expect(messages).toContain('error_importing_results');
    // L'import ne s'arrête pas : les tags passent après l'échec des résultats.
    expect(messages[messages.indexOf('error_importing_results') + 1]).toBe('log_importing_tags');
    expect(messages.at(-1)).toBe('log_collection_imported_success');
    expect(errorMessages(rendered)).toEqual(['error_importing_results']);

    // Comme pour les workers, `bulkAdd` (table auto-incrémentée) n'est pas atomique :
    // le premier résultat est écrit, le doublon d'id est rejeté.
    const results = await getResultRepository().getAll();
    expect(results.map((result) => result.workerId)).toEqual(['worker-resultats']);

    rendered.unmount();
  });

  it('tags en collision : aucune erreur possible (bulkPut) — la branche catch des tags est morte', async () => {
    const rendered = renderZipImporter();
    const body = fullCollectionBody('tags');
    body.tags = [
      makeTag({ id: 'tag-stable', label: 'Premier libellé' }),
      makeTag({ id: 'tag-stable', label: 'Dernier libellé' }),
    ];

    await importOne(rendered, 'tags.json', body);

    // CARACTÉRISATION (cf. en-tête) : `tagRepository.addAll` fait un `bulkPut` qui
    // écrase silencieusement l'id déjà présent — `error_importing_tags` est
    // inatteignable par un import JSON valide. Comportement verrouillé tel quel.
    expect(messagesSince(rendered, 0)).toContain('log_imported_tags');
    expect(errorMessages(rendered)).toEqual([]);
    expect(await getTagRepository().getByIds(['tag-stable'])).toEqual([
      { id: 'tag-stable', label: 'Dernier libellé' },
    ]);

    rendered.unmount();
  });

  it('source en échec : log dédiée, écriture annulée par sa transaction, l’import poursuit', async () => {
    const rendered = renderZipImporter();
    const premiere = makeImportedSource('source-k');
    const doublon = makeImportedSource('source-k', {
      name: 'Source doublon',
      thumbnailBlobId: 'blob-k-second',
      content: {
        id: 'source-k',
        type: 'remote',
        manifest: {
          ...manifestFixture,
          id: 'https://example.org/manifest/second.json',
        } as unknown as typeof premiere.content.manifest,
      },
    });
    const body = fullCollectionBody('k');
    body.sources = [premiere, doublon];

    await importOne(rendered, 'sources.json', body);

    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_sources',
      'log_importing_source',
      'log_source_imported',
      'log_importing_source',
      'error_importing_source',
      'log_importing_annotations',
      'log_imported_annotations',
      'log_importing_model',
      'log_model_imported',
      'log_importing_workers',
      'log_imported_workers',
      'log_importing_results',
      'log_imported_results',
      'log_importing_tags',
      'log_imported_tags',
      'log_collection_imported_success',
    ]);
    expect(errorMessages(rendered)).toEqual(['error_importing_source']);

    // La collision est un `FunctionResult.err` (jamais un throw) : la source
    // doublonnee n'est PAS écrite (rollback de sa transaction propre), la première
    // version reste telle quelle, vignette du doublon exclue.
    const sourceRepository = getSourceRepository();
    expect(unwrap(await sourceRepository.getById('source-k')).name).toBe('Source source-k');
    const stored = unwrap(await sourceRepository.getContentById('source-k'));
    expect((stored.manifest as { id: string }).id).toBe(premiere.content.manifest.id);
    expect((await sourceRepository.getBlob('blob-k-second')).ok).toBe(false);

    rendered.unmount();
  });

  it('annotation invalide : échec NON isolé — attrapé par importOneCollection, le reste du corps est perdu', async () => {
    const rendered = renderZipImporter();
    const body = fullCollectionBody('cassant');
    body.annotations = [
      // `bodies` absent : `getAnnotationType` rejette dans addAll, que la boucle
      // d'import n'enveloppe pas de try/catch.
      {
        id: 'ann-casse',
        collectionId: 'cassant',
        canvasId: FIXTURE_CANVAS_IDS[0],
      } as unknown as AnnotationDTO,
    ];

    await importOne(rendered, 'cassant.json', body);

    // CARACTÉRISATION (cf. en-tête) : contrairement aux autres entités, la boucle
    // des annotations n'isole pas son échec — le rejet remonte au catch d'importOneCollection
    // (`error_import_collection`, sévérité 'error') et le statut final reste 'done'.
    expect(messagesSince(rendered, 0)).toEqual([
      'log_importing_collection_from_file',
      'log_collection_created',
      'log_importing_sources',
      'log_importing_source',
      'log_source_imported',
      'log_importing_annotations',
      'error_import_collection',
    ]);
    expect(errorMessages(rendered)).toEqual(['error_import_collection']);
    expect(rendered.result.current.statusCalls.current).toEqual(['processing', 'done']);

    // Écritures PARTIELLES : collection et source restent en base, le modèle et les
    // tags du même corps ne sont jamais importés.
    expect((await getCollectionRepository().getById('cassant')).ok).toBe(true);
    expect((await getSourceRepository().getById('source-cassant')).ok).toBe(true);
    expect(await getAnnotationRepository().getByScope({ collectionId: 'cassant' })).toEqual([]);
    expect((await getModelRepository().getById('modele-cassant')).ok).toBe(false);
    expect(await getTagRepository().getByIds(['tag-cassant'])).toEqual([]);

    rendered.unmount();
  });
});
