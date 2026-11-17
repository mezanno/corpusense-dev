import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ElementType } from '@/data/models/annotations/annotation';
import { Collection } from '@/data/models/collection/collection';
import { useCollections } from '@/hooks/data/collections/useCollections';
import { useModels } from '@/hooks/data/models/useModels';
import useModifierChainLive from '@/hooks/data/modifiers/useModifierChainLive';
import { useTags } from '@/hooks/data/tags/useTags';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tag as FormTag, TagInput } from 'emblor';
import { debounce, uniq } from 'lodash';
import { Play } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import './taginput.css'; //permet d'enlever le background transparent du taginput

// Radix réserve la chaîne vide à l'affichage du placeholder.
const EMPTY_SELECTION = '__none__';

const formSchema = z.object({
  name: z.string(),
  tags: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
      }),
    )
    .optional(),
  about: z.string().optional(),
  modelId: z.string().optional(),
  postLayoutModifierChainId: z.string().optional(),
  postOcrModifierChainId: z.string().optional(),
});

const CollectionMetadataForm = ({ collection }: { collection: Collection }) => {
  const { models } = useModels();
  const { modifierChains, applyModifierChainToCollection } = useModifierChainLive();
  const { tags: storedTags, createNewTag } = useTags();

  const { updateCollection } = useCollections();
  //liste des tags existants dans l'application
  const autoCompleteTags = useMemo(
    () => storedTags.map((tag) => ({ id: tag.id, text: tag.label })),
    [storedTags],
  );

  //liste des tags de la collection
  const collectionTagsDefaultValue: FormTag[] = useMemo(() => {
    return collection.tags
      .map((tagId) => {
        const tag = storedTags.find((t) => t.id === tagId);
        return tag ? { id: tag.id, text: tag.label } : null;
      })
      .filter(Boolean) as FormTag[];
  }, [collection, storedTags]);
  const [tags, setTags] = useState<FormTag[]>(collectionTagsDefaultValue);

  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: collection.name,
      about: collection.about,
      tags: collectionTagsDefaultValue,
      modelId: collection.modelId,
      postLayoutModifierChainId: collection.postLayoutModifierChainId,
      postOcrModifierChainId: collection.postOcrModifierChainId,
    },
  });

  const { setValue } = form;

  const { t } = useTranslation();

  const sourceIds = uniq(collection.content.map((el) => el.sourceId));

  const handleTagAdded = async (newTags: FormTag[]) => {
    const diff = newTags.filter((tag) => !tags.some((elt) => elt.id === tag.id));
    if (diff.length > 0) {
      const newTag = { id: diff[0].id, label: diff[0].text };
      await createNewTag(newTag);

      // ajouter le tag à l'état local pour qu'il soit reconnu après reload
      setTags((prev) => [...prev, diff[0]]);

      // optionnel : si useTags ne met pas automatiquement à jour storedTags
      autoCompleteTags.push(diff[0]);
    }
  };

  const onCollection = useEffectEvent((formTags: FormTag[]) => {
    setTags(formTags);
  });

  useEffect(() => {
    form.reset({
      name: collection.name,
      about: collection.about,
      tags: collectionTagsDefaultValue,
      modelId: collection.modelId,
      postLayoutModifierChainId: collection.postLayoutModifierChainId,
      postOcrModifierChainId: collection.postOcrModifierChainId,
    });

    onCollection(collectionTagsDefaultValue);
  }, [collection]);

  useEffect(() => {
    onCollection(collectionTagsDefaultValue);
    if (!form.formState.isDirty) {
      form.setValue('tags', collectionTagsDefaultValue);
    }
  }, [collectionTagsDefaultValue]);

  const watchedValues = useWatch({
    control: form.control,
  }) as z.infer<typeof formSchema>;
  const debouncedSave = useMemo(
    () =>
      debounce(async (values: z.infer<typeof formSchema>) => {
        const updatedCollection = { ...collection };

        updatedCollection.name = values.name;
        updatedCollection.about = values.about;
        updatedCollection.modelId = values.modelId;
        updatedCollection.postLayoutModifierChainId = values.postLayoutModifierChainId;
        updatedCollection.postOcrModifierChainId = values.postOcrModifierChainId;

        if (values.tags) {
          updatedCollection.tags = values.tags.map((tag) => tag.id);
        } else {
          updatedCollection.tags = [];
        }

        await updateCollection(updatedCollection);

        // reset dirty state proprement
        form.reset(values);
      }, 600), // 600ms après la dernière modification
    [collection, updateCollection, form],
  );

  useEffect(() => {
    if (!form.formState.isDirty || watchedValues.name === undefined) return;

    void debouncedSave(watchedValues);

    return () => {
      debouncedSave.cancel();
    };
  }, [watchedValues, form.formState.isDirty, debouncedSave]);

  const applyLayoutModifiersChain = async () => {
    if (watchedValues.postLayoutModifierChainId === undefined) return;
    await applyModifierChainToCollection(
      watchedValues.postLayoutModifierChainId,
      {
        collectionId: collection.id,
      },
      ElementType.TEXT_REGION,
    );
  };

  const applyOcrModifiersChain = async () => {
    if (watchedValues.postOcrModifierChainId === undefined) return;
    await applyModifierChainToCollection(
      watchedValues.postOcrModifierChainId,
      {
        collectionId: collection.id,
      },
      ElementType.TEXT_LINE,
    );
  };

  return (
    <Form {...form}>
      <form className='mx-auto flex w-full flex-col gap-2 p-2 md:p-5'>
        <div className='flex gap-2'>
          <div className='flex w-1/2 min-w-0 flex-col gap-2'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem className='w-full'>
                  <FormLabel>{t('form_label_collection_name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('form_placeholder_collection_name')}
                      type={'text'}
                      value={field.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='about'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form_label_about')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t('form_placeholder_about')}
                      className='resize-none'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='modelId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form_label_model')}</FormLabel>
                  <Select
                    value={
                      field.value === undefined || field.value === ''
                        ? EMPTY_SELECTION
                        : field.value
                    }
                    onValueChange={(value) =>
                      field.onChange(value === EMPTY_SELECTION ? '' : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger
                        ref={field.ref}
                        onBlur={field.onBlur}
                        className='w-full min-w-0'
                      >
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECTION}>{t('form_placeholder_model')}</SelectItem>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='flex w-1/2 min-w-0 flex-col gap-2'>
            <FormField
              control={form.control}
              name='tags'
              render={({ field }) => (
                <FormItem className='flex flex-col items-start'>
                  <FormLabel className='text-left'>{t('form_label_tags')}</FormLabel>
                  <FormControl id='test'>
                    <TagInput
                      {...field}
                      placeholder={t('form_placeholder_tags')}
                      tags={tags}
                      enableAutocomplete={true}
                      autocompleteOptions={autoCompleteTags}
                      setTags={(newTags) => {
                        setTags(newTags);
                        setValue('tags', newTags as [FormTag, ...FormTag[]], { shouldDirty: true });
                        void handleTagAdded(newTags as FormTag[]);
                      }}
                      generateTagId={() => uuid()}
                      styleClasses={{ inlineTagsContainer: 'tagInputInlineContainer' }}
                      activeTagIndex={activeTagIndex}
                      setActiveTagIndex={setActiveTagIndex}
                      title={t('aria_label_tags')}
                      alt={t('aria_label_tags')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='postLayoutModifierChainId'
              render={({ field }) => (
                <FormItem className='min-w-0 grid-cols-[minmax(0,1fr)]'>
                  <FormLabel>{t('form_label_collection_postLayoutModifierChain')}</FormLabel>
                  <div className='flex gap-1'>
                    <Select
                      value={
                        field.value === undefined || field.value === ''
                          ? EMPTY_SELECTION
                          : field.value
                      }
                      onValueChange={(value) =>
                        field.onChange(value === EMPTY_SELECTION ? '' : value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className='w-full min-w-0'
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECTION}>
                          {t('form_placeholder_modifierchain')}
                        </SelectItem>
                        {modifierChains.map((chain) => (
                          <SelectItem key={chain.id} value={chain.id}>
                            {chain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type='button'
                      variant='soft'
                      size='soft'
                      onClick={() => void applyLayoutModifiersChain()}
                      title={t('btn_apply_modifiers')}
                    >
                      <Play size={16} />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='postOcrModifierChainId'
              render={({ field }) => (
                <FormItem className='min-w-0 grid-cols-[minmax(0,1fr)]'>
                  <FormLabel>{t('form_label_collection_postOcrModifierChain')}</FormLabel>
                  <div className='flex gap-1'>
                    <Select
                      value={
                        field.value === undefined || field.value === ''
                          ? EMPTY_SELECTION
                          : field.value
                      }
                      onValueChange={(value) =>
                        field.onChange(value === EMPTY_SELECTION ? '' : value)
                      }
                    >
                      <FormControl>
                        <SelectTrigger
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className='w-full min-w-0'
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECTION}>
                          {t('form_placeholder_modifierchain')}
                        </SelectItem>
                        {modifierChains.map((chain) => (
                          <SelectItem key={chain.id} value={chain.id}>
                            {chain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type='button'
                      variant='soft'
                      size='soft'
                      onClick={() => void applyOcrModifiersChain()}
                      title={t('btn_apply_modifiers')}
                    >
                      <Play size={16} />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        <div className='mt-2 flex h-full flex-col'>
          <FormLabel>{t('form_label_collection_manifest')}</FormLabel>
          <ul className='mt-1 max-h-32 flex-1 overflow-auto rounded-md border bg-primary p-2'>
            {sourceIds.map((id) => (
              <Link
                className='block break-all underline'
                key={id}
                to={`/manifest?manifestId=${id}`}
              >
                {id}
              </Link>
            ))}
          </ul>
        </div>
      </form>
    </Form>
  );
};

export default CollectionMetadataForm;
