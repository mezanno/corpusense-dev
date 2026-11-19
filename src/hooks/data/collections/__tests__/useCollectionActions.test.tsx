/**
 * Lot 5 — useCollectionActions (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : le comportement propre du hook, une coquille de délégation de 23 lignes
 * (useMemo du repository collection, useCallback de `swapCollectionElements`) testée sur
 * le vrai stack via le harnais du lot 0 :
 * - propagation du RÉSULTAT du repository réel : la forme FunctionResult vérifiée est la
 *   Sienne (`{ ok: true, value: undefined }` / `{ ok: false, error }`, cf.
 *   `collections.ts:242-275` et le contrat `types.ts:90-94`) — le hook fait
 *   `return await` sans aucune transformation, et le relire d'un content via le vrai
 *   repository prouve que la délégation a bien atteint la base (la sémantique du shift
 *   elle-même reste verrouillée par `collections.test.ts`, campagne Q2 — non re-testée) ;
 * - propagation de l'ERREUR du repository réel : collection absente (`collections.ts`
 *   lignes 248-252) et positions hors bornes sur content vide (lignes 254-267) ressortent
 *   en `{ ok: false, error: EntityNotFoundError }` RÉSOLU, jamais en rejet — ici
 *   contrairement aux lots 3-4, ces chemins sont atteignables avec les vrais repositories
 *   (ils ne throw jamais), donc AUCUNE injection de faute n'était nécessaire ;
 * - identité du callback : stable au rerender à `collectionId` inchangé, recréé (et
 *   ciblant la nouvelle collection) quand `collectionId` change ;
 * - abonnements : le hook ne souscrit à rien (aucun liveQuery) — mesuré par delta contre
 *   un rendu témoin `() => null` du même harnais (le delta = celui des providers), puis
 *   égalité stricte au montage, au changement d'id (pas de double abonnement) et au
 *   démontage (pas de fuite), via `countLiveQuerySubscribers`.
 *
 * Frontières : base Dexie réelle, écritures uniquement par le vrai repository
 * (`seedCollection` du harnais et le shift délégué) ; AUCUN `vi.mock` dans ce fichier,
 * aucun délai artificiel, aucune injection de faute.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées) :
 * - le seul canal d'erreur NON couvert est le rejet issu de l'écriture d'infrastructure
 *   (`db.collectionContents.update`, `collections.ts:273`) : inatteignable sans injecter
 *   dans Dexie, ET hors du contrat déclaré (`Promise<FunctionResult<void,
 *   EntityNotFoundError>>`). Le hook, sans try/catch, le propagerait en rejet de promesse —
 *   et son unique appelant `CollectionInspectorGallery.tsx:35` (`void (async () => …)()`,
 *   qui ne teste que `!swapResult.ok`) le laisserait alors en unhandled rejection. Pointé,
 *   hors du périmètre d'un lot de tests ;
 * - l'objet erreur est construit par l'alias déprécié `EntityNotFoundError` du repository
 *   (`data/repositories/EntityNotFoundError.ts`) : il hérite bien de `NotFoundError`, mais
 *   son `name` reste `'EntityNotFoundError'` — verrouillé tel quel ci-dessous, la migration
 *   d'alias appartient à la couche data ;
 * - le repository est mémoïsé au montage (`useMemo(…, [])`) mais `getCollectionRepository()`
 *   n'est qu'une fabrique sans état sur le `db` singleton du module : l'instance mémorisée
 *   reste valable après un `createTestDb()` (même raison d'isolation que le harnais lot 0).
 *
 * Couverture : 100 % des lignes et des branches de `useCollectionActions.tsx` (v8, mesuré
 * à l'issue du lot) — aucune ligne muette à justifier.
 */
import { getCollectionRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeCollection,
  makeCollectionElement,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
} from '@/hooks/__tests__/harness';
import { NotFoundError } from '@/utils/NotFoundError';
import { FunctionResult } from '@/utils/functionResult';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import useCollectionActions from '../useCollectionActions';

resetTestDbBeforeEach();

type Actions = ReturnType<typeof useCollectionActions>;

function renderActions(collectionId: string) {
  return renderHookWithHarness<Actions>(() => useCollectionActions(collectionId));
}

/** Collection au content citant les canvas donnés, écrite par le vrai repository. */
async function seedCollectionWithCanvases(id: string, canvasIds: string[]): Promise<void> {
  await seedCollection(
    makeCollection({
      id,
      name: `Collection ${id}`,
      content: canvasIds.map((canvasId) => makeCollectionElement({ canvasId })),
    }),
  );
}

/** Ordre des canvasId tel que stocké, relu par le VRAI repository. */
async function contentCanvases(id: string): Promise<string[]> {
  const read = await getCollectionRepository().getById(id);
  if (!read.ok) throw read.error;
  return read.value.content.map((element) => element.canvasId);
}

describe('useCollectionActions — délégation au repository collection réel', () => {
  it('succès : renvoie le FunctionResult du repository tel quel et écrit dans la base réelle', async () => {
    const [first, second, third] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('ca-ok', [first, second, third]);
    const { result, unmount } = renderActions('ca-ok');

    let swap: FunctionResult<void, Error> | undefined;
    await act(async () => {
      swap = await result.current.swapCollectionElements(0, 2);
    });

    // La forme verrouillée est celle du repository (le hook ne wrappe rien) : les deux
    // clés présentes, ok vrai, value undefined.
    expect(swap).toEqual({ ok: true, value: undefined });
    expect(Object.keys(swap as object).sort()).toEqual(['ok', 'value']);
    // Preuve de délégation (pas un re-test de sémantique Q2) : le shift a traversé le
    // vrai repository jusqu'à la base.
    expect(await contentCanvases('ca-ok')).toEqual([second, third, first]);

    unmount();
  });

  it('collection absente : le { ok: false, error } du repository ressort résolu, jamais rejeté', async () => {
    const { result, unmount } = renderActions('ca-absente');

    const pending = result.current.swapCollectionElements(0, 1);
    // Le canal d'erreur métier du repository est la valeur retournée, pas la promesse :
    // `.resolves` échoue si le hook rejetait.
    await expect(pending).resolves.toMatchObject({ ok: false });
    const swap = await pending;
    expect(swap.ok).toBe(false);
    if (!swap.ok) {
      expect(swap.error).toBeInstanceOf(NotFoundError);
      // Alias déprécié encore construit par le repository (cf. en-tête).
      expect(swap.error.name).toBe('EntityNotFoundError');
      expect(swap.error.message).toBe('Collection with id ca-absente not found');
    }

    unmount();
  });

  it('content vide : la garde de position du repository est propagée avec le même contrat', async () => {
    await seedCollectionWithCanvases('ca-vide', []);
    const { result, unmount } = renderActions('ca-vide');

    const swap = await result.current.swapCollectionElements(0, 1);
    expect(swap.ok).toBe(false);
    if (!swap.ok) {
      expect(swap.error.name).toBe('EntityNotFoundError');
      expect(swap.error.message).toBe('CollectionElement with id 0 or 1 not found');
    }

    unmount();
  });
});

describe('useCollectionActions — identité du callback et abonnements', () => {
  it('callback stable au rerender à collectionId inchangé ; le hook ne souscrit à rien', async () => {
    await seedCollectionWithCanvases('ca-stable', FIXTURE_CANVAS_IDS.slice(0, 2));

    // Delta témoin : ce que le montage des providers du harnais ajoute seul.
    const before = countLiveQuerySubscribers();
    const control = renderHookWithHarness(() => null);
    const providersDelta = countLiveQuerySubscribers() - before;
    control.unmount();
    expect(countLiveQuerySubscribers()).toBe(before);

    const { result, rerender, unmount } = renderActions('ca-stable');
    // Aucun abonnement propre au hook (aucun liveQuery dans son source).
    expect(countLiveQuerySubscribers()).toBe(before + providersDelta);

    const first = result.current.swapCollectionElements;
    rerender();
    rerender();
    expect(result.current.swapCollectionElements).toBe(first);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(before);
  });

  it('changement de collectionId : callback recréé ciblant la nouvelle collection, abonnement stable, zéro fuite', async () => {
    const [a, b, c] = FIXTURE_CANVAS_IDS;
    await seedCollectionWithCanvases('ca-a', [a, b, c]);
    await seedCollectionWithCanvases('ca-b', [a, b]);

    const currentId = { value: 'ca-a' };
    const { result, rerender, unmount } = renderHookWithHarness<Actions>(() =>
      useCollectionActions(currentId.value),
    );
    const swapOnA = result.current.swapCollectionElements;
    await act(async () => {
      expect(await swapOnA(0, 1)).toEqual({ ok: true, value: undefined });
    });
    const afterA = await contentCanvases('ca-a');
    expect(afterA).toEqual([b, a, c]);
    expect(await contentCanvases('ca-b')).toEqual([a, b]);

    const mounted = countLiveQuerySubscribers();
    currentId.value = 'ca-b';
    rerender();

    // useCallback dépendant de collectionId : nouvelle identité, et nouvelle cible.
    const swapOnB = result.current.swapCollectionElements;
    expect(swapOnB).not.toBe(swapOnA);
    await act(async () => {
      expect(await swapOnB(0, 1)).toEqual({ ok: true, value: undefined });
    });
    expect(await contentCanvases('ca-b')).toEqual([b, a]);
    // La bascule n'a pas touché A : le nouveau callback ne ferme pas sur l'ancien id
    // écrit par erreur, et l'inverse non plus (pas de closure périmée).
    expect(await contentCanvases('ca-a')).toEqual(afterA);

    // Pas de double abonnement après la bascule, et relâchement complet au démontage.
    expect(countLiveQuerySubscribers()).toBe(mounted);
    unmount();
    expect(countLiveQuerySubscribers()).toBeLessThan(mounted);
  });
});
