import { CeloTx } from '@celo/connect'
import { EIP712TypedData } from '@celo/utils/lib/sign-typed-data-utils'
import { UnlockableWallet } from '@celo/wallet-base'
import { RemoteWallet } from '@celo/wallet-remote'
import * as ethUtil from 'ethereumjs-util'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { CapsuleBaseSigner, CapsuleReactNativeSigner } from 'src/capsule/CapsuleSigner'
import Logger from 'src/utils/Logger'
import { ReactNativeSignersStorage, SignersStorage } from './SignersStorage'
import { ChallengeReactNativeStorage, ChallengeStorage } from './ChallengeStorage'
import BiometricSessionManager from './BiometricSessionManager'

const TAG = 'geth/CapsuleWallet'

export abstract class CapsuleBaseWallet
  extends RemoteWallet<CapsuleBaseSigner>
  implements UnlockableWallet {
  protected abstract getSignersStorage(): SignersStorage
  protected abstract getCapsuleSigner(): CapsuleBaseSigner
  protected abstract getChallengeStorage(userId: string): ChallengeStorage
  private signersStorage = this.getSignersStorage()
  // TODO remove me
  private userId = 'c67b0766-f339-4d86-9c82-fe2410b28460'
  // @ts-ignore
  private biometricSessionManager = new BiometricSessionManager(
    this.userId,
    this.getChallengeStorage(this.userId)
  )

  async loadAccountSigners(): Promise<Map<string, CapsuleBaseSigner>> {
    const addressToSigner = new Map<string, CapsuleBaseSigner>()
    const nativeKeys = await this.signersStorage.getAccounts()
    for (const nativeKey of nativeKeys) {
      const signer = this.getCapsuleSigner()
      signer.setNativeKey(nativeKey)
      addressToSigner.set(nativeKey, signer)
    }
    return addressToSigner
  }

  async getKeyshare(address: string): Promise<string> {
    const keyshare = await this.getSigner(address).getKeyshare()
    if (!keyshare) {
      Logger.error(`${TAG}@addAccount`, `Missing private key`)
      throw new Error(ErrorMessages.CAPSULE_UNEXPECTED_ADDRESS)
    }
    return keyshare!
  }

  async addAccount(privateKey?: string): Promise<string> {
    const signer = this.getCapsuleSigner()
    if (!privateKey) {
      Logger.info(`${TAG}@addAccount`, `Creating a new account`)
      privateKey = await signer.generateKeyshare()
      Logger.info(`${TAG}@addAccount`, privateKey)
      await signer.loadKeyshare(privateKey)
    } else {
      Logger.info(`${TAG}@addAccount`, `Adding a previously created account`)
      await signer.loadKeyshare(privateKey)
    }

    if (this.hasAccount(signer.getNativeKey())) {
      throw new Error(ErrorMessages.CAPSULE_ACCOUNT_ALREADY_EXISTS)
    }

    this.addSigner(signer.getNativeKey(), signer)
    Logger.info(`${TAG}@addAccount`, `Account added`)
    const nativeKey = signer.getNativeKey()
    await this.signersStorage.addAccount(nativeKey)
    return nativeKey
  }

  // TODO generate a session token for the wallet
  async unlockAccount(account: string, passphrase: string, duration: number) {
    Logger.info(`${TAG}@unlockAccount`, `Unlocking ${account}`)
    return true
  }

  // TODO check session token validity
  isAccountUnlocked(address: string) {
    return true
  }

  /**
   * Signs and sends the transaction to the network
   * @param txParams Transaction to sign
   * @dev overrides WalletBase.signTransaction
   */
  async signTransaction(txParams: CeloTx) {
    Logger.info(`${TAG}@signTransaction`, `Signing transaction: ${JSON.stringify(txParams)}`)
    // Get the signer from the 'from' field
    const fromAddress = txParams.from!.toString()
    const signer = this.getSigner(fromAddress)
    return signer.signRawTransaction(txParams)
  }

  /**
   * Sign the provided typed data with the given address
   * @param address The address with which to sign
   * @param typedData The data to sign
   * @dev overrides WalletBase.signTypedData
   */
  async signTypedData(address: string, typedData: EIP712TypedData): Promise<string> {
    Logger.info(
      `${TAG}@signTypedData`,
      `Signing typed DATA: ${JSON.stringify({ address, typedData })}`
    )
    const signer = this.getSigner(address)
    const { v, r, s } = await signer.signTypedData(typedData, address)
    return ethUtil.toRpcSig(v, r, s)
  }
}

class CapsuleReactNativeWallet extends CapsuleBaseWallet {
  getCapsuleSigner(): CapsuleBaseSigner {
    return new CapsuleReactNativeSigner()
  }

  getSignersStorage(): SignersStorage {
    return new ReactNativeSignersStorage()
  }

  getChallengeStorage(userId: string): ChallengeStorage {
    return new ChallengeReactNativeStorage(userId)
  }
}

export { CapsuleReactNativeWallet as CapsuleWallet }
