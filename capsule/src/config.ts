import { NativeModules } from 'react-native';

export const userManagementServer =
  'https://user-management.sandbox.usecapsule.com/';
const { CapsuleSignerModule } = NativeModules;
export const DEBUG_MODE_ENABLED = false;

function init() {
  CapsuleSignerModule.setServerUrl(userManagementServer);
}

init();
