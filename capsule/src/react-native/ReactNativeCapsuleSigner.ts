import { PrivateKeyStorage } from '../PrivateKeyStorage';
import { CapsuleBaseSigner } from '../CapsuleSigner';
import { ReactNativePrivateKeyStorage } from './ReactNativePrivateKeyStorage';
import { NativeModules } from 'react-native';
import { SignerModule } from '../SignerModule';

const { CapsuleSignerModule } = NativeModules;

/**
 * React Native implementation of Capsule Signer
 */
export class ReactNativeCapsuleSigner extends CapsuleBaseSigner {
  protected getSignerModule(): SignerModule {
    return CapsuleSignerModule;
  }
  protected getPrivateKeyStorage(account: string): PrivateKeyStorage {
    return new ReactNativePrivateKeyStorage(account);
  }
}
