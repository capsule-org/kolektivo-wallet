
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNReactNativeWalletSpec.h"

@interface ReactNativeWallet : NSObject <NativeReactNativeWalletSpec>
#else
#import <React/RCTBridgeModule.h>

@interface ReactNativeWallet : NSObject <RCTBridgeModule>
#endif

@end
