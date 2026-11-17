import ProjectSection from '@/components/features/projects/ProjectSection';
import SourceSection from '@/components/features/projects/SourceSection';
import PageHeader from '@/components/layout/PageHeader';
import { FolderKanban } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const ProjectPage = () => {
  const { t } = useTranslation();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);

  return (
    <div className='panel flex h-full min-h-0 flex-col gap-2'>
      <PageHeader title={t('page_title_project')} icon={FolderKanban} />
      <div className='grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2'>
        <ProjectSection
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
        />
        <SourceSection selectedProjectId={selectedProjectId} />
      </div>
    </div>
  );
};

export default ProjectPage;
