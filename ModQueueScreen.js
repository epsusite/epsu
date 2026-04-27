import React, { useEffect, useMemo, useState } from 'react';
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
  const reportCount = Array.isArray(item.reports) ? item.reports.length : 0;
  const queueTypeLabel = item.queueType === 'flagged' ? 'Keyword filter' : 'User reports';
  const queueTypeMeta = item.queueType === 'flagged'
    ? 'This post is waiting for moderator review before release'
    : `${reportCount} report${reportCount === 1 ? '' : 's'} waiting for review`;

  return (
    <View style={styles.card}>
      <View style={styles.queueTopRow}>
        <Text style={styles.queueBadge}>#{item.number}</Text>
        <View style={styles.queueTypePill}>
          <Text style={styles.queueTypePillText}>{queueTypeLabel}</Text>
        </View>
      </View>
      <Text style={styles.queueSummary}>{queueTypeMeta}</Text>
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
}) {
  const insets = useSafeAreaInsets();
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const epsuId = route?.params?.epsuId ?? null;
  const postId = route?.params?.postId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const filteredReports = useMemo(
    () => reports.filter((report) => report.post?.epsuId === epsuId),
    [epsuId, reports]
  );
  const filteredQueuedFlags = useMemo(
    () => queuedFlaggedPosts.filter((post) => post.epsuId === epsuId),
    [epsuId, queuedFlaggedPosts]
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
  const queueItems = useMemo(
    () =>
      [
        ...filteredQueuedFlags.map((post) => ({
          ...post,
          queueType: 'flagged',
        })),
        ...groupedPosts.map((post) => ({
          ...post,
          queueType: 'report',
        })),
      ].sort((left, right) => left.number - right.number),
    [filteredQueuedFlags, groupedPosts]
  );
  const investigatedPost = groupedPosts.find((item) => item.id === postId) ?? null;
  const investigatedQueuedPost = filteredQueuedFlags.find((item) => item.id === postId) ?? null;
  const investigationTarget = investigatedQueuedPost ?? investigatedPost ?? null;
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
  const nextBatchCountdown = useMemo(() => {
    const now = new Date(currentTime);
    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const remainingMs = Math.max(0, nextHour.getTime() - now.getTime());
    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }, [currentTime]);

  useEffect(() => {
    if (isRemoved) {
      return undefined;
    }

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isRemoved]);
  const actionState = route?.params?.actionState ?? {};
  const isMuted = Boolean(postId && actionState?.[postId]?.muted);
  const isRemoved = Boolean(postId && actionState?.[postId]?.removed);

  const handleDismiss = async (post) => {
    const result = post.queueType === 'flagged'
      ? await onDismissQueuedPost(post.id)
      : await onDismissReport(post.id);
    showAppDialog(
      'Mod Queue',
      result?.ok ? 'Report dismissed' : result?.message ?? 'Could not dismiss report'
    );
    if (result?.ok) {
      navigation.goBack();
    }
  };

  const handleRemove = async (post) => {
    const result = await onRemoveReportedPost(post.id);
    if (result?.ok) {
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

  if (mode === 'investigation') {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, styles.scrollContent, { paddingTop: insets.top + 12 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionEyebrow}>Investigation</Text>
          <Text style={styles.sectionTitle}>
            {investigationTarget ? `All reports of post #${investigationTarget.number}` : 'All reports'}
          </Text>

          {investigationTarget ? (
            <>
              {investigatedQueuedPost ? (
                <View style={styles.card}>
                  <Text style={styles.reportLabel}>Keyword filter</Text>
                  <Text style={styles.reportExplanation}>
                    {isRemoved
                      ? 'This post has been removed and will not be released'
                      : `${nextBatchCountdown} until everyone will see this post`}
                  </Text>
                  <EvidencePostCard
                    post={investigationTarget}
                    keywords={investigatedQueuedPost.flaggedKeywords ?? []}
                  />
                </View>
              ) : null}

              {investigatedPost ? (
                <View style={styles.card}>
                  <Text style={styles.reportLabel}>Reports</Text>
                  <Text style={styles.reportExplanation}>
                    {investigatedPost.reports.length} report{investigatedPost.reports.length === 1 ? '' : 's'}
                  </Text>
                  <View style={styles.reasonCountList}>
                    {REPORT_REASONS.map((reason) => (
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
                      <Text style={styles.primaryButtonText}>Dismiss</Text>
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
        <Text style={styles.sectionEyebrow}>Mod queue</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>
        <FlatList
          data={queueItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={queueItems.length === 0 ? styles.emptyContent : styles.list}
          renderItem={({ item }) => (
            <QueuePostCard
              item={item}
              onPress={(post) =>
                navigation.navigate('Investigation', {
                  epsuId,
                  postId: post.id,
                })
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No queue items</Text>
              <Text style={styles.emptyText}>Queued flagged posts and reports will show here</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
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
