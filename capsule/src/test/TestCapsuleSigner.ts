import {PrivateKeyStorage} from '../PrivateKeyStorage';
import {CapsuleBaseSigner} from '../CapsuleSigner';
import {TestPrivateKeyStorage} from './TestPrivateKeyStorage';
import {SignerModule} from '../SignerModule';
import testSignerModule from './TestSignerModule';

export class TestCapsuleSigner extends CapsuleBaseSigner {
  protected getSignerModule(): SignerModule {
    return testSignerModule;
  }
  protected getPrivateKeyStorage(account: string): PrivateKeyStorage {
    return new TestPrivateKeyStorage(account);
  }
}
