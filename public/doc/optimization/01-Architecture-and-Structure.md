# Architecture et Structure du Projet

## Vue d'ensemble

Le projet est une application React moderne utilisant Vite comme bundler. L'architecture suit une structure standard mais robuste, adaptée aux applications de taille moyenne à grande.

## Stack Technologique (Mise à jour Janvier 2026)

- **Framework**: React 19.2
- **Build Tool**: Vite 7.2
- **Langage**: TypeScript 5.9
- **Styling**: Tailwind CSS 4.1
- **State Management**: Dexie `useLiveQuery` (Local-First) + Redux Toolkit (Legacy/Shared) + Zustand (UI state)
- **Data Fetching**: React Query 5 (External APIs)
- **Routing**: React Router 7.1
- **Testing**: Vitest + React Testing Library
- **Error Handling**: Result Pattern (`FunctionResult<T, E>`) dans `src/utils/functionResult.ts` généralisé sur la DAL (IndexedDB Repositories, Hooks, Sagas).
- **Internationalisation**: i18next

## Structure des Dossiers

La structure `src` est organisée comme suit :

- `components/`: Composants UI (en attente de restructuration feature-first).
- `pages/`: Vues principales de l'application.
- `state/`: Gestion d'état (Redux Toolkit allégé, Zustand).
- `hooks/`: Hooks personnalisés, incluant la DAL réactive (`hooks/data`).
- `data/`: Modèles, Schémas Zod et Repositories IndexedDB (`data/repositories/indexeddb`).

## Points d'Amélioration et État d'Avancement

### 1. Consolidation de la Gestion d'État et Gestion des Erreurs (FAIT / EN COURS)

La migration vers une approche **Local-First** via `useLiveQuery` et le **Result Pattern** est stabilisée.

- **Réussite** : Les collections, annotations, tags, modèles et historiques sont gérés via des hooks réactifs Dexie. La gestion des Workers utilise `useJobRealtime` avec des statuts d'exécution fins (`POSTING`, `POSTED`, suivi de durée realtime).
- **Gestion d'Erreurs Typées** : La couche DAL utilise `FunctionResult<T, E>` évitant la perte de typage lors des captures d'exceptions.
- **Injection de dépendances** : Suite à l'évaluation du document **[12-Dependency-Injection-Awilix.md](./12-Dependency-Injection-Awilix.md)**, le conteneur IoC Awilix n'a pas été retenu afin d'éviter la sur-ingénierie dans l'écosystème React/Dexie ; le pattern d'injection par factories et hooks est maintenu.
- **Reste à faire** : Migrer la file d'attente d'import des Manifestes pour éteindre totalement Redux-Saga.

### 2. Organisation des Composants (À FAIRE)

Le dossier `components` reste plat et commence à être difficile à maintenir.

- **Recommandation maintenue** : Adopter la structure détaillée dans le document **[07-Component-Structure-Proposal.md](./07-Component-Structure-Proposal.md)**.

### 3. Gestion des Environnements (TERMINÉ)

La configuration Vite a été stabilisée pour supporter les tests et le multi-thread via les Workers.

