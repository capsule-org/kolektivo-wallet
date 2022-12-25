import Client from '@capsule/client'
import { ensureLeading0x, normalizeAddressWith0x } from '@celo/base/lib/address'
import { CeloTx, RLPEncodedTx, Signer } from '@celo/connect'
import { EIP712TypedData, generateTypedDataHash } from '@celo/utils/lib/sign-typed-data-utils'
import { encodeTransaction, extractSignature, rlpEncodedTx } from '@celo/wallet-base'
import { fromRpcSig } from 'ethereumjs-util'
import { NativeModules } from 'react-native'
import Logger from 'src/utils/Logger'
import { PrivateKeyStorage, PrivateKeyStorageDefault } from './PrivateKeyStorage'

const { CapsuleSignerModule } = NativeModules

const userManagementClient = new Client({
  userManagementHost: 'http://usermanagementloadbalancer-461184073.us-west-1.elb.amazonaws.com/',
})

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
export class CapsuleSigner implements Signer {
  private account: string = ''
  private userId = 'fc347001-7ec1-4977-a109-e838b5f01c0b'
  private keyshareStorage: PrivateKeyStorage | undefined

  async loadKeyshare(keyshare: string) {
    await this.setAccount(keyshare)
    this.keyshareStorage = new PrivateKeyStorageDefault(this.account)
    this.keyshareStorage.setPrivateKey(keyshare)
  }

  async generateKeyshare(): Promise<string> {
    const walletInfo = await userManagementClient.createWallet(this.userId)
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
    const response = await userManagementClient.getWallets(userId)
    for (let i = 0; i < response.wallets.length; i++) {
      const wallet = response.wallets[i]
      if (wallet.address && wallet.address.toLowerCase() == address.toLowerCase()) {
        return wallet.id
      }
    }
    return undefined
  }

  private async prepSignMessage(userId: string, walletId: string, tx: string): Promise<any> {
    try {
      return await userManagementClient.preSignMessage(userId, walletId, tx)
    } catch (err) {
      Logger.debug(TAG, 'CAPSULE ERROR ', err)
    }
  }

  getKeyshare(): string | undefined {
    return this.keyshareStorage?.getPrivateKey()
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
    const signatureHex = await CapsuleSignerModule.sendTransaction(
      res.protocolId,
      this.keyshareStorage?.getPrivateKey(),
      tx
    )

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
