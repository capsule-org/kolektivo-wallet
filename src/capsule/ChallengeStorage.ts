// eslint-disable-next-line max-classes-per-file
import { ec } from 'elliptic'
// @ts-ignore
import EllipticSignature from 'elliptic/lib/elliptic/ec/signature'
import DeviceCrypto, { AccessLevel } from 'react-native-device-crypto'

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
      biometryDescription: 'Authenticate yourself to sign the text',
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
