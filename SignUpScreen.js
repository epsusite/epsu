import React, { useState, useEffect } from 'react';
import {
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import AppCheckboxRow from './components/AppCheckboxRow';
import CountryPickerModal from './components/CountryPickerModal';
import GuestModeBubble from './components/GuestModeBubble';
import { showAppDialog } from './components/AppDialog';
import { findCountryByCode } from './lib/countries';
import { isValidCountryCode, normalizeCountryCode } from './lib/countryCode';
import { UI } from './lib/uiTheme';

const TERMS_URL = 'https://epsu.site/terms';
const PRIVACY_URL = 'https://epsu.site/privacy';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

export default function SignUpScreen({ navigation, onSignUp, showGuestModeBubble = true }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [isCountryPickerVisible, setIsCountryPickerVisible] = useState(false);
  const [isThirteenOrOlder, setIsThirteenOrOlder] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [countryError, setCountryError] = useState('');
  const [ageError, setAgeError] = useState('');
  const [termsError, setTermsError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < MIN_PASSWORD_LENGTH) return { label: 'Too short', color: '#ff6b6b', width: '30%' };
    if (password.length < 12) return { label: 'Fair', color: '#ffd93d', width: '60%' };
    return { label: 'Strong', color: '#6bcb77', width: '100%' };
  };

  const strength = getPasswordStrength();

  const sanitizeSignUpMessage = (message) => {
    const lowerMessage = message?.toLowerCase?.() ?? '';

    if (
      lowerMessage.includes('saving the profile record failed') ||
      (lowerMessage.includes('row-level security policy') && lowerMessage.includes('profiles'))
    ) {
      return 'Your account may already have been created. Check your email for a confirmation link before trying again.';
    }

    return message;
  };

  const validatePassword = (val) => {
    if (!val) return 'Password is required';
    if (val.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (val.length > MAX_PASSWORD_LENGTH) {
      return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
    }
    return '';
  };

  const validateCountryCode = (val) => {
    const normalized = normalizeCountryCode(val);
    if (!normalized) {
      return 'Country is required';
    }

    if (!isValidCountryCode(normalized)) {
      return 'Use a 2-letter country code like EE or US';
    }

    return '';
  };

  const validateAgeConfirmation = (checked) => (checked ? '' : 'You must confirm that you are 13 or older');

  const validateEmail = (val) => {
    const normalized = val.trim();
    if (!normalized) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return 'Enter a valid email address';
    }
    return '';
  };

  const validateTerms = (checked) => {
    if (!checked) {
      return 'You must agree to the Terms of Service and Privacy Policy';
    }
    return '';
  };

  const openDocument = async (url) => {
    await WebBrowser.openBrowserAsync(url);
  };

  const handleSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    const cErr = validateCountryCode(countryCode);
    const aErr = validateAgeConfirmation(isThirteenOrOlder);
    const tErr = validateTerms(acceptedTerms);
    setEmailError(eErr);
    setPasswordError(pErr);
    setCountryError(cErr);
    setAgeError(aErr);
    setTermsError(tErr);
    setGeneralError('');

    if (eErr || pErr || cErr || aErr || tErr) return;

    const result = await onSignUp({
      email: normalizedEmail,
      password,
      countryCode: normalizeCountryCode(countryCode),
      isThirteenOrOlder,
      acceptedTerms,
    });

    const sanitizedMessage = sanitizeSignUpMessage(result?.message);

    if (result.requiresConfirmation) {
      setPendingConfirmationEmail(normalizedEmail);
      setGeneralError('');
      showAppDialog(
        'Success! Check your email',
        `We sent a confirmation link to ${normalizedEmail}`
      );
      return;
    }

    if (result.ok) {
      return;
    }

    if (result.field === 'email') {
      setEmailError(sanitizedMessage);
      return;
    }

    if (result.field === 'password') {
      setPasswordError(sanitizedMessage);
      return;
    }

    if (result.field === 'countryCode') {
      setCountryError(sanitizedMessage);
      return;
    }

    if (result.field === 'ageConfirmation') {
      setAgeError(sanitizedMessage);
      return;
    }

    if (result.field === 'terms') {
      setTermsError(sanitizedMessage);
      return;
    }

    setGeneralError(sanitizedMessage ?? 'Unable to create account');
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
          <View
            style={[
              styles.topBubbleWrap,
              {
                top: insets.top + 6,
                left: Math.max(16, Math.min(28, Math.round(windowWidth * 0.06))),
              },
            ]}
          >
            <GuestModeBubble
              visible={showGuestModeBubble && !isKeyboardVisible}
              onPress={() => navigation.navigate('GuestMode')}
            />
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
            <View style={styles.inner}>
              {pendingConfirmationEmail ? (
                <>
                  <Text style={styles.title}>Confirm your email</Text>
                  <Text style={styles.confirmationText}>
                    Confirmation email sent to you! Open it on your phone to instantly log in, otherwise you must log in separately to Epsu
                  </Text>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Login')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>Back to login</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.title}>Create account</Text>

                  <View style={styles.fieldWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="Email"
                      placeholderTextColor="rgba(255,255,255,0.6)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      value={email}
                      onChangeText={(val) => {
                        setEmail(val);
                        if (emailError) setEmailError(validateEmail(val));
                      }}
                      onBlur={() => {
                        const error = validateEmail(email);
                        if (error) setEmailError(error);
                      }}
                    />
                    {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  </View>

                  <View style={styles.fieldWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="Password (8-64 characters)"
                      placeholderTextColor="rgba(255,255,255,0.6)"
                      secureTextEntry
                      maxLength={MAX_PASSWORD_LENGTH}
                      value={password}
                      onChangeText={(val) => {
                        setPassword(val);
                        if (passwordError) setPasswordError(validatePassword(val));
                      }}
                      onBlur={() => {
                        const error = validatePassword(password);
                        if (error) setPasswordError(error);
                      }}
                    />
                    {password.length > 0 ? (
                      <View style={styles.passwordMetaRow}>
                        <View style={styles.strengthWrapper}>
                          <View style={styles.strengthBarBg}>
                            <View
                              style={[
                                styles.strengthBarFill,
                                { width: strength?.width, backgroundColor: strength?.color },
                              ]}
                            />
                          </View>
                          <Text style={[styles.strengthLabel, { color: strength?.color }]}>
                            {strength?.label}
                          </Text>
                        </View>
                        <Text style={styles.passwordCount}>{password.length}/{MAX_PASSWORD_LENGTH}</Text>
                      </View>
                    ) : null}
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
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

                  <View style={styles.fieldWrapper}>
                    <AppCheckboxRow
                      checked={isThirteenOrOlder}
                      onPress={() => {
                        const nextValue = !isThirteenOrOlder;
                        setIsThirteenOrOlder(nextValue);
                        if (ageError) {
                          setAgeError(validateAgeConfirmation(nextValue));
                        }
                      }}
                      theme="dark"
                    >
                      I am 13 or older
                    </AppCheckboxRow>
                    {ageError ? <Text style={styles.errorText}>{ageError}</Text> : null}
                  </View>

                  <View style={styles.fieldWrapper}>
                    <AppCheckboxRow
                      checked={acceptedTerms}
                      onPress={() => {
                        const nextValue = !acceptedTerms;
                        setAcceptedTerms(nextValue);
                        if (termsError) {
                          setTermsError(validateTerms(nextValue));
                        }
                      }}
                      theme="dark"
                    >
                      By continuing, you agree to Epsu&apos;s{' '}
                      <Text style={styles.inlineLink} onPress={() => openDocument(TERMS_URL)}>
                        Terms of Service
                      </Text>{' '}
                      and confirm that you have read Epsu&apos;s{' '}
                      <Text style={styles.inlineLink} onPress={() => openDocument(PRIVACY_URL)}>
                        Privacy Policy
                      </Text>
                    </AppCheckboxRow>
                    {termsError ? <Text style={styles.errorText}>{termsError}</Text> : null}
                  </View>

                  {generalError ? <Text style={styles.errorText}>{generalError}</Text> : null}

                  <TouchableOpacity style={styles.button} onPress={handleSignUp} activeOpacity={0.85}>
                    <Text style={styles.buttonText}>Create account</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkWrapper}
                    onPress={() => navigation.navigate('Login')}
                  >
                    <Text style={styles.linkText}>Already have an account?</Text>
                  </TouchableOpacity>
                </>
              )}
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
  topBubbleWrap: {
    position: 'absolute',
    zIndex: 3,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 28,
    paddingBottom: UI.auth.screenPaddingBottom,
  },
  inner: { marginHorizontal: UI.auth.horizontalPadding },
  title: {
    fontSize: UI.auth.titleSize,
    fontWeight: '900',
    color: '#fff',
    marginBottom: UI.auth.titleSpacing,
    letterSpacing: -0.5,
  },
  fieldWrapper: { marginBottom: UI.auth.fieldGap },
  input: {
    backgroundColor: '#e52b50',
    borderRadius: UI.auth.inputRadius,
    minHeight: UI.auth.inputMinHeight,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
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
  sectionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  helperText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  passwordMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  passwordCount: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
  },
  strengthWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  strengthBarBg: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
  strengthBarFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', width: 50, textAlign: 'right' },
  inlineLink: {
    textDecorationLine: 'underline',
    fontWeight: '800',
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
    borderRadius: UI.auth.inputRadius,
    minHeight: UI.auth.buttonMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  linkWrapper: {
    alignItems: 'center',
    marginTop: UI.auth.linkGap,
    alignSelf: 'center',
    backgroundColor: '#e52b50',
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: UI.auth.pillMinHeight,
    justifyContent: 'center',
  },
  linkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  confirmationText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginBottom: 24,
  },
});

