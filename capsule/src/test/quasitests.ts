import {
  completeFlowWithServer,
  completeFlowOffline,
} from './ChallengeStorage.quasitest';
import {completeFlowWithServerTwoKeys} from './ChallengeStorageDifferentKeys.quasitest';
import {keyRecoveryFlow} from './KeyRecovery.quasitest';
import {keyRefreshFlow} from './KeyRefresh.quasitest';
import {loginFlow} from './LoginFlow.quasitest';
import {loginFlow as loginFlowWeb} from './LoginFlowWebAuth.quasitest';
import {privateKeyStoringFlow} from './PrivateKeyStorage.quasitest';
import {recoverRecoveryShare} from './RecoverRecovery.quasitest';
import {transmissionFlow} from './Transimission.quasitest';

async function runTests() {
  try {
    // await completeFlowWithServer();
    // await completeFlowOffline();
    // await loginFlow();
    // await loginFlowWeb();
    // await privateKeyStoringFlow();
    // await completeFlowWithServerTwoKeys();
    // await recoverRecoveryShare();
    await keyRecoveryFlow();
    // await keyRefreshFlow();
    // await transmissionFlow();
  } catch (e) {
    console.log('ERROR', e);
  }

  console.log('ALL TESTS ENDED');
}

runTests();
