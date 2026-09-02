import { ManifestSchema } from '@/data/models/source/source';
import { Manifest } from '@iiif/presentation-3';
import i18n from 'i18next';

export const pluginName = 'bnf.fr';

const gallicaImporter = async (url: string): Promise<Manifest> => {
  console.log('gallicaImporter: ', url);
  try {
    const urlV3 = url.replace('gallica.bnf.fr/iiif', 'openapi.bnf.fr/iiif/presentation/v3');
    return await fetchUrl(urlV3);
  } catch (error) {
    return await fetchUrl(url);
  }
};

const fetchUrl = async (url: string): Promise<Manifest> => {
  const response = await fetch(url, {
    // mode: 'no-cors', //ne sert à rien (renvoie 200 mais corps de la réponse vide)
    headers: {
      Accept: 'application/json',
    },
  });
  if (response.ok) {
    const validation = ManifestSchema.safeParse(await response.json());
    if (!validation.success) {
      throw new Error(i18n.t('error_invalid_manifest', { url }));
    }
    return validation.data;
  }
  console.log(`Error fetching manifest: ${response.status} - ${response.statusText}`);
  if (response.status === 404) {
    throw new Error(i18n.t('error_404_manifest', { url }));
  } else if (response.status === 403) {
    throw new Error(i18n.t('error_403_manifest', { url }));
  } else {
    throw new Error(
      i18n.t('error_loading_manifest', { error: `${response.status} ${response.statusText}` }),
    );
  }
};

export default gallicaImporter;
