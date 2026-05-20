import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GuestModeBubble from './components/GuestModeBubble';
import { UI } from './lib/uiTheme';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

export default function LoginScreen({ navigation, onLogin, showGuestModeBubble = true }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const validate = () => {
    let valid = true;

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      valid = false;
    } else {
      setPasswordError('');
    }

    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    const result = await onLogin({
      email,
      password,
    });

    if (result.ok) {
      return;
    }

    if (result.field === 'email') {
      setEmailError(result.message);
    }

    if (result.field === 'password') {
      setPasswordError(result.message);
    }
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
          style={[
            styles.overlay,
            {
              paddingBottom: UI.auth.screenPaddingBottom + Math.max(insets.bottom, Platform.OS === 'ios' ? 18 : 0),
            },
          ]}
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
          <View style={styles.inner}>
            <Text style={styles.title}>Log In</Text>

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
                  if (emailError) setEmailError('');
                }}
                onBlur={() => {
                  if (!email.trim()) {
                    setEmailError('Email is required');
                  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                    setEmailError('Enter a valid email address');
                  }
                }}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.fieldWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.6)"
                secureTextEntry
                maxLength={MAX_PASSWORD_LENGTH}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (passwordError) setPasswordError('');
                }}
                onBlur={() => {
                  if (!password) {
                    setPasswordError('Password is required');
                  } else if (password.length < MIN_PASSWORD_LENGTH) {
                    setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
                  }
                }}
              />
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            <TouchableOpacity style={styles.button} onPress={handleLogin} activeOpacity={0.85}>
              <Text style={styles.buttonText}>Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkWrapper}
              onPress={() => navigation.navigate('ForgotPassword', { email: email.trim() })}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryLinkWrapper}
              onPress={() => navigation.navigate('SignUp')}
            >
              <Text style={styles.linkText}>Create account</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#e52b50' },
  bg: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  topBubbleWrap: {
    position: 'absolute',
    zIndex: 3,
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
    paddingHorizontal: 16,
    minHeight: UI.auth.inputMinHeight,
    fontSize: 16,
    color: '#fff',
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
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
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
  secondaryLinkWrapper: {
    alignItems: 'center',
    marginTop: UI.auth.secondaryLinkGap,
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
});
