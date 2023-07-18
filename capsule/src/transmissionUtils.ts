// function uploadKeyshare(wallet: CapsuleBaseWallet, address: string) {
import {CapsuleBaseWallet} from './CapsuleWallet';
import {randomBytes} from 'crypto';
import {ec as EC} from 'elliptic';
import {
  Decrypt as ECIESDecrypt,
  Encrypt as ECIESEncrypt,
} from '@celo/utils/lib/ecies';
import {KeyContainer} from './KeyContainer';
import userManagementClient from './UserManagementClient';
import {requestAndReauthenticate} from './helpers';

export async function uploadKeyshare(
  wallet: CapsuleBaseWallet,
  address: string
) {
  const share = await wallet.getKeyshare(address);
  const secret = randomBytes(32).toString('hex');
  const ec = new EC('secp256k1');
  const privKey = ec.keyFromPrivate(Buffer.from(secret, 'hex'));
  const pubKey = privKey.getPublic(false, 'hex');
  const publicKey = Buffer.from(pubKey, 'hex');
  const pubkey = Buffer.from(
    ec.keyFromPublic(publicKey).getPublic(false, 'hex'),
    'hex'
  ).subarray(1);
  const data = ECIESEncrypt(pubkey, Buffer.from(share, 'ucs2')).toString(
    'base64'
  );

  const {walletId} = KeyContainer.import(share);
  // We access private field and method,
  // because we don't want to expose them to users
  // @ts-ignore
  const [userID] = await wallet.getUserId();

  const result = await requestAndReauthenticate(
    () =>
      userManagementClient.uploadTrasmissionKeyshare(userID, walletId, data),
    // @ts-ignore
    () => wallet.ensureSessionActive()
  );

  return result.data.id + '|' + secret;
}

export async function retrieveKeyshare(message: string) {
  const [id, secret] = message.split('|');
  const response = await userManagementClient.getTrasmissionKeyshare(
    id as string
  );
  const data = response.data.encryptedShare;
  const buf = Buffer.from(data as string, 'base64');
  return ECIESDecrypt(Buffer.from(secret as string, 'hex'), buf).toString(
    'ucs2'
  );
}
