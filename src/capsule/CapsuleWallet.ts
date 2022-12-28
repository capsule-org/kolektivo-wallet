import { CeloTx } from '@celo/connect'
import { EIP712TypedData } from '@celo/utils/lib/sign-typed-data-utils'
import { UnlockableWallet } from '@celo/wallet-base'
import { RemoteWallet } from '@celo/wallet-remote'
import * as ethUtil from 'ethereumjs-util'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { CapsuleSigner } from 'src/capsule/CapsuleSigner'
import Logger from 'src/utils/Logger'
import { ChallengeStorageDefault } from './ChallengeStorage'
import userManagementClient from './UserManagementClient'

const TAG = 'geth/CapsuleWallet'

export class CapsuleWallet extends RemoteWallet<CapsuleSigner> implements UnlockableWallet {
  // TODO remove me
  private userId = 'c67b0766-f339-4d86-9c82-fe2410b28460'
  private biometricStorage = new ChallengeStorageDefault(this.userId)

  public async setBiometrics() {
    return await userManagementClient.addBiometrics(this.userId, {
      publicKey: await this.biometricStorage.getPublicKey(),
    })
  }

  private cookie: string | undefined

  public async refreshBiometricsIfNeeded() {
    if (typeof this.cookie === 'string') {
      // this is how cookie is represented. We do parsing "manually" to avoid employing additional libs
      const expDate = this.cookie.split(';')[2].split('=')[1]
      const date = new Date(expDate)
      const isValid = date.valueOf() - Date.now() > 30000 // 30 seconds threshold
      if (isValid) {
        return
      }
    }
    const challenge = await userManagementClient.getBiometricsChallenge(this.userId)
    const message = challenge.data.challenge
    const signature = await this.biometricStorage.signChallenge(message)
    const response = await userManagementClient.verifyBiometricsChallenge(this.userId, {
      signature,
    })
    this.cookie = response.headers['set-cookie'][0]
  }

  // Called on init to load existing wallets
  // Not applicable for CapsuleWallet
  async loadAccountSigners(): Promise<Map<string, CapsuleSigner>> {
    return new Map<string, CapsuleSigner>()
  }

  getKeyshare(address: string): string {
    const keyshare = this.getSigner(address).getKeyshare()
    if (!keyshare) {
      Logger.error(`${TAG}@addAccount`, `Missing private key`)
      throw new Error(ErrorMessages.CAPSULE_UNEXPECTED_ADDRESS)
    }
    return keyshare!
  }

  async addAccount(privateKey: string): Promise<string> {
    const signer = new CapsuleSigner()
    if (!privateKey) {
      Logger.info(`${TAG}@addAccount`, `Creating a new account`)
      privateKey = await signer.generateKeyshare()
      Logger.info(`${TAG}@addAccount`, privateKey)
    } else {
      Logger.info(`${TAG}@addAccount`, `Adding a previously created account`)
      signer.loadKeyshare(privateKey)
    }

    if (this.hasAccount(signer.getNativeKey())) {
      throw new Error(ErrorMessages.CAPSULE_ACCOUNT_ALREADY_EXISTS)
    }

    this.addSigner(signer.getNativeKey(), signer)
    Logger.info(`${TAG}@addAccount`, `Account added`)
    return signer.getNativeKey()
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
