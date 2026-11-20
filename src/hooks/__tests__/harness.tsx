/**
 * Harnais partagé des tests de la couche hooks (chantier Q11).
 *
 * Principes (cf. docs/roadmap.md, Q11) :
 * - Vrai stack : base Dexie réelle réinitialisée par `createTestDb()` entre les tests,
 *   store Redux réel via `createMockStore()` (sagas non démarrées), `QueryClient` neuf
 *   par test avec `retry: false`.
 * - Les providers de contexte de `components/reducers/*` utilisés par les hooks data
 *   sont montés par le wrapper par défaut. Pour les contextes de page
 *   (`AnnotationContext`, `CanvasSelectionContext`…), passer un `wrapper` additionnel :
 *   il est imbriqué au plus près du hook. Jamais de mock du stockage.
 * - Toute écriture en base passe par les vrais repositories (`seed*` ci-dessous).
 */
import manifestFixture from '@/__tests__/manifest.json';
import { createMockStore } from '@/__tests__/utils';
import { AlertDialogProvider } from '@/components/reducers/AlertDialogContext';
import { CollectionProvider } from '@/components/reducers/CollectionContext';
import { ConnectedUserProvider } from '@/components/reducers/ConnectedUserContext';
import { WorkerProvider } from '@/components/reducers/WorkerContext';
import { Annotation, ElementType } from '@/data/models/annotations/annotation';
import { createAnnotation } from '@/data/models/annotations/annotation.factory';
import { Collection } from '@/data/models/collection/collection';
import { CollectionElement } from '@/data/models/collectionElement';
import { SourceWithContent } from '@/data/models/source/source';
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { Tag } from '@/data/models/tag/tag';
import {
  countLiveQuerySubscribers,
  createTestDb,
} from '@/data/repositories/indexeddb/__tests__/testDb';
import { db } from '@/data/repositories/indexeddb/db';
import {
  getCollectionRepository,
  getSourceRepository,
  getTagRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { ThemeProvider } from '@/hooks/ui/useTheme';
import { ExperimentalProvider } from '@/hooks/useExperimental';
import { RootState } from '@/state/store';
import { FunctionResult } from '@/utils/functionResult';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach } from 'vitest';

// Le manifest fixture sert de base aux sources fabriquées : ses canvas sont réalistes
// et leur ordre est stable, donc les tests peuvent s'y référer par identifiant.
export const FIXTURE_CANVAS_IDS: string[] = manifestFixture.items.map((item) => item.id);

const FIXED_DATE = '2026-01-01T00:00:00.000Z';

let idSequence = 0;
function nextId(prefix: string): string {
  idSequence += 1;
  return `${prefix}-${idSequence}`;
}

/* ------------------------------------------------------------------ */
/* Fabriques lisibles                                                  */
/* ------------------------------------------------------------------ */

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: nextId('tag'),
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    label: 'Étiquette de test',
    ...overrides,
  };
}

export function makeCollection(overrides: Partial<Collection> = {}): Collection {
  const content = overrides.content ?? [];
  return {
    id: nextId('collection'),
    name: 'Collection de test',
    tags: [],
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
    content,
    contentSize: overrides.contentSize ?? content.length,
  };
}

export function makeCollectionElement(
  overrides: Partial<CollectionElement> = {},
): CollectionElement {
  return {
    canvasId: FIXTURE_CANVAS_IDS[0],
    sourceId: nextId('source'),
    manifestId: manifestFixture.id,
    ...overrides,
  };
}

/** Source distante dont le manifeste dérive du fixture `manifest.json` (16 canvas). */
export function makeRemoteSource(
  overrides: Partial<Pick<AddSourceDTO, 'name' | 'pageCount'>> & {
    manifestUrl?: string;
  } = {},
): AddSourceDTO {
  const manifestUrl = overrides.manifestUrl ?? `https://example.org/manifest/${nextId('manifest')}`;
  return {
    type: 'remote',
    name: overrides.name ?? 'Source distante de test',
    pageCount: overrides.pageCount ?? FIXTURE_CANVAS_IDS.length,
    thumbnailBlob: new Blob(['thumbnail de test']),
    manifest: { ...manifestFixture, id: manifestUrl },
  } as AddSourceDTO;
}

export function makeAnnotation(
  overrides: {
    id?: string;
    collectionId?: string;
    canvasId?: string;
    type?: ElementType;
    value?: string;
    order?: number;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  } = {},
): Annotation {
  const bounds = overrides.bounds ?? { minX: 0, minY: 0, maxX: 100, maxY: 50 };
  const annotation = createAnnotation({
    id: overrides.id ?? nextId('annotation'),
    collectionId: overrides.collectionId ?? 'collection-1',
    canvasId: overrides.canvasId ?? FIXTURE_CANVAS_IDS[0],
    type: overrides.type ?? ElementType.TEXT_LINE,
    value: overrides.value ?? 'Valeur de test',
    ...bounds,
  });
  return {
    ...annotation,
    order: overrides.order ?? 1,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

/* ------------------------------------------------------------------ */
/* Écritures en base via les vrais repositories                        */
/* ------------------------------------------------------------------ */

function unwrap<T>(result: FunctionResult<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

export async function seedTags(tags: Tag[] = [makeTag()]): Promise<Tag[]> {
  const tagRepository = getTagRepository();
  unwrap(await tagRepository.importWithDates(tags));
  return tagRepository.getByIds(tags.map((tag) => tag.id));
}

export async function seedCollection(
  collection: Collection = makeCollection(),
): Promise<Collection> {
  unwrap(await getCollectionRepository().add(collection));
  return collection;
}

export async function seedRemoteSource(
  source: AddSourceDTO = makeRemoteSource(),
): Promise<SourceWithContent> {
  return unwrap(await getSourceRepository().add(source));
}

/* ------------------------------------------------------------------ */
/* Environnement par test                                              */
/* ------------------------------------------------------------------ */

/**
 * Vide les transactions IDB encore en course (lot 41 — centralisation du
 * `getById('__flush__')` que les suites des lots 8, 9, 10, 11-12, 13-14, 19 et 39-40
 * dupliquaient dans leur `afterEach`) : `createTestDb()` fait `db.close()` puis
 * `db.delete()` sans attendre les transactions ouvertes (les liveQuery différés au
 * montage des providers ou du hook testé), et le `delete` avorte celles en vol —
 * l'`AbortError` est alors imputée au test SUIVANT, de façon intermittente (course
 * d'ordre consignée au lot 24 sous `--sequence.shuffle`). Un aller-retour sur CHAQUE
 * table (`get('__flush__')` — clé inexistante, qui résout en `undefined`) est en
 * conflit avec toute transaction déjà engagée sur cette table et force sa échéance.
 * Les échecs éventuels sont avalés table par table : la vidange ne doit jamais faire
 * échouer un `beforeEach`, `createTestDb` reprend la main juste après.
 */
export async function flushPendingIdbTransactions(): Promise<void> {
  await Promise.all(
    db.tables.map(async (table) => {
      try {
        await table.get('__flush__');
      } catch {
        // Rien à vidanger ici (table sans transaction, ou base laissée fermée par un
        // scénario de restauration) : `createTestDb` rouvrira immédiatement après.
      }
    }),
  );
}

/** Réinitialise la base Dexie réelle avant chaque test du fichier, vidange comprise. */
export function resetTestDbBeforeEach(): void {
  beforeEach(async () => {
    await flushPendingIdbTransactions();
    await createTestDb();
  });
}

export function createHarnessQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

export interface HarnessOptions {
  preloadedState?: Partial<RootState>;
  /** Provider additionnel (contexte de page…), imbriqué au plus près du hook. */
  wrapper?: (props: { children: ReactNode }) => ReactNode;
}

/**
 * Monte `hook` sur le vrai stack : store Redux neuf (sagas non démarrées),
 * QueryClient neuf, providers de contexte data, sans dépendre d'un contexte
 * conversationnel précédent.
 */
export function renderHookWithHarness<TResult>(hook: () => TResult, options: HarnessOptions = {}) {
  const store = createMockStore(options.preloadedState ?? {});
  const queryClient = createHarnessQueryClient();
  const ExtraWrapper = options.wrapper;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <ThemeProvider>
      {/* Le routeur est AU-DESSUS de tous les providers, comme dans `App.tsx`
          (lot 41) : le contenu des dialogues montés par l'`AlertDialogProvider`
          est dans le routeur, comme en production. */}
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Provider store={store}>
            <ConnectedUserProvider>
              <ExperimentalProvider>
                <AlertDialogProvider>
                  <CollectionProvider>
                    <WorkerProvider>
                      {ExtraWrapper ? <ExtraWrapper>{children}</ExtraWrapper> : children}
                    </WorkerProvider>
                  </CollectionProvider>
                </AlertDialogProvider>
              </ExperimentalProvider>
            </ConnectedUserProvider>
          </Provider>
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>
  );

  const rendered = renderHook(hook, { wrapper });
  return { ...rendered, store, queryClient };
}

/**
 * Nombre d'abonnés à l'événement global `storagemutated` de Dexie — chaque
 * `liveQuery` actif (via `useLiveQuery`) y souscrit exactement un abonné.
 * Sert à vérifier l'absence de fuite d'abonnements au démontage.
 * (Mesure faite dans `testDb.ts`, seule frontière de test autorisée sur Dexie.)
 */
export { countLiveQuerySubscribers };
