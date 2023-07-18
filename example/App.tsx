/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import type {PropsWithChildren} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import {Colors, Header} from 'react-native/Libraries/NewAppScreen';

import {createUser, verifyEmail} from '@usecapsule/react-native-wallet';

import {
  USER_ID_TAG,
  ReactNativeCapsuleWallet,
} from '@usecapsule/react-native-wallet';

import AsyncStorage from '@react-native-async-storage/async-storage';

import uuid from 'react-native-uuid';

type SectionProps = PropsWithChildren<{
  title: string;
}>;

function Section({children, title}: SectionProps): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <View style={styles.sectionContainer}>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: isDarkMode ? Colors.white : Colors.black,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.sectionDescription,
          {
            color: isDarkMode ? Colors.light : Colors.dark,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [idUser, setIdUser] = React.useState('');
  const [step, setStep] = React.useState(0);

  const handleSendEmail = async () => {
    const email = `example${uuid.v4()}@test.usecapsule.com`;

    const {userId} = await createUser({
      email,
    });
    setIdUser(userId);
    setStep(1);
  };

  const handleConfirmEmail = async () => {
    await verifyEmail(idUser, {
      verificationCode: '123456',
    })
      .then(async res => {
        setStep(2);
      })
      .catch(err => {
        console.log('error handleConfirmEmail ', err);
      });
  };

  const wallet = async () => {
    try {
      await AsyncStorage.setItem(USER_ID_TAG, idUser);
      const wallet = new ReactNativeCapsuleWallet();

      await wallet.initSessionManagement();

      await wallet.init();
      console.log('Creating wallet...');
      await wallet.createAccount(recoveryShare => {
        console.log({recoveryShare});
      });
      console.log('Wallet created');
    } catch (err: any) {
      console.log({err});
    }
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}
      >
        <Header />
        <View
          style={{
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
          }}
        >
          {step === 0 && (
            <Section title="Send Email to: `example${uuid.v4()}@test.usecapsule.com`">
              <TouchableOpacity onPress={handleSendEmail}>
                <Text>
                  Send OTP to: {`example${uuid.v4()}@test.usecapsule.com`}
                </Text>
              </TouchableOpacity>
            </Section>
          )}
          {step === 1 && (
            <Section title="Confirm otp">
              <TouchableOpacity onPress={handleConfirmEmail}>
                <Text>Confirm OTP</Text>
              </TouchableOpacity>
            </Section>
          )}
          {step === 2 && (
            <Section title="Create Wallet">
              <TouchableOpacity onPress={wallet}>
                <Text>Create wallet</Text>
              </TouchableOpacity>
            </Section>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
