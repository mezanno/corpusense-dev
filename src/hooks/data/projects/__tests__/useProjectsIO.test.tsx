/**
 * Lot 26 — useProjectsIO, palier 2 (cf. docs/roadmap.md, Q11).
 *
 * DÉVIATION FONDATRICE, à consigner pour l'audit (lot 38) : `useProjectsIO` est
 * listé au palier 2 « coquilles liveQuery » du plan, mais son source
 * (useProjectsIO.tsx, 44 lignes) ne contient AUCUN `useLiveQuery` ni
 * `liveQuery()` — c'est une façade d'E/S sur le vrai `IndexedDBProjectRepository`
 * (getProjectRepository, mémoïsée par `useMemo(..., [])`), dont le seul effet
 * observable hors valeur retournée est un `pushError` dans la slice `events`
 * quand `addSourceToProject` échoue (useProjectsIO.tsx:29-35). Le gabarit des
 * lots 24-25 (observation de la première émission, defaultResult) ne peut donc
 * pas s'appliquer tel quel : il est adapté ci-dessous contrat par contrat, et
 * les points sans objet sont DOCUMENTÉS, pas inventés (règle du plan :
 * « branches sans contrat observable → documentées »).
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION renforcée par rapport aux lots 24-25 — pas même un
 *   defaultResult : le hook ne retourne AUCUNE valeur réactive, seulement trois
 *   fonctions, disponibles dès le premier rendu synchronique. Aucune liveQuery
 *   ne part du hook : preuve mesurée en comparant le compteur
 *   `countLiveQuerySubscribers` à une référence « providers du harnais seuls »
 *   montée dans le même test (leçon des lots 16/24/25 : la souscription des
 *   providers est différée via `setTimeout(0)` dans dexie, la comparaison n'est
 *   faite qu'APRÈS installation de ces abonnements, jamais en delta synchrone) ;
 * - bascule après première émission : SANS OBJET — il n'y a ni abonnement ni
 *   émission côté hook. L'analogue observable est la résolution des promesses
 *   renvoyées par les trois fonctions (round-trip `createProject` →
 *   `getProjectById` par la délégation au repository réel, test nominal) ;
 * - remontée d'erreur : pas de surface de lecture liveQuery à faire échouer (la
 *   table `db.projects` n'est jamais interrogée de façon réactive par ce hook) —
 *   l'erreur remonte par la VALEUR (`FunctionResult.ok === false` pour
 *   `getProjectById`/`addSourceToProject`, test « getProjectById en échec ») et
 *   par le canal `pushError` propre à `addSourceToProject` (spécificité du lot,
 *   cf. frontière ci-dessous). Injection de faute par `table.hook('reading')`
 *   comme aux lots 24-25 : INUTILE ici — aucune lecture liveQuery du hook à
 *   corrompre ; le hook ne lit `db.projects` que via les appels ponctuels du
 *   repository, et ses branches d'échec sont atteignables par la seule API ;
 * - désabonnement au démontage : trivialement satisfait faute d'abonnement —
 *   vérifié malgré tout par le compteur : de retour EXACT à la valeur
 *   d'avant-montage après `unmount` (aucune fuite de la TREE), et stable sous
 *   `rerender` (test nominal).
 *
 * Spécificité du lot (plan, lot 26) : `addSourceToProject` en échec →
 * `pushError`. Frontière d'erreur choisie : ENTITÉ ABSENTE → `NotFoundError`
 * — le repository réel prend lui-même cette branche (addSource → getById → err,
 * projects.ts:26-33), sans aucune injection : c'est le scénario appelant réel de
 * `SourceSection` (SourceSection.tsx:39-43), qui appelle
 * `addSourceToProject(currentProject.id, …)` avec un id capturé AVANT
 * l'ouverture du dialogue `openManifest` — un projet supprimé pendant le
 * dialogue (ou un id périmé) tombe exactement là. L'autre échec de la même
 * ligne `if (!result.ok)` (`SourceAlreadyInProjectError`, doublon de source) est
 * de la sémantique d'ajout de source : verrouillée par `projects.test.ts:37-52`,
 * volontairement PAS re-testée ici (règle « le reste appartient aux suites
 * repositories »).
 *
 * Frontière pour le shell lui-même : aucune — écritures en base par les VRAIS
 * repositories (`getProjectRepository()`, jamais `db.projects.put` direct),
 * pas de mock de Dexie, pas de délai artificiel, pas d'injection (toutes les
 * branches observables sont atteignables par la seule API du hook).
 *
 * Call sites (production, vérifiés) :
 * - `NewProjectForm` (`createProject`, NewProjectForm.tsx:25,57-58 — le résultat
 *   construit en mémoire est passé tel quel à `onResult`) ;
 * - `SourceSection` (`getProjectById`, SourceSection.tsx:14,21 — seule la
 *   branche `ok` est consommée, l'absence de projet est SILENCIEUSE côté
 *   appelant ; `addSourceToProject`, SourceSection.tsx:14,42 — résultat ignoré,
 *   seul le toast `pushError` est observable pour l'utilisateur).
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * - `createProject` (useProjectsIO.tsx:16-27) n'enveloppe PAS `add` d'une
 *   capture d'erreur : `add` lève (ConstraintError sur id collisions) → la
 *   promesse du hook est REJETÉE, sans `pushError` ni valeur d'erreur.
 *   Injoignable par la seule API du hook (id généré par `uuid()`), donc testée
 *   nulle part — branche d'erreur silencieuse consignée, pas inventée ;
 * - `createProject` retourne l'objet construit EN MÉMOIRE, jamais relu en base
 *   (à la différence de `useProjects` qui observe la table émise) — verrouillé
 *   ici par le round-trip : la relecture par le repository réel est profonde-
 *   ment égale à l'objet retourné (aucune divergence de sérialisation Date) ;
 * - asymétrie des canaux d'erreur : `getProjectById` en échec NE dispatche RIEN
 *   (aucun `pushError`, slice `events` vide — test dédié), alors que
 *   `addSourceToProject` dispatche. Le toast d'`addSourceToProject` transporte
 *   le message BRUT de l'erreur (`getErrorMessage(result.error)` en anglais,
 *   non traduit — `pushError(i18n.t(…))` serait la pratique des hooks
 *   comparables, cf. useAnnotationActions) : caractérisé tel qu'implémenté ;
 * - `getProjectRepository()` retourne une instance neuve à chaque appel
 *   (dbFactory.ts:114-116) : c'est le `useMemo(..., [])` du hook qui stabilise
 *   l'instance — sans liveQuery ni deps observables, la non-ré souscription est
 *   vérifiée par la stabilité du compteur sous `rerender` (test nominal).
 */
import { Event, EventType } from '@/data/models/event';
import { Project } from '@/data/models/project/project';
import { getProjectRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { RootState } from '@/state/store';
import { NotFoundError } from '@/utils/NotFoundError';
import { act, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useProjectsIO from '../useProjectsIO';

resetTestDbBeforeEach();

const PROJECT_DATE = '2026-01-01T00:00:00.000Z';

function makeProject(id: string, name: string): Project {
  return {
    id,
    name,
    createdAt: PROJECT_DATE,
    updatedAt: PROJECT_DATE,
    sources: [],
    collections: [],
  };
}

/** Écriture par le VRAI repository projects, puis relecture depuis la base. */
async function seedProjects(projects: Project[]): Promise<Project[]> {
  const projectRepository = getProjectRepository();
  const stored: Project[] = [];
  for (const project of projects) {
    await projectRepository.add(project);
    const result = await projectRepository.getById(project.id);
    if (!result.ok) throw result.error;
    stored.push(result.value);
  }
  return stored;
}

/** Les toasts tels que posés dans la slice `events` du store réel du harnais. */
function toasts(state: RootState): Event[] {
  return state.events.allEvents;
}

describe('useProjectsIO — façade IO du palier 2 (coquille sans liveQuery)', () => {
  it('coquille sans liveQuery : API fonctionnelle dès le premier rendu, zéro souscription propre, zéro fuite au démontage', async () => {
    const subscribersBefore = countLiveQuerySubscribers();

    // Référence « providers du harnais seuls » : le wrapper monte ses propres
    // liveQuery (3 d'après les lots 24-25), dont la souscription est différée
    // via setTimeout(0) dans dexie. On la matérialise puis on la relâche, pour
    // comparer le hook monté à cette référence — le compteur brut avant émission
    // ne serait pas probant (leçon des lots 16/24/25).
    const reference = renderHookWithHarness(() => null);
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    const subscribersProvidersOnly = countLiveQuerySubscribers();
    reference.unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);

    const { result, rerender, unmount } = renderHookWithHarness(() => useProjectsIO());

    // Premier rendu synchronique : le hook n'expose AUCUNE valeur — pas
    // d'`undefined` à attendre, pas de defaultResult, pas d'`isLoading`
    // (DÉVIATION du contrat commun, cf. en-tête) : seulement trois fonctions.
    expect(typeof result.current.createProject).toBe('function');
    expect(typeof result.current.getProjectById).toBe('function');
    expect(typeof result.current.addSourceToProject).toBe('function');

    // Le hook n'ajoute RIEN aux abonnements des providers : dès que la
    // souscription différée de l'arbre est matérialisée, le compteur revient
    // exactement à la référence « providers seuls ». S'il montait une liveQuery
    // (ou si un rerender re-souscrivait), cette égalité ne serait jamais atteinte.
    await waitFor(() => expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly));

    // Analogue de la « bascule après première émission » pour une façade sans
    // valeur réactive : la résolution effective des promesses — écriture par
    // `createProject` et relecture par `getProjectById`, tous deux délégués au
    // VRAI repository (round-trip, pas de `db.projects` direct).
    const created = await act(() => result.current.createProject('Coquille IO'));
    const readBack = await act(() => result.current.getProjectById(created.id));
    expect(readBack.ok).toBe(true);
    if (readBack.ok) {
      // L'objet retourné par `createProject` (construit en mémoire, cf.
      // caractérisation en-tête) est fidèlement ce que la base restitue.
      expect(readBack.value).toEqual(created);
    }

    // Toujours zéro souscription propre, avant comme après un rerender
    // (l'instance mémoïsée du repository rend le hook neutre au re-render).
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);
    rerender();
    expect(countLiveQuerySubscribers()).toBe(subscribersProvidersOnly);

    // Désabonnement : faute d'abonnement propre, le démontage doit simplement
    // ne rien laisser derrière lui — retour EXACT à la valeur d'avant-montage.
    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('getProjectById : délégation stricte — ok:true relu en base, ok:false (NotFoundError) remonté en valeur sans pushError ni throw', async () => {
    const [stored] = await seedProjects([makeProject('project-io-lecture', 'Lecture IO')]);

    const { result, store, unmount } = renderHookWithHarness(() => useProjectsIO());

    const found = await act(() => result.current.getProjectById('project-io-lecture'));
    expect(found).toEqual({ ok: true, value: stored });

    // Absent : l'erreur remonte par la VALEUR uniquement (pas de canal toast
    // pour cette fonction, contrairement à addSourceToProject — asymétrie
    // caractérisée en en-tête ; le call site SourceSection ignore ce résultat).
    const missing = await act(() => result.current.getProjectById('project-io-inexistant'));
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error).toBeInstanceOf(NotFoundError);
      expect(missing.error.message).toBe('Project with id project-io-inexistant not found');
    }
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('addSourceToProject : succès — résultat du repository remonté tel quel, écriture visible à la relecture, aucun toast', async () => {
    await seedProjects([makeProject('project-io-ajout', 'Ajout IO')]);

    const { result, store, unmount } = renderHookWithHarness(() => useProjectsIO());

    // Plumbing seul (la sémantique d'ajout appartient à projects.test.ts) : le
    // FunctionResult ok traverse le hook intact et l'écriture est passée par le
    // repository réel — et surtout, aucun pushError n'est émis sur succès.
    const added = await act(() =>
      result.current.addSourceToProject('project-io-ajout', 'source-1'),
    );
    expect(added).toEqual({ ok: true, value: undefined });

    const project = await act(() => result.current.getProjectById('project-io-ajout'));
    expect(project.ok && project.value.sources).toEqual(['source-1']);
    expect(toasts(store.getState())).toEqual([]);

    unmount();
  });

  it('addSourceToProject en échec (projet absent) : pushError(getErrorMessage(result.error)) dans la slice events, résultat remonté, aucune écriture', async () => {
    // Frontière choisie (cf. en-tête) : entité absente → NotFoundError, prise
    // par le VRAI repository sans injection — scénario appelant réel de
    // SourceSection (id de projet périmé ou supprimé pendant le dialogue
    // d'ajout de source).
    const { result, store, unmount } = renderHookWithHarness(() => useProjectsIO());

    const added = await act(() =>
      result.current.addSourceToProject('project-io-supprime-en-cours-de-dialogue', 'source-1'),
    );

    // Le résultat est remonté tel quel AUSSI (le call site l'ignore, mais le
    // contrat du hook l'expose) et l'erreur porte le message brut vu par
    // getErrorMessage (caractérisation non traduite, cf. en-tête).
    expect(added.ok).toBe(false);
    if (!added.ok) {
      expect(added.error).toBeInstanceOf(NotFoundError);
    }

    // Spec, lot 26 : l'échec dispatche pushError dans la slice `events` du
    // store réel — une seule entrée, de type ERROR, message = getErrorMessage.
    expect(toasts(store.getState())).toEqual([
      {
        message: 'Project with id project-io-supprime-en-cours-de-dialogue not found',
        type: EventType.ERROR,
      },
    ]);

    // Aucune écriture n'a eu lieu (le hook délègue, l'échec est en amont du
    // put) : le projet « absent » l'est toujours, relu par le repository réel.
    const stillMissing = await act(() =>
      result.current.getProjectById('project-io-supprime-en-cours-de-dialogue'),
    );
    expect(stillMissing.ok).toBe(false);

    unmount();
  });
});
