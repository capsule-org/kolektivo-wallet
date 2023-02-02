// This is not actually a test in a way that we write, e.g., jest tests.
// We need to have it running inside the mobile app with native module by importing e.g., in App.ts

// @ts-ignore
import userManagementClient from '../UserManagementClient';
import { v4 as uuidv4 } from 'uuid';
import { ReactNativeSessionStorage } from '../react-native/ReactNativeSessionStorage';

const completeFlowWithServerTwoKeys = async () => {
  const { userId } = await userManagementClient.createUser({
    email: `test-${uuidv4()}@test.usecapsule.com`,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });
  const storage = new ReactNativeSessionStorage(userId);

  await userManagementClient.addSessionPublicKey(userId, {
    publicKey: await storage.getPublicKey(),
  });
  const challenge = await userManagementClient.getSessionChallenge(userId);
  const message = challenge.data.challenge;
  const signature = await storage.signChallenge(message);

  await userManagementClient.verifySessionChallenge(userId, {
    signature,
  });

  const storage2 = new ReactNativeSessionStorage(userId + '2'); // different key

  await userManagementClient.addSessionPublicKey(userId, {
    publicKey: await storage2.getPublicKey(),
  });

  const challenge2 = await userManagementClient.getSessionChallenge(userId);
  const message2 = challenge2.data.challenge;
  const signature2 = await storage2.signChallenge(message2);

  try {
    await userManagementClient.verifySessionChallenge(userId, {
      signature: signature2,
      publicKey: await storage.getPublicKey(), // different storage
    });
    // if not error
    console.debug('completeFlowWithServerTwoKeys FAILED');
  } catch (e) {
    console.log('ERROR WHILE PROVIDING INCORRECT KEY - CORRECT');
    const res2 = await userManagementClient.verifySessionChallenge(userId, {
      signature: signature2,
      publicKey: await storage2.getPublicKey(),
    });
    if (res2.status === 200) {
      console.debug('completeFlowWithServerTwoKeys PASSED');
    } else {
      console.debug('completeFlowWithServerTwoKeys FAILED');
    }
  }
};

void completeFlowWithServerTwoKeys();
