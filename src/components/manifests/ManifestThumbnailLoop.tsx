import useBlob from '@/hooks/data/sources/useBlob';
import { FileImage } from 'lucide-react';

const ManifestThumbnailLoop = ({ thumbnailBlobId }: { thumbnailBlobId: string }) => {
  const { thumbUrl } = useBlob(thumbnailBlobId);

  if (thumbUrl === null) {
    return (
      <div className='flex h-full w-full items-center justify-center bg-muted'>
        <FileImage size={48} />
      </div>
    );
  }
  return (
    <img
      src={thumbUrl}
      alt='thumbnail'
      style={{ objectFit: 'contain' }}
      aria-label='thumbnail'
      className='h-full w-full'
    />
  );
};

export default ManifestThumbnailLoop;
