//
//  CapsuleSignerModule.m
//
//  Created by Michał Osadnik on 14/12/2022.
//

#import <Foundation/Foundation.h>
#import "CapsuleSignerModule.h"
#import <Signer/Signer.h>

static NSString *configBase = @"{\"ServerUrl\": \"%@\", \"WalletId\": \"%@\", \"Id\":\"%@\", \"Ids\":%@, \"Threshold\":1}";

static NSString *ids = @"[\"USER\",\"CAPSULE\",\"RECOVERY\"]";

static NSString *serverUrl = @"http://mpcnetworkloadbalancer-348316826.us-west-1.elb.amazonaws.com";


@implementation CapsuleSignerModule
+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}



RCT_EXPORT_METHOD(getAddress:(NSString *)serializedSigner
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString* res = SignerGetAddress(serializedSigner);
  resolve(res);
}



RCT_EXPORT_MODULE();


- (void) invokeSignerCreateAccount:(NSDictionary*)params
{
  NSString* protocolId = [params objectForKey:@"protocolId"];
  NSString* signerConfig = [params objectForKey:@"signerConfig"];
  RCTPromiseResolveBlock resolve = [params objectForKey:@"resolve"];
  NSString* res = SignerCreateAccount(serverUrl,signerConfig, protocolId);
  
  resolve(res);
}

RCT_EXPORT_METHOD(createAccount:(NSString *)walletId
                  protocolId:(NSString *)protocolId
                  userId:(NSString *)userId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString* signerConfig = [NSString stringWithFormat: configBase, serverUrl, walletId, userId, ids];
  NSDictionary* params = [NSDictionary dictionaryWithObjectsAndKeys:
                          protocolId, @"protocolId",
                          resolve, @"resolve",
                          signerConfig, @"signerConfig",
                          nil];
  [self performSelectorInBackground:@selector(invokeSignerCreateAccount:)
                         withObject:params];
}

@end
