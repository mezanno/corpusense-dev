import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import i18n, { initI18n } from './i18n';

const root = createRoot(document.getElementById('root')!);

async function bootstrap() {
  await initI18n();

  const { initializePluginRegistries } = await import('./state/sagas/plugins/registry');
  initializePluginRegistries();

  const [{ default: App }, { default: store }] = await Promise.all([
    import('./App.tsx'),
    import('./state/store.ts'),
  ]);

  root.render(
    <StrictMode>
      <Suspense fallback={<div>{i18n.t('info_loading')}</div>}>
        <Provider store={store}>
          <App />
        </Provider>
      </Suspense>
    </StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error('Unable to initialize the application:', error);
  root.render(
    <div role='alert'>Impossible d’initialiser l’application. Consultez la console.</div>,
  );
});
