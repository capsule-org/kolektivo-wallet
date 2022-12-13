import { ensureLeading0x, normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import axios from 'axios'
import { NativeModules } from 'react-native'
import Logger from 'src/utils/Logger'
import { createWallet } from '@capsule/client/src/client/client'
import { fromRpcSig } from 'ethereumjs-util'

const { CapsuleSignerModule } = NativeModules

const TAG = 'geth/CapsuleSigner'
/**
 * Implements the signer interface using the CapsuleSignerModule
 */
export class CapsuleSigner implements Signer {
  private account: string = ''
  private keyshare: string | undefined = undefined
  private userId = 'fc347001-7ec1-4977-a109-e838b5f01c0b'

  async loadKeyshare(keyshare: string) {
    this.keyshare = keyshare
    await this.setAccount()
  }

  async generateKeyshare(): Promise<string> {
    const walletInfo = await createWallet(this.userId)
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
    this.keyshare = userPrivateKeyshare
    await this.setAccount()
    Logger.debug(TAG, 'CAPSULE account address ', this.account)
    return userPrivateKeyshare
  }

  private async getWallet(userId: string, address: string): Promise<any> {
    const response = await this.getWallets(userId)
    for (let i = 0; i < response.wallets.length; i++) {
      const wallet = response.wallets[i]
      if (wallet.address && wallet.address.toLowerCase() == address.toLowerCase()) {
        console.log(wallet.id)
        return wallet.id
      }
    }
    return undefined
  }

  private async getWallets(userId: string): Promise<any> {
    const baseRequest = axios.create({
      baseURL: 'http://UserManagementLoadBalancer-461184073.us-west-1.elb.amazonaws.com',
    })
    try {
      const res = await baseRequest.get<any>(`/users/${userId}/wallets`)
      return res.data
    } catch (err) {
      Logger.debug(TAG, 'CAPSULE ERROR ', err)
    }
  }

  private async prepSignMessage(userId: string, walletId: string, tx: string): Promise<any> {
    const body = { message: tx }
    const baseRequest = axios.create({
      baseURL: 'http://UserManagementLoadBalancer-461184073.us-west-1.elb.amazonaws.com',
    })
    try {
      const res = await baseRequest.post<any>(
        `/users/${userId}/wallets/${walletId}/messages/sign`,
        body
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

    const protocolId = CapsuleSignerModule.getProtocolId()
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
    Logger.info(`${TAG}@signTypedData`, address + ` Signing typed data`)
    const hash = generateTypedDataHash(typedData)
    const tx = hash.toString('base64')
    Logger.info(`${TAG}@signTypedData transaction `, tx)

    const walletId = await this.getWallet(this.userId, address)
    Logger.info(`${TAG}@signTypedData`, 'walletId ' + walletId)

    const res = await this.prepSignMessage(this.userId, walletId, tx)
    Logger.info(`${TAG}@signTypedData`, 'protocolId ' + res.protocolId)
    Logger.info(`${TAG}@signTypedData`, `transaction ` + tx)
    const signatureHex = await CapsuleSignerModule.sendTransaction(
      res.protocolId,
      this.keyshare,
      tx
    )

    Logger.info(`${TAG}@signTypedData`, 'SIGNATURE: ', signatureHex, fromRpcSig(signatureHex))
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
