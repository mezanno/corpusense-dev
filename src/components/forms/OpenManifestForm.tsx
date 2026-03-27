import useLoadManifest from '@/hooks/data/manifests/useLoadManifest';
import { FormProps } from '@/hooks/ui/useDialog';
import i18n from '@/i18n';
import { zodResolver } from '@hookform/resolvers/zod';
import { IIIFExternalWebResource, Manifest } from '@iiif/presentation-3';
import { Thumbnail } from '@samvera/clover-iiif/primitives';
import { Cozy } from 'cozy-iiif';
import { Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import Loading from '../Loading';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const loadManifestFormSchema = z.object({
  manifestInput: z.string().nonempty({ message: i18n.t('form_error_required') }),
});

const addManifestFormSchema = z.object({
  manifestName: z.string().optional(),
});

const OpenManifestForm = ({ closeDialog, onResult }: FormProps<string>) => {
  const { t } = useTranslation();
  const { fetchManifest, addManifestToLibrary } = useLoadManifest();
  const [loadedManifest, setLoadedManifest] = useState<Manifest | null>(null);

  const parsedManifest = loadedManifest ? Cozy.parse(loadedManifest) : null;

  const error = '';
  const isLoading = false;

  const loadManifestForm = useForm<z.infer<typeof loadManifestFormSchema>>({
    resolver: zodResolver(loadManifestFormSchema),
    mode: 'all',
  });

  const addManifestForm = useForm<z.infer<typeof addManifestFormSchema>>({
    resolver: zodResolver(addManifestFormSchema),
  });

  useEffect(() => {
    if (parsedManifest?.type === 'manifest') {
      addManifestForm.setValue('manifestName', parsedManifest.resource.getSummary() ?? '');
    }
  }, [parsedManifest]);

  async function onAddManifestSubmit(values: z.infer<typeof addManifestFormSchema>) {
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

  let manifestCard = null;

  if (loadedManifest) {
    const parsed = Cozy.parse(loadedManifest);
    if (parsed.type !== 'manifest') {
      manifestCard = <p>{i18n.t('error_invalid_manifest_input')}</p>;
    } else {
      manifestCard = (
        <Card className='bg-white p-1 text-secondary-foreground'>
          <CardHeader className='text-center font-semibold italic'>
            {t('title_load_manifest_step_2')}
          </CardHeader>
          <CardContent className='flex items-center gap-2'>
            {loadedManifest.thumbnail && (
              <Thumbnail
                thumbnail={loadedManifest.thumbnail as IIIFExternalWebResource[]}
                className='max-h-40 object-fill'
              />
            )}
            <div className='flex flex-col'>
              <span className='text-sm font-bold'>{parsed.resource.getSummary()}</span>
              <span className='text-xs'>{parsed.resource.getLabel()}</span>
              <span className='flex items-center gap-1 text-xs'>
                <Layers size={14} />
                {parsed.resource.canvases.length} pages
              </span>
            </div>
          </CardContent>
          <CardFooter className='flex flex-col'>
            <Form {...addManifestForm}>
              <FormDescription>{t('form_description_manifest_rename')}</FormDescription>
              <form
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={addManifestForm.handleSubmit(onAddManifestSubmit)}
                className='flex w-full flex-col items-center space-y-2'
              >
                <FormField
                  control={addManifestForm.control}
                  name='manifestName'
                  render={({ field }) => (
                    <FormItem className='w-full'>
                      <FormControl>
                        <Input
                          {...field}
                          className='w-full'
                          placeholder={t('form_placeholder_manifest_name')}
                          onChange={field.onChange}
                          onInput={field.onChange}
                          autoFocus
                        />
                      </FormControl>
                      {/* <FormMessage>{error}</FormMessage> */}
                    </FormItem>
                  )}
                />
                <button type='submit' className='soft-button w-full'>
                  {t('btn_add_manifest_to_library')}
                </button>
              </form>
            </Form>
          </CardFooter>
        </Card>
      );
    }
  }

  if (isLoading) {
    return <Loading />;
  }

  async function onLoadManifestSubmit(values: z.infer<typeof loadManifestFormSchema>) {
    setLoadedManifest(null);
    const newManifest = await fetchManifest(values.manifestInput);

    if (newManifest) {
      setLoadedManifest(newManifest);
    }
  }

  return (
    <div className='flex h-full w-full flex-col gap-2'>
      <Card className='bg-white p-1 text-secondary-foreground'>
        <CardHeader className='text-center font-semibold italic'>
          {t('title_load_manifest_step_1')}
        </CardHeader>
        <CardContent className='flex flex-col items-center gap-2'>
          <span className='text-left text-sm font-light not-italic'>
            {t('info_drawer_description')}
          </span>
          <Form {...loadManifestForm}>
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={loadManifestForm.handleSubmit(onLoadManifestSubmit)}
              className='flex w-full flex-col items-center space-y-2'
            >
              <FormField
                control={loadManifestForm.control}
                name='manifestInput'
                render={({ field }) => (
                  <FormItem className='w-full'>
                    <FormControl>
                      <Textarea
                        {...field}
                        className='max-h-3.5 w-full resize-none'
                        placeholder={t('form_placeholder_manifest_content')}
                        onChange={field.onChange}
                        onInput={field.onChange}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage>{error}</FormMessage>
                  </FormItem>
                )}
              />
              <button type='submit' className='soft-button w-full'>
                {t('btn_open_manifest')}
              </button>
            </form>
          </Form>
        </CardContent>
      </Card>
      {manifestCard}
    </div>
  );
};

export default OpenManifestForm;
