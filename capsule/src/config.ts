import {NativeModules} from 'react-native';

export const userManagementServer =
  'https://user-management.beta.usecapsule.com/';
const {CapsuleSignerModule} = NativeModules;
export const DEBUG_MODE_ENABLED = true;

function init() {
  CapsuleSignerModule.setServerUrl(userManagementServer);
}

init();
