import AsyncStorage from '@react-native-async-storage/async-storage';
import { SignersStorage } from '../SignersStorage';

const TAG = '@CAPSULE/ACCOUNTS';

/**
 * React Native implementation of SignerStorage
 * Uses React Native async storage to track accounts. 
 */
export class ReactNativeSignersStorage extends SignersStorage {
  /**
   * Stores the account in async storage.
   * @param account Address of the account to store.
   */
  public async addAccount(account: string): Promise<void> {
    const accounts = await this.getAccounts();
    accounts.push(account);
    await AsyncStorage.setItem(TAG, JSON.stringify(accounts));
  }

  /**
   * Retrieves the accounts from async storage.
   * @returns The set of accounts.
   */
  public async getAccounts(): Promise<string[]> {
    const accountsString = await AsyncStorage.getItem(TAG);
    return (accountsString ? JSON.parse(accountsString) : []) as string[];
  }
}
