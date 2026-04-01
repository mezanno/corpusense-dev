import { getSourceRepository } from '@/data/repositories/indexeddb/dbFactory';
import { getThumbnailBlob } from '@/data/utils/manifest';
import { containsArkIdentifier, fetchManifestFromURL, isManifestUrl } from '@/utils/manifest';
import { Manifest } from '@iiif/presentation-3';
import { useCallback } from 'react';

const useSources = () => {
  const removeSourceFromLibrary = async (sourceId: string) => {
    const sourceRepository = getSourceRepository();
    await sourceRepository.deleteById(sourceId);
  };

  const fetchManifest = useCallback(async (manifestInput: string) => {
    if (isManifestUrl(manifestInput) || containsArkIdentifier(manifestInput)) {
      let manifest: Manifest;
      if (isManifestUrl(manifestInput)) {
        manifest = await fetchManifestFromURL(manifestInput);
      } else {
        //build the URL based on old Gallica API
        //TODO: il faudrait pouvoir s'adapter à d'autres ark que ceux de Gallica. Infos : https://arks.org/ark:/12148 https://n2t-dev.n2t.net/e/n2t_apidoc.html
        const url = `https://gallica.bnf.fr/iiif/${manifestInput}/manifest.json`;
        manifest = await fetchManifestFromURL(url);
      }

      //load the metadata
      // const manifestRepository = getManifestRepository();
      //   const result = yield call([manifestRepository, manifestRepository.getMetadata], manifest.id);
      //   const metadata: ItemMetadataAttribute[] = Array.isArray(result) ? result : [];
      return manifest;
    }
  }, []);

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

  const getSourceWithContent = async (sourceId: string) => {
    const sourceRepository = getSourceRepository();
    const source = await sourceRepository.getById(sourceId);
    const content = await sourceRepository.getContentById(sourceId);
    return {
      ...source,
      content,
    };
  };

  return {
    removeSourceFromLibrary,
    fetchManifest,
    addManifestToLibrary,
    getSourceWithContent,
  };
};

export default useSources;
