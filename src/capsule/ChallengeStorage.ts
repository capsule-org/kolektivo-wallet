import elliptic from 'elliptic'
import crypto from 'crypto'

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

const ec = new elliptic.ec('p256')

const privateKey = '202d73cbde65f547c75613ace311393ac97f2556cbe3aca32bf48eb84ec2198c'
export class ChallengeReactNativeStorage extends ChallengeStorage {
  async getPublicKey(): Promise<string> {
    return '0483326f8677519eace4e8db81722399ac4b581a91236656359ebf3621ad3186fdf2e1fa04c9929d577c36ffb9e2ef6cfe325d1da7ffa4d0a596bf88d7e335baf2'
  }

  async signChallenge(message: string): Promise<Signature> {
    const hash = crypto.createHash('sha256')
    hash.update(message, 'utf8')
    const hashedMessage = hash.digest('base64')

    const signature = ec.keyFromPrivate(privateKey).sign(hashedMessage)
    return {
      r: signature.r.toString('hex'),
      s: signature.s.toString('hex'),
      recoveryParam: signature.recoveryParam as number,
    }
  }
}
