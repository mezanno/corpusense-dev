import { Annotation } from '@/data/models/Annotation';
import { Collection } from '@/data/models/Collection';
import { DataModel } from '@/data/models/DataModel';
import { Result } from '@/data/models/Result';
import { Tag } from '@/data/models/Tag';
import { Worker } from '@/data/models/Worker';
import {
  getAnnotationRepository,
  getCollectionRepository,
  getModelRepository,
  getResultRepository,
  getTagRepository,
  getWorkerRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { useAppDispatch } from '@/hooks/hooks';
import { ProgressLoggerSetters } from '@/hooks/ui/useLogger';
import i18n from '@/i18n';
import { fecthManifestRequest } from '@/state/reducers/manifests';
import { getErrorMessage } from '@/utils/utils';
import { default as JSZip } from 'jszip';
import { uniq } from 'lodash';
import { useCallback, useMemo } from 'react';

export const useCollectionImporter = (setters: ProgressLoggerSetters) => {
  const appDispatch = useAppDispatch();
  const { setStatus, setProgress, addLog } = setters;

  const collectionRepository = useMemo(() => getCollectionRepository(), []);

  const importCollections = useCallback(
    async (data: ArrayBuffer) => {
      setStatus('processing');
      addLog('Starting import of collections from zip file...');
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(data);
      const totalFiles = Object.keys(zipContent.files).length;
      for (let i = 0; i < totalFiles; i++) {
        const filename = Object.keys(zipContent.files)[i];
        const file = zipContent.files[filename];
        if (!file.dir) {
          const fileContent = await file.async('string');
          try {
            const json = JSON.parse(fileContent) as object;
            await importCollection(filename, json);
          } catch (e) {
            addLog(`Error importing collection from file ${filename}: ${getErrorMessage(e)}`);
          }
        }
        setProgress(Math.round(((i + 1) / totalFiles) * 100));
      }
      setStatus('done');
    },
    [addLog],
  );

  const importOneCollection = useCallback(
    async (filename: string, json: object) => {
      setStatus('processing');
      try {
        await importCollection(filename, json);
      } catch (e) {
        addLog(`Error importing collection from file ${filename}: ${getErrorMessage(e)}`, 'error');
      }
      setStatus('done');
    },
    [addLog],
  );

  const importCollection = useCallback(
    async (filename: string, json: object) => {
      addLog(`Importing collection from file: ${filename}`);
      if (!('collection' in json)) {
        addLog(`Error: ${i18n.t('error_import_not_a_collection', { file: filename })}`, 'error');
        return;
      }

      const { collection, annotations, model, workers, results, tags } = json as {
        collection: Collection;
        annotations?: Annotation[];
        model?: DataModel;
        workers?: Worker[];
        results?: Result[];
        tags?: Tag[];
      };

      //réimporte les manifestes liés à la collection (si besoin)
      const manifests = uniq(collection.content.map((item) => item.manifestId));
      manifests.forEach((manifestId) => {
        addLog(`Fetching manifest ${manifestId}`);
        if (manifestId.startsWith('http://') || manifestId.startsWith('https://')) {
          appDispatch(fecthManifestRequest(manifestId));
        }
      });

      try {
        await collectionRepository.create(collection);
        addLog(`Collection created with id: ${collection.id}`, 'success');
      } catch (e) {
        if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'ConstraintError') {
          addLog(
            `Error: ${i18n.t('error_import_collection_already_exists', { id: collection.id })}`,
            'error',
          );
        } else {
          addLog(
            i18n.t('error_import_collection', { file: filename, error: getErrorMessage(e) }),
            'error',
          );
        }
        return;
      }

      if (annotations !== undefined && annotations.length > 0) {
        addLog(`Importing ${annotations.length} annotations for collection ${collection.id}...`);
        const annotationRepository = getAnnotationRepository();
        const annotationsAdded = await annotationRepository.addAll(annotations);
        addLog(`Imported ${annotationsAdded.length} annotations`, 'success');
      }

      if (model !== undefined) {
        try {
          addLog(`Importing model ${model.id} for collection ${collection.id}...`);
          const modelRepository = getModelRepository();
          await modelRepository.add(model);
          addLog(`Model ${model.id} imported`, 'success');
        } catch (error) {
          addLog(`Error importing model ${model.id}: ${getErrorMessage(error)}`, 'error');
        }
      }

      if (workers !== undefined && workers.length > 0) {
        try {
          addLog(`Importing ${workers.length} workers for collection ${collection.id}...`);
          const workerRepository = getWorkerRepository();
          await workerRepository.addAll(workers);
          addLog(`Imported ${workers.length} workers`, 'success');
        } catch (error) {
          addLog(`Error importing workers: ${getErrorMessage(error)}`, 'error');
        }
      }

      if (results !== undefined && results.length > 0) {
        try {
          addLog(`Importing ${results.length} results for collection ${collection.id}...`);
          const resultRepository = getResultRepository();
          await resultRepository.addAll(results);
          addLog(`Imported ${results.length} results`, 'success');
        } catch (error) {
          addLog(`Error importing results: ${getErrorMessage(error)}`, 'error');
        }
      }

      if (tags !== undefined && tags.length > 0) {
        try {
          addLog(`Importing ${tags.length} tags for collection ${collection.id}...`);
          const tagRepository = getTagRepository();
          await tagRepository.addAll(tags);
          addLog(`Imported ${tags.length} tags`, 'success');
        } catch (error) {
          addLog(`Error importing tags: ${getErrorMessage(error)}`, 'error');
        }
      }

      addLog(`Collection ${collection.id} imported successfully from file: ${filename}`, 'success');
    },
    [appDispatch, collectionRepository, addLog],
  );

  return { importOneCollection, importCollections };
};
