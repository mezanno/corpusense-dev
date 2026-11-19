import { rootReducer } from '@/state';
import { RootState } from '@/state/store';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import createSagaMiddleware from 'redux-saga';

import { AlertDialogProvider } from '@/components/reducers/AlertDialogContext';
import { CollectionProvider } from '@/components/reducers/CollectionContext';
import { ConnectedUserProvider } from '@/components/reducers/ConnectedUserContext';
import { WorkerProvider } from '@/components/reducers/WorkerContext';
import { ThemeProvider } from '@/hooks/ui/useTheme';
import { ExperimentalProvider } from '@/hooks/useExperimental';

// Un QueryClient NEUF par rendu (lot 41) : le cache partagé au niveau module
// faisait déborder des requêtes déjà résolues d'un test sur l'autre. `retry: false`
// est conservé, conformément aux frontières du plan de tests des hooks.
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

// This function is used to render a component with the redux store and provider
export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = createMockStore(preloadedState),
    ...renderOptions
  }: { preloadedState?: Partial<RootState>; store?: ReturnType<typeof createMockStore> } = {},
) {
  const queryClient = createTestQueryClient();
  // Le routeur est AU-DESSUS de tous les providers, comme dans `App.tsx`
  // (BrowserRouter entre ThemeProvider et QueryClientProvider) : le contenu des
  // dialogues montés par l'`AlertDialogProvider` est ainsi dans le routeur,
  // exactement comme en production (lot 41).
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <Provider store={store}>
            <ConnectedUserProvider>
              <ExperimentalProvider>
                <AlertDialogProvider>
                  <CollectionProvider>
                    <WorkerProvider>{ui}</WorkerProvider>
                  </CollectionProvider>
                </AlertDialogProvider>
              </ExperimentalProvider>
            </ConnectedUserProvider>
          </Provider>
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
    renderOptions,
  );
}

export function createMockStore(preloadedState: Partial<RootState> = {}) {
  const sagaMiddleware = createSagaMiddleware(); //create the sage middleware but don't run it
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
    preloadedState: preloadedState as unknown as RootState,
  });
}
