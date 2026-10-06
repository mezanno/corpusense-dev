# DATA

## 1. The four layers observed

```
Concept (glossary, CONTEXT.md)      "Source", "Canvas", "Collection", "Worker"…
      ↓
Application model (Zod schemas)     z.object().strict() → z.infer type; schema IS the model
      ↓
Technical representation            DTO variants, converters to external formats (IIIF…)
      ↓
Persistence                         ONE Dexie schema file; store keys + index expressions
```

- **Observed.** Entities are declared as Zod schemas with `.strict()` (unknown keys are a bug, not a pass); TypeScript types are *inferred from* schemas, never written by hand. The whole IndexedDB schema — ~20 stores, index expressions including compound indexes (`'[canvasId+collectionId+type]'`) — lives in a single versioned declaration file (`db.ts`, `db.version(30)`). Migrations are Dexie `upgrade` blocks attached to version bumps.
- **Inferred.** Single-file schema + version counter makes migrations reviewable as one diff — the strongest habit to transplant, independent of the storage technology.
- **Observed.** Blobs (images, PDFs) are first-class stored entities separated from metadata (content/id split) so metadata queries stay cheap and exports are self-contained.

## 2. Access pattern

| Concern | Observed mechanism | Abstract role |
|---|---|---|
| Write path | repository class per store, methods return `FunctionResult` | command side |
| Read path | `liveQuery/` repositories returning thunks, consumed by `useLiveQuery` | reactive read side |
| Substitution seam | `getXRepository()` factories; no DI container | testability / future adapter swap |
| Cross-store invariant | aggregate repositories (Sources, Collections, Annotations, Workers) | the only places allowed to span stores |
| Export/portability | `dexie-export-import` dump + per-plugin exporters | data ownership stays with the user |

## 3. Data-related decisions worth keeping

1. **Local store is the source of truth**; remote services are caches/bridges, never authorities. This is what makes the app offline-first and its tests deterministic.
2. **Schema declared once, versioned once.** `[RECOMMENDED]` even generate the schema file from the descriptors (the deferred "Descriptor" design in the glossary — banked, not shipped — points this way; don't build it before a second storage adapter needs it).
3. **Not-found is a typed error value** (`EntityNotFoundError`), never `undefined` leaking upward.
4. **Validation at the boundary**, not at construction everywhere: parse on ingest (importers, external responses); trusted internal writes may skip re-parsing for performance.

## 4. For the new project (technology-agnostic)

- Keep the four layers explicit; name the persistence module after the *role*, not the product (`persistence/`, not `indexeddb/`). `[correction to source naming]`
- One schema declaration file, monotonically increasing version, migration per bump, migration covered by one test per bump. `[RECOMMENDED — source had none]`
- Factory-function DI seam until a second adapter justifies a table/interface abstraction. `[OBSERVED, right-sized]`
- Separate content (blobs) from metadata as the source does.
- Everything durable must be exportable — budget for a dump/import facility from day one.
