import userManagementClient from './UserManagementClient'
import { ChallengeStorage } from './ChallengeStorage'

export default class BiometricSessionManager {
  private userId: string
  private biometricStorage: ChallengeStorage
  public async setBiometrics() {
    await userManagementClient.addBiometrics(this.userId, {
      publicKey: await this.biometricStorage.getPublicKey(),
    })
  }

  constructor(userId: string, biometricStorage: ChallengeStorage) {
    this.userId = userId
    this.biometricStorage = biometricStorage
  }

  private cookie: string | undefined

  public async refreshBiometricsIfNeeded() {
    if (typeof this.cookie === 'string') {
      // this is how cookie is represented. We do parsing "manually" to avoid employing additional libs
      // Example cookie: capsule.sid=s%3Ad324cb79-96c8-4995-868b-4774ae2004ce.RZ2H%2BbendbOVXEBJ2tKVLatSh24SOxxQ%2F7A51lfdSoM; Path=/; Expires=Fri, 30 Dec 2022 18:31:47 GMT; HttpOnly; SameSite=Strict
      const expDate = this.cookie
        ?.split?.(';')
        ?.find((entry) => entry.trim().startsWith('Expires'))
        ?.split?.('=')?.[1]
      const isValid = expDate && new Date(expDate).valueOf() - Date.now() > 30000 // 30 seconds threshold
      if (isValid) {
        return
      }
    }

    const challenge = await userManagementClient.getBiometricsChallenge(this.userId)
    const message = challenge.data.challenge
    const signature = await this.biometricStorage.signChallenge(message)
    const response = await userManagementClient.verifyBiometricsChallenge(this.userId, {
      signature,
    })
    this.cookie = response.headers['set-cookie'][0]
  }
}
