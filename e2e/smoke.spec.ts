import { expect, test } from '@playwright/test';
import { blockExternalRequests } from './helpers/network';

// S0 — fumée (Q9) : la coquille, le routeur et la couche données (Dexie sur IndexedDB
// vierge) démarrent sans erreur bloquante, sans réseau externe.
// Les libellés sont les valeurs FR réelles de `public/locales/fr` : un scénario de
// traduction ne doit casser qu'un seul fichier (centralisation prévue à l'étape 2).
const WELCOME_TITLE = 'Bienvenue sur Corpusense';
const SIDEBAR_TOGGLE = 'Basculer le menu latéral';
const EMPTY_COLLECTIONS = "Vous n'avez aucune collection actuellement";
const CREATE_COLLECTION = 'Créer une nouvelle collection';

test.describe('smoke', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('accueil : le message de bienvenue et la barre latérale sont reachable', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/');

    // Le titre vient du namespace `welcome`, chargé asynchronement par i18next-http-backend.
    await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeVisible();
    await expect(page.getByRole('button', { name: SIDEBAR_TOGGLE })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('gestion des collections : la page se monte sur une base IndexedDB vierge', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/collections');

    await expect(page.getByRole('button', { name: CREATE_COLLECTION, exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(EMPTY_COLLECTIONS);

    expect(pageErrors).toEqual([]);
  });
});
