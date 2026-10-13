import type { Page } from '@playwright/test';
import { E2E_ORIGIN } from './config';

// Aucune sortie réseau externe pendant les tests E2E (Q9) : tout ce qui n'est pas
// servi par le serveur de dev e2e local est abandonné (Supabase factice, Gallica des
// liens d'exemple, fournisseurs IIIF réels…). Les fixtures IIIF seront servies par
// `page.route` sur des URL factices (étape 2 du plan).
// À appeler dans un `test.beforeEach` ; les websockets HMR de Vite ne sont pas
// concernés par `page.route`.
export async function blockExternalRequests(page: Page): Promise<void> {
  await page.route('**', (route) => {
    const url = route.request().url();
    if (url.startsWith(`${E2E_ORIGIN}/`)) {
      return route.continue();
    }
    return route.abort();
  });
}
