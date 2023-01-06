import { v4 as uuidv4 } from 'uuid'
import Logger from '../../utils/Logger'
import { PrivateKeyStorageReactNative } from '../PrivateKeyStorage'

const privateKeyStoringFlow = async () => {
  const storage = new PrivateKeyStorageReactNative(uuidv4())
  const key = uuidv4()
  await storage.setPrivateKey(key)
  const obtainedKey = await storage.getPrivateKey()
  if (obtainedKey === key) {
    Logger.debug('privateKeyStoringFlow PASSED')
  } else {
    Logger.debug('privateKeyStoringFlow FAILED')
  }
}

void privateKeyStoringFlow()
