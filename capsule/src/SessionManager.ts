import userManagementClient from './UserManagementClient';
import {SessionStorage} from './SessionStorage';
import {
  PublicKeyStatus,
  PublicKeyType,
} from '@usecapsule/user-management-client';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';
import {
  getWebAuthURLForCreate,
  getWebAuthURLForLogin,
  isSessionActive,
} from './helpers';

export default class SessionManager {
  private userId: string;
  private email: string;
  private sessionStorage: SessionStorage;
  private webauth: boolean;
  public async setSessionKey() {
    const res = await userManagementClient.addSessionPublicKey(
      this.userId,
      this.webauth
        ? {
            status: PublicKeyStatus.PENDING,
            type: PublicKeyType.WEB,
          }
        : {
            publicKey: await this.sessionStorage.getPublicKey(),
          }
    );

    if (!this.webauth) {
      return res;
    }
    const link = getWebAuthURLForCreate(
      res.data.id,
      this.userId,
      this.email,
      res.data.partnerId
    );
    console.log(link);

    InAppBrowser.open(link);
    while (true) {
      if (await isSessionActive()) {
        break;
      }
      console.log('Not active');
      await new Promise((res) => setTimeout(res, 1000));
    }
    InAppBrowser.close();
    console.log('active');
  }

  constructor(
    userId: string,
    email: string,
    sessionStorage: SessionStorage,
    webauth: boolean
  ) {
    this.email = email;
    this.userId = userId;
    this.sessionStorage = sessionStorage;
    this.webauth = webauth;
  }

  public async refreshSessionIfNeeded() {
    if (!this.webauth) {
      const challenge = await userManagementClient.getSessionChallenge(
        this.userId
      );
      const message = challenge.data.challenge;
      const signature = await this.sessionStorage.signChallenge(message);
      await userManagementClient.verifySessionChallenge(this.userId, {
        signature,
        publicKey: await this.sessionStorage.getPublicKey(),
      });
      return;
    }

    if (!(await isSessionActive())) {
      return;
    }

    const session = await userManagementClient.touchSession();
    const link = getWebAuthURLForLogin(
      session.data.sessionId,
      'dummy',
      this.email
    );
    console.log(link);

    InAppBrowser.open(link);
    while (true) {
      if (await isSessionActive()) {
        break;
      }
      console.log('Not active');
      await new Promise((res) => setTimeout(res, 1000));
    }
    InAppBrowser.close();
  }
}
