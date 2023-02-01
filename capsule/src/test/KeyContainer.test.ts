import { KeyContainer } from "../KeyContainer"

const testWalletId = 'testWalletId'
const testKeyshare = 'testKeyshare'
const testAddress = '0xtest'
const backup = "hello capsule"

describe('KeyContainer tests', () => {
    test('KeyContainer can encrypt and decrypt a backup', async () => {
        const keyContainer = new KeyContainer(testWalletId, testKeyshare, testAddress)
        expect(keyContainer.backupDecryptionKey).not.toBeUndefined()
        const encryptedMsg = keyContainer.encryptForSelf(backup)
        expect(encryptedMsg.success).toBeTruthy()
        const backupDecrypted = keyContainer.decrypt(encryptedMsg.backup)
        expect(backupDecrypted.success).toBeTruthy()
        expect(backupDecrypted.backup).toEqual(backup)
    })

    test('KeyContainer cannot decrypt if the key is mismatched', async () => {
        const keyContainer = new KeyContainer(testWalletId, testKeyshare, testAddress)
        const keyContainerWrong = new KeyContainer(testWalletId, testKeyshare, testAddress)
        expect(keyContainer.backupDecryptionKey).not.toBeUndefined()
        const encryptedMsg = keyContainer.encryptForSelf(backup)
        expect(encryptedMsg.success).toBeTruthy()
        // Try decrypting with another key
        const backupDecrypted = keyContainerWrong.decrypt(encryptedMsg.backup)
        expect(backupDecrypted.success).toBeFalsy()
    })
})