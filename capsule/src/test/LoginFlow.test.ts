// This is not actually a test in a way that we write, e.g., jest tests.
// We need to have it running inside the mobile app with native module by importing e.g., in App.ts

// @ts-ignore
import userManagementClient from '../UserManagementClient';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_ID_TAG } from '../react-native/ReactNativeCapsuleWallet';
import { ReactNativeSessionStorage } from '../react-native/ReactNativeSessionStorage';

const completeFlowWithServer = async () => {
  const email = `test-${uuidv4()}@test.usecapsule.com`;
  const { userId } = await userManagementClient.createUser({
    email,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });
  await AsyncStorage.setItem(USER_ID_TAG, userId);

  const storage = new ReactNativeSessionStorage(userId);

  await userManagementClient.addSessionPublicKey(userId, {
    publicKey: await storage.getPublicKey(),
  });

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
    await userManagementClient.verifyLogin('123456');

    const challenge = await userManagementClient.getSessionChallenge(userId);
    const message = challenge.data.challenge;
    const signature = await storage.signChallenge(message);
    await userManagementClient.verifySessionChallenge(userId, {
      signature,
    });
    const respose = await userManagementClient.getWallets(userId);
    if (respose.status === 200) {
      console.log('Login flow PASSED');
    } else {
      console.log('Login flow FAILED');
    }
  }
};

void completeFlowWithServer();
