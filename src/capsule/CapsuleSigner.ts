import { USER_NOT_AUTHENTICATED_ERROR, USER_NOT_MATCHING_ERROR } from '@capsule/client'
import { normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import { fromRpcSig } from 'ethereumjs-util'
import { NativeModules } from 'react-native'
import Logger from 'src/utils/Logger'
import { PrivateKeyStorage } from './PrivateKeyStorage'
import userManagementClient from './UserManagementClient'
import { base64ToHex, hexToBase64 } from './helpers'

const { CapsuleSignerModule } = NativeModules

const TAG = 'geth/CapsuleSigner'

/**
 * Wrapper for request to refresh cookie and retry on cookies-related failures
 * @param request request function
 * @param reauthenticate function to refresh session cookies
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

/**
 * Implements the signer interface using the CapsuleSignerModule
 */
export abstract class CapsuleBaseSigner implements Signer {
  private account: string | undefined
  private readonly userId: string
  private keyshareStorage: PrivateKeyStorage | undefined
  private ensureSessionActive: () => Promise<void>

  constructor(userId: string, ensureSessionActive: () => Promise<void>) {
    this.userId = userId
    this.ensureSessionActive = ensureSessionActive
  }

  // ------------- Platform-specific functionalities -------------
  /**
   * get instance of the storage for setting and retrieving keyshare secret.
   * @param account
   * @protected
   */
  protected abstract getPrivateKeyStorage(account: string): PrivateKeyStorage

  // ------------- Public methods -------------

  async loadKeyshare(keyshare: string) {
    await this.setAccount(keyshare)
    if (!this.account) {
      throw Error('loadKeyshare needs to be preceded with setting valid account id.')
    }
    this.keyshareStorage = this.getPrivateKeyStorage(this.account)
    await this.keyshareStorage.setPrivateKey(keyshare)
  }

  public async generateKeyshare(onRecoveryKeyshare?: (keyshare: string) => void): Promise<string> {
    const walletInfo = await requestAndReauthenticate(
      () => userManagementClient.createWallet(this.userId),
      this.ensureSessionActive
    )
    const keyshares = await Promise.all([
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'USER'),
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'RECOVERY'),
    ])

    const userPrivateKeyshare = keyshares[0]
    const recoveryPrivateKeyShare = keyshares[1]
    onRecoveryKeyshare?.(recoveryPrivateKeyShare)
    return userPrivateKeyshare
  }

  public async getKeyshare(): Promise<string | undefined> {
    return await this.keyshareStorage?.getPrivateKey()
  }

  public setNativeKey(nativeKey: string) {
    this.account = nativeKey
    this.keyshareStorage = this.getPrivateKeyStorage(this.account)
  }

  public async setAccount(keyshare: string) {
    const address = await CapsuleSignerModule.getAddress(keyshare)
    this.account = normalizeAddressWith0x(address)
  }

  public async signRawTransaction(tx: CeloTx) {
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

  public async signTransaction(
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
    Logger.debug(TAG, 'signTransaction Capsule tx', hexToBase64(encodedTx.rlpEncode))
    const signedTxBase64 = await CapsuleSignerModule.sendTransaction(
      this.keyshareStorage?.getPrivateKey(),
      protocolId,
      hexToBase64(encodedTx.rlpEncode)
    )
    return extractSignature(base64ToHex(signedTxBase64))
  }

  public async signPersonalMessage(data: string): Promise<{ v: number; r: Buffer; s: Buffer }> {
    throw new Error('Not implemented')
    // Logger.info(`${TAG}@signPersonalMessage`, `Signing ${data}`)
    // const hash = ethUtil.hashPersonalMessage(Buffer.from(data.replace('0x', ''), 'hex'))
    // const signatureBase64 = await this.geth.signHash(hash.toString('base64'), this.account)
    // return ethUtil.fromRpcSig(this.base64ToHex(signatureBase64))
  }

  public async signTypedData(
    typedData: EIP712TypedData,
    address: string | undefined = this.account
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    if (!address) {
      throw Error('signTypedData invoked with incorrect address')
    }
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

  public getNativeKey(): string {
    if (!this.account) {
      throw new Error('Native key not set')
    }
    return this.account
  }

  public async decrypt(ciphertext: Buffer): Promise<Buffer> {
    // TODO
    return Buffer.from('', 'base64')
  }

  public async computeSharedSecret(publicKey: string): Promise<Buffer> {
    // TODO
    return Buffer.from('', 'base64')
  }

  // --------------------------

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
}
