import i18n from '@/i18n';
import { Canvas, Manifest } from '@iiif/presentation-3';
import { Cozy } from 'cozy-iiif';

export const extractManifestDetails = (manifest: Manifest) => {
  const parsed = Cozy.parse(manifest);

  if (parsed.type !== 'manifest') {
    throw new Error(i18n.t('error_invalid_manifest_input'));
  }
  const name = parsed.resource.getSummary() ?? i18n.t('error_manifest_empty_name');
  const thumbnail = manifest.thumbnail?.[0];

  return { name, thumbnail };
};

export const extractCanvasById = (manifest: Manifest, canvasId: string): Canvas => {
  const canvas = manifest.items?.find((item) => item.id === canvasId);
  if (!canvas) {
    throw new Error(i18n.t('error_canvas_not_found'));
  }
  return canvas;
};

export const extractCanvasesByIds = (manifest: Manifest, canvasIds: string[]): Canvas[] => {
  return manifest.items?.filter((item) => canvasIds.includes(item.id)) ?? [];
};

export const getThumbnailBlob = async (manifest: Manifest): Promise<Blob> => {
  const thumbnailURL = manifest.thumbnail?.[0]?.id;
  return thumbnailURL !== undefined
    ? await fetch(thumbnailURL)
        .then((response) => response.blob())
        .catch((error) => {
          console.warn('Error fetching thumbnail: ', error);
          return new Blob();
        })
    : new Blob();
};
