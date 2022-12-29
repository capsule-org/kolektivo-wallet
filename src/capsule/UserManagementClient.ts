import Client from '@capsule/client/client'

const userManagementClient = new Client({
  userManagementHost: 'http://usermanagementloadbalancer-461184073.us-west-1.elb.amazonaws.com/',
})

export default userManagementClient
