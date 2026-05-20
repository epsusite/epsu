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
import { UI } from './lib/uiTheme';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const SCHOOL_TEXT_DRAFT_KEY = 'rent_epsu_text_draft';
const MIN_SCHOOL_NAME_LENGTH = 2;
const MAX_SCHOOL_NAME_LENGTH = 100;
const MIN_SCHOOL_WEBSITE_LENGTH = 2;
const MAX_SCHOOL_WEBSITE_LENGTH = 100;

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

function validateSchoolWebsite(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'Website is required';
  }

  if (trimmed.length < MIN_SCHOOL_WEBSITE_LENGTH) {
    return `Website must be at least ${MIN_SCHOOL_WEBSITE_LENGTH} characters`;
  }

  if (trimmed.length > MAX_SCHOOL_WEBSITE_LENGTH) {
    return `Website must be ${MAX_SCHOOL_WEBSITE_LENGTH} characters or fewer`;
  }

  if (!isLikelyWebsite(trimmed)) {
    return 'Enter a valid website';
  }

  return '';
}

export default function RentEpsuScreen({
  navigation,
  currentIsAdmin = false,
  epsus = [],
  onCreateSchoolEpsu,
  userMemberships = [],
}) {
  const insets = useSafeAreaInsets();
  const [schoolName, setSchoolName] = useState('');
  const [website, setWebsite] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  const [isDraftReady, setIsDraftReady] = useState(false);
  const trimmedSchoolName = useMemo(() => schoolName.trim(), [schoolName]);
  const trimmedWebsite = useMemo(() => website.trim(), [website]);
  const websiteValidationError = useMemo(() => validateSchoolWebsite(trimmedWebsite), [trimmedWebsite]);
  const hasValidWebsite = websiteValidationError === '';
  const approvedSchoolMembershipCount = useMemo(() => {
    if (currentIsAdmin) {
      return 0;
    }

    const membershipByEpsuId = new Map(userMemberships.map((membership) => [membership.epsuId, membership]));
    return epsus.filter((epsu) => {
      const membership = membershipByEpsuId.get(epsu.id);
      return (
        membership &&
        ['active', 'muted', 'invited'].includes(membership.status) &&
        epsu.scope === 'school' &&
        epsu.review_status === 'approved'
      );
    }).length;
  }, [currentIsAdmin, epsus, userMemberships]);
  const canSubmit =
    trimmedSchoolName.length >= MIN_SCHOOL_NAME_LENGTH &&
    trimmedSchoolName.length <= MAX_SCHOOL_NAME_LENGTH &&
    hasValidWebsite;
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
      setWebsiteError(websiteValidationError);
      return;
    }

    if (approvedSchoolMembershipCount >= 3) {
      showAppDialog(
        'Maximum school Epsu limit reached',
        'You already are a member of maximum amount of school Epsus. Leave from one in order to create a new Epsu.'
      );
      return;
    }

    const result = await onCreateSchoolEpsu({
      schoolName: trimmedSchoolName,
      website: trimmedWebsite,
    });

    if (!result?.ok) {
      showAppDialog('Create school Epsu', result?.message ?? 'Could not create school Epsu');
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
    return <View style={styles.screen} />;
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
        <Text style={styles.sectionEyebrow}>Create school Epsu</Text>
        <Text style={styles.sectionTitle}>Does your school have an Epsu?</Text>
        <Text style={styles.helper}>
          Type the name of the school and their website. This data must be accurate and spelt correctly, otherwise this Epsu won&apos;t be created. Trial Epsu must get 14 members in 7 days after launch to become permanent
        </Text>

        <Text style={styles.inputLabel}>School name</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: Massachusetts Institute of Technology"
          placeholderTextColor="#8d6676"
          value={schoolName}
          onChangeText={setSchoolName}
          maxLength={MAX_SCHOOL_NAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="off"
        />

        <Text style={styles.inputLabel}>School website</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: mit.edu"
          placeholderTextColor="#8d6676"
          value={website}
          onChangeText={(value) => {
            setWebsite(value);
            if (websiteError) {
              setWebsiteError(validateSchoolWebsite(value));
            }
          }}
          onBlur={() => {
            setWebsiteError(validateSchoolWebsite(website));
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          maxLength={MAX_SCHOOL_WEBSITE_LENGTH}
        />
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
    backgroundColor: UI.colors.background,
  },
  content: {
    paddingHorizontal: UI.spacing.screen,
    paddingBottom: 110,
    gap: 16,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
  },
  helper: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
  },
  input: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: UI.colors.text,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -8,
  },
  errorText: {
    color: UI.colors.danger,
    fontSize: 13,
    fontWeight: '700',
    marginTop: -6,
  },
  submitWrap: {
    position: 'absolute',
    left: UI.spacing.screen,
    right: UI.spacing.screen,
    bottom: 0,
  },
  submitButton: {
    minHeight: 56,
    backgroundColor: UI.colors.primary,
    borderRadius: UI.radius.row,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  submitText: {
    color: UI.colors.surface,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
