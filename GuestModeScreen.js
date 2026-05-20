import React, { useEffect, useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

import CountryPickerModal from './components/CountryPickerModal';
import { findCountryByCode } from './lib/countries';

export default function GuestModeScreen({ navigation, onStartGuestMode, initialCountryCode = '' }) {
  const [countryCode, setCountryCode] = useState('');
  const [countryError, setCountryError] = useState('');
  const [isCountryPickerVisible, setIsCountryPickerVisible] = useState(false);

  useEffect(() => {
    if (initialCountryCode) {
      setCountryCode(initialCountryCode);
      setCountryError('');
    }
  }, [initialCountryCode]);

  const handleStart = () => {
    if (!countryCode) {
      setCountryError('Choose your country first');
      return;
    }

    setCountryError('');
    onStartGuestMode(countryCode);
  };

  return (
    <View style={styles.screen}>
      <ImageBackground
        source={require('./assets/images/1774535505571.jpg')}
        style={styles.bg}
        resizeMode="cover"
      >
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
            <View style={styles.inner}>
              <Text style={styles.title}>Guest mode</Text>
              <Text style={styles.subtitle}>
                Try Epsu for 1 minute before creating an account
              </Text>

              <View style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>What you can do</Text>
                <Text style={styles.ruleText}>Browse Epsus freely from your country</Text>
                <Text style={styles.ruleText}>Open posts and swipe through them</Text>
                <Text style={styles.ruleText}>Learn how posting works</Text>
              </View>

              <View style={styles.ruleCard}>
                <Text style={styles.ruleTitle}>What you can&apos;t do</Text>
                <Text style={styles.ruleText}>Post, report, block, react or use settings</Text>
                <Text style={styles.ruleText}>Change anything for real users or real Epsus</Text>
              </View>

              <View style={styles.fieldWrapper}>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setIsCountryPickerVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text style={countryCode ? styles.inputText : styles.placeholderText}>
                    {findCountryByCode(countryCode)?.name ?? 'Select country'}
                  </Text>
                </TouchableOpacity>
                {countryError ? <Text style={styles.errorText}>{countryError}</Text> : null}
              </View>

              <TouchableOpacity style={styles.button} onPress={handleStart} activeOpacity={0.85}>
                <Text style={styles.buttonText}>Start guest mode</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkWrapper}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.linkText}>Back</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
      <CountryPickerModal
        visible={isCountryPickerVisible}
        selectedCode={countryCode}
        onClose={() => setIsCountryPickerVisible(false)}
        onSelect={(country) => {
          setCountryCode(country.code);
          setCountryError('');
          setIsCountryPickerVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e52b50' },
  bg: { flex: 1 },
  overlay: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 28, paddingBottom: 36 },
  inner: { marginHorizontal: 28 },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginBottom: 22,
  },
  ruleCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 14,
  },
  ruleTitle: {
    color: '#e52b50',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ruleText: {
    color: '#a32849',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    marginBottom: 4,
  },
  fieldWrapper: { marginTop: 4, marginBottom: 16 },
  input: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  inputText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  button: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  linkWrapper: {
    alignItems: 'center',
    marginTop: 18,
    alignSelf: 'center',
    backgroundColor: '#e52b50',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  linkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
