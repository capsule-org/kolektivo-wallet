import {CapsuleBaseSigner} from '../CapsuleSigner';
import {SignersStorage} from '../SignersStorage';
import {SessionStorage} from '../SessionStorage';
// @ts-ignore
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CapsuleBaseWallet} from '../CapsuleWallet';
import {ReactNativeCapsuleSigner} from './ReactNativeCapsuleSigner';
import {ReactNativeSignersStorage} from './ReactNativeSignersStorage';
import {ReactNativeSessionStorage} from './ReactNativeSessionStorage';

export const USER_ID_TAG = '@CAPSULE/USER_ID';

/**
 * React Native implementation of CapsuleWallet
 */
export class ReactNativeCapsuleWallet extends CapsuleBaseWallet {
  getCapsuleSigner(
    userId: string,
    ensureSessionActive: () => Promise<void>
  ): CapsuleBaseSigner {
    return new ReactNativeCapsuleSigner(userId, ensureSessionActive);
  }

  getSignersStorage(): SignersStorage {
    return new ReactNativeSignersStorage();
  }

  getChallengeStorage(userId: string): SessionStorage {
    return new ReactNativeSessionStorage(userId);
  }

  async getUserId(): Promise<[string, string]> {
    const [userId, email] = (await AsyncStorage.getItem(USER_ID_TAG))?.split(
      '|'
    ) ?? ['', ''];
    return [userId, email] as [string, string];
  }
}

export {ReactNativeCapsuleWallet as CapsuleWallet};
