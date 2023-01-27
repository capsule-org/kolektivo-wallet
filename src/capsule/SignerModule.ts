
export enum keyType {
    USER,
    RECOVERY
}
export interface SignerModule {
    createAccount(walletId: string, protocolId: string, keyType: keyType): Promise<string>
    getAddress(keyshare: string): Promise<string>
    sendTransaction(protocolId: string, keyshare: string, transaction: string): Promise<string>
    refresh(protocolId: string, keyshare: string): Promise<string>
  }
  