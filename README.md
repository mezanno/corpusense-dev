# CorpuSense

Application web pour explorer des manifests IIIF, constituer des collections, annoter des zones d'intérêt, lancer des traitements (OCR/extraction) et exporter des données structurées.

## Liens utiles

- Dépôt principal : https://github.com/mezanno/corpusense
- Fork de développement : https://github.com/mezanno/corpusense-dev
- Version stable : https://mezanno.xyz/corpusense/
- Version de test : https://mezanno.xyz/corpusense-dev/

## Dépôts et branches

### Dépôt principal (corpusense)

- main : version stable
- develop : branche d'intégration des contributions
- gh-pages : build statique publié automatiquement depuis develop

### Fork de développement (corpusense-dev)

- develop : branche de développement
- gh-pages : build statique publié automatiquement depuis develop

Cette organisation permet de conserver une version stable et une version d'essai accessibles en ligne.

## À quoi sert l'application

CorpuSense permet de :

- Charger un manifest IIIF (URL, identifiant ARK ou JSON collé)
- Parcourir ses canvas
- Créer des collections de canvas
- Annoter des zones
- Lancer des traitements automatiques (OCR, extraction)
- Structurer les résultats avec des modèles de données
- Exporter les résultats pour analyse

Guides fonctionnels détaillés :

- public/doc/howto.md
- public/doc/usecase.md

## Comment l'application est structurée

### Flux global

- Interface React (pages et composants)
- État global Redux Toolkit
- Logique asynchrone Redux-Saga
- Persistance locale via IndexedDB (Dexie)
- Plugins pour import et workers de traitement

### Fichiers clés

- Point d'entrée app : src/main.tsx
- Routing et providers : src/App.tsx
- Navigation applicative : src/hooks/useAppNavigation.tsx
- Store Redux : src/state/store.ts
- Root saga : src/state/sagas/index.ts
- Sagas manifest : src/state/sagas/manifests.ts
- Sagas workers : src/state/sagas/workers.ts
- Internationalisation : src/i18n.ts

### Arborescence métier (repères)

- src/pages : pages principales
- src/components : composants UI et métier
- src/state : reducers, sagas, middlewares
- src/data/models : modèles de données
- src/data/repositories : accès aux données
- public/locales : traductions
- public/doc : documentation utilisateur/architecture

### Documentation technique interne

- Architecture : public/doc/architecture.md
- Interface : public/doc/ui.md
- Modèles de données : public/doc/data-models.md
- Schéma data : public/doc/data.md

## Technologies utilisées

- React
- TypeScript
- Vite
- Redux Toolkit
- Redux-Saga
- Dexie (IndexedDB)
- Tailwind CSS
- Shadcn/UI
- Annotorious + OpenSeaDragon
- Vitest + Testing Library

Références de configuration :

- package.json
- vite.config.ts

## Installation rapide (utilisation locale)

Prérequis :

- Node.js 22+
- npm 10+

Étapes :

1. Cloner le dépôt
2. Installer les dépendances
3. Lancer en local

Commandes :

```bash
npm install
npm run dev
```

L'application est ensuite disponible sur l'URL locale affichée par Vite.

## Contribuer au projet

### Workflow recommandé

1. Créer une branche depuis develop
2. Développer et tester localement
3. Vérifier lint/format
4. Ouvrir une PR vers develop

### Commandes utiles

- Dev : `npm run dev`
- Build : `npm run build`
- Preview build : `npm run preview`
- Tests : `npm run test`
- Tests coverage : `npm run test:coverage`
- Lint : `npm run lint`
- Lint auto-fix : `npm run lint-fix`
- Format check : `npm run format`
- Format fix : `npm run format-fix`

### Bonnes pratiques PR

- Décrire le besoin et le changement
- Ajouter des captures d'écran pour les changements UI
- Garder des commits lisibles
- Vérifier que tests et lint passent avant PR

## Télécharger et déployer simplement

Cette section cible une personne qui ne souhaite pas contribuer au code.

### Option A (la plus simple) : déploiement automatique via GitHub Pages

Le projet est configuré pour déployer automatiquement sur la branche gh-pages lors d'un push sur develop :

- .github/workflows/gh-pages.yml

Étapes :

1. Forker le dépôt
2. Pousser sur develop
3. L'action GitHub construit puis publie automatiquement

### Option B : hébergement statique classique (Netlify, Vercel static, Nginx, Apache)

Étapes :

1. Télécharger le projet
2. Installer les dépendances
3. Générer le build
4. Publier le dossier dist sur l'hébergeur

Commandes :

```bash
npm install
npm run build
```

Le site statique à publier est dans le dossier dist.

### Important : déploiement sous sous-répertoire

Si l'application est servie sous un sous-chemin (exemple : /corpusense-dev/), définir la variable d'environnement VITE_BASE_PATH avant le build.

Exemple :

```bash
VITE_BASE_PATH=/corpusense-dev/
```

Cette valeur est utilisée par le routeur, les assets et le manifest PWA.

## Configuration fonctionnelle

Certaines fonctionnalités nécessitent une clé API (exemple : Mistral pour l'extraction).
La saisie se fait dans la page de configuration de l'application.

Guide : public/doc/howto.md

## Notes

- Les données métier sont stockées localement via IndexedDB (Dexie).
- Un script de build génère des métadonnées de version : scripts/generate-env.js.
- Un proxy local de test existe : proxy.js.
