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

export default function ForgotPasswordScreen({ navigation, route, onRequestPasswordReset }) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [emailError, setEmailError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setEmailError('');
    setSuccessMessage('');
    setIsSubmitting(true);
    const result = await onRequestPasswordReset(email);
    setIsSubmitting(false);

    if (!result.ok) {
      setEmailError(result.message);
      return;
    }

    setSuccessMessage(result.message);
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
            <Text style={styles.title}>Reset password</Text>

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
                  if (successMessage) setSuccessMessage('');
                }}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
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
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkWrapper}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.linkText}>Back to login</Text>
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
    letterSpacing: -0.5,
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
  successText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 4,
    fontWeight: '700',
    backgroundColor: 'rgba(32,19,26,0.35)',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  button: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
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
    marginTop: 20,
  },
  linkText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
