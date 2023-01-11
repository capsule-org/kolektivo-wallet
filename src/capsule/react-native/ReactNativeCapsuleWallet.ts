import { CapsuleBaseSigner } from '../CapsuleSigner'
import { SignersStorage } from '../SignersStorage'
import { ChallengeStorage } from '../ChallengeStorage'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CapsuleBaseWallet } from '../CapsuleWallet'
import { ReactNativeCapsuleSigner } from './ReactNativeCapsuleSigner'
import { ReactNativeSignersStorage } from './ReactNativeSignersStorage'
import { ReactNativeChallengeStorage } from './ReactNativeChallengeStorage'

export const USER_ID_TAG = '@CAPSULE/USER_ID'

export class ReactNativeCapsuleWallet extends CapsuleBaseWallet {
  getCapsuleSigner(userId: string, ensureSessionActive: () => Promise<void>): CapsuleBaseSigner {
    return new ReactNativeCapsuleSigner(userId, ensureSessionActive)
  }

  getSignersStorage(): SignersStorage {
    return new ReactNativeSignersStorage()
  }

  getChallengeStorage(userId: string): ChallengeStorage {
    return new ReactNativeChallengeStorage(userId)
  }

  async getUserId(): Promise<string> {
    return (await AsyncStorage.getItem(USER_ID_TAG)) as string
  }
}

export { ReactNativeCapsuleWallet as CapsuleWallet }
