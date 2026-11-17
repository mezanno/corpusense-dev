import ModifierChainDashboard from '@/components/features/modifiers/ModifierChainDashboard';
import ModifierChainFlow from '@/components/features/modifiers/ModifierChainFlow';
import PageHeader from '@/components/layout/PageHeader';
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Container } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ModifierChainManagerPage = () => {
  const { t } = useTranslation();
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader title={t('page_title_modifierchain_manager')} icon={Container} />
      <ModifierChainDashboard
        setSelectedChainId={setSelectedChainId}
        selectedChainId={selectedChainId}
      />
      <ResizablePanelGroup direction='horizontal' className='min-h-0 flex-1'>
        <ResizablePanel order={1} id='metadata-panel' className='flex flex-col' minSize={50}>
          {selectedChainId !== null && (
            <div className='flex h-full w-full flex-col'>
              <ModifierChainFlow initialChainId={selectedChainId} />
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ModifierChainManagerPage;
