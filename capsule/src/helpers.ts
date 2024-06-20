import { ensureLeading0x } from '@celo/base/lib/address';
import userManagementClient from './UserManagementClient';

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
 * Wrapper for request to refresh cookie and retry  failures
 * @param request request function
 * @param reauthenticate function to refresh session cookies
 */
export async function requestAndReauthenticate<T>(
  request: () => Promise<T>,
  reauthenticate: () => Promise<void>
): Promise<T> {
  try {
    return await request();
  } catch (_: any) {
    // TODO retry only on 403 and similar
    await reauthenticate();
    return await request();
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
