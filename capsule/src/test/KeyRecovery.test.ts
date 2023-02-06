// @ts-ignore
import userManagementClient from '../UserManagementClient';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ReactNativeCapsuleWallet,
  USER_ID_TAG,
} from '../react-native/ReactNativeCapsuleWallet';

const keyRecoveryFlow = async () => {
  const email = `test-${uuidv4()}@test.usecapsule.com`;
  const { userId } = await userManagementClient.createUser({
    email,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });
  await AsyncStorage.setItem(USER_ID_TAG, userId);

  const wallet = new ReactNativeCapsuleWallet();
  await wallet.initSessionManagement();
  await wallet.init();

  let recoveryShare = '';
  await wallet.createAccount((share) => {
    recoveryShare = share;
  });

  await userManagementClient.logout();
  await AsyncStorage.removeItem(USER_ID_TAG);

  const recoveryVerificationResponse =
    await userManagementClient.recoveryVerification(email, '123456');

  await AsyncStorage.setItem(
    USER_ID_TAG,
    recoveryVerificationResponse.data.userId
  );

  let newRecoveryShare = '';

  const newWallet = new ReactNativeCapsuleWallet();
  await newWallet.initSessionManagement();

  await newWallet.recoverAccountFromRecoveryKeyshare(recoveryShare, (share) => {
    newRecoveryShare = share;
  });

  await AsyncStorage.removeItem(USER_ID_TAG);

  if (recoveryShare !== newRecoveryShare && recoveryShare && newRecoveryShare) {
    console.log('keyRecoveryFlow PASSED');
  } else {
    console.log('keyRecoveryFlow FAILED');
  }
};

void keyRecoveryFlow();
