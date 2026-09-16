# Data Models Overview

This document explains the TypeScript data models in `src/data/models/*.ts`. These types define the core entities used across Corpusense for collections, annotations, workers, results, and related concepts.

## Conventions

- `WithStringId` provides a common `{ id: string }` shape and is composed into other types.
- `*Details`, `*Content`, and combined types (e.g., `StoredManifestDetails`, `StoredManifestContent`, `StoredManifest`) separate lightweight listing metadata from heavy content payloads.
- `*CreateDTO` are input shapes for create operations.

---

## `Annotation.ts`

Represents user annotations on IIIF canvases, plus helpers to create/inspect them.

- `W3CMotivationEnum`: Subset of W3C motivations used as `body.purpose` (e.g., `classifying`, `tagging`).
- `ElementType`: Domain-specific classification for segments (TAG, ENTRY, LINE, COLUMN, PAGE, SECTION, REGION).
- `Annotation`: Extends `ImageAnnotation` with:
  - `canvasId`, `collectionId`: Scope of the annotation
  - `order`: Display order within a canvas/collection
  - optional `partOf`, `previous`, `next` chaining
- `AnnotationDTO`: Minimal persisted/transferred annotation (`ImageAnnotation` + `canvasId`, `collectionId`).
- `AnnotationCreateDTO`/`AnnotationWithIdCreateDTO`: Inputs to create an annotation from simple rect bounds and semantics.
- Type guards: `isAnnotation`, `isAnnotationArray` ensure runtime safety.
- Accessors:
  - `getBodies`, `getAnnotationText`, `getAnnotationType` and internals for reading classifying/tagging values.
- Factories:
  - `createAnnotation(params)`: Build `AnnotationDTO` from bounds, `ElementType`, and value; generates UUID if missing.
  - `createAnnotationFromAnnotorious({ annotation, type, value, collectionId, canvasId })`: Convert an Annotorious `ImageAnnotation`.
  - `duplicateAnnotation(annotation, canvasId?)`: Clone with new id and optionally switch canvas.
- Helpers:
  - `createBodies(type, value, annotationId)`: Returns two bodies: classifying and tagging.

Notes: Shapes assume rectangular geometry via `ShapeType.RECTANGLE` and encode both classifying (type) and tagging (text) bodies per annotation.

---

## `Collection.ts`

Data structures for user collections grouping canvases.

- `CollectionDetails` (extends `WithStringId`):
  - `name`, optional `about`
  - `tags: string[]` (tag ids)
  - `modelId?`: associated DataModel id
  - `contentSize`: number of elements
  - `createdAt`, `updatedAt`: ISO timestamps (`TimeStampSchema`)
- `CollectionContent` (extends `WithStringId`):
  - `content: CollectionElement[]`
- `Collection`: Convenience union of details + content.
- `ExportedCollection` extends IIIF `Manifest` and adds `tags: Tag[]` for export.

---

## `Sources.ts`

Data structures representing external or local sources (IIIF manifests or uploaded files).

- `Source`: Represents a registered source (`id`, `name`, `type`: `'remote' | 'local'`).
- `SourceContent`: Detailed content associated with a source.
- `SourceWithContent`: Combines source metadata and content, updated to include `thumbnailBase64` for cached preview thumbnails.
- `SourceWithContentAndThumbnail`: Extended DTO for fetching sources with resolved thumbnails.

---

## `Worker.ts`

Background processing units and their tasks.

- `WorkerStatus`: Lifecycle enum (`WAITING`, `POSTING`, `POSTED`, `INPROGRESS`, `UNFINISHED`, `COMPLETED`, `FAILED`, etc., with status transition error `StatusChangeError`).
- `Task`:
  - `id: number`
  - `canvas: Canvas`
  - `scope: CanvasScope | AnnotationScope`
  - `status: WorkerStatus`, `statusMessage?`
- `Worker`:
  - `id`, `name`, `scope`, `scopeKey`
  - `status`, `statusMessage?`, `createdAt`, `estimatedDuration`, `realtimeDuration`
  - `params: PluginParams`, `queue: Task[]`
- `WorkerResponse`: Minimal result envelope for RPC/HTTP.
- `WorkerCreateDTO`: Inputs to create a worker.
- Type guard `isWorker(obj)`: Distinguishes saved workers from create DTOs.

---

## `utils.ts`

- `WithStringId`: common `{ id: string }` alias for composing into other types.

---

## Files not covered

- `converters/` and `__tests__/` contain transformation helpers and unit tests and are not documented here.
