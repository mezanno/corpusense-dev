import manifestFixture from '@/__tests__/manifest.json';
import { renderWithProviders } from '@/__tests__/utils';
import { CollectionDetails } from '@/data/models/collection/collection';
import { DataModel } from '@/data/models/dataModel/dataModel';
import { LLMProfile } from '@/data/models/LLMProfile';
import { Source, SourceWithContent } from '@/data/models/source/source';
import { Worker, WorkerStatus } from '@/data/models/worker/worker';
import { makeCollection, resetTestDbBeforeEach, seedCollection } from '@/hooks/__tests__/harness';
import useDialog from '@/hooks/ui/useDialog';
import { initializePluginRegistries } from '@/state/sagas/plugins/registry';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Les formulaires rendus par le registre sont des composants (couverture propre
// ailleurs) : seuls des bouchons légers, posés à la frontière hook → composant,
// permettent d'observer le contrat du registre — la ref qui lui est allouée,
// `requestSubmit` déclenché par le bouton de confirmation, le rappel `onResult`,
// `setCanSubmit` et `closeDialog` qui lui sont passés. Le contexte de dialogue,
// le registre de plugins et le store restent réels.
//
// Lot 21 : les entrées du registre encore jamais ouvertes sont rendues avec leurs
// VRAIS composants de formulaire (aucun bouchon ajouté) sur le stack réel — base
// Dexie réinitialisée par `resetTestDbBeforeEach` — et les deux dialogues de
// contenu (`openModelPreviewDialog`, `openModelUsageList`) sont vérifiés par le
// rendu attendu de leur contenu : vue du schéma généré, collections filtrées par
// `modelId` après écriture par le vrai repository. Ces deux-là rendent via
// `renderWithProviders`, dont l'ordre des providers est celui de la production
// depuis le lot 41 (routeur au-dessus de tout) — la reconstruction locale de cet
// ordre faite aux lots 20-21 est devenue caduque et a été supprimée avec elle.
// La branche `startWorker` « avec schéma
// runtime » exige les plugins expérimentaux : le drapeau est activé dans le
// localStorage AVANT `initializePluginRegistries()` (seul chemin par lequel le
// chargeur réel les enregistre), puis retiré pour que le reste des tests voie
// l'app par défaut.
//
// Chemins résiduels justifiés : aucun — les lots 20 et 21 ensemble couvrent
// l'intégralité de `useDialog.tsx` (lignes, branches, fonctions) ; voir le rapport
// de lot 21 pour l'audit du lot 38.
vi.mock('@/components/common/forms/ImportCollectionForm', () => ({
  default: () => <div />,
}));

vi.mock('@/components/common/forms/SelectLlmForm', () => ({
  default: ({
    formRef,
    onResult,
  }: {
    formRef: React.RefObject<HTMLFormElement | null>;
    onResult: (result: string) => void;
  }) => (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        onResult('profile-1');
      }}
    />
  ),
}));

vi.mock('@/components/common/forms/UpdateSourceNameForm', () => ({
  default: ({
    formRef,
    onResult,
  }: {
    formRef: React.RefObject<HTMLFormElement | null>;
    onResult: () => void;
  }) => (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        onResult();
      }}
    />
  ),
}));

vi.mock('@/components/common/forms/ExportCollectionForm', () => ({
  default: ({
    formRef,
    setCanSubmit,
  }: {
    formRef: React.RefObject<HTMLFormElement | null>;
    setCanSubmit: (can: boolean) => void;
  }) => (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        // Marqueur DOM : prouve que `requestSubmit` a bien atteint le formulaire
        // monté pour CETTE ouverture (la ref allouée par `openForm`).
        event.currentTarget.append('submitted');
      }}
    >
      <button onClick={() => setCanSubmit(false)} type='button'>
        Disable submit
      </button>
      <button onClick={() => setCanSubmit(true)} type='button'>
        Enable submit
      </button>
    </form>
  ),
}));

vi.mock('@/components/common/forms/openManifestForm/OpenManifestForm', () => ({
  default: ({ onResult }: { onResult: (result: string) => void }) => (
    <button onClick={() => onResult('https://example.org/manifest.json')} type='button'>
      Submit manifest
    </button>
  ),
}));

// Le registre `workerPlugins` est peuplé par `main.tsx` en production ; on
// initialise le vrai registre pour la garde de `openForm('startWorker', …)`.
// Les deux plugins qui déclarent un `runtimeParametersSchema` (`layoutExtraction`,
// `customWorker`) sont marqués expérimentaux : `loadWorkerPlugins` ne les charge
// que si le drapeau est activé au moment de l'initialisation.
beforeAll(() => {
  localStorage.setItem('experimentalFeatures', 'true');
  initializePluginRegistries();
  localStorage.removeItem('experimentalFeatures');
});

const DialogHarness = () => {
  const { openForm } = useDialog();
  const [result, setResult] = useState<string>('pending');

  return (
    <>
      <button
        onClick={() =>
          void openForm('selectLlm', {}).then((value) => setResult(value ?? 'cancelled'))
        }
      >
        Open result form
      </button>
      <button
        onClick={() => void openForm('importCollection', {}).then(() => setResult('confirmed'))}
      >
        Open action form
      </button>
      <output>{result}</output>
    </>
  );
};

const TEST_SOURCE: Source = {
  id: 'source-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Source de test',
  type: 'local',
  pageCount: 2,
  thumbnailBlobId: 'thumbnail-1',
};

// Le manifest fixture sert à fabriquer une source avec contenu ; seule son
// existence compte pour le titre du dialogue `openManifest`.
const TEST_SOURCE_WITH_CONTENT: SourceWithContent = {
  ...TEST_SOURCE,
  type: 'remote',
  content: { id: 'content-1', type: 'remote', manifest: manifestFixture },
} as unknown as SourceWithContent;

const formatResult = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'boolean' ? String(value) : 'undefined';

// Harness du registre : chaque clic ouvre un formulaire du registre et append
// la valeur résolue de sa promesse à la liste affichée, pour distinguer les
// résolutions de plusieurs ouvertures successives.
const RegistryHarness = () => {
  const { openForm } = useDialog();
  const [results, setResults] = useState<string[]>([]);

  const track = (promise: Promise<unknown>) => {
    void promise.then((value) => setResults((current) => [...current, formatResult(value)]));
  };

  return (
    <>
      <button onClick={() => track(openForm('selectLlm', {}))}>Open result form</button>
      <button onClick={() => track(openForm('changeSourceName', { source: TEST_SOURCE }))}>
        Open rename form
      </button>
      <button onClick={() => track(openForm('openManifest', {}))}>Open manifest form</button>
      <button
        onClick={() =>
          track(openForm('openManifest', { existingSource: TEST_SOURCE_WITH_CONTENT }))
        }
      >
        Open manifest rename form
      </button>
      <button
        onClick={() => track(openForm('exportCollection', { collectionIds: ['collection-1'] }))}
      >
        Open export form
      </button>
      <button
        onClick={() =>
          track(
            openForm('startWorker', {
              workerName: 'openai',
              scope: { collectionId: 'collection-1' },
            }),
          )
        }
      >
        Open schemaless worker form
      </button>
      <button
        onClick={() =>
          track(
            openForm('startWorker', {
              workerName: 'layoutExtraction',
              scope: { collectionId: 'collection-1' },
            }),
          )
        }
      >
        Open worker form with schema
      </button>
      {results.map((value, index) => (
        <output key={index}>{value}</output>
      ))}
    </>
  );
};

const resolvedValues = () =>
  screen.getAllByRole('status').map((output) => output.textContent ?? '');

// ---------------------------------------------------------------------------
// Lot 21 — catalogue complet du registre et dialogues de contenu
// ---------------------------------------------------------------------------

const TEST_COLLECTION: CollectionDetails = {
  id: 'collection-1',
  name: 'Collection à dupliquer',
  tags: [],
  contentSize: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TEST_WORKER: Worker = {
  id: 'worker-1',
  name: 'worker-1',
  scope: { collectionId: 'collection-1' },
  params: {},
  scopeKey: 'collection-1',
  status: WorkerStatus.INPROGRESS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  estimatedDuration: 0,
  queue: [],
};

const TEST_PROFILE: LLMProfile = {
  id: 'profile-1',
  name: 'Profil de test',
  baseUrl: 'https://example.org/v1',
  apiKey: 'cle-de-test',
  model: 'modele-1',
};

// Modèle minimal mais complet : `generateSchema` l'exploite pour la vue JSON du
// dialogue d'aperçu, et `modelId` sert de discriminant au dialogue d'usage.
const TEST_MODEL: DataModel = {
  id: 'model-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Modèle de test',
  prompt: 'invite de test',
  fields: [{ id: 'field-1', name: 'champ-apercu', type: 'string', color: '#123456' }],
};

type OpenFormFn = ReturnType<typeof useDialog>['openForm'];

// Entrées du registre jamais ouvertes par le lot 20 : chacune est montée ici
// avec ses vrais composants pour atteindre ses lambdas `title`/`render`.
const CATALOG_ENTRIES: ReadonlyArray<{
  label: string;
  entryTitle: string;
  open: (openForm: OpenFormFn) => Promise<unknown>;
}> = [
  {
    label: 'Open new collection',
    entryTitle: 'btn_create_collection',
    open: (openForm) => openForm('newCollection', {}),
  },
  {
    label: 'Open duplicate collection',
    entryTitle: 'title_duplicate_collection',
    open: (openForm) => openForm('duplicateCollection', { collection: TEST_COLLECTION }),
  },
  {
    label: 'Open export formats',
    entryTitle: 'title_export_worker_result',
    open: (openForm) => openForm('selectFormat', { worker: TEST_WORKER }),
  },
  { label: 'Open login', entryTitle: 'title_login', open: (openForm) => openForm('login', {}) },
  {
    label: 'Open convert pdf',
    entryTitle: 'title_import_pdf',
    open: (openForm) => openForm('convertPdf', {}),
  },
  {
    label: 'Open contact us',
    entryTitle: 'title_contact',
    open: (openForm) => openForm('contactUs', {}),
  },
  {
    label: 'Open import model',
    entryTitle: 'btn_import_model',
    open: (openForm) => openForm('importModel', {}),
  },
  {
    label: 'Open create model',
    entryTitle: 'btn_create_model',
    open: (openForm) => openForm('createModel', {}),
  },
  {
    label: 'Open remove annotations',
    entryTitle: 'title_remove_annotations',
    open: (openForm) => openForm('removeAnnotations', { scope: { collectionId: 'collection-1' } }),
  },
  {
    label: 'Open duplicate layout',
    entryTitle: 'btn_duplicate_regions',
    open: (openForm) =>
      openForm('duplicateLayout', {
        scope: { collectionId: 'collection-1', canvasId: 'canvas-1' },
      }),
  },
  {
    label: 'Open save modifier chain',
    entryTitle: 'btn_save_modifierchain',
    open: (openForm) => openForm('saveModifierChain', { modifiers: [], modifiersValues: {} }),
  },
  {
    label: 'Open load modifier chain',
    entryTitle: 'btn_load_modifiers',
    open: (openForm) => openForm('loadModifierChain', {}),
  },
  {
    label: 'Open upload source',
    entryTitle: 'btn_upload_to_cloud',
    open: (openForm) => openForm('uploadSource', { sourceId: 'source-1' }),
  },
  {
    label: 'Open create project',
    entryTitle: 'btn_create_project',
    open: (openForm) => openForm('createProject', {}),
  },
  {
    label: 'Open add llm profile',
    entryTitle: 'dialog_llm_profile_add',
    open: (openForm) => openForm('addLlmProfile', {}),
  },
  {
    label: 'Open edit llm profile',
    entryTitle: 'dialog_llm_profile_edit',
    open: (openForm) => openForm('editLlmProfile', { profile: TEST_PROFILE }),
  },
];

// Harness du catalogue (lot 21) : une ouverture par entrée restante, valeur
// résolue appendue à la liste — le contrat observé est le titre résolu par le
// lambda `title(props)` et la résolution `undefined` au renvoi du dialogue.
const CatalogHarness = () => {
  const { openForm } = useDialog();
  const [results, setResults] = useState<string[]>([]);

  return (
    <>
      {CATALOG_ENTRIES.map((entry) => (
        <button
          key={entry.label}
          onClick={() =>
            void entry
              .open(openForm)
              .then((value) => setResults((current) => [...current, formatResult(value)]))
          }
        >
          {entry.label}
        </button>
      ))}
      {results.map((value, index) => (
        <output key={index}>{value}</output>
      ))}
    </>
  );
};

// Harness des dialogues de contenu : `openModelPreviewDialog` et
// `openModelUsageList` n'ont pas de contrat promesse — seul le dialogue ouvert
// (titre, description, contenu résolu depuis le modèle passé) est observable.
const ContentDialogsHarness = () => {
  const { openModelPreviewDialog, openModelUsageList } = useDialog();

  return (
    <>
      <button onClick={() => openModelPreviewDialog(TEST_MODEL)}>Preview model</button>
      <button onClick={() => openModelUsageList(TEST_MODEL)}>Show model usage</button>
    </>
  );
};

// `renderWithProviders` monte le routeur au-dessus de tous les providers comme
// `App.tsx` depuis le lot 41 : les dialogues de contenu qui appellent
// `useNavigate` (`ModelUsageList`) s'en contentent directement — la reconstruction
// locale de l'ordre de production faite aux lots 20-21 a été supprimée.

// Base Dexie réelle vidée avant chaque test : les écritures du lot 21 (collections
// seedées pour le dialogue d'usage) ne fuient d'un test à l'autre.
resetTestDbBeforeEach();

describe('useDialog', () => {
  it('resolves a typed form result after submission', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    await user.click(screen.getByRole('button', { name: 'btn_start' }));

    expect(await screen.findByText('profile-1')).toBeInTheDocument();
  });

  it('resolves with undefined when the form is cancelled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    await user.click(screen.getByRole('button', { name: 'btn_cancel' }));

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
  });

  it('resolves when a form is confirmed without a result', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);

    await user.click(screen.getByRole('button', { name: 'Open action form' }));
    await user.click(screen.getByRole('button', { name: 'btn_import_collection' }));

    expect(await screen.findByText('confirmed')).toBeInTheDocument();
  });

  it('resolves with true and closes the dialog when a result form is submitted', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open rename form' }));
    expect(screen.getByText('title_rename_source')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'btn_rename' }));

    // `changeSourceName` convertit la soumission en résultat `true` ; le registre
    // n'a pas de `closeOnAction` explicite, le dialogue se referme donc à la
    // confirmation.
    expect(await screen.findByText('true')).toBeInTheDocument();
    expect(screen.queryByText('title_rename_source')).not.toBeInTheDocument();
  });

  it('resolves with undefined while keeping the dialog open when closeOnAction is false', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open export form' }));
    const dialog = screen.getByRole('alertdialog');

    // `setCanSubmit` transmis par le registre pilote le bouton de confirmation.
    await user.click(within(dialog).getByRole('button', { name: 'Disable submit' }));
    expect(within(dialog).getByRole('button', { name: 'btn_export' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Enable submit' }));
    expect(within(dialog).getByRole('button', { name: 'btn_export' })).toBeEnabled();

    await user.click(within(dialog).getByRole('button', { name: 'btn_export' }));

    // La promesse se résout à la confirmation alors que `closeOnAction: false`
    // laisse le dialogue ouvert ; la soumission a bien atteint le formulaire
    // monté pour cette ouverture (ref allouée par `openForm`).
    expect(await screen.findByText('undefined')).toBeInTheDocument();
    expect(screen.getByText('btn_export_collection')).toBeInTheDocument();
    expect(within(dialog).getByText('submitted')).toBeInTheDocument();
  });

  it('resolves with the manifest result, survives the later close and honors the custom cancel label', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open manifest form' }));

    // `openManifest` n'a pas de libellé de confirmation : le dialogue n'expose
    // que son bouton d'annulation étiqueté « btn_close ».
    expect(
      within(screen.getByRole('alertdialog')).queryByRole('button', { name: 'btn_cancel' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit manifest' }));
    expect(await screen.findByText('https://example.org/manifest.json')).toBeInTheDocument();

    // `closeOnAction: false` : le dialogue reste ouvert après la résolution.
    expect(screen.getByText('btn_open_manifest')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'btn_close' }));
    expect(screen.queryByText('btn_open_manifest')).not.toBeInTheDocument();

    // La fermeture ultérieure ne peut plus changer la promesse déjà résolue.
    expect(resolvedValues()).toEqual(['https://example.org/manifest.json']);
  });

  it('titles the manifest form as a rename when a source is provided and resolves undefined on close', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open manifest rename form' }));
    expect(screen.getByText('title_rename_source')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'btn_close' }));

    expect(await screen.findByText('undefined')).toBeInTheDocument();
    expect(screen.queryByText('title_rename_source')).not.toBeInTheDocument();
  });

  it('resolves with undefined when the dialog is dismissed with Escape without submitting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('undefined')).toBeInTheDocument();
    expect(screen.queryByText('title_select_llm')).not.toBeInTheDocument();
  });

  it('allocates a fresh form ref per open and resolves the replaced dialog with undefined', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open result form' }));
    // La seconde ouverture remplace le dialogue en attente : sa promesse se
    // résout en `undefined` (fermeture sans soumission) et la confirmation
    // suivante doit viser la nouvelle ref allouée par `openForm`. Le dialogue
    // modal bloque les clics sous son overlay et masque le reste de
    // l'application (`aria-hidden`) : ce second `openForm` est donc déclenché
    // par un événement direct, comme le ferait un appel programmatique du
    // registre.
    fireEvent.click(screen.getByRole('button', { name: 'Open result form', hidden: true }));

    expect(await screen.findByText('undefined')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'btn_start' }));

    expect(await screen.findByText('profile-1')).toBeInTheDocument();
    expect(resolvedValues()).toEqual(['undefined', 'profile-1']);
  });

  it('resolves with undefined and logs when startWorker has no runtime parameters schema', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open schemaless worker form' }));

    expect(await screen.findByText('undefined')).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Plugin openai does not have a runtime parameters schema',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('opens the startWorker form when the plugin declares a runtime parameters schema', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistryHarness />);

    await user.click(screen.getByRole('button', { name: 'Open worker form with schema' }));

    const dialog = screen.getByRole('alertdialog');
    // Lambda `title` : le nom d'affichage est résolu depuis le registre réel
    // (`Pero / PaddlePaddle` pour `layoutExtraction`).
    expect(
      within(dialog).getByRole('heading', { name: 'btn_start_analysis - Pero / PaddlePaddle' }),
    ).toBeInTheDocument();
    // Lambda `render` : `StartWorkerForm` expose le champ du schéma runtime (enum).
    expect(within(dialog).getByText('plugin_layoutextraction_description')).toBeInTheDocument();

    // La confirmation soumet le formulaire (dispatch sans saga démarrée) et la
    // promesse se résout à `undefined`, le dialogue se referme.
    await user.click(within(dialog).getByRole('button', { name: 'btn_start' }));

    expect(await screen.findByText('undefined')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  describe('registry entries never opened in lot 20', () => {
    for (const entry of CATALOG_ENTRIES) {
      it(`renders the dialog of ${entry.label.toLowerCase()} and resolves undefined on dismiss`, async () => {
        const user = userEvent.setup();
        renderWithProviders(<CatalogHarness />);

        await user.click(screen.getByRole('button', { name: entry.label }));

        // Le lambda `title(props)` est atteint et résout le titre attendu ; le
        // lambda `render(props, …)` a monté le vrai formulaire dans le dialogue.
        expect(
          within(screen.getByRole('alertdialog')).getByRole('heading', {
            name: entry.entryTitle,
          }),
        ).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(await screen.findByText('undefined')).toBeInTheDocument();
      });
    }
  });

  describe('content dialogs', () => {
    it('previews the generated schema of a model', async () => {
      const user = userEvent.setup();
      renderWithProviders(<ContentDialogsHarness />);

      await user.click(screen.getByRole('button', { name: 'Preview model' }));

      const dialog = screen.getByRole('alertdialog');
      expect(
        within(dialog).getByRole('heading', { name: 'btn_model_preview' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('info_preview_model')).toBeInTheDocument();
      // Contenu rendu : la vue JSON du schéma généré depuis le modèle passe le
      // nom de son champ — preuve observable que `model` est parvenu au contenu.
      expect(await within(dialog).findByText(/champ-apercu/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'btn_cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('lists the collections using a model, resolved from the real database', async () => {
      const user = userEvent.setup();
      await seedCollection(
        makeCollection({ name: 'Collection avec le modèle', modelId: TEST_MODEL.id }),
      );
      await seedCollection(makeCollection({ name: 'Collection d un autre modèle' }));
      renderWithProviders(<ContentDialogsHarness />);

      await user.click(screen.getByRole('button', { name: 'Show model usage' }));

      const dialog = screen.getByRole('alertdialog');
      expect(
        within(dialog).getByRole('heading', { name: 'title_model_usage' }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText('info_model_usage')).toBeInTheDocument();
      // `model.id` est bien transmis comme discriminant : seule la collection qui
      // référence le modèle apparaît, lue depuis la base réelle.
      expect(await within(dialog).findByText('Collection avec le modèle')).toBeInTheDocument();
      expect(within(dialog).queryByText('Collection d un autre modèle')).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'btn_cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
