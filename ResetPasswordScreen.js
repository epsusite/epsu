import React, { useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { UI } from './lib/uiTheme';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 64;

export default function ResetPasswordScreen({ onCompletePasswordRecovery, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < MIN_PASSWORD_LENGTH) return { label: 'Too short', color: '#ff6b6b', width: '30%' };
    if (password.length < 12) return { label: 'Fair', color: '#ffd93d', width: '60%' };
    return { label: 'Strong', color: '#6bcb77', width: '100%' };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async () => {
    setError('');

    if (password !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsSubmitting(true);
    const result = await onCompletePasswordRecovery(password);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setPassword('');
    setConfirmPassword('');
    onDone();
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
            <Text style={styles.title}>New password</Text>
            <Text style={styles.helperText}>Choose a new password for your Epsu account</Text>

            <View style={styles.fieldWrapper}>
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor="rgba(255,255,255,0.6)"
                secureTextEntry
                maxLength={MAX_PASSWORD_LENGTH}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (error) setError('');
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
            </View>

            <View style={styles.fieldWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor="rgba(255,255,255,0.6)"
                secureTextEntry
                maxLength={MAX_PASSWORD_LENGTH}
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  if (error) setError('');
                }}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Update password</Text>
              )}
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
  overlay: { flex: 1, justifyContent: 'flex-end', paddingBottom: UI.auth.screenPaddingBottom },
  inner: { marginHorizontal: UI.auth.horizontalPadding },
  title: {
    fontSize: UI.auth.titleSize,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 16,
  },
  helperText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    fontWeight: '600',
  },
  fieldWrapper: { marginBottom: UI.auth.fieldGap },
  passwordMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 12,
  },
  strengthWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  strengthBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    marginRight: 8,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 58,
  },
  passwordCount: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
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
});
