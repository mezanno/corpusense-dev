import { expect, test } from '@playwright/test';
import {
  MANIFEST_FIXTURE_TITLE,
  createCollectionFromSource,
  importFixtureManifest,
  openCollectionInspector,
} from './helpers/journeys';
import { installE2ENetwork } from './helpers/network';
import {
  CANVAS_GALLERY,
  DEFINE_SELECTION_START,
  DELETE_COLLECTION,
  OPEN_CANVAS,
  REORDER_CANVAS,
} from './helpers/selectors';

test('la vignette affichée est visiblement sélectionnée dans les deux galeries', async ({
  page,
}) => {
  await installE2ENetwork(page);
  await importFixtureManifest(page);
  await page.getByRole('button', { name: MANIFEST_FIXTURE_TITLE }).click();
  const manifestItem = page
    .getByRole('region', { name: CANVAS_GALLERY })
    .getByRole('listitem')
    .first();
  await expect(manifestItem).toBeVisible();
  await expect(manifestItem).toHaveAttribute('data-state', 'inactive');
  await expect
    .soft(manifestItem)
    .toHaveCSS('background-color', 'rgb(248, 247, 237)', { timeout: 1000 });
  const manifestOpen = manifestItem.getByRole('button', { name: new RegExp(OPEN_CANVAS) });
  await manifestOpen.focus();
  await manifestOpen.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: DEFINE_SELECTION_START })).toBeVisible();
  await page.keyboard.press('Escape');
  await manifestOpen.focus();
  await manifestOpen.press('Enter');
  await expect(manifestItem).toHaveAttribute('data-state', 'active');
  await expect(manifestItem).toHaveCSS('background-color', 'rgb(247, 197, 72)');

  await createCollectionFromSource(page, 'Sélection galerie');
  await openCollectionInspector(page, 'Sélection galerie');
  const collectionItem = page.getByRole('listitem').filter({ hasText: 'Page 1' }).first();
  await expect(collectionItem).toBeVisible();
  await expect(collectionItem).toHaveAttribute('data-state', 'inactive');
  await expect
    .soft(collectionItem)
    .toHaveCSS('background-color', 'rgb(248, 247, 237)', { timeout: 1000 });
  const collectionOpen = collectionItem.getByRole('button', { name: new RegExp(OPEN_CANVAS) });
  await collectionOpen.focus();
  await collectionOpen.press('Enter');
  await expect(collectionItem).toHaveAttribute('data-state', 'active');
  await expect(collectionItem).toHaveCSS('background-color', 'rgb(247, 197, 72)');
  await page.keyboard.press('Tab');
  const reorder = collectionItem.getByRole('button', { name: new RegExp(REORDER_CANVAS) });
  await expect(reorder).toBeFocused();
  await page.keyboard.press('Space');
  await expect(reorder).toHaveAttribute('aria-grabbed', 'true');
  await page.keyboard.press('Escape');
  await expect(reorder).toHaveAttribute('aria-grabbed', 'false');
  await page.keyboard.press('Tab');
  const deleteButton = collectionItem.getByRole('button', { name: DELETE_COLLECTION });
  await expect(deleteButton).toBeFocused();
  await expect(deleteButton).toHaveCSS('opacity', '1');
});
