/**
 * Lots 11 et 12 — convertedFiles/useRepository : frontière GitHub (lot 11, 1/2) puis
 * parcours local du dossier converti et upload fichier par fichier (lot 12, 2/2)
 * (cf. docs/roadmap.md, Q11 ; voir la note de renommage Q7 dans docs/roadmap.md —
 * le nom du fichier source est laissé tel quel, le renommage relève de Q7, pas d'un lot
 * de tests). Le lot 12 EXTEND ce fichier par des describes dédiées en fin de suite : aucun
 * test du lot 11 n'y a été modifié (seuls l'en-tête et les fabriques ont été complétés).
 *
 * Couvert par le lot 11 (tous les échanges GitHub du hook, sans aucun appel réseau réel) :
 * - préconditions de `uploadToRepository`, dans leur ordre réel (l. 100-112) :
 *   source non locale → `Error('Source content is not local')` avant même de lire le
 *   token ; token absent ou whitespace-only du `localStorage` (clé publique
 *   `GITHUB_TOKEN_STORAGE_KEY`) → `Error('GitHub token not configured')` ; permission de
 *   lecture non accordée sur le dossier → `FilePermissionDeniedError`. Dans les trois cas
 *   AUCUN `Octokit` n'est construit et AUCUNE méthode `rest` n'est appelée ;
 * - parcours nominal jusqu'au commit du manifest (l. 114-181) : `new Octokit({ auth })`
 *   avec le token brut du localStorage, `createForAuthenticatedUser` appelé avec
 *   `{ name, private: false, auto_init: false }`, puis commit du manifest via
 *   `createOrUpdateFileContents` ; les URLs `"dossier/…"` du manifest sont réécrites en
 *   `https://raw.githubusercontent.com/owner/repo/main/dossier/…` par
 *   `updateManifestImageUrls` (assertée sur le payload encodé — la fonction n'est appelée
 *   QUE dans cette étape, d'où sa présence dans ce lot et non au lot 12) ; les URLs
 *   externes et les chemins d'un autre dossier restent intacts ;
 * - `source.githubManifestUrl` écrit via le VRAI repository source (l. 170-172) et relu en
 *   base (le repository construit l'URL depuis la RÉPONSE GitHub — owner.login/name de
 *   `createForAuthenticatedUser` — pas depuis le nom demandé : verrouillé par un nom de
 *   réponse volontairement différent du nom demandé) ;
 * - échec HTTP de GitHub en cours d'upload (rejet de `createForAuthenticatedUser`) :
 *   statut `error`, log terminal `log_error`, propagation du MÊME objet d'erreur, aucune
 *   écriture de `githubManifestUrl` ;
 * - `nameAlreadyExists` (l. 183-202) : 404 → false, succès → true, erreur réseau sans
 *   status → false, erreur HTTP non-404 (401) → false, token absent → false sans
 *   construire Octokit.
 *
 * Répartition avec le lot 12 (règle « un lot = un hook maximum », scission 11+12) :
 * - le lot 12 possède le parcours réel du `FileSystemDirectoryHandle` (sous-dossiers,
 *   ordre et exhaustivité des entrées), l'encodage base64 des fichiers par `fileToBase64`,
 *   la progression par fichier et le `skipFileName` asserti pièce par pièce ;
 * - ici le faux handle ne contient QUE le manifest : la boucle d'upload de fichiers
 *   (l. 64-93) est traversée sans jamais uploader de fichier (le manifest tombe dans son
 *   `continue` skipFileName), ce qui suffit pour atteindre l'étape de commit du manifest.
 *   C'est un moyen implicite, pas une assertion : aucune de ces tests n'assertionne le
 *   parcours lui-même. Les réponses minimales du mock Octokit
 *   (`createOrUpdateFileContents` qui résout) servent à traverser le flux, pas à le
 *   vérifier ;
 * - l'état transitoire `processing` et la progression intermédiaire relèvent du lot 12 ;
 *   ce lot verrouille les états terminaux (`idle` avant/après préconditions, `done` et
 *   `progress` 100 après succès, `error` après échec GitHub).
 *
 * Ce que le LOT 12 ajoute (dernière partie du hook, l. 25-33 et 54-94) : le parcours réel
 * d'un `FileSystemDirectoryHandle` IMBRIQUÉ — sous-dossiers enchaînés dans le
 * `for await ... of handle.entries()` de l. 64, récursion l. 82-91 — avec, pièce par pièce,
 * l'ordre et l'exhaustivité des entrées envoyées à `createOrUpdateFileContents`, les chemins
 * relatifs `basePath/name` construits l. 65, l'exclusion du `skipFileName` (l. 67) assertie
 * sur le chemin ET sur le contenu (le manifest commité porte la version RÉÉCRITE : la boucle
 * aurait envoyé la version brute), l'encodage base64 octet par octet de `fileToBase64`
 * (l. 25-33 : 256 valeurs d'octet, UTF-8 multi-octets et fichier vide), les répertoires
 * recursés et jamais envoyés comme fichiers, la progression par fichier (l. 80 — borne réelle
 * vérifiée dans le code : 90 % au dernier fichier, 100 % uniquement après le commit du
 * manifest, l. 168) et le journal `log_upload_file` portant le CHEMIN (l. 71).
 *
 * Méthode pour la progression : les paliers intermédiaires sont lus par INJECTION DE FAUTE au
 * énième `createOrUpdateFileContents` (helper `failCreateFileAtCall`). L'await de l. 72
 * interrompt le parcours et SOLDE `progress` à l'instant de l'arrêt : la valeur devient
 * lisible en sortie d'`act`, comme état TERMINAL, sans dépendre du moment où React commite
 * chaque `setProgress`. Lire l'état pendant la traversée aurait en effet exigé soit un délai
 * (interdit par le plan), soit une trace accrétée depuis le corps du hook — couplée au nombre
 * de rendus, donc fragile. Aucun test de ce lot ne dépend d'un état transitoire.
 *
 * Limite assumée, malgré la répartition annoncée au lot 11 : `status` `'processing'` (l. 115)
 * est BIEN exécuté par chaque upload nominal — donc couvert par la mesure — mais reste sans
 * assertion propre : il n'existe que pendant la traversée, et l'observer reviendrait à dépendre
 * du moment où React commite le rendu. Les états terminaux (`idle`, `done`, `error`) sont
 * verrouillés par le lot 11 ; les transitions de `progress` et les suites de logs le sont ici.
 *
 * Branches restées sans test dans la zone du lot 12, et pourquoi :
 * - l. 65, fausse branche du ternaire `basePath ? \`${basePath}/${name}\` : name` : le parcours
 *   est lancé avec `basePath = handle.name` (l. 146 — le nom du dossier converti, non vide) et
 *   la récursion avec `entryPath` (l. 90, non vide) ; le cas `''` n'est pas atteignable par
 *   l'API publique, le chemin « nu » est une branche morte documentaire ;
 * - l. 81, entrée qui ne serait NI `file` NI `directory` : `FileSystemHandleKind` ne l'autorise
 *   pas, et un handle d'une troisième sorte ferait du faux un second produit à tester (risque
 *   nommé par le plan). En revanche les branches fausses utiles sont couvertes : `kind ===
 *   'file'` faux sur un dossier (l. 66 et 134), `continue` skipFileName à la racine ET dans un
 *   sous-dossier, `kind === 'directory'` pris sur deux niveaux de profondeur.
 *
 * Frontières :
 * - `@octokit/rest` mocké à la frontière du module externe (`vi.mock` + `vi.hoisted`, seul
 *   importateur du module dans `src/`) : chaque `new Octokit(options)` enregistre ses
 *   options, et les quatre méthodes `rest` touchées par le hook sont des `vi.fn()`
 *   partagés. La forme `{ data }` des réponses est celle de l'API publique d'Octokit ;
 * - `fetch` stubbé en tripwire : personne ne l'appelle jamais (le trafic réseau serait
 *   passé par Octokit, mocké) — l'`afterEach` le vérifie ;
 * - File System Access : faux handle minimal `queryPermission`/`entries`/`getFileHandle`,
 *   fidèle à l'interface, passé comme ARGUMENT de l'API publique du hook (le handle n'est
 *   jamais persisté : seul un handle INERTE `{}` survit au clonage structurel de
 *   fake-indexeddb — constat établi au lot 8, `useThumbnail.test.tsx`). La ligne source
 *   existe en base via le VRAI repository (`add` local) pour que la mise à jour
 *   `githubManifestUrl` du repository réel ait une cible ;
 * - File System Access, lot 12 : même principe, mais ARBORESCENCE — `makeFakeTree` construit
 *   de faux handles de dossier enfants déposés dans `entries()` (poignées réelles rendues par
 *   l'itérateur, jamais `getDirectoryHandle`), avec `kind`, `name`, `getFile()` et, pour les
 *   dossiers, `entries()`/`getFileHandle()`/`queryPermission()` au contrat de l'API (rejet
 *   `NotFoundError` sur nom inconnu). Les fichiers portent un contenu `string | Uint8Array` et
 *   peuvent porter une faute de lecture (`rejectGetFile`). Les maps `files` et `directories`
 *   indexées par chemin relatif servent aux assertions de lecture unique et de non-appel —
 *   le faux n'ajoute AUCUNE sémantique hors API : l'ordre des entrées est l'ordre d'écriture
 *   du littéral, la récursion est faite par le hook, pas par le faux ;
 * - `localStorage` : vrai stockage jsdom, écrit via la clé publique du module ;
 * - base Dexie réelle (`resetTestDbBeforeEach()` par test), QueryClient et store du harnais,
 *   aucun délai artificiel. Les logs portent l'horodatage `addLog` ; comme `t` rendu
 *   sans i18n initialisé renvoie la clé (mêmes lots 1-2), les logs sont assertis par
 *   leur clé suffixe ;
 * - lot 12, le CHEMIN du journal n'est pas visible dans `logs` (mêmes causes) : il est donc
 *   asserti à la frontière du stub i18n du harnais (`i18nTestStub().t`, `vi.fn` partagé que
 *   `vite.config.ts` aliasse sur `react-i18next` en mode test), filtré sur la clé
 *   `log_upload_file` pour ignorer les appels des providers montés par le harnais — c'est
 *   bien l'argument d'interpolation que le hook passe à l. 71, et le même `entryPath` qui
 *   part dans le payload du commit (l. 75).
 *
 * Écarts constatés (règle 7 — documentés et remontés, pas corrigés) :
 * - les erreurs de précondition (l. 100-112) lèvent AVANT le `setStatus('processing')` :
 *   le hook reste `status: 'idle'` sans aucun log, l'erreur n'est observable que par le
 *   rejet que l'appelant (`UploadSourceForm.onSubmit`, sans catch) laisse filer en
 *   rejet non traité. Caractérisé tel quel, pas légitimé ;
 * - `nameAlreadyExists` : la branche `status === 404` (l. 192-198) et le `return false`
 *   générique (l. 200) sont indiscernables par l'API publique — toute erreur, 404 ou
 *   réseau, renvoie false (y compris une erreur d'authentification, qui pourrait
 *   mériter un signalement distinct) ; verrouillé par les deux tests « → false » ;
 * - l'URL brute et le chemin uploadé utilisent `handle.name` (l. 129), pas
 *   `localFile.folderName` : les deux divergeraient si le dossier était renommé après
 *   conversion. Aucun test de ce lot ne dépend de la distinction (ils sont égaux ici) ;
 *   à garder en tête pour le lot 12 ;
 * - dans le catch (l. 176-180) `t('log_error', { message })` n'interpole pas le message
 *   dans cet environnement (i18next non initialisé → clé rendue) : le message d'erreur
 *   détaillé n'est observable ici que par le rejet propagé, pas dans le log ;
 * - LOT 12, l. 132-135 : `totalFiles` est compté sur les seules entrées DE LA RACINE (le
 *   comptage ne recoure pas), alors que l'upload, lui, recoure (l. 82-91). Le rapport
 *   `count / totalFiles` de la progression (l. 80) n'est donc plus un taux : plateaux
 *   observés 180 % avec un fichier à la racine et deux en profondeur, `Infinity` quand tous
 *   les fichiers sont en sous-dossiers (division par zéro — jamais `NaN`, `setProgress`
 *   n'étant appelé qu'après un envoi réussi). Un parcours mené au bout masquera le défaut
 *   derrière le `setProgress(100)` terminal ; toute barre de progression branchée sur cet
 *   état sortira du domaine attendu. Caractérisé par les deux tests « ÉCART caractérisé » du
 *   describe « progression », remonté à la clôture de Q11 (lot 38) — pas corrigé ici ;
 * - LOT 12, l. 67 : `skipFileName` est comparé au NOM SIMPLE de l'entrée, à toute profondeur,
 *   et non au chemin `entryPath` : un fichier d'un sous-dossier qui porterait le même nom que
 *   le manifest (typiquement un manifest secondaire) est écarté de l'upload SANS log ni
 *   erreur — perte silencieuse. Verrouillée par le test « ÉCART caractérisé — skipFileName »
 *   (handle jamais lu, aucun commit, aucun journal) ;
 * - LOT 12 : l'envoi des fichiers n'est PAS transactionnel et n'a aucun canal d'alerte côté
 *   store — un rejet en cours de parcours laisse derrière lui les commits déjà partis
 *   (dépôt GitHub peuplé à moitié, `githubManifestUrl` non écrit), le hook ne dispatchant ni
 *   `pushError` ni `pushInfo` (`store.events.allEvents` asserté vide sur chaque échec).
 *   Constat cohérent avec l'écart n°1 du lot 11 (rejet laissé filer par l'appelant) ;
 * - LOT 12 : la distinction `handle.name` / `localFile.folderName` (écart n°3 du lot 11) est
 *   sans effet sur le parcours — les deux valeurs restent égales dans tous les tests, comme
 *   en production, et seul `handle.name` sert de préfixe aux chemins (l. 129 et 146).
 */
import manifestFixture from '@/__tests__/manifest.json';
import { useTranslation as i18nTestStub } from '@/__tests__/react-i18next';
import { SourceWithContent } from '@/data/models/source/source';
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { FilePermissionDeniedError } from '@/data/utils/errors';
import { renderHookWithHarness, resetTestDbBeforeEach } from '@/hooks/__tests__/harness';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import useRepository, { GITHUB_TOKEN_STORAGE_KEY } from '../useRepository';

/** Forme du `t` du stub i18n du harnais : un `vi.fn` qui enregistre clé + options (lot 12). */
interface StubTranslate {
  (key: string, options?: { filename?: string }): string;
  mock: { calls: Array<[key: string, options?: { filename?: string }]> };
}

/* ------------------------------------------------------------------ */
/* Frontière Octokit (mock du module externe, cf. en-tête)             */
/* ------------------------------------------------------------------ */

interface CreateFileParams {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string;
}

const octokitMocks = vi.hoisted(() => {
  const constructorOptions: Array<{ auth?: string }> = [];
  const createForAuthenticatedUser = vi.fn();
  const createOrUpdateFileContents = vi.fn();
  const reposGet = vi.fn();
  const getAuthenticated = vi.fn();
  class OctokitMock {
    public readonly rest = {
      repos: {
        createForAuthenticatedUser,
        createOrUpdateFileContents,
        get: reposGet,
      },
      users: { getAuthenticated },
    };
    constructor(options?: { auth?: string }) {
      constructorOptions.push(options ?? {});
    }
  }
  return {
    OctokitMock,
    constructorOptions,
    createForAuthenticatedUser,
    createOrUpdateFileContents,
    reposGet,
    getAuthenticated,
  };
});

vi.mock('@octokit/rest', () => ({ Octokit: octokitMocks.OctokitMock }));

/* ------------------------------------------------------------------ */
/* Constantes de frontière et fabriques locales                        */
/* ------------------------------------------------------------------ */

const TOKEN = 'jeton-github-de-test';
const OWNER = 'compte-github';
const RESPONSE_REPO_NAME = 'depot-normalise-par-github';
const REQUESTED_REPO_NAME = 'depot-demande';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${RESPONSE_REPO_NAME}/main`;
const MANIFEST_FOLDER = 'dossier-github';
const MANIFEST_NAME = 'manifest.json';
const EXPECTED_GITHUB_MANIFEST_URL = `${RAW_BASE}/${MANIFEST_FOLDER}/${MANIFEST_NAME}`;

// Contentieux du manifest : deux entrées du dossier à réécrire, une URL externe et un
// chemin d'AUTRE dossier en contre-exemples (l'ancre `"` du regex de
// updateManifestImageUrls interdit la réécriture d'une URL déjà absolue).
const MANIFEST_FILE_CONTENT = JSON.stringify({
  id: `https://example.org/manifest/${MANIFEST_FOLDER}`,
  items: [{ id: `${MANIFEST_FOLDER}/page-001.png` }, { id: `${MANIFEST_FOLDER}/page-002.png` }],
  thumbnail: { id: `autre-dossier/${MANIFEST_FOLDER}/vignette.png` },
});
const MANIFEST_FILE_REWRITTEN = JSON.stringify({
  id: `https://example.org/manifest/${MANIFEST_FOLDER}`,
  items: [
    { id: `${RAW_BASE}/${MANIFEST_FOLDER}/page-001.png` },
    { id: `${RAW_BASE}/${MANIFEST_FOLDER}/page-002.png` },
  ],
  thumbnail: { id: `autre-dossier/${MANIFEST_FOLDER}/vignette.png` },
});

function makeGitHubFakeDirectoryHandle(name: string, files: Record<string, string>) {
  const entries = Object.entries(files);
  return {
    name,
    kind: 'directory' as const,
    queryPermission: vi.fn(
      async (_options: { mode: string }): Promise<'granted' | 'denied' | 'prompt'> => 'granted',
    ),
    // for-await consomme entries() deux fois par upload (comptage puis parcours) :
    // l'itérateur doit être neuf à chaque appel.
    entries() {
      const iterator = entries[Symbol.iterator]();
      return {
        async next(): Promise<IteratorResult<[string, unknown]>> {
          return iterator.next();
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
    getFileHandle: vi.fn(async (fileName: string) => {
      const content = files[fileName];
      if (content === undefined) {
        throw new Error(`fichier absent du dossier simulé : ${fileName}`);
      }
      // jsdom 27 n'implémente ni Blob.text() ni Blob.arrayBuffer() ; le faux File les
      // fournit, comme en navigateur (seules méthodes de File consommées par le hook :
      // text() pour le manifest ici, arrayBuffer() pour les fichiers au lot 12).
      const bytes = new TextEncoder().encode(content);
      return {
        kind: 'file' as const,
        name: fileName,
        getFile: async () => ({
          kind: 'file' as const,
          name: fileName,
          type: 'application/json',
          size: bytes.byteLength,
          text: async () => content,
          arrayBuffer: async () => bytes.buffer.slice(0, bytes.byteLength),
        }),
      };
    }),
  };
}

type FakeDirectoryHandle = ReturnType<typeof makeGitHubFakeDirectoryHandle>;

/** Ligne source locale écrite par le VRAI repository, handle inerté (clonable — lot 8). */
async function seedLocalSourceRow(): Promise<SourceWithContent> {
  const result = await getSourceRepository().add({
    type: 'local',
    name: 'Source convertie de test',
    pageCount: 2,
    thumbnailBlob: new Blob(['thumbnail de test']),
    manifest: manifestFixture,
    localFile: {
      outputDirectoryHandle: {} as FileSystemDirectoryHandle,
      timestamp: 0,
      manifestName: MANIFEST_NAME,
      folderName: MANIFEST_FOLDER,
    },
  } as unknown as AddSourceDTO);
  if (!result.ok) throw result.error;
  return result.value;
}

/**
 * Source passée à `uploadToRepository` : la ligne seedée, avec le faux handle fonctionnel
 * greffé sur l'argument (le hook lit le handle du paramètre, jamais de la base — cf.
 * en-tête). Le `folderName` de la ligne et le `name` du handle restent égaux, comme en
 * production (constat d'écart 3).
 */
function withFakeHandle(source: SourceWithContent, handle: FakeDirectoryHandle): SourceWithContent {
  if (source.content.type !== 'local') {
    throw new Error('seed local attendu');
  }
  return {
    ...source,
    content: {
      ...source.content,
      localFile: {
        ...source.content.localFile,
        outputDirectoryHandle: handle as unknown as FileSystemDirectoryHandle,
      },
    },
  };
}

function makeRemoteSourceArg(): SourceWithContent {
  return {
    id: 'source-remote-sans-objet',
    name: 'Source distante de test',
    type: 'remote',
    pageCount: 1,
    thumbnailBlobId: 'blob-inutile',
    content: {
      id: 'source-remote-sans-objet',
      type: 'remote',
      manifest: manifestFixture as unknown as SourceWithContent['content']['manifest'],
    },
  };
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createFileCalls(): CreateFileParams[] {
  return octokitMocks.createOrUpdateFileContents.mock.calls.map(
    ([args]) => args as CreateFileParams,
  );
}

function logSuffixes(logs: string[]): string[] {
  // addLog préfixe `new Date().toLocaleTimeString() - ` ; les clés t() nues (i18n non
  // initialisé) sont le seul contenu déterministe observable du log.
  return logs.map((log) => log.slice(log.indexOf(' - ') + 3));
}

async function readSourceContent(sourceId: string) {
  const result = await getSourceRepository().getContentById(sourceId);
  if (!result.ok) throw result.error;
  return result.value;
}

/* ------------------------------------------------------------------ */
/* Environnement par test                                              */
/* ------------------------------------------------------------------ */

const fetchTripwire = vi.fn();

// Base réelle vidée et réinitialisée par le harnais (lot 41 — la vidange IDB
// centralisée remplace le `getById('__flush__')` que cette suite portait en
// `afterEach` depuis les lots 11-12).
resetTestDbBeforeEach();

beforeEach(() => {
  localStorage.clear();
  // clearAllMocks et non resetAllMocks : ce dernier efface les `mockImplementation` des
  // stubs globaux posés par vitest.setup.ts (matchMedia…), dont le harnais a besoin.
  // Les implémentations d'Octokit étant (re)posées systématiquement ci-dessous, aucun
  // mockResolvedValue/mockRejectedValue de test précédent ne survit.
  vi.clearAllMocks();
  octokitMocks.constructorOptions.length = 0;
  // Défauts « frontière GitHub ouverte » : chaque test n'outrepasse que ce qu'il asserte.
  octokitMocks.getAuthenticated.mockResolvedValue({ data: { login: OWNER } });
  octokitMocks.createForAuthenticatedUser.mockResolvedValue({
    data: {
      full_name: `${OWNER}/${RESPONSE_REPO_NAME}`,
      name: RESPONSE_REPO_NAME,
      owner: { login: OWNER },
    },
  });
  octokitMocks.createOrUpdateFileContents.mockResolvedValue({
    data: { commit_sha: 'sha-de-commit' },
  });
  octokitMocks.reposGet.mockResolvedValue({
    data: { full_name: `${OWNER}/${RESPONSE_REPO_NAME}` },
  });
  fetchTripwire.mockReset();
  vi.stubGlobal('fetch', fetchTripwire);
});

afterEach(() => {
  expect(fetchTripwire).not.toHaveBeenCalled();
});

/* ------------------------------------------------------------------ */
/* 1. Préconditions de uploadToRepository (l. 100-112)                 */
/* ------------------------------------------------------------------ */

describe('useRepository — uploadToRepository : préconditions avant la frontière GitHub', () => {
  it('source non locale : erreur de précondition avant même la lecture du token', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(makeRemoteSourceArg(), REQUESTED_REPO_NAME),
      ).rejects.toThrow('Source content is not local');
    });

    expect(octokitMocks.constructorOptions).toEqual([]);
    expect(octokitMocks.createForAuthenticatedUser).not.toHaveBeenCalled();
    // Écart caractérisé (en-tête) : rejet seul, statut jamais sorti de idle, aucun log.
    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
  });

  it('token absent du localStorage : erreur explicite, aucun Octokit construit', async () => {
    const seeded = await seedLocalSourceRow();
    const handle = makeGitHubFakeDirectoryHandle(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: MANIFEST_FILE_CONTENT,
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withFakeHandle(seeded, handle), REQUESTED_REPO_NAME),
      ).rejects.toThrow('GitHub token not configured');
    });

    // Vérrou d'ordre : la précondition token court AVANT la requête de permission.
    expect(handle.queryPermission).not.toHaveBeenCalled();
    expect(octokitMocks.constructorOptions).toEqual([]);
    expect(octokitMocks.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(octokitMocks.createOrUpdateFileContents).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
  });

  it('token de remplissage whitespace-only : traité comme absent', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, '   ');
    const seeded = await seedLocalSourceRow();
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(
          withFakeHandle(seeded, makeGitHubFakeDirectoryHandle(MANIFEST_FOLDER, {})),
          REQUESTED_REPO_NAME,
        ),
      ).rejects.toThrow('GitHub token not configured');
    });
    expect(octokitMocks.constructorOptions).toEqual([]);
  });

  it('permission non accordée : FilePermissionDeniedError, aucun appel GitHub', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const handle = makeGitHubFakeDirectoryHandle(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: MANIFEST_FILE_CONTENT,
    });
    handle.queryPermission.mockResolvedValue('prompt' as const);
    const { result } = renderHookWithHarness(() => useRepository());

    let thrown: unknown;
    await act(async () => {
      await result.current
        .uploadToRepository(withFakeHandle(seeded, handle), REQUESTED_REPO_NAME)
        .catch((error: unknown) => {
          thrown = error;
        });
    });

    // Le contexte de l'erreur nomme bien le dossier refusé.
    expect(thrown).toBeInstanceOf(FilePermissionDeniedError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as FilePermissionDeniedError).message).toBe(
      `No permission to read the directory ${MANIFEST_FOLDER}`,
    );
    expect((thrown as FilePermissionDeniedError).context).toEqual({ directory: MANIFEST_FOLDER });

    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(octokitMocks.constructorOptions).toEqual([]);
    expect(octokitMocks.createForAuthenticatedUser).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Flux nominal jusqu\'au commit du manifest (l. 114-175)            */
/* ------------------------------------------------------------------ */

describe('useRepository — uploadToRepository : frontière GitHub du manifest', () => {
  it('commit le manifest réécrit en raw.githubusercontent.com et persiste githubManifestUrl via le repository réel', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const handle = makeGitHubFakeDirectoryHandle(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: MANIFEST_FILE_CONTENT,
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withFakeHandle(seeded, handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // Construction du client : le token du localStorage, passé brut à la frontière.
    expect(octokitMocks.constructorOptions).toEqual([{ auth: TOKEN }]);

    // Création du dépôt : paramètres de création tels qu'envoyés (le nom DEMANDÉ part
    // tel quel ; seule la RÉPONSE GitHub servira aux URLs — verrouillé plus bas).
    expect(octokitMocks.createForAuthenticatedUser).toHaveBeenCalledTimes(1);
    expect(octokitMocks.createForAuthenticatedUser).toHaveBeenCalledWith({
      name: REQUESTED_REPO_NAME,
      private: false,
      auto_init: false,
    });
    expect(octokitMocks.getAuthenticated).not.toHaveBeenCalled();

    // Commit du manifest : UN SEUL createOrUpdateFileContents (le dossier simulé ne
    // contient que le manifest —cf. répartition lot 12 en en-tête).
    const [manifestCommit] = createFileCalls();
    expect(createFileCalls()).toHaveLength(1);
    expect(manifestCommit).toBeDefined();
    expect(manifestCommit?.owner).toBe(OWNER);
    expect(manifestCommit?.repo).toBe(RESPONSE_REPO_NAME);
    expect(manifestCommit?.path).toBe(`${MANIFEST_FOLDER}/${MANIFEST_NAME}`);
    expect(manifestCommit?.message).toBe(`Add ${MANIFEST_FOLDER}/${MANIFEST_NAME}`);
    // Réécriture des URLs (updateManifestImageUrls, exercée uniquement ici) : contenu
    // exactement attendu, URL par URL (les items du dossier réécrits, l'URL absolue et le
    // chemin « autre-dossier » intacts).
    expect(decodeBase64Utf8(manifestCommit?.content ?? '')).toBe(MANIFEST_FILE_REWRITTEN);

    // Effets d'API publique : statut terminal, progression finale, journal d'étapes.
    expect(result.current.status).toBe('done');
    expect(result.current.progress).toBe(100);
    expect(logSuffixes(result.current.logs)).toEqual([
      'log_upload_start',
      'log_upload_repo_created',
      'log_upload_manifest',
      'log_upload_completed',
    ]);

    // Persistance par le repository RÉEL, relu en base : URL construite depuis la
    // réponse GitHub (nom normalisé ≠ nom demandé) et le handle, pas depuis le champ
    // localFile.folderName.
    const stored = await readSourceContent(seeded.id);
    expect(stored.type).toBe('local');
    if (stored.type === 'local') {
      expect(stored.githubManifestUrl).toBe(EXPECTED_GITHUB_MANIFEST_URL);
    }
    // La ligne source elle-même est inchangée par ailleurs.
    const row = await getSourceRepository().getById(seeded.id);
    expect(row.ok && row.value.name).toBe('Source convertie de test');
  });

  it("échec HTTP de GitHub pendant la création : statut error, log log_error, rien n'est persisté", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const handle = makeGitHubFakeDirectoryHandle(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: MANIFEST_FILE_CONTENT,
    });
    const githubError = Object.assign(new Error('Repository creation failed'), { status: 422 });
    octokitMocks.createForAuthenticatedUser.mockRejectedValue(githubError);
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withFakeHandle(seeded, handle), REQUESTED_REPO_NAME),
      ).rejects.toBe(githubError);
    });

    expect(octokitMocks.constructorOptions).toEqual([{ auth: TOKEN }]);
    expect(octokitMocks.createOrUpdateFileContents).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(logSuffixes(result.current.logs)).toEqual(['log_upload_start', 'log_error']);
    expect(result.current.progress).toBe(0);

    const stored = await readSourceContent(seeded.id);
    if (stored.type === 'local') {
      expect(stored.githubManifestUrl).toBeUndefined();
    } else {
      expect.unreachable('source seedée locale');
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. nameAlreadyExists (l. 183-202)                                   */
/* ------------------------------------------------------------------ */

describe('useRepository — nameAlreadyExists', () => {
  it("dépôt déjà présent (succès GitHub) : true, interrogé sur le login de l'utilisateur authentifié", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('depot-existant')).resolves.toBe(true);

    expect(octokitMocks.constructorOptions).toEqual([{ auth: TOKEN }]);
    expect(octokitMocks.getAuthenticated).toHaveBeenCalledTimes(1);
    expect(octokitMocks.reposGet).toHaveBeenCalledWith({ owner: OWNER, repo: 'depot-existant' });
    // Aucun effet sur le statut du hook (lecture pure).
    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
  });

  it('dépôt absent (404 GitHub) : false', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    octokitMocks.reposGet.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('depot-libre')).resolves.toBe(false);
    expect(octokitMocks.reposGet).toHaveBeenCalledTimes(1);
  });

  it("erreur réseau sans status : false (jamais propagée à l'appelant)", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    octokitMocks.reposGet.mockRejectedValue(new TypeError('fetch failed'));
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('n-importe')).resolves.toBe(false);
  });

  it("erreur HTTP non-404 (401 d'authentification) : false — branche 404 indiscernable du repli (écart caractérisé)", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    octokitMocks.reposGet.mockRejectedValue(
      Object.assign(new Error('Bad credentials'), { status: 401 }),
    );
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('n-importe')).resolves.toBe(false);
  });

  it('token absent : false sans construire Octokit', async () => {
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('n-importe')).resolves.toBe(false);
    expect(octokitMocks.constructorOptions).toEqual([]);
    expect(octokitMocks.getAuthenticated).not.toHaveBeenCalled();
    expect(octokitMocks.reposGet).not.toHaveBeenCalled();
  });

  it('token whitespace-only : false sans construire Octokit', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, '  ');
    const { result } = renderHookWithHarness(() => useRepository());

    await expect(result.current.nameAlreadyExists('n-importe')).resolves.toBe(false);
    expect(octokitMocks.constructorOptions).toEqual([]);
  });
});

/* ================================================================== */
/* LOT 12 — parcours local du dossier converti et upload fichier par   */
/* fichier (l. 25-33 et 54-94 du hook)                                 */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/* Fabrique de faux handles IMBRIQUÉS (frontière File System Access)   */
/* ------------------------------------------------------------------ */

/**
 * Objet `File` reconstitué par `getFile()`. Seules `arrayBuffer()` (fichiers, l. 26) et
 * `text()` (manifest, l. 152) sont consommées par le hook ; jsdom 27 n'implémente ni l'une
 * ni l'autre sur Blob (constat lot 11), d'où le faux documenté. `arrayBuffer()` rend une
 * COPIE à chaque lecture : un vrai `File` ne détache jamais son tampon.
 */
interface FakeFileObject {
  kind: 'file';
  name: string;
  type: string;
  size: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface FakeFileHandle {
  kind: 'file';
  name: string;
  getFile: Mock<() => Promise<FakeFileObject>>;
}

interface FakeTreeDirectoryHandle {
  kind: 'directory';
  name: string;
  queryPermission: Mock<(options: { mode: string }) => Promise<PermissionState>>;
  getFileHandle: Mock<(name: string) => Promise<FakeFileHandle>>;
  entries(): AsyncIterableIterator<[string, FakeFileHandle | FakeTreeDirectoryHandle]>;
}

/** Feuille de l'arborescence : un fichier (`file`) ou un sous-dossier (`dir`). */
type FakeEntrySpec =
  | { file: string | Uint8Array; rejectGetFile?: Error }
  | { dir: Record<string, FakeEntrySpec> };

interface FakeTree {
  /** Handle passé à l'API publique du hook (racine du dossier converti). */
  handle: FakeTreeDirectoryHandle;
  /** Handles de fichiers, indexés par chemin RELATIF à la racine (`images/a.png`). */
  files: Record<string, FakeFileHandle>;
  /** Handles de répertoires, indexés par chemin relatif (`''` = racine, `images`). */
  directories: Record<string, FakeTreeDirectoryHandle>;
}

function buildFileHandle(
  fileName: string,
  spec: { file: string | Uint8Array; rejectGetFile?: Error },
): FakeFileHandle {
  const content = typeof spec.file === 'string' ? new TextEncoder().encode(spec.file) : spec.file;
  const object: FakeFileObject = {
    kind: 'file',
    name: fileName,
    type: '',
    size: content.byteLength,
    text: async () => new TextDecoder().decode(content),
    arrayBuffer: async () => content.slice().buffer,
  };
  const getFile = vi.fn(async (): Promise<FakeFileObject> => {
    if (spec.rejectGetFile !== undefined) throw spec.rejectGetFile;
    return object;
  });
  return { kind: 'file', name: fileName, getFile };
}

function buildDirectoryHandle(
  name: string,
  tree: Record<string, FakeEntrySpec>,
  relativeDir: string,
  files: Record<string, FakeFileHandle>,
  directories: Record<string, FakeTreeDirectoryHandle>,
): FakeTreeDirectoryHandle {
  const prefix = relativeDir === '' ? '' : `${relativeDir}/`;
  const children: Array<[string, FakeFileHandle | FakeTreeDirectoryHandle]> = [];
  const directFiles = new Map<string, FakeFileHandle>();
  for (const [entryName, spec] of Object.entries(tree)) {
    const relative = `${prefix}${entryName}`;
    if ('dir' in spec) {
      children.push([
        entryName,
        buildDirectoryHandle(entryName, spec.dir, relative, files, directories),
      ]);
    } else {
      const child = buildFileHandle(entryName, spec);
      files[relative] = child;
      directFiles.set(entryName, child);
      children.push([entryName, child]);
    }
  }
  const handle: FakeTreeDirectoryHandle = {
    kind: 'directory',
    name,
    queryPermission: vi.fn(
      async (_options: { mode: string }): Promise<PermissionState> => 'granted',
    ),
    // `getFileHandle` ne résout que les enfants DIRECTS, comme l'API réelle, et lève la
    // même DOMException `NotFoundError` quand le nom manque : c'est ce contrat que le hook
    // utilise pour relire le manifest (l. 150).
    getFileHandle: vi.fn(async (fileName: string): Promise<FakeFileHandle> => {
      const child = directFiles.get(fileName);
      if (child === undefined) {
        throw new DOMException(`A file with the name ${fileName} doesn't exist.`, 'NotFoundError');
      }
      return child;
    }),
    // for-await consomme entries() deux fois sur le handle RACINE (comptage l. 133, puis
    // parcours l. 64) : l'itérateur doit être neuf à chaque appel. L'ordre rendu est
    // l'ordre d'écriture de l'arborescence ci-dessus — c'est cet ordre que les tests
    // verrouillent pièce par pièce, le parcours réel du navigateur n'étant pas garanti.
    entries() {
      const iterator = children[Symbol.iterator]();
      return {
        async next(): Promise<IteratorResult<[string, FakeFileHandle | FakeTreeDirectoryHandle]>> {
          return iterator.next();
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  };
  directories[relativeDir] = handle;
  return handle;
}

function makeFakeTree(name: string, tree: Record<string, FakeEntrySpec>): FakeTree {
  const files: Record<string, FakeFileHandle> = {};
  const directories: Record<string, FakeTreeDirectoryHandle> = {};
  const handle = buildDirectoryHandle(name, tree, '', files, directories);
  return { handle, files, directories };
}

/** Chemin GitHub attendu pour une entrée du dossier converti (`basePath/name`, l. 65). */
function repoPath(relative: string): string {
  return `${MANIFEST_FOLDER}/${relative}`;
}

// Les contenus sont comparés en TABLEAUX DE NOMBRES et non en `Uint8Array` : constat vitest 4,
// deux tableaux typés de même contenu mais d'origines différentes — celui fabriqué par le
// `TextEncoder` de l'environnement et celui construit dans le contexte du test via
// `Uint8Array.from` — n'y sont pas structurellement égaux ("Compared values have no visual
// difference"). Comparer les octets comme nombres lève ce faux négatif et rend l'écart lisible.
function bytesOf(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function decodeBase64Bytes(base64: string): number[] {
  return Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Contenu décodé du énième commit (en octets), pour assertion octet par octet. */
function committedBytes(index: number): number[] {
  const call = createFileCalls()[index];
  if (call === undefined) throw new Error(`commit #${index} absent`);
  return decodeBase64Bytes(call.content);
}

/**
 * Chemins de TOUTES les tentatives de commit : un appel REJETÉ est quand même enregistré par
 * le mock, donc quand une faute est injectée (`failCreateFileAtCall`), le dernier élément de
 * la liste est l'appel qui a échoué — les précédents sont les fichiers partis.
 */
function attemptedPaths(): string[] {
  return createFileCalls().map((call) => call.path);
}

function withTreeHandle(
  source: SourceWithContent,
  handle: FakeTreeDirectoryHandle,
): SourceWithContent {
  if (source.content.type !== 'local') {
    throw new Error('seed local attendu');
  }
  return {
    ...source,
    content: {
      ...source.content,
      localFile: {
        ...source.content.localFile,
        outputDirectoryHandle: handle as unknown as FileSystemDirectoryHandle,
      },
    },
  };
}

/**
 * Injection de faute au énième `createOrUpdateFileContents` : le rejet intercepte le
 * parcours en cours et SOLDE la progression à l'instant de l'arrêt. C'est ainsi que les
 * paliers intermédiaires (l. 80) sont assertis sans dépendre du moment où React commite
 * chaque `setProgress` — donc sans délai artificiel.
 */
function failCreateFileAtCall(failingCall: number, error: Error): void {
  let calls = 0;
  octokitMocks.createOrUpdateFileContents.mockImplementation(async () => {
    calls += 1;
    if (calls === failingCall) throw error;
    return { data: { commit_sha: `sha-de-commit-${calls}` } };
  });
}

/**
 * Chemins passés à `log_upload_file` (l. 71). Le stub i18n du harnais (aliasé sur
 * `react-i18next` en mode test, cf. vite.config.ts) rend la CLÉ NUE — le nom du fichier
 * n'est donc jamais visible dans `logs` (constat lot 11) — mais son `t` est un `vi.fn`
 * partagé qui enregistre l'objet d'interpolation : c'est à cette frontière documentée, et
 * en filtrant sur la clé, qu'on asserte le CHEMIN réel transmis au journal.
 */
function loggedUploadPaths(): string[] {
  const calls = (i18nTestStub().t as unknown as StubTranslate).mock.calls;
  return calls
    .filter(([key]) => key === 'log_upload_file')
    .map(([, options]) => options?.filename ?? 'log_upload_file sans argument');
}

/* ------------------------------------------------------------------ */
/* 4. Parcours imbriqué : ordre, exhaustivité, chemins (l. 54-94)     */
/* ------------------------------------------------------------------ */

describe('useRepository — uploadToRepository : parcours local imbriqué du dossier converti', () => {
  it('arborescence sur trois niveaux : un commit par fichier, chemin relatif complet, ordre des entries()', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'page-001.txt': { file: 'page 001' },
      images: {
        dir: {
          'page-002.txt': { file: 'page 002' },
          vignettes: { dir: { 'vignette-002.png': { file: 'PNG-002' } } },
        },
      },
      'page-003.txt': { file: 'page 003' },
    });
    const { result, store } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // Exhaustivité et ordre, pièce par pièce : parcours en profondeur INLINE (la récursion
    // est attendue dans la boucle, l. 82-91), le manifest fermé par l'étape dédiée (l. 160).
    expect(attemptedPaths()).toEqual([
      repoPath('page-001.txt'),
      repoPath('images/page-002.txt'),
      repoPath('images/vignettes/vignette-002.png'),
      repoPath('page-003.txt'),
      repoPath(MANIFEST_NAME),
    ]);
    expect(createFileCalls().map((call) => call.message)).toEqual([
      `Add ${repoPath('page-001.txt')}`,
      `Add ${repoPath('images/page-002.txt')}`,
      `Add ${repoPath('images/vignettes/vignette-002.png')}`,
      `Add ${repoPath('page-003.txt')}`,
      `Add ${repoPath(MANIFEST_NAME)}`,
    ]);
    // owner/repo = réponse GitHub sur CHAQUE commit (pas seulement sur le manifest).
    for (const call of createFileCalls()) {
      expect(call.owner).toBe(OWNER);
      expect(call.repo).toBe(RESPONSE_REPO_NAME);
    }
    // Contenus : base64 décodé identique octet par octet au fichier source (fileToBase64).
    expect(committedBytes(0)).toEqual(bytesOf('page 001'));
    expect(committedBytes(1)).toEqual(bytesOf('page 002'));
    expect(committedBytes(2)).toEqual(bytesOf('PNG-002'));
    expect(committedBytes(3)).toEqual(bytesOf('page 003'));

    // Un répertoire est RECURSÉ, jamais envoyé comme fichier : aucun commit ne porte son
    // chemin, et ses enfants sont partis avec le préfixe `images/…`.
    expect(attemptedPaths()).not.toContain(repoPath('images'));
    expect(attemptedPaths()).not.toContain(repoPath('images/vignettes'));

    // Chaque fichier est lu EXACTEMENT une fois (pas de double upload, pas de relecture du
    // manifest par la boucle de parcours) ; `getFileHandle` n'est appelé que sur la racine,
    // pour la relecture du manifest (l. 150) — la récursion utilise les handles rendus par
    // `entries()`, comme l'API réelle.
    for (const handle of Object.values(tree.files)) {
      expect(handle.getFile).toHaveBeenCalledTimes(1);
    }
    expect(tree.handle.getFileHandle).toHaveBeenCalledTimes(1);
    expect(tree.handle.getFileHandle).toHaveBeenCalledWith(MANIFEST_NAME);
    expect(tree.directories['images'].getFileHandle).not.toHaveBeenCalled();
    expect(tree.directories['images/vignettes'].getFileHandle).not.toHaveBeenCalled();

    // Permission : interrogée UNE seule fois, sur le handle racine (l. 109). Les handles
    // enfants héritent de la permission du parent en API réelle — le hook ne la redemande
    // pas, et la récursion n'appelle jamais `queryPermission`.
    expect(tree.handle.queryPermission).toHaveBeenCalledTimes(1);
    expect(tree.directories['images'].queryPermission).not.toHaveBeenCalled();

    expect(logSuffixes(result.current.logs)).toEqual([
      'log_upload_start',
      'log_upload_repo_created',
      'log_upload_file',
      'log_upload_file',
      'log_upload_file',
      'log_upload_file',
      'log_upload_manifest',
      'log_upload_completed',
    ]);
    expect(loggedUploadPaths()).toEqual([
      repoPath('page-001.txt'),
      repoPath('images/page-002.txt'),
      repoPath('images/vignettes/vignette-002.png'),
      repoPath('page-003.txt'),
    ]);
    expect(result.current.status).toBe('done');
    expect(result.current.progress).toBe(100);
    // Le store d'événements est étranger à ce flux : le hook ne dispatche rien, ni en succès
    // ni en échec (son seul canal de report est le rejet, cf. describe « erreurs »).
    expect(store.getState().events.allEvents).toEqual([]);
  });

  it("le manifest déjà publié (skipFileName) sort de la boucle de parcours et n'est commité qu'en dernier, réécrit", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      images: { dir: { 'page-001.png': { file: 'PNG-001' } } },
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // UN SEUL commit pour le manifest, et c'est celui de l'étape dédiée : son contenu décodé
    // est la version RÉÉCRITE en URLs raw.githubusercontent.com. Si la boucle de parcours
    // l'avait renvoyé (skipFileName inopérant), un premier commit porterait le contenu BRUT.
    expect(attemptedPaths()).toEqual([repoPath('images/page-001.png'), repoPath(MANIFEST_NAME)]);
    const manifestCommits = createFileCalls().filter(
      (call) => call.path === repoPath(MANIFEST_NAME),
    );
    expect(manifestCommits).toHaveLength(1);
    expect(decodeBase64Utf8(manifestCommits[0].content)).toBe(MANIFEST_FILE_REWRITTEN);
    expect(decodeBase64Utf8(manifestCommits[0].content)).not.toBe(MANIFEST_FILE_CONTENT);
    expect(tree.files[MANIFEST_NAME].getFile).toHaveBeenCalledTimes(1);
    // Le manifest est exclu du comptage `totalFiles` (l. 134) : il ne pèse donc pas sur les
    // paliers. Reste qu'ici aucun fichier hors manifest n'est assis à la racine, donc
    // totalFiles = 0 : le plateau intermédiaire de l'unique fichier uploadé est `Infinity`
    // (défaut caractérisé dans le describe « progression »), masqué par le 100 terminal.
    expect(loggedUploadPaths()).toEqual([repoPath('images/page-001.png')]);
    expect(result.current.progress).toBe(100);
  });

  it("sous-dossier vide au fond de l'arborescence : recursé sans commit ni log, le frère suivant est bien uploadé", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'page-001.txt': { file: 'page 001' },
      archives: { dir: { 'en-cours': { dir: {} }, 'page-002.txt': { file: 'page 002' } } },
      'page-003.txt': { file: 'page 003' },
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // Le dossier vide ne lève rien, ne loggue rien et n'interrompt pas le frère suivant.
    expect(attemptedPaths()).toEqual([
      repoPath('page-001.txt'),
      repoPath('archives/page-002.txt'),
      repoPath('page-003.txt'),
      repoPath(MANIFEST_NAME),
    ]);
    expect(attemptedPaths()).not.toContain(repoPath('archives'));
    expect(attemptedPaths()).not.toContain(repoPath('archives/en-cours'));
    expect(loggedUploadPaths()).toEqual([
      repoPath('page-001.txt'),
      repoPath('archives/page-002.txt'),
      repoPath('page-003.txt'),
    ]);
    // Comptage (l. 132-135) : 2 fichiers comptés à la racine, 3 uploadés au total — le
    // plateau du troisième dépasse donc 90 (défaut caractérisé dans le describe
    // « progression ») ; la valeur terminale reste 100 (l. 168).
    expect(result.current.progress).toBe(100);
    expect(tree.directories['archives/en-cours'].getFileHandle).not.toHaveBeenCalled();
  });

  it("ÉCART caractérisé — skipFileName comparé par nom simple À TOUTE profondeur : un fichier homonyme d'un sous-dossier est perdu sans log ni erreur", async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'export.pdf': { file: 'PDF' },
      exports: {
        dir: {
          [MANIFEST_NAME]: { file: '{"id":"manifest-secondaire"}' },
          'notes.txt': { file: 'notes' },
        },
      },
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // `name === skipFileName` (l. 67) ne regarde que le NOM, jamais le chemin construit
    // l. 65 : le `exports/manifest.json` d'un sous-dossier tombe dans le même `continue` que
    // le manifest racine — il n'est ni uploadé, ni loggué, ni signalé, alors que rien ne le
    // distinguait d'un fichier ordinaire. Perte silencieuse caractérisée (règle 7) : le
    // manifest de la racine, lui, est bien commité à l'étape dédiée (l. 160).
    expect(attemptedPaths()).toEqual([
      repoPath('export.pdf'),
      repoPath('exports/notes.txt'),
      repoPath(MANIFEST_NAME),
    ]);
    expect(tree.files[`exports/${MANIFEST_NAME}`].getFile).not.toHaveBeenCalled();
    expect(loggedUploadPaths()).toEqual([repoPath('export.pdf'), repoPath('exports/notes.txt')]);
    expect(logSuffixes(result.current.logs)).toEqual([
      'log_upload_start',
      'log_upload_repo_created',
      'log_upload_file',
      'log_upload_file',
      'log_upload_manifest',
      'log_upload_completed',
    ]);
    expect(result.current.status).toBe('done');
    expect(result.current.progress).toBe(100);
  });

  it('contenus binaires, UTF-8 et fichier vide : base64 identique octet par octet (fileToBase64, l. 25-33)', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const allBytes = Uint8Array.from({ length: 256 }, (_value, index) => index);
    const utf8 = 'page 2 — accents ñ€\u{1F600}\n';
    const empty = new Uint8Array(0);
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'bin.dat': { file: allBytes },
      'texte-utf8.txt': { file: utf8 },
      'vide.bin': { file: empty },
    });
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    // Les 256 valeurs d'octet, y compris > 0x7F : `String.fromCharCode` octet par octet puis
    // `btoa` (latin1) rendent le MÊME flux binaire, sans réinterprétation UTF-8.
    expect(committedBytes(0)).toEqual(Array.from(allBytes));
    expect(committedBytes(0)).toHaveLength(256);
    // Un texte UTF-8 voyage en base64 de ses OCTETS : décodé en binaire d'abord, il retrouve
    // exactement la source (la voie `textToBase64` du manifest est couverte au lot 11).
    expect(committedBytes(1)).toEqual(bytesOf(utf8));
    expect(decodeBase64Utf8(createFileCalls()[1].content)).toBe(utf8);
    // Fichier vide : boucle de `fileToBase64` jamais entrée, contenu envoyé = chaîne VIDE.
    // Caractérisé sans légiférer : c'est GitHub qui interprète un contenu vide (la frontière
    // Octokit est mockée ici), et le fichier compte bel et bien dans la progression.
    expect(createFileCalls()[2].content).toBe('');
    expect(committedBytes(2)).toEqual([]);
    expect(attemptedPaths()).toEqual([
      repoPath('bin.dat'),
      repoPath('texte-utf8.txt'),
      repoPath('vide.bin'),
      repoPath(MANIFEST_NAME),
    ]);
    expect(loggedUploadPaths()).toEqual([
      repoPath('bin.dat'),
      repoPath('texte-utf8.txt'),
      repoPath('vide.bin'),
    ]);
    expect(result.current.progress).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Progression par fichier et paliers (l. 80 et 168)                */
/* ------------------------------------------------------------------ */

describe("useRepository — uploadToRepository : progression de l'upload par fichier", () => {
  // Dossier plat : 3 fichiers à la racine hors manifest, puis le manifest. Le comptage
  // (l. 132-135) voit bien les 3 → plateaux 30/60/90 (Math.round(count/total × 90)) avant le
  // saut terminal à 100 (l. 168) : la borne haute de la progression PAR FICHIER est 90, les
  // 10 % restants sont réservés au commit du manifest.
  const FILE_COUNT = 3;
  const FLAT_ATTEMPTS = [
    repoPath('fichier-1.txt'),
    repoPath('fichier-2.txt'),
    repoPath('fichier-3.txt'),
    repoPath(MANIFEST_NAME),
  ];
  const rootOnlyTree = (): Record<string, FakeEntrySpec> => {
    const files: Record<string, FakeEntrySpec> = {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
    };
    for (let index = 1; index <= FILE_COUNT; index++)
      files[`fichier-${index}.txt`] = { file: `F${index}` };
    return files;
  };

  it.each<[string, number, number]>([
    // [libellé du point d'arrêt, progression conservée, n° de commit GitHub qui échoue]
    ['premier fichier', 0, 1],
    ['second fichier', 30, 2],
    ['troisième fichier', 60, 3],
    ['commit du manifest', 90, FILE_COUNT + 1],
  ])(
    '%s : progression figée à %i et statut error quand le commit GitHub n°%i échoue',
    async (_label, expectedProgress, failingCall) => {
      localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
      const seeded = await seedLocalSourceRow();
      const tree = makeFakeTree(MANIFEST_FOLDER, rootOnlyTree());
      const githubError = Object.assign(new Error(`Commit ${failingCall} rejected`), {
        status: 500,
      });
      failCreateFileAtCall(failingCall, githubError);
      const { result, store } = renderHookWithHarness(() => useRepository());

      await act(async () => {
        await expect(
          result.current.uploadToRepository(
            withTreeHandle(seeded, tree.handle),
            REQUESTED_REPO_NAME,
          ),
        ).rejects.toBe(githubError);
      });

      expect(result.current.progress).toBe(expectedProgress);
      expect(result.current.status).toBe('error');
      // Tentatives = préfixe de l'ordre canonique, le dernier élément étant l'appel rejeté
      // (le mock enregistre aussi l'échec) : un arrêt au fichier k laisse k-1 fichiers partis.
      expect(attemptedPaths()).toEqual(FLAT_ATTEMPTS.slice(0, failingCall));
      // Le log du fichier est écrit AVANT son commit (l. 71-72) : le fichier dont le commit
      // échoue a donc déjà sa ligne `log_upload_file`, et le manifest a la sienne
      // (`log_upload_manifest`, l. 149) avant que son commit ne parte.
      const fileLogs = Math.min(failingCall, FILE_COUNT);
      expect(logSuffixes(result.current.logs)).toEqual([
        'log_upload_start',
        'log_upload_repo_created',
        ...Array.from({ length: fileLogs }, () => 'log_upload_file'),
        ...(failingCall > FILE_COUNT ? ['log_upload_manifest'] : []),
        'log_error',
      ]);
      expect(loggedUploadPaths()).toEqual(FLAT_ATTEMPTS.slice(0, fileLogs));
      expect(store.getState().events.allEvents).toEqual([]);

      const stored = await readSourceContent(seeded.id);
      if (stored.type === 'local') {
        expect(stored.githubManifestUrl).toBeUndefined();
      } else {
        expect.unreachable('source seedée locale');
      }
    },
  );

  it('dossier nominal entièrement plat : un palier par fichier puis 100 à la fin', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, rootOnlyTree());
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).resolves.toBeUndefined();
    });

    expect(octokitMocks.createOrUpdateFileContents).toHaveBeenCalledTimes(FILE_COUNT + 1);
    expect(attemptedPaths()).toEqual([
      repoPath('fichier-1.txt'),
      repoPath('fichier-2.txt'),
      repoPath('fichier-3.txt'),
      repoPath(MANIFEST_NAME),
    ]);
    expect(result.current.progress).toBe(100);
    expect(loggedUploadPaths()).toEqual([
      repoPath('fichier-1.txt'),
      repoPath('fichier-2.txt'),
      repoPath('fichier-3.txt'),
    ]);
  });

  it('ÉCART caractérisé — fichiers uniquement dans un sous-dossier : comptage à zéro, progression intermédiaire Infinity', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      images: { dir: { 'page-001.png': { file: 'PNG-001' }, 'page-002.png': { file: 'PNG-002' } } },
    });
    const uploadError = new Error('Commit GitHub refusé');
    failCreateFileAtCall(2, uploadError);
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).rejects.toBe(uploadError);
    });

    // `totalFiles` est compté SANS récursion (l. 132-135) : 0 ici, alors que le parcours,
    // lui, recoure — d'où `1/0` dans `setProgress` (l. 80) et une progression intermédiaire
    // `Infinity` (jamais NaN : `setProgress` n'est appelé qu'après un upload réussi). Un
    // composant qui alimenterait une barre de progression avec cette valeur sortirait du
    // domaine attendu. Caractérisé, pas légitimé (règle 7) ; le `setProgress(100)` terminal
    // (l. 168) masque le plateau sur un parcours mené au bout, comme le test suivant.
    expect(result.current.progress).toBe(Infinity);
    expect(Number.isFinite(result.current.progress)).toBe(false);
    // Un fichier parti, un rejeté (dernier élément enregistré par le mock comme les autres).
    expect(attemptedPaths()).toEqual([
      repoPath('images/page-001.png'),
      repoPath('images/page-002.png'),
    ]);
    expect(octokitMocks.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
  });

  it('ÉCART caractérisé — racine + sous-dossiers : plateaux au-delà de 100 pendant le parcours', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'page-001.txt': { file: 'page 001' },
      images: { dir: { 'page-002.png': { file: 'PNG-002' }, 'page-003.png': { file: 'PNG-003' } } },
    });
    const uploadError = new Error('Commit GitHub refusé');
    failCreateFileAtCall(3, uploadError);
    const { result } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).rejects.toBe(uploadError);
    });

    // Un seul fichier est compté à la racine, trois sont uploadés : le deuxième plateau vaut
    // `Math.round(2/1 × 90)` = 180. La progression n'est donc ni bornée à 90, ni monotone ;
    // elle retombe à 100 à la fin d'un parcours complet. Caractérisé (règle 7), remonté en
    // fin d'en-tête.
    expect(result.current.progress).toBe(180);
    // Trois tentatives enregistrées : deux fichiers partis, le troisième (rejeté) en dernier.
    expect(attemptedPaths()).toEqual([
      repoPath('page-001.txt'),
      repoPath('images/page-002.png'),
      repoPath('images/page-003.png'),
    ]);
    expect(octokitMocks.createOrUpdateFileContents).toHaveBeenCalledTimes(3);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Erreurs du parcours local : rejet, rien d'autre (l. 76-180)     */
/* ------------------------------------------------------------------ */

describe('useRepository — uploadToRepository : erreurs rencontrées pendant le parcours local', () => {
  it('fichier illisible dans un sous-dossier : rejet du MÊME objet, uploads déjà partis conservés, suivants jamais lus', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const readError = Object.assign(new Error('A file that was requested could not be read.'), {
      name: 'NotAllowedError',
    });
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      [MANIFEST_NAME]: { file: MANIFEST_FILE_CONTENT },
      'page-001.txt': { file: 'page 001' },
      images: {
        dir: {
          'page-002.png': { file: 'PNG-002', rejectGetFile: readError },
          'page-003.png': { file: 'PNG-003' },
        },
      },
    });
    const { result, store } = renderHookWithHarness(() => useRepository());

    await act(async () => {
      await expect(
        result.current.uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME),
      ).rejects.toBe(readError);
    });

    // L'upload n'est PAS transactionnel : le fichier déjà commité reste parti, et le
    // fichier FRÈRE suivant n'est jamais lu (la boucle remonte par l'await, l. 69).
    expect(attemptedPaths()).toEqual([repoPath('page-001.txt')]);
    expect(tree.files['images/page-003.png'].getFile).not.toHaveBeenCalled();
    // Lecture et encodage précèdent le log (l. 69-71) : un fichier illisible ne loggue donc
    // rien pour lui-même, seul `log_error` termine le journal.
    expect(loggedUploadPaths()).toEqual([repoPath('page-001.txt')]);
    expect(logSuffixes(result.current.logs)).toEqual([
      'log_upload_start',
      'log_upload_repo_created',
      'log_upload_file',
      'log_error',
    ]);
    expect(result.current.status).toBe('error');
    expect(result.current.progress).toBe(90);
    // Aucun canal store : ni pushError ni pushInfo (le hook ne dispatche rien).
    expect(store.getState().events.allEvents).toEqual([]);
    const stored = await readSourceContent(seeded.id);
    if (stored.type === 'local') {
      expect(stored.githubManifestUrl).toBeUndefined();
    } else {
      expect.unreachable('source seedée locale');
    }
  });

  it('manifest absent du dossier converti : tout le parcours est uploadé, puis NotFoundError remonte', async () => {
    localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, TOKEN);
    const seeded = await seedLocalSourceRow();
    const tree = makeFakeTree(MANIFEST_FOLDER, {
      'page-001.txt': { file: 'page 001' },
      'page-002.txt': { file: 'page 002' },
    });
    const { result } = renderHookWithHarness(() => useRepository());

    let thrown: unknown;
    await act(async () => {
      await result.current
        .uploadToRepository(withTreeHandle(seeded, tree.handle), REQUESTED_REPO_NAME)
        .catch((error: unknown) => {
          thrown = error;
        });
    });

    // Le comptage (l. 134) ne filtre alors rien : les deux fichiers partent, `skipFileName`
    // ne rencontre que des noms absents, et c'est l'étape manifest qui fait échouer l'upload.
    expect(thrown).toBeInstanceOf(DOMException);
    expect((thrown as DOMException).name).toBe('NotFoundError');
    expect(attemptedPaths()).toEqual([repoPath('page-001.txt'), repoPath('page-002.txt')]);
    expect(octokitMocks.createOrUpdateFileContents).toHaveBeenCalledTimes(2);
    expect(tree.handle.getFileHandle).toHaveBeenCalledWith(MANIFEST_NAME);
    expect(logSuffixes(result.current.logs)).toEqual([
      'log_upload_start',
      'log_upload_repo_created',
      'log_upload_file',
      'log_upload_file',
      'log_upload_manifest',
      'log_error',
    ]);
    expect(result.current.status).toBe('error');
    expect(result.current.progress).toBe(90);
    const stored = await readSourceContent(seeded.id);
    if (stored.type === 'local') {
      expect(stored.githubManifestUrl).toBeUndefined();
    } else {
      expect.unreachable('source seedée locale');
    }
  });
});
