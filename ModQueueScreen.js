import React, { useMemo } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function splitReason(reason) {
  if (!reason) {
    return {
      category: 'Unspecified',
      explanation: '',
    };
  }

  const [category, ...rest] = reason.split('\n\n');
  return {
    category,
    explanation: rest.join('\n\n'),
  };
}

function ReportCard({ item }) {
  const { category, explanation } = splitReason(item.reason);

  return (
    <View style={styles.card}>
      <Text style={styles.reportLabel}>Report reason</Text>
      <Text style={styles.reportCategory}>{category}</Text>
      {explanation ? <Text style={styles.reportExplanation}>{explanation}</Text> : null}

      <View style={styles.postWrap}>
        <Text style={styles.postNumber}>#{item.post.number}</Text>
        <Text style={styles.postTitle}>{item.post.title}</Text>
        <Text style={styles.postBody}>{item.post.body}</Text>
      </View>
    </View>
  );
}

function QueuePostCard({ item, onPress }) {
  const totalReactions = item.likeCount + item.dislikeCount;
  const dislikePercent = totalReactions > 0 ? Math.round((item.dislikeCount / totalReactions) * 100) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.queueHeader}>
        <Text style={styles.postNumber}>#{item.number}</Text>
        <Text style={styles.dislikeText}>{dislikePercent}% disliked</Text>
      </View>
      <Text style={styles.postTitle}>{item.title}</Text>
      <Text style={styles.postBody}>{item.body}</Text>
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
  epsus,
  posts,
  onDismissReport,
  onRemoveReportedPost,
  onMuteReportedAuthor,
}) {
  const epsuId = route?.params?.epsuId ?? null;
  const postId = route?.params?.postId ?? null;
  const epsu = epsus.find((item) => item.id === epsuId) ?? null;
  const filteredReports = useMemo(
    () => reports.filter((report) => report.post?.epsuId === epsuId),
    [epsuId, reports]
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
  const investigatedPost = groupedPosts.find((item) => item.id === postId) ?? null;

  const handleDismiss = async (post) => {
    const result = await onDismissReport(post.id);
    Alert.alert('Mod Queue', result?.ok ? 'Report dismissed.' : 'Could not dismiss report.');
    if (result?.ok) {
      navigation.goBack();
    }
  };

  const handleRemove = async (post) => {
    const result = await onRemoveReportedPost(post.id);
    Alert.alert('Mod Queue', result?.ok ? 'Post removed.' : 'Could not remove post.');
    if (result?.ok) {
      navigation.goBack();
    }
  };

  const handleMute = async (post) => {
    const result = await onMuteReportedAuthor(post.id, post.authorId, post.epsuId);
    Alert.alert('Mod Queue', result?.ok ? 'Author muted for 24 hours.' : 'Could not mute author.');
    if (result?.ok) {
      navigation.goBack();
    }
  };

  if (mode === 'investigation') {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.sectionEyebrow}>Investigation</Text>
          <Text style={styles.sectionTitle}>
            {investigatedPost ? `All reports of post #${investigatedPost.number}` : 'All reports'}
          </Text>

          {investigatedPost ? (
            <>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => handleDismiss(investigatedPost)} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonText}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => handleMute(investigatedPost)} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonText}>Mute 24h</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.primaryButton} onPress={() => handleRemove(investigatedPost)} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Remove post</Text>
              </TouchableOpacity>

              <FlatList
                data={investigatedPost.reports}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => <ReportCard item={item} />}
              />
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No reports found</Text>
              <Text style={styles.emptyText}>This investigation has nothing left to review</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Mod queue</Text>
        <Text style={styles.sectionTitle}>{epsu?.name ?? 'Epsu'}</Text>
        <FlatList
          data={groupedPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={groupedPosts.length === 0 ? styles.emptyContent : styles.list}
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
              <Text style={styles.emptyTitle}>No open reports</Text>
              <Text style={styles.emptyText}>But soon, someone will mess this up</Text>
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
    backgroundColor: '#fff8fb',
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 18,
  },
  list: {
    gap: 14,
    paddingBottom: 18,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#7a5968',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    padding: 16,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  dislikeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8a5e70',
  },
  reportLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reportCategory: {
    fontSize: 17,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 6,
  },
  reportExplanation: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5d404c',
    marginBottom: 12,
  },
  postWrap: {
    borderRadius: 16,
    backgroundColor: '#fff8fb',
    padding: 14,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    marginBottom: 14,
  },
  postNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8a5e70',
    marginBottom: 8,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1e1419',
    marginBottom: 8,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#49303a',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    marginTop: 18,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e52b50',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e52b50',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#e52b50',
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});
