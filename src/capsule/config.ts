import { NativeModules } from 'react-native'

export const networkLoadBalancer =
  'https://mpcnetworkloadbalancer-653682245.us-east-1.elb.amazonaws.com'
export const userManagementServer = 'https://user-management.sandbox.usecapsule.com/'
const { CapsuleSignerModule } = NativeModules

function init() {
  CapsuleSignerModule.setServerUrl(networkLoadBalancer)
}

init()
