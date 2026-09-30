# Corpusense

Local-first research corpus manager: collections of canvases (images/documents) annotated and processed by background worker plugins.

## Language

### Domain

**Worker**:
A background processing unit that runs a queue of Tasks over a Scope (OCR, layout extraction, LLM extraction, …).
_Avoid_: job runner, process, engine

**Task**:
One entry of a Worker's queue, targeting a single canvas, with a status in the task status law (WAITING, INPROGRESS, POSTING, POSTED, COMPLETED, ERROR, …).
_Avoid_: job (see Job), unit

**Job**:
An externally posted computation tracked outside the app (Supabase `cs_jobs`), bridged back into a Task via the POSTING/POSTED statuses.
_Avoid_: task, remote task

**Plugin**:
A named worker module that knows how to run a Task and how to export its Results. Registered once in the plugin registry.
_Avoid_: provider (reserved for the data-access seam), connector, worker type

**Result**:
The artifact a completed Task produces, persisted per (worker, task) and exportable in several formats.

**Scope**:
What a Worker acts upon — a project, a collection, or a canvas — identified by a derived scope key.
_Avoid_: target, context

**Collection**:
A curated set of canvases with shared annotations, tags, and processing history.

**Canvas**:
A single image or document viewable inside a Collection, backed by a Source.

**Source**:
The stored bytes behind a Canvas (content blob plus optional thumbnail blob), portable across exports.
_Avoid_: file, asset

**Modifier Chain**:
An ordered sequence of transformations applied to a set of Annotations, editable visually and applied atomically.

### Data access

> **Status: banked, not shipped.** The four terms below describe the deferred Table-seam design
> (`docs/plan-table-seam.md`, Contingency appendix). Today's code is Dexie repositories behind
> `dbFactory.ts` factories. Do not treat these as current architecture until a reactivation
> trigger fires.

**Table**:
The deep module for accessing one entity store: a small verb surface with not-found, DB-error, and partial-update behaviour absorbed inside.
_Avoid_: repository (reserved for aggregates), DAO

**Provider**:
The seam that hands out Tables and opens cross-store transactions. One adapter in production (IndexedDB/Dexie), one in tests (in-memory).
_Avoid_: factory, registry, DI container

**Descriptor**:
Data describing one Table — entity name, store name, primary key, index list. The single source of truth for the schema.
_Avoid_: schema, config

**Repository**:
After the Table seam, only the four aggregate modules (Sources, Collections, Annotations, Workers) are repositories: they own cross-store invariants and domain logic.
_Avoid_: using "repository" for a plain single-store CRUD module — that is a Table
