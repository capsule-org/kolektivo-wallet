import AsyncStorage from '@react-native-async-storage/async-storage'

export abstract class SignersStorage {
  public abstract addAccount(account: string): Promise<void>
  public abstract getAccounts(): Promise<string[]>
}

const TAG = '@CAPSULE/ACCOUNTS'

export class ReactNativeSignersStorage extends SignersStorage {
  public async addAccount(account: string): Promise<void> {
    const accounts = await this.getAccounts()
    accounts.push(account)
    await AsyncStorage.setItem(TAG, JSON.stringify(accounts))
  }

  public async getAccounts(): Promise<string[]> {
    const accountsString = await AsyncStorage.getItem(TAG)
    return (accountsString ? JSON.parse(accountsString) : []) as string[]
  }
}
