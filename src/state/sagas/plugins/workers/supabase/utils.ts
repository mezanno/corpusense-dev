import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { getFile, getImage } from '@/data/utils/canvas';
import { CanvasWithSourceId } from '@/hooks/data/collections/useCollectionContent';
import { supabase } from '@/utils/config';
import { getErrorMessage } from '@/utils/utils';

const uploadCanvasImage = async (canvasWithSourceId: CanvasWithSourceId): Promise<string> => {
  const image = getImage(canvasWithSourceId.canvas);
  if (image.id === undefined) {
    throw new Error('Image ID is undefined');
  }
  const sourceRepository = getSourceRepository();
  const sourceContentResult = await sourceRepository.getContentById(canvasWithSourceId.sourceId);
  if (!sourceContentResult.ok) {
    throw sourceContentResult.error;
  }

  const sourceContent = sourceContentResult.value;
  if (sourceContent.type === 'local') {
    const fileHandle = sourceContent.localFile.outputDirectoryHandle;
    const imageToProcess = await getFile(image.id, fileHandle);
    return await uploadFile(imageToProcess);
  } else {
    const res = await fetch(image.id);
    if (!res.ok) throw new Error('Failed to fetch image');
    const blob = await res.blob();
    return await uploadFile(blob);
  }
};

const uploadFile = async (blob: Blob) => {
  const filePath = `uploads/${crypto.randomUUID()}`;
  const { data: uploadData, error } = await supabase.storage
    .from('corpusense')
    .upload(filePath, blob, {
      cacheControl: '3600',
      upsert: true,
    });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const { data } = supabase.storage.from('corpusense').getPublicUrl(uploadData.path);
  return data.publicUrl;
};

export { uploadCanvasImage };
