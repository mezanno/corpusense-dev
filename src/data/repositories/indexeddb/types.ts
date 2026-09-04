import { Annotation, ElementType } from '@/data/models/annotations/annotation';
import { AnnotationDTO } from '@/data/models/annotations/annotation.dto';
import { Collection, CollectionDetails } from '@/data/models/collection';
import { CollectionElement } from '@/data/models/collectionElement';
import { ConvertedFile } from '@/data/models/convertedFile';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { FSHandle } from '@/data/models/fSHandle';
import { ItemMetadata, ItemMetadataAttribute } from '@/data/models/metadata';
import { ModifierChainDTO } from '@/data/models/modifiers/Modifier';
import { NamedEntity } from '@/data/models/namedEntity';
import { Project } from '@/data/models/project';
import { Result } from '@/data/models/result/result';
import { ResultCreateDTO } from '@/data/models/result/result.dto';
import { AnnotationScope, CanvasScope, Scope } from '@/data/models/scope/scope';
import { Source, SourceContent } from '@/data/models/source/source';
import { AddSourceDTO } from '@/data/models/source/source.dto';
import { StoredManifestDetails } from '@/data/models/storedManifest';
import { Tag } from '@/data/models/tag';
import { Worker } from '@/data/models/worker/worker';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { FunctionResult } from '@/utils/functionResult';
import { Canvas, Manifest } from '@iiif/presentation-3';
import { EntityNotFoundError } from '../EntityNotFoundError';

export interface AnnotationRepository {
  getById(id: string): Promise<FunctionResult<Annotation, EntityNotFoundError>>;
  getByScope(scope: Scope): Promise<Annotation[]>;
  getByScopeAndTypes(scope: Scope, types: ElementType[]): Promise<Annotation[]>;
  getNextOrderByScopeAndType(scope: Scope, type: ElementType): Promise<number>;
  getParent(annotation: Annotation): Promise<FunctionResult<Annotation, EntityNotFoundError>>;

  addAll(annotations: AnnotationDTO[]): Promise<Annotation[]>;

  deleteById(id: string): Promise<void>;
  deleteByIds(ids: string[]): Promise<string[]>;
  deleteByScope(scope: Scope): Promise<string[]>;
  deleteByScopeAndType(scope: Scope, types: ElementType[], isTemp: boolean): Promise<string[]>;

  update(annotation: Annotation): Promise<Annotation[]>;
  updateOrder(annotationId: string, order: number): Promise<Annotation[]>;
}

export interface AnnotationTempRepository {
  getAll(): Promise<Annotation[]>;
  getByCanvas(scope: CanvasScope): Promise<Annotation[]>;
  addAll(annotations: AnnotationDTO[]): Promise<Annotation[]>;
  deleteByCollection(collectionId: string): Promise<void>;
}

export interface CollectionRepository {
  getAllDetails(): Promise<CollectionDetails[]>;
  getById(id: string): Promise<FunctionResult<Collection, EntityNotFoundError>>;
  getTagsByCollectionId(collectionId: string): Promise<FunctionResult<Tag[], EntityNotFoundError>>;
  getCanvasesByCollectionId(
    collectionId: string,
  ): Promise<FunctionResult<Canvas[], EntityNotFoundError>>;
  getCanvasByScope(
    scope: CanvasScope | AnnotationScope,
  ): Promise<FunctionResult<CanvasWithSourceId, EntityNotFoundError>>;
  getSourceIdsByCollectionId(
    collectionId: string,
  ): Promise<FunctionResult<string[], EntityNotFoundError>>;
  getOfflineCollections(): Promise<CollectionDetails[]>;
  getOfflineCanvases(): Promise<Canvas[]>;
  exists(id: string): Promise<boolean>;

  create(collection: Collection): Promise<void>;
  addContentToCollection(collection: Collection): Promise<void>;
  duplicate(
    collectionId: string,
    newName: string,
  ): Promise<FunctionResult<CollectionDetails, EntityNotFoundError>>;

  update(
    id: string,
    { name, tags, content }: { name: string; tags: string[]; content: CollectionElement[] },
  ): Promise<void>;
  updateTags(id: string, tags: string[]): Promise<void>;
  updateOffline(id: string, offline: boolean): Promise<void>;
  shiftCollectionElements(
    collectionId: string,
    sourcePositon: number,
    targetPosition: number,
  ): Promise<FunctionResult<void, EntityNotFoundError>>;

  delete(collectionToRemove: Collection): Promise<{ workersIds: string[]; collectionId: string }>;
  deleteMultiple(collectionsToRemoveIds: string[]): Promise<void>;
  deleteById(collectionId: string): Promise<{ workersIds: string[]; collectionId: string }>;
  deleteElement(
    collectionId: string,
    canvasId: string,
  ): Promise<FunctionResult<Collection, EntityNotFoundError>>;
}

export interface ItemMetadataRepository {
  addAll(metadata: ItemMetadata[]): Promise<void>;
  getByArk(ark: string): Promise<ItemMetadata[]>;
}

export interface ManifestRepository {
  getCanvasById(
    manifestId: string,
    canvasId: string,
  ): Promise<FunctionResult<Canvas, EntityNotFoundError>>;
  getCanvasesByIds(
    manifestId: string,
    canvasId: string[],
  ): Promise<FunctionResult<Canvas[], EntityNotFoundError>>;
  getById(manifestId: string): Promise<FunctionResult<Manifest, EntityNotFoundError>>;
  getDetailsByManifestIds(manifestIds: string[]): Promise<StoredManifestDetails[]>;
  getMetadata(manifestId: string): Promise<ItemMetadataAttribute[]>;
}

export interface SourceRepository {
  add(source: AddSourceDTO): Promise<string>;

  getBlob(blobId: string): Promise<FunctionResult<Blob, EntityNotFoundError>>;
  getById(sourceId: string): Promise<FunctionResult<Source, EntityNotFoundError>>;
  getContentById(sourceId: string): Promise<FunctionResult<SourceContent, EntityNotFoundError>>;
  getContentByManifestUrl(
    manifestUrl: string,
  ): Promise<FunctionResult<SourceContent, EntityNotFoundError>>;
  getCanvasById(
    sourceId: string,
    canvasId: string,
  ): Promise<FunctionResult<Canvas, EntityNotFoundError>>;

  updateName(sourceId: string, name: string): Promise<void>;
  update(
    id: string,
    changes: Partial<Omit<Source, 'thumbnailBlob' | 'outputDirectoryHandle'>> & {
      githubManifestUrl?: string;
    },
  ): Promise<void>;

  deleteById(sourceId: string): Promise<void>;
  deleteAll(): Promise<void>;

  getPendingMigrationCount(): Promise<number>;
  migrateAllSources(): Promise<void>;
}

export interface TagRepository {
  getByIds(ids: string[]): Promise<Tag[]>;
  getAll(): Promise<Tag[]>;

  add(tag: Tag): Promise<Tag>;
  addAll(tags: Tag[]): Promise<void>;
}

export interface ModelRepository {
  getById(id: string): Promise<FunctionResult<DataModel, EntityNotFoundError>>;
  getAll(): Promise<DataModel[]>;
  getByName(name: string): Promise<FunctionResult<DataModel, EntityNotFoundError>>;

  add(model: DataModel): Promise<void>;

  update(model: DataModel): Promise<void>;

  deleteById(id: string): Promise<void>;
}

export interface NamedEntityRepository {
  getByAnnotationId(annotationId: string): Promise<NamedEntity[]>;
  getByAnnotationIds(annotationIds: string[]): Promise<NamedEntity[]>;

  add(entity: NamedEntity): Promise<void>;

  deleteByAnnotationIds(annotationIds: string[]): Promise<void>;
}

export interface ResultRepository {
  getAll(): Promise<Result[]>;
  getAllByWorkerId(workerId: string): Promise<Result[]>;
  getByScopeAndWorkerName(
    scope: Scope,
    workerName: string,
  ): Promise<FunctionResult<Result, EntityNotFoundError>>;
  getResultByWorkerIdAndTaskId(
    workerId: string,
    taskId: number,
  ): Promise<FunctionResult<Result, EntityNotFoundError>>;

  add(result: ResultCreateDTO): Promise<Result>;
  addAll(results: Result[]): Promise<void>;
}

export interface WorkerRepository {
  getAll(): Promise<Worker[]>;
  getById(id: string): Promise<FunctionResult<Worker, EntityNotFoundError>>;
  getByScope(scope: Scope, subScope: boolean): Promise<Worker[]>;
  getByNamesAndScope(workerName: string[], scope: Scope): Promise<Worker[]>;

  add(worker: Worker): Promise<Worker>;
  addAll(workers: Worker[]): Promise<void>;

  patch(id: string, changes: Partial<Worker>): Promise<void>;

  deleteById(workerId: string): Promise<void>;
  deleteByScope(scope: Scope): Promise<string[]>;
  deleteResultById(workerId: string, taskId: number): Promise<void>;
}

export interface FSHandleRepository {
  getAll(): Promise<FSHandle[]>;
  put(handle: FSHandle): Promise<void>;
}

export interface ConvertedFileRepository {
  getById(id: string): Promise<FunctionResult<ConvertedFile, EntityNotFoundError>>;
  getByFolderName(folderName: string): Promise<FunctionResult<ConvertedFile, EntityNotFoundError>>;

  add(file: ConvertedFile): Promise<void>;

  update(
    id: string,
    changes: Partial<Omit<ConvertedFile, 'thumbnailBlob' | 'outputDirectoryHandle'>>,
  ): Promise<void>;

  delete(id: string): Promise<void>;
}

export interface ModifierChainRepository {
  getAll(): Promise<ModifierChainDTO[]>;
  getById(id: string): Promise<FunctionResult<ModifierChainDTO, EntityNotFoundError>>;
  getByName(name: string): Promise<FunctionResult<ModifierChainDTO, EntityNotFoundError>>;

  add(chain: ModifierChainDTO): Promise<void>;

  put(chain: ModifierChainDTO): Promise<void>;

  delete(id: string): Promise<void>;
}

export interface ProjectRepository {
  getAll(): Promise<Project[]>;
  getById(id: string): Promise<FunctionResult<Project, EntityNotFoundError>>;

  add(project: Project): Promise<void>;

  addSource(projectId: string, sourceId: string): Promise<void>;
}
