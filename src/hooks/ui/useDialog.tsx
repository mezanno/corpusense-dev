import ContactForm from '@/components/common/forms/ContactForm';
import ConvertPdfForm from '@/components/common/forms/ConvertPdfForm';
import DuplicateCollectionForm from '@/components/common/forms/DuplicateCollectionForm';
import DuplicateLayoutForm from '@/components/common/forms/DuplicateLayoutForm';
import ExportCollectionForm from '@/components/common/forms/ExportCollectionForm';
import ExportFormatSelectionForm from '@/components/common/forms/ExportFormatSelectionForm';
import ImportCollectionForm from '@/components/common/forms/ImportCollectionForm';
import ImportModelForm from '@/components/common/forms/ImportModelForm';
import LLMProfileForm, { LLMProfileFormValues } from '@/components/common/forms/LLMProfileForm';
import LoadModifierChainForm from '@/components/common/forms/LoadModifierChainForm';
import LoginForm from '@/components/common/forms/LoginForm';
import NewCollectionForm, {
  NewCollectionFormParams,
} from '@/components/common/forms/NewCollectionForm';
import NewModelForm from '@/components/common/forms/NewModelForm';
import NewProjectForm from '@/components/common/forms/NewProjectForm';
import OpenManifestForm from '@/components/common/forms/openManifestForm/OpenManifestForm';
import RemoveAnnotationsForm from '@/components/common/forms/RemoveAnnotationsForm';
import SaveModifierChainForm from '@/components/common/forms/SaveModifierChainForm';
import SelectLlmForm from '@/components/common/forms/SelectLlmForm';
import StartWorkerForm from '@/components/common/forms/StartWorkerForm';
import UpdateSourceNameForm from '@/components/common/forms/UpdateSourceNameForm';
import UploadSourceForm, {
  UploadSourceFormParams,
} from '@/components/common/forms/UploadSourceForm';
import ModelPreview from '@/components/features/models/ModelPreview';
import ModelUsageList from '@/components/features/models/ModelUsageList';
import { useAlertDialogContext } from '@/components/reducers/useAlertDialogContext';
import { CollectionDetails } from '@/data/models/collection/collection';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { LLMProfile } from '@/data/models/LLMProfile';
import { AnyModifier } from '@/data/models/modifiers/Modifier';
import { Project } from '@/data/models/project';
import { CanvasScope, Scope } from '@/data/models/scope/scope';
import { Source, SourceWithContent } from '@/data/models/source/source';
import { Worker } from '@/data/models/worker/worker';
import { ModifierChainData } from '@/data/utils/modifierChain';
import { workerPlugins } from '@/state/sagas/plugins/registry';
import { createRef, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';

export type FormProps<TResult = unknown> = {
  formRef: RefObject<HTMLFormElement | null>;
  setCanSubmit: (can: boolean) => void;
  closeDialog?: () => void;
  onResult?: (result: TResult) => void;
};

type DialogFormProps = {
  importCollection: Record<string, never>;
  newCollection: { params?: NewCollectionFormParams };
  duplicateCollection: { collection: CollectionDetails };
  selectFormat: { worker: Worker };
  selectLlm: Record<string, never>;
  login: Record<string, never>;
  openManifest: { existingSource?: SourceWithContent };
  convertPdf: Record<string, never>;
  contactUs: Record<string, never>;
  importModel: Record<string, never>;
  createModel: Record<string, never>;
  removeAnnotations: { scope: Scope };
  duplicateLayout: { scope: CanvasScope };
  exportCollection: { collectionIds: string[] };
  saveModifierChain: {
    modifiers: AnyModifier[];
    modifiersValues: Record<string, unknown>;
    name?: string;
  };
  loadModifierChain: Record<string, never>;
  startWorker: { workerName: string; scope: Scope };
  uploadSource: UploadSourceFormParams;
  createProject: Record<string, never>;
  changeSourceName: { source: Source };
  addLlmProfile: Record<string, never>;
  editLlmProfile: { profile: LLMProfile };
};

type DialogFormResult = {
  importCollection: void;
  newCollection: void;
  duplicateCollection: void;
  selectFormat: void;
  selectLlm: string;
  login: void;
  openManifest: string;
  convertPdf: string;
  contactUs: void;
  importModel: void;
  createModel: void;
  removeAnnotations: void;
  duplicateLayout: void;
  exportCollection: void;
  saveModifierChain: void;
  loadModifierChain: ModifierChainData;
  startWorker: void;
  uploadSource: void;
  createProject: Project;
  changeSourceName: true;
  addLlmProfile: LLMProfileFormValues;
  editLlmProfile: LLMProfileFormValues;
};

type DialogFormName = keyof DialogFormProps;
type DialogFormDefinition<Props, Result> = {
  title: (props: Props) => string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeOnAction?: boolean;
  expectsResult: boolean;
  render: (
    props: Props,
    formRef: RefObject<HTMLFormElement | null>,
    onResult: (result: Result) => void,
  ) => ReactNode;
};

const useDialog = () => {
  const { t } = useTranslation();
  const { openDialog, setCanSubmit, closeDialog } = useAlertDialogContext();

  const formRegistry = {
    importCollection: {
      title: () => t('btn_import_collection'),
      confirmLabel: t('btn_import_collection'),
      closeOnAction: false,
      expectsResult: false,
      render: (_props, formRef) => (
        <ImportCollectionForm formRef={formRef} setCanSubmit={setCanSubmit} />
      ),
    },
    newCollection: {
      title: () => t('btn_create_collection'),
      confirmLabel: t('btn_create'),
      expectsResult: false,
      render: ({ params }, formRef) => (
        <NewCollectionForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          {...params}
          closeDialog={closeDialog}
        />
      ),
    },
    duplicateCollection: {
      title: ({ collection }) => t('title_duplicate_collection', { name: collection.name }),
      confirmLabel: t('btn_duplicate'),
      expectsResult: false,
      render: ({ collection }, formRef) => (
        <DuplicateCollectionForm
          collection={collection}
          formRef={formRef}
          setCanSubmit={setCanSubmit}
        />
      ),
    },
    selectFormat: {
      title: ({ worker }) => t('title_export_worker_result', { name: worker.name }),
      confirmLabel: t('btn_export'),
      expectsResult: false,
      render: ({ worker }, formRef) => (
        <ExportFormatSelectionForm worker={worker} formRef={formRef} setCanSubmit={setCanSubmit} />
      ),
    },
    selectLlm: {
      title: () => t('title_select_llm'),
      confirmLabel: t('btn_start'),
      expectsResult: true,
      render: (_props, formRef, onResult) => (
        <SelectLlmForm formRef={formRef} setCanSubmit={setCanSubmit} onResult={onResult} />
      ),
    },
    login: {
      title: () => t('title_login'),
      confirmLabel: t('btn_login'),
      closeOnAction: false,
      expectsResult: false,
      render: (_props, formRef) => (
        <LoginForm formRef={formRef} setCanSubmit={setCanSubmit} closeDialog={closeDialog} />
      ),
    },
    openManifest: {
      title: ({ existingSource }) =>
        existingSource === undefined ? t('btn_open_manifest') : t('title_rename_source'),
      cancelLabel: t('btn_close'),
      closeOnAction: false,
      expectsResult: true,
      render: ({ existingSource }, formRef, onResult) => (
        <OpenManifestForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          closeDialog={closeDialog}
          onResult={onResult}
          existingSource={existingSource}
        />
      ),
    },
    convertPdf: {
      title: () => t('title_import_pdf'),
      expectsResult: true,
      render: (_props, formRef, onResult) => (
        <ConvertPdfForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          closeDialog={closeDialog}
          onResult={onResult}
        />
      ),
    },
    contactUs: {
      title: () => t('title_contact'),
      confirmLabel: t('btn_send'),
      closeOnAction: false,
      expectsResult: false,
      render: (_props, formRef) => (
        <ContactForm formRef={formRef} setCanSubmit={setCanSubmit} closeDialog={closeDialog} />
      ),
    },
    importModel: {
      title: () => t('btn_import_model'),
      confirmLabel: t('btn_import_model'),
      closeOnAction: false,
      expectsResult: false,
      render: (_props, formRef) => (
        <ImportModelForm formRef={formRef} setCanSubmit={setCanSubmit} closeDialog={closeDialog} />
      ),
    },
    createModel: {
      title: () => t('btn_create_model'),
      confirmLabel: t('btn_create'),
      expectsResult: false,
      render: (_props, formRef) => <NewModelForm formRef={formRef} setCanSubmit={setCanSubmit} />,
    },
    removeAnnotations: {
      title: () => t('title_remove_annotations'),
      confirmLabel: t('btn_delete'),
      expectsResult: false,
      render: ({ scope }, formRef) => (
        <RemoveAnnotationsForm formRef={formRef} scope={scope} setCanSubmit={setCanSubmit} />
      ),
    },
    duplicateLayout: {
      title: () => t('btn_duplicate_regions'),
      confirmLabel: t('btn_apply'),
      expectsResult: false,
      render: ({ scope }, formRef) => (
        <DuplicateLayoutForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          closeDialog={closeDialog}
          scope={scope}
        />
      ),
    },
    exportCollection: {
      title: () => t('btn_export_collection'),
      confirmLabel: t('btn_export'),
      closeOnAction: false,
      expectsResult: false,
      render: ({ collectionIds }, formRef) => (
        <ExportCollectionForm
          formRef={formRef}
          collectionIds={collectionIds}
          setCanSubmit={setCanSubmit}
        />
      ),
    },
    saveModifierChain: {
      title: () => t('btn_save_modifierchain'),
      confirmLabel: t('btn_save'),
      expectsResult: false,
      render: ({ modifiers, modifiersValues, name }, formRef) => (
        <SaveModifierChainForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          modifiers={modifiers}
          modifierValues={modifiersValues}
          name={name}
        />
      ),
    },
    loadModifierChain: {
      title: () => t('btn_load_modifiers'),
      confirmLabel: t('btn_open'),
      expectsResult: true,
      render: (_props, formRef, onResult) => (
        <LoadModifierChainForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          closeDialog={closeDialog}
          onResult={onResult}
        />
      ),
    },
    startWorker: {
      title: ({ workerName }) => {
        const plugin = workerPlugins[workerName];
        return `${t('btn_start_analysis')} - ${plugin.info.displayName}`;
      },
      confirmLabel: t('btn_start'),
      expectsResult: false,
      render: ({ workerName, scope }, formRef) => (
        <StartWorkerForm
          formRef={formRef}
          scope={scope}
          workerName={workerName}
          setCanSubmit={setCanSubmit}
        />
      ),
    },
    uploadSource: {
      title: () => t('btn_upload_to_cloud'),
      confirmLabel: t('btn_upload'),
      closeOnAction: false,
      expectsResult: false,
      render: (props, formRef) => (
        <UploadSourceForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          {...props}
          closeDialog={closeDialog}
        />
      ),
    },
    createProject: {
      title: () => t('btn_create_project'),
      confirmLabel: t('bnt_create_project'),
      expectsResult: true,
      render: (_props, formRef, onResult) => (
        <NewProjectForm formRef={formRef} setCanSubmit={setCanSubmit} onResult={onResult} />
      ),
    },
    changeSourceName: {
      title: () => t('title_rename_source'),
      confirmLabel: t('btn_rename'),
      expectsResult: true,
      render: ({ source }, formRef, onResult) => (
        <UpdateSourceNameForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          source={source}
          onResult={() => onResult(true)}
        />
      ),
    },
    addLlmProfile: {
      title: () => t('dialog_llm_profile_add'),
      confirmLabel: t('btn_save'),
      expectsResult: true,
      render: (_props, formRef, onResult) => (
        <LLMProfileForm formRef={formRef} setCanSubmit={setCanSubmit} onResult={onResult} />
      ),
    },
    editLlmProfile: {
      title: () => t('dialog_llm_profile_edit'),
      confirmLabel: t('btn_save'),
      expectsResult: true,
      render: ({ profile }, formRef, onResult) => (
        <LLMProfileForm
          formRef={formRef}
          setCanSubmit={setCanSubmit}
          onResult={onResult}
          defaultValues={profile}
        />
      ),
    },
  } satisfies {
    [K in DialogFormName]: DialogFormDefinition<DialogFormProps[K], DialogFormResult[K]>;
  };

  const openForm = <K extends DialogFormName>(
    name: K,
    props: DialogFormProps[K],
  ): Promise<DialogFormResult[K] | undefined> => {
    const definition = formRegistry[name] as DialogFormDefinition<
      DialogFormProps[K],
      DialogFormResult[K]
    >;
    if (name === 'startWorker') {
      const { workerName } = props as DialogFormProps['startWorker'];
      const plugin = workerPlugins[workerName];
      if (plugin.runtimeParametersSchema === undefined) {
        console.error(`Plugin ${workerName} does not have a runtime parameters schema`);
        return Promise.resolve(undefined);
      }
    }

    return new Promise((resolve) => {
      const finish = (result: unknown) => resolve(result as DialogFormResult[K] | undefined);
      const formRef = createRef<HTMLFormElement>();
      openDialog({
        title: definition.title(props),
        children: definition.render(props, formRef, finish),
        onConfirmComplete: () => {
          if (!definition.expectsResult) finish(undefined);
        },
        onDismiss: () => finish(undefined),
        onConfirm:
          definition.confirmLabel === undefined
            ? undefined
            : {
                message: definition.confirmLabel,
                action: () => formRef.current?.requestSubmit(),
                closeOnAction: definition.closeOnAction,
              },
        onCancel:
          definition.cancelLabel === undefined
            ? undefined
            : { message: definition.cancelLabel, action: closeDialog },
      });
    });
  };

  const openModelPreviewDialog = (model: DataModel) => {
    openDialog({
      title: t('btn_model_preview'),
      description: t('info_preview_model'),
      children: <ModelPreview model={model} />,
    });
  };

  const openModelUsageList = (model: DataModel) => {
    openDialog({
      title: t('title_model_usage'),
      description: t('info_model_usage'),
      children: <ModelUsageList modelId={model.id} />,
    });
  };

  return { openForm, openModelPreviewDialog, openModelUsageList };
};

export default useDialog;
