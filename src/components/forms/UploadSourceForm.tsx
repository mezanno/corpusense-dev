/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ConvertedFile } from '@/data/models/ConvertedFile';
import useConvertedFileIO from '@/hooks/data/convertedFiles/useConvertedFileIO';
import useRepository from '@/hooks/data/convertedFiles/useRepository';
import { FormProps } from '@/hooks/ui/useDialog';
import i18n from '@/i18n';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

export type UploadSourceFormParams = {
  sourceId: string;
};

type UploadSourceFormProps = FormProps & UploadSourceFormParams;

const UploadSourceForm = ({
  formRef,
  setCanSubmit,
  sourceId,
  closeDialog,
}: UploadSourceFormProps) => {
  const { t } = useTranslation();
  const { uploadToRepository, nameAlreadyExists } = useRepository();
  const { getConvertedFile } = useConvertedFileIO();
  const [convertedFile, setConvertedFile] = useState<ConvertedFile | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const cf = await getConvertedFile(sourceId);
      setConvertedFile(cf);
    };
    void loadData();
  }, [sourceId, getConvertedFile]);

  const formSchema = z
    .object({
      name: z
        .string()
        .trim()
        .min(2, { message: i18n.t('form_error_required') }),
    })
    .superRefine((data, ctx) => {
      if (nameAlreadyExists(data.name)) {
        ctx.addIssue({
          path: ['name'],
          code: 'custom',
          message: t('form_collection_name_already_exists'),
        });
      }
    });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    setCanSubmit(form.formState.isDirty && form.formState.isValid);
  }, [form.formState]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (convertedFile === null) return;
    await uploadToRepository(convertedFile, values.name);
    if (closeDialog) closeDialog();
  }

  return (
    <Form {...form}>
      <FormDescription>Vous allez mettre en ligne {convertedFile?.title}</FormDescription>
      <form onSubmit={form.handleSubmit(onSubmit)} className='w-full space-y-4' ref={formRef}>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel id='form-label'>{t('form_label_repository_name')}</FormLabel>
              <FormControl>
                <Input {...field} aria-describedby='form-label' autoFocus />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};

export default UploadSourceForm;
