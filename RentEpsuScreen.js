import React, { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const SCHOOL_TEXT_DRAFT_KEY = 'rent_epsu_text_draft';

function isLikelyWebsite(value) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  const prefixed = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(prefixed);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !hostname.includes('.')) {
      return false;
    }

    return hostname
      .split('.')
      .every((label) => /^[a-z0-9-]+$/i.test(label) && !label.startsWith('-') && !label.endsWith('-'));
  } catch {
    return false;
  }
}

export default function RentEpsuScreen({
  navigation,
  onCreateSchoolEpsu,
}) {
  const insets = useSafeAreaInsets();
  const [schoolName, setSchoolName] = useState('');
  const [website, setWebsite] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  const [isDraftReady, setIsDraftReady] = useState(false);
  const trimmedSchoolName = useMemo(() => schoolName.trim(), [schoolName]);
  const trimmedWebsite = useMemo(() => website.trim(), [website]);
  const hasValidWebsite = useMemo(() => isLikelyWebsite(trimmedWebsite), [trimmedWebsite]);
  const canSubmit = trimmedSchoolName.length >= 2 && hasValidWebsite;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);

  useEffect(() => {
    AsyncStorage.setItem(
      'rent_epsu_text_draft',
      JSON.stringify({
        schoolName,
        website,
      })
    ).catch(() => {});
  }, [schoolName, website]);

  useEffect(() => {
    let isActive = true;

    const restoreDraft = async () => {
      try {
        const [storedTextDraft] = await Promise.all([
          AsyncStorage.getItem(SCHOOL_TEXT_DRAFT_KEY),
        ]);

        if (!isActive) {
          return;
        }

        if (storedTextDraft) {
          const parsedDraft = JSON.parse(storedTextDraft);
          setSchoolName(parsedDraft.schoolName ?? '');
          setWebsite(parsedDraft.website ?? '');
        }
      } catch {
        // ignore restore errors and let the user type again
      } finally {
        if (isActive) {
          setIsDraftReady(true);
        }
      }
    };

    restoreDraft();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!trimmedSchoolName) {
      return;
    }

    if (!hasValidWebsite) {
      setWebsiteError('Enter a valid website');
      return;
    }

    const result = await onCreateSchoolEpsu({
      schoolName: trimmedSchoolName,
      website: trimmedWebsite,
    });

    if (!result?.ok) {
      showAppDialog('Add new school', result?.message ?? 'Could not create school Epsu');
      return;
    }

    setSchoolName('');
    setWebsite('');
    setWebsiteError('');
    await AsyncStorage.removeItem(SCHOOL_TEXT_DRAFT_KEY).catch(() => {});
    showAppDialog('School Epsu created', 'Saved for review and you will get a notification after Administration approves or rejects it');
    navigation.navigate('HomeMain');
  };

  if (!isDraftReady) {
    return <View style={[styles.screen, { backgroundColor: '#fff8fb' }]} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.sectionEyebrow}>Add new school</Text>
        <Text style={styles.sectionTitle}>Does your school have an Epsu?</Text>
        <Text style={styles.helper}>
          Write the school name and website address. Administration will choose the logo if the school is approved
        </Text>

        <Text style={styles.inputLabel}>School name</Text>
        <TextInput
          style={styles.input}
          placeholder="Massachusetts Institute of Technology"
          placeholderTextColor="#8d6676"
          value={schoolName}
          onChangeText={setSchoolName}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="off"
        />

        <Text style={styles.inputLabel}>School website</Text>
        <View style={styles.websiteInputWrap}>
          <Text style={styles.websitePrefix}>https://</Text>
          <TextInput
            style={styles.websiteInput}
            placeholder="web.mit.edu"
            placeholderTextColor="#8d6676"
            value={website}
            onChangeText={(value) => {
              setWebsite(value);
              if (websiteError) {
                setWebsiteError(isLikelyWebsite(value.trim()) ? '' : 'Enter a valid website');
              }
            }}
            onBlur={() => {
              if (trimmedWebsite && !hasValidWebsite) {
                setWebsiteError('Enter a valid website');
              } else {
                setWebsiteError('');
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
          />
        </View>
        {websiteError ? <Text style={styles.errorText}>{websiteError}</Text> : null}
      </ScrollView>

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
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -8,
  },
  websiteInputWrap: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  websitePrefix: {
    color: '#8d6676',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 4,
  },
  websiteInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#24171d',
  },
  errorText: {
    color: '#d72647',
    fontSize: 13,
    fontWeight: '700',
    marginTop: -6,
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
