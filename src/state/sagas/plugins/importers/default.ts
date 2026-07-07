import { ManifestSchema } from '@/data/models/Sources';
import { Manifest } from '@iiif/presentation-3';
import i18n from 'i18next';

export const pluginName = 'default';

const defaultImporter = async (url: string): Promise<Manifest> => {
  console.log('defaultImporter: ', url);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(i18n.t('error_404_manifest', { url }));
      } else if (response.status === 403) {
        throw new Error(i18n.t('error_403_manifest', { url }));
      } else {
        throw new Error(
          i18n.t('error_loading_manifest', { error: `${response.status} ${response.statusText}` }),
        );
      }
    }
    const validation = ManifestSchema.safeParse(await response.json());
    if (!validation.success) {
      throw new Error(i18n.t('error_invalid_manifest', { url }));
    }
    return validation.data;
  } catch (error) {
    throw new Error(i18n.t('error_unknown'));
  }
};

export default defaultImporter;
