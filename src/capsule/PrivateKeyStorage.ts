import AsyncStorage from '@react-native-async-storage/async-storage'

export abstract class PrivateKeyStorage {
  public walletId: string

  public abstract setPrivateKey(key: string): Promise<void>

  public abstract getPrivateKey(): Promise<string>

  public constructor(walletId: string) {
    this.walletId = walletId
  }
}

// TODO make it a real keychain
const TAG = '@CAPSULE/TODO-KEYCHAIN'

export class PrivateKeyStorageReactNative extends PrivateKeyStorage {
  async getPrivateKey(): Promise<string> {
    const storageString = await AsyncStorage.getItem(TAG)
    console.log(storageString)
    const storage = storageString ? JSON.parse(storageString) : {}
    console.log('GETTING STORAGE', storage[this.walletId], this.walletId, storage)

    return storage[this.walletId] as string
  }

  async setPrivateKey(key: string): Promise<void> {
    const storageString = await AsyncStorage.getItem(TAG)
    const storage = storageString ? JSON.parse(storageString) : {}
    storage[this.walletId] = key
    return await AsyncStorage.setItem(TAG, JSON.stringify(storage))
  }
}
