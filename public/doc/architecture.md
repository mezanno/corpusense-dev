# Corpusense - Architecture & Communication des Données

CorpuSense repose sur une **architecture hybride Local-First**. Les données métier persistantes sont conservées dans IndexedDB et lues de manière réactive par l'IHM via Dexie `useLiveQuery`. Redux et Sagas gèrent l'orchestration des tâches d'arrière-plan et les événements système.

---

## 🔵 Flux 1 : Lecture & Réactivité Locale (Standard UI Local-First)

1. Les composant React s'abonnent aux données via des hooks dédiés (`useLiveCollections`, `useLiveSources`, `useAnnotationsForCanvas`).
2. Les hooks appellent les repositories IndexedDB (`src/data/repositories/indexeddb/`).
3. Dexie `useLiveQuery` observe les tables IndexedDB.
4. Toute modification dans IndexedDB rafraîchit automatiquement et immédiatement l'affichage des composants React abonnés.

---

## 🟠 Flux 2 : Manipulation de Données & Result Pattern (`FunctionResult`)

1. Les composants ou Sagas appellent les méthodes des repositories via les factories (`dbFactory.ts`).
2. Les opérations faillibles retournent des valeurs typées `FunctionResult<T, E>` (`{ ok: true, value: T } | { ok: false, error: E }`).
3. Les erreurs explicites (`EntityNotFoundError`, `DBError`, `StatusChangeError`) sont traitées sans `try/catch` sauvage.

---

## 🟢 Flux 3 : Orchestration Asynchrone & Workers (Redux + Sagas + Realtime)

1. L'IHM déclenche une tâche d'arrière-plan en dispatchant une action Redux (ex: `startWorkerRequest`).
2. Le middleware Redux-Saga intercepte l'action, instancie le plugin approprié (`mistral.ts`, `tesseract.ts`, `surya.ts`, etc.) et fait évoluer le statut du worker (`POSTING`, `POSTED`, `INPROGRESS`).
3. Les résultats produits sont enregistrés directement dans les Repositories IndexedDB via `FunctionResult`.
4. Une notification d'événement/toast est émise sur le store Redux (`eventsReducer`), et la vue réactive se met à jour automatiquement via IndexedDB.
