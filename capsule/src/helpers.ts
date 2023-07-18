import {ensureLeading0x} from '@celo/base/lib/address';
import userManagementClient from './UserManagementClient';
import {portalBase} from './config';

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

export function getWebAuthURLForCreate(
  webAuthId: string,
  userId: string,
  email: string,
  partnerId?: string
): string {
  const partnerIdQueryParam = partnerId ? `&partnerId=${partnerId}` : '';
  return `${portalBase}/web/users/${userId}/biometrics/${webAuthId}?email=${encodeURIComponent(
    email
  )}${partnerIdQueryParam}`;
}

export function getWebAuthURLForLogin(
  sessionId: string,
  loginEncryptionPublicKey: string,
  email: string,
  partnerId?: string
): string {
  const partnerIdQueryParam = partnerId ? `&partnerId=${partnerId}` : '';
  return `${portalBase}/web/biometrics/login?email=${encodeURIComponent(
    email
  )}&sessionId=${sessionId}&encryptionKey=${loginEncryptionPublicKey}${partnerIdQueryParam}`;
}

const BIOMETRIC_VERIFICATION_TIME_MS = 15 * 60 * 1000;

function biometricVerifiedRecently(verifiedAt: number): boolean {
  return Date.now() - verifiedAt <= BIOMETRIC_VERIFICATION_TIME_MS;
}

export async function isSessionActive(): Promise<boolean> {
  const res = await userManagementClient.touchSession();
  return (
    res.data.biometricVerifiedAt &&
    biometricVerifiedRecently(res.data.biometricVerifiedAt)
  );
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
