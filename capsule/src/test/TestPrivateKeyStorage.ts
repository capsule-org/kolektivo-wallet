import {PrivateKeyStorage} from '../PrivateKeyStorage';
import Keychain from 'react-native-keychain';

const storage: any = {};

export class TestPrivateKeyStorage extends PrivateKeyStorage {
  protected privateKeyGetOptions(): Keychain.Options {
    return {};
  }

  protected privateKeySetOptions(): Keychain.Options {
    return {};
  }

  async getPrivateKey(): Promise<string | null> {
    return new Promise<string>((resolve, reject) => {
      if (!storage[this.walletId]) {
        reject('Key not found');
      }
      resolve(storage[this.walletId]);
    });
  }

  async setPrivateKey(key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      storage[this.walletId] = key;
      resolve();
    });
  }
}
