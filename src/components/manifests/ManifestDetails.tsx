import { SourceWithContent } from '@/data/models/Sources';
import { InternationalString, Manifest } from '@iiif/presentation-3';
import { Label, Summary } from '@samvera/clover-iiif/primitives';
import { Cozy } from 'cozy-iiif';
import { useTranslation } from 'react-i18next';
import ManifestThumbnail from './ManifestThumbnail';
import './metadata.css';

const ManifestDetails = ({
  source,
  manifest,
}: {
  source: SourceWithContent;
  manifest: Manifest;
}) => {
  const { t } = useTranslation();

  const parsed = Cozy.parse(manifest);
  const summary = parsed.type === 'manifest' ? parsed.resource.getSummary() : undefined;

  return (
    <section
      className='flex h-full w-full flex-col items-center justify-center space-y-2 rounded-md bg-white/50 p-2'
      aria-label='manifest details'
    >
      <div className='flex h-full w-full flex-col items-center space-y-2'>
        <h2 className='text-lg font-bold'>{t('title_currently_open')}</h2>
        <h3 className='text-center text-lg font-bold italic'>{source.name}</h3>
        {source.name !== summary && (
          <div className='w-full text-center text-sm italic'>
            <span>{t('info_original_name')}</span>
            <Summary summary={manifest.summary as InternationalString} className='font-semibold' />
          </div>
        )}
        <div className='h-48'>
          <ManifestThumbnail thumbnailBlobId={source.thumbnailBlobId} />
        </div>
        <Label label={manifest.label ?? { none: [''] }} as='h3' className='text-center' />
        <h4 className='w-full text-sm font-bold wrap-break-word'>{manifest.id}</h4>
        {/* <section className='w-full rounded-md border p-2' aria-labelledby='metadata_gallica'>
          <h3 id='metadata_gallica' className='text-xl'>
            {t('title_metadata_gallica')}
          </h3>
          <ScrollArea className='h-72 w-full whitespace-nowrap'>
            <Metadata metadata={manifest.metadata as MetadataItem[]} className='overflow-hidden' />
            <ScrollBar orientation='horizontal' />
          </ScrollArea>
        </section> */}
        {/* {experimentalFeaturesActivated && (
          <section className='w-full rounded-md border p-2' aria-labelledby='metadata_corpusense'>
            <h3 id='metadata_corpusense' className='text-xl'>
              {t('title_metadata_corpusense')}
            </h3>
            <ScrollArea className='h-72 w-full whitespace-nowrap'>
              <MetadataTable manifestId={manifest.id} />
              <ScrollBar orientation='horizontal' />
            </ScrollArea>
          </section>
        )} */}
      </div>
    </section>
  );
};

export default ManifestDetails;
