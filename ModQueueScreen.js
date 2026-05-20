import React, { useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { fetchFlaggedQueuedPostsForEpsu, fetchMutedAuthorIdsForEpsu, fetchOpenReportsForEpsu } from './lib/api/moderation';
import { UI } from './lib/uiTheme';
import { REPORT_REASONS } from './ReportScreen';

function splitHighlightedText(text, keywords) {
  const normalizedText = text ?? '';
  const filteredKeywords = Array.from(
    new Set((keywords ?? []).map((keyword) => keyword?.trim()).filter(Boolean))
  ).sort((left, right) => right.length - left.length);

  if (!normalizedText || filteredKeywords.length === 0) {
    return [{ text: normalizedText, highlighted: false }];
  }

  const pattern = new RegExp(`(${filteredKeywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return normalizedText.split(pattern).filter(Boolean).map((part) => ({
    text: part,
    highlighted: filteredKeywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase()),
  }));
}

function HighlightedText({ text, keywords, style, highlightStyle }) {
  const parts = useMemo(() => splitHighlightedText(text, keywords), [text, keywords]);

  return (
    <Text style={style}>
      {parts.map((part, index) => (
        <Text
          key={`${part.text}-${index}`}
          style={part.highlighted ? [style, highlightStyle] : style}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function EvidencePostCard({ post, keywords = [] }) {
  return (
    <View style={styles.postWrap}>
      <Text style={styles.postNumber}>#{post.number}</Text>
      <HighlightedText
        text={post.title}
        keywords={keywords}
        style={styles.postTitle}
        highlightStyle={styles.postHighlight}
      />
      <HighlightedText
        text={post.body}
        keywords={keywords}
        style={styles.postBody}
        highlightStyle={styles.postHighlight}
      />
    </View>
  );
}

function ReportReasonRow({ label, count }) {
  return (
    <View style={styles.reasonCountRow}>
      <Text style={styles.reasonCountLabel}>{label}</Text>
      <Text style={styles.reasonCountValue}>{count}</Text>
    </View>
  );
}

function QueuePostCard({ item, onPress }) {
  const flaggedLabel = item.flaggedKeywords?.length ? `Keyword filter: ${item.flaggedKeywords.join(', ')}` : null;
  const isAdminQueuedPost = item.queueType === 'adminQueued';
  const queueTypeLabel = isAdminQueuedPost
    ? 'Queued post'
    : item.queueType === 'flaggedAndReport'
      ? 'Keyword filter + user reports'
    : item.queueType === 'flagged'
      ? 'Keyword filter'
      : 'User reports';

  return (
    <View style={styles.card}>
      <View style={styles.queueTopRow}>
        <Text style={styles.queueBadge}>#{item.number}</Text>
        <View style={styles.queueTypePill}>
          <Text style={styles.queueTypePillText}>{queueTypeLabel}</Text>
        </View>
      </View>
      {flaggedLabel ? <Text style={styles.reportCategoryCompact}>{flaggedLabel}</Text> : null}

      <View style={styles.queueEvidenceCard}>
        <Text style={styles.queueEvidenceLabel}>Post</Text>
        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postBody}>{item.body}</Text>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={() => onPress(item)} activeOpacity={0.85}>
        <Text style={styles.primaryButtonText}>Investigate</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ModQueueScreen({
  mode = 'queue',
  navigation,
  route,
  reports,
  queuedFlaggedPosts,
  epsus,
  posts,
  onDismissReport,
  onDismissQueuedPost,
  onRemoveReportedPost,
  onMuteReportedAuthor,
  adminQueuedPosts = [],
  loadError = '',
  isRefreshing = false,
  onRefreshQueue,
  onAfterModerationAction,
  onIgnoreAdminQueuedPost,
}) {
  const insets = useSafeAreaInsets();
  const epsuId = route?.params?.epsuId ?? null;
  const postId = route?.params?.postId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const [liveReports, setLiveReports] = React.useState(null);
  const [liveQueuedFlags, setLiveQueuedFlags] = React.useState(null);
  const [mutedAuthorIds, setMutedAuthorIds] = React.useState([]);
  const sourceReports = liveReports ?? reports;
  const sourceQueuedFlags = liveQueuedFlags ?? queuedFlaggedPosts;
  const removePostFromLocalQueueState = React.useCallback((postId, queueType) => {
    if (queueType === 'flagged' || queueType === 'flaggedAndReport') {
      setLiveQueuedFlags((current) => (
        current == null ? current : current.filter((post) => post.id !== postId)
      ));
    }

    if (queueType === 'report' || queueType === 'flaggedAndReport') {
      setLiveReports((current) => (
        current == null ? current : current.filter((report) => report.post?.id !== postId)
      ));
    }
  }, []);

  const loadQueueData = React.useCallback(() => {
    if (!epsuId) {
      setLiveReports(null);
      setLiveQueuedFlags(null);
      setMutedAuthorIds([]);
      return () => {};
    }

    let isActive = true;

    const requests = [
      fetchMutedAuthorIdsForEpsu(epsuId).catch(() => null),
    ];

    if (mode === 'admin-queue' || mode === 'admin-investigation') {
      requests.push(Promise.resolve(null), Promise.resolve(null));
    } else {
      requests.push(
        fetchOpenReportsForEpsu(epsuId).catch(() => null),
        fetchFlaggedQueuedPostsForEpsu(epsuId).catch(() => null)
      );
    }

    Promise.all(requests).then(([nextMutedAuthorIds, nextReports, nextQueuedFlags]) => {
      if (!isActive) {
        return;
      }

      if (nextMutedAuthorIds) {
        setMutedAuthorIds(nextMutedAuthorIds);
      }

      if (nextReports) {
        setLiveReports(nextReports);
      }

      if (nextQueuedFlags) {
        setLiveQueuedFlags(nextQueuedFlags);
      }
    });

    return () => {
      isActive = false;
    };
  }, [epsuId, mode]);

  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadQueueData();
      return cleanup;
    }, [loadQueueData])
  );

  const filteredReports = useMemo(
    () => sourceReports.filter((report) => report.post?.epsuId === epsuId),
    [epsuId, sourceReports]
  );
  const filteredQueuedFlags = useMemo(
    () => sourceQueuedFlags.filter((post) => post.epsuId === epsuId),
    [epsuId, sourceQueuedFlags]
  );
  const groupedPosts = useMemo(() => {
    const grouped = new Map();

    filteredReports.forEach((report) => {
      const livePost = posts.find((post) => post.id === report.post.id);
      const existing = grouped.get(report.post.id);
      const basePost = {
        ...report.post,
        likeCount: livePost?.likeCount ?? 0,
        dislikeCount: livePost?.dislikeCount ?? 0,
      };

      if (existing) {
        existing.reports.push(report);
        return;
      }

      grouped.set(report.post.id, {
        ...basePost,
        reports: [report],
      });
    });

    return Array.from(grouped.values()).sort((left, right) => left.number - right.number);
  }, [filteredReports, posts]);
  const queueItems = useMemo(() => {
    const merged = new Map();

    filteredQueuedFlags.forEach((post) => {
      merged.set(post.id, {
        ...post,
        queueType: 'flagged',
        reports: [],
      });
    });

    groupedPosts.forEach((post) => {
      const existing = merged.get(post.id);
      if (existing) {
        merged.set(post.id, {
          ...existing,
          ...post,
          flaggedKeywords: existing.flaggedKeywords ?? [],
          reports: post.reports,
          queueType: 'flaggedAndReport',
        });
        return;
      }

      merged.set(post.id, {
        ...post,
        flaggedKeywords: [],
        queueType: 'report',
      });
    });

    return Array.from(merged.values()).sort((left, right) => left.number - right.number);
  }, [filteredQueuedFlags, groupedPosts]);
  const investigatedPost = groupedPosts.find((item) => item.id === postId) ?? null;
  const investigatedQueueItem = queueItems.find((item) => item.id === postId) ?? null;
  const investigatedAdminQueuedPost = adminQueuedPosts.find((item) => item.id === postId) ?? null;
  const investigationTarget = mode === 'admin-investigation'
    ? investigatedAdminQueuedPost
    : investigatedQueueItem ?? null;
  const reportReasonCounts = useMemo(() => {
    const counts = REPORT_REASONS.reduce((accumulator, reason) => {
      accumulator[reason] = 0;
      return accumulator;
    }, {});

    if (!investigatedPost?.reports?.length) {
      return counts;
    }

    investigatedPost.reports.forEach((report) => {
      if (report.reason && counts[report.reason] != null) {
        counts[report.reason] += 1;
      }
    });

    return counts;
  }, [investigatedPost]);
  const visibleReportReasons = useMemo(
    () => REPORT_REASONS.filter((reason) => (reportReasonCounts[reason] ?? 0) > 0),
    [reportReasonCounts]
  );
  const actionState = route?.params?.actionState ?? {};
  const isMuted = Boolean(
    (postId && actionState?.[postId]?.muted)
    || (investigationTarget?.authorId && mutedAuthorIds.includes(investigationTarget.authorId))
  );
  const isRemoved = Boolean(postId && actionState?.[postId]?.removed);
  const isAdminQueueMode = mode === 'admin-queue';
  const isAdminInvestigationMode = mode === 'admin-investigation';
  const adminQueueItems = useMemo(
    () => adminQueuedPosts.map((post) => ({
      ...post,
      queueType: 'adminQueued',
    })),
    [adminQueuedPosts]
  );

  const handleDismiss = async (post) => {
    if (post.queueType === 'adminQueued') {
      await onIgnoreAdminQueuedPost?.(post.id);
      await onAfterModerationAction?.();
      navigation.goBack();
      return;
    }

    let result = null;
    if (post.queueType === 'flaggedAndReport') {
      const [queuedResult, reportResult] = await Promise.all([
        onDismissQueuedPost(post.id),
        onDismissReport(post.id),
      ]);
      const queuedOk = Boolean(queuedResult?.ok);
      const reportOk = Boolean(reportResult?.ok);
      const queuedBenign = !queuedOk && (
        queuedResult?.alreadyHandled
        || queuedResult?.message === 'Post no longer requires keyword-review dismissal'
        || queuedResult?.message === 'Post was already reviewed'
      );
      const effectiveQueuedOk = queuedOk || queuedBenign;
      const effectiveReportOk = reportOk;
      const isPartialSuccess = effectiveQueuedOk !== effectiveReportOk;

      result = {
        ok: Boolean(effectiveQueuedOk && effectiveReportOk),
        partial: isPartialSuccess,
        message: !effectiveReportOk
          ? (reportResult?.message ?? 'Could not dismiss user reports')
          : !effectiveQueuedOk
            ? (queuedResult?.message ?? 'Could not dismiss keyword filter review')
            : null,
      };
    } else {
      result = post.queueType === 'flagged'
        ? await onDismissQueuedPost(post.id)
        : await onDismissReport(post.id);
    }
    showAppDialog(
      isAdminInvestigationMode ? 'Admin queue' : 'Mod Queue',
      result?.ok
        ? 'Report dismissed'
        : result?.partial
          ? 'Reports were dismissed, but keyword-review cleanup did not fully complete'
        : result?.message ?? 'Could not dismiss report'
    );
    if (result?.ok || result?.partial) {
      removePostFromLocalQueueState(post.id, post.queueType);
      await onAfterModerationAction?.();
      navigation.goBack();
    }
  };

  const handleRemove = async (post) => {
    const result = await onRemoveReportedPost(post.id);
    if (result?.ok) {
      await onAfterModerationAction?.();
      navigation.setParams({
        actionState: {
          ...actionState,
          [post.id]: {
            ...(actionState?.[post.id] ?? {}),
            removed: true,
          },
        },
      });
      return;
    }
    showAppDialog(
      'Mod Queue',
      result?.message ?? 'Could not remove post'
    );
  };

  const handleMute = async (post) => {
    const result = await onMuteReportedAuthor(post.id, post.authorId, post.epsuId);
    if (result?.ok) {
      setMutedAuthorIds((current) => (
        post.authorId && !current.includes(post.authorId)
          ? [...current, post.authorId]
          : current
      ));
      await onAfterModerationAction?.();
      navigation.setParams({
        actionState: {
          ...actionState,
          [post.id]: {
            ...(actionState?.[post.id] ?? {}),
            muted: true,
          },
        },
      });
      return;
    }
    showAppDialog(
      'Mod Queue',
      result?.message ?? 'Could not mute author'
    );
  };

  if (mode === 'investigation' || mode === 'admin-investigation') {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, styles.scrollContent, { paddingTop: insets.top + 12 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionEyebrow}>Investigation</Text>
          <Text style={styles.sectionTitle}>
            {investigationTarget
              ? (isAdminInvestigationMode
                ? `Review post #${investigationTarget.number}`
                : `All reports of post #${investigationTarget.number}`)
              : (isAdminInvestigationMode ? 'Queued post' : 'All reports')}
          </Text>

          {investigationTarget ? (
            <>
              {((investigationTarget?.queueType === 'flagged' || investigationTarget?.queueType === 'flaggedAndReport') && investigationTarget) || investigatedAdminQueuedPost ? (
                <View style={styles.card}>
                  <Text style={styles.reportLabel}>
                    {investigatedAdminQueuedPost ? 'Queued post' : 'Keyword filter'}
                  </Text>
                  {!investigatedAdminQueuedPost ? (
                    <Text style={styles.reportExplanation}>
                      {isRemoved
                        ? 'This post has been removed and will not be released'
                        : 'This post is waiting for moderator review before release'}
                    </Text>
                  ) : null}
                  <EvidencePostCard
                    post={investigationTarget}
                    keywords={(investigationTarget ?? investigatedAdminQueuedPost)?.flaggedKeywords ?? []}
                  />
                </View>
              ) : null}

              {(investigationTarget?.reports?.length || investigatedPost) ? (
                <View style={styles.card}>
                  <Text style={styles.reportLabel}>Reports</Text>
                  <Text style={styles.reportExplanation}>
                    {(investigationTarget?.reports?.length ?? investigatedPost?.reports?.length ?? 0)} report{(investigationTarget?.reports?.length ?? investigatedPost?.reports?.length ?? 0) === 1 ? '' : 's'}
                  </Text>
                  <View style={styles.reasonCountList}>
                    {visibleReportReasons.map((reason) => (
                      <ReportReasonRow
                        key={reason}
                        label={reason}
                        count={reportReasonCounts[reason] ?? 0}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.inlineActionGroup}>
                <View style={styles.actionRow}>
                  <View style={styles.actionSlot}>
                    <TouchableOpacity
                      style={styles.primaryButtonHalf}
                      onPress={() => handleDismiss(investigationTarget)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryButtonText}>
                        {investigatedAdminQueuedPost ? 'Ignore' : 'Dismiss'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.actionSlot}>
                    <TouchableOpacity
                      style={[styles.primaryButtonHalf, isMuted && styles.primaryButtonDisabled]}
                      onPress={() => handleMute(investigationTarget)}
                      activeOpacity={0.85}
                      disabled={isMuted}
                    >
                      <Text style={styles.primaryButtonText}>{isMuted ? 'Author muted' : 'Mute 24h'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButtonStacked, isRemoved && styles.primaryButtonDisabled]}
                  onPress={() => handleRemove(investigationTarget)}
                  activeOpacity={0.85}
                  disabled={isRemoved}
                >
                  <Text style={styles.primaryButtonText}>{isRemoved ? 'Post removed' : 'Remove post'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No reports found</Text>
              <Text style={styles.emptyText}>This investigation has nothing left to review</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>{isAdminQueueMode ? 'Administrator queue' : 'Mod queue'}</Text>
        <Text style={styles.sectionTitle}>
          {isAdminQueueMode ? (epsu?.name ?? 'Administrator queue') : epsu?.name ?? 'Epsu'}
        </Text>
        {isAdminQueueMode ? (
          <>
            {loadError ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Could not load queue</Text>
                <Text style={styles.cardBody}>{loadError}</Text>
              </View>
            ) : null}
          </>
        ) : null}
        <FlatList
          data={isAdminQueueMode ? adminQueueItems : queueItems}
          keyExtractor={(item) => `${item.queueType}:${item.id}`}
          contentContainerStyle={(isAdminQueueMode ? adminQueueItems : queueItems).length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => (
            <QueuePostCard
              item={item}
              onPress={(post) =>
                navigation.navigate(isAdminQueueMode ? 'AdminFullhourInvestigation' : 'Investigation', {
                  epsuId,
                  postId: post.id,
                })
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{isAdminQueueMode ? 'No queued posts' : 'No queue items'}</Text>
              <Text style={styles.emptyText}>
                {isAdminQueueMode
                  ? 'Everything waiting for the next full hour will show here'
                  : 'Queued flagged posts and reports will show here'}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: UI.spacing.screen,
  },
  scrollContent: {
    paddingBottom: 28,
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
    fontSize: 24,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.spacing.section,
  },
  list: {
    gap: UI.spacing.gap,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: UI.empty.horizontalPadding,
    paddingVertical: UI.empty.horizontalPadding,
  },
  emptyTitle: {
    fontSize: UI.empty.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: UI.empty.iconGap,
  },
  emptyText: {
    fontSize: UI.empty.textSize,
    color: UI.colors.textMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
  },
  queueTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  queueBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: UI.colors.primary,
    backgroundColor: UI.colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  queueTypePill: {
    borderRadius: 999,
    backgroundColor: UI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: UI.colors.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  queueTypePillText: {
    fontSize: 12,
    fontWeight: '900',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  queueSummary: {
    fontSize: 14,
    lineHeight: 21,
    color: UI.colors.textMuted,
    marginBottom: 10,
  },
  reportLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reportCategory: {
    fontSize: 17,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 6,
  },
  reportCategoryCompact: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.primary,
    marginBottom: 10,
  },
  queueEvidenceCard: {
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surfaceMuted,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.colors.borderSoft,
    marginBottom: 14,
  },
  queueEvidenceLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  reportExplanation: {
    fontSize: 14,
    lineHeight: 21,
    color: UI.colors.textMuted,
    marginBottom: 12,
  },
  postWrap: {
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surfaceMuted,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.colors.borderSoft,
  },
  postNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    marginBottom: 8,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 8,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
  },
  postHighlight: {
    color: UI.colors.primary,
    fontWeight: '900',
  },
  reasonCountList: {
    gap: 10,
  },
  reasonCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: UI.colors.borderSoft,
  },
  reasonCountLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.text,
  },
  reasonCountValue: {
    fontSize: 15,
    fontWeight: '900',
    color: UI.colors.primary,
  },
  inlineActionGroup: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 16,
    marginTop: 18,
    marginBottom: 28,
  },
  actionRow: {
    flexDirection: 'row',
    gap: UI.spacing.gap,
    width: '100%',
    alignSelf: 'stretch',
  },
  actionSlot: {
    flex: 1,
  },
  primaryButtonHalf: {
    width: '100%',
    minHeight: 52,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonStacked: {
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#b97a8a',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  reportsSection: {
    marginTop: UI.spacing.section,
  },
});
