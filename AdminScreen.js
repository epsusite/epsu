import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

function logAdminApproval(message, details = null) {
  if (details == null) {
    console.log(`[admin-approval] ${message}`);
    return;
  }

  try {
    console.log(`[admin-approval] ${message}`, details);
  } catch {
    console.log(`[admin-approval] ${message}`);
  }
}

function getPickedAssetUri(result) {
  if (Array.isArray(result)) {
    return getPickedAssetUri(result[0] ?? null);
  }

  if (!result || result.canceled) {
    return null;
  }

  return result.assets?.[0]?.uri ?? result.uri ?? null;
}

function getRegionalFallbackTitle(name) {
  const normalized = String(name ?? '').trim();
  return normalized.replace(/\s+epsu$/i, '').trim();
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
      <Text style={styles.cardMeta}>Requested by: {item.host_email ?? 'Unknown'}</Text>
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
      <Text style={styles.cardMeta}>Requested by: {item.host_email ?? 'Unknown'}</Text>
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

function HostAssignmentModal({
  visible,
  hostEmail,
  onChangeHostEmail,
  onClose,
  onConfirm,
  isSubmitting,
  submissionMessage,
  itemName,
  scopeLabel,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Confirm {scopeLabel} host</Text>
            <Pressable style={styles.modalCloseButton} onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.modalBody}>
            {itemName}
            {'\n'}
            Enter the email of the existing account that should become this Epsu host when approval completes.
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="host@email.com"
            placeholderTextColor={UI.colors.textSoft}
            value={hostEmail}
            onChangeText={onChangeHostEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isSubmitting}
          />
          {submissionMessage ? (
            <Text style={styles.modalStatusText}>{submissionMessage}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalSecondaryButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalPrimaryButton, isSubmitting && styles.primaryButtonDisabled]}
              onPress={onConfirm}
              disabled={isSubmitting}
            >
              <Text style={styles.modalPrimaryText}>
                {isSubmitting ? 'Approving' : 'Approve'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  const [pendingApproval, setPendingApproval] = useState(null);

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
    logAdminApproval('school review tapped', {
      epsuId: item?.id ?? null,
      status,
      hasExistingHostEmail: Boolean(item?.host_email),
    });

    if (status !== 'approved') {
      const result = await onReviewPendingSchoolEpsu(item.id, status);
      showAppDialog('School review', result?.ok ? `School ${status}` : (result?.message ?? 'Could not review this school'));

      if (result?.ok) {
        setPendingSchools((current) => current.filter((entry) => entry.id !== item.id));
      }
      return;
    }

    let logoUri = null;
    if (status === 'approved') {
      logAdminApproval('school approval requesting media permission', {
        epsuId: item?.id ?? null,
      });
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        logAdminApproval('school approval media permission denied', {
          epsuId: item?.id ?? null,
        });
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
      logAdminApproval('school approval image picked', {
        epsuId: item?.id ?? null,
        hasLogoUri: Boolean(logoUri),
      });

      if (!logoUri) {
        logAdminApproval('school approval image missing after picker', {
          epsuId: item?.id ?? null,
        });
        showAppDialog('School review', 'Choose a school logo before approving this school');
        return;
      }
    }

    setPendingApproval({
      kind: 'school',
      item,
      logoUri,
      hostEmail: item.host_email ?? '',
      submissionMessage: '',
    });
  };

  const handleRegionalReview = async (item, status) => {
    logAdminApproval('regional review tapped', {
      epsuId: item?.id ?? null,
      status,
      hasExistingHostEmail: Boolean(item?.host_email),
    });

    if (status !== 'approved') {
      const result = await onReviewRegionalEpsuSuggestion(item.id, status);
      showAppDialog('Regional Epsu review', result?.ok ? `Regional Epsu ${status}` : (result?.message ?? 'Could not review this Epsu'));

      if (result?.ok) {
        setRegionalSuggestions((current) => current.filter((entry) => entry.id !== item.id));
      }
      return;
    }

    let logoUri = null;
    if (status === 'approved') {
      logAdminApproval('regional approval requesting media permission', {
        epsuId: item?.id ?? null,
      });
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        logAdminApproval('regional approval media permission denied', {
          epsuId: item?.id ?? null,
        });
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
      logAdminApproval('regional approval image picked', {
        epsuId: item?.id ?? null,
        hasLogoUri: Boolean(logoUri),
      });

      if (!logoUri) {
        logAdminApproval('regional approval image missing after picker', {
          epsuId: item?.id ?? null,
        });
        showAppDialog('Regional Epsu review', 'Choose a regional logo before approving this Epsu');
        return;
      }
    }

    setPendingApproval({
      kind: 'regional',
      item,
      logoUri,
      hostEmail: item.host_email ?? '',
      submissionMessage: '',
    });
  };

  const awaitWithTimeout = (promise, timeoutMs, timeoutMessage) =>
    Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: false, message: timeoutMessage });
        }, timeoutMs);
      }),
    ]);

  const handleConfirmApproval = async () => {
    const normalizedHostEmail = pendingApproval?.hostEmail?.trim().toLowerCase() ?? '';
    logAdminApproval('approval confirm pressed', {
      kind: pendingApproval?.kind ?? null,
      epsuId: pendingApproval?.item?.id ?? null,
      hasLogoUri: Boolean(pendingApproval?.logoUri),
      hostEmail: normalizedHostEmail || null,
    });

    if (!pendingApproval?.item || !pendingApproval?.logoUri) {
      logAdminApproval('approval confirm aborted missing item or logo', {
        kind: pendingApproval?.kind ?? null,
        epsuId: pendingApproval?.item?.id ?? null,
      });
      setPendingApproval(null);
      return;
    }

    if (!normalizedHostEmail) {
      logAdminApproval('approval confirm blocked missing host email', {
        kind: pendingApproval?.kind ?? null,
        epsuId: pendingApproval?.item?.id ?? null,
      });
      showAppDialog('Host required', 'Enter the email of the account that should become this Epsu host');
      return;
    }

    setPendingApproval((current) => (
      current
        ? {
            ...current,
            isSubmitting: true,
            submissionMessage: 'Uploading logo and completing approval...',
          }
        : current
    ));

    const isSchool = pendingApproval.kind === 'school';
    const reviewTitle = isSchool ? 'School review' : 'Regional Epsu review';
    const reviewAction = isSchool ? onReviewPendingSchoolEpsu : onReviewRegionalEpsuSuggestion;
    const setItems = isSchool ? setPendingSchools : setRegionalSuggestions;
    const reviewLabel = isSchool ? 'School approved' : 'Regional Epsu approved';

    logAdminApproval('approval action started', {
      kind: pendingApproval.kind,
      epsuId: pendingApproval.item.id,
      hostEmail: normalizedHostEmail,
    });

    const result = await awaitWithTimeout(
      reviewAction(
        pendingApproval.item.id,
        'approved',
        pendingApproval.logoUri,
        normalizedHostEmail,
        {
          existingHostEmail: pendingApproval.item.host_email ?? '',
          ...(pendingApproval.kind === 'regional'
            ? {
                title: getRegionalFallbackTitle(pendingApproval.item.name),
                countryCode: pendingApproval.item.country_code ?? '',
              }
            : {}),
        }
      ),
      45000,
      'Approval timed out. Try again. If this keeps happening, verify the future host already has an account and try a smaller logo image.'
    );

    logAdminApproval('approval action finished', {
      kind: pendingApproval.kind,
      epsuId: pendingApproval.item.id,
      ok: Boolean(result?.ok),
      message: result?.message ?? null,
      reviewStatus: result?.review_status ?? null,
    });
    showAppDialog(reviewTitle, result?.ok ? reviewLabel : (result?.message ?? 'Could not approve this Epsu'));

    if (result?.ok) {
      setItems((current) => current.filter((entry) => entry.id !== pendingApproval.item.id));
      setPendingApproval(null);
      return;
    }

    setPendingApproval((current) => (current ? { ...current, isSubmitting: false } : current));
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
    <View style={styles.screen}>
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
      <HostAssignmentModal
        visible={Boolean(pendingApproval)}
        hostEmail={pendingApproval?.hostEmail ?? ''}
        onChangeHostEmail={(value) => setPendingApproval((current) => (current ? { ...current, hostEmail: value } : current))}
        onClose={() => setPendingApproval((current) => (current?.isSubmitting ? current : null))}
        onConfirm={handleConfirmApproval}
        isSubmitting={Boolean(pendingApproval?.isSubmitting)}
        itemName={pendingApproval?.item?.name ?? 'Pending Epsu'}
        scopeLabel={pendingApproval?.kind === 'regional' ? 'regional Epsu' : 'school Epsu'}
        submissionMessage={pendingApproval?.submissionMessage ?? ''}
      />
    </View>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: UI.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.modal.overlayPadding,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: UI.radius.modal,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: UI.spacing.modal,
    paddingTop: UI.spacing.modal,
    paddingBottom: UI.spacing.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: UI.spacing.gap,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: UI.colors.text,
    flex: 1,
  },
  modalCloseButton: {
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: UI.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  modalInput: {
    minHeight: 56,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: UI.colors.text,
    marginBottom: 14,
  },
  modalStatusText: {
    fontSize: 13,
    lineHeight: 19,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: UI.spacing.gap - 2,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalSecondaryText: {
    color: UI.colors.primary,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalPrimaryText: {
    color: UI.colors.surface,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
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
