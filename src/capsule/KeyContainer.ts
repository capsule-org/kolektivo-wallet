import {
    Decrypt as ECIESDecrypt,
    Encrypt as ECIESEncrypt,
  } from '@celo/utils/lib/ecies'
import { randomBytes } from 'crypto'
import { ensureLeading0x } from '@celo/utils/lib/address'

const EC = require('elliptic').ec
const ec = new EC('secp256k1')

export interface EncryptionStatus {
  success: boolean
  backup: string
}

/**
 * Manages information for a keyshare that must be persisted
 * Helps with encryption and decryption of Capsule backups
 */
export class KeyContainer {
    public walletId: string
    public keyshare: string
    // Can be derived from the keyshare but setting it once helps speed things up
    public address: string
    public backupDecryptionKey: Buffer

    constructor(walletId: string, keyshare: string, address: string) {
        this.walletId = walletId
        this.keyshare = keyshare
        this.address = address
        this.backupDecryptionKey = randomBytes(32)
    }

    getPublicDecryptionKey(): Buffer {
        const privKey = ec.keyFromPrivate(this.backupDecryptionKey)
        const pubKey = ensureLeading0x(privKey.getPublic(true, 'hex'))
        return Buffer.from(ec.keyFromPublic(pubKey).getPublic(false, 'hex'), 'hex').slice(1)
    }

    encryptForSelf(backup: string): EncryptionStatus {
        try {
            const pubkey = this.getPublicDecryptionKey()
            const data = ECIESEncrypt(pubkey, Buffer.from(backup, 'ucs2')).toString('base64')
            return {
            success: true,
            backup: data,
            }
        } catch (error: any) {
            return { success: false, backup: "" }
        }
    }

    decrypt(encryptedBackup: string) {
        try {
            const buf = Buffer.from(encryptedBackup, 'base64')            
            const data = ECIESDecrypt(this.backupDecryptionKey, buf)
            return { success: true, backup: data.toString('ucs2') }
        } catch (error: any) {
            return { success: false, backup: "" }
        }
    }
}

