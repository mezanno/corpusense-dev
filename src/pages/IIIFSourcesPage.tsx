import IIIFSourcesDashboard from '@/components/features/storage/IIIFSourcesDashboard';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import useLiveSources from '@/hooks/data/sources/useLiveSources';
import { Ellipsis, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const IIIFSourcesPage = () => {
  const { t } = useTranslation();
  const { removeUnusedSources } = useLiveSources();

  const handleRemoveUnusedSources = async () => {
    await removeUnusedSources();
  };

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader
        title={t('page_title_iiif_storage')}
        icon={Globe}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='icon' aria-label={t('btn_actions')}>
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void handleRemoveUnusedSources()}>
                  {t('btn_remove_unused_sources')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <IIIFSourcesDashboard />
    </div>
  );
};

export default IIIFSourcesPage;
