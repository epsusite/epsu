import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function EpsuCard({ item, onPress, unratedCount, onRentPress }) {
  const unreadLabel = unratedCount > 99 ? 'NEW POSTS 99+' : `NEW POSTS ${unratedCount}`;
  const isRentCard = item.id === 'rent-epsu';

  return (
    <TouchableOpacity
      style={styles.epsuCard}
      onPress={() => (isRentCard ? onRentPress() : onPress(item.id))}
      activeOpacity={0.85}
    >
      <View style={styles.epsuBadge}>
        <Text style={styles.epsuBadgeText}>{item.code}</Text>
      </View>
      <View style={styles.epsuCopy}>
        <Text style={styles.epsuName}>{item.name}</Text>
        <Text style={styles.epsuMeta}>{item.meta ?? 'Joined Epsu'}</Text>
      </View>
      {!isRentCard && unratedCount > 0 ? (
        <View style={styles.newPostsBadge}>
          <Text style={styles.newPostsText}>{unreadLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ModerationPostCard({ post, onReact, onReply, onReport, hasReported }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const lastTapRef = useRef({ side: null, time: 0 });

  useEffect(() => {
    translateX.setValue(0);
    opacity.setValue(1);
    lastTapRef.current = { side: null, time: 0 };
  }, [opacity, post.id, translateX]);

  const runReaction = (side) => {
    const direction = side === 'like' ? 1 : -1;

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: direction * 420,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onReact(side, post);
      translateX.setValue(0);
      opacity.setValue(1);
    });
  };

  const handleActionTap = (side) => {
    const now = Date.now();
    const isDoubleTap =
      lastTapRef.current.side === side && now - lastTapRef.current.time <= 420;

    if (isDoubleTap) {
      lastTapRef.current = { side: null, time: 0 };
      runReaction(side);
      return;
    }

    lastTapRef.current = { side, time: now };
  };

  return (
    <View>
      <Animated.View
        style={[
          styles.postCard,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
      >
        <Text style={styles.postNumber}>#{post.number}</Text>
        <Text style={styles.postTitle}>{post.title}</Text>
        <Text style={styles.postBody}>{post.body}</Text>

        <Pressable style={styles.dislikeZone} onPress={() => handleActionTap('dislike')}>
          <View style={styles.reactionBadge}>
            <Ionicons name="heart-dislike" size={18} color="#e52b50" />
          </View>
        </Pressable>

        <Pressable style={styles.likeZone} onPress={() => handleActionTap('like')}>
          <View style={styles.reactionBadge}>
            <Ionicons name="heart" size={18} color="#e52b50" />
          </View>
        </Pressable>
      </Animated.View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, hasReported && styles.actionButtonDisabled]}
          onPress={() => onReport(post)}
          activeOpacity={0.85}
          disabled={hasReported}
        >
          <Text style={styles.actionButtonText}>{hasReported ? 'Already reported' : 'Report'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onReply(post)} activeOpacity={0.85}>
          <Text style={styles.actionButtonText}>Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeScreen({
  navigation,
  route,
  epsus,
  posts,
  reviewedPostIdsByEpsu,
  reportedPostIds,
  onReactToPost,
  onReportPost,
  moderatedEpsuIds,
  ownedEpsuIds,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const rentCard = {
    id: 'rent-epsu',
    code: '???',
    name: 'Rent a new Epsu',
    meta: 'Just for 9.99$ annualy!',
  };
  const selectedEpsuId = route?.params?.epsuId ?? null;
  const selectedEpsu = epsus.find((epsu) => epsu.id === selectedEpsuId) ?? null;
  const canModerate = selectedEpsu ? moderatedEpsuIds.includes(selectedEpsu.id) : false;
  const isOwner = selectedEpsu ? ownedEpsuIds.includes(selectedEpsu.id) : false;
  const filteredPosts = selectedEpsu ? posts.filter((post) => post.epsuId === selectedEpsu.id) : [];
  const unratedCountByEpsu = useMemo(
    () =>
      epsus.reduce((accumulator, epsu) => {
        const totalPosts = posts.filter((post) => post.epsuId === epsu.id).length;
        const ratedCount = reviewedPostIdsByEpsu[epsu.id]?.length ?? 0;
        accumulator[epsu.id] = Math.max(totalPosts - ratedCount, 0);
        return accumulator;
      }, {}),
    [epsus, posts, reviewedPostIdsByEpsu]
  );
  const filteredEpsus = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return [rentCard, ...epsus];
    return [
      rentCard,
      ...epsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery)),
    ];
  }, [epsus, searchQuery]);

  const currentPost = selectedEpsu
    ? filteredPosts.find(
        (post) => !(reviewedPostIdsByEpsu[selectedEpsu.id] ?? []).includes(post.id)
      ) ?? null
    : null;

  const handleReply = (post) => {
    navigation.navigate('Post', {
      replyNonce: Date.now(),
      replyTitle: `Reply to #${post.number}`,
      epsuId: post.epsuId,
      replyToPostId: post.id,
    });
  };

  if (!selectedEpsu) {
    return (
      <View style={styles.content}>
        <Text style={styles.sectionEyebrow}>Choose an Epsu</Text>
        <Text style={styles.sectionTitle}>Your Epsus</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search your Epsus"
          placeholderTextColor="#8d6676"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <FlatList
          data={filteredEpsus}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredEpsus.length === 0 ? styles.emptyEpsuContent : styles.epsuList}
          renderItem={({ item }) => (
            <EpsuCard
              item={item}
              onPress={(epsuId) => navigation.navigate('HomeEpsu', { epsuId })}
              onRentPress={() => navigation.navigate('RentEpsu')}
              unratedCount={unratedCountByEpsu[item.id] ?? 0}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No Epsus found</Text>
              <Text style={styles.emptyText}>Try a different search.</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View style={styles.feedHeader}>
        <Text style={styles.sectionEyebrow}>Your Epsus</Text>
        <Text style={styles.sectionTitle}>{selectedEpsu.name}</Text>
      </View>

      {canModerate || isOwner ? (
        <View style={styles.toolRow}>
          {canModerate ? (
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => navigation.navigate('ModQueue', { epsuId: selectedEpsu.id })}
              activeOpacity={0.85}
            >
              <Text style={styles.toolButtonText}>Mod Queue</Text>
            </TouchableOpacity>
          ) : null}
          {isOwner ? (
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => navigation.navigate('OwnerTools', { epsuId: selectedEpsu.id })}
              activeOpacity={0.85}
            >
              <Text style={styles.toolButtonText}>Owner Tools</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {currentPost ? (
        <ModerationPostCard
          post={currentPost}
          hasReported={reportedPostIds.includes(currentPost.id)}
          onReact={(reaction, post) => onReactToPost(selectedEpsu.id, post.id, reaction)}
          onReport={(post) =>
            navigation.navigate('ReportReason', {
              postId: post.id,
              epsuId: selectedEpsu.id,
            })
          }
          onReply={handleReply}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptyText}>Posts submitted to {selectedEpsu.name} will show here</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#fff8fb',
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
  epsuList: {
    paddingBottom: 18,
    gap: 12,
  },
  emptyEpsuContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 18,
  },
  searchInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 15,
    color: '#24171d',
  },
  epsuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  epsuBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e52b50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  epsuBadgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  epsuCopy: {
    flex: 1,
  },
  epsuName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 4,
  },
  epsuMeta: {
    fontSize: 14,
    color: '#7f6170',
  },
  newPostsBadge: {
    marginLeft: 12,
    backgroundColor: '#e52b50',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  newPostsText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  feedHeader: {
    marginBottom: 12,
  },
  toolRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  toolButton: {
    flex: 1,
    backgroundColor: '#e52b50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  toolButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
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
  postCard: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    minHeight: 250,
    justifyContent: 'center',
  },
  dislikeZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 16,
    zIndex: 2,
  },
  likeZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    alignItems: 'flex-end',
    padding: 16,
    zIndex: 2,
  },
  reactionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffe0ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
    marginBottom: 10,
    textAlign: 'center',
  },
  postTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e1419',
    marginBottom: 12,
    textAlign: 'center',
  },
  postBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#49303a',
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#e52b50',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  actionButtonDisabled: {
    backgroundColor: '#b97a8a',
  },
});
