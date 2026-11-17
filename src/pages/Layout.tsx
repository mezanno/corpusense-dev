import LanguageFlag from '@/components/common/LanguageFlag';
import LayoutSideBar from '@/components/layout/LayoutSidebar';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import usePendingMigration from '@/hooks/data/sources/usePendingMigration';
import { useAppDispatch, useAppSelector } from '@/hooks/hooks';
import useDialog from '@/hooks/ui/useDialog';
import useDocumentTitle from '@/hooks/ui/useDocumentTitle';
import { CorpusenseRoutes } from '@/hooks/useAppNavigation';
import useJobRealtime from '@/hooks/useJobRealtime';
import { resetLastEvent } from '@/state/reducers/events';
import { selectLastErrorEvent, selectLastInfoEvent } from '@/state/selectors/events';
import { Mail, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../components/ui/sidebar';

const Layout = () => {
  const { t } = useTranslation();
  const appDispatch = useAppDispatch();
  const { openForm } = useDialog();
  const lastInfo = useAppSelector(selectLastInfoEvent);
  const lastError = useAppSelector(selectLastErrorEvent);
  const { pendingCount, isMigrating, migrateAll } = usePendingMigration();
  useJobRealtime();
  const titleKey = useDocumentTitle();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const needsHeading =
    [CorpusenseRoutes.MANIFEST, CorpusenseRoutes.EXPERT].includes(segments[0]) ||
    (segments[0] === CorpusenseRoutes.DOCUMENTATION && segments.length === 1);

  useEffect(() => {
    if (lastInfo !== undefined) {
      toast.success(lastInfo.message);
      appDispatch(resetLastEvent());
    }
  }, [lastInfo]);

  useEffect(() => {
    if (lastError !== undefined) {
      toast.error(lastError.message);
      appDispatch(resetLastEvent());
    }
  }, [lastError]);

  return (
    <SidebarProvider>
      <LayoutSideBar />
      <SidebarInset className='flex h-screen min-w-0 flex-col'>
        <div className='flex h-full w-full flex-col p-2'>
          <header className='flex shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12'>
            <div className='flex w-full items-center justify-between space-x-2'>
              <SidebarTrigger />
              <div className='flex gap-2'>
                <LanguageFlag />
                {pendingCount > 0 && (
                  <Button
                    variant='warning'
                    size='soft'
                    aria-label={t('btn_pending_migration', { count: pendingCount })}
                    onClick={() => void migrateAll()}
                    disabled={isMigrating}
                    title={t('migration_pending_banner', { count: '' }).trim()}
                  >
                    <RefreshCw size={16} className={isMigrating ? 'animate-spin' : ''} />
                    {isMigrating
                      ? t('migration_in_progress')
                      : t('btn_pending_migration', { count: pendingCount })}
                  </Button>
                )}
                <Button
                  variant='soft'
                  size='soft'
                  aria-label={t('btn_open_contact')}
                  onClick={() => void openForm('contactUs', {})}
                >
                  <Mail size={16} />
                  {t('btn_open_contact')}
                </Button>
              </div>
            </div>
          </header>
          <main className='min-h-0 flex-1 pt-2'>
            {needsHeading && <h1 className='sr-only'>{t(titleKey)}</h1>}
            <Outlet />
          </main>
        </div>
        <Toaster position='top-right' expand={true} richColors />
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Layout;
