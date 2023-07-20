// @ts-ignore
import userManagementClient from '../UserManagementClient';
import {v4 as uuidv4} from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ReactNativeCapsuleWallet,
  USER_ID_TAG,
} from '../react-native/ReactNativeCapsuleWallet';
import {retrieveKeyshare, uploadKeyshare} from '../transmissionUtils';

export const transmissionFlow = async () => {
  const email = `test-${uuidv4()}@test.usecapsule.com`;
  const {userId} = await userManagementClient.createUser({
    email,
  });
  await userManagementClient.verifyEmail(userId, {
    verificationCode: '123456',
  });

  await AsyncStorage.setItem(USER_ID_TAG, userId + '|' + email);

  const wallet = new ReactNativeCapsuleWallet();
  await wallet.initSessionManagement();
  await wallet.init();

  const address = await wallet.createAccount((_) => {});

  const secret = await uploadKeyshare(wallet, address);

  // imagine transmitting the share secret via QR code
  const transmittedShare = await retrieveKeyshare(secret);

  if ((await wallet.getKeyshare(address)) === transmittedShare) {
    console.log('transmissionFlow PASSED');
  } else {
    console.log('transmissionFlow FAILED');
  }
};

// void transmissionFlow();
