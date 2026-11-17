import { expect, test } from '@playwright/test';
import { installE2ENetwork } from './helpers/network';
import {
  ADD_FIRST_MODIFIER,
  DELETE_MODIFIER,
  INSERT_MODIFIER,
  INSERT_MODIFIER_BEFORE,
  PAGE_TITLE_MODIFIER_CHAINS,
} from './helpers/selectors';

test('la chaîne et ses actions React Flow sont utilisables au clavier', async ({ page }) => {
  await installE2ENetwork(page);
  await page.goto('/modifier-chain');
  await expect(page.getByRole('heading', { name: PAGE_TITLE_MODIFIER_CHAINS })).toBeVisible();

  // Le gestionnaire n'offre pas de création de chaîne : fixture dans la base E2E isolée.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('mezanno');
      request.onerror = () =>
        reject(new Error('Impossible d’ouvrir la base E2E', { cause: request.error }));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('modifierChains', 'readwrite');
        transaction.objectStore('modifierChains').put({
          id: 'keyboard-chain',
          name: 'Chaîne clavier',
          modifiers: [],
        });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () =>
          reject(new Error('Impossible de créer la chaîne E2E', { cause: transaction.error }));
      };
    });
  });
  await page.reload();

  const chain = page.getByRole('button', { name: 'Chaîne clavier' });
  await chain.focus();
  await chain.press('Enter');
  const addFirst = page.getByRole('button', { name: ADD_FIRST_MODIFIER });
  await expect(addFirst).toBeVisible();
  await addFirst.focus();
  await addFirst.press('Enter');
  await expect(page.getByRole('button', { name: DELETE_MODIFIER })).toHaveCount(1);

  // Les poignées React Flow sont pointer-events:none par défaut ; tester aussi la souris.
  await page.getByRole('button', { name: INSERT_MODIFIER_BEFORE }).click();
  await expect(page.getByRole('button', { name: DELETE_MODIFIER })).toHaveCount(2);
  const edge = page.getByRole('button', { name: INSERT_MODIFIER, exact: true });
  await edge.focus();
  await edge.press('Enter');
  await expect(page.getByRole('button', { name: DELETE_MODIFIER })).toHaveCount(3);
});
