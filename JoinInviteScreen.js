import React, { useMemo, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import CountryPickerModal from './components/CountryPickerModal';
import { findCountryByCode } from './lib/countries';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

export default function JoinInviteScreen({ navigation, onSubmitEpsuSuggestion }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [isCountryPickerVisible, setIsCountryPickerVisible] = useState(false);
  const normalizedTitle = useMemo(() => title.trim(), [title]);
  const canSubmit = normalizedTitle.length >= 2 && countryCode.length === 2;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    const result = await onSubmitEpsuSuggestion({
      title: normalizedTitle,
      countryCode,
    });

    if (!result?.ok) {
      showAppDialog('Suggestion', result?.message ?? 'Could not save suggestion');
      return;
    }

    setTitle('');
    setCountryCode('');
    showAppDialog('Suggestion sent', result?.message ?? 'Thanks, we saved your request for a new Epsu');
    navigation.navigate('HomeMain');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="always">
        <Text style={styles.sectionEyebrow}>Suggest regional Epsu</Text>
        <Text style={styles.sectionTitle}>Does your region have an Epsu?</Text>
        <Text style={styles.helper}>
          Choose the country, then city, region or country where next regional Epsu should be. This data must be accurate, otherwise this Epsu won&apos;t be created
        </Text>

        <Text style={styles.inputLabel}>Country</Text>
        <TouchableOpacity
          style={styles.countryButton}
          onPress={() => setIsCountryPickerVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={countryCode ? styles.countryButtonText : styles.countryPlaceholder}>
            {findCountryByCode(countryCode)?.name ?? 'Select country'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.inputLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: London, not london"
          placeholderTextColor="#8d6676"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </ScrollView>
      <CountryPickerModal
        visible={isCountryPickerVisible}
        selectedCode={countryCode}
        onClose={() => setIsCountryPickerVisible(false)}
        onSelect={(country) => {
          setCountryCode(country.code);
          setIsCountryPickerVisible(false);
        }}
      />

      <Animated.View
        pointerEvents={canSubmit ? 'auto' : 'none'}
        style={[
          styles.submitWrap,
          {
            paddingBottom: insets.bottom + 16,
          },
          submitAnimationStyle,
        ]}
      >
        <TouchableOpacity style={styles.submitButton} onPressIn={() => { Keyboard.dismiss(); handleSubmit(); }} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 110,
    gap: 16,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
  },
  helper: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7a5968',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -8,
  },
  countryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  countryButtonText: {
    color: '#24171d',
    fontSize: 16,
    fontWeight: '700',
  },
  countryPlaceholder: {
    color: '#8d6676',
    fontSize: 16,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#24171d',
  },
  submitWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
  },
  submitButton: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
