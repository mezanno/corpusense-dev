/**
 * Lot 4 — useCollectionContent (cf. docs/roadmap.md, Q11).
 *
 * Périmètre : le hook proprement dit, sur le vrai stack via le harnais du lot 0.
 * - ses DEUX abonnements liveQuery (`getById` sans défaut, `getCanvasesByCollectionId`
 *   avec défaut `[]`) : état initial/loading vs première émission, bascule au
 *   changement de `collectionId`, désabonnement au démontage (mesuré par
 *   `countLiveQuerySubscribers`) ;
 * - ses sélections/indexations positionnelles (`getCanvasById`, `hasNext/Previous`,
 *   `getNext/Previous`) sur la liste émise, liste vide et identifiants inconnus
 *   compris, et leur fraîcheur quand la liste évolue (deps `useCallback`) ;
 * - la remontée d'erreur : le hook n'expose AUCUNE valeur ni état d'erreur — une
 *   requête en rejet éclate le rendu via `useObservable` de dexie-react-hooks
 *   (`throw` en phase de rendu, une ErrorBoundary peut seule la rattraper ; test
 *   « requête en échec »). En production, le seul appelant, `QuickCanvasViewer`,
 *   n'en pose pas sur ce chemin.
 * La réactivité des requêtes elles-mêmes (émissions add/update/remove, filtrage des
 * canvas non résolus) est déjà verrouillée par `collections.live.test.ts` (campagne
 * Q2) : aucun scénario de données n'est dupliqué ici.
 *
 * Contractuel vs inerte (call sites) : l'unique appelant de production est
 * `QuickCanvasViewer`, qui ne consomme que `canvases`, indexé par POSITION (la liste
 * émise est exactement l'ordre du content — verrouillé par le test de navigation).
 * `collection` et les cinq helpers sont sans appelant de production
 * (`CollectionInspectorContext` redéfini sa propre navigation) ; ils sont néanmoins
 * l'API exportée du hook, mockée telle quelle par `CollectionInspectorPage.test.tsx`
 * — couverts ici comme contrat, pas comme code mort à supprimer.
 *
 * Frontières : base Dexie réelle, écritures uniquement par les vrais repositories
 * (`seed*` du harnais, `getCollectionRepository().update`) ; AUCUN `vi.mock` dans ce
 * fichier ; aucun délai artificiel. Seule injection de faute : l'API publique RÉELLE
 * `table.hook('reading')` de Dexie sur `db.collections`, retirée en `finally` — même
 * précédent que `failResultWritesForTask` de `testDb.ts` (frontière Dexie établie
 * couche data) ; ce n'est pas un mock : le mécanisme d'accès reste réel, la lecture
 * échoue pour de vrai.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées) :
 * - asymétrie des états initiaux : `canvases` est un tableau dès le premier rendu
 *   (défaut `[]` de `useLiveQuery`, ligne 29 du source — l'accès positionnel de
 *   `QuickCanvasViewer` ne le doit qu'à ce défaut), alors que `collection` vaut
 *   `undefined` au montage ET quand la collection n'existe pas : chargement et
 *   absent sont INDISTINGUABLES à la valeur retournée (commentaire « transitoire,
 *   pas une erreur » de `collections.live.getById` remonté tel quel au hook) ;
 * - changement de `collectionId` : `useObservable` conserve la valeur précédente
 *   jusqu'à la première émission de la nouvelle requête (pas de flash `undefined`) —
 *   verrouillé par l'assertion synchrone du test de bascule.
 *
 * Couverture : 100 % des lignes et des branches de `useCollectionContent.tsx` (v8,
 * mesuré à l'issue du lot) — aucune ligne muette à justifier. Note de style sur la
 * ligne 34 du source : le chaînon optionnel `canvases?.find` ne peut pas prendre le
 * chemin nullish (le défaut `[]` de `useLiveQuery` garantit un tableau) — code
 * défensif, pas un trou de test.
 */
import { CollectionElement } from '@/data/models/collectionElement';
import { db } from '@/data/repositories/indexeddb/db';
import { getCollectionRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  FIXTURE_CANVAS_IDS,
  makeCollection,
  makeCollectionElement,
  makeRemoteSource,
  renderHookWithHarness,
  resetTestDbBeforeEach,
  seedCollection,
  seedRemoteSource,
} from '@/hooks/__tests__/harness';
import { waitFor } from '@testing-library/react';
import { act, Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { CanvasWithSourceId, useCollectionContent } from '../useCollectionContent';

resetTestDbBeforeEach();

type Content = ReturnType<typeof useCollectionContent>;

function renderContent(collectionId: string) {
  return renderHookWithHarness<Content>(() => useCollectionContent(collectionId));
}

/** Collection dont le content cite les canvas donnés, tous sur UNE source réelle. */
async function seedCollectionWithCanvases(id: string, name: string, canvasIds: string[]) {
  const source = await seedRemoteSource(makeRemoteSource({ name: `Source ${id}` }));
  await seedCollection(
    makeCollection({
      id,
      name,
      content: canvasIds.map((canvasId) =>
        makeCollectionElement({ canvasId, sourceId: source.id, manifestId: undefined }),
      ),
    }),
  );
  return source;
}

/** Réécriture du content par le VRAI repository (mutation observée par la liveQuery). */
async function updateContent(
  id: string,
  name: string,
  canvasIds: string[],
  sourceId: string,
): Promise<void> {
  const content: CollectionElement[] = canvasIds.map((canvasId) =>
    makeCollectionElement({ canvasId, sourceId, manifestId: undefined }),
  );
  await act(async () => {
    await getCollectionRepository().update(id, { name, tags: [], content });
  });
}

const canvasIds = (canvases: CanvasWithSourceId[]): string[] =>
  canvases.map((element) => element.canvas.id);

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock) : capte en ref
 * l'erreur que `useLiveQuery` jette en phase de rendu, et rend un fallback à la
 * place du sous-arbre démonté.
 */
class CrashBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return <div>rendu éclaté</div>;
    }
    return this.props.children;
  }
}

describe('useCollectionContent — abonnements et états', () => {
  it('état initial puis première émission : collection undefined→chargée, canvases [] dès le montage, zéro fuite au démontage', async () => {
    const source = await seedCollectionWithCanvases('cc-nominal', 'Nominal cc', [
      FIXTURE_CANVAS_IDS[0],
      FIXTURE_CANVAS_IDS[1],
    ]);

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderContent('cc-nominal');

    // Synchrone, avant toute macrotâche : liveQuery exécute sa requête via
    // setTimeout(0), AUCUNE n'a encore résolu. C'est là que l'asymétrie des défauts
    // est observable (cf. en-tête).
    expect(result.current.collection).toBeUndefined();
    expect(result.current.canvases).toEqual([]);

    await waitFor(() => {
      expect(result.current.collection?.name).toBe('Nominal cc');
      expect(canvasIds(result.current.canvases)).toEqual([
        FIXTURE_CANVAS_IDS[0],
        FIXTURE_CANVAS_IDS[1],
      ]);
    });
    // Le couple source est porté par chaque entrée émise ; getById fusionne le
    // content dans la collection (contrat data, remonté à la valeur du hook).
    expect(result.current.canvases.map((element) => element.sourceId)).toEqual([
      source.id,
      source.id,
    ]);
    expect(result.current.collection?.content).toHaveLength(2);

    // Les deux liveQuery du hook sont abonnés, en plus de ceux des providers du
    // harnais.
    expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore);
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('collection absente : undefined transitoire sans erreur, abonnement resté vivant jusqu à l écriture du repository', async () => {
    const { result, unmount } = renderContent('cc-introuvable');

    // Rien en base sous cet id : chargement et absent se valent à la valeur
    // retournée (caractérisation, cf. en-tête) — mais surtout AUCUNE erreur.
    expect(result.current.collection).toBeUndefined();
    expect(result.current.canvases).toEqual([]);
    expect(result.current.getCanvasById(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.hasNextCanvas(FIXTURE_CANVAS_IDS[0])).toBe(false);
    expect(result.current.hasPreviousCanvas(FIXTURE_CANVAS_IDS[0])).toBe(false);
    expect(result.current.getNextCanvas(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.getPreviousCanvas(FIXTURE_CANVAS_IDS[0])).toBeNull();

    // Écriture par le vrai repository pendant que le hook est monté : l'absence
    // était transitoire, l'abonnement est resté vivant pour la capter.
    await seedCollectionWithCanvases('cc-introuvable', 'Apparue cc', [FIXTURE_CANVAS_IDS[0]]);
    await waitFor(() => {
      expect(result.current.collection?.name).toBe('Apparue cc');
      expect(canvasIds(result.current.canvases)).toEqual([FIXTURE_CANVAS_IDS[0]]);
    });

    unmount();
  });

  it('requête en échec : l erreur éclate le rendu jusqu à la ErrorBoundary, jamais comme valeur au retour', async () => {
    await seedCollectionWithCanvases('cc-erreur', 'Erreur cc', [FIXTURE_CANVAS_IDS[0]]);

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection de faute via l'API publique RÉELLE des hooks Dexie (cf. en-tête) :
    // toute lecture de db.collections échoue désormais — la query getById du hook
    // comprise — tant que ce filtre est monté.
    const failReading = (): void => {
      throw new Error('cc-lecture-en-échec');
    };
    db.collections.hook('reading', failReading);
    try {
      const rendered = renderHookWithHarness<Content>(() => useCollectionContent('cc-erreur'), {
        wrapper: ({ children }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      // Pas d'attente d'émissions intermédiaires : la requête getById peut rejeter
      // AVANT que la requête de canvases ait résolu (executions liveQuery parallèles),
      // et le démontage par la boundary fige alors `result.current` sur ses derniers
      // rendus commités — l'erreur n'y est JAMAIS, c'est précisément la
      // caractérisation (aucune valeur d'erreur au retour du hook).
      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('cc-lecture-en-échec');

      // Le démontage du sous-arbre par la boundary relâche les abonnements du hook :
      // après unmount complet (boundary → providers), plus AUCUNE souscription ne
      // subsiste — un abonnement survivant au crash ferait échouer cette égalité.
      rendered.unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.collections.hook('reading').unsubscribe(failReading);
    }
  });

  it('changement de collectionId : valeur précédente conservée sans flash, bascule complète, abonnement stable', async () => {
    await seedCollectionWithCanvases('cc-a', 'A cc', [FIXTURE_CANVAS_IDS[0]]);
    await seedCollectionWithCanvases('cc-b', 'B cc', [
      FIXTURE_CANVAS_IDS[1],
      FIXTURE_CANVAS_IDS[2],
    ]);

    const currentId = { value: 'cc-a' };
    const { result, rerender, unmount } = renderHookWithHarness<Content>(() =>
      useCollectionContent(currentId.value),
    );
    await waitFor(() => {
      expect(result.current.collection?.name).toBe('A cc');
      expect(canvasIds(result.current.canvases)).toEqual([FIXTURE_CANVAS_IDS[0]]);
    });
    const subscribersMounted = countLiveQuerySubscribers();

    currentId.value = 'cc-b';
    rerender();

    // Caractérisation (cf. en-tête) : le temps de la nouvelle première émission,
    // les valeurs de A restent en place — pas d'`undefined` intermédiaire.
    expect(result.current.collection?.name).toBe('A cc');
    expect(canvasIds(result.current.canvases)).toEqual([FIXTURE_CANVAS_IDS[0]]);

    await waitFor(() => {
      expect(result.current.collection?.name).toBe('B cc');
      expect(canvasIds(result.current.canvases)).toEqual([
        FIXTURE_CANVAS_IDS[1],
        FIXTURE_CANVAS_IDS[2],
      ]);
    });
    // Les sélections suivent la bascule (deps des useMemo/useCallback branchées sur
    // collectionId) : le canvas de A est devenu inconnu, ceux de B résolvent.
    expect(result.current.getCanvasById(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.getNextCanvas(FIXTURE_CANVAS_IDS[1])?.canvas.id).toBe(
      FIXTURE_CANVAS_IDS[2],
    );

    // Anciennes souscriptions relâchées et nouvelles prises dans le même commit.
    expect(countLiveQuerySubscribers()).toBe(subscribersMounted);
    unmount();
    expect(countLiveQuerySubscribers()).toBeLessThan(subscribersMounted);
  });
});

describe('useCollectionContent — sélections et navigation sur la liste émise', () => {
  it('getCanvasById : renvoie l entrée émise (canvas + sourceId), null pour un id inconnu', async () => {
    const source = await seedCollectionWithCanvases('cc-select', 'Sélection cc', [
      FIXTURE_CANVAS_IDS[0],
      FIXTURE_CANVAS_IDS[1],
      FIXTURE_CANVAS_IDS[2],
    ]);
    const { result, unmount } = renderContent('cc-select');
    await waitFor(() => expect(result.current.canvases).toHaveLength(3));

    const found = result.current.getCanvasById(FIXTURE_CANVAS_IDS[1]);
    expect(found?.canvas.id).toBe(FIXTURE_CANVAS_IDS[1]);
    expect(found?.sourceId).toBe(source.id);
    // La recherche porte sur l'entrée émise elle-même (aucune transformation) et
    // s'arrête au premier match d'identifiant.
    expect(found).toBe(result.current.canvases[1]);
    expect(result.current.getCanvasById('canvas-inconnu')).toBeNull();

    unmount();
  });

  it('navigation suivante : vrais du premier à l avant-dernier, faux/null au bout et sur id inconnu', async () => {
    await seedCollectionWithCanvases('cc-next', 'Suivant cc', [
      FIXTURE_CANVAS_IDS[0],
      FIXTURE_CANVAS_IDS[1],
      FIXTURE_CANVAS_IDS[2],
    ]);
    const { result, unmount } = renderContent('cc-next');
    await waitFor(() => expect(result.current.canvases).toHaveLength(3));

    const [first, second, third] = canvasIds(result.current.canvases);
    expect(result.current.hasNextCanvas(first)).toBe(true);
    expect(result.current.hasNextCanvas(second)).toBe(true);
    expect(result.current.hasNextCanvas(third)).toBe(false);
    expect(result.current.hasNextCanvas('inconnu')).toBe(false);

    expect(result.current.getNextCanvas(first)?.canvas.id).toBe(second);
    expect(result.current.getNextCanvas(second)?.canvas.id).toBe(third);
    expect(result.current.getNextCanvas(third)).toBeNull();
    expect(result.current.getNextCanvas('inconnu')).toBeNull();

    unmount();
  });

  it('navigation précédente : faux au premier, vrais ensuite, null au bout et sur id inconnu', async () => {
    await seedCollectionWithCanvases('cc-prev', 'Précédent cc', [
      FIXTURE_CANVAS_IDS[0],
      FIXTURE_CANVAS_IDS[1],
      FIXTURE_CANVAS_IDS[2],
    ]);
    const { result, unmount } = renderContent('cc-prev');
    await waitFor(() => expect(result.current.canvases).toHaveLength(3));

    const [first, second, third] = canvasIds(result.current.canvases);
    expect(result.current.hasPreviousCanvas(first)).toBe(false);
    expect(result.current.hasPreviousCanvas(second)).toBe(true);
    expect(result.current.hasPreviousCanvas(third)).toBe(true);
    expect(result.current.hasPreviousCanvas('inconnu')).toBe(false);

    expect(result.current.getPreviousCanvas(first)).toBeNull();
    expect(result.current.getPreviousCanvas(second)?.canvas.id).toBe(first);
    expect(result.current.getPreviousCanvas(third)?.canvas.id).toBe(second);
    expect(result.current.getPreviousCanvas('inconnu')).toBeNull();

    unmount();
  });

  it('collection vide après émission : canvases [] stable et helpers sans prise', async () => {
    await seedCollection(makeCollection({ id: 'cc-vide', name: 'Vide cc' }));
    const { result, unmount } = renderContent('cc-vide');
    await waitFor(() => expect(result.current.collection?.name).toBe('Vide cc'));

    // Le défaut `[]` tient jusque dans l'émission : la liste ne devient jamais
    // undefined, les helpers répondent sur un findIndex à -1.
    expect(result.current.canvases).toEqual([]);
    expect(result.current.getCanvasById(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.hasNextCanvas(FIXTURE_CANVAS_IDS[0])).toBe(false);
    expect(result.current.hasPreviousCanvas(FIXTURE_CANVAS_IDS[0])).toBe(false);
    expect(result.current.getNextCanvas(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.getPreviousCanvas(FIXTURE_CANVAS_IDS[0])).toBeNull();

    unmount();
  });

  it('les callbacks suivent les évolutions de la liste (deps useCallback, pas de closure périmée)', async () => {
    const source = await seedCollectionWithCanvases('cc-live', 'Live cc', [FIXTURE_CANVAS_IDS[0]]);
    const { result, unmount } = renderContent('cc-live');
    await waitFor(() => expect(result.current.canvases).toHaveLength(1));

    // Un seul canvas : premier = dernier.
    expect(result.current.hasNextCanvas(FIXTURE_CANVAS_IDS[0])).toBe(false);
    expect(result.current.getNextCanvas(FIXTURE_CANVAS_IDS[0])).toBeNull();

    await updateContent(
      'cc-live',
      'Live cc',
      [FIXTURE_CANVAS_IDS[0], FIXTURE_CANVAS_IDS[1]],
      source.id,
    );
    await waitFor(() => expect(result.current.canvases).toHaveLength(2));
    expect(result.current.hasNextCanvas(FIXTURE_CANVAS_IDS[0])).toBe(true);
    expect(result.current.getNextCanvas(FIXTURE_CANVAS_IDS[0])?.canvas.id).toBe(
      FIXTURE_CANVAS_IDS[1],
    );

    // Retour au simple, mais sur l AUTRE canvas : l'ancien devient inconnu, la
    // navigation est recalculée sur la nouvelle liste.
    await updateContent('cc-live', 'Live cc', [FIXTURE_CANVAS_IDS[1]], source.id);
    await waitFor(() => {
      expect(canvasIds(result.current.canvases)).toEqual([FIXTURE_CANVAS_IDS[1]]);
      expect(result.current.collection?.name).toBe('Live cc');
    });
    expect(result.current.getCanvasById(FIXTURE_CANVAS_IDS[0])).toBeNull();
    expect(result.current.hasPreviousCanvas(FIXTURE_CANVAS_IDS[1])).toBe(false);
    expect(result.current.hasNextCanvas(FIXTURE_CANVAS_IDS[1])).toBe(false);

    unmount();
  });
});
