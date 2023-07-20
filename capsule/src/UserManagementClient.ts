import Client from '@usecapsule/user-management-client';
import {userManagementServer} from './config';

const userManagementClient = new Client({
  userManagementHost: userManagementServer,
});

export default userManagementClient;
