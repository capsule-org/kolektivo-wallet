import userManagementClient from '../UserManagementClient'
import { TestCapsuleSigner } from './TestCapsuleSigner'
import TestSignerModule  from './TestSignerModule'

describe('Capsule Signer tests', () => {
    test('CapsuleSigner can generate a key', async () => {
        const signer = new TestCapsuleSigner("userId", () =>  new Promise<void>((resolve) => {resolve()}))
        
        // Mock the calls in UserManagementClient and CapsuleSignerModule
        const createWalletResp: any = {
            protocolId: 'mockProtocolId',
            walletId: 'mockWalletId'
          }
        const mockCreateWallet = jest.spyOn(userManagementClient, "createWallet")
        mockCreateWallet.mockImplementation(() => Promise.resolve(createWalletResp))
        const mockuploadKeyshares = jest.spyOn(userManagementClient, "uploadKeyshares")
        mockuploadKeyshares.mockImplementation(() => Promise.resolve())
          
        const mockCreateAccount = jest.spyOn(TestSignerModule,"createAccount")
        mockCreateAccount.mockImplementation(() => Promise.resolve("mockedKeyshare"))
        const mockGetAddress = jest.spyOn(TestSignerModule,"getAddress")
        mockGetAddress.mockImplementation(() => Promise.resolve("mockedAddress"))
        

        const onRecovery = jest.fn()
        const address = signer.generateKeyshare(onRecovery)
        expect(address).toEqual("mockedAddress")
        expect(onRecovery).toBeCalledWith("mockedKeyshare")
    })
})