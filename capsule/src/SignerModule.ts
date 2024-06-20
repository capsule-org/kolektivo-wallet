export const KeyType = {
  USER: 'USER',
  RECOVERY: 'RECOVERY',
} as const;

export interface SignerModule {
  createAccount(
    walletId: string,
    protocolId: string,
    keyType: (typeof KeyType)[keyof typeof KeyType],
    userId: string
  ): Promise<string>;
  getAddress(keyshare: string): Promise<string>;
  sendTransaction(
    protocolId: string,
    keyshare: string,
    transaction: string,
    userId: string
  ): Promise<string>;
  refresh(
    protocolId: string,
    keyshare: string,
    userId: string
  ): Promise<string>;
}
