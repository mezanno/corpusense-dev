# Documentation technique — CorpuSense

_Cette documentation est interne (contributeurs). La documentation utilisateur fournie par l'application vit dans [`public/doc/`](../public/doc/)._

## Où vit quoi

| Emplacement           | Public                                                                     | Contenu                                                                                               |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/`               | Contributeurs                                                              | Spécifications techniques, décisions, sécurité, feuille de route                                      |
| `public/doc/`         | Utilisateurs (diffusé par l'app via `/doc/:page`, liste dans `index.json`) | Manuel d'utilisation (`howto.md`), schéma des données (`data.md`), cas d'usage (`usecase.md`), images |
| `foundation/`         | Créateurs d'un autre projet                                                | Principes et recommandations transposables, pas une spécification de CorpuSense                       |
| `CONTEXT.md` (racine) | Contributeurs                                                              | Vocabulaire du domaine (glossaire unique)                                                             |
| `src/state/states.md` | Contributeurs                                                              | Slices Redux réelles et ce qui vit hors de Redux                                                      |

Règle : rien de technique ou d'interne dans `public/doc/` (c'est un répertoire diffusé publiquement) ; rien d'obsolète dans `docs/` — une note datée consolidée dans un document de référence se supprime, ses décisions survivent dans `DECISIONS.md`.

## Les documents

| Document                                                 | Rôle                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [architecture.md](./architecture.md)                     | **Spécification de référence** : stack, couches, flux de données, modèle de données, routage, configuration, build.                  |
| [statuts.md](./statuts.md)                               | **Loi de statut** : alphabets worker/tâche/`cs_jobs`, invariants, transitions, flows d'interruption et de relaunch.                  |
| [developpement.md](./developpement.md)                   | Guide pratique : démarrage, commandes de vérification, conventions, guides d'extension, pièges.                                      |
| [DECISIONS.md](./DECISIONS.md)                           | Journal des décisions d'architecture (ADR) — le « pourquoi », avec déclencheurs de réouverture.                                      |
| [securite.md](./securite.md)                             | Registre de sécurité vivant (menaces assumées, points ouverts vérifiés, priorités).                                                  |
| [roadmap.md](./roadmap.md)                               | Avancement et travail restant : R1, R6 et R7 livrés ; R2, R4–R5 ouverts ; qualité/outillage Q1–Q9.                                   |
| [audit-tests-2026-11-19.md](./audit-tests-2026-11-19.md) | Audit de la suite de tests (constats TA-\*, matrice de couverture, plan priorisé) — référence tant que ses constats restent ouverts. |
| [foundation/FOUNDATION.md](../foundation/FOUNDATION.md)  | Point d'entrée des fondations destinées à un nouveau projet ; les constats sur CorpuSense sont historiques.                          |

## Historique de la documentation

Jusqu'en octobre 2026, la documentation était éparpillée entre `docs/` (plans de refactorisation, revues datées, rapport HTML) et `public/doc/` (documentation technique mélangée à la doc utilisateur, série d'audits `optimization/`, audit de sécurité). L'unification du 2026-10-08 a consolidé ces documents :

- **Décisions** → [DECISIONS.md](./DECISIONS.md) (série optimization 04/12/13, plans error-boundaries/table-seam, amendements D2/D6/D7).
- **Travail ouvert et constats encore vrais** → [roadmap.md](./roadmap.md) (revues 2026-09-29/30, phases restantes des plans, candidates du rapport d'architecture).
- **Constats de sécurité** → [securite.md](./securite.md) (audit du 2026-08-21 re-vérifié).
- **Spécification** → [architecture.md](./architecture.md) + [developpement.md](./developpement.md) (fusion de `TECHNICAL_DOCUMENTATION.md` et `architecture.md` publics, corrigée contre le code).
- **Obsolète et supprimé** : série `optimization/*`, `inconsistency-scan-2026-09-29.md`, `review-2026-09-30.md`, `architecture-review-2026-09-29.html`, `plan-error-boundaries.md` (entièrement exécuté — ses règles vivent dans D-002), `plan-table-seam.md` et `plan-worker-status-law.md` (consolidés dans D-004/D-005 et R1/R3), `security-audit.md`, `public/doc/ui.md` (obsolète), `public/doc/style.md`, `public/doc/data-models.md` (rendu obsolète par les modèles actuels).
- Le plan Q9 exécuté a été consolidé dans la [roadmap](./roadmap.md) et le [guide développeur](./developpement.md), puis supprimé ; l'historique Git conserve le plan initial.
- En novembre 2026, l'audit de la suite de tests du 2026-11-19 ([audit-tests-2026-11-19.md](./audit-tests-2026-11-19.md)) a été versé à la roadmap en Q12 ; ses constats y restent traçables par identifiants `TA-*` jusqu'à leur clôture.
- En novembre 2026, le plan de tests de la couche hooks (campagne Q11 lots 0–38 puis suivi lots 39–43, clos le 2026-11-19), exécuté intégralement, a été consolidé dans la [roadmap](./roadmap.md) (rapport d'exécution Q11 et suivi post-audit), le [guide développeur](./developpement.md) (§3 — harnais des tests de hooks et frontières de mock) et [DECISIONS.md](./DECISIONS.md) (D-010), puis supprimé ; l'historique Git conserve le plan initial.
- En novembre 2026, le plan de cohérence UI (lots 1-12), intégralement exécuté, a été consolidé dans [DECISIONS.md](./DECISIONS.md) (D-012, D-013), le [guide développeur](./developpement.md) (§4 conventions UI), [architecture.md](./architecture.md) (stance desktop-first), la [roadmap](./roadmap.md) (Q10) et le manuel utilisateur (`public/doc/howto.md`), puis supprimé ; l'historique Git conserve le plan initial.
