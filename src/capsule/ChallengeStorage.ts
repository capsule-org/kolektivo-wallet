// eslint-disable-next-line max-classes-per-file
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

const PEM_HEADER = '-----BEGIN PUBLIC KEY-----'
const PEM_FOOTER = '-----END PUBLIC KEY-----'
export class ChallengeReactNativeStorage extends ChallengeStorage {
  private storageIdentifier() {
    return 'challenge-' + this.userId
  }
  async getPublicKey(): Promise<string> {
    const pemPublicKey = await DeviceCrypto.getOrCreateAsymmetricKey(this.storageIdentifier(), {
      accessLevel: AccessLevel.ALWAYS,
      invalidateOnNewBiometry: false,
    })

    const base64PublicKey = pemPublicKey.replace(PEM_FOOTER, '').replace(PEM_HEADER, '').trim()
    const bufferPublicKey = Buffer.from(base64PublicKey, 'base64')
    const publicKeyHexAsnPreamble = bufferPublicKey.toString('hex')
    const publicKeyHex = publicKeyHexAsnPreamble.slice(52)
    return publicKeyHex
  }

  async signChallenge(message: string): Promise<Signature> {
    const signatureDERBase64 = await DeviceCrypto.sign(this.storageIdentifier(), message, {
      biometryTitle: 'Authenticate',
      biometrySubTitle: 'Signing',
      biometryDescription: 'Authenticate your self to sign the text',
    })

    const signatureDERBuffer = Buffer.from(signatureDERBase64, 'base64')
    const signatureDERHex = signatureDERBuffer.toString('hex')
    const signature = new EllipticSignature(signatureDERHex, 'hex') as ec.Signature // hack due to incorrect typings
    const cannonicalSignature = {
      r: signature.r.toString('hex'),
      s: signature.s.toString('hex'),
      recoveryParam: signature.recoveryParam as number,
    }
    return cannonicalSignature
  }
}

export class ChallengeFakeReactNativeStorage extends ChallengeStorage {
  private static privateKey = '202d73cbde65f547c75613ace311393ac97f2556cbe3aca32bf48eb84ec2198c'
  async getPublicKey(): Promise<string> {
    return '0483326f8677519eace4e8db81722399ac4b581a91236656359ebf3621ad3186fdf2e1fa04c9929d577c36ffb9e2ef6cfe325d1da7ffa4d0a596bf88d7e335baf2'
  }

  async signChallenge(message: string): Promise<Signature> {
    const hash = crypto.createHash('sha256')
    hash.update(message, 'utf8')
    const hashedMessage = hash.digest('hex')

    const signature = ecl
      .keyFromPrivate(ChallengeFakeReactNativeStorage.privateKey)
      .sign(hashedMessage)
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
  const pemPublicKey = await DeviceCrypto.getOrCreateAsymmetricKey('userid', {
    accessLevel: AccessLevel.ALWAYS,
    invalidateOnNewBiometry: false,
  })

  const base64PublicKey = pemPublicKey.replace(PEM_FOOTER, '').replace(PEM_HEADER, '').trim()
  const bufferPublicKey = Buffer.from(base64PublicKey, 'base64')
  const publicKeyHexAsnPreamble = bufferPublicKey.toString('hex')
  const publicKeyHex = publicKeyHexAsnPreamble.slice(52)
  await userManagementClient.addBiometrics(userId, { publicKey: publicKeyHex })
  const challenge = await userManagementClient.getBiometricsChallenge(userId)
  const message = challenge.data.challenge

  const publicKey = ecl.keyFromPublic(publicKeyHex, 'hex')
  const messageHash = crypto.createHash('sha256')
  messageHash.update(message)
  const hashedMessage = messageHash.digest('hex')
  const signatureDERBase64 = await DeviceCrypto.sign('userid', message, {
    biometryTitle: 'Authenticate',
    biometrySubTitle: 'Signing',
    biometryDescription: 'Authenticate your self to sign the text',
  })

  const signatureDERBuffer = Buffer.from(signatureDERBase64, 'base64')
  const signatureDERHex = signatureDERBuffer.toString('hex')
  const signature = new EllipticSignature(signatureDERHex, 'hex') as ec.Signature // hack due to incorrect typings
  const cannonicalSignature = {
    r: signature.r.toString('hex'),
    s: signature.s.toString('hex'),
    recoveryParam: signature.recoveryParam as number,
  }

  const res = await userManagementClient.verifyBiometricsChallenge(userId, {
    signature: cannonicalSignature,
  })
  console.log({ res })

  const RES = publicKey.verify(hashedMessage, cannonicalSignature)

  console.log(
    JSON.stringify(
      {
        publicKey: publicKeyHex,
        publicKeyLen: publicKeyHex.length,
        hash: hashedMessage,
        result: RES,
        signature: cannonicalSignature,
      },
      null,
      2
    )
  )
}

// void test2()
