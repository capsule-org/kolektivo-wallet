import { CeloTx } from '@celo/connect'
import { EIP712TypedData } from '@celo/utils/lib/sign-typed-data-utils'
import * as ethUtil from 'ethereumjs-util'
import { ErrorMessages } from './ErrorMessages'
import { CapsuleBaseSigner } from './CapsuleSigner'
import { SignersStorage } from './SignersStorage'
import { SessionStorage } from './SessionStorage'
import SessionManager from './SessionManager'
import { logger } from './Logger'

const TAG = 'geth/CapsuleWallet'

export abstract class CapsuleBaseWallet {
  private signer: CapsuleBaseSigner | undefined
  private signersStorage = this.getSignersStorage()
  private sessionManager: SessionManager | undefined

  // ------------- Platform-specific functionalities -------------
  /**
   * Get instance of persistent storage for signers
   * @protected
   */
  protected abstract getSignersStorage(): SignersStorage;
  /**
   * Get signer instance from the userId
   * @param userId
   * @param ensureSessionActive helper to use by signer if the session is expired
   * @protected
   */
  protected abstract getCapsuleSigner(
    userId: string,
    ensureSessionActive: () => Promise<void>
  ): CapsuleBaseSigner;

  /**
   * Get storage instance for persisting session public key and signing messages.
   * @param userId
   * @protected
   */
  protected abstract getChallengeStorage(userId: string): SessionStorage;

  /**
   * Getter for user id as we do not require its presence while creating wallet.
   * @protected
   */
  protected abstract getUserId(): Promise<string>;

  // ------------- Public methods -------------

  /**
   * Send a public key to the server to allow session refreshing.
   * Requires usedId to be initialized.
   */
  public async initSessionManagement() {
    await this.initSessionManagerIfNeeded();
    await this.sessionManager!.setSessionKey();
  }

  /**
   * Add account to the wallet. Once initialized with a keyhare, the account is imported to the wallet.
   * If the keyshare is not provided, the new key account is generated and the recovery keyshare returned with a callback.
   * @param privateKey
   * @param onRecoveryKeyshare
   */
  public async createAccount(onRecoveryKeyshare: (keyshare: string) => void): Promise<string> {
    logger.info(`${TAG}@addAccount`, `Creating a new account`)
    const signer = await this.getSigner()
    const address = await signer.generateKeyshare(onRecoveryKeyshare)

    logger.info(`${TAG}@addAccount`, `Keyshare succesfully created`)
    await this.signersStorage.addAccount(address)
    return address
  }

  public async refresh(
    address: string,
    keyshare: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ) {
    const signer = await this.getSigner()
    await signer.refreshKeyshare(keyshare, address, onRecoveryKeyshare)
  }

  /**
   * @returns The addresses of all accounts that have been created with this wallet
   */
  public async getAccounts(): Promise<string[]> {
    return this.signersStorage.getAccounts()
  }

  /**
   * Add account to the wallet. Once initialized with a keyhare, the account is imported to the wallet.
   * If the keyshare is not provided, the new key account is generated and the recovery keyshare returned with a callback.
   * @param privateKey
   * @param onRecoveryKeyshare
   */
  public async importAccount(
    keyshare: string
  ): Promise<string> {
    const signer = await this.getSigner()
    const address = await signer.importKeyshare(keyshare)
    
    logger.info(`${TAG}@importAccount`, `Keyshare succesfully imported`)
    await this.signersStorage.addAccount(address)
    return address
  }

  /**
   * Signs and sends the transaction to the network
   * @param txParams Transaction to sign
   * @dev overrides WalletBase.signTransaction
   */
  public async signTransaction(txParams: CeloTx) {
    logger.info(
      `${TAG}@signTransaction`,
      `Signing transaction: ${JSON.stringify(txParams)}`
    );
    // Get the signer from the 'from' field
    const fromAddress = txParams.from!.toString()
    const signer = await this.getSigner()
    return signer.signRawTransaction(fromAddress, txParams)
  }

  /**
   * Sign the provided typed data with the given address
   * @param address The address with which to sign
   * @param typedData The data to sign
   * @dev overrides WalletBase.signTypedData
   */
  public async signTypedData(address: string, typedData: EIP712TypedData): Promise<string> {
    logger.info(
      `${TAG}@signTypedData`,
      `Signing typed DATA: ${JSON.stringify({ address, typedData })}`
    )
    const signer = await this.getSigner()
    const { v, r, s } = await signer.signTypedData(address, typedData)
    return ethUtil.toRpcSig(v, r, s)
  }

  /**
   * Export keyshare from the wallet
   * @param address
   */
  async getKeyshare(address: string): Promise<string> {
    const signer = await this.getSigner()
    const keyshare = await signer.getKeyshare(address)
    if (!keyshare) {
      logger.error(`${TAG}@addAccount`, `Missing private key`);
      throw new Error(ErrorMessages.CAPSULE_UNEXPECTED_ADDRESS);
    }
    return keyshare!;
  }

  // --------------------------

  /**
   * @returns Singleton instance of the Signer
   */
  private async getSigner(): Promise<CapsuleBaseSigner> {
    if (!this.signer) {
      const userId = await this.getUserId()
      this.signer = await this.getCapsuleSigner(userId, () => this.ensureSessionActive())
    }
    return this.signer
  }

  // We initialize the manager late to ensure the userID is available.
  private async initSessionManagerIfNeeded() {
    if (!this.sessionManager) {
      const userId = await this.getUserId();
      if (!userId) {
        throw Error('UserId not available during initializing session key');
      }
      this.sessionManager = new SessionManager(
        userId,
        this.getChallengeStorage(userId)
      );
    }
  }

  private async ensureSessionActive() {
    await this.initSessionManagerIfNeeded();
    await this.sessionManager!.refreshSessionIfNeeded();
  }
}
