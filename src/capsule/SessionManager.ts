import userManagementClient from './UserManagementClient'
import { SessionStorage } from './SessionStorage'

export default class SessionManager {
  private userId: string
  private sessionStorage: SessionStorage
  public async setSessionKey() {
    return await userManagementClient.addBiometrics(this.userId, {
      publicKey: await this.sessionStorage.getPublicKey(),
    })
  }

  constructor(userId: string, sessionStorage: SessionStorage) {
    this.userId = userId
    this.sessionStorage = sessionStorage
  }

  public async refreshSessionIfNeeded() {
    const challenge = await userManagementClient.getBiometricsChallenge(this.userId)
    const message = challenge.data.challenge
    const signature = await this.sessionStorage.signChallenge(message)
    await userManagementClient.verifyBiometricsChallenge(this.userId, {
      signature,
    })
  }
}
