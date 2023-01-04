import elliptic, { ec } from 'elliptic'
// @ts-ignore
import EllipticSignature from 'elliptic/lib/elliptic/ec/signature'
import crypto from 'crypto'
import DeviceCrypto, { AccessLevel } from 'react-native-device-crypto'
import userManagementClient from './UserManagementClient'
import { v4 as uuidv4 } from 'uuid'
import Logger from '../utils/Logger'

export abstract class ChallengeStorage {
  protected userId: string

  // returns public key and generates pair (if needed)
  public abstract getPublicKey(): Promise<string>

  public abstract signChallenge(message: string): Promise<Signature>

  public constructor(userId: string) {
    this.userId = userId
  }
}

export interface Signature {
  r: string
  s: string
  recoveryParam: number
}

const ecl = new elliptic.ec('p256')

const privateKey = '202d73cbde65f547c75613ace311393ac97f2556cbe3aca32bf48eb84ec2198c'
export class ChallengeReactNativeStorage extends ChallengeStorage {
  async getPublicKey(): Promise<string> {
    return '0483326f8677519eace4e8db81722399ac4b581a91236656359ebf3621ad3186fdf2e1fa04c9929d577c36ffb9e2ef6cfe325d1da7ffa4d0a596bf88d7e335baf2'
  }

  async signChallenge(message: string): Promise<Signature> {
    const hash = crypto.createHash('sha256')
    hash.update(message, 'utf8')
    const hashedMessage = hash.digest('hex')

    const signature = ecl.keyFromPrivate(privateKey).sign(hashedMessage)
    return {
      r: signature.r.toString('hex'),
      s: signature.s.toString('hex'),
      recoveryParam: signature.recoveryParam as number,
    }
  }
}
const test2 = async () => {
  const { userId } = await userManagementClient.createUser({
    email: `test-${uuidv4()}@test.usecapsule.com`,
  })
  Logger.debug('userId', userId)
  await userManagementClient.verifyEmail(userId, { verificationCode: '123456' })
  const pk2 = await DeviceCrypto.getOrCreateAsymmetricKey('userid', {
    accessLevel: AccessLevel.ALWAYS,
    invalidateOnNewBiometry: false,
  })
  // extracting the base64 from PEM (TODO)
  const base64Pk = pk2
    .split('-')
    .find((e) => e.length > 50)!
    .trim()
  const buffer = Buffer.from(base64Pk, 'base64')
  const bufString = buffer.toString('hex')
  const hexpk = bufString.slice(52)
  await userManagementClient.addBiometrics(userId, { publicKey: hexpk })
  const challenge = await userManagementClient.getBiometricsChallenge(userId)
  const message = challenge.data.challenge

  const publicKey = ecl.keyFromPublic(hexpk, 'hex')
  const hash = crypto.createHash('sha256')
  hash.update(message)
  const hashedMessage = hash.digest('hex')
  const signature = await DeviceCrypto.sign('userid', message, {
    biometryTitle: 'Authenticate',
    biometrySubTitle: 'Signing',
    biometryDescription: 'Authenticate your self to sign the text',
  })

  const buffer2 = Buffer.from(signature, 'base64')
  const sigHex = buffer2.toString('hex')
  const sigParsed = new EllipticSignature(sigHex, 'hex') as ec.Signature // hack due to incorrect typings
  const aigRR = {
    r: sigParsed.r.toString('hex'),
    s: sigParsed.s.toString('hex'),
    recoveryParam: sigParsed.recoveryParam as number,
  }

  const res = await userManagementClient.verifyBiometricsChallenge(userId, { signature: aigRR })
  console.log({ res })

  const RES = publicKey.verify(hashedMessage, aigRR)

  console.log(
    JSON.stringify(
      {
        publicKey: hexpk,
        publicKeyLen: hexpk.length,
        hash: hashedMessage,
        result: RES,
        signature: aigRR,
      },
      null,
      2
    )
  )
}

void test2()
