import Loading from '@/components/common/Loading';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const GalleryThumbnail = ({
  url,
  isLoading,
  error,
  alt,
}: {
  url?: string;
  isLoading: boolean;
  error: string | null;
  alt: string;
}) => {
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const loaded = url !== undefined && loadedUrl === url;

  if (error !== null) return <div className='text-sm text-destructive'>{error}</div>;

  return (
    <div className='relative flex h-full w-full flex-1 items-center justify-center overflow-hidden p-1'>
      {(!loaded || isLoading || url === undefined) && (
        <div className='absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background p-2'>
          <Loading />
        </div>
      )}
      {url !== undefined && (
        <img
          src={url}
          alt={alt}
          loading='lazy'
          decoding='async'
          onLoad={() => setLoadedUrl(url)}
          onError={() => setLoadedUrl(undefined)}
          className={cn(
            'max-h-full max-w-full object-contain transition-opacity duration-200',
            loaded && !isLoading ? 'opacity-100' : 'opacity-0',
          )}
          draggable={false}
        />
      )}
    </div>
  );
};

export default GalleryThumbnail;
