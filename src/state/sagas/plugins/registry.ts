import type { ImporterPlugin, WorkerPlugin } from './loader';
import { loadImporterPlugins, loadWorkerPlugins } from './loader';

export const workerPlugins: Record<string, WorkerPlugin> = {};
export const importerPlugins: Record<string, ImporterPlugin> = {};

let initialized = false;

/** Load plugins once, after i18n has initialized and before the app starts. */
export function initializePluginRegistries(): void {
  if (initialized) return;

  const loadedWorkerPlugins = loadWorkerPlugins();
  const loadedImporterPlugins = loadImporterPlugins();

  Object.assign(workerPlugins, loadedWorkerPlugins);
  Object.assign(importerPlugins, loadedImporterPlugins);
  initialized = true;
}
