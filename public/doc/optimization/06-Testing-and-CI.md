# Tests et CI/CD : Politique et recommandations

## Vue d'ensemble

Cette politique formalise la strategie de tests de CorpuSense, avec deux objectifs :

- securiser les parcours utilisateurs critiques,
- garder une base de tests rapide, maintenable et fiable.

Elle se base sur les bonnes pratiques React (React Testing Library + Vitest) et sur l'etat actuel du projet.

---

## 1. Etat actuel (juillet 2026)

Constat mesure sur la base existante :

- suite Vitest executee : **24 fichiers de test**, **77 tests** ;
- resultat actuel : **18 fichiers OK / 6 en echec**, **64 tests OK / 13 en echec** ;
- outils presents : Vitest, React Testing Library, jest-dom, vitest-webgl-canvas-mock ;
- outils absents a ce jour : configuration Playwright, configuration MSW ;
- CI actuelle : workflow de deploiement GitHub Pages uniquement, sans job de tests/lint sur Pull Request.

Exemples de points de fragilite observes :

- tests de pages qui ne montent pas tous les providers requis (erreurs de contexte) ;
- tests couplant trop fort le contenu de traduction a l'assertion ;
- ecarts entre attentes de tests et comportement metier actuel sur certaines fonctions utilitaires.

---

## 2. Strategie cible (pyramide de tests)

Nous adoptons une pyramide en trois niveaux.

### A. Tests unitaires (majoritaires)

- Cible : fonctions pures, conversions, utilitaires metier.
- Objectif : couverture large des regles metier sans dependance UI.
- Regle : toute nouvelle fonction pure non triviale doit avoir son test associe.

### B. Tests de composants et hooks (niveau intermediaire)

- Cible : composants avec logique d'interaction (formulaires, navigation, etats conditionnels), hooks personnalises.
- Objectif : verifier le comportement vu par l'utilisateur.
- Regle : tester les interactions avec `user-event` et les queries accessibles (`getByRole`, `findByRole`, etc.).

### C. Tests E2E (nombre limite, forte valeur)

- Cible : parcours critiques de bout en bout (chargement manifest, creation collection, annotation, export).
- Outil cible : Playwright.
- Regle : peu de scenarii, mais stables et executes en CI avant publication.

---

## 3. Standards React Testing Library (obligatoires)

### 3.1 Ce qu'on teste

- Le comportement utilisateur, pas les details d'implementation.
- Les roles/accessibilite en priorite (`role`, `name`, `label`).
- Les transitions d'etat asynchrones avec `findBy*` ou `waitFor`.

### 3.2 Ce qu'on evite

- Assertions basees sur la structure interne React/Redux.
- Sur-usage de `data-testid` quand un role accessible existe.
- Tests fragiles dependants de textes i18n bruts non stabilises.

### 3.3 Mocks et isolation

- Centraliser les mocks globaux dans `vitest.setup.ts`.
- Eviter les mocks excessifs : preferer un rendu proche du reel avec providers utilitaires.
- Introduire MSW pour les appels reseau afin d'unifier les tests de composants/hook asynchrones.

### 3.4 Convention de fichiers

- Nommage : `*.test.ts` ou `*.test.tsx`.
- Emplacement : dossier `__tests__` proche du module teste.
- Structure conseillee : Arrange / Act / Assert.

---

## 4. Politique CI (a appliquer)

Pour toute Pull Request vers `develop` :

1. `npm run lint`
2. `npm run test -- --run`
3. `npm run build`

Regles :

- merge refuse si une etape echoue ;
- deploiement `gh-pages` declenche uniquement si la qualite est validee ;
- execution `npm run test:coverage` planifiee (ex: nightly ou PR strategiques) pour suivi.

---

## 5. Roadmap de mise a niveau

### Priorite 1 - Stabiliser l'existant

- Corriger les 13 tests en echec avant d'augmenter la surface de tests.
- Ajouter des helpers de rendu (`renderWithProviders`) complets pour pages dependantes de contextes.
- Revoir les tests de pages sensibles a i18n pour reduire les faux positifs/faux negatifs.

### Priorite 2 - Professionnaliser la CI

- Ajouter un workflow GitHub Actions de validation PR (lint + test + build).
- Garder le workflow de deploiement separe, conditionne au succes de la validation.

### Priorite 3 - Completer la couverture fonctionnelle

- Ajouter des tests hooks sur les flux IndexedDB/Dexie les plus critiques.
- Introduire progressivement Playwright sur 2 a 4 parcours metiers essentiels.

---

## 6. Outils recommandes

- **Vitest** : execution rapide locale/CI ;
- **React Testing Library + user-event** : tests centres utilisateur ;
- **MSW** : simulation propre des APIs externes ;
- **Playwright** : E2E et regression visuelle ciblee ;
- **Coverage Vitest (V8)** : suivi de couverture pour orienter les priorites.

---

## 7. Definition of Done (tests)

Un changement est considere termine si :

- les tests existants restent verts,
- les nouvelles regles metier sont testees,
- les composants modifies sont verifies par interactions utilisateur,
- la CI valide lint + tests + build.
