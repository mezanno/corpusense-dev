/* eslint-disable @typescript-eslint/no-misused-promises */
import LogConsole from '@/components/common/logger/LogConsole';
import ProgressPanel from '@/components/common/logger/ProgressPanel';
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
import useRepository from '@/hooks/data/convertedFiles/useRepository';
import useSource from '@/hooks/data/sources/useSource';
import { FormProps } from '@/hooks/ui/useDialog';
import i18n from '@/i18n';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

export type UploadSourceFormParams = {
  sourceId: string;
};

type UploadSourceFormProps = FormProps & UploadSourceFormParams;

const UploadSourceForm = ({ formRef, setCanSubmit, sourceId }: UploadSourceFormProps) => {
  const { t } = useTranslation();
  const { uploadToRepository, nameAlreadyExists, logs, status, progress } = useRepository();
  const { sourceWithContent } = useSource(sourceId);

  const formSchema = z
    .object({
      name: z
        .string()
        .trim()
        .min(2, { message: i18n.t('form_error_required') }),
    })
    .superRefine(async (data, ctx) => {
      if (await nameAlreadyExists(data.name)) {
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
    setCanSubmit(
      form.formState.isDirty &&
        form.formState.isValid &&
        !form.formState.isValidating &&
        status !== 'processing',
    );
  }, [form.formState.isDirty, form.formState.isValid, form.formState.isValidating, status]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (sourceWithContent === undefined) return;
    await uploadToRepository(sourceWithContent, values.name);
  }

  return (
    <Form {...form}>
      <FormDescription>Vous allez mettre en ligne {sourceWithContent?.name}</FormDescription>
      <form onSubmit={form.handleSubmit(onSubmit)} className='w-full space-y-4' ref={formRef}>
        <FormField
          control={form.control}
          name='name'
          required
          render={({ field }) => (
            <FormItem>
              <FormLabel id='form-label'>{t('form_label_repository_name')}</FormLabel>
              <FormControl>
                <Input {...field} autoFocus disabled={status === 'processing'} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>

      {(status === 'processing' || progress > 0) && (
        <div className='mt-2'>
          <ProgressPanel progress={progress} />
        </div>
      )}

      {status === 'done' && (
        <div className='mt-2 flex w-full justify-center gap-2 text-success'>
          <CheckCircle />
          {t('info_done')}
        </div>
      )}

      {status === 'error' && (
        <div className='mt-2 flex w-full justify-center gap-2 text-destructive'>
          <AlertCircle />
          {t('oups')}
        </div>
      )}

      {logs.length > 0 && (
        <LogConsole className='mt-2' scrollKey={logs}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </LogConsole>
      )}
    </Form>
  );
};

export default UploadSourceForm;
