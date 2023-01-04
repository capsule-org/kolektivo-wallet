import { USER_NOT_AUTHENTICATED_ERROR, USER_NOT_MATCHING_ERROR } from '@capsule/client'
import { ensureLeading0x, normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import { fromRpcSig } from 'ethereumjs-util'
import { NativeModules } from 'react-native'
import Logger from 'src/utils/Logger'
import { PrivateKeyStorage, PrivateKeyStorageReactNative } from './PrivateKeyStorage'
import userManagementClient from './UserManagementClient'

const { CapsuleSignerModule } = NativeModules

// userManagementClient.createUser({
//   email: "michal+911@usecapsule.com"
// }).then(r => console.log("USER: " + JSON.stringify(r))).catch(e => console.log("USER ERROR:" + e))

// userManagementClient.verifyEmail("7d040fec-825a-4ac9-bb5c-281e3af87d8e", {
//   verificationCode: "170510"
// }).then(r => console.log("VERIFY USER: " + JSON.stringify(r))).catch(e => console.log("VERIFY USER ERROR:" + e))

const TAG = 'geth/CapsuleSigner'
/**
 * Implements the signer interface using the CapsuleSignerModule
 */

async function requestAndReauthenticate<T>(
  request: () => Promise<T>,
  reauthenticate: () => Promise<void>
): Promise<T> {
  try {
    return await request()
  } catch (e) {
    const { data } = e.response
    if (data === USER_NOT_MATCHING_ERROR || data === USER_NOT_AUTHENTICATED_ERROR) {
      await reauthenticate()
      return await request()
    }
    throw e
  }
}

export abstract class CapsuleBaseSigner implements Signer {
  private account: string = ''
  private readonly userId: string
  private keyshareStorage: PrivateKeyStorage | undefined
  protected abstract getPrivateKeyStorage(account: string): PrivateKeyStorage
  private ensureSessionActive: () => Promise<void>

  async loadKeyshare(keyshare: string) {
    await this.setAccount(keyshare)
    this.keyshareStorage = this.getPrivateKeyStorage(this.account)
    await this.keyshareStorage.setPrivateKey(keyshare)
  }

  constructor(userId: string, ensureSessionActive: () => Promise<void>) {
    this.userId = userId
    this.ensureSessionActive = ensureSessionActive
  }

  async generateKeyshare(): Promise<string> {
    const walletInfo = await requestAndReauthenticate(
      () => userManagementClient.createWallet(this.userId),
      this.ensureSessionActive
    )
    Logger.debug(TAG, 'generateKeyshare ', walletInfo.walletId)
    Logger.debug(TAG, 'generateKeyshare ', walletInfo.protocolId)

    const keyshares = await Promise.all([
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'USER'),
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'RECOVERY'),
    ])
    const userPrivateKeyshare = keyshares[0]
    const recoveryPrivateKeyShare = keyshares[1]
    Logger.debug(TAG, 'CAPSULE KEYGEN ', userPrivateKeyshare)
    Logger.debug(TAG, 'CAPSULE KEYGEN ', recoveryPrivateKeyShare)
    Logger.debug(TAG, 'CAPSULE account address ', this.account)
    return userPrivateKeyshare
  }

  private async getWallet(userId: string, address: string): Promise<any> {
    const response = await requestAndReauthenticate(
      () => userManagementClient.getWallets(userId),
      this.ensureSessionActive
    )
    for (const wallet of response.data.wallets) {
      if (wallet.address && wallet.address.toLowerCase() == address.toLowerCase()) {
        return wallet.id
      }
    }
    return undefined
  }

  private async prepSignMessage(userId: string, walletId: string, tx: string): Promise<any> {
    try {
      return await requestAndReauthenticate(
        () => userManagementClient.preSignMessage(userId, walletId, tx),
        this.ensureSessionActive
      )
    } catch (err) {
      Logger.debug(TAG, 'CAPSULE ERROR ', err)
    }
  }

  async getKeyshare(): Promise<string | undefined> {
    return await this.keyshareStorage?.getPrivateKey()
  }

  public setNativeKey(nativeKey: string) {
    this.account = nativeKey
    this.keyshareStorage = this.getPrivateKeyStorage(this.account)
  }

  async setAccount(keyshare: string) {
    const address = await CapsuleSignerModule.getAddress(keyshare)
    this.account = normalizeAddressWith0x(address)
  }

  async signRawTransaction(tx: CeloTx) {
    if (!this.keyshareStorage?.getPrivateKey() || !this.account) {
      throw new Error(
        'Cannot signRawTransaction from CapsuleSigner before keygeneration or initialization'
      )
    }
    if (normalizeAddressWith0x(tx.from! as string) !== this.account) {
      throw new Error(`CapsuleSigner(${this.account}) cannot sign tx with 'from' ${tx.from}`)
    }
    const encodedTx = rlpEncodedTx(tx)
    const signature = await this.signTransaction(0, encodedTx)
    return encodeTransaction(encodedTx, signature)
  }

  async signTransaction(
    // addToV (chainId) is ignored here because geth will
    // build it based on its configuration
    addToV: number,
    encodedTx: RLPEncodedTx
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    const { gasPrice } = encodedTx.transaction
    if (gasPrice === '0x0' || gasPrice === '0x' || gasPrice === '0' || !gasPrice) {
      // Make sure we don't sign and send transactions with 0 gas price
      // This resulted in those TXs being stuck in the txpool for nodes running geth < v1.5.0
      throw new Error(`Preventing sign tx with 'gasPrice' set to '${gasPrice}'`)
    }

    const protocolId = CapsuleSignerModule.getProtocolId()
    Logger.debug(TAG, 'signTransaction Capsule protocolId', protocolId)
    Logger.debug(TAG, 'signTransaction Capsule tx', this.hexToBase64(encodedTx.rlpEncode))
    const signedTxBase64 = await CapsuleSignerModule.sendTransaction(
      this.keyshareStorage?.getPrivateKey(),
      protocolId,
      this.hexToBase64(encodedTx.rlpEncode)
    )
    return extractSignature(this.base64ToHex(signedTxBase64))
  }

  async signPersonalMessage(data: string): Promise<{ v: number; r: Buffer; s: Buffer }> {
    throw new Error('Not implemented')
    // Logger.info(`${TAG}@signPersonalMessage`, `Signing ${data}`)
    // const hash = ethUtil.hashPersonalMessage(Buffer.from(data.replace('0x', ''), 'hex'))
    // const signatureBase64 = await this.geth.signHash(hash.toString('base64'), this.account)
    // return ethUtil.fromRpcSig(this.base64ToHex(signatureBase64))
  }

  async signTypedData(
    typedData: EIP712TypedData,
    address: string = this.account
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    Logger.info(`${TAG}@signTypedData`, address + ` Signing typed data`)
    const hash = generateTypedDataHash(typedData)
    const tx = hash.toString('base64')
    Logger.info(`${TAG}@signTypedData transaction `, tx)

    const walletId = await this.getWallet(this.userId, address)
    Logger.info(`${TAG}@signTypedData`, 'walletId ' + walletId)

    const res = await this.prepSignMessage(this.userId, walletId, tx)
    Logger.info(`${TAG}@signTypedData`, 'protocolId ' + res.protocolId)
    Logger.info(`${TAG}@signTypedData`, `transaction ` + tx)
    const keyshare = await this.keyshareStorage?.getPrivateKey()
    const signatureHex = await CapsuleSignerModule.sendTransaction(res.protocolId, keyshare, tx)

    Logger.info(
      `${TAG}@signTypedData`,
      'SIGNATURE: ',
      signatureHex,
      JSON.stringify(fromRpcSig(signatureHex))
    )
    return fromRpcSig(signatureHex)
  }

  getNativeKey = () => this.account

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    // TODO
    return Buffer.from('', 'base64')
  }

  async computeSharedSecret(publicKey: string): Promise<Buffer> {
    // TODO
    return Buffer.from('', 'base64')
  }

  hexToBase64(hex: string) {
    return Buffer.from(hex.replace('0x', ''), 'hex').toString('base64')
  }

  base64ToHex(base64: string) {
    return ensureLeading0x(Buffer.from(base64, 'base64').toString('hex'))
  }
}

export class CapsuleReactNativeSigner extends CapsuleBaseSigner {
  protected getPrivateKeyStorage(account: string): PrivateKeyStorage {
    return new PrivateKeyStorageReactNative(account)
  }
}
