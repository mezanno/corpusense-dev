import { Result } from '@/data/models/Result';
import {
  getAnnotationRepository,
  getCollectionRepository,
  getManifestRepository,
  getModelRepository,
  getResultRepository,
  getTagRepository,
  getWorkerRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { getImage } from '@/data/utils/canvas';
import { generateManifestFromCollection } from '@/data/utils/export';
import { useAppDispatch } from '@/hooks/hooks';
import { ProgressLoggerSetters } from '@/hooks/ui/useLogger';
import i18n from '@/i18n';
import { pushError, pushInfo } from '@/state/reducers/events';
import { getErrorMessage } from '@/utils/utils';
import FileSaver from 'file-saver';
import { default as JSZip } from 'jszip';
import { useMemo } from 'react';

export interface ExportCollectionOptions {
  annotations?: boolean;
  model?: boolean;
  workers?: boolean;
  workersScope?: 'collection' | 'all';
  manifest?: boolean;
}

export const useCollectionIO = (setters: ProgressLoggerSetters) => {
  const appDispatch = useAppDispatch();
  const collectionRepository = useMemo(() => getCollectionRepository(), []);
  const { setStatus, setProgress, addLog } = setters;

  /**
   * Export one or more collections to a zip file
   * @param action The ids of the collections to export
   */
  const exportCollections = async (collectionIds: string[], options: ExportCollectionOptions) => {
    setStatus('processing');
    setProgress(0);

    const zip = new JSZip();
    for (let i = 0; i < collectionIds.length; i++) {
      const id = collectionIds[i];

      const exists = await collectionRepository.exists(id);
      if (!exists) {
        addLog(`Collection with id ${id} does not exist, skipping export`, 'error');
        continue;
      }

      const collection = await collectionRepository.getById(id);
      addLog(`Exporting collection ${collection.name} (${i + 1}/${collectionIds.length})`);

      const exportedCollection = { collection };

      if (collection.tags.length > 0) {
        const tagRepository = getTagRepository();
        const tags = await tagRepository.getByIds(collection.tags);
        Object.assign(exportedCollection, { tags });
      }

      if (options.annotations === true) {
        const annotationRepository = getAnnotationRepository();
        const annotations = await annotationRepository.getByScope({ collectionId: id });
        Object.assign(exportedCollection, { annotations });
      }

      if (options.model === true && collection.modelId !== undefined) {
        try {
          const modelRepository = getModelRepository();
          const model = await modelRepository.getById(collection.modelId);
          Object.assign(exportedCollection, { model });
        } catch (error) {
          addLog(`Error adding model: ${getErrorMessage(error)}`, 'error');
        }
      }

      if (options.workers === true) {
        try {
          const workerRepository = getWorkerRepository();
          const subScope = options.workersScope !== 'collection';
          const workers = await workerRepository.getByScope({ collectionId: id }, subScope);

          if (workers.length > 0) {
            const allTheResults: Result[] = [];
            const resultRespository = getResultRepository();
            for (let j = 0; j < workers.length; j++) {
              const worker = workers[j];
              const workerResults = await resultRespository.getAllByWorkerId(worker.id);
              allTheResults.push(...workerResults);
            }
            Object.assign(exportedCollection, { workers });
            Object.assign(exportedCollection, { results: allTheResults });
          }
        } catch (error) {
          addLog(`Error adding workers: ${getErrorMessage(error)}`, 'error');
        }
      }

      if (options.manifest === true) {
        try {
          const { name, manifest } = await generateManifestFromCollection(id);
          console.log(name, ' --> ', manifest);
          zip.file(name + '_manifest.json', JSON.stringify(manifest, null, 2));
        } catch (error) {
          addLog(`Error generating manifest: ${getErrorMessage(error)}`, 'error');
        }
      }

      zip.file(collection.name + '.json', JSON.stringify(exportedCollection, null, 2));
      addLog(`Collection ${collection.name} added to export.`, 'success');
      setProgress(Math.round(((i + 1) / collectionIds.length) * 100));
    }
    setStatus('done');
    const zipContent = await zip.generateAsync({ type: 'blob' });
    FileSaver.saveAs(zipContent, 'exported_collections.zip');
    addLog('Export completed successfully.', 'success');
  };

  const toggleCollectionOffline = async (collectionId: string) => {
    try {
      const collection = await collectionRepository.getById(collectionId);
      if (collection === undefined) {
        appDispatch(pushError(i18n.t('error_collection_not_found')));
        return;
      }
      await collectionRepository.updateOffline(collectionId, !collection.offline);
      // yield put(updateCollectionSuccess({ ...collection, offline: !collection.offline }));
      if (!collection.offline) {
        //collection is now available offline
        appDispatch(pushInfo(i18n.t('toast_collection_offline')));
      } else {
        //collection is not available offline anymore
        appDispatch(pushInfo(i18n.t('toast_collection_online')));
      }
      console.log('Notifying service worker');
      if (navigator.serviceWorker?.controller) {
        const manifestRepository = getManifestRepository();
        const imageUrls = [];
        for (let i = 0; i < collection.content.length; i++) {
          const canvas = await manifestRepository.getCanvasById(
            collection.content[i].manifestId,
            collection.content[i].canvasId,
          );
          try {
            imageUrls.push(getImage(canvas).id);
          } catch (e) {
            console.warn(`No image found for canvas ${canvas.id}`);
          }
        }
        console.log(imageUrls);

        navigator.serviceWorker?.controller?.postMessage({
          action: !collection.offline ? 'addToCache' : 'removeFromCache',
          imageUrls,
        });
      }
    } catch (e) {
      appDispatch(pushError(getErrorMessage(e)));
    }
  };

  return { exportCollections, toggleCollectionOffline };
};
