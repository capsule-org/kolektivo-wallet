import DeviceCrypto, {
  AccessLevel,
  BiometryParams,
  KeyCreationParams,
} from 'react-native-device-crypto';
// @ts-ignore
import EllipticSignature from 'elliptic/lib/elliptic/ec/signature';
import { ec } from 'elliptic';
import { SessionStorage, Signature } from '../SessionStorage';
const PEM_HEADER = '-----BEGIN PUBLIC KEY-----';
const PEM_FOOTER = '-----END PUBLIC KEY-----';

/**
 * React Native implementation of SessionStorage
 * Uses the device key to manage session storage and recreate sessions that
 * have expired.
 */
export class ReactNativeSessionStorage extends SessionStorage {
  protected signOptions(): BiometryParams {
    return {
      biometryTitle: 'Authenticate',
      biometrySubTitle: 'Signing',
      biometryDescription: 'Authenticate yourself to sign the text',
    };
  }

  protected asymmetricKeyOptions(): KeyCreationParams {
    return {
      accessLevel: AccessLevel.ALWAYS,
      invalidateOnNewBiometry: false,
    };
  }

  private storageIdentifier() {
    return 'challenge-' + this.userId;
  }

  /**
   * Uses the device's enclave to generate or retrieve a session key.
   * @returns The public key of the challenge signer.
   */
  public async getPublicKey(): Promise<string> {
    const pemPublicKey = await DeviceCrypto.getOrCreateAsymmetricKey(
      this.storageIdentifier(),
      this.asymmetricKeyOptions()
    );

    const base64PublicKey = pemPublicKey
      .replace(PEM_FOOTER, '')
      .replace(PEM_HEADER, '')
      .trim();
    const bufferPublicKey = Buffer.from(base64PublicKey, 'base64');
    const publicKeyHexAsnPreamble = bufferPublicKey.toString('hex');
    const publicKeyHex = publicKeyHexAsnPreamble.slice(52);
    return publicKeyHex;
  }

  /**
   * Signs a challenge to refresh the session.
   * @param message The challenge to sign.
   * @returns The signed challenge.
   */
  public async signChallenge(message: string): Promise<Signature> {
    const signatureDERBase64 = await DeviceCrypto.sign(
      this.storageIdentifier(),
      message,
      this.signOptions()
    );

    const signatureDERBuffer = Buffer.from(signatureDERBase64, 'base64');
    const signatureDERHex = signatureDERBuffer.toString('hex');
    const signature = new EllipticSignature(
      signatureDERHex,
      'hex'
    ) as ec.Signature; // hack due to incorrect typings
    const cannonicalSignature = {
      r: signature.r.toString('hex'),
      s: signature.s.toString('hex'),
      recoveryParam: signature.recoveryParam as number,
    };
    return cannonicalSignature;
  }
}
