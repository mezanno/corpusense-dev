import QuickCanvasViewer from '@/components/features/canvasViewer/QuickCanvasViewer';
import ModelsDashboard from '@/components/features/models/ModelsDashboard';
import ModelViewer from '@/components/features/models/ModelViewer';
import PageHeader from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Container, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ModelsManagerPage = () => {
  const { t } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [canvasViewVisible, setCanvasViewVisible] = useState(false);

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader title={t('page_title_models_manager')} icon={Container} />
      <div className='flex min-h-0 flex-1 gap-2'>
        <div className='flex min-h-0 w-80 shrink-0 flex-col'>
          <ModelsDashboard
            setSelectedModelId={setSelectedModelId}
            selectedModelId={selectedModelId}
          />
        </div>
        <ResizablePanelGroup direction='horizontal' className='min-h-0 flex-1'>
          <ResizablePanel order={1} id='metadata-panel' className='flex flex-col' minSize={50}>
            {selectedModelId !== null && (
              <div className='flex h-full w-full flex-col'>
                <div className='flex w-full justify-end'>
                  <Button
                    variant='soft'
                    size='soft'
                    className={canvasViewVisible ? undefined : 'bg-transparent'}
                    title={t('btn_toggle_canvas_view')}
                    aria-label={t('btn_toggle_canvas_view')}
                    aria-pressed={canvasViewVisible}
                    onClick={() => setCanvasViewVisible((visible) => !visible)}
                  >
                    {canvasViewVisible ? <PanelRightClose /> : <PanelRightOpen />}
                  </Button>
                </div>
                <ModelViewer modelId={selectedModelId} />
              </div>
            )}
          </ResizablePanel>
          {canvasViewVisible && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id='canvas-panel' order={3} minSize={25} className='panel'>
                <QuickCanvasViewer />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default ModelsManagerPage;
