// @ts-nocheck
import { SignerModule, KeyType } from '../SignerModule';

class TestSignerModule implements SignerModule {
  createAccount(
    walletId: string,
    protocolId: string,
    keyType: typeof KeyType[keyof typeof KeyType]
  ): Promise<string> {
    throw new Error('Method not implemented.');
  }
  getAddress(keyshare: string): Promise<string> {
    throw new Error('Method not implemented.');
  }
  sendTransaction(
    protocolId: string,
    keyshare: string,
    transaction: string
  ): Promise<string> {
    throw new Error('Method not implemented.');
  }
  refresh(protocolId: string, keyshare: string): Promise<string> {
    throw new Error('Method not implemented.');
  }
}

const testSignerModule = new TestSignerModule();

export default testSignerModule;
