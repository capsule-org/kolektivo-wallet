// This is not actually a test in a way that we write, e.g., jest tests.
// We need to have it running inside the mobile app with native module by importing e.g., in App.ts

// @ts-ignore
import userManagementClient from '../UserManagementClient';
import {v4 as uuidv4} from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {USER_ID_TAG} from '../react-native/ReactNativeCapsuleWallet';
import {
  PublicKeyStatus,
  PublicKeyType,
} from '@usecapsule/user-management-client';
// @ts-ignore
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

export function getPortalBaseURL() {
  // if (location.hostname === "localhost" ) {
  //   return "http://localhost:3003"
  // }
  return 'https://app.beta.usecapsule.com';
}

function getWebAuthURLForCreate(
  webAuthId: string,
  userId: string,
  email: string,
  partnerId?: string
): string {
  const partnerIdQueryParam = partnerId ? `&partnerId=${partnerId}` : '';
  return `${getPortalBaseURL()}/web/users/${userId}/biometrics/${webAuthId}?email=${encodeURIComponent(
    email
  )}${partnerIdQueryParam}`;
}

function getWebAuthURLForLogin(
  sessionId: string,
  loginEncryptionPublicKey: string,
  email: string,
  partnerId?: string
): string {
  const partnerIdQueryParam = partnerId ? `&partnerId=${partnerId}` : '';
  return `${getPortalBaseURL()}/web/biometrics/login?email=${encodeURIComponent(
    email
  )}&sessionId=${sessionId}&encryptionKey=${loginEncryptionPublicKey}${partnerIdQueryParam}`;
}

const BIOMETRIC_VERIFICATION_TIME_MS = 15 * 60 * 1000;

function biometricVerifiedRecently(verifiedAt: number): boolean {
  return Date.now() - verifiedAt <= BIOMETRIC_VERIFICATION_TIME_MS;
}

async function isSessionActive(): Promise<boolean> {
  const res = await userManagementClient.touchSession();
  return (
    res.data.biometricVerifiedAt &&
    biometricVerifiedRecently(res.data.biometricVerifiedAt)
  );
}

export const loginFlow = async () => {
  const email = `test-${uuidv4()}@test.usecapsule.com`;
  const {userId} = await userManagementClient.createUser({
    email,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });
  await AsyncStorage.setItem(USER_ID_TAG, userId + '|' + email);

  const res = await userManagementClient.addSessionPublicKey(userId, {
    status: PublicKeyStatus.PENDING,
    type: PublicKeyType.WEB,
  });

  const link = getWebAuthURLForCreate(
    res.data.id,
    userId,
    `${userId}@usecapsule.com`,
    res.data.partnerId
  );
  console.log(link);
  InAppBrowser.open(link);
  while (true) {
    if (await isSessionActive()) {
      break;
    }
    console.log('Not active');
    await new Promise((res) => setTimeout(res, 1000));
  }
  InAppBrowser.close();
  console.log('active');

  await userManagementClient.logout();
  try {
    await userManagementClient.getWallets(userId);
  } catch (e) {
    // @ts-ignore
    if (e.response.status !== 401) {
      console.log('Login flow FAILED');
      return;
    }
    await userManagementClient.login(email);
    const session = await userManagementClient.touchSession();
    const link = getWebAuthURLForLogin(
      session.data.sessionId,
      'dummy',
      `${userId}@usecapsule.com`
    );

    console.log(link);
    await new Promise((res) => setTimeout(res, 2000));
    InAppBrowser.open(link);

    while (true) {
      if (await isSessionActive()) {
        break;
      }
      console.log('Not active');
      await new Promise((res) => setTimeout(res, 1000));
    }
    InAppBrowser.close();
    console.log('active');
  }
};

// disabled by default
// void loginFlow();
