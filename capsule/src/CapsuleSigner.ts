import {
  keyshareType,
  USER_NOT_AUTHENTICATED_ERROR,
  USER_NOT_MATCHING_ERROR,
} from '@capsule/client';
import {normalizeAddressWith0x} from '@celo/base/lib/address';
import {CeloTx, RLPEncodedTx} from '@celo/connect';
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
import {fromRpcSig} from 'ethereumjs-util';
import {KeyContainer} from './KeyContainer';
import {logger} from './Logger';
import {base64ToHex, hexToBase64} from './helpers';
import {PrivateKeyStorage} from './PrivateKeyStorage';
import userManagementClient from './UserManagementClient';
import {KeyType, SignerModule} from './SignerModule';

const TAG = 'Capsule/CapsuleSigner';

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
    return await request();
  } catch (e: any) {
    const {data} = e.response;
    if (
      data === USER_NOT_MATCHING_ERROR ||
      data === USER_NOT_AUTHENTICATED_ERROR
    ) {
      await reauthenticate();
      return await request();
    }
    throw e;
  }
}

export abstract class CapsuleBaseSigner {
  private readonly userId: string;
  private ensureSessionActive: () => Promise<void>;

  constructor(userId: string, ensureSessionActive: () => Promise<void>) {
    this.userId = userId;
    this.ensureSessionActive = ensureSessionActive;
  }

  // ------------- Platform-specific functionalities -------------
  /**
   * get the instance of the storage for setting and retrieving keyshare secret.
   * @param address
   * @protected
   */
  protected abstract getPrivateKeyStorage(address: string): PrivateKeyStorage;

  /**
   * get the instance of the SignerModule for performing the MPC operations
   */
  protected abstract getSignerModule(): SignerModule;

  // ------------- Public methods -------------

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

  public async importKeyshare(keyshare: string): Promise<string> {
    // TODO validate keyshare
    const userKeyContainer: KeyContainer = JSON.parse(keyshare);
    await this.setKeyContainer(userKeyContainer.address, userKeyContainer);
    return userKeyContainer.address;
  }

  // Download the encrypted user key
  // Use the provided recovery key to decrypt the user key
  // Perform a key refresh
  async recoverKeyshare(recoveryKeyshare: string) {
    const recoveryKey: KeyContainer = JSON.parse(recoveryKeyshare);

    // Get the encrypted keyshares from Capsule server
    const encryptedUserBackup: string = await requestAndReauthenticate(
      () =>
        userManagementClient.getKeyshare(
          this.userId,
          recoveryKey.walletId,
          keyshareType.USER
        ),
      this.ensureSessionActive
    );
    const userBackup = recoveryKey.decrypt(encryptedUserBackup);
    if (!userBackup.success) {
      const errorMsg = 'Failed to decrypt backup';
      logger.error(TAG, errorMsg);
      throw new Error(errorMsg);
    }
    this.importKeyshare(userBackup.backup);

    // TODO: Key Refresh
  }

  async getRecoveryKey(
    address: string,
    onRecoveryKeyshare: (keyshare: string) => void
  ) {
    const userKeyContainer = await this.getKeyContainer(address);
    // Get the encrypted keyshares from Capsule server
    const encryptedRecoveryBackup: string = await requestAndReauthenticate(
      () =>
        userManagementClient.getKeyshare(
          this.userId,
          userKeyContainer.walletId,
          keyshareType.RECOVERY
        ),
      this.ensureSessionActive
    );

    const recoveryBackup = userKeyContainer.decrypt(encryptedRecoveryBackup);
    if (!recoveryBackup.success) {
      const errorMsg = 'Failed to encrypt backups';
      logger.error(TAG, errorMsg);
      throw new Error(errorMsg);
    }
    const serializedRecovery = JSON.stringify(recoveryBackup);
    onRecoveryKeyshare?.(serializedRecovery);
  }

  public async signRawTransaction(address: string, tx: CeloTx) {
    if (normalizeAddressWith0x(tx.from! as string) !== address) {
      throw new Error(
        `CapsuleSigner(${address}) cannot sign tx with 'from' ${tx.from}`
      );
    }
    const encodedTx = rlpEncodedTx(tx);
    const signature = await this.signTransaction(address, 0, encodedTx);
    return encodeTransaction(encodedTx, signature);
  }

  public async signTransaction(
    address: string,
    // addToV (chainId) is ignored here because geth will
    // build it based on its configuration
    _addToV: number,
    encodedTx: RLPEncodedTx
  ): Promise<{v: number; r: Buffer; s: Buffer}> {
    const {gasPrice} = encodedTx.transaction;
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

  public async signPersonalMessage(
    address: string,
    data: string
  ): Promise<{v: number; r: Buffer; s: Buffer}> {
    logger.info(`${TAG}@signPersonalMessage`, `Signing ${data}`);
    const hash = ethUtil.hashPersonalMessage(
      Buffer.from(data.replace('0x', ''), 'hex')
    );
    return this.signHash(hash.toString('base64'), address);
  }

  public async signTypedData(
    address: string,
    typedData: EIP712TypedData
  ): Promise<{v: number; r: Buffer; s: Buffer}> {
    if (!address) {
      throw Error('signTypedData invoked with incorrect address');
    }
    logger.info(`${TAG}@signTypedData`, address + ` Signing typed data`);
    const hash = generateTypedDataHash(typedData);
    return this.signHash(hash.toString('base64'), address);
  }

  public async getKeyshare(address: string) {
    const key: KeyContainer = await this.getKeyContainer(address);
    return key.keyshare;
  }

  // --------------------------

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
    const encryptedUserBackup = recoveryPrivateKeyContainer.encryptForSelf(
      serializedUser
    );
    // Create a recovery backup that can be decrypted by user
    const encryptedRecoveryBackup = userKeyContainer.encryptForSelf(
      serializedRecovery
    );
    if (!encryptedUserBackup.success || !encryptedRecoveryBackup.success) {
      const errorMsg = 'Failed to encrypt backups';
      logger.error(TAG, errorMsg);
      throw new Error(errorMsg);
    }

    // Upload the encrypted keyshares to Capsule server
    await requestAndReauthenticate(
      () =>
        userManagementClient.uploadKeyshares(this.userId, walletId, [
          {
            encryptedShare: encryptedUserBackup.backup,
            type: keyshareType.USER,
          },
          {
            encryptedShare: encryptedRecoveryBackup.backup,
            type: keyshareType.RECOVERY,
          },
        ]),
      this.ensureSessionActive
    );

    logger.info('encryptAndUploadKeys success!');

    // Set this after account setup has completed to ensure we're only tracking
    // fully created accounts on the device
    await this.setKeyContainer(userAddress, userKeyContainer);

    onRecoveryKeyshare?.(serializedRecovery);
    return userAddress;
  }

  private async setKeyContainer(address: string, keyContainer: KeyContainer) {
    const serializedKeyContainer = JSON.stringify(keyContainer);
    return this.getPrivateKeyStorage(address).setPrivateKey(
      serializedKeyContainer
    );
  }

  private async getKeyContainer(address: string): Promise<KeyContainer> {
    try {
      const keyContainer = await this.getPrivateKeyStorage(
        address
      ).getPrivateKey();
      if (!keyContainer) {
        throw new Error('Key is undefined in storage');
      }
      return JSON.parse(keyContainer);
    } catch (error) {
      if (error instanceof Error) {
        logger.error(TAG, 'Failed to get keyshare', error);
      } else {
        logger.error(TAG, 'Unexpected error in retreiving keyshare');
      }
      throw error;
    }
  }

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
  private async signHash(
    hash: string,
    address: string
  ): Promise<{v: number; r: Buffer; s: Buffer}> {
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
    return {v: signature.v, r: signature.r, s: signature.s};
  }
}
