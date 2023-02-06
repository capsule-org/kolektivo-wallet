import { ensureLeading0x } from '@celo/base/lib/address';
import userManagementClient from './UserManagementClient';
import {
  USER_NOT_AUTHENTICATED_ERROR,
  USER_NOT_MATCHING_ERROR,
  USER_NOT_VERIFIED,
} from '@capsule/client/client';

export function hexToBase64(hex: string) {
  return Buffer.from(hex.replace('0x', ''), 'hex').toString('base64');
}

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
    console.log(e.response, data);
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
};
