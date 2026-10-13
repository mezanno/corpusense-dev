import { BrowserContext, Page, expect, test } from '@playwright/test';
import { E2E_ORIGIN } from './helpers/config';
import { E2E_IMAGE_SERVICE_URL, E2E_MANIFEST_URL } from './helpers/fixtures';
import { installE2ENetwork } from './helpers/network';
import {
  ADD_NEW_DOCUMENT,
  ADD_TO_LIBRARY,
  BTN_CLOSE,
  BTN_CREATE,
  BTN_OPEN,
  CANVAS_GALLERY,
  COLLECTION_NAME_LABEL,
  CREATE_COLLECTION,
  CREATE_FROM_SELECTION,
  DEFINE_SELECTION_START,
  LOAD_MANIFEST_STEP_1,
  LOAD_MANIFEST_STEP_2,
  MANIFEST_GRID,
  MANIFEST_INPUT_PLACEHOLDER,
  NAV_SOURCES,
  OPEN_MANIFEST,
  PAGE_TITLE_IIIF_STORAGE,
  TITLE_METADATA_COLLECTION,
  numberOfCollections,
  numberOfItems,
} from './helpers/selectors';

// Étape 3 du plan Q9 — parcours critique S1 + S2 en série (D-010 : rôles accessibles
// et libellés FR, jamais de sélecteur d'implémentation).
//
// S1 : import d'un manifest IIIF (fixture servie en interception) depuis la page
// « Bibliothèques en ligne » (/iiifSources, seule porte d'entrée de OpenManifestForm)
// → la source rejoint la bibliothèque (carte + explorateur de manifests).
// S2 : création d'une collection À PARTIR DE CETTE SOURCE via la sélection du canvas
// dans la galerie de l'explorateur (menu contextuel « Créer une collection à partir de
// la sélection ») → collection listée dans /collections, ouvrable dans son inspecteur,
// toujours présente après rechargement (preuve de persistance Dexie/IndexedDB).
//
// Enseignements du spike (2026-10-13), à connaître pour la maintenance :
// - le nom de la source est PROPOSÉ (placeholder du champ de renommage), pas pré-rempli :
//   il vient de getSummary() du manifest = « Manifeste de test E2E » ; on le saisit
//   explicitement pour que le nom stocké soit déterministe ;
// - le champ nom du dialogue NewCollectionForm (react-hook-form 7.79, mode onChange)
//   n'active le bouton « Créer » qu'au clavier réel : `fill` (valeur injectée) ne
//   déclenche pas la revérification — `pressSequentially` est le seul geste fiable,
//   et il reproduit de toute façon l'usage réel ;
// - les deux tests partagent UN SEUL contexte navigateur (créé dans `beforeAll`) :
//   `test.describe.serial` seul ne suffit pas, Playwright crée un contexte (donc une
//   IndexedDB) neuf par test. C'est ce qui fait de S2 la suite réelle de S1.

/** Titre du manifest de fixture (`e2e/fixtures/manifest.json` → `label`). */
const MANIFEST_FIXTURE_TITLE = 'Manifeste de test E2E';

/** Nom de la collection créée par S2 (donnée de test, sans correspondance i18n). */
const COLLECTION_NAME = 'Collection E2E Q9';

test.describe.serial('parcours import manifest → collection', () => {
  test.describe.configure({ timeout: 60_000 });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: E2E_ORIGIN,
      locale: 'fr',
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();
    await installE2ENetwork(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('S1 — le manifest importé rejoint la bibliothèque des sources', async () => {
    await page.goto('/iiifSources');
    await expect(
      page.getByRole('heading', { level: 1, name: PAGE_TITLE_IIIF_STORAGE }),
    ).toBeVisible();

    // Carte pointillée « ajouter un document » → dialogue d'import (étape 1).
    await page.getByText(ADD_NEW_DOCUMENT).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText(LOAD_MANIFEST_STEP_1)).toBeVisible();
    await expect(dialog.getByRole('button', { name: BTN_CLOSE })).toBeVisible();

    await dialog.getByRole('textbox', { name: MANIFEST_INPUT_PLACEHOLDER }).fill(E2E_MANIFEST_URL);
    const loadButton = dialog.getByRole('button', { name: OPEN_MANIFEST });
    await expect(loadButton).toBeEnabled();
    await loadButton.click();

    // Étape 2 : le manifest chargé est présenté, son nom est proposé au champ de renommage.
    await expect(dialog.getByText(LOAD_MANIFEST_STEP_2)).toBeVisible();
    const nameField = dialog.getByRole('textbox', { name: MANIFEST_FIXTURE_TITLE });
    await expect(nameField).toBeVisible();
    await nameField.fill(MANIFEST_FIXTURE_TITLE);

    const addToLibrary = dialog.getByRole('button', { name: ADD_TO_LIBRARY });
    await expect(addToLibrary).toBeEnabled();
    await addToLibrary.click();

    // Le dialogue se ferme de lui-même une fois la source persistée (Dexie).
    await expect(dialog).toBeHidden();

    // Bibliothèque en ligne : la source apparaît en carte, nommée d'après le manifest.
    await expect(page.getByRole('heading', { name: MANIFEST_FIXTURE_TITLE })).toBeVisible();

    // La carte mène à l'explorateur : la source figure aussi dans sa liste
    // « Sources de données » (liste des sources importées, côté explorateur).
    await page.getByRole('heading', { name: MANIFEST_FIXTURE_TITLE }).click();
    await expect(page).toHaveURL(/\/manifest\?manifestId=/);
    const sourcesList = page.getByRole('region', { name: MANIFEST_GRID });
    await expect(sourcesList.getByRole('heading', { name: NAV_SOURCES })).toBeVisible();
    await expect(sourcesList.getByRole('link', { name: MANIFEST_FIXTURE_TITLE })).toBeVisible();
  });

  test('S2 — collection créée depuis la source, inspectée et persistée', async () => {
    // La source importée en S1 est toujours là (même contexte, IndexedDB conservée) :
    // on y revient par la bibliothèque pour ouvrir l'explorateur comme un utilisateur.
    await page.goto('/iiifSources');
    const sourceCard = page.getByRole('heading', { name: MANIFEST_FIXTURE_TITLE });
    await expect(sourceCard).toBeVisible();
    await sourceCard.click();
    await expect(page).toHaveURL(/\/manifest\?manifestId=/);

    // Sélection du canvas unique dans la galerie (clic droit → « définir le début »).
    const gallery = page.getByRole('region', { name: CANVAS_GALLERY });
    const canvasItem = gallery.getByRole('listitem').first();
    await expect(canvasItem).toBeVisible();
    await canvasItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: DEFINE_SELECTION_START }).click();

    // Second clic droit : le menu propose désormais la création depuis la sélection.
    await canvasItem.click({ button: 'right' });
    await page.getByRole('menuitem', { name: CREATE_FROM_SELECTION }).click();

    // Dialogue « Créer une nouvelle collection » — nom saisi au clavier (voir en-tête
    // du fichier : `fill` ne suffit pas à activer la validation react-hook-form).
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: CREATE_COLLECTION })).toBeVisible();
    const collectionNameField = dialog.getByRole('textbox', { name: COLLECTION_NAME_LABEL });
    await collectionNameField.click();
    await collectionNameField.pressSequentially(COLLECTION_NAME);
    const createButton = dialog.getByRole('button', { name: BTN_CREATE, exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.click();
    await expect(dialog).toBeHidden();

    // Gestionnaire de collections : une collection, listée, avec son compteur d'éléments.
    await page.goto('/collections');
    await expect(page.getByRole('heading', { name: numberOfCollections(1) })).toBeVisible();
    const collectionRow = page.getByRole('row').filter({ hasText: COLLECTION_NAME });
    await expect(collectionRow).toBeVisible();
    await expect(collectionRow).toContainText(numberOfItems(1));

    // Inspecteur : en-tête « Collection » + nom + compteur, et le canvas de la source.
    await collectionRow.getByRole('button', { name: BTN_OPEN }).click();
    await expect(page).toHaveURL(/\/collections\/[0-9a-f-]+/);
    const inspectorHeader = page.getByRole('button', {
      name: new RegExp(`${TITLE_METADATA_COLLECTION}.*${COLLECTION_NAME}`),
    });
    await expect(inspectorHeader).toContainText(COLLECTION_NAME);
    await expect(inspectorHeader).toContainText(numberOfItems(1));
    await expect(page.getByText('Page 1')).toBeVisible();

    // « la source y figure » : afficher le canvas de la collection fait recharger son
    // service IIIF depuis l'hôte de fixture — la source est bien rattachée à la page.
    const infoRequest = page.waitForResponse(
      (response) =>
        response.url() === `${E2E_IMAGE_SERVICE_URL}/info.json` && response.status() === 200,
    );
    await page.getByRole('listitem').filter({ hasText: 'Page 1' }).first().click();
    await infoRequest;

    // Persistance : après rechargement complet (nouvelle ouverture d'IndexedDB),
    // la collection est toujours listée avec son contenu.
    await page.reload();
    await expect(
      page.getByRole('button', {
        name: new RegExp(`${TITLE_METADATA_COLLECTION}.*${COLLECTION_NAME}`),
      }),
    ).toBeVisible();
    await page.goto('/collections');
    await expect(page.getByRole('heading', { name: numberOfCollections(1) })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: COLLECTION_NAME })).toContainText(
      numberOfItems(1),
    );
  });
});
