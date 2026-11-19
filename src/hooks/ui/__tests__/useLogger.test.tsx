/**
 * Lot 22 — useLogger (cf. docs/roadmap.md, Q11).
 *
 * `useProgressLogger` est le contrat consommé par :
 * - lots 1–2 : `useCollectionImporter` (import ZIP) ;
 * - lot 3 : `useCollectionIO` (export) ;
 * - lots 13–14 : la conversion PDF (mêmes setters, passés depuis les formulaires).
 * Ces suites branchent leurs `setStatus`/`setProgress`/`addLog` sur les setters RÉELS
 * du hook (motif « transpondeur ») : la sémantique verrouillée ici est la leur et
 * n'a plus à être re-testée là-bas.
 *
 * Contrat verrouillé par la présente suite :
 * - état initial : `status` à `'idle'`, `progress` à `0`, `logs` vide — et c'est
 *   l'intégralité de l'API publique du hook ;
 * - statut et progression : dernier appel gagne, même concentrés dans une seule salve
 *   de batching React ; les trois canaux sont indépendants ;
 * - logs : accumulation strictement ordonnée, SANS plafond ni troncature
 *   (`LoggerPanel` affiche la liste complète) ; plusieurs `addLog` dans une même
 *   salve sont tous conservés (l'implémentation passe par un updater fonctionnel —
 *   un updater par valeur écraserait les logs précédents sous batching) ;
 * - `addLog` : type par défaut `'info'`, sévérités explicites conservées telles
 *   quelles, `timestamp` = heure locale (`Date.toLocaleTimeString()`) AU MOMENT de
 *   l'appel, pas au rendu ;
 * - identité stable des trois setters entre les rendus : les transpondeurs des
 *   lots 1–3 les placent dans les dépendances de leurs `useCallback`, une identité
 *   instable recréerait les setters à chaque rendu ;
 * - le contrat tient débranché du hook : un simple objet `ProgressLoggerSetters`
 *   capturé une fois suffit à piloter l'état ;
 * - pas d'API de réinitialisation : une deuxième opération sur la même instance
 *   HÉRITE des logs et du statut précédents ; l'isolement entre opérations repose
 *   sur le remontage du consommateur (caractérisé, cf. dernier test).
 *
 * Frontières : seul `Date` est figé (`vi.useFakeTimers({ toFake: ['Date'] })`) pour
 * rendre le `timestamp` déterministe — aucun délai artificiel, aucune horloge de
 * minuterie faking, aucun mock interne ; le hook est testé par son API publique.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useProgressLogger, { LoggerMessage, ProgressLoggerSetters } from '../useLogger';

const messagesOf = (logs: LoggerMessage[]) => logs.map((log) => log.message);

afterEach(() => {
  vi.useRealTimers();
});

describe('useProgressLogger — état initial et API publique', () => {
  it("démarre idle, progression à 0 et journal vide ; l'API est exactement ces six clés", () => {
    const { result } = renderHook(() => useProgressLogger());
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.logs).toEqual([]);
    expect(Object.keys(result.current).sort()).toEqual([
      'addLog',
      'logs',
      'progress',
      'setProgress',
      'setStatus',
      'status',
    ]);
  });
});

describe('useProgressLogger — statut', () => {
  it('parcourt les quatre statuts, dernier gagne, sans toucher aux autres canaux', () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => result.current.setStatus('processing'));
    expect(result.current.status).toBe('processing');
    act(() => result.current.setStatus('done'));
    expect(result.current.status).toBe('done');
    act(() => result.current.setStatus('error'));
    expect(result.current.status).toBe('error');
    act(() => result.current.setStatus('idle'));
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.logs).toEqual([]);
  });

  it("conserve le dernier statut d'une salve batchée (le cycle d'une opération ne passe pas par des états intermédiaires visibles)", () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => {
      result.current.setStatus('processing');
      result.current.setStatus('done');
    });
    expect(result.current.status).toBe('done');
  });
});

describe('useProgressLogger — progression', () => {
  it('suit les ticks de progression, dernier gagne, sans toucher au statut ni au journal', () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => {
      result.current.setProgress(0);
      result.current.setProgress(33);
      result.current.setProgress(67);
    });
    expect(result.current.progress).toBe(67);
    act(() => result.current.setProgress(100));
    expect(result.current.progress).toBe(100);
    expect(result.current.status).toBe('idle');
    expect(result.current.logs).toEqual([]);
  });
});

describe('useProgressLogger — journal', () => {
  it('accumule les logs dans l’ordre des appels, sans plafond ni troncature', () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => {
      result.current.addLog('première');
      result.current.addLog('deuxième');
      result.current.addLog('troisième');
    });
    expect(messagesOf(result.current.logs)).toEqual(['première', 'deuxième', 'troisième']);

    // Pas d'éviction : 200 entrées de plus dans une seule salve batchée, toutes
    // conservées et dans l'ordre (l'updater fonctionnel de `setLogs` le garantit).
    act(() => {
      for (let i = 0; i < 200; i++) result.current.addLog(`tick ${i}`);
    });
    expect(messagesOf(result.current.logs)).toHaveLength(203);
    expect(messagesOf(result.current.logs).slice(3)).toEqual(
      Array.from({ length: 200 }, (_, i) => `tick ${i}`),
    );
  });

  it("note 'info' par défaut et conserve les sévérités explicites telles quelles", () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => {
      result.current.addLog('sans type');
      result.current.addLog('avertissement', 'warning');
      result.current.addLog('échec', 'error');
      result.current.addLog('réussi', 'success');
    });
    expect(result.current.logs.map((log) => [log.message, log.type])).toEqual([
      ['sans type', 'info'],
      ['avertissement', 'warning'],
      ['échec', 'error'],
      ['réussi', 'success'],
    ]);
  });

  it("horodate chaque log à l'heure locale du moment de l'appel, pas du rendu", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { result } = renderHook(() => useProgressLogger());

    vi.setSystemTime(new Date('2026-01-01T10:00:00'));
    act(() => result.current.addLog('premier'));
    vi.setSystemTime(new Date('2026-01-01T10:00:02'));
    act(() => result.current.addLog('second', 'success'));

    // Comparaison via la même API que le hook : indépendante de la locale de l'environnement.
    expect(result.current.logs.map((log) => log.timestamp)).toEqual([
      new Date('2026-01-01T10:00:00').toLocaleTimeString(),
      new Date('2026-01-01T10:00:02').toLocaleTimeString(),
    ]);
    expect(messagesOf(result.current.logs)).toEqual(['premier', 'second']);
  });
});

describe('useProgressLogger — forme du contrat ProgressLoggerSetters', () => {
  it('garde la même identité de setters entre les rendus (dépendances des transpondeurs)', () => {
    const { result, rerender } = renderHook(() => useProgressLogger());
    const { setStatus, setProgress, addLog } = result.current;

    act(() => {
      setStatus('processing');
      setProgress(50);
      addLog('pendant');
    });
    rerender();

    expect(result.current.setStatus).toBe(setStatus);
    expect(result.current.setProgress).toBe(setProgress);
    expect(result.current.addLog).toBe(addLog);
    expect(result.current.status).toBe('processing');
    expect(result.current.progress).toBe(50);
    expect(messagesOf(result.current.logs)).toEqual(['pendant']);
  });

  it('se pilote débranché du hook : un objet de setters capturé une fois suffit', () => {
    const { result } = renderHook(() => useProgressLogger());
    // C'est exactement ce que reçoivent useCollectionIO / useCollectionImporter.
    const setters: ProgressLoggerSetters = {
      setStatus: result.current.setStatus,
      setProgress: result.current.setProgress,
      addLog: result.current.addLog,
    };

    act(() => {
      setters.setStatus('processing');
      setters.setProgress(0);
      setters.addLog('Exporting collection A (1/2)');
      setters.setProgress(50);
      setters.addLog('Exporting collection B (2/2)');
      setters.setProgress(100);
      setters.setStatus('done');
      setters.addLog('Export completed successfully.', 'success');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.progress).toBe(100);
    expect(result.current.logs.map((log) => [log.message, log.type])).toEqual([
      ['Exporting collection A (1/2)', 'info'],
      ['Exporting collection B (2/2)', 'info'],
      ['Export completed successfully.', 'success'],
    ]);
  });

  it('ne sait pas repartir de zéro : une deuxième opération hérite de l’état, seul le remontage isole', () => {
    const { result } = renderHook(() => useProgressLogger());
    act(() => {
      result.current.setStatus('processing');
      result.current.addLog('première opération');
      result.current.setStatus('done');
    });

    // Caractérisé (documenté, pas inventé) : aucune API n'efface les logs ni ne remet
    // le statut à 'idle'. Les consommateurs qui veulent repartir de zéro (formulaire
    // d'import, convertisseur PDF avec son `reset` propre) le font chez EUX, pas ici.
    act(() => {
      result.current.setStatus('processing');
      result.current.setProgress(0);
    });
    expect(result.current.status).toBe('processing');
    expect(messagesOf(result.current.logs)).toEqual(['première opération']);

    // La voie d'isolement réelle : un nouveau montage repart de l'état initial.
    const fresh = renderHook(() => useProgressLogger());
    expect(fresh.result.current.status).toBe('idle');
    expect(fresh.result.current.progress).toBe(0);
    expect(fresh.result.current.logs).toEqual([]);
    expect(result.current.logs).not.toBe(fresh.result.current.logs);
  });
});
