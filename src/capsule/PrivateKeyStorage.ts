export abstract class PrivateKeyStorage {
  public walletId: string

  public abstract setPrivateKey(key: string): void

  public abstract getPrivateKey(): string

  public constructor(walletId: string) {
    this.walletId = walletId
  }
}

const PseudoKeychain = new Map<string, string>()

export class PrivateKeyStorageDefault extends PrivateKeyStorage {
  getPrivateKey(): string {
    return PseudoKeychain.get(this.walletId) as string
  }

  setPrivateKey(key: string): void {
    PseudoKeychain.set(this.walletId, key)
  }
}
