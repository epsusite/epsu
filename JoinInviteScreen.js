import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { findCountryByCode } from './lib/countries';
import { normalizeCountryCode } from './lib/countryCode';
import { UI } from './lib/uiTheme';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const DEFAULT_REGIONAL_COUNTRY_CODE = 'EE';
const REGIONAL_SCOPES = ['city', 'state', 'country'];
const MIN_REGIONAL_TITLE_LENGTH = 2;
const MAX_REGIONAL_TITLE_LENGTH = 100;

export default function JoinInviteScreen({
  navigation,
  onSubmitEpsuSuggestion,
  currentCountryCode = null,
  currentIsAdmin = false,
  epsus = [],
  userMemberships = [],
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const resolvedCountryCode = normalizeCountryCode(currentCountryCode) ?? DEFAULT_REGIONAL_COUNTRY_CODE;
  const [countryCode, setCountryCode] = useState(() => resolvedCountryCode);
  const normalizedTitle = useMemo(() => title.trim(), [title]);
  const approvedRegionalMembershipCount = useMemo(() => {
    if (currentIsAdmin) {
      return 0;
    }

    const membershipByEpsuId = new Map(userMemberships.map((membership) => [membership.epsuId, membership]));
    return epsus.filter((epsu) => {
      const membership = membershipByEpsuId.get(epsu.id);
      return (
        membership &&
        ['active', 'muted', 'invited'].includes(membership.status) &&
        REGIONAL_SCOPES.includes(epsu.scope) &&
        epsu.review_status === 'approved'
      );
    }).length;
  }, [currentIsAdmin, epsus, userMemberships]);
  const canSubmit =
    normalizedTitle.length >= MIN_REGIONAL_TITLE_LENGTH &&
    normalizedTitle.length <= MAX_REGIONAL_TITLE_LENGTH &&
    countryCode.length === 2;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);

  useEffect(() => {
    setCountryCode(resolvedCountryCode);
  }, [resolvedCountryCode]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    if (approvedRegionalMembershipCount >= 1) {
      showAppDialog(
        'Maximum regional Epsu limit reached',
        'You already are a member of maximum amount of regional Epsus. Leave from one in order to create a new Epsu.'
      );
      return;
    }

    const result = await onSubmitEpsuSuggestion({
      title: normalizedTitle,
      countryCode,
    });

    if (!result?.ok) {
      showAppDialog('Create regional Epsu', result?.message ?? 'Could not create regional Epsu');
      return;
    }

    setTitle('');
    setCountryCode(resolvedCountryCode);
    showAppDialog(
      'Regional Epsu created',
      result?.message ?? 'Saved for review and you will get a notification after Administration approves or rejects it'
    );
    navigation.navigate('HomeMain');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} keyboardShouldPersistTaps="always">
        <Text style={styles.sectionEyebrow}>Create regional Epsu</Text>
        <Text style={styles.sectionTitle}>Create a regional Epsu</Text>
        <Text style={styles.helper}>
          Choose the city, region or country where the next regional Epsu should be. Trial Epsu must get 14 members in 7 days after launch to become permanent
        </Text>

        <Text style={styles.inputLabel}>Country</Text>
        <TouchableOpacity
          style={styles.countryButton}
          disabled
          activeOpacity={1}
        >
          <Text style={countryCode ? styles.countryButtonText : styles.countryPlaceholder}>
            {findCountryByCode(countryCode)?.name ?? 'Select country'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.inputLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Example: London instead of london"
          placeholderTextColor="#8d6676"
          value={title}
          onChangeText={setTitle}
          maxLength={MAX_REGIONAL_TITLE_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
        />
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
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: -8,
  },
  countryButton: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  countryButtonText: {
    color: UI.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  countryPlaceholder: {
    color: UI.colors.textSoft,
    fontSize: 16,
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
