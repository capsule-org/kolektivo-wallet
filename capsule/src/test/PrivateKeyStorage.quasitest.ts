import { v4 as uuidv4 } from 'uuid';
import { ReactNativePrivateKeyStorage } from '../react-native/ReactNativePrivateKeyStorage';

export const privateKeyStoringFlow = async () => {
  const storage = new ReactNativePrivateKeyStorage(uuidv4());
  const key = uuidv4();
  await storage.setPrivateKey(key);
  const obtainedKey = await storage.getPrivateKey();
  if (obtainedKey === key) {
    console.debug('privateKeyStoringFlow PASSED');
  } else {
    console.debug('privateKeyStoringFlow FAILED');
  }
};

// void privateKeyStoringFlow();
