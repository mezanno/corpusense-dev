import { Page, expect } from '@playwright/test';
import { E2E_IMAGE_SERVICE_URL, E2E_MANIFEST_URL } from './fixtures';
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
  MANIFEST_INPUT_PLACEHOLDER,
  OPEN_MANIFEST,
  PAGE_TITLE_IIIF_STORAGE,
  TITLE_METADATA_COLLECTION,
} from './selectors';

// Parcours réutilisables extraits de l'étape 3 (S1 + S2) pour que les scénarios
// suivants (S3 annotation, S4 export) rejouent le même état initial sans re-coder
// les gestes. Chaque fonction est auto-suffisante : elle navigue, agit, et attend
// sa post-condition web-first (jamais de délai temporel).

/** Titre du manifest de fixture (`e2e/fixtures/manifest.json` → `label`). */
export const MANIFEST_FIXTURE_TITLE = 'Manifeste de test E2E';

/**
 * S1 — import du manifest de fixture depuis « Bibliothèques en ligne »
 * (seule porte d'entrée de OpenManifestForm) jusqu'à la carte de source en
 * bibliothèque. Le nom est SAISI (et non laissé au placeholder proposé) pour que
 * le nom stocké soit déterministe (enseignement spike S1).
 */
export async function importFixtureManifest(page: Page): Promise<void> {
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
  await expect(page.getByRole('heading', { name: MANIFEST_FIXTURE_TITLE })).toBeVisible();
}

/**
 * S2 (partie création) — depuis la bibliothèque : ouvrir l'explorateur de la
 * source importée, sélectionner le canvas unique, créer une collection nommée
 * depuis la sélection. Le nom est saisi au clavier (`pressSequentially`) :
 * `fill` n'active pas la validation react-hook-form du dialogue (enseignement
 * spike S2) et ce geste reproduit l'usage réel.
 */
export async function createCollectionFromSource(
  page: Page,
  collectionName: string,
): Promise<void> {
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

  // Dialogue « Créer une nouvelle collection ».
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: CREATE_COLLECTION })).toBeVisible();
  const collectionNameField = dialog.getByRole('textbox', { name: COLLECTION_NAME_LABEL });
  await collectionNameField.click();
  await collectionNameField.pressSequentially(collectionName);
  const createButton = dialog.getByRole('button', { name: BTN_CREATE, exact: true });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(dialog).toBeHidden();
}

/**
 * Ouvre l'inspecteur de la collection nommée depuis le gestionnaire
 * (/collections → ligne → « Ouvrir ») et attend l'en-tête d'inspecteur.
 */
export async function openCollectionInspector(page: Page, collectionName: string): Promise<void> {
  await page.goto('/collections');
  const collectionRow = page.getByRole('row').filter({ hasText: collectionName });
  await expect(collectionRow).toBeVisible();
  await collectionRow.getByRole('button', { name: BTN_OPEN }).click();
  await expect(page).toHaveURL(/\/collections\/[0-9a-f-]+/);
  await expect(
    page.getByRole('button', {
      name: new RegExp(`${TITLE_METADATA_COLLECTION}.*${collectionName}`),
    }),
  ).toContainText(collectionName);
}

/**
 * Affiche le canvas de la fixture (« Page 1 », libellé du manifest de test) dans
 * le visualiseur de l'inspecteur, et attend que la tuile unique soit réellement
 * chargée : `info.json` puis l'image de tuile (service IIIF de fixture servi en
 * interception). Web-first, sans événement `tile-drawn` que le drawer WebGL de
 * l'app n'émet jamais (enseignement spike OSD).
 */
export async function displayFixtureCanvas(page: Page): Promise<void> {
  const infoRequest = page.waitForResponse(
    (response) =>
      response.url() === `${E2E_IMAGE_SERVICE_URL}/info.json` && response.status() === 200,
  );
  await page.getByRole('listitem').filter({ hasText: 'Page 1' }).first().click();
  await infoRequest;
  const tileRequest = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${E2E_IMAGE_SERVICE_URL}/`) &&
      response.url().endsWith('.jpg') &&
      response.status() === 200,
  );
  await tileRequest;
}
