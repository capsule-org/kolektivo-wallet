export abstract class SignersStorage {
  private syncStorage: string[] | undefined;
  private async loadToSyncStorage() {
    this.syncStorage = await this.getAccounts();
  }
  public async addAccountInternal(account: string): Promise<void> {
    await this.addAccount(account);
    await this.loadToSyncStorage();
  }
  constructor() {
    this.loadToSyncStorage();
  }

  public getAccountsSync(): string[] {
    if (!this.syncStorage) {
      throw new Error('sync storage not loaded yet!');
    }
    return this.syncStorage;
  }

  public abstract addAccount(account: string): Promise<void>;
  public abstract getAccounts(): Promise<string[]>;
}
