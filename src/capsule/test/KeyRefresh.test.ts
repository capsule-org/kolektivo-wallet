// @ts-ignore
import userManagementClient from '../UserManagementClient'
import { v4 as uuidv4 } from 'uuid'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ReactNativeCapsuleWallet, USER_ID_TAG } from '../react-native/ReactNativeCapsuleWallet'

const keyRefreshFlow = async () => {
  const { userId } = await userManagementClient.createUser({
    email: `test-${uuidv4()}@test.usecapsule.com`,
  })
  await userManagementClient.verifyEmail(userId, { verificationCode: '123456' })
  await AsyncStorage.setItem(USER_ID_TAG, userId)

  const wallet = new ReactNativeCapsuleWallet()
  await wallet.initSessionManagement()
  await wallet.init()

  let recoveryShare = ''
  const address = await wallet.addAccount(undefined, (share) => {
    recoveryShare = share
  })

  const userShare = await wallet.getKeyshare(address)

  let newRecoveryShare = ''
  await new Promise((resolve) => setTimeout(resolve, 3000))

  await wallet.refresh(address, recoveryShare, (share) => {
    newRecoveryShare = share
  })

  const newUserShare = await wallet.getKeyshare(address)

  if (
    userShare !== newUserShare &&
    recoveryShare !== newRecoveryShare &&
    recoveryShare &&
    newRecoveryShare &&
    userShare &&
    newUserShare
  ) {
    console.log('keyRefreshFlow PASSED')
  } else {
    console.log('keyRefreshFlow FAILED')
  }
}

void keyRefreshFlow()
