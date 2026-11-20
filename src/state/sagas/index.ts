import { getDatabaseRepository } from '@/data/repositories/indexeddb/dbFactory';
import { all, call, fork, spawn, type Effect } from 'redux-saga/effects';
import workerSaga, { initWorkersStatus, loadWorkerPluginsInfo } from './workers';

function* launchSaga(saga: () => Generator) {
  while (true) {
    try {
      yield call(saga);
      break;
    } catch (e) {
      console.log(e);
    }
  }
}

/**
 * Rows an upgrade transaction could not rewrite (they carry a blob or a file
 * system handle) wait for this pass; it does nothing without such a row.
 */
function* repairDeferredTimestamps(): Generator<Effect, void, unknown> {
  const databaseRepository = getDatabaseRepository();
  try {
    yield call([databaseRepository, databaseRepository.repairDeferredTimestamps]);
  } catch (error) {
    console.error('Unable to repair deferred timestamps:', error);
  }
}

function getRootSaga() {
  return function* rootSaga() {
    const coreSagas = [workerSaga];

    yield all(coreSagas.map((saga) => spawn(launchSaga, saga)));
    yield fork(repairDeferredTimestamps); //finish the migration the upgrade skipped
    yield fork(initWorkersStatus); //load workers at startup
    yield fork(loadWorkerPluginsInfo);
  };
}

export default getRootSaga;
