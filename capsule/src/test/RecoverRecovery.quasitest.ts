// @ts-ignore
import userManagementClient from '../UserManagementClient';
import {v4 as uuidv4} from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ReactNativeCapsuleWallet,
  USER_ID_TAG,
} from '../react-native/ReactNativeCapsuleWallet';
import {recoveryVerification} from '../helpers';

export const recoverRecoveryShare = async () => {
  const email = `test-${uuidv4()}@test.usecapsule.com`;
  const {userId} = await userManagementClient.createUser({
    email,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });
  await AsyncStorage.setItem(USER_ID_TAG, userId + '|' + email);

  const wallet = new ReactNativeCapsuleWallet();
  await wallet.initSessionManagement(true);
  await wallet.init();

  let recoveryShare = '';
  const address = await wallet.createAccount((share) => {
    recoveryShare = share;
  });

  if (address.length < 10 || recoveryShare.length < 1000) {
    throw new Error('addresses or recoveryShare are suspiciously short!');
  }

  await recoveryVerification(email, '123456');

  const newRecoveryShare = await wallet.getRecoveryShare(address);

  await AsyncStorage.removeItem(USER_ID_TAG);

  if (recoveryShare === newRecoveryShare) {
    console.log('recoverRecoveryShare PASSED');
  } else {
    console.log('recoverRecoveryShare FAILED');
  }
};

// void recoverRecoveryShare();
