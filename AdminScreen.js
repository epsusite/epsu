import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { findCountryByCode } from './lib/countries';
import { getSchoolLogoUrl } from './lib/schoolLogo';
import { fetchPendingSchoolEpsus, fetchRegionalEpsuSuggestions } from './lib/schoolApi';
import { UI } from './lib/uiTheme';

function getPickedAssetUri(result) {
  if (Array.isArray(result)) {
    return getPickedAssetUri(result[0] ?? null);
  }

  if (!result || result.canceled) {
    return null;
  }

  return result.assets?.[0]?.uri ?? result.uri ?? null;
}

function PendingSchoolCard({ item, onReview }) {
  const logoUrl = getSchoolLogoUrl(item.logo_path);

  return (
    <View style={styles.card}>
      {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="cover" /> : null}
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardBody}>{item.website || 'No website provided'}</Text>
      <Text style={styles.cardMeta}>{item.country_code || 'Unknown country'}</Text>
      <Text style={styles.cardMeta}>Host: {item.host_email ?? 'Unknown'}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => onReview(item, 'rejected')} activeOpacity={0.85}>
          <Text style={styles.secondaryText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onReview(item, 'approved')} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RegionalSuggestionCard({ item, onReview }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardMeta}>{findCountryByCode(item.country_code)?.name ?? item.country_code ?? 'Unknown country'}</Text>
      <Text style={styles.cardMeta}>{item.vote_count} request{item.vote_count === 1 ? '' : 's'}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => onReview(item, 'rejected')} activeOpacity={0.85}>
          <Text style={styles.secondaryText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={() => onReview(item, 'approved')} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminScreen({
  onReviewPendingSchoolEpsu,
  onReviewRegionalEpsuSuggestion,
  onReleaseQueuedPostsNow,
}) {
  const insets = useSafeAreaInsets();
  const [pendingSchools, setPendingSchools] = useState([]);
  const [regionalSuggestions, setRegionalSuggestions] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [isReleasingQueuedPosts, setIsReleasingQueuedPosts] = useState(false);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      fetchPendingSchoolEpsus(),
      fetchRegionalEpsuSuggestions(),
    ])
      .then(([pendingSchoolsResult, regionalSuggestionsResult]) => {
        if (isActive) {
          setPendingSchools(pendingSchoolsResult);
          setRegionalSuggestions(regionalSuggestionsResult);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (isActive) {
          setPendingSchools([]);
          setRegionalSuggestions([]);
          setLoadError(error?.message ?? 'Could not load administration data');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleReview = async (item, status) => {
    let logoUri = null;
    if (status === 'approved') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAppDialog('School review', 'Allow photo library access to choose a school logo');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      logoUri = getPickedAssetUri(pickerResult);

      if (!logoUri) {
        showAppDialog('School review', 'Choose a school logo before approving this school');
        return;
      }
    }

    const result = await onReviewPendingSchoolEpsu(item.id, status, logoUri);
    showAppDialog('School review', result?.ok ? `School ${status}` : (result?.message ?? 'Could not review this school'));

    if (result?.ok) {
      setPendingSchools((current) => current.filter((entry) => entry.id !== item.id));
    }
  };

  const handleRegionalReview = async (item, status) => {
    let logoUri = null;
    if (status === 'approved') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAppDialog('Regional suggestion', 'Allow photo library access to choose a regional logo');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      logoUri = getPickedAssetUri(pickerResult);

      if (!logoUri) {
        showAppDialog('Regional suggestion', 'Choose a regional logo before approving this suggestion');
        return;
      }
    }

    const result = await onReviewRegionalEpsuSuggestion(item.title, item.country_code, status, logoUri);
    showAppDialog('Regional suggestion', result?.ok ? `Suggestion ${status}` : (result?.message ?? 'Could not review this suggestion'));

    if (result?.ok) {
      setRegionalSuggestions((current) =>
        current.filter((entry) => !(entry.title === item.title && entry.country_code === item.country_code))
      );
    }
  };

  const handleReleaseQueuedPosts = async () => {
    if (isReleasingQueuedPosts) {
      return;
    }

    setIsReleasingQueuedPosts(true);
    try {
      const result = await onReleaseQueuedPostsNow();
      showAppDialog(
        'Queued posts',
        result?.ok
          ? 'Queued posts were released now'
          : (result?.message ?? 'Could not release queued posts')
      );
    } finally {
      setIsReleasingQueuedPosts(false);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      data={pendingSchools}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PendingSchoolCard item={item} onReview={handleReview} />}
      ListHeaderComponent={(
        <>
          <Text style={styles.sectionEyebrow}>Administration</Text>
          <Text style={styles.sectionTitle}>Administration</Text>
          <TouchableOpacity
            style={[styles.primaryButton, isReleasingQueuedPosts && styles.primaryButtonDisabled]}
            onPress={handleReleaseQueuedPosts}
            activeOpacity={0.85}
            disabled={isReleasingQueuedPosts}
          >
            <Text style={styles.primaryText}>
              {isReleasingQueuedPosts ? 'Releasing queued posts' : 'Release queued posts now'}
            </Text>
          </TouchableOpacity>
          {loadError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Could not load administration data</Text>
              <Text style={styles.cardBody}>{loadError}</Text>
            </View>
          ) : null}
        </>
      )}
      ListFooterComponent={(
        <View style={styles.footerSection}>
          <Text style={styles.sectionTitleSecondary}>Regional suggestions</Text>
          <Text style={styles.helper}>
            Review requests for new city, region, or country Epsus
          </Text>
          <FlatList
            data={regionalSuggestions}
            keyExtractor={(item) => `${item.title}:${item.country_code ?? 'unknown'}`}
            scrollEnabled={false}
            contentContainerStyle={regionalSuggestions.length === 0 ? styles.emptyContent : styles.cardList}
            renderItem={({ item }) => <RegionalSuggestionCard item={item} onReview={handleRegionalReview} />}
            ListEmptyComponent={
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No regional suggestions</Text>
                <Text style={styles.cardBody}>Nobody has requested a new regional Epsu yet</Text>
              </View>
            }
          />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No pending schools</Text>
          <Text style={styles.cardBody}>Everything has been reviewed for now</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    paddingHorizontal: UI.spacing.screen,
    paddingBottom: 28,
    flexGrow: 1,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 12,
  },
  sectionTitleSecondary: {
    fontSize: 24,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 8,
  },
  helper: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  footerSection: {
    marginTop: UI.spacing.section,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  cardList: {
    gap: UI.spacing.gap,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    marginBottom: 12,
    backgroundColor: UI.colors.surfaceMuted,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
    color: UI.colors.textMuted,
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 13,
    color: UI.colors.textSoft,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  secondaryButton: {
    borderRadius: UI.radius.button,
    borderWidth: 1,
    borderColor: UI.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI.colors.surfaceMuted,
  },
  secondaryText: {
    color: UI.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
