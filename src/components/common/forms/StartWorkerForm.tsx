import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Scope } from '@/data/models/scope/scope';
import { useAppDispatch } from '@/hooks/hooks';
import { FormProps } from '@/hooks/ui/useDialog';
import { startWorkerProcessRequest } from '@/state/reducers/workers';
import { workerPlugins } from '@/state/sagas/plugins/registry';
import { zodResolver } from '@hookform/resolvers/zod';
import { ControllerRenderProps, FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import z from 'zod';

type StartWorkerFormProps = FormProps & {
  workerName: string;
  scope: Scope;
};

const StartWorkerForm = ({ workerName, scope, formRef }: StartWorkerFormProps) => {
  const { t } = useTranslation();
  const appDispatch = useAppDispatch();

  const plugin = workerPlugins[workerName];
  const paramSchema = plugin.runtimeParametersSchema! as z.ZodObject;

  const shape = paramSchema.shape as Record<string, z.ZodTypeAny>;

  const defaultValues: Partial<z.infer<typeof paramSchema>> = {};

  Object.entries(shape).forEach(([key, fieldShape]) => {
    if (fieldShape instanceof z.ZodEnum) {
      // la première option devient la valeur par défaut
      defaultValues[key] = fieldShape.options[0];
    }
  });

  const form = useForm<z.infer<typeof paramSchema>>({
    resolver: zodResolver(paramSchema),
    defaultValues,
  });

  const renderField = (
    fieldShape: z.ZodTypeAny,
    field: ControllerRenderProps<Record<string, unknown>, string>,
  ) => {
    if (fieldShape instanceof z.ZodEnum) {
      return (
        <Select
          value={
            typeof field.value === 'string' || typeof field.value === 'number'
              ? String(field.value)
              : undefined
          }
          onValueChange={field.onChange}
        >
          <FormControl>
            <SelectTrigger ref={field.ref} onBlur={field.onBlur} className='w-full'>
              <SelectValue />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            {fieldShape.options.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (fieldShape instanceof z.ZodString) {
      return (
        <FormControl>
          <Input
            type='text'
            {...field}
            value={typeof field.value === 'string' ? field.value : ''}
          />
        </FormControl>
      );
    }

    if (fieldShape instanceof z.ZodNumber) {
      return (
        <FormControl>
          <Input
            type='number'
            {...field}
            value={
              typeof field.value === 'number' || typeof field.value === 'string' ? field.value : ''
            }
          />
        </FormControl>
      );
    }

    if (fieldShape instanceof z.ZodBoolean) {
      return (
        <FormControl>
          <Checkbox
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            disabled={field.disabled}
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
        </FormControl>
      );
    }

    return <div>{t('error_unsupported_field_type')}</div>;
  };

  const onSubmit = (data: z.infer<typeof paramSchema>) => {
    appDispatch(
      startWorkerProcessRequest({
        workerName,
        params: data,
        scope,
      }),
    );
  };

  return (
    <FormProvider {...form}>
      <form
        ref={formRef}
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className='flex flex-col space-y-2'
      >
        {Object.entries(shape).map(([key, fieldShape]) => (
          <FormField
            key={key}
            name={key}
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{fieldShape.description}</FormLabel>
                {renderField(fieldShape, field)}
              </FormItem>
            )}
          />
        ))}
      </form>
    </FormProvider>
  );
};

export default StartWorkerForm;
