# Bilan des Optimisations : Prévues vs Réalisées

Ce document dresse un état des lieux exhaustif des optimisations recommandées lors des différents audits (2025-2026) et de leur statut d'implémentation mis à jour en **Septembre 2026**.

---

## 📊 Tableau de Synthèse

| Catégorie           | Optimisation Recommandée                                          | Statut               | Détails & Commentaires                                                                                               |
| :------------------ | :---------------------------------------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------- |
| **Gestion d'État**  | Migration de Redux vers Dexie (`useLiveQuery`)                    | **Fait (95%)**       | Collections, Annotations, Tags, Modèles et Historique migrés. Excellente amélioration de la réactivité locale-first. |
| **Gestion d'État**  | Simplification globale du store Redux                             | **Fait**             | Le store est allégé et ne gère plus que les événements système et le relai de sagas minimal.                        |
| **Gestion d'État**  | Migration de la file d'attente des Manifestes (fin de Redux-Saga) | **À Faire**          | Reste à migrer pour éliminer totalement Redux-Saga à terme.                                                          |
| **Performance**     | Exclusion de `redux-logger` en Production                         | **Fait**             | `redux-logger` n'est pas configuré dans `src/state/store.ts`. Le store est propre et exempt de logger de dev.       |
| **Performance**     | Vignettes et Gestion des Sources (`thumbnailBase64`, Blobs)       | **Fait**             | Ajout de DTOs réactifs (`SourceWithContentAndThumbnail`), méthode `base64ToBlob` et résolution optimisée.            |
| **Performance**     | Utilitaires Export Excel (Plugin Mistral)                         | **Fait**             | Aplatissement des données complexes et sanitization des noms de fichiers pour l'export Excel.                        |
| **Performance**     | Rendu React : Optimisation de `CanvasCard` (`React.memo`)         | **À Faire**          | Le composant `CanvasCard` n'est pas encore mémoïsé, risquant des re-rendus inutiles dans la galerie.                 |
| **Performance**     | Code Splitting & Manual Chunks (Vite)                             | **Fait**             | Configuration de `manualChunks` dans `vite.config.ts` pour `@annotorious/react` et `@samvera/clover-iiif`.           |
| **UI/UX**           | Feedback visuel et Suivi Temps Réel des Workers                   | **Fait**             | Ajout du suivi de durée en direct, estimation du temps restant dans `CollectionInspector`, et statuts `POSTING`/`POSTED`. |
| **UI/UX**           | Fenêtres flottantes (Floating UI) et Mode Plein Écran             | **Fait / Partiel**   | Intégration de modèles adaptatifs pour les workflows immersifs.                                                      |
| **Architecture**    | Result Pattern pour la gestion des erreurs (`FunctionResult<T, E>`)| **Fait**             | Standardisation dans `src/utils/functionResult.ts`, tous les repositories IndexedDB, hooks de données et sagas.    |
| **Architecture**    | Inversion de Contrôle / IoC Container (Awilix)                    | **Évalué / Non retenu**| Évaluation documentée ([12-Dependency-Injection-Awilix.md](./12-Dependency-Injection-Awilix.md)) : l'approche native React/Dexie + factories est conservée. |
| **Architecture**    | Restructuration "Feature-First" des composants                    | **À Faire**          | Le dossier `src/components` reste plat et volumineux. La proposition du document 07 reste à appliquer.               |
| **Qualité de Code** | Séparation de la logique métier (DAL/Hooks)                       | **Fait**             | Refonte réussie de `useCollectionIO`, `useCollectionImporter` et isolation explicite de la couche repository IndexedDB.|
| **Qualité de Code** | Gestion des formulaires avec React Hook Form + Zod                | **Fait**             | Formulaires d'import/export et de configuration robustes et typés.                                                   |
| **Qualité de Code** | Traçabilité et contexte dans les logs d'erreurs                   | **Fait**             | Contextualisation des erreurs avec types dédiés (`EntityNotFoundError`, `StatusChangeError`, `DBError`).               |
| **Tests & CI**      | Résolution des instabilités de la suite de tests                  | **En Progrès**       | 13/22 fichiers de test valides. 8 échecs identifiés dus à l'absence de mock `ResizeObserver` lors de l'intégration de `@dnd-kit/dom`. |
| **Tests & CI**      | Automatisation des tests E2E avec Playwright                      | **À Faire**          | Toujours planifié pour valider les scénarios utilisateurs complets.                                                  |

---

## 🔍 Analyse Détaillée des Optimisations Restantes et Prochaines Éapes

### 1. Tests & CI : Résolution du Mock `ResizeObserver` pour `@dnd-kit/dom`

- **Fichier cible** : `vitest.setup.ts`
- **Problème** : L'intégration récente de `@dnd-kit/dom` et `@dnd-kit/react` dans la galerie provoque des erreurs `ReferenceError: ResizeObserver is not defined` dans 8 fichiers de tests de composants et pages.
- **Solution recommandée** : Ajouter la définition globale d'un mock pour `ResizeObserver` dans `vitest.setup.ts` :
  ```typescript
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  ```

### 2. Rendu React : Mémoïsation de `CanvasCard`

- **Fichier cible** : `src/components/CanvasCard.tsx`
- **Problème** : Le composant est rendu très fréquemment au sein de la grille `CanvasGallery`. Sans `React.memo`, tout changement cosmétique ou d'état parent provoque le re-rendu complet de toutes les cartes de la grille.
- **Impact** : Saccades lors du défilement ou de la sélection de cartes dans les grands manifestes.
- **Solution recommandée** : Envelopper l'export du composant avec `React.memo` et s'assurer que les props passées (notamment les callbacks) sont stables (via `useCallback`).

### 3. Structure : Restructuration "Feature-First"

- **Dossier cible** : `src/components/`
- **Problème** : Le dossier contient de nombreux composants sans distinction claire de leur domaine de responsabilité.
- **Solution** : Appliquer la proposition du document **[07-Component-Structure-Proposal.md](./07-Component-Structure-Proposal.md)** en découpant par domaine fonctionnel (ex: `features/collections`, `features/manifests`, etc.).
