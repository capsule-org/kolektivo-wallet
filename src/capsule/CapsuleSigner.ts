import { USER_NOT_AUTHENTICATED_ERROR, USER_NOT_MATCHING_ERROR } from '@capsule/client'
import { normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import * as ethUtil from 'ethereumjs-util'
import { fromRpcSig } from 'ethereumjs-util'
import { Logger } from 'Logger'
import { NativeModules } from 'react-native'
import { base64ToHex, hexToBase64 } from './helpers'
import { PrivateKeyStorage } from './PrivateKeyStorage'
import userManagementClient from './UserManagementClient'

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
  } catch (e: any) {
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
  private logger: Logger | undefined

  constructor(userId: string, ensureSessionActive: () => Promise<void>, logger?: Logger) {
    this.userId = userId
    this.ensureSessionActive = ensureSessionActive
    this.logger = logger
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
    try {
      await this.keyshareStorage.setPrivateKey(keyshare)
    } catch (error) {
      if (error instanceof Error) {
        this.logger?.error(TAG, 'Failed to set keyshare', error)
      } else {
        this.logger?.error(TAG, 'Unexpected error in storing keyshare')
      }
      throw error
    }
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

  public async refreshKeyshare(
    recoveryKeyshare: string,
    address: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    const walletId = await this.getWallet(this.userId, address)

    const refreshResult = await requestAndReauthenticate(
      () => userManagementClient.refreshKeys(this.userId, walletId),
      this.ensureSessionActive
    )

    const userKeyshare = await this.getKeyshare()
    if (!userKeyshare) {
      throw new Error('No user keyshare provided')
    }

    const keyshares = await Promise.all([
      CapsuleSignerModule.refresh(refreshResult.data.protocolId, recoveryKeyshare),
      CapsuleSignerModule.refresh(refreshResult.data.protocolId, userKeyshare),
    ])

    const userPrivateKeyshare = keyshares[0]
    const recoveryPrivateKeyShare = keyshares[1]

    this.keyshareStorage?.setPrivateKey(userPrivateKeyshare)
    onRecoveryKeyshare(recoveryPrivateKeyShare)

    return userPrivateKeyshare
  }

  public async getKeyshare(): Promise<string | null | undefined> {
    try {
      return await this.keyshareStorage?.getPrivateKey()
    } catch (error) {
      if (error instanceof Error) {
        this.logger?.error(TAG, 'Failed to get keyshare', error)
      } else {
        this.logger?.error(TAG, 'Unexpected error in retreiving keyshare')
      }
      return undefined
    }
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
    if (!this.getKeyshare() || !this.account) {
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
    this.logger?.debug(TAG, 'signTransaction Capsule protocolId', protocolId)
    this.logger?.debug(TAG, 'signTransaction Capsule tx', hexToBase64(encodedTx.rlpEncode))
    const signedTxBase64 = await CapsuleSignerModule.sendTransaction(
      this.getKeyshare(),
      protocolId,
      hexToBase64(encodedTx.rlpEncode)
    )
    return extractSignature(base64ToHex(signedTxBase64))
  }

  public async signPersonalMessage(data: string): Promise<{ v: number; r: Buffer; s: Buffer }> {
    if (!this.account) {
      throw Error('signPersonalMessage invoked with incorrect address')
    }
    this.logger?.info(`${TAG}@signPersonalMessage`, `Signing ${data}`)
    const hash = ethUtil.hashPersonalMessage(Buffer.from(data.replace('0x', ''), 'hex'))
    return this.signHash(hash.toString('base64'), this.account)
  }

  public async signTypedData(
    typedData: EIP712TypedData,
    address: string | undefined = this.account
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    if (!address) {
      throw Error('signTypedData invoked with incorrect address')
    }
    this.logger?.info(`${TAG}@signTypedData`, address + ` Signing typed data`)
    const hash = generateTypedDataHash(typedData)
    return this.signHash(hash.toString('base64'), address)
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

  private async preSignMessage(userId: string, walletId: string, tx: string): Promise<any> {
    try {
      return await requestAndReauthenticate(
        () => userManagementClient.preSignMessage(userId, walletId, tx),
        this.ensureSessionActive
      )
    } catch (err) {
      this.logger?.debug(TAG, 'CAPSULE ERROR ', err)
    }
  }
  private async signHash(
    hash: string,
    address: string
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    const walletId = await this.getWallet(this.userId, address)
    this.logger?.info(`${TAG}@signHash`, 'walletId ' + walletId)

    const res = await this.preSignMessage(this.userId, walletId, hash)
    this.logger?.info(`${TAG}@signHash`, 'protocolId ' + res.protocolId)
    this.logger?.info(`${TAG}@signHash`, `hash ` + hash)
    const keyshare = await this.getKeyshare()
    const signatureHex = await CapsuleSignerModule.sendTransaction(res.protocolId, keyshare, hash)

    this.logger?.info(
      `${TAG}@signHash`,
      'SIGNATURE: ',
      signatureHex,
      JSON.stringify(fromRpcSig(signatureHex))
    )
    const signature = fromRpcSig(signatureHex)
    return { v: signature.v, r: signature.r, s: signature.s }
  }
}
