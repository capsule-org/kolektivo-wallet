import userManagementClient from './UserManagementClient'
import { ChallengeStorage } from './ChallengeStorage'

export default class BiometricSessionManager {
  private userId: string
  private biometricStorage: ChallengeStorage
  public async setBiometrics() {
    return await userManagementClient.addBiometrics(this.userId, {
      publicKey: await this.biometricStorage.getPublicKey(),
    })
  }

  constructor(userId: string, biometricStorage: ChallengeStorage) {
    this.userId = userId
    this.biometricStorage = biometricStorage
  }

  public async refreshBiometricsIfNeeded() {
    const challenge = await userManagementClient.getBiometricsChallenge(this.userId)
    const message = challenge.data.challenge
    const signature = await this.biometricStorage.signChallenge(message)
    await userManagementClient.verifyBiometricsChallenge(this.userId, {
      signature,
    })
  }
}
