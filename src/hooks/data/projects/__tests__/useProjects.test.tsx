/**
 * Lot 25 — useProjects, coquille liveQuery (cf. docs/roadmap.md, Q11, palier 2).
 *
 * Périmètre : le contrat commun de coquille, sur le vrai stack via le harnais du
 * lot 0 — rien sur la réactivité des données, déjà verrouillée par
 * `projects.live.test.ts` et le repository projects (campagne Q2) : aucun scénario
 * de mutations en cours de montage n'est dupliqué ici (les projects sont écrits
 * par le vrai repository AVANT le montage).
 *
 * Spécificité table (plan, lot 25) : aucune. La structure de `useProjects` est
 * celle de `useTags` (gabarit lot 24) : même defaultResult, même deps
 * [liveRepository], même querier `db.<table>.toArray()` — le contrat commun
 * s'applique donc à l'identique, adapté à la surface exportée du hook.
 *
 * Contrat commun, point par point :
 * - état initial : DÉVIATION verrouillée telle qu'implémentée — `useProjects` passe
 *   `[] as Project[]` comme troisième argument (defaultResult) de `useLiveQuery`
 *   (useProjects.tsx:12) : `projects` est un tableau dès le premier rendu
 *   synchronique, jamais `undefined`, et le hook n'expose AUCUN `isLoading`. Le
 *   motif « undefined → loading » testé dans `liveLoading.test.tsx` ne s'applique
 *   pas à ce hook (c'est pourquoi il n'est pas dans la table de cette suite, et
 *   pourquoi on ne l'y ajoute pas : `useProjects` n'a pas d'`isLoading` à
 *   distinguer — précédent lot 24 pour `useTags`). Conséquence caractérisée :
 *   chargement et base vide sont INDISTINGUABLES à la valeur retournée —
 *   `projectNameAlreadyExists` répond « false » pendant le chargement (test
 *   « défaut [] ») ;
 * - bascule après première émission : le [] initial devient la liste émise,
 *   vérifié par `waitFor` sous données présentes (test nominal) ;
 * - remontée d'erreur : le hook n'a aucune surface d'erreur (pas de valeur
 *   d'erreur, pas de try/catch côté lecture) — `useLiveQuery` de dexie-react-hooks
 *   relance l'erreur en phase de rendu : seule une ErrorBoundary consommateur la
 *   rattrape (test « requête en échec »), et le sous-arbre est démonté sans fuite
 *   d'abonnement ;
 * - désabonnement au démontage : par l'observation de la première émission (preuve
 *   comportementale : une émission ne peut venir que d'un abonnement vivant) et par
 *   le compteur `countLiveQuerySubscribers`, mesuré APRÈS émission observée et à
 *   nouveau à l'identique après `unmount` — leçon des lots 16 et 24 : le delta
 *   synchrone pris avant toute émission n'est pas probant, les liveQuery (hook +
 *   providers du harnais) souscrivant de façon différée via `setTimeout(0)` dans
 *   dexie.
 *
 * Frontière pour l'erreur : injection de faute via l'API publique RÉELLE
 * `table.hook('reading')` de Dexie sur `db.projects`, retirée en `finally` — même
 * précédent que les lots 4 et 24 et que `failResultWritesForTask` de `testDb.ts`.
 * Ce n'est pas un mock : le mécanisme d'accès reste réel, la lecture échoue pour
 * de vrai. Pas de `vi.spyOn`, pas de mock de Dexie, pas de délai artificiel. Les
 * écritures en base passent par le vrai `IndexedDBProjectRepository`
 * (`getProjectRepository()`), jamais par `db.projects.put` direct.
 *
 * Call sites (production) : `ProjectSection` (`projects`,
 * components/features/projects/ProjectSection.tsx:21) et `NewProjectForm`
 * (`projectNameAlreadyExists`, components/common/forms/NewProjectForm.tsx:24).
 * `useProjectsIO` (addSourceToProject, createProject…) est un autre hook, lot 26 —
 * rien de son API n'est testé ici.
 *
 * Caractérisations (règle 7 — documentées, pas corrigées, remontées au lot 38) :
 * - `getProjectLiveRepository()` retourne une instance neuve à chaque appel
 *   (dbFactory.ts:118-120) : c'est le `useMemo(..., [])` du hook qui stabilise la
 *   dépendance `useLiveQuery` — un rerender ne re-souscrit pas (vérifié par la
 *   stabilité du compteur sous `rerender`, test nominal) ;
 * - `projectNameAlreadyExists` (useProjects.tsx:15-17) lit le tableau ÉMIS, sans
 *   état d'erreur ni chargement : pendant le chargement (defaultResult `[]`) il
 *   répond « false » même si un projet du même nom existe en base — conséquence
 *   directe de la déviation d'état initial ci-dessus, verrouillée comme
 *   caractérisation dans le test « défaut [] », pas corrigée.
 */
import { Project } from '@/data/models/project/project';
import { db } from '@/data/repositories/indexeddb/db';
import { getProjectRepository } from '@/data/repositories/indexeddb/dbFactory';
import {
  countLiveQuerySubscribers,
  renderHookWithHarness,
  resetTestDbBeforeEach,
} from '@/hooks/__tests__/harness';
import { waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import useProjects from '../useProjects';

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

/**
 * ErrorBoundary de test (frontière d'affichage, pas un mock — même précédent que
 * les lots 4 et 24) : capte en ref l'erreur que `useLiveQuery` jette en phase de
 * rendu et rend un fallback à la place du sous-arbre démonté.
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

describe('useProjects — coquille liveQuery (contrat commun)', () => {
  it('état initial [] dès le premier rendu, bascule à la première émission, zéro fuite au démontage', async () => {
    // Écriture par le vrai repository AVANT le montage : seul ce que le hook doit
    // voir à l'émission ; aucune mutation en cours de test (réactivité = couche data).
    const projects = await seedProjects([makeProject('project-shell-nominal', 'Nominal')]);

    const subscribersBefore = countLiveQuerySubscribers();
    const { result, rerender, unmount } = renderHookWithHarness(() => useProjects());

    // Synchrone, avant toute macrotâche : la liveQuery n'a pas encore tourné et
    // le defaultResult `[]` tient lieu de valeur (DÉVIATION du contrat commun,
    // cf. en-tête — pas d'`undefined`, pas d'`isLoading`).
    expect(result.current.projects).toEqual([]);

    // Bascule après première émission.
    await waitFor(() => expect(result.current.projects).toEqual(projects));

    // Helper de l'API exportée (call site NewProjectForm) branché sur le tableau
    // émis : comparaison insensible à la casse, telle qu'implémentée.
    expect(result.current.projectNameAlreadyExists('nominal')).toBe(true);
    expect(result.current.projectNameAlreadyExists('Autre projet')).toBe(false);

    // Abonnement prouvé deux façons : l'émission observée ci-dessus ne peut venir
    // que d'un abonnement vivant (preuve comportementale, leçon des lots 16 et 24),
    // et le compteur dépasse sa valeur d'avant-montage — mesuré APRÈS émission, le
    // delta est enfin probant.
    expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore);

    // L'instance stable du live repository (useMemo) et les deps
    // `[projectLiveRepository]` font une souscription unique : re-render ne
    // re-souscrit pas (useObservable mémoïde observable ET effet sur les mêmes
    // deps). Mesuré alors que toute la souscription de l'arbre est déjà
    // matérialisée — 3 liveQuery des providers du harnais + celle du hook, toutes
    // déclenchées par leurs setTimeout(0) de montage, macrotâches nécessairement
    // écoulées avant l'émission observée ci-dessus.
    const subscribersMounted = countLiveQuerySubscribers();
    rerender();
    expect(result.current.projects).toEqual(projects);
    expect(countLiveQuerySubscribers()).toBe(subscribersMounted);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });

  it('requête en échec : l erreur éclate le rendu jusqu a la ErrorBoundary, jamais comme valeur au retour', async () => {
    // Une ligne au moins en base : le hook 'reading' de Dexie ne s'exécute que sur
    // les lignes effectivement lues, et c'est la lecture qui doit échouer.
    await seedProjects([makeProject('project-shell-erreur', 'En échec')]);

    const subscribersBefore = countLiveQuerySubscribers();
    const caught: { error?: unknown } = {};
    // Injection de faute via l'API publique RÉELLE des hooks Dexie (cf. en-tête) :
    // toute lecture de db.projects échoue désormais — le querier
    // `db.projects.toArray()` du hook compris — tant que ce filtre est monté.
    const failReading = (): void => {
      throw new Error('projects-lecture-en-echec');
    };
    db.projects.hook('reading', failReading);
    try {
      const { result, unmount } = renderHookWithHarness(() => useProjects(), {
        wrapper: ({ children }) => (
          <CrashBoundary onError={(error) => (caught.error = error)}>{children}</CrashBoundary>
        ),
      });

      await waitFor(() => expect(caught.error).toBeDefined());
      expect(String(caught.error)).toContain('projects-lecture-en-echec');
      // La valeur d'erreur n'apparaît JAMAIS au retour du hook : c'est précisément
      // la caractérisation — le sous-arbre éclaté est démonté par la boundary et le
      // hook ne peut plus rien exposer ; avant le crash, `projects` est resté un
      // tableau (le defaultResult), jamais l'erreur ni un état d'erreur.
      expect(Array.isArray(result.current.projects)).toBe(true);

      // Le démontage du sous-arbre par la boundary relâche l'abonnement du hook :
      // après unmount complet (boundary → providers), plus aucune souscription ne
      // subsiste au-delà de la valeur d'avant-montage.
      unmount();
      expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
    } finally {
      db.projects.hook('reading').unsubscribe(failReading);
    }
  });

  it('défaut [] : base vide et chargement indiscernables, helper sûr dès le premier rendu', async () => {
    const subscribersBefore = countLiveQuerySubscribers();
    const { result, unmount } = renderHookWithHarness(() => useProjects());

    // Premier rendu synchrone : le helper, branché sur `projects.some`, ne voit
    // jamais `undefined` (le defaultResult `[]` tient dès le montage, cf. en-tête)
    // et répond « false » pendant le chargement.
    expect(result.current.projects).toEqual([]);
    expect(result.current.projectNameAlreadyExists('Import n importe quoi')).toBe(false);

    // On laisse la requête de l'arbre (providers + hook) avoir le temps de tourner :
    // même après émission, la valeur reste `[]` et rien — jamais — ne permettra de
    // distinguer le `[]` du defaultResult du `[]` émis d'une base vide
    // (caractérisation, cf. en-tête ; la bascule visible n'est observable qu'avec
    // des données, test nominal ci-dessus).
    await waitFor(() => expect(countLiveQuerySubscribers()).toBeGreaterThan(subscribersBefore));
    expect(result.current.projects).toEqual([]);
    expect(result.current.projectNameAlreadyExists('Import n importe quoi')).toBe(false);

    unmount();
    expect(countLiveQuerySubscribers()).toBe(subscribersBefore);
  });
});
