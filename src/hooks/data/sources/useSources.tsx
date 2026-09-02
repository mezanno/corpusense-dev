import { SourceWithContent } from '@/data/models/source/source';
import { EntityNotFoundError } from '@/data/repositories/EntityNotFoundError';
import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { getThumbnailBlob } from '@/data/utils/manifest';
import { BaseError } from '@/utils/BaseError';
import { FunctionResult } from '@/utils/functionResult';
import { containsArkIdentifier, fetchManifestFromURL, isManifestUrl } from '@/utils/manifest';
import { Manifest } from '@iiif/presentation-3';
import { useCallback } from 'react';

export class ManifestInputError extends BaseError {
  constructor(context: { input: string }) {
    super(`Manifest input is not valid: ${context.input}`);
  }
}

const useSources = () => {
  const removeSourceFromLibrary = async (sourceId: string) => {
    const sourceRepository = getSourceRepository();
    await sourceRepository.deleteById(sourceId);
  };

  const fetchManifest = useCallback(
    async (manifestInput: string): Promise<FunctionResult<Manifest, BaseError>> => {
      if (isManifestUrl(manifestInput)) {
        return await fetchManifestFromURL(manifestInput);
      }
      if (containsArkIdentifier(manifestInput)) {
        //build the URL based on old Gallica API
        //TODO: il faudrait pouvoir s'adapter à d'autres ark que ceux de Gallica. Infos : https://arks.org/ark:/12148 https://n2t-dev.n2t.net/e/n2t_apidoc.html
        const url = `https://gallica.bnf.fr/iiif/${manifestInput}/manifest.json`;
        return await fetchManifestFromURL(url);
      }
      return FunctionResult.err(new ManifestInputError({ input: manifestInput }));
    },
    [],
  );

  const addManifestToLibrary = useCallback(async (manifest: Manifest, name: string) => {
    const thumbnailBlob = await getThumbnailBlob(manifest);

    const newRemoteSourceDTO = {
      type: 'remote' as const,
      name,
      pageCount: manifest.items.length,
      thumbnailBlob,
      manifest,
    };
    const sourceRepository = getSourceRepository();
    return await sourceRepository.add(newRemoteSourceDTO);
  }, []);

  const getSourceWithContent = async (
    sourceId: string,
  ): Promise<FunctionResult<SourceWithContent, EntityNotFoundError>> => {
    const sourceRepository = getSourceRepository();
    const sourceResult = await sourceRepository.getById(sourceId);
    if (!sourceResult.ok) {
      return sourceResult;
    }
    const contentResult = await sourceRepository.getContentById(sourceId);
    if (!contentResult.ok) {
      return contentResult;
    }
    return FunctionResult.ok({
      ...sourceResult.value,
      content: contentResult.value,
    });
  };

  const updateSourceName = async (sourceId: string, name: string) => {
    const sourceRepository = getSourceRepository();
    await sourceRepository.updateName(sourceId, name);
  };

  const clearAllSources = async () => {
    const sourceRepository = getSourceRepository();
    await sourceRepository.deleteAll();
  };

  return {
    removeSourceFromLibrary,
    fetchManifest,
    addManifestToLibrary,
    getSourceWithContent,
    updateSourceName,
    clearAllSources,
  };
};

export default useSources;
