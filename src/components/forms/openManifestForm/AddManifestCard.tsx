import { SourceWithContent } from '@/data/models/source/source';
import useSources from '@/hooks/data/sources/useSources';
import { zodResolver } from '@hookform/resolvers/zod';
import { IIIFExternalWebResource, Manifest } from '@iiif/presentation-3';
import { Thumbnail } from '@samvera/clover-iiif/primitives';
import { Cozy } from 'cozy-iiif';
import { Layers } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import z from 'zod';
import { Button } from '../../ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../../ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem } from '../../ui/form';
import { Input } from '../../ui/input';

interface AddManifestCardProps {
  defaultName?: string;
  existingSource?: SourceWithContent;
  loadedManifest: Manifest | undefined;
  onResult?: (sourceId: string) => void;
  closeDialog?: () => void;
}

const AddManifestCard = ({
  defaultName,
  existingSource,
  loadedManifest,
  onResult,
  closeDialog,
}: AddManifestCardProps) => {
  const { t } = useTranslation();

  const { addManifestToLibrary } = useSources();
  const addManifestFormSchema = z.object({
    manifestName: z.string().optional(),
  });

  const form = useForm<z.infer<typeof addManifestFormSchema>>({
    resolver: zodResolver(addManifestFormSchema),
    defaultValues: {
      manifestName: existingSource?.name,
    },
  });
  useEffect(() => {
    form.setValue('manifestName', defaultName ?? '');
  }, [defaultName, form]);

  const parsedManifest = Cozy.parse(loadedManifest);

  if (parsedManifest.type !== 'manifest') {
    return <p>{t('error_invalid_manifest_input')}</p>;
  }

  const customManifestName =
    parsedManifest?.type === 'manifest' && loadedManifest
      ? parsedManifest.resource.getSummary()
      : t('manifest_untitled', { date: new Date().toLocaleString() });

  async function onAddManifestSubmit(values: z.infer<typeof addManifestFormSchema>) {
    if (existingSource) {
      //dd+
    } else {
      if (parsedManifest?.type === 'manifest' && loadedManifest) {
        const name =
          values.manifestName ??
          parsedManifest.resource.getSummary() ??
          t('manifest_untitled', { date: new Date().toLocaleString() });
        const newSourceId = await addManifestToLibrary(loadedManifest, name);
        onResult?.(newSourceId);
        if (closeDialog) closeDialog();
      }
    }
  }

  return (
    <Card className='bg-white p-1 text-secondary-foreground'>
      <CardHeader className='text-center font-semibold italic'>
        {t('title_load_manifest_step_2')}
      </CardHeader>
      <CardContent className='flex items-center gap-2'>
        {loadedManifest?.thumbnail !== undefined && (
          <Thumbnail
            thumbnail={loadedManifest.thumbnail as IIIFExternalWebResource[]}
            className='max-h-40 object-fill'
          />
        )}
        <div className='flex flex-col'>
          <span className='text-sm font-bold'>{parsedManifest.resource.getSummary()}</span>
          <span className='text-xs'>{parsedManifest.resource.getLabel()}</span>
          <span className='flex items-center gap-1 text-xs'>
            <Layers size={14} />
            {parsedManifest.resource.canvases.length} pages
          </span>
        </div>
      </CardContent>
      <CardFooter className='flex flex-col'>
        <Form {...form}>
          <FormDescription>{t('form_description_manifest_rename')}</FormDescription>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onAddManifestSubmit)}
            className='flex w-full flex-col items-center space-y-2'
          >
            <FormField
              control={form.control}
              name='manifestName'
              render={({ field }) => (
                <FormItem className='w-full'>
                  <FormControl>
                    <Input
                      {...field}
                      className='w-full'
                      placeholder={customManifestName ?? t('form_placeholder_manifest_name')}
                      onChange={field.onChange}
                      onInput={field.onChange}
                      autoFocus
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type='submit' className='soft-button w-full' disabled={!form.formState.isValid}>
              {t('btn_add_manifest_to_library')}
            </Button>
          </form>
        </Form>
      </CardFooter>
    </Card>
  );
};

export default AddManifestCard;
