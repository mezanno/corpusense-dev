import {
  AnnotationDTO,
  createAnnotation,
  ElementType,
  getAnnotationType,
} from '@/data/models/Annotation';
import { Result } from '@/data/models/Result';
import { isAnnotationScope, isCanvasScope, toString } from '@/data/models/Scope';
import { Tag } from '@/data/models/Tag';
import { Task, WorkerResponse, WorkerStatus } from '@/data/models/Worker';
import {
  getAnnotationRepository,
  getCollectionRepository,
} from '@/data/repositories/indexeddb/dbFactory';
import {
  getFile,
  getImage,
  imageToBase64,
  imageUrlToBase64,
  toGallicaUrl,
} from '@/data/utils/canvas';
import i18n from '@/i18n';
import { PluginParams } from '@/state/reducers/workers';
import { getErrorMessage } from '@/utils/utils';
import { InferenceClient } from '@huggingface/inference';
import FileSaver from 'file-saver';
import { json2csv } from 'json-2-csv';
import * as XLSX from 'xlsx';
import z from 'zod';

export const pluginName = 'qwenvl';
export const pluginDisplayName = 'Qwen VL (OCR)';
export const pluginDescription = 'Reconnaissance de texte';
export const pluginCategory = 'OCR';
export const pluginExportFormats = ['txt'];

const qwenResponseSchema = z.array(
  z.object({
    bbox_2d: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    text_content: z.string(),
  }),
);

/*
 * Mistral entry point for the Mistral plugin (default export)
 * It fetches the text from the scope, sends it to the Mistral API,
 * and returns the response.
 */
export default async function run(task: Task, _params: PluginParams): Promise<WorkerResponse> {
  console.log(`Processing task for scope ${toString(task.scope)}`);
  const annotationRepository = getAnnotationRepository();
  try {
    const collectionRepository = getCollectionRepository();
    const canvas = await collectionRepository.getCanvasByScope(task.scope);
    const image = getImage(canvas);
    if (image.id === undefined) {
      return {
        status: WorkerStatus.ERROR,
        statusMessage: 'Image ID is undefined',
      };
    }
    let regions = JSON.stringify([]);
    if (isAnnotationScope(task.scope)) {
      const annotation = await annotationRepository.getById(task.scope.annotationId);
      regions = JSON.stringify([
        {
          xtl: annotation.target.selector.geometry.bounds.minX,
          ytl: annotation.target.selector.geometry.bounds.minY,
          xbr: annotation.target.selector.geometry.bounds.maxX,
          ybr: annotation.target.selector.geometry.bounds.maxY,
        },
      ]);
    } else {
      const annotations = await annotationRepository.getByScope({
        canvasId: canvas.id,
        collectionId: task.scope.collectionId,
      });
      const annotationRegions = annotations.filter(
        (a) => getAnnotationType(a) === ElementType.TEXT_REGION,
      );
      if (annotationRegions.length > 0) {
        regions = JSON.stringify(
          annotationRegions
            .sort((a1, a2) => (a1.order ?? 0) - (a2.order ?? 0))
            .map((annotation) => {
              return {
                xtl: annotation.target.selector.geometry.bounds.minX,
                ytl: annotation.target.selector.geometry.bounds.minY,
                xbr: annotation.target.selector.geometry.bounds.maxX,
                ybr: annotation.target.selector.geometry.bounds.maxY,
              };
            }),
        );
      }
    }
    console.log('Regions for ', regions);

    const apiKey = localStorage.getItem('huggingfaceApiKey');
    //return an error if no API key is found
    if (apiKey === null || apiKey === '') {
      console.log('No Hugginface API key found');
      return { status: WorkerStatus.ERROR, statusMessage: i18n.t('error_no_mistral_key') };
    }

    let imageUrl = image.id;
    if (imageUrl !== null && imageUrl.startsWith('http') === false) {
      try {
        const file = await getFile(image.id);
        imageUrl = await imageToBase64(file);
      } catch (err) {
        console.error('Failed to get file for thumbnail:', err);
      }
    } else {
      imageUrl = await imageUrlToBase64(imageUrl);
    }

    const client = new InferenceClient(apiKey);
    const chatCompletion = await client.chatCompletion({
      model: 'Qwen/Qwen2.5-VL-7B-Instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all readable text from this image. Return only the text and its bounding boxes in a JSON array',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
    });

    let content = chatCompletion.choices[0].message.content;
    if (content === undefined) {
      throw new Error('No content in chat completion response');
    }
    if (content.startsWith('```json')) {
      content = content
        .replace(/```json/, '')
        .replace(/```/g, '')
        .trim()
        .replace(/,\s*]/g, ']'); // fix common mistake with closing brackets
    }
    console.log(content);
    console.log('---');
    console.log(JSON.parse(content));

    const qwenResponse = qwenResponseSchema.parse(JSON.parse(content));

    const annotations: AnnotationDTO[] = [];
    for (const element of qwenResponse) {
      annotations.push(
        createAnnotation({
          canvasId: task.scope.canvasId,
          collectionId: task.scope.collectionId,
          minX: element.bbox_2d[0],
          minY: element.bbox_2d[1],
          maxX: element.bbox_2d[2],
          maxY: element.bbox_2d[3],
          type: ElementType.TEXT_LINE,
          value: element.text_content,
        }),
      );
    }
    const newAnnotations = await annotationRepository.addAll(annotations);
    return {
      status: WorkerStatus.COMPLETED,
      content: newAnnotations,
    };
  } catch (error) {
    return {
      status: WorkerStatus.ERROR,
      statusMessage: getErrorMessage(error),
    };
  }
}

/*
 * Export function to export results from the Mistral plugin saga.
 * It takes an array of Result objects, extracts the data, and saves it as JSON and CSV files.
 */
export async function exportResult(results: Result[], formats: string[]) {
  if (results.length === 0) {
    console.warn(`No results to export from ${pluginDisplayName} plugin`);
    return;
  }
  const allTheData: unknown[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const canvasId = isCanvasScope(result.scope) ? toGallicaUrl(result.scope.canvasId) : undefined;

    const collectionRepository = getCollectionRepository();
    const tags: Tag[] = await collectionRepository.getTagsByCollectionId(result.scope.collectionId);
    const tagsAsColumns = tags.reduce(
      (acc, t, index) => {
        acc[`tag${index + 1}`] = t.label;
        return acc;
      },
      {} as Record<string, string>,
    );

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
      'exported_data.xlsx',
    );
  }

  if (formats.includes('json')) {
    FileSaver.saveAs(
      new Blob([JSON.stringify(allTheData)], { type: 'text/plain;charset=utf-8' }),
      'exported_data.json',
    );
  }

  if (formats.includes('csv')) {
    const csv = json2csv((allTheData as object[]).filter(Boolean));
    FileSaver.saveAs(new Blob([csv], { type: 'text/plain;charset=utf-8' }), 'exported_data.csv');
  }
}
