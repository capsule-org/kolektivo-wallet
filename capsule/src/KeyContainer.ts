import {
  Decrypt as ECIESDecrypt,
  Encrypt as ECIESEncrypt,
} from '@celo/utils/lib/ecies';
import {randomBytes} from 'crypto';

const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

/**
 * Manages information for a keyshare that must be persisted
 * Helps with encryption and decryption of Capsule backups
 */
export class KeyContainer {
  public walletId: string;
  public keyshare: string;
  // Can be derived from the keyshare but setting it once helps speed things up
  public address: string;
  public backupDecryptionKey: string;

  constructor(walletId: string, keyshare: string, address: string) {
    this.walletId = walletId;
    this.keyshare = keyshare;
    this.address = address;
    this.backupDecryptionKey = randomBytes(32).toString('hex');
  }

  static import(serializedContainer: string): KeyContainer {
    return Object.assign(
      new KeyContainer('', '', ''),
      JSON.parse(serializedContainer)
    );
  }

  getPublicDecryptionKey(): Buffer {
    const privKey = ec.keyFromPrivate(
      Buffer.from(this.backupDecryptionKey, 'hex')
    );
    const pubKey = privKey.getPublic(false, 'hex');
    return Buffer.from(pubKey, 'hex');
  }

  decompressPublicKey(publicKey: Buffer): Buffer {
    const EC = require('elliptic').ec;
    const ec = new EC('secp256k1');
    return Buffer.from(
      ec.keyFromPublic(publicKey).getPublic(false, 'hex'),
      'hex'
    ).slice(1);
  }

  encryptForSelf(backup: string): string {
    try {
      const pubkey = this.decompressPublicKey(this.getPublicDecryptionKey());
      const data = ECIESEncrypt(pubkey, Buffer.from(backup, 'ucs2')).toString(
        'base64'
      );
      return data;
    } catch (error: any) {
      throw Error('Error encrypting backup');
    }
  }

  decrypt(encryptedBackup: string) {
    try {
      const buf = Buffer.from(encryptedBackup, 'base64');
      const data = ECIESDecrypt(
        Buffer.from(this.backupDecryptionKey, 'hex'),
        buf
      );
      return data.toString('ucs2');
    } catch (error: any) {
      throw Error('Error decrypting backup');
    }
  }
}
