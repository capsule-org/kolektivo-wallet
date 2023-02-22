import { ensureLeading0x } from '@celo/base/lib/address';
import userManagementClient from './UserManagementClient';
import {
  USER_NOT_AUTHENTICATED_ERROR,
  USER_NOT_MATCHING_ERROR,
  USER_NOT_VERIFIED,
} from '@capsule/client/client';
import { CapsuleBaseWallet } from "./CapsuleWallet";
import {randomBytes} from "crypto";
import {Decrypt as ECIESDecrypt, Encrypt as ECIESEncrypt} from "@celo/utils/lib/ecies";
import {ec as EC} from "elliptic";
import {KeyType} from "./SignerModule";
import {KeyContainer} from "./KeyContainer";

/**
 * Used to convert hex to base64 string.
 * @param hex The hex string.
 * @returns The base64 string.
 */
export function hexToBase64(hex: string) {
  return Buffer.from(hex.replace('0x', ''), 'hex').toString('base64');
}

/**
 * Used to convert base64 to a hex string.
 * @param base64 The base64 string.
 * @returns The hex string.
 */
export function base64ToHex(base64: string) {
  return ensureLeading0x(Buffer.from(base64, 'base64').toString('hex'));
}

/**
 * Wrapper for request to refresh cookie and retry on cookies-related failures
 * @param request request function
 * @param reauthenticate function to refresh session cookies
 */
export async function requestAndReauthenticate<T>(
  request: () => Promise<T>,
  reauthenticate: () => Promise<void>
): Promise<T> {
  try {
    return await request();
  } catch (e: any) {
    const { data } = e.response;
    if (
      data === USER_NOT_MATCHING_ERROR ||
      data === USER_NOT_AUTHENTICATED_ERROR ||
      data === USER_NOT_VERIFIED
    ) {
      await reauthenticate();
      return await request();
    }
    throw e;
  }
}

// function uploadKeyshare(wallet: CapsuleBaseWallet, address: string) {
async function uploadKeyshare(wallet: CapsuleBaseWallet, address: string) {
  const share = await wallet.getKeyshare(address)
  const secret = randomBytes(32).toString('hex');
  const ec = new EC('secp256k1');
  const privKey = ec.keyFromPrivate(
    Buffer.from(secret, 'hex')
  );
  const pubKey = privKey.getPublic(false, 'hex');
  const publicKey = Buffer.from(pubKey, 'hex');
  const pubkey = Buffer.from(
    ec.keyFromPublic(publicKey).getPublic(false, 'hex'),
    'hex'
  ).subarray(1);
  const data = ECIESEncrypt(pubkey, Buffer.from(share, 'ucs2')).toString(
    'base64'
  );
  const userID = await wallet.getUserId()

  const { walletId } = KeyContainer.import(share);

  const result = await requestAndReauthenticate(
    () => userManagementClient.uploadTrasmissionKeyshare(userID, walletId, data),
    () => wallet.ensureSessionActive()
  );

  return result.data.id + "|" + secret;
}

async function retrieveKeyshare(message: string) {
  const [id, secret] = message.split("|");
  const response = await userManagementClient.getTrasmissionKeyshare(id as string)
  console.log(response, response.data)
  const data = response.data.encryptedShare
  const buf = Buffer.from(data as string, 'base64');
  return  ECIESDecrypt(
    Buffer.from(secret as string, 'hex'),
    buf
  ).toString('ucs2');
}

const TransitionHelper = {
  uploadKeyshare,
  retrieveKeyshare
}

const {
  createUser,
  verifyEmail,
  logout,
  verifyLogin,
  recoveryVerification,
  login,
} = userManagementClient;

export {
  createUser,
  verifyEmail,
  logout,
  verifyLogin,
  recoveryVerification,
  login,
  TransitionHelper
};
