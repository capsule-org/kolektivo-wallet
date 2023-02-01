
export enum keyType {
    USER,
    RECOVERY
}
export interface SignerModule {
    createAccount(walletId: string, protocolId: string, keyType: keyType, userId: string): Promise<string>
    getAddress(keyshare: string): Promise<string>
    sendTransaction(protocolId: string, keyshare: string, transaction: string, userId: string): Promise<string>
    refresh(protocolId: string, keyshare: string, userId: string): Promise<string>
  }
  