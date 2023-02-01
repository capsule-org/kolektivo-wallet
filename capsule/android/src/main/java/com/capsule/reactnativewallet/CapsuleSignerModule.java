package com.capsule.reactnativewallet;

import android.util.Log;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import signer.Signer;

public class CapsuleSignerModule extends ReactContextBaseJavaModule {
  static final String TAG = "CapsuleSignerModule";

  String ids = "[\"USER\",\"CAPSULE\",\"RECOVERY\"]";
  String serverUrl;
  String configBase =
    "{\"ServerUrl\": \"%s\", \"WalletId\": \"%s\", \"Id\":\"%s\", \"Ids\":%s, \"Threshold\":1}";

  CapsuleSignerModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "CapsuleSignerModule";
  }

  @ReactMethod
  public void setServerUrl(String serverUrl) {
    this.serverUrl = serverUrl;
  }

  private String getServerAddress(String userID) {
    return String.format("%susers/%s/mpc-network", this.serverUrl, userID);
  }

  /**
   * Perform distributed key generation with the Capsule server
   *
   * @param protocolId
   * @return
   */
  @ReactMethod
  public void createAccount(
    String walletId,
    String protocolId,
    String id,
    String userId,
    Promise promise
  ) {
    String signerConfig = String.format(
      configBase,
      this.getServerAddress(userId),
      walletId,
      id,
      ids
    );
    (
      new Thread(
        () -> {
          String res = Signer.createAccount(
            this.getServerAddress(userId),
            signerConfig,
            protocolId
          );
          promise.resolve(res);
        }
      )
    ).start();
  }

  @ReactMethod
  public void getAddress(String serializedSigner, Promise promise) {
    (
      new Thread(
        () -> {
          String res = Signer.getAddress(serializedSigner);
          promise.resolve(res);
        }
      )
    ).start();
  }

  @ReactMethod
  public void sendTransaction(
    String protocolId,
    String serializedSigner,
    String transaction,
    String userId,
    Promise promise
  ) {
    (
      new Thread(
        () -> {
          String res = Signer.sendTransaction(
            this.getServerAddress(userId),
            serializedSigner,
            transaction,
            protocolId
          );
          promise.resolve(res);
        }
      )
    ).start();
  }

  @ReactMethod
  public void refresh(String protocolId, String serializedSigner, String userId, Promise promise) {
    (
      new Thread(
        () -> {
          String res = Signer.refresh(this.getServerAddress(userId), serializedSigner, protocolId);
          promise.resolve(res);
        }
      )
    ).start();
  }
}
