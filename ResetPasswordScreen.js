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

const MAX_PASSWORD_LENGTH = 64;

export default function ResetPasswordScreen({ onCompletePasswordRecovery, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  overlay: { flex: 1, justifyContent: 'flex-end', paddingBottom: 36 },
  inner: { marginHorizontal: 28 },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
  },
  helperText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    fontWeight: '600',
  },
  fieldWrapper: { marginBottom: 16 },
  input: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    borderRadius: 16,
    minHeight: 50,
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
