import {
  completeFlowWithServer,
  completeFlowOffline,
} from './ChallengeStorage.quasitest';
import { completeFlowWithServerTwoKeys } from './ChallengeStorageDifferentKeys.quasitest';
import { keyRecoveryFlow } from './KeyRecovery.quasitest';
import { keyRefreshFlow } from './KeyRefresh.quasitest';
import { loginFlow } from './LoginFlow.quasitest';
import { privateKeyStoringFlow } from './PrivateKeyStorage.quasitest';
import { recoverRecoveryShare } from './RecoverRecovery.quasitest';

async function runTests() {
  await completeFlowWithServer();
  await completeFlowOffline();
  await loginFlow();
  await privateKeyStoringFlow();
  await completeFlowWithServerTwoKeys();
  await recoverRecoveryShare();
  await keyRecoveryFlow();
  await keyRefreshFlow();
  console.log('ALL TESTS PASSED');
}

runTests();
