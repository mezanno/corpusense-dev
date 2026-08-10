# Bilan des Optimisations : Prévues vs Réalisées

Ce document dresse un état des lieux exhaustif des optimisations recommandées lors des différents audits (2025-2026) et de leur statut d'implémentation en **Juin 2026**.

---

## 📊 Tableau de Synthèse

| Catégorie           | Optimisation Recommandée                                          | Statut             | Détails & Commentaires                                                                                               |
| :------------------ | :---------------------------------------------------------------- | :----------------- | :------------------------------------------------------------------------------------------------------------------- |
| **Gestion d'État**  | Migration de Redux vers Dexie (`useLiveQuery`)                    | **Fait (90%)**     | Collections, Annotations, Tags, Modèles et Historique migrés. Excellente amélioration de la réactivité locale-first. |
| **Gestion d'État**  | Simplification globale du store Redux                             | **Fait**           | Le store est allégé et ne gère plus que les événements système et les Workers.                                       |
| **Gestion d'État**  | Migration de la file d'attente des Manifestes (fin de Redux-Saga) | **À Faire**        | Reste à migrer pour éliminer totalement Redux-Saga à terme.                                                          |
| **Performance**     | Exclusion de `redux-logger` en Production                         | **À Faire**        | `redux-logger` est toujours inclus de manière inconditionnelle dans `src/state/store.ts`.                            |
| **Performance**     | Rendu React : Optimisation de `CanvasCard` (`React.memo`)         | **À Faire**        | Le composant `CanvasCard` n'est pas encore mémoïsé, risquant des re-rendus inutiles dans la galerie.                 |
| **Performance**     | Lazy loading et Caching des vignettes dans `CanvasCard`           | **À Faire**        | Le hook `useThumbnail` effectue des requêtes dans un `useEffect` sans système de cache ni lazy loading natif.        |
| **Performance**     | Code Splitting & Manual Chunks (Vite)                             | **Fait**           | Configuration de `manualChunks` dans `vite.config.ts` pour `@annotorious/react` et `@samvera/clover-iiif`.           |
| **UI/UX**           | Feedback visuel lors de traitements longs                         | **Fait**           | Intégration récente (Juin 2026) de la progression en temps réel et d'un `LoggerPanel` auto-scrollant sur l'export.   |
| **UI/UX**           | Fenêtres flottantes (Floating UI) et Mode Plein Écran             | **Fait / Partiel** | Intégration de modèles adaptatifs pour les workflows immersifs.                                                      |
| **Architecture**    | Restructuration "Feature-First" des composants                    | **À Faire**        | Le dossier `src/components` reste plat et volumineux. La proposition du document 07 reste à appliquer.               |
| **Qualité de Code** | Séparation de la logique métier (DAL/Hooks)                       | **Fait**           | Refonte réussie de `useCollectionIO` et `useCollectionImporter` isolant la logique complexe de l'UI.                 |
| **Qualité de Code** | Gestion des formulaires avec React Hook Form + Zod                | **Fait**           | Formulaires d'import/export et de configuration robustes et typés.                                                   |
| **Qualité de Code** | Traçabilité et contexte dans les logs d'erreurs                   | **Fait**           | Contextualisation des erreurs (ex: ajout de `collectionId` dans `generateCanvas`).                                   |
| **Tests & CI**      | Résolution des instabilités de la suite de tests                  | **Fait**           | Résolution des problèmes d'import i18n sous Vitest via l'ajout d'alias spécifiques dans `vite.config.ts`.            |
| **Tests & CI**      | Automatisation des tests E2E avec Playwright                      | **À Faire**        | Toujours planifié pour valider les scénarios utilisateurs complets.                                                  |

---

## 🔍 Analyse Détaillée des Optimisations Restantes (Prioritaires)

### 1. Performance : Exclusion de `redux-logger` en Production

- **Fichier cible** : `src/state/store.ts`
- **Problème** : Le middleware `logger` est importé et concaténé directement au store sans conditionner son exclusion en environnement de production.
- **Impact** : Ralentissement des performances de l'UI en production à cause de l'écriture dans la console, et fuite potentielle de données sensibles.
- **Solution recommandée** :

  ```typescript
  const middlewares = [sagaMiddleware, dateConverterMiddleware];
  if (process.env.NODE_ENV !== 'production') {
    middlewares.push(logger);
  }
  ```

### 2. Rendu React : Mémoïsation de `CanvasCard`

- **Fichier cible** : `src/components/CanvasCard.tsx`
- **Problème** : Le composant est rendu très fréquemment au sein de la grille `CanvasGallery`. Sans `React.memo`, tout changement cosmétique ou d'état parent provoque le re-rendu complet de toutes les cartes de la grille.
- **Impact** : Saccades lors du défilement ou de la sélection de cartes dans les grands manifestes.
- **Solution recommandée** : Envelopper l'export du composant avec `React.memo` et s'assurer que les props passées (notamment les callbacks) sont stables (via `useCallback`).

### 3. Performance : Caching & Lazy Loading des vignettes

- **Fichier cible** : `src/hooks/data/sources/useThumbnail.tsx`
- **Problème** : Le hook résout le chemin de la vignette à chaque montage ou changement de canvas. Il n'y a pas de cache global, ce qui peut multiplier les accès disque/réseau pour les mêmes images.
- **Impact** : Charge réseau et CPU accrue lors de la navigation rapide dans le catalogue.
- **Solution recommandée** : Mettre en place un cache simple en mémoire pour les object URLs générés et exploiter l'attribut natif `loading="lazy"` sur les balises d'images sous-jacentes.

### 4. Structure : Restructuration "Feature-First"

- **Dossier cible** : `src/components/`
- **Problème** : Le dossier contient de nombreux composants sans distinction claire de leur domaine de responsabilité.
- **Solution** : Appliquer la proposition du document **[07-Component-Structure-Proposal.md](./07-Component-Structure-Proposal.md)** en découpant par domaine fonctionnel (ex: `features/collections`, `features/manifests`, etc.).
