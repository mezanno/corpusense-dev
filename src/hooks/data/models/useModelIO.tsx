import { DataModel, DataModelSchema } from '@/data/models/dataModel/dataModel';
import { getModelRepository } from '@/data/repositories/indexeddb/dbFactory';
import { InvalidModelStructureError } from '@/data/utils/errors';
import { normalizeImportedEntity } from '@/data/utils/historicalDates';
import { useAppDispatch } from '@/hooks/hooks';
import i18n from '@/i18n';
import { pushError, pushInfo } from '@/state/reducers/events';
import { BaseError } from '@/utils/BaseError';
import { getErrorMessage } from '@/utils/utils';
import FileSaver from 'file-saver';
import { useMemo } from 'react';
import { v4 as uuid } from 'uuid';

export const useModelIO = () => {
  const appDispatch = useAppDispatch();
  const modelRepository = useMemo(() => getModelRepository(), []);

  const saveModel = async (model: DataModel) => {
    await modelRepository.update(model);
    appDispatch(pushInfo(i18n.t('info_model_saved')));
  };

  const removeModel = async (id: string) => {
    await modelRepository.deleteById(id);
  };

  const exportModel = async (id: string) => {
    try {
      const modelResult = await modelRepository.getById(id);
      if (!modelResult.ok) {
        appDispatch(pushError('Error exporting model: ' + getErrorMessage(modelResult.error)));
        return;
      }
      const model = modelResult.value;

      FileSaver.saveAs(
        new Blob([JSON.stringify(model)], { type: 'application/json' }),
        `${model.name}.json`,
      );
    } catch (error) {
      console.error('Error exporting model:', error);
      appDispatch(pushError('Error exporting model: ' + getErrorMessage(error)));
    }
  };

  const importModel = async (data: unknown, overwrite: boolean) => {
    try {
      const validation = DataModelSchema.safeParse(
        normalizeImportedEntity(data, new Date().toISOString()),
      );
      if (!validation.success) {
        throw new InvalidModelStructureError({ issues: validation.error.message });
      }
      const model = validation.data;

      const existingModelResult = await modelRepository.getByName(model.name);
      if (existingModelResult.ok) {
        const existingModel = existingModelResult.value;
        if (!overwrite) {
          model.name = model.name + ' (imported)';
          model.id = uuid();
        } else {
          model.id = existingModel.id;
        }
      } else {
        // Preserve the former `add` protection: never silently overwrite the row
        // of an unrelated model sharing the imported id.
        const conflicting = await modelRepository.getById(model.id);
        if (conflicting.ok) {
          throw new BaseError('A model with the same id already exists', {
            context: { id: model.id },
          });
        }
      }
      // Imports always go through the dedicated path: valid imported dates are
      // preserved and invalid ones fail with a translated message (decisions 3, 6).
      const importResult = await modelRepository.importWithDates(model);
      if (!importResult.ok) {
        appDispatch(pushError(getErrorMessage(importResult.error)));
        return;
      }
    } catch (error) {
      //TODO: faire une gestion des erreurs plus user friendly
      console.error('Error importing model:', error);
      appDispatch(pushError('Error importing model: ' + getErrorMessage(error)));
    }
  };

  return {
    saveModel,
    removeModel,
    exportModel,
    importModel,
  };
};
