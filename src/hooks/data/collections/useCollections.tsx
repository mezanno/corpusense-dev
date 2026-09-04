import { Collection, CollectionDetails } from '@/data/models/collection';
import {
  getAnnotationRepository,
  getCollectionRepository,
  getCollectonLiveRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { generateFirstAnnotation } from '@/data/utils/annotations';
import { generateCollectionContent } from '@/data/utils/collections';
import i18n from '@/i18n';
import { pushError, pushInfo } from '@/state/reducers/events';
import { BaseError } from '@/utils/BaseError';
import { FunctionResult } from '@/utils/functionResult';
import { getErrorMessage } from '@/utils/utils';
import { Canvas } from '@iiif/presentation-3';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { v4 as uuid } from 'uuid';
import { useAppDispatch } from '../../hooks';

export interface CreateCollectionWithSelectionPayload {
  selection: Canvas[];
  name: string;
  id?: string;
  sourceId: string;
}

export const useCollections = () => {
  const appDispatch = useAppDispatch();
  const collectionLiveRepository = useMemo(() => getCollectonLiveRepository(), []);
  const collectionRepository = useMemo(() => getCollectionRepository(), []);

  const collections = useLiveQuery(
    collectionLiveRepository.getAllDetails(),
    [],
    [] as CollectionDetails[],
  );

  const collectionCount = useMemo(() => {
    return collections.length;
  }, [collections]);

  const getCollectionById = useCallback(
    (id: string) => collections.find((c) => c.id === id),
    [collections],
  );

  const nameAlreadyExists = useCallback(
    (name: string) => {
      return collections.find((c) => c.name.toLowerCase() === name.toLowerCase()) !== undefined;
    },
    [collections],
  );

  const createCollection = async (name: string) => {
    try {
      await collectionRepository.create({
        id: uuid(),
        name,
        tags: [],
        contentSize: 0,
        content: [],
        offline: false,
      });
      appDispatch(pushInfo(i18n.t('toast_collection_created')));
    } catch (e) {
      appDispatch(pushError(getErrorMessage(e)));
    }
  };

  const createCollectionWithSelection = async (
    action: CreateCollectionWithSelectionPayload,
  ): Promise<FunctionResult<CollectionDetails, BaseError>> => {
    const { id, name, selection, sourceId } = action;
    const collectionId = id ?? uuid();
    const newCollection: CollectionDetails = {
      id: collectionId,
      name,
      tags: [],
      contentSize: selection.length,
      offline: false,
    };
    const content = generateCollectionContent(
      selection.map((c) => c.id),
      sourceId,
    );

    try {
      await collectionRepository.create({
        ...newCollection,
        content,
      });
      if (id === undefined) {
        //if an id was provided, it means it is an import, so we don't need to create the first annotations
        const firstAnnotations = generateFirstAnnotation(selection, collectionId);
        const annotationRepository = getAnnotationRepository();
        await annotationRepository.addAll(firstAnnotations);
      }
      appDispatch(pushInfo(i18n.t('toast_collection_created')));
      return FunctionResult.ok({ ...newCollection, content });
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      appDispatch(pushError(errorMsg));
      return FunctionResult.err(new BaseError(errorMsg));
    }
  };

  const duplicateCollection = async (collectionId: string, newName: string) => {
    const result = await collectionRepository.duplicate(collectionId, newName);
    if (result.ok) {
      appDispatch(pushInfo(i18n.t('toast_collection_duplicated')));
    } else {
      appDispatch(pushError(getErrorMessage(result.error)));
    }
  };

  /**
   * @remarks if some canvas are already in the collection, they will not be added again (but there is no error dispatched!)
   * @param action
   * @returns
   */
  const addSelectionToCollection = async (action: {
    selection: Canvas[];
    collectionId: string;
    sourceId: string;
  }) => {
    const { selection, collectionId, sourceId } = action;

    const collectionResult = await collectionRepository.getById(collectionId);
    if (!collectionResult.ok) {
      appDispatch(pushError(getErrorMessage(collectionResult.error)));
      return;
    }
    const collection = collectionResult.value;
    try {
      //we check the existing content of the collection and add only the new canvases
      const existingContent = collection.content ?? [];
      const existingCanvasIds = existingContent.map((elt) => elt.canvasId);
      const newContent = generateCollectionContent(
        selection.map((canvas) => canvas.id),
        sourceId,
        existingCanvasIds,
      );
      const updatedCollection = {
        ...collection,
        contentSize: existingContent.length + newContent.length,
        content: [...existingContent, ...newContent],
      };
      await collectionRepository.addContentToCollection(updatedCollection);
      //Add first annotations for the new canvases
      const firstAnnotations = generateFirstAnnotation(selection, collectionId, existingCanvasIds);
      const annotationRepository = getAnnotationRepository();
      await annotationRepository.addAll(firstAnnotations);
      if (selection.length === 1) {
        appDispatch(pushInfo(i18n.t('toast_one_element_added')));
      } else if (selection.length > 1) {
        appDispatch(pushInfo(i18n.t('toast_multiple_elements_added', { count: selection.length })));
      }
    } catch (e) {
      appDispatch(pushError(getErrorMessage(e)));
    }
  };

  const updateCollection = async (collection: Collection) => {
    const {
      id,
      name,
      about,
      tags,
      content,
      modelId,
      offline,
      postLayoutModifierChainId,
      postOcrModifierChainId,
    } = collection;
    try {
      if (id === undefined) {
        return;
      }
      await collectionRepository.update(id, {
        name,
        about,
        tags,
        content,
        modelId,
        offline,
        postLayoutModifierChainId,
        postOcrModifierChainId,
      });

      appDispatch(pushInfo(i18n.t('toast_collection_saved')));
    } catch (e) {
      appDispatch(pushError(getErrorMessage(e)));
    }
  };

  const removeElementFromCollection = async (collectionId: string, canvasId: string) => {
    return await collectionRepository.deleteElement(collectionId, canvasId);
  };

  const removeCollection = async (id: string) => {
    const collectionToRemoveResult = await collectionRepository.getById(id);
    if (!collectionToRemoveResult.ok) {
      appDispatch(pushError(getErrorMessage(collectionToRemoveResult.error)));
      return;
    }
    await collectionRepository.deleteById(id);
    appDispatch(pushInfo(i18n.t('toast_collection_deleted')));
  };

  const removeMultipleCollections = async (ids: string[]) => {
    for (const id of ids) {
      const collectionToRemoveResult = await collectionRepository.getById(id);
      if (!collectionToRemoveResult.ok) {
        appDispatch(pushError(getErrorMessage(collectionToRemoveResult.error)));
        continue;
      }
      await collectionRepository.deleteById(id);
      appDispatch(pushInfo(i18n.t('toast_collection_deleted')));
    }
  };

  return {
    collections,
    collectionCount,
    getCollectionById,
    nameAlreadyExists,
    createCollection,
    createCollectionWithSelection,
    duplicateCollection,
    addSelectionToCollection,
    updateCollection,
    removeElementFromCollection,
    removeCollection,
    removeMultipleCollections,
  };
};
