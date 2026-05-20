import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { findCountryByCode } from './lib/countries';
import { fetchBackgroundJobHealth } from './lib/api/moderation';
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
      <Text style={styles.cardMeta}>Requests: {Number(item.request_count ?? 1)}</Text>
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
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardMeta}>{findCountryByCode(item.country_code)?.name ?? item.country_code ?? 'Unknown country'}</Text>
      <Text style={styles.cardMeta}>Requests: {Number(item.request_count ?? 1)}</Text>
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

function formatJobTimestamp(value) {
  if (!value) {
    return 'Never';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString();
}

function BackgroundJobCard({ item }) {
  const statusToneStyle = item.isHealthy ? styles.healthGood : styles.healthBad;
  const statusTextStyle = item.isHealthy ? styles.healthGoodText : styles.healthBadText;
  const statusLabel = item.isHealthy ? 'Healthy' : 'Needs attention';

  return (
    <View style={styles.card}>
      <View style={styles.healthHeader}>
        <Text style={styles.cardTitle}>{item.jobName}</Text>
        <View style={[styles.healthBadge, statusToneStyle]}>
          <Text style={[styles.healthBadgeText, statusTextStyle]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.cardMeta}>Schedule: {item.schedule || 'Missing cron job'}</Text>
      <Text style={styles.cardMeta}>Last run: {formatJobTimestamp(item.lastRunStartedAt)}</Text>
      <Text style={styles.cardMeta}>Last status: {item.lastRunStatus || 'No runs yet'}</Text>
    </View>
  );
}

export default function AdminScreen({
  onReviewPendingSchoolEpsu,
  onReviewRegionalEpsuSuggestion,
  onReleaseQueuedPostsNow,
  navigation,
}) {
  const insets = useSafeAreaInsets();
  const [pendingSchools, setPendingSchools] = useState([]);
  const [regionalSuggestions, setRegionalSuggestions] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [regionalLoadError, setRegionalLoadError] = useState('');
  const [jobHealth, setJobHealth] = useState([]);
  const [jobHealthError, setJobHealthError] = useState('');
  const [isReleasingQueuedPosts, setIsReleasingQueuedPosts] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAdministrationData = () => {
    let isActive = true;

    setIsRefreshing(true);

    Promise.allSettled([
      fetchPendingSchoolEpsus(),
      fetchRegionalEpsuSuggestions(),
      fetchBackgroundJobHealth(),
    ])
      .then(([pendingSchoolsResult, regionalSuggestionsResult, jobHealthResult]) => {
        if (!isActive) {
          return;
        }

        if (pendingSchoolsResult.status === 'fulfilled') {
          setPendingSchools(pendingSchoolsResult.value);
          setLoadError('');
        } else {
          setPendingSchools([]);
          setLoadError(pendingSchoolsResult.reason?.message ?? 'Could not load pending schools');
        }

        if (regionalSuggestionsResult.status === 'fulfilled') {
          setRegionalSuggestions(regionalSuggestionsResult.value);
          setRegionalLoadError('');
        } else {
          setRegionalSuggestions([]);
          setRegionalLoadError(regionalSuggestionsResult.reason?.message ?? 'Could not load regional trial requests');
        }

        if (jobHealthResult.status === 'fulfilled') {
          setJobHealth(jobHealthResult.value);
          setJobHealthError('');
        } else {
          setJobHealth([]);
          setJobHealthError(jobHealthResult.reason?.message ?? 'Could not load background job health');
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRefreshing(false);
        }
      });

    return () => {
      isActive = false;
    };
  };

  useEffect(() => {
    const cleanup = loadAdministrationData();
    return cleanup;
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadAdministrationData();
      return cleanup;
    }, [])
  );

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
        showAppDialog('Regional Epsu review', 'Allow photo library access to choose a regional logo');
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
        showAppDialog('Regional Epsu review', 'Choose a regional logo before approving this Epsu');
        return;
      }
    }

    const result = await onReviewRegionalEpsuSuggestion(item.id, status, logoUri);
    showAppDialog('Regional Epsu review', result?.ok ? `Regional Epsu ${status}` : (result?.message ?? 'Could not review this Epsu'));

    if (result?.ok) {
      setRegionalSuggestions((current) => current.filter((entry) => entry.id !== item.id));
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
            style={styles.primaryActionButton}
            onPress={() => navigation.navigate('AdminFullhourQueue')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryActionText}>Administrator queue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerActionButton, isReleasingQueuedPosts && styles.primaryButtonDisabled]}
            onPress={handleReleaseQueuedPosts}
            activeOpacity={0.85}
            disabled={isReleasingQueuedPosts}
          >
            <Text style={styles.dangerActionText}>
              {isReleasingQueuedPosts ? 'Releasing queued posts' : 'Release queued posts now'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => {
              const cleanup = loadAdministrationData();
              return cleanup;
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryActionText}>
              {isRefreshing ? 'Refreshing admin lists' : 'Refresh admin lists'}
            </Text>
          </TouchableOpacity>
          {loadError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Could not load pending schools</Text>
              <Text style={styles.cardBody}>{loadError}</Text>
            </View>
          ) : (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>Pending schools: {pendingSchools.length}</Text>
            </View>
          )}
          <View style={styles.diagnosticsSection}>
            <Text style={styles.sectionTitleSecondary}>Background jobs</Text>
            <Text style={styles.helper}>
              Watch the hourly post cycle, cleanup tasks, and trial processing instead of assuming cron is healthy
            </Text>
            {jobHealthError ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Could not load background jobs</Text>
                <Text style={styles.cardBody}>{jobHealthError}</Text>
              </View>
            ) : (
              <FlatList
                data={jobHealth}
                keyExtractor={(item) => item.jobName}
                scrollEnabled={false}
                contentContainerStyle={jobHealth.length === 0 ? styles.emptyContent : styles.cardList}
                renderItem={({ item }) => <BackgroundJobCard item={item} />}
                ListEmptyComponent={
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>No background jobs found</Text>
                    <Text style={styles.cardBody}>The admin cron monitors are not available yet</Text>
                  </View>
                }
              />
            )}
          </View>
        </>
      )}
      ListFooterComponent={(
        <View style={styles.footerSection}>
          <Text style={styles.sectionTitleSecondary}>Regional trial requests</Text>
          <Text style={styles.helper}>
            Review requests for new city, region, or country trial Epsus
          </Text>
          {regionalLoadError ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Could not load regional requests</Text>
              <Text style={styles.cardBody}>{regionalLoadError}</Text>
            </View>
          ) : null}
          <FlatList
            data={regionalSuggestions}
            keyExtractor={(item) => `${item.title}:${item.country_code ?? 'unknown'}`}
            scrollEnabled={false}
            contentContainerStyle={regionalSuggestions.length === 0 ? styles.emptyContent : styles.cardList}
            renderItem={({ item }) => <RegionalSuggestionCard item={item} onReview={handleRegionalReview} />}
            ListEmptyComponent={
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No regional requests</Text>
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
  summaryCard: {
    backgroundColor: '#fff5f8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: UI.colors.text,
  },
  footerSection: {
    marginTop: UI.spacing.section,
  },
  diagnosticsSection: {
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
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  healthBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  healthGood: {
    backgroundColor: '#effaf2',
    borderColor: '#b8e1c2',
  },
  healthBad: {
    backgroundColor: '#fff3f5',
    borderColor: '#f0b5c0',
  },
  healthBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  healthGoodText: {
    color: '#1d7a36',
  },
  healthBadText: {
    color: UI.colors.danger,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: UI.radius.button,
    borderWidth: 1,
    borderColor: UI.colors.primary,
    paddingHorizontal: 12,
    backgroundColor: UI.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: UI.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryActionButton: {
    minHeight: 56,
    backgroundColor: UI.colors.primary,
    borderRadius: UI.radius.row,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    color: UI.colors.surface,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dangerActionButton: {
    minHeight: 56,
    backgroundColor: '#fff2f4',
    borderRadius: UI.radius.row,
    borderWidth: 1,
    borderColor: '#f0b5c0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  dangerActionText: {
    color: UI.colors.danger,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  secondaryActionButton: {
    minHeight: 56,
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.row,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  secondaryActionText: {
    color: UI.colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  primaryText: {
    color: UI.colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
});
