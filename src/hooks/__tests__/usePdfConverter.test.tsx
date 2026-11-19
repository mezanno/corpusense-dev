/**
 * Lots 13 et 14 — usePdfConverter : cycle complet de conversion (lot 13, 1/2) puis erreurs et
 * abandons (lot 14, 2/2) (cf. docs/roadmap.md, Q11). Le lot 14 EXTEND ce fichier par des
 * describes dédiées en fin de suite : aucun test du lot 13 n'y a été modifié (seuls l'en-tête
 * et les fabriques ont été complétés — coutures de faute à la frontière de rendu et à
 * l'écriture, strictement additionnelles).
 *
 * Couvert par le lot 13 (parcours nominal de bout en bout, sans écriture disque réelle) :
 * - `selectFile` (l. 52-74) : options passées à `showOpenFilePicker` (types PDF, `multiple`
 *   faux), handle et nom retenus, journal `log_selected_file`, statut `idle` posé là ;
 * - `convert` (l. 124-233) nominal : lecture du fichier → `getDocument` (données binaires et
 *   `wasmUrl` fondé sur `import.meta.env.BASE_URL`), `numPages` journalisé, `showDirectoryPicker`
 *   appelé avec `startIn` = handle du PDF (identité), puis PAR PAGE : rendu à l'échelle 2,
 *   miniature JPEG séparée pour la page 1 (échelle 0,3), écriture `<base>_page_NNN.png`
 *   (zéro-padded 3), `log_saving`, `setProgress(Math.round(i/N*100))` ;
 * - fin de cycle : statut `done` et `log_conversion_completed` posés AVANT l'écriture de la
 *   miniature `<base>_thumbnail.png` et du manifest `<base>_manifest.json` (contenu =
 *   `JSON.stringify(newManifest, null, 2)` exactement égal au manifest retourné) ;
 * - manifest composés par le hook : canvas `sortie/<base>_page_NNN.png` (id + thumbnail +
 *   dimensions = viewport plafonné), la sémantique de `generateManifest` elle-même étant déjà
 *   verrouillée côté utils ;
 * - valeur retournée `ConvertedFileInfo` : title, dossier, manifestName, identité du handle de
 *   dossier et du blob de miniature (le blob écrit en `…_thumbnail.png` et celui retourné sont
 *   LE MÊME objet) ;
 * - `reset` (l. 44-50) : retour complet à l'état initial après un cycle mené au bout ;
 * - `addConvertedFileToLibrary` (l. 76-94) : écriture via le VRAI repository source et
 *   relecture en base (nom, pageCount = canvas du manifest, `localFile` champ par champ, ligne
 *   de blob de miniature créée — le CONTENU du blob ne survit pas au clonage de
 *   fake-indexeddb en environnement jsdom, constat documenté dans le test) ;
 * - la progression (l. 181) : le palier terminal 100 est verrouillé par les deux tests de cycle.
 *   Les paliers intermédiaires par page ne sont PAS observables en cours de course : sous l'`act`
 *   de RTL, aucun commit n'a lieu pendant l'`await` de `convert` — `result.current.progress`
 *   mesuré reste à 0 jusqu'à la fin (sonde tentée puis retirée de ce lot). Les lire aurait exigé
 *   un délai (interdit par le plan) ; ils sont donc assertis au lot 14 comme états TERMINALS
 *   soldés par une injection de faute à la k-ième écriture — même méthode qu'au lot 12 ;
 *
 * Couvert par le lot 14 (chaque chemin d'erreur définit un statut et un log observables, sans
 * délai artificiel — les paliers de progression intermédiaires y sont lus comme états TERMINALS
 * par injection de faute, méthode éprouvée au lot 12) :
 * - défaut de sélection : `convert` lève `error_no_file_selected` AVANT le try (l. 125) — ni
 *   statut, ni log, ni appel aux frontières (rejet seul, caractérisé) ;
 * - rendu d'une page « sans image » (toBlob → null) : `log_error_render` avec le numéro de page,
 *   la boucle CONTINUE (l. 154-157) — la page manque aux écritures comme au manifest, le cycle
 *   finit `done` à 100 ; la numérotation des canvas (`/canvas/pN`) est alors DÉCALÉE de la
 *   numérotation des pages, verrouillé tel quel ;
 * - miniature en échec (échelle 0,3 → null) : repli silencieux (l. 161-167) sur le blob
 *   pleine résolution de la page 1 — fichier thumbnail écrit en PNG, AUCUN log dédié ;
 * - rejet de `page.render(...).promise` : ce n'est PAS la branche « poursuite » — l'exception
 *   remonte au catch global (statut `error`, `log_error`, propagation du MÊME objet) et le
 *   `page.cleanup` (l. 118) n'est pas exécuté ;
 * - abandon du picker de fichiers : `selectFile` ne rejette pas, ne change pas de statut —
 *   `log_error_selecting_file` avec le message interpolé, à la seule frontière `t` (i18n nu) ;
 *   un abandon APRÈS un cycle complet laisse nom/handle/statut intacts (les logs ne sont vidés
 *   que sur le chemin succès, l. 68) ;
 * - abandon du picker de dossier et PDF illisible (`getDocument` en rejet) : statut `error`,
 *   journal d'étapes interrompu au bon endroit, `log_error`, rejet de l'objet d'origine ;
 * - écriture d'une page en échec (injection au `write` de la frontière File System Access) :
 *   palier de la page précédente SOLDE, fichiers déjà écrits maintenus — le parcours n'est pas
 *   transactionnel ;
 * - écriture de la miniature en échec APRÈS le `setStatus('done')` : écart n°1 verrouillé — le
 *   `done` est ravalé en `error` alors que `log_conversion_completed` reste au journal.
 *
 * Frontières (les seules mockées, conformément au plan) :
 * - `pdfjs-dist` mocké à la frontière du module (`vi.mock` + `vi.hoisted`, seul importateur
 *   dans `src/`) : `getDocument` renvoie un faux document à N pages ; chaque page fabrique un
 *   viewport proportionnel à l'échelle demandée — dimension de base 110×160 px pour la page 1,
 *   +10 px par page, donc TOUJOURS entières aux échelles 2 et 0,3 utilisées par le hook — et
 *   un `render()` résolu qui enregistre `{ pageNum, scale, canvas, canvasContext }` et appelle
 *   `cleanup()`. Le faux ne décide rien hors API : c'est le hook qui choisit pages, échelles et
 *   dimensions ;
 * - APIs File System Access stubbées au bord (`showOpenFilePicker` / `showDirectoryPicker`
 *   affectés sur `window` par le test, restaurés ensuite — jsdom ne les fournit pas) ; le faux
 *   dossier d'output implémente uniquement `name`/`kind`/`getFileHandle` → `createWritable` →
 *   `write`/`close`, avec la carte des sauvegardes (nom → contenu) posée par le TEST, pas par
 *   le hook ;
 * - canvas : `getContext('2d')` et `toBlob` viennent du mock canvas global de la suite
 *   (`vitest.setup.ts` → `vitest-webgl-canvas-mock`) : contexte 2d factice, blob de taille
 *   `largeur × hauteur × 4` de type png/jpeg selon le mimetype demandé. Le hook passe par la
 *   VRAIE instance `HTMLCanvasElement` de jsdom ; aucun mock additionnel ici ;
 * - `fetch` stubbé en tripwire : le parcours conversion ne touche jamais le réseau ;
 * - base Dexie réelle (`resetTestDbBeforeEach` du harnais), store et QueryClient du harnais,
 *   aucun délai artificiel ;
 * - i18n : le stub du harnais rend la CLÉ NUE — les logs sont donc assertis par leur clé
 *   suffixe et les valeurs interpolées (numPages, filenames, fileName) à la frontière du stub
 *   `t` (mêmes constats qu'aux lots 11-12).
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - `convert` termine en statut `done` AVANT d'écrire miniature et manifest (l. 184 vs
 *   l. 187-214) : une UI branchée sur `status` annonce « conversion terminée » alors que les
 *   écritures finales peuvent encore échouer — et l'exception aboutirait alors au catch
 *   (l. 227) qui remet `error` ; verrouillé par le test du rejet d'écriture de miniature ;
 * - le `console.log(newManifest)` de la conversion pollue la console à chaque cycle : SUPPRIMÉ
 *   dans ce lot 14, changement d'une ligne explicitement dans son périmètre (décision du plan) ;
 * - `addConvertedFileToLibrary` retourne le `FunctionResult` brut du repository : en échec, le
 *   hook ne loggue ni ne statutise — le report appartient à l'appelant (`ConvertPdfForm`) ;
 * - LOT 14 : le repli de miniature (l. 161-167) est SILENCIEUX — aucun log ne distingue « la
 *   miniature a échoué, on garde la page 1 pleine résolution » d'une miniature réussie (le
 *   fichier écrit passe de JPEG à PNG sans que le journal le dise) ; caractérisé, pas légitimé ;
 * - LOT 14 : sur rejet de `page.render(...).promise`, le `page.cleanup()` (l. 118) n'est jamais
 *   appelé — les ressources pdfjs de la page en erreur restent allouées pendant le reste de la
 *   conversion ; caractérisé par le test de rejet de rendu ;
 * - LOT 14 : quand une page est sautée (rendu null), les canvas du manifest se renumérotent en
 *   continu (`/canvas/p2` porte alors la page 3) — le numéro de page n'est plus dans l'id du
 *   canvas, seul le nom de fichier écrit le rattache ; verrouillé dans le test de poursuite.
 */
import { useTranslation as i18nTestStub } from '@/__tests__/react-i18next';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { renderHookWithHarness, resetTestDbBeforeEach } from '@/hooks/__tests__/harness';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ConvertedFileInfo, usePdfConverter } from '../usePdfConverter';

/** Forme du `t` du stub i18n du harnais : un `vi.fn` qui enregistre clé + options. */
interface StubTranslate {
  (key: string, options?: Record<string, unknown>): string;
  mock: { calls: Array<[key: string, options?: Record<string, unknown>]> };
}

/* ------------------------------------------------------------------ */
/* Frontière pdfjs-dist (mock du module externe, cf. en-tête)          */
/* ------------------------------------------------------------------ */

const pdfjsMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdfjsMocks.GlobalWorkerOptions,
  getDocument: pdfjsMocks.getDocument,
}));

/* ------------------------------------------------------------------ */
/* Fabriques de frontière                                              */
/* ------------------------------------------------------------------ */

interface GetDocumentParams {
  data: ArrayBuffer;
  wasmUrl?: string;
}

interface FakeRenderCall {
  pageNum: number;
  scale: number;
  canvas: HTMLCanvasElement;
  canvasContext: unknown;
}

interface FakePdfPage {
  getViewport: Mock<
    (options: { scale: number }) => { width: number; height: number; scale: number }
  >;
  render: Mock<
    (params: {
      canvasContext: unknown;
      viewport: { scale: number };
      canvas: HTMLCanvasElement;
    }) => { promise: Promise<void> }
  >;
  cleanup: Mock<() => void>;
}

interface FakePdfDocument {
  numPages: number;
  getPage: Mock<(pageNum: number) => Promise<FakePdfPage>>;
  /** Tous les rendus demandés par le hook, dans l'ordre réel d'exécution. */
  renderCalls: FakeRenderCall[];
}

/**
 * Faux document pdfjs : viewport de base (100 + n·10) × (150 + n·10) par page n, multiplié par
 * l'échelle DEMANDÉE PAR LE HOOK (2, 0,3) — dimensions entières dans les deux cas. `render()`
 * enregistre l'appel, offre un crochet de script au test (faute de rendu, miniature…) et
 * résout comme une rasterisation réussie — sauf coutures du lot 14 : `renderRejectFor` fait
 * rejeter la promesse du render ciblé (frontière pdfjs en échec), et `renderSideEffect` peut
 * greffer sur le canvas un `toBlob` rendant null (rasterisation « sans image »).
 */
function makeFakePdfDocument(options: {
  numPages: number;
  renderSideEffect?: (call: FakeRenderCall) => void;
  renderRejectFor?: (pageNum: number, scale: number) => Error | undefined;
}): FakePdfDocument {
  const renderCalls: FakeRenderCall[] = [];
  const cache = new Map<number, FakePdfPage>();
  const getPage = vi.fn(async (pageNum: number): Promise<FakePdfPage> => {
    const cached = cache.get(pageNum);
    if (cached !== undefined) return cached;
    const base = { width: 100 + pageNum * 10, height: 150 + pageNum * 10 };
    const page: FakePdfPage = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: base.width * scale,
        height: base.height * scale,
        scale,
      })),
      render: vi.fn(
        (params: {
          canvasContext: unknown;
          viewport: { scale: number };
          canvas: HTMLCanvasElement;
        }) => {
          const call: FakeRenderCall = {
            pageNum,
            scale: params.viewport.scale,
            canvas: params.canvas,
            canvasContext: params.canvasContext,
          };
          renderCalls.push(call);
          options.renderSideEffect?.(call);
          const rejection = options.renderRejectFor?.(pageNum, params.viewport.scale);
          return {
            promise: rejection !== undefined ? Promise.reject(rejection) : Promise.resolve(),
          };
        },
      ),
      cleanup: vi.fn(),
    };
    cache.set(pageNum, page);
    return page;
  });
  return { numPages: options.numPages, getPage, renderCalls };
}

/** Faux `FileSystemFileHandle` de PDF : `getFile()` rendu par un `vi.fn` espionnable. */
function makeFakePdfFileHandle(fileName: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  const file = {
    kind: 'file' as const,
    name: fileName,
    type: 'application/pdf',
    size: bytes.byteLength,
    // jsdom 27 n'implémente pas Blob.arrayBuffer() (constat lots 8-12) : le faux File le
    // fournit et rend une COPIE à chaque lecture, comme un vrai File.
    arrayBuffer: vi.fn(async () => bytes.slice().buffer),
  };
  const getFile = vi.fn(async () => file);
  return { kind: 'file' as const, name: fileName, getFile, file, bytes };
}

/**
 * Faux `FileSystemDirectoryHandle` d'output : SEULES les méthodes consommées par le hook
 * (`name`, `kind`, `getFileHandle` → `createWritable` → `write`/`close`). Chaque `write` est
 * mémorisé dans `saves` (ordre réel) et `lastByPath` (dernier contenu par nom) ; `onGetFileHandle`
 * est un crochet d'observation posé par le test ; `writeFailures` (lot 14) fait rejeter le
 * `write` d'un nom ciblé AVANT mémorisation — la faute est à la frontière de l'API, pas dans
 * le hook.
 */
function makeFakeOutputDirectoryHandle(name: string, onGetFileHandle?: (fileName: string) => void) {
  const saves: Array<{ name: string; data: Blob | string }> = [];
  const lastByPath = new Map<string, Blob | string>();
  const writeFailures = new Map<string, Error>();
  const getFileHandle = vi.fn(async (fileName: string, _options?: { create?: boolean }) => {
    onGetFileHandle?.(fileName);
    return {
      kind: 'file' as const,
      name: fileName,
      createWritable: vi.fn(async () => ({
        write: vi.fn(async (data: Blob | string) => {
          const failure = writeFailures.get(fileName);
          if (failure !== undefined) throw failure;
          saves.push({ name: fileName, data });
          lastByPath.set(fileName, data);
        }),
        close: vi.fn(async () => {}),
      })),
    };
  });
  return { kind: 'directory' as const, name, getFileHandle, saves, lastByPath, writeFailures };
}

/* ------------------------------------------------------------------ */
/* Outillage de test                                                   */
/* ------------------------------------------------------------------ */

const PDF_FILE_NAME = 'document.pdf';
const PDF_CONTENT = '%PDF-1.4 contenu simulé';
const OUTPUT_DIR_NAME = 'sortie';
const BASE_NAME = 'document'; // PDF_FILE_NAME less '.pdf'
const NUM_PAGES = 3;

/** addLog préfixe `new Date().toLocaleTimeString() - ` ; la clé t() nue est le suffixe. */
function logSuffixes(logs: string[]): string[] {
  return logs.map((log) => log.slice(log.indexOf(' - ') + 3));
}

/** Options passées au stub `t` du harnais pour une clé donnée, dans l'ordre d'appel. */
function tOptionsFor(key: string): Array<Record<string, unknown> | undefined> {
  return (i18nTestStub().t as unknown as StubTranslate).mock.calls
    .filter(([calledKey]) => calledKey === key)
    .map(([, options]) => options);
}

/** Le i18n de test rend la clé nue : le « nom » du fichier choisi est donc la clé. */
const RENDERED_PDF_DESCRIPTION = 'description_pdf_files';

/**
 * Couture de faute « rasterisation sans image » (lot 14) : sur les rendus ciblés
 * (page, échelle), greffe sur LE canvas de l'appel un `toBlob` livrant null. Ombre portée
 * d'instance : le canvas du mock d'environnement garde son comportement pour les autres rendus,
 * aucune page voisine n'est touchée. `renderPageToBlob` (l. 115-121) retourne alors null —
 * c'est LA branche « !blob » du cycle, pas celle du catch.
 */
function failCanvasToBlobFor(targets: Array<[pageNum: number, scale: number]>) {
  return (call: FakeRenderCall): void => {
    if (targets.some(([page, scale]) => page === call.pageNum && scale === call.scale)) {
      call.canvas.toBlob = (callback: BlobCallback) => callback(null);
    }
  };
}

/** DOMException d'abandon d'un picker, telle que la produit le navigateur sur Échap/Annuler. */
function makeAbortError(): DOMException {
  return new DOMException('user cancelled', 'AbortError');
}

/** Montre le hook et installe toutes les frontières du parcours nominal. */
function setupNominalCycle(options?: {
  numPages?: number;
  fileName?: string;
  renderSideEffect?: (call: FakeRenderCall) => void;
  renderRejectFor?: (pageNum: number, scale: number) => Error | undefined;
  /** Crochet de faute à la frontière d'écriture (utilisé par les parcours d'erreur, lot 14). */
  onGetFileHandle?: (fileName: string) => void;
}) {
  const numPages = options?.numPages ?? NUM_PAGES;
  const fileName = options?.fileName ?? PDF_FILE_NAME;
  const pdfFile = makeFakePdfFileHandle(fileName, PDF_CONTENT);
  const baseName = fileName.replace('.pdf', '');
  const doc = makeFakePdfDocument({
    numPages,
    renderSideEffect: options?.renderSideEffect,
    renderRejectFor: options?.renderRejectFor,
  });

  const rendered = renderHookWithHarness(() => usePdfConverter());
  const dir = makeFakeOutputDirectoryHandle(OUTPUT_DIR_NAME, options?.onGetFileHandle);
  const showOpenFilePicker = vi.fn(async () => [pdfFile as unknown as FileSystemFileHandle]);
  const showDirectoryPicker = vi.fn(async () => dir as unknown as FileSystemDirectoryHandle);
  window.showOpenFilePicker = showOpenFilePicker;
  window.showDirectoryPicker = showDirectoryPicker;
  pdfjsMocks.getDocument.mockImplementation((_params: GetDocumentParams) => ({
    promise: Promise.resolve(doc),
  }));

  const pageNames = Array.from(
    { length: numPages },
    (_, i) => `${baseName}_page_${(i + 1).toString().padStart(3, '0')}.png`,
  );

  /** selectFile jusqu'au bout ; retourne après journal et handle posés. */
  async function selectPdf(): Promise<void> {
    await act(async () => {
      await rendered.result.current.selectFile();
    });
  }

  /** convert jusqu'au bout (résolution supposée — les rejets sont traités au lot 14). */
  async function convertPdf(): Promise<ConvertedFileInfo> {
    let info: ConvertedFileInfo | undefined;
    await act(async () => {
      info = await rendered.result.current.convert();
    });
    if (info === undefined) throw new Error('convert() a résolu undefined');
    return info;
  }

  return {
    ...rendered,
    pdfFile,
    dir,
    doc,
    baseName,
    pageNames,
    thumbnailName: `${baseName}_thumbnail.png`,
    manifestName: `${baseName}_manifest.json`,
    showOpenFilePicker,
    showDirectoryPicker,
    selectPdf,
    convertPdf,
  };
}

/* ------------------------------------------------------------------ */
/* Environnement par test                                              */
/* ------------------------------------------------------------------ */

resetTestDbBeforeEach();

const fetchTripwire = vi.fn();

beforeEach(() => {
  // clearAllMocks et non resetAllMocks : ce dernier effacerait les implémentations des stubs
  // globaux posés par vitest.setup.ts (matchMedia, canvas…), nécessaires au harnais.
  vi.clearAllMocks();
  fetchTripwire.mockReset();
  vi.stubGlobal('fetch', fetchTripwire);
});

const pickerHolder = window as unknown as {
  showOpenFilePicker?: unknown;
  showDirectoryPicker?: unknown;
};

afterEach(() => {
  expect(fetchTripwire).not.toHaveBeenCalled();
  delete pickerHolder.showOpenFilePicker;
  delete pickerHolder.showDirectoryPicker;
});

/* ------------------------------------------------------------------ */
/* 1. Sélection du fichier (selectFile, l. 52-74)                      */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — selectFile : frontière showOpenFilePicker', () => {
  it('état initial idle, puis handle et nom retenus, picker appelé une fois avec les options PDF', async () => {
    const h = setupNominalCycle();

    // État initial : rien de sélectionné, rien de journalisé.
    expect(h.result.current.fileHandle).toBeNull();
    expect(h.result.current.fileName).toBe('');
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.progress).toBe(0);
    expect(h.result.current.logs).toEqual([]);

    await h.selectPdf();

    expect(h.showOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(h.showOpenFilePicker).toHaveBeenCalledWith({
      types: [{ description: RENDERED_PDF_DESCRIPTION, accept: { 'application/pdf': ['.pdf'] } }],
      multiple: false,
    });
    expect(h.pdfFile.getFile).toHaveBeenCalledTimes(1);
    // Le handle retenu est L'OBJET rendu par le picker (identité), pas une copie.
    expect(h.result.current.fileHandle).toBe(h.pdfFile);
    expect(h.result.current.fileName).toBe(PDF_FILE_NAME);
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.progress).toBe(0);
    expect(logSuffixes(h.result.current.logs)).toEqual(['log_selected_file']);
    expect(tOptionsFor('log_selected_file')).toEqual([{ fileName: PDF_FILE_NAME }]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Cycle complet de conversion (convert, l. 124-233)                */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — convert : cycle complet de conversion', () => {
  it('parcours nominal de bout en bout : pages écrites nommées, miniature à part, manifest, statut done', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const info = await h.convertPdf();

    // --- lecture du PDF à la frontière pdfjs ---
    expect(pdfjsMocks.getDocument).toHaveBeenCalledTimes(1);
    const [params] = pdfjsMocks.getDocument.mock.calls[0] as [GetDocumentParams];
    // Pas d'`instanceof ArrayBuffer` : le tampon vient du realm interne de jsdom (TextEncoder
    // d'environnement) et l'`ArrayBuffer` du contexte de test a beau être celui de `window`,
    // l'instance ne passe pas l'`instanceof` — même famille de constats qu'au lot 12 sur les
    // tableaux typés d'origines différentes. Vérification par la taille puis octet par octet.
    expect(params.data.byteLength).toBe(h.pdfFile.bytes.byteLength);
    expect(Array.from(new Uint8Array(params.data))).toEqual(Array.from(h.pdfFile.bytes));
    // wasmUrl fondé sur BASE_URL — le test relit la même variable que le hook, pas une copie.
    expect(params.wasmUrl).toBe(`${import.meta.env.BASE_URL}/pdfjs/`);
    expect(h.pdfFile.getFile).toHaveBeenCalledTimes(2); // selectFile, puis convert (l. 131)

    // --- dossier de sortie à la frontière picker ---
    expect(h.showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect(h.showDirectoryPicker).toHaveBeenCalledWith({ startIn: h.pdfFile });

    // --- rendus : chaque page à l'échelle 2, miniature séparée de la page 1 à l'échelle 0,3 ---
    expect(h.doc.renderCalls.map((call) => [call.pageNum, call.scale])).toEqual([
      [1, 2],
      [1, 0.3],
      [2, 2],
      [3, 2],
    ]);
    expect(h.doc.getPage.mock.calls.map(([pageNum]) => pageNum)).toEqual([1, 1, 2, 3]);
    for (const call of h.doc.renderCalls) {
      expect(call.canvasContext).not.toBeNull();
      // Mémoire libérée après rasterisation (l. 118-120) : canvas remis à 0, page nettoyée.
      expect(call.canvas.width).toBe(0);
      expect(call.canvas.height).toBe(0);
    }
    const page1 = await h.doc.getPage(1);
    expect(page1.cleanup).toHaveBeenCalledTimes(2); // full + miniature

    // --- écritures disque : ordre complet, une par cible, sans écriture réelle ---
    expect(h.dir.saves.map((save) => save.name)).toEqual([
      ...h.pageNames,
      h.thumbnailName,
      h.manifestName,
    ]);
    // Noms zéro-padddés sur 3 chiffres, base = nom du PDF sans l'extension.
    expect(h.pageNames).toEqual([
      `${BASE_NAME}_page_001.png`,
      `${BASE_NAME}_page_002.png`,
      `${BASE_NAME}_page_003.png`,
    ]);

    // Blobs des pages : PNG pleine résolution aux dimensions du viewport × échelle 2,
    // taille = largeur × hauteur × 4 selon la convention du mock canvas d'environnement.
    const pageBlobs = h.pageNames.map((name) => h.dir.lastByPath.get(name) as Blob);
    for (const [i, blob] of pageBlobs.entries()) {
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBe((100 + (i + 1) * 10) * 2 * ((150 + (i + 1) * 10) * 2) * 4);
    }

    // Miniature à part : fichier distinct, JPEG (échelle < 1, l. 113), et le MÊME objet blob
    // que celui retourné par convert — pas une relecture ni une copie.
    const thumbnailBlob = h.dir.lastByPath.get(h.thumbnailName) as Blob;
    expect(thumbnailBlob).toBeInstanceOf(Blob);
    expect(thumbnailBlob.type).toBe('image/jpeg');
    expect(thumbnailBlob.size).toBe(110 * 0.3 * (160 * 0.3) * 4);
    expect(thumbnailBlob).not.toBe(pageBlobs[0]);
    expect(info.thumbnailBlob).toBe(thumbnailBlob);

    // --- manifest : écrit sous <base>_manifest.json et identique (au formatage près, figé)
    //     à celui retourné — le hook stringify BIEN l'objet renvoyé (l. 213 vs l. 225) ---
    expect(JSON.stringify(info.manifest, null, 2)).toBe(h.dir.lastByPath.get(h.manifestName));

    // Composition propre au hook : un canvas par page rendue, ids et dimensions sourcés des
    // fichiers écrits (la sémantique de generateManifest est verrouillée côté utils).
    const manifestJson = JSON.parse(h.dir.lastByPath.get(h.manifestName) as string) as {
      id: string;
      items: Array<{
        id: string;
        width: number;
        height: number;
        thumbnail: Array<{ id: string }>;
        items: Array<{ items: Array<{ body: { id: string } }> }>;
      }>;
    };
    expect(manifestJson.id).toBe(h.manifestName); // manifestId = nom du fichier manifest
    expect(manifestJson.items).toHaveLength(NUM_PAGES);
    manifestJson.items.forEach((item, i) => {
      const pageFile = `${OUTPUT_DIR_NAME}/${h.pageNames[i]}`;
      expect(item.id).toBe(`/canvas/p${i + 1}`);
      expect(item.width).toBe((100 + (i + 1) * 10) * 2);
      expect(item.height).toBe((150 + (i + 1) * 10) * 2);
      expect(item.thumbnail[0]?.id).toBe(pageFile);
      expect(item.items[0]?.items[0]?.body.id).toBe(pageFile);
    });

    // --- valeur retournée ---
    expect(info.title).toBe(PDF_FILE_NAME);
    expect(info.folderName).toBe(OUTPUT_DIR_NAME); // handle.name, l. 224
    expect(info.manifestName).toBe(h.manifestName);
    expect(info.outputDirectoryHandle).toBe(h.dir); // identité du handle rendu par le picker

    // --- effets d'API publique : statut, progression finale, journal par étape ---
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.progress).toBe(100);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_saving',
      'log_saving',
      'log_conversion_completed',
    ]);
    expect(tOptionsFor('log_pdf_loaded')).toEqual([{ numPages: NUM_PAGES }]);
    expect(tOptionsFor('log_saving')).toEqual(h.pageNames.map((filename) => ({ filename })));
  });

  it('un seul PDF d’une page : miniature = page unique, manifest à un canvas, progression 100', async () => {
    const h = setupNominalCycle({ numPages: 1 });
    await h.selectPdf();
    const info = await h.convertPdf();

    expect(h.doc.renderCalls.map((call) => [call.pageNum, call.scale])).toEqual([
      [1, 2],
      [1, 0.3],
    ]);
    expect(h.dir.saves.map((save) => save.name)).toEqual([
      `${BASE_NAME}_page_001.png`,
      h.thumbnailName,
      h.manifestName,
    ]);
    expect(info.manifest.items).toHaveLength(1);
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.progress).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Réinitialisation : re-sélection et reset (l. 44-50, 65-70)       */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — réinitialisation du cycle', () => {
  it('re-sélection d’un autre fichier après conversion : nom, handle, statut, progression et logs repartent', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    await h.convertPdf();
    expect(h.result.current.status).toBe('done');

    const secondFile = makeFakePdfFileHandle('autre.pdf', '%PDF-1.4 second contenu');
    h.showOpenFilePicker.mockResolvedValueOnce([secondFile as unknown as FileSystemFileHandle]);
    await act(async () => {
      await h.result.current.selectFile();
    });

    expect(h.result.current.fileHandle).toBe(secondFile);
    expect(h.result.current.fileName).toBe('autre.pdf');
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.progress).toBe(0);
    expect(logSuffixes(h.result.current.logs)).toEqual(['log_selected_file']);
  });

  it('reset après un cycle complet : toutes les parties du hook reviennent à l’état initial', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    await h.convertPdf();

    await act(async () => {
      h.result.current.reset();
    });

    expect(h.result.current.fileHandle).toBeNull();
    expect(h.result.current.fileName).toBe('');
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.progress).toBe(0);
    expect(h.result.current.logs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 4. addConvertedFileToLibrary (l. 76-94) — sortie du cycle           */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — addConvertedFileToLibrary', () => {
  it('ajoute la source locale via le VRAI repository source, relue en base champ par champ', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const info = await h.convertPdf();

    // Constat lots 8/11 : seul un handle INERTE survit au clonage structurel de
    // fake-indexeddb. En navigateur le vrai handle est clonable (objet plateforme) ; ici le
    // test passe une copie inertée du dossier, tout le reste de la fiche étant réel.
    const inertInfo: ConvertedFileInfo = {
      ...info,
      outputDirectoryHandle: {
        kind: 'directory',
        name: info.folderName,
      } as unknown as FileSystemDirectoryHandle,
    };

    const added = await h.result.current.addConvertedFileToLibrary(inertInfo);
    if (!added.ok) throw added.error;
    const source = added.value;

    expect(source.name).toBe(PDF_FILE_NAME);
    expect(source.pageCount).toBe(NUM_PAGES); // manifest.items.length (l. 82)
    expect(source.thumbnailBlobId).toBeTruthy();

    // Relecture en base par le repository réel : contenu local fidèle à la fiche retournée
    // par convert (manifest du hook, nom du dossier et du fichier manifest).
    const contentResult = await getSourceRepository().getContentById(source.id);
    if (!contentResult.ok) throw contentResult.error;
    const content = contentResult.value;
    if (content.type !== 'local') return expect.unreachable('source seedée locale');
    expect(content.manifest.id).toBe(info.manifestName);
    expect(content.localFile.manifestName).toBe(info.manifestName);
    expect(content.localFile.folderName).toBe(OUTPUT_DIR_NAME);
    expect(content.localFile.timestamp).toEqual(expect.any(Number));
    expect(content.githubManifestUrl).toBeUndefined();

    // La ligne storedBlobs correspondant à la miniature est bien créée par le repository
    // réel. Limite d'environnement documentée (même famille de constats qu'aux lots 8 et
    // 11-12) : un Blob de JSDOM traversant le clonage structurel de fake-indexeddb ressort
    // en `{}` inerté (son `size` est undefined en relecture) — la fidélité du CONTENU ne
    // peut donc pas s'asserter en base ici ; elle l'est en mémoire vive par le test de
    // cycle central (identité du blob entre la fiche retournée et le fichier écrit).
    const blobResult = await getSourceRepository().getBlob(source.thumbnailBlobId);
    if (!blobResult.ok) throw blobResult.error;
    expect(blobResult.value.id).toBe(source.thumbnailBlobId);
    expect(info.thumbnailBlob).toBeInstanceOf(Blob);
    expect((info.thumbnailBlob as Blob).size).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* LOT 14 — erreurs et abandons (chaque chemin définit un statut et un */
/* log observables, sans délai artificiel ni état transitoire)         */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* 5. Défaut de sélection (l. 125)                                     */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — convert : défaut de sélection', () => {
  it('convert sans fichier sélectionné : rejet error_no_file_selected, sans statut, sans log, sans effet de bord', async () => {
    const h = setupNominalCycle();

    // Écart caractérisé (l. 125, avant le try) : le `t` nu donne sa clé au message et RIEN
    // d'autre ne bouge — ni setStatus, ni addLog, ni appel aux frontières.
    await act(async () => {
      await expect(h.result.current.convert()).rejects.toThrow('error_no_file_selected');
    });

    expect(tOptionsFor('error_no_file_selected')).toEqual([undefined]);
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.progress).toBe(0);
    expect(h.result.current.logs).toEqual([]);
    expect(h.showOpenFilePicker).not.toHaveBeenCalled();
    expect(h.pdfFile.getFile).not.toHaveBeenCalled();
    expect(pdfjsMocks.getDocument).not.toHaveBeenCalled();
    expect(h.showDirectoryPicker).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* 6. Erreurs de rendu de page (l. 153-157 et 161-167)                 */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — convert : erreurs de rendu de page', () => {
  it('page 2 rasterisée « sans image » : log_error_render, poursuite avec les autres pages, décalage des canvas du manifest', async () => {
    const h = setupNominalCycle({ renderSideEffect: failCanvasToBlobFor([[2, 2]]) });
    await h.selectPdf();
    const info = await h.convertPdf();

    // La boucle CONTINUE (l. 154-157) : pas de statut error, cycle mené au bout.
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.progress).toBe(100);

    // Le rendu est bien tenté, et la page nettoyée malgré le blob manquant.
    expect(h.doc.renderCalls.map((call) => [call.pageNum, call.scale])).toEqual([
      [1, 2],
      [1, 0.3],
      [2, 2],
      [3, 2],
    ]);
    expect((await h.doc.getPage(2)).cleanup).toHaveBeenCalledTimes(1);

    // Journal : la faute s'insère entre les sauvegardes, avec le NUMÉRO DE PAGE.
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_error_render',
      'log_saving',
      'log_conversion_completed',
    ]);
    expect(tOptionsFor('log_error_render')).toEqual([{ pageNumber: 2 }]);
    expect(tOptionsFor('log_saving')).toEqual([
      { filename: h.pageNames[0] },
      { filename: h.pageNames[2] },
    ]);

    // Le fichier de la page 2 n'est jamais créé ; les trois autres écritures ont lieu.
    expect(h.dir.saves.map((save) => save.name)).toEqual([
      h.pageNames[0],
      h.pageNames[2],
      h.thumbnailName,
      h.manifestName,
    ]);
    expect(h.dir.lastByPath.get(h.pageNames[1])).toBeUndefined();

    // Manifest amputé, et numérotation des canvas en CONTINU des pages retenues :
    // `/canvas/p2` porte le fichier de la PAGE 3 — écart documenté en en-tête.
    expect(info.manifest.items).toHaveLength(2);
    const canvasIds = (info.manifest.items as Array<{ id: string }>).map((item) => item.id);
    expect(canvasIds).toEqual(['/canvas/p1', '/canvas/p2']);
    const bodyIds = info.manifest.items.map(
      (item) =>
        (item as { items: Array<{ items: Array<{ body: { id: string } }> }> }).items[0]?.items[0]
          ?.body.id,
    );
    expect(bodyIds).toEqual([
      `${OUTPUT_DIR_NAME}/${h.pageNames[0]}`,
      `${OUTPUT_DIR_NAME}/${h.pageNames[2]}`,
    ]);
  });

  it('miniature en échec (échelle 0,3 → null) : repli SILENCIEUX sur le blob pleine résolution de la page 1', async () => {
    const h = setupNominalCycle({ renderSideEffect: failCanvasToBlobFor([[1, 0.3]]) });
    await h.selectPdf();
    const info = await h.convertPdf();

    // Repli l. 161-167 : firstPageBlob = blob pleine résolution — même OBJET, donc le fichier
    // thumbnail est le PNG de la page 1 (pas un JPEG) et info.thumbnailBlob l'identique.
    const page1Blob = h.dir.lastByPath.get(h.pageNames[0]) as Blob;
    const thumbnailBlob = h.dir.lastByPath.get(h.thumbnailName) as Blob;
    expect(thumbnailBlob).toBe(page1Blob);
    expect(thumbnailBlob.type).toBe('image/png');
    expect(info.thumbnailBlob).toBe(page1Blob);

    // Écart caractérisé (en-tête) : AUCUN log ne signale le repli — journal strictement
    // identique au cycle nominal, statut done, progression 100.
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_saving',
      'log_saving',
      'log_conversion_completed',
    ]);
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.progress).toBe(100);
    // La tentative de miniature a bien eu lieu (quatre rendus, comme au cycle nominal).
    expect(h.doc.renderCalls).toHaveLength(4);
  });

  it('rejet de page.render à la page 2 : ce n’est PAS la branche poursuite — statut error, palier 33 soldé, écriture partielle maintenue, cleanup non appelé', async () => {
    const renderError = new Error('Invalid PDF structure');
    const h = setupNominalCycle({
      renderRejectFor: (pageNum, scale) => (pageNum === 2 && scale === 2 ? renderError : undefined),
    });
    await h.selectPdf();

    await act(async () => {
      await expect(h.result.current.convert()).rejects.toBe(renderError);
    });

    // La promesse de render rejetée remonte hors de renderPageToBlob jusqu'au catch global :
    // statut error + log_error + propagation du MÊME objet — verrouillé contre la lecture
    // « erreur de page → poursuite » que le plan pourrait suggérer pour CE canal d'échec-là.
    expect(h.result.current.status).toBe('error');
    // Palier de progression : round(1/3·100) posé à la page 1 (l. 181), jamais revu — ici en
    // tant qu'état TERMINAL (méthode des lots 12-14, aucun état transitoire/assertion de timing).
    expect(h.result.current.progress).toBe(33);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_error',
    ]);
    expect(tOptionsFor('log_error')).toEqual([{ message: 'Invalid PDF structure' }]);

    // Non-transactionnel : la page 1 déjà écrite reste au disque simulé ; miniature et
    // manifest ne sont jamais touchés.
    expect(h.dir.saves.map((save) => save.name)).toEqual([h.pageNames[0]]);
    expect(h.dir.lastByPath.get(h.thumbnailName)).toBeUndefined();
    expect(h.dir.lastByPath.get(h.manifestName)).toBeUndefined();

    // Écart caractérisé (en-tête) : le `page.cleanup()` (l. 118) est court-circuité par
    // l'exception — la page 2 n'est jamais nettoyée, la page 1 l'a été deux fois.
    expect((await h.doc.getPage(1)).cleanup).toHaveBeenCalledTimes(2);
    expect((await h.doc.getPage(2)).cleanup).not.toHaveBeenCalled();
    expect(h.dir.getFileHandle).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* 7. Erreurs des picker et de la lecture pdfjs (l. 53-73, 134-144)    */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — erreurs picker et lecture du document', () => {
  it('abandon au sélecteur de fichiers : log_error_selecting_file avec le message, ni rejet ni changement de statut, convert reste impossible', async () => {
    const h = setupNominalCycle();
    const abortError = makeAbortError();
    h.showOpenFilePicker.mockRejectedValueOnce(abortError);

    // selectFile ne rejette PAS (catch interne, l. 71-73) : le seul observable est le journal.
    await act(async () => {
      await h.result.current.selectFile();
    });

    expect(logSuffixes(h.result.current.logs)).toEqual(['log_error_selecting_file']);
    // getErrorMessage transmet le message de l'erreur à l'interpolation. Le canal exact est
    // dépendant du realm : en navigateur une DOMException `AbortError` est une Error et son
    // `message` nu part dans le log ; sous jsdom/Node l'objet ne passe pas `instanceof Error`
    // (constat de frontière analogue aux tableaux typés du lot 12) et c'est le `String()`
    // préfixé du nom qui est rendu. On verrouille le passage du message, pas sa mise en forme.
    expect(tOptionsFor('log_error_selecting_file')).toEqual([
      { message: expect.stringContaining('user cancelled') as unknown },
    ]);
    expect(h.result.current.status).toBe('idle');
    expect(h.result.current.fileHandle).toBeNull();

    // Conséquence enchaînée : sans handle, la conversion ne peut que rejouer l'écart du l. 125.
    await act(async () => {
      await expect(h.result.current.convert()).rejects.toThrow('error_no_file_selected');
    });
  });

  it('abandon au sélecteur APRÈS un cycle complet : nom, handle, statut et progression intacts, le log s’ajoute sans vider le journal', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    await h.convertPdf();

    h.showOpenFilePicker.mockRejectedValueOnce(makeAbortError());
    await act(async () => {
      await h.result.current.selectFile();
    });

    // Caractérisé : `setLogs([])`/`setStatus('idle')` (l. 67-69) ne sont atteints QUE sur le
    // chemin succès — l'abandon ne remet rien à zéro, il ajoute seulement sa ligne.
    expect(h.result.current.fileName).toBe(PDF_FILE_NAME);
    expect(h.result.current.fileHandle).toBe(h.pdfFile);
    expect(h.result.current.status).toBe('done');
    expect(h.result.current.progress).toBe(100);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_saving',
      'log_saving',
      'log_conversion_completed',
      'log_error_selecting_file',
    ]);
  });

  it('abandon au picker de dossier : statut error, log_error terminal, rejet du MÊME objet, aucune écriture', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const abortError = makeAbortError();
    h.showDirectoryPicker.mockRejectedValueOnce(abortError);

    await act(async () => {
      await expect(h.result.current.convert()).rejects.toBe(abortError);
    });

    expect(h.result.current.status).toBe('error');
    expect(h.result.current.progress).toBe(0);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_error',
    ]);
    expect(tOptionsFor('log_error')).toEqual([
      { message: expect.stringContaining('user cancelled') as unknown },
    ]);
    expect(h.dir.getFileHandle).not.toHaveBeenCalled();
    expect(h.doc.renderCalls).toEqual([]);
  });

  it('PDF illisible (getDocument en rejet) : statut error, journal coupé avant log_pdf_loaded, aucune demande de dossier', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const parseError = new Error('Invalid PDF: document cannot be parsed');
    pdfjsMocks.getDocument.mockImplementation((_params: GetDocumentParams) => ({
      promise: Promise.reject(parseError),
    }));

    await act(async () => {
      await expect(h.result.current.convert()).rejects.toBe(parseError);
    });

    expect(h.result.current.status).toBe('error');
    expect(h.result.current.progress).toBe(0);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_error',
    ]);
    expect(tOptionsFor('log_error')).toEqual([
      { message: 'Invalid PDF: document cannot be parsed' },
    ]);
    expect(h.showDirectoryPicker).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* 8. Échecs d’écriture en cours de cycle (l. 174-177, 190-193)        */
/* ------------------------------------------------------------------ */

describe('usePdfConverter — convert : échecs d’écriture à la frontière File System Access', () => {
  it('rejet du write de la page 2 : palier 33 soldé, « log_saving déjà posée avant l’écriture », page 1 maintenue', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const ioError = new Error('disk quota exceeded');
    h.dir.writeFailures.set(h.pageNames[1], ioError);

    await act(async () => {
      await expect(h.result.current.convert()).rejects.toBe(ioError);
    });

    expect(h.result.current.status).toBe('error');
    expect(h.result.current.progress).toBe(33); // palier de la page 1, état terminal (l. 181)
    // Nuance de l'implémentation (l. 172-177) : `log_saving` part AVANT le write effectif —
    // le journal annonce donc une sauvegarde qui a échoué, avant le log_error terminal.
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_saving',
      'log_error',
    ]);
    expect(tOptionsFor('log_saving')).toEqual([
      { filename: h.pageNames[0] },
      { filename: h.pageNames[1] },
    ]);
    // Non-transactionnel : page 1 écrite, page 2 absente (le throw a précédé la mémorisation).
    expect(h.dir.saves.map((save) => save.name)).toEqual([h.pageNames[0]]);
    expect(h.dir.lastByPath.get(h.pageNames[1])).toBeUndefined();
  });

  it('ÉCART n°1 verrouillé — write de la miniature en échec APRÈS le statut done : le done est ravalé en error, log_conversion_completed reste au journal', async () => {
    const h = setupNominalCycle();
    await h.selectPdf();
    const quotaError = new Error('disk full');
    // Faute sur la miniature, donc APRÈS la boucle de pages et le setStatus('done') (l. 184).
    h.dir.writeFailures.set(h.thumbnailName, quotaError);

    await act(async () => {
      await expect(h.result.current.convert()).rejects.toBe(quotaError);
    });

    // Le contrat observable est contradictoire tel qu'implémenté : « terminé » puis « erreur »,
    // les deux journaux présents. Caractérisé, pas légitimé (en-tête, écart n°1).
    expect(h.result.current.status).toBe('error');
    expect(h.result.current.progress).toBe(100);
    expect(logSuffixes(h.result.current.logs)).toEqual([
      'log_selected_file',
      'log_start_conversion',
      'log_pdf_loaded',
      'log_select_output_folder',
      'log_output_ok',
      'log_saving',
      'log_saving',
      'log_saving',
      'log_conversion_completed',
      'log_error',
    ]);
    // Pages écrites, miniature et manifest absents : l'état du disque est « presque fini ».
    expect(h.dir.saves.map((save) => save.name)).toEqual(h.pageNames);
    expect(h.dir.lastByPath.get(h.manifestName)).toBeUndefined();
  });
});
