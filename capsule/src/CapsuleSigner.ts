import { normalizeAddressWith0x } from '@celo/base/lib/address';
import { CeloTx, EncodedTransaction, RLPEncodedTx } from '@celo/connect';
import {
  EIP712TypedData,
  generateTypedDataHash,
} from '@celo/utils/lib/sign-typed-data-utils';
import {
  encodeTransaction,
  extractSignature,
  rlpEncodedTx,
} from '@celo/wallet-base';
import * as ethUtil from 'ethereumjs-util';
import { fromRpcSig } from 'ethereumjs-util';
import { KeyContainer } from './KeyContainer';
import { logger } from './Logger';
import { base64ToHex, hexToBase64, requestAndReauthenticate } from './helpers';
import { PrivateKeyStorage } from './PrivateKeyStorage';
import userManagementClient from './UserManagementClient';
import { KeyType, SignerModule } from './SignerModule';

const TAG = 'Capsule/CapsuleSigner';

/**
 * CapsuleBaseSigner is the abstract class for managing Capsule accounts.
 * The signer is extended for platform-specific implementations for private key storage.
 * CapsuleBaseSigner handles the specific MPC cryptographic operations and should be interacted
 * with through a CapsuleBaseWallet and possibly via extension. 
 */
export abstract class CapsuleBaseSigner {
  private readonly userId: string;
  private ensureSessionActive: () => Promise<void>;

  /**
   * Constructs a new CapsuleBaseSigner object
   * @param userId UserId registered with the Capsule Server
   * @param ensureSessionActive A function that ensures an active Capsule session
   */
  constructor(userId: string, ensureSessionActive: () => Promise<void>) {
    this.userId = userId;
    this.ensureSessionActive = ensureSessionActive;
  }

  // ------------- Platform-specific functionalities -------------
  /**
   * Get the instance of the storage for setting and retrieving keyshare secret.
   * @param address Address of the account.
   * @protected
   * @category Platform-Specific
   */
  protected abstract getPrivateKeyStorage(address: string): PrivateKeyStorage;

  /**
   * Get the instance of the SignerModule for performing the MPC operations
   * @category Platform-Specific
   */
  protected abstract getSignerModule(): SignerModule;

  // ------------- Public methods -------------

  /**
   * Creates a new 2/3 Capsule account. Uploads encrypted backups to Capsule
   * server. This will result in the new keyshare persisted
   * on the device. The recovery keyshare is provided through the callback,
   * `onRecoveryKeyshare`. 
   * @param onRecoveryKeyshare The callback that will be passed the recovery 
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @returns Account address.
   * @category Public
   */
  public async generateKeyshare(
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    const walletInfo = await requestAndReauthenticate(
      () => userManagementClient.createWallet(this.userId),
      this.ensureSessionActive
    );
    const keyshares = await Promise.all([
      this.getSignerModule().createAccount(
        walletInfo.walletId,
        walletInfo.protocolId,
        KeyType.USER,
        this.userId
      ),
      this.getSignerModule().createAccount(
        walletInfo.walletId,
        walletInfo.protocolId,
        KeyType.RECOVERY,
        this.userId
      ),
    ]);

    const userPrivateKeyshare = keyshares[0];
    const recoveryPrivateKeyShare = keyshares[1];

    return this.encryptAndUploadKeys(
      userPrivateKeyshare,
      recoveryPrivateKeyShare,
      walletInfo.walletId,
      onRecoveryKeyshare
    );
  }

  /**
   * Performs the key refresh process with Capsule server. This generates new
   * keys which make the previous keys for this account unusable. Similar to 
   * `createAccount`, the new keys are stored on device and the recovery 
   * keyshare is provided through the callback. 
   * @param recoveryKey The recovery key sent to the user.
   * @category Platform-Specific The address of the account to refresh.
   * @param onRecoveryKeyshare The callback that will be passed the recovery 
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @returns The address of the account.
   * @category Public
   */
  public async refreshKeyshare(
    recoveryKey: string,
    address: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    const recoveryKeyContainer = JSON.parse(recoveryKey);
    const userKeyContainer = await this.getKeyContainer(address);

    const refreshResult = await requestAndReauthenticate(
      () =>
        userManagementClient.refreshKeys(
          this.userId,
          userKeyContainer.walletId
        ),
      this.ensureSessionActive
    );

    const keyshares = await Promise.all([
      this.getSignerModule().refresh(
        refreshResult.data.protocolId,
        recoveryKeyContainer.keyshare,
        this.userId
      ),
      this.getSignerModule().refresh(
        refreshResult.data.protocolId,
        userKeyContainer.keyshare,
        this.userId
      ),
    ]);

    const userPrivateKeyshare = keyshares[0];
    const recoveryPrivateKeyShare = keyshares[1];

    return this.encryptAndUploadKeys(
      userPrivateKeyshare,
      recoveryPrivateKeyShare,
      userKeyContainer.walletId,
      onRecoveryKeyshare
    );
  }

  /**
   * Import a previously created account to the wallet. The keyshare can be 
   * exported from `getKeyshare`. This can be useful for signing in on a new 
   * device with the same account. This should not be used if the user suspects
   * the device has been lost or compromised (use `refresh` instead for lost or
   * compromised keys).
   * @param keyshare The exported keyshare.
   * @returns The account address.
   * @category Public
   */
  public async importKeyshare(keyshare: string): Promise<string> {
    // TODO validate keyshare
    const userKeyContainer: KeyContainer = JSON.parse(keyshare);
    await this.setKeyContainer(userKeyContainer.address, userKeyContainer);
    return userKeyContainer.address;
  }

  /**
   * Download and decrypt the recovery share from Capsule Server. This is
   * useful if the user loses access to their recovery share. 
   * @remarks Note that this will likely require additional authentication
   * in the future.
   * @category Platform-Specific Address of the account.
   * @returns The recovery keyshare of the account.
   * @category Public
   */
  async getRecoveryKey(address: string): Promise<string> {
    const userKeyContainer = await this.getKeyContainer(address);
    // Get the encrypted keyshares from Capsule server
    const encryptedRecoveryBackup = await requestAndReauthenticate(
      () =>
        userManagementClient.getKeyshare(
          this.userId,
          userKeyContainer.walletId,
          KeyType.RECOVERY
        ),
      this.ensureSessionActive
    );

    const recoveryBackup = userKeyContainer.decrypt(
      encryptedRecoveryBackup.data.keyShare.encryptedShare
    );
    
    return recoveryBackup;
  }

  /**
   * Signs and submits a raw transaction using the provided account.
   * @category Platform-Specific Address of the account.
   * @param tx Raw transaction to sign.
   * @returns The RLP encoded transaction with the signature.
   * @category Public
   */
  public async signRawTransaction(
    address: string,
    tx: CeloTx
  ): Promise<EncodedTransaction> {
    if (normalizeAddressWith0x(tx.from! as string) !== address) {
      throw new Error(
        `CapsuleSigner(${address}) cannot sign tx with 'from' ${tx.from}`
      );
    }
    const encodedTx = rlpEncodedTx(tx);
    const signature = await this.signTransaction(address, 0, encodedTx);
    return encodeTransaction(encodedTx, signature);
  }

  /**
   * Signs and submits an RLP transaction using the provided account.
   * @category Platform-Specific Address of the account.
   * @param _addToV The amount to add to the "v" value.
   * @param encodedTx The RLP encoded transaction to sign.
   * @returns The signature.
   * @category Public
   */
  public async signTransaction(
    address: string,
    // addToV (chainId) is ignored here because geth will
    // build it based on its configuration
    _addToV: number,
    encodedTx: RLPEncodedTx
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    const { gasPrice } = encodedTx.transaction;
    if (
      gasPrice === '0x0' ||
      gasPrice === '0x' ||
      gasPrice === '0' ||
      !gasPrice
    ) {
      // Make sure we don't sign and send transactions with 0 gas price
      // This resulted in those TXs being stuck in the txpool for nodes running geth < v1.5.0
      throw new Error(
        `Preventing sign tx with 'gasPrice' set to '${gasPrice}'`
      );
    }

    const walletId = await this.getWallet(this.userId, address);
    const tx = hexToBase64(encodedTx.rlpEncode);
    const res = await this.preSignMessage(this.userId, walletId, tx);

    logger.debug(TAG, 'signTransaction Capsule protocolId', res.protocolId);
    logger.debug(TAG, 'signTransaction Capsule tx', tx);
    const key: KeyContainer = await this.getKeyContainer(address);
    const signedTxBase64 = await this.getSignerModule().sendTransaction(
      key.keyshare,
      res.protocolId,
      tx,
      this.userId
    );
    return extractSignature(base64ToHex(signedTxBase64));
  }

  /**
   * Signs a non-transaction message string.
   * @param address Address of the account.
   * @param data The message to sign.
   * @returns The signed message.
   * @category Public
   */
  public async signPersonalMessage(
    address: string,
    data: string
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    logger.info(`${TAG}@signPersonalMessage`, `Signing ${data}`);
    const hash = ethUtil.hashPersonalMessage(
      Buffer.from(data.replace('0x', ''), 'hex')
    );
    return this.signHash(hash.toString('base64'), address);
  }

  /**
   * Signs an EIP-712 typed data message.
   * @param address Address of the account.
   * @param typedData Typed data message to sign. 
   * @returns The signed message.
   * @category Public
   */
  public async signTypedData(
    address: string,
    typedData: EIP712TypedData
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    if (!address) {
      throw Error('signTypedData invoked with incorrect address');
    }
    logger.info(`${TAG}@signTypedData`, address + ` Signing typed data`);
    const hash = generateTypedDataHash(typedData);
    return this.signHash(hash.toString('base64'), address);
  }

  /**
   * Retrieve a keyshare that has been loaded into this signer. Useful for
   * exporting the keyshare onto a new device.
   * @param address Address of the account.
   * @returns The serialized keyshare.
   * @category Public
   */
  public async getKeyshare(address: string) {
    const key: KeyContainer = await this.getKeyContainer(address);
    return key.keyshare;
  }

  // --------------------------

  /**
   * Encrypts the user and recovery share using the asymmetric encryption keys
   * and uploads it to the Capsule server. Stores the user keyshare locally.
   * @param userKeyshare The user keyshare.
   * @param recoveryKeyshare The recovery keyshare.
   * @param walletId The walletId registered with Capsule.
   * @param onRecoveryKeyshare The callback that will be passed the recovery 
   * share. This can be used to securely send the recovery keyshare to the
   * users email or cloud backup.
   * @returns The account address.
   * @category Private
   */
  private async encryptAndUploadKeys(
    userKeyshare: string,
    recoveryKeyshare: string,
    walletId: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ): Promise<string> {
    const userAddress = normalizeAddressWith0x(
      await this.getSignerModule().getAddress(userKeyshare)
    );
    const recoveryAddress = normalizeAddressWith0x(
      await this.getSignerModule().getAddress(userKeyshare)
    );
    const userKeyContainer = new KeyContainer(
      walletId,
      userKeyshare,
      userAddress
    );
    const recoveryPrivateKeyContainer = new KeyContainer(
      walletId,
      recoveryKeyshare,
      recoveryAddress
    );
    const serializedRecovery = JSON.stringify(recoveryPrivateKeyContainer);
    const serializedUser = JSON.stringify(userKeyContainer);
    // Create a user backup that can be decrypted by recovery
    const encryptedUserBackup =
      recoveryPrivateKeyContainer.encryptForSelf(serializedUser);
    // Create a recovery backup that can be decrypted by user
    const encryptedRecoveryBackup =
      userKeyContainer.encryptForSelf(serializedRecovery);

    // Upload the encrypted keyshares to Capsule server
    await requestAndReauthenticate(
      () =>
        userManagementClient.uploadKeyshares(this.userId, walletId, [
          {
            encryptedShare: encryptedUserBackup,
            type: KeyType.USER,
          },
          {
            encryptedShare: encryptedRecoveryBackup,
            type: KeyType.RECOVERY,
          },
        ]),
      this.ensureSessionActive
    );

    // Set this after account setup has completed to ensure we're only tracking
    // fully created accounts on the device
    await this.setKeyContainer(userAddress, userKeyContainer);

    await onRecoveryKeyshare?.(serializedRecovery);
    return userAddress;
  }

  /**
   * Store the keyContainer locally using the private key storage.
   * @param address Address of the account.
   * @param keyContainer The keyContainer to store.
   * @category Private
   */
  private async setKeyContainer(
    address: string,
    keyContainer: KeyContainer
  ): Promise<void> {
    const serializedKeyContainer = JSON.stringify(keyContainer);
    return this.getPrivateKeyStorage(address).setPrivateKey(
      serializedKeyContainer
    );
  }

  /**
   * Retrieve the key container from the private key storage.
   * @param address Address of the account.
   * @returns The keyContainer.
   * @category Private
   */
  private async getKeyContainer(address: string): Promise<KeyContainer> {
    try {
      const keyContainer = await this.getPrivateKeyStorage(
        address
      ).getPrivateKey();
      if (!keyContainer) {
        throw new Error('Key is undefined in storage');
      }
      return KeyContainer.import(keyContainer);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(TAG, 'Failed to get keyshare', error);
      } else {
        logger.error(TAG, 'Unexpected error in retreiving keyshare');
      }
      throw error;
    }
  }

  /**
   * Get the walletId from the Capsule server using the account address.
   * @param userId UserId registered with the Capsule Server
   * @param address Address of the account.
   * @returns The UserId.
   * @category Private
   */
  private async getWallet(userId: string, address: string): Promise<any> {
    const response = await requestAndReauthenticate(
      () => userManagementClient.getWallets(userId),
      this.ensureSessionActive
    );
    for (const wallet of response.data.wallets) {
      if (
        wallet.address &&
        wallet.address.toLowerCase() == address.toLowerCase()
      ) {
        return wallet.id;
      }
    }
    return undefined;
  }

  /**
   * Prepares Capsule Server to sign a message and generates a protocolId for
   * the signing step.
   * @param userId UserId registered with the Capsule Server
   * @param walletId The walletId registered with Capsule.
   * @param tx The transaction to be signed.
   * @returns Result with the protocolId property.
   * @category Private
   */
  private async preSignMessage(
    userId: string,
    walletId: string,
    tx: string
  ): Promise<any> {
    try {
      return await requestAndReauthenticate(
        () => userManagementClient.preSignMessage(userId, walletId, tx),
        this.ensureSessionActive
      );
    } catch (err) {
      logger.debug(TAG, 'CAPSULE ERROR ', err);
    }
  }

  /**
   * Sign a hash using Capsule.
   * @param hash The hash to sign.
   * @param address Address of the account.
   * @returns The signed hash.
   * @category Private
   */
  private async signHash(
    hash: string,
    address: string
  ): Promise<{ v: number; r: Buffer; s: Buffer }> {
    const walletId = await this.getWallet(this.userId, address);
    logger.info(`${TAG}@signHash`, 'walletId ' + walletId);

    const res = await this.preSignMessage(this.userId, walletId, hash);
    logger.info(`${TAG}@signHash`, 'protocolId ' + res.protocolId);
    logger.info(`${TAG}@signHash`, `hash ` + hash);
    const keyContainer = await this.getKeyContainer(address);
    const signatureHex = await this.getSignerModule().sendTransaction(
      res.protocolId,
      keyContainer.keyshare,
      hash,
      this.userId
    );

    logger.info(
      `${TAG}@signHash`,
      'SIGNATURE: ',
      signatureHex,
      JSON.stringify(fromRpcSig(signatureHex))
    );
    const signature = fromRpcSig(signatureHex);
    return { v: signature.v, r: signature.r, s: signature.s };
  }
}
