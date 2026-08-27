import { LLMProfile } from '@/data/models/LLMProfile';
import { Result } from '@/data/models/Result';
import { isAnnotationScope, isCanvasScope, Scope, toString } from '@/data/models/Scope';
import { Task, Worker, WorkerResponse, WorkerStatus } from '@/data/models/Worker';
import {
  getCollectionRepository,
  getModelRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import { IndexedDBResultRepository } from '@/data/repositories/indexeddb/results';
import { toGallicaUrl } from '@/data/utils/canvas';
import {
  generateNumberedTextForCollection,
  generateNumberedTextFromCanvas,
} from '@/data/utils/export';
import { generateSchema, hasPreviousValueField } from '@/data/utils/model';
import i18n from '@/i18n';
import { FunctionResult } from '@/utils/functionResult';
import { getErrorMessage } from '@/utils/utils';
import FileSaver from 'file-saver';
import { json2csv } from 'json-2-csv';
import * as XLSX from 'xlsx';
import { WorkerCategory } from './WorkerCategory';
import { OpenAICompatibleClient } from './openai/OpenAICompatibleClient';

export const pluginName = 'openai';
export const pluginDisplayName = 'Extraction de données OpenAI API';
export const pluginDescription =
  "Extrait des données structurées à partir du texte. Nécessite que l'OCR soit fait ainsi qu'un modèle de données.";
export const pluginCategory = WorkerCategory.LLM;
export const pluginExportFormats = ['json', 'csv', 'xlsx'];

//TODO: à déplacer dans un fichier utils
async function getText(scope: Scope) {
  let fullText = '';
  if (isCanvasScope(scope)) {
    const { text } = await generateNumberedTextFromCanvas(scope.canvasId, scope.collectionId);
    fullText = text;
  } else if (isAnnotationScope(scope)) {
    //TODO: implement text extraction from annotation
    fullText = '';
  } else {
    //TODO : en cas d'erreur ?
    fullText = FunctionResult.unwrapOr(
      await generateNumberedTextForCollection(scope.collectionId),
      '',
    );
  }
  return fullText.replace(/["«»]/g, '');
}

/*
 * LLM entry point (default export)
 * It fetches the text from the scope, sends it,
 * and returns the response.
 */
export default async function run(task: Task, worker: Worker): Promise<WorkerResponse> {
  console.log(`Processing task for scope ${toString(task.scope)}`);

  if (
    worker.params === undefined ||
    worker.params === null ||
    typeof worker.params !== 'object' ||
    !('profileId' in worker.params)
  ) {
    return { status: WorkerStatus.ERROR, statusMessage: i18n.t('error_no_profileId') };
  }

  const profileId = worker.params.profileId as string;
  if (profileId === undefined) {
    return { status: WorkerStatus.ERROR, statusMessage: i18n.t('error_no_mistral_key') };
  }

  const profiles: LLMProfile[] = (() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('llm-profiles') ?? '[]');
      return Array.isArray(parsed) ? (parsed as LLMProfile[]) : [];
    } catch {
      return [];
    }
  })();
  const profile = profiles.find((p) => p.id === profileId);
  if (profile === undefined) {
    return { status: WorkerStatus.ERROR, statusMessage: i18n.t('error_no_mistral_key') };
  }

  let model = undefined;
  const collectionRepository = getCollectionRepository();
  try {
    const collectionResult = await collectionRepository.getById(task.scope.collectionId);
    if (!collectionResult.ok) {
      return {
        status: WorkerStatus.ERROR,
        statusMessage: collectionResult.error.message,
      };
    }
    const collection = collectionResult.value;
    const modelId = collection.modelId;
    if (modelId === undefined) {
      return {
        status: WorkerStatus.ERROR,
        statusMessage: i18n.t('error_model_undefined'),
      };
    }
    const modelRepository = getModelRepository();
    const modelResult = await modelRepository.getById(modelId);
    if (!modelResult.ok) {
      return {
        status: WorkerStatus.ERROR,
        statusMessage: modelResult.error.message,
      };
    }
    model = modelResult.value;
  } catch (error) {
    return {
      status: WorkerStatus.ERROR,
      statusMessage: getErrorMessage(error),
    };
  }

  const text = await getText(task.scope);
  if (text === undefined || text.length === 0) {
    console.log('No text found for this canvas');
    return { status: WorkerStatus.ERROR, statusMessage: i18n.t('error_export_no_text') };
  }

  const modelHasPreviousValueField = hasPreviousValueField(model);
  let lastValue = undefined;
  if (modelHasPreviousValueField && task.previousTask !== undefined) {
    //fetch the last result for this worker to get the previous value for fields that have getPreviousValue set to true
    const resultRepository = new IndexedDBResultRepository();
    const result = await resultRepository.getResultByWorkerIdAndTaskId(
      task.previousTask.workerId,
      task.previousTask.taskId,
    );
    if (result.ok) {
      const previousResult = JSON.parse(result.value.value as string) as unknown;
      if (Array.isArray(previousResult)) {
        lastValue = previousResult[previousResult.length - 1] as unknown; //on prend la dernière entrée si le résultat est un tableau
      } else {
        lastValue = previousResult;
      }
    }
  }
  console.log('previousResult: ', lastValue);

  const prompt = model.prompt.replace('{{schema}}', generateSchema(model, lastValue));
  console.log('prompt: ', prompt);

  try {
    const client = new OpenAICompatibleClient({
      apiKey: profile.apiKey,
      baseURL: profile.baseUrl,
    });
    const response = await client.complete({
      model: profile.model,
      messages: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      responseFormat: { type: 'json_object' },
    });

    console.log('Response from Worker:', response);
    return {
      status: WorkerStatus.COMPLETED,
      content: response.content,
    };
  } catch (error) {
    return {
      status: WorkerStatus.ERROR,
      statusMessage: getErrorMessage(error),
    };
  }
}

export async function extractData(results: Result[]): Promise<unknown[]> {
  if (results.length === 0) {
    console.warn(`No results to export from ${pluginDisplayName} plugin`);
    return [];
  }

  const collectionRepository = getCollectionRepository();

  const allTheData: unknown[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const canvasId = isCanvasScope(result.scope) ? toGallicaUrl(result.scope.canvasId) : undefined;

    const tagsResult = await collectionRepository.getTagsByCollectionId(result.scope.collectionId);

    let tagsAsColumns: Record<string, string> = {};
    if (tagsResult.ok) {
      const tags = tagsResult.value;
      tagsAsColumns = tags.reduce(
        (acc, t, index) => {
          acc[`tag${index + 1}`] = t.label;
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    try {
      const dataParsed = JSON.parse(result.value as string) as unknown;
      const dataParsedArray = (Array.isArray(dataParsed) ? dataParsed : [dataParsed]) as unknown[];
      const dataWithCanvasId = dataParsedArray.map((item) => {
        if (item !== undefined && typeof item === 'object') {
          return {
            ...(item as object),
            canvasId,
            ...tagsAsColumns,
          };
        }
        return item;
      });

      allTheData.push(...dataWithCanvasId);
    } catch (error) {
      //TODO: on fait quoi lorsque le json est invalide ?
      console.error('Error parsing dataInCanvas:', error);
    }
  }

  return allTheData;
}

/*
 * Export function to export results from the OpenAI plugin saga.
 * It takes an array of Result objects, extracts the data, and saves it as JSON and CSV files.
 */
export async function exportResult(results: Result[], formats: string[]) {
  if (results.length === 0) {
    console.warn(`No results to export from ${pluginDisplayName} plugin`);
    return;
  }

  const collectionRepository = getCollectionRepository();
  const collectionId = results[0].scope.collectionId;
  const collectionResult = await collectionRepository.getById(collectionId);
  const collectionName = collectionResult.ok ? collectionResult.value.name : undefined;

  const filename = `mistral_export_${collectionName ?? collectionId}_${new Date().toLocaleDateString()}`;

  const allTheData = await extractData(results);

  if (formats.includes('xlsx')) {
    const flattenedData: Record<string, unknown>[] = [];
    allTheData.forEach((item) => {
      if (item !== undefined && typeof item === 'object') {
        const flattenedItem: Record<string, unknown> = { ...item };
        Object.keys(flattenedItem).forEach((key) => {
          if (Array.isArray(flattenedItem[key])) {
            flattenedItem[key] = (flattenedItem[key] as unknown[]).join('; ');
          } else if (typeof flattenedItem[key] === 'object' && flattenedItem[key] !== null) {
            flattenedItem[key] = JSON.stringify(flattenedItem[key]);
          }
        });
        flattenedData.push(flattenedItem);
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(flattenedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mistral Data');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    FileSaver.saveAs(
      new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
      }),
      filename + '.xlsx',
    );
  }

  if (formats.includes('json')) {
    FileSaver.saveAs(
      new Blob([JSON.stringify(allTheData)], { type: 'text/plain;charset=utf-8' }),
      filename + '.json',
    );
  }

  if (formats.includes('csv')) {
    const csv = json2csv((allTheData as object[]).filter(Boolean));
    FileSaver.saveAs(new Blob([csv], { type: 'text/plain;charset=utf-8' }), filename + '.csv');
  }
}
