import useLiveSources from '@/hooks/data/sources/useLiveSources';
import { CorpusenseRoutes } from '@/hooks/useAppNavigation';
import { Database } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ManifestThumbnail from './ManifestThumbnail';

const ManifestGrid = ({ currendManifestId }: { currendManifestId: string }) => {
  const { t } = useTranslation();
  const { remoteSources, localSources } = useLiveSources();
  const sources = [...localSources, ...remoteSources];

  const activeRef = useRef<HTMLLIElement | null>(null);

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, [currendManifestId, sources]);

  return (
    <section
      className='flex h-full w-full flex-col rounded-md bg-white/50 p-2'
      aria-label='manifest grid'
    >
      <span className='flex gap-2'>
        <Database />
        <h2 className='text-lg font-bold'>{t('nav_sources')}</h2>
      </span>

      <div className='h-full w-full flex-1 overflow-hidden'>
        <ul className='h-full w-full space-y-1 overflow-y-auto' role='list'>
          {sources?.map((source) => {
            const isActive = currendManifestId === source.id;
            return (
              <li
                ref={isActive ? activeRef : null}
                role='listitem'
                key={source.id}
                className={`flex h-16 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md border transition-colors ${isActive ? 'border-2 border-dashed border-secondary bg-primary' : 'hover:bg-muted'} `}
              >
                <Link
                  to={`/${CorpusenseRoutes.MANIFEST}?manifestId=${source.id}`}
                  className='flex h-full w-full items-center gap-2 overflow-hidden'
                >
                  <div className='max-w-20 min-w-20'>
                    <ManifestThumbnail thumbnailBlobId={source.thumbnailBlobId} />
                  </div>
                  <span className={`${isActive && 'font-black'} min-w-0 truncate`}>
                    {source.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default ManifestGrid;
