import { CorpusenseRoutes } from '@/hooks/useAppNavigation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

const routeTitles: Record<string, string> = {
  [CorpusenseRoutes.MANIFEST]: 'page_title_manifest',
  [CorpusenseRoutes.PROJECT]: 'page_title_project',
  [CorpusenseRoutes.EXPERT]: 'page_title_expert',
  [CorpusenseRoutes.COLLECTIONS]: 'page_title_collection_manager',
  [CorpusenseRoutes.MODELS]: 'page_title_models_manager',
  [CorpusenseRoutes.MODIFIERCHAIN]: 'page_title_modifierchain_manager',
  [CorpusenseRoutes.CONFIGURATION]: 'page_title_configuration',
  [CorpusenseRoutes.LOCAL_SOURCES]: 'page_title_local_storage',
  [CorpusenseRoutes.IIIF_SOURCES]: 'page_title_iiif_storage',
  [CorpusenseRoutes.WORKERS]: 'page_title_workers_manager',
  [CorpusenseRoutes.DOCUMENTATION]: 'page_title_documentation',
};

export default function useDocumentTitle() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const segment = pathname.split('/').filter(Boolean)[0];
  const titleKey = routeTitles[segment] ?? 'page_title_home';

  useEffect(() => {
    document.title = `${t(titleKey)} | CorpuSense`;
  }, [titleKey, t, i18n.language]);

  useEffect(() => {
    const updateLanguage = () => {
      document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
    };
    updateLanguage();
    i18n.on('languageChanged', updateLanguage);
    return () => {
      i18n.off('languageChanged', updateLanguage);
    };
  }, [i18n]);

  return titleKey;
}
