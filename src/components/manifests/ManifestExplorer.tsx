import { SourceWithContent } from '@/data/models/Sources';
import { Manifest } from '@iiif/presentation-3';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../ui/resizable';
import ManifestDetails from './ManifestDetails';
import ManifestGrid from './ManifestGrid';

const ManifestExplorer = ({
  source,
  manifest,
}: {
  source: SourceWithContent;
  manifest: Manifest;
}) => {
  return (
    <div className='h-full w-full'>
      <ResizablePanelGroup direction='vertical' className='gap-2'>
        <ResizablePanel minSize={33}>
          <ManifestGrid currendManifestId={source.id} />
        </ResizablePanel>
        <ResizableHandle withHandle className='w-1 cursor-col-resize bg-dark-slate-gray' />
        <ResizablePanel minSize={33}>
          <ManifestDetails manifest={manifest} source={source} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ManifestExplorer;
