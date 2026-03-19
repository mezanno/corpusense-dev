import ProjectSection from '@/components/simpleView/ProjectSection';
import SourceSection from '@/components/simpleView/SourceSection';
import { useState } from 'react';

const ProjectPage = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  return (
    <div className='h-full w-full'>
      <div className='grid h-full w-full grid-cols-2 grid-rows-3 gap-4'>
        <ProjectSection
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
        />
        <SourceSection selectedProjectId={selectedProjectId} />
        <div className='h-full w-full border'>Collections</div>
        <div className='h-full w-full border'>Modèles</div>
        <div className='h-full w-full border'>Traitements</div>
      </div>
    </div>
  );
};

export default ProjectPage;
