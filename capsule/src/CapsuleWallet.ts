import { CeloTx, EncodedTransaction } from '@celo/connect';
import { EIP712TypedData } from '@celo/utils/lib/sign-typed-data-utils';
import * as ethUtil from 'ethereumjs-util';
import { ErrorMessages } from './ErrorMessages';
import { CapsuleBaseSigner } from './CapsuleSigner';
import { SignersStorage } from './SignersStorage';
import { SessionStorage } from './SessionStorage';
import SessionManager from './SessionManager';
import { logger } from './Logger';
import userManagementClient from './UserManagementClient';
import { KeyType } from './SignerModule';
import { KeyContainer } from './KeyContainer';
import { requestAndReauthenticate } from './helpers';

const TAG = 'geth/CapsuleWallet';

/**
 * CapsuleBaseWallet is the abstract class for managing Capsule Wallets. The 
 * wallet is extended for platform-specific implementations for account and
 * sessions storage. CapsuleBaseWallet manages an instance of CapsuleBaseSigner
 * for performing cryptographic operations. One instance of CapsuleBaseWallet 
 * may be used to manage multiple Capsule accounts.
 */
export abstract class CapsuleBaseWallet {
  
  /**
   * Singleton instance for managing keys and performing crypto operations.
   */
  private signer: CapsuleBaseSigner | undefined;

  /**
   * Persistent storage for managing known accounts.
   */
  private signersStorage = this.getSignersStorage();

  /**
   * Manages temporary session keys.
   */
  private sessionManager: SessionManager | undefined;

  /**
   * Get instance of persistent storage for signers.
   * @category Platform-Specific
   * @protected
   */
  protected abstract getSignersStorage(): SignersStorage;

  /**
   * Get signer instance from the userId.
   * @param userId UserId registered with the Capsule Server
   * @param ensureSessionActive helper to use by signer if the session is expired
   * @category Platform-Specific
   * @protected
   */
  protected abstract getCapsuleSigner(
    userId: string,
    ensureSessionActive: () => Promise<void>
  ): CapsuleBaseSigner;

  /**
   * Get storage instance for persisting session public key and signing messages.
   * @param userId UserId registered with the Capsule Server
   * @category Platform-Specific
   * @protected
   */
  protected abstract getChallengeStorage(userId: string): SessionStorage;

  /**
   * Getter for userId as we do not require its presence while creating wallet.
   * Should return the userId from wherever it's stored.
   * @protected
   */
  protected abstract getUserId(): Promise<string>;

  // ------------- Public methods -------------

  /**
   * Send a public key to the server to allow session refreshing.
   * Requires userId to be initialized.
   * @category Public
   */
  public async initSessionManagement() {
    await this.initSessionManagerIfNeeded();
    await this.sessionManager!.setSessionKey();
  }

  /**
   * @deprecated
   * @category Deprecated
   */
  public init() {
    console.warn('No need to call init!');
  }

  /**
   * @deprecated
   * @param privateKey 
   * @category Deprecated
   */
  public addAccount(privateKey: string) {
    console.warn(
      'addAccount is provided for backward compatibility, but use importAccount!'
    );
    this.importAccount(privateKey);
  }

  /**
   * @deprecated
   * @param _account 
   * @param _passphrase 
   * @param _duration 
   * @category Deprecated
   */
  public async unlockAccount(
    _account: string,
    _passphrase: string,
    _duration: number
  ) {
    console.warn(
      'unlockAccount is provided for backward compatibility, but it is not used!'
    );
  }

  /**
   * @deprecated
   * @category Deprecated
   */
  public isAccountUnlocked(_address: string) {
    console.warn(
      'isAccountUnlocked is provided for backward compatibility, but it is not used!'
    );
    return true;
  }

  /**
   * Create a new Capsule account. Once initialized with a keyhare, the account
   * is imported to the wallet. This will result in the new keyshare persisted
   * on the device. The recovery keyshare is provided through the callback,
   * `onRecoveryKeyshare`. 
   * @param onRecoveryKeyshare The callback that will be passed the recovery 
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @category Public
   */
  public async createAccount(
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    logger.info(`${TAG}@addAccount`, `Creating a new account`);
    const signer = await this.getSigner();
    const address = await signer.generateKeyshare(onRecoveryKeyshare);

    logger.info(`${TAG}@addAccount`, `Keyshare succesfully created`);
    await this.signersStorage.addAccount(address);
    return address;
  }

  /**
   * Performs the key refresh process with Capsule server. This generates new
   * keys which make the previous keys for this account unusable. Similar to 
   * `createAccount`, the new keys are stored on device and the recovery 
   * keyshare is provided through the callback. 
   * @param keyshare One of user-custodied keyshares (either the device keyshare
   * or the recovery keyshare)
   * @param onRecoveryKeyshare The callback that will be passed the recovery
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @category Public
   */
  public async refresh(
    keyshare: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ) {
    const signer = await this.getSigner();
    const address = await signer.importKeyshare(keyshare);
    await signer.refreshKeyshare(keyshare, address, onRecoveryKeyshare);
  }

  /**
   * @returns The addresses of all accounts that have been created with this wallet.
   * @category Public
   */
  public async getAccounts(): Promise<string[]> {
    return this.signersStorage.getAccounts();
  }

  /**
   * Import a previously created account to the wallet. The keyshare can be 
   * exported from `getKeyshare`. This can be useful for signing in on a new 
   * device with the same account. This should not be used if the user suspects
   * the device has been lost or compromised (use `refresh` instead for lost or
   * compromised keys).
   * @param keyshare The exported keyshare
   * @category Public
   */
  public async importAccount(keyshare: string): Promise<string> {
    const signer = await this.getSigner();
    const address = await signer.importKeyshare(keyshare);

    logger.info(`${TAG}@importAccount`, `Keyshare succesfully imported`);
    await this.signersStorage.addAccount(address);
    return address;
  }

  /**
   * Uses the `rawRecoveryKeyshare` to download and decrypt the device
   * keyshare. This should be used when the user loses their device and only
   * has their backup recovery keyshare. Results in a key refresh.
   * @param rawRecoveryKeyshare The recovery keyshare originally sent to the
   * user's backup.
   * @param onNewRecoveryKeyshare The callback that will be passed the recovery
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @returns The account address.
   * @category Public
   */
  public async recoverAccountFromRecoveryKeyshare(
    rawRecoveryKeyshare: string,
    onNewRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    const recoveryKeyshare = KeyContainer.import(rawRecoveryKeyshare);
    const { walletId } = recoveryKeyshare;

    const userId = await this.getUserId();
    const result = await requestAndReauthenticate(
      () => userManagementClient.getKeyshare(userId, walletId, KeyType.USER),
      () => this.ensureSessionActive()
    );

    logger.info(TAG, 'User share Fetched!');

    const userShare = recoveryKeyshare.decrypt(
      result.data.keyShare.encryptedShare
    );
    logger.info(TAG, 'User share Decrypted!');

    await this.importAccount(userShare);
    logger.info(TAG, 'Share imported!');

    await this.refresh(
      recoveryKeyshare.address,
      rawRecoveryKeyshare,
      onNewRecoveryKeyshare
    );

    logger.info(TAG, 'Shares refreshed!');
    return recoveryKeyshare.address;
  }

  /**
   * Download and decrypt the recovery share from Capsule Server. This is
   * useful if the user loses access to their recovery share.
   * @param address 
   * @param onRecoveryKeyshare The callback that will be passed the recovery
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @returns 
   * @category Public
   */
  public async getRecoveryShare(
    address: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<void> {
    const signer = await this.getSigner();
    return await signer.getRecoveryKey(address, onRecoveryKeyshare);
  }

  /**
   * Signs and sends the transaction to the network.
   * @param txParams Transaction to sign.
   * @returns The signed transaction.
   * @category Public
   */
  public async signTransaction(txParams: CeloTx): Promise<EncodedTransaction> {
    logger.info(
      `${TAG}@signTransaction`,
      `Signing transaction: ${JSON.stringify(txParams)}`
    );
    // Get the signer from the 'from' field
    const fromAddress = txParams.from!.toString();
    const signer = await this.getSigner();
    return signer.signRawTransaction(fromAddress, txParams);
  }

  /**
   * Sign the provided typed data with the given address.
   * @param address The address with which to sign.
   * @param typedData The data to sign.
   * @returns Signed type data.
   * @category Public
   */
  public async signTypedData(
    address: string,
    typedData: EIP712TypedData
  ): Promise<string> {
    logger.info(
      `${TAG}@signTypedData`,
      `Signing typed DATA: ${JSON.stringify({ address, typedData })}`
    );
    const signer = await this.getSigner();
    const { v, r, s } = await signer.signTypedData(address, typedData);
    logger.info(`${TAG}@signTypedData - result`, { v, r, s });
    return ethUtil.toRpcSig(v, r, s);
  }

  /**
   * Export keyshare from the wallet
   * @param address The address of the account to get the keyshare of.
   * @param onDeviceKeyshare The callback that will be passed the device key
   * share. This can be used to securely send the device keyshare to the
   * users clipboard or QR code.
   * @category Public
   */
  public async getKeyshare(
    address: string,
    onDeviceKeyshare: (keyshare: string) => void
  ): Promise<void> {
    const signer = await this.getSigner();
    const keyshare = await signer.getKeyshare(address);
    if (!keyshare) {
      logger.error(`${TAG}@addAccount`, `Missing private key`);
      throw new Error(ErrorMessages.CAPSULE_UNEXPECTED_ADDRESS);
    }
    await onDeviceKeyshare(keyshare);
  }

  // --------------------------

  /**
   * @returns The singleton instance of the Signer.
   * @category Private
   */
  private async getSigner(): Promise<CapsuleBaseSigner> {
    if (!this.signer) {
      const userId = await this.getUserId();
      this.signer = await this.getCapsuleSigner(userId, () =>
        this.ensureSessionActive()
      );
    }
    return this.signer;
  }

  /**
   * We initialize the manager late to ensure the userID is available.
   * @category Private
   */
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

  /**
   * Refreshes the session if it has expired
   * @category Private
   */
  private async ensureSessionActive() {
    await this.initSessionManagerIfNeeded();
    await this.sessionManager!.refreshSessionIfNeeded();
  }
}
