import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';

export default function SignUpScreen({ navigation, onSignUp }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 8) return { label: 'Too short', color: '#ff6b6b', width: '30%' };
    if (password.length < 12) return { label: 'Fair', color: '#ffd93d', width: '60%' };
    return { label: 'Strong', color: '#6bcb77', width: '100%' };
  };

  const strength = getPasswordStrength();

  const validateUsername = (val) => {
    if (!val.trim()) return 'Username is required.';
    if (val.trim().length < 8) return 'Username must be at least 8 characters.';
    return '';
  };

  const validatePassword = (val) => {
    if (!val) return 'Password is required.';
    if (val.length < 8) return 'Password must be at least 8 characters.';
    return '';
  };

  const validateEmail = (val) => {
    const normalized = val.trim();
    if (!normalized) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return 'Enter a valid email address.';
    }
    return '';
  };

  const handleSignUp = async () => {
    const uErr = validateUsername(username);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setUsernameError(uErr);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (uErr || eErr || pErr) return;

    const result = await onSignUp({
      username,
      email,
      password,
    });

    if (result.ok) {
      return;
    }

    if (result.field === 'username') {
      setUsernameError(result.message);
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
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.inner}>
            <Text style={styles.title}>Create account</Text>

            {/* Username */}
            <View style={styles.fieldWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Username (min. 8 characters)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(val) => {
                  setUsername(val);
                  if (usernameError) setUsernameError(validateUsername(val));
                }}
                onBlur={() => setUsernameError(validateUsername(username))}
              />
              {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}
            </View>

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
                onBlur={() => setEmailError(validateEmail(email))}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.fieldWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Password (min. 8 characters)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                secureTextEntry
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (passwordError) setPasswordError(validatePassword(val));
                }}
                onBlur={() => {
                  setPasswordError(validatePassword(password));
                }}
              />
              {password.length > 0 && (
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
              )}
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>

            <TouchableOpacity style={styles.button} onPress={handleSignUp} activeOpacity={0.85}>
              <Text style={styles.buttonText}>Create account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkWrapper}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.linkText}>Already have an account?</Text>
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
  overlay: { flex: 1, justifyContent: 'center' },
  inner: { marginHorizontal: 28 },
  title: { fontSize: 36, fontWeight: '900', color: '#fff', marginBottom: 32, letterSpacing: -0.5 },
  fieldWrapper: { marginBottom: 16 },
  input: {
    backgroundColor: '#e52b50',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  strengthWrapper: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  strengthBarBg: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, overflow: 'hidden' },
  strengthBarFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', width: 50, textAlign: 'right' },
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
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
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
    marginTop: 20,
  },
  linkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
