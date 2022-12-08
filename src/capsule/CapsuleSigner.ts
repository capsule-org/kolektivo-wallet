import { ensureLeading0x, normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import axios from 'axios'
import * as ethUtil from 'ethereumjs-util'
import { NativeModules } from 'react-native'
import Logger from 'src/utils/Logger'

const { CapsuleSignerModule } = NativeModules

const TAG = 'geth/CapsuleSigner'
/**
 * Implements the signer interface using the CapsuleSignerModule
 */
export class CapsuleSigner implements Signer {
  private account: string = ''
  private keyshare: string | undefined = undefined
  private walletId: string = 'f75a516a-2a39-4ff1-a7ae-994824db59eb'

  async loadKeyshare(keyshare: string) {
    this.keyshare = keyshare
    await this.setAccount()
  }

  async generateKeyshare(): Promise<string> {
    //const walletInfo = await this.createWallet('fc347001-7ec1-4977-a109-e838b5f01c0b')
    const walletInfo = {
      walletId: this.walletId,
      protocolId: '8e1ead21-a214-49c8-b645-923cd479e4c3',
    }
    Logger.debug(TAG, 'generateKeyshare ', walletInfo.walletId)
    Logger.debug(TAG, 'generateKeyshare ', walletInfo.protocolId)

    const keyshares = await Promise.all([
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'USER'),
      CapsuleSignerModule.createAccount(walletInfo.walletId, walletInfo.protocolId, 'RECOVERY'),
    ])
    let userPrivateKeyshare = keyshares[0]
    let recoveryPrivateKeyShare = keyshares[1]
    Logger.debug(TAG, 'CAPSULE KEYGEN ', userPrivateKeyshare)
    Logger.debug(TAG, 'CAPSULE KEYGEN ', recoveryPrivateKeyShare)
    this.keyshare = userPrivateKeyshare
    await this.setAccount()
    Logger.debug(TAG, 'CAPSULE account address ', this.account)
    return userPrivateKeyshare
  }

  private async createWallet(userId: string): Promise<WalletInfo> {
    const baseRequest = axios.create({
      baseURL: 'http://UserManagementLoadBalancer-461184073.us-west-1.elb.amazonaws.com',
    })
    const res = await baseRequest.post<any>(`/users/${userId}/wallets`)
    return res.data
  }

  private async prepSignMessage(userId: string, walletId: string, tx: string): Promise<any> {
    const body = { transaction: tx }
    const config = { headers: { 'Content-Type': 'application/json' } }
    const baseRequest = axios.create({
      baseURL: 'http://UserManagementLoadBalancer-461184073.us-west-1.elb.amazonaws.com',
    })
    try {
      const res = await baseRequest.post<any>(
        `/users/${userId}/wallets/${walletId}/sign`,
        body,
        config
      )
      return res.data
    } catch (err) {
      Logger.debug(TAG, 'CAPSULE ERROR ', err)
    }
  }

  getKeyshare(): string | undefined {
    return this.keyshare
  }

  async setAccount() {
    const address = await CapsuleSignerModule.getAddress(this.keyshare)
    this.account = normalizeAddressWith0x(address)
  }

  async signRawTransaction(tx: CeloTx) {
    if (!this.keyshare || !this.account) {
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

    let protocolId = CapsuleSignerModule.getProtocolId()
    Logger.debug(TAG, 'signTransaction Capsule protocolId', protocolId)
    Logger.debug(TAG, 'signTransaction Capsule tx', this.hexToBase64(encodedTx.rlpEncode))
    const signedTxBase64 = await CapsuleSignerModule.sendTransaction(
      this.keyshare,
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
    // throw new Error('Not implemented')
    Logger.info(`${TAG}@signTypedData`, address + ` Signing typed data`)
    const hash = generateTypedDataHash(typedData)
    const tx = hash.toString('base64')
    Logger.info(`${TAG}@signTypedData`, tx)
    const res = await this.prepSignMessage(
      'fc347001-7ec1-4977-a109-e838b5f01c0b',
      this.walletId,
      tx
    )
    //const protocolId = 'c7beb85b-fe49-4ace-8144-bc90b34b9cd3'
    Logger.info(`${TAG}@signTypedData`, 'protocolId ' + res.protocolId)
    const signatureBase64 = await CapsuleSignerModule.sendTransaction(
      res.protocolId,
      this.keyshare,
      tx
    )
    return ethUtil.fromRpcSig(this.base64ToHex(signatureBase64))
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
