import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { getSchoolLogoUrl } from './lib/schoolLogo';

function EpsuCard({ item, onPress, unratedCount, onRentPress, disabled = false }) {
  const unreadLabel = unratedCount > 99 ? 'NEW POSTS 99+' : `NEW POSTS ${unratedCount}`;
  const isRentCard = item.id === 'rent-epsu';
  const isSuggestCard = item.id === 'suggest-epsu';
  const logoUrl = item.logo_path ? getSchoolLogoUrl(item.logo_path) : null;

  return (
    <TouchableOpacity
      style={[styles.epsuCard, disabled && styles.epsuCardDisabled]}
      onPress={() => {
        if (isRentCard || isSuggestCard) {
          onRentPress(item.id);
          return;
        }

        onPress(item.id);
      }}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <View style={styles.epsuBadge}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.epsuBadgeImage} contentFit="cover" />
        ) : (
          <Text style={styles.epsuBadgeText}>{item.code}</Text>
        )}
      </View>
      <View style={styles.epsuCopy}>
        <Text style={styles.epsuName}>{item.name}</Text>
        <Text style={styles.epsuMeta}>{item.meta ?? 'Joined Epsu'}</Text>
      </View>
      {!isRentCard && !isSuggestCard && unratedCount > 0 ? (
        <View style={styles.newPostsBadge}>
          <Text style={styles.newPostsText}>{unreadLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ReplyContextCard({ post }) {
  if (!post) {
    return null;
  }

  return (
    <View style={styles.replyContextWrap}>
      <Text style={styles.replyContextLabel}>In reply to</Text>
      <View style={[styles.postCard, styles.replyContextCard]}>
        <Text style={styles.replyContextNumber}>#{post.number}</Text>
        <Text style={styles.replyContextTitle}>{post.title}</Text>
        <Text style={styles.replyContextBody}>{post.body}</Text>
      </View>
    </View>
  );
}

function PostCardSurface({ post, opacity, translateX, swipeRotation, likeOverlayOpacity, dislikeOverlayOpacity, showSwipeHint, onLayout, isStatic = false }) {
  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.postCard,
        isStatic && styles.postCardStacked,
        {
          transform: [{ translateX }, { rotate: swipeRotation }],
          opacity,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.swipeOverlay, styles.swipeOverlayRight, { opacity: dislikeOverlayOpacity }]}
      >
        <View style={[styles.swipePill, styles.swipePillDislike]}>
          <Ionicons name="heart-dislike" size={18} color="#fff" />
          <Text style={styles.swipePillText}>DISLIKE</Text>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.swipeOverlay, styles.swipeOverlayLeft, { opacity: likeOverlayOpacity }]}
      >
        <View style={[styles.swipePill, styles.swipePillLike]}>
          <Text style={styles.swipePillText}>LIKE</Text>
          <Ionicons name="heart" size={18} color="#fff" />
        </View>
      </Animated.View>

      <View style={styles.reactionHintRow} pointerEvents="none">
        <View style={styles.reactionBadge}>
          <Ionicons name="heart-dislike" size={18} color="#e52b50" />
        </View>
        <View style={styles.reactionBadge}>
          <Ionicons name="heart" size={18} color="#e52b50" />
        </View>
      </View>

      <Text style={styles.postNumber}>#{post.number}</Text>
      <Text style={styles.postTitle}>{post.title}</Text>
      <Text style={styles.postBody}>{post.body}</Text>
      {showSwipeHint ? <Text style={styles.swipeHint}>Swipe right to like, left to dislike</Text> : null}
    </Animated.View>
  );
}

function ModerationPostCard({ post, replyTargetPost, onReact, onReply, onReport, onBlockAuthor, hasReported, showSwipeHint }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);
  const [cardWidth, setCardWidth] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [dismissedPostId, setDismissedPostId] = useState(null);
  const hasReplyContext = Boolean(post.replyToPostId && replyTargetPost?.id === post.replyToPostId);

  useEffect(() => {
    translateX.setValue(0);
    opacity.setValue(1);
    isAnimatingRef.current = false;
    setIsLocked(false);
    setDismissedPostId(null);
  }, [opacity, post.id, translateX]);

  const swipeThreshold = Math.max(cardWidth * 0.3, 96);
  const flingVelocityThreshold = 900;
  const swipeRotation = translateX.interpolate({
    inputRange: [-cardWidth, 0, cardWidth],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });
  const likeOverlayOpacity = translateX.interpolate({
    inputRange: [0, cardWidth * 0.12, swipeThreshold],
    outputRange: [0, 0.24, 1],
    extrapolate: 'clamp',
  });
  const dislikeOverlayOpacity = translateX.interpolate({
    inputRange: [-swipeThreshold, -cardWidth * 0.12, 0],
    outputRange: [1, 0.24, 0],
    extrapolate: 'clamp',
  });

  const runReaction = (side) => {
    const direction = side === 'like' ? 1 : -1;
    isAnimatingRef.current = true;
    setIsLocked(true);

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: direction * Math.max(cardWidth + 140, 420),
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDismissedPostId(post.id);
      void Promise.resolve(onReact(side, post)).then((result) => {
        if (result?.ok === false) {
          setDismissedPostId(null);
          translateX.setValue(0);
          opacity.setValue(1);
          isAnimatingRef.current = false;
          setIsLocked(false);
        }
      });
    });
  };

  const resetSwipe = () => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isAnimatingRef.current = false;
      setIsLocked(false);
    });
  };

  const handlePanGesture = ({ nativeEvent }) => {
    if (isAnimatingRef.current) {
      return;
    }

    translateX.setValue(nativeEvent.translationX);
  };

  const handlePanStateChange = ({ nativeEvent }) => {
    if (isAnimatingRef.current) {
      return;
    }

    if (nativeEvent.state === State.ACTIVE) {
      setIsLocked(true);
      return;
    }

    if (nativeEvent.oldState !== State.ACTIVE) {
      return;
    }

    const { translationX, velocityX } = nativeEvent;

    if (translationX >= swipeThreshold || velocityX >= flingVelocityThreshold) {
      runReaction('like');
      return;
    }

    if (translationX <= -swipeThreshold || velocityX <= -flingVelocityThreshold) {
      runReaction('dislike');
      return;
    }

    resetSwipe();
  };

  return (
    <View>
      {hasReplyContext ? <ReplyContextCard post={replyTargetPost} /> : null}
      <PanGestureHandler
        activeOffsetX={[-16, 16]}
        failOffsetY={[-24, 24]}
        onGestureEvent={handlePanGesture}
        onHandlerStateChange={handlePanStateChange}
      >
        <View pointerEvents={dismissedPostId === post.id ? 'none' : 'auto'}>
          <PostCardSurface
            post={post}
            opacity={dismissedPostId === post.id ? 0 : opacity}
            translateX={dismissedPostId === post.id ? 0 : translateX}
            swipeRotation={swipeRotation}
            likeOverlayOpacity={likeOverlayOpacity}
            dislikeOverlayOpacity={dislikeOverlayOpacity}
            showSwipeHint={showSwipeHint}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            if (nextWidth > 0 && nextWidth !== cardWidth) {
              setCardWidth(nextWidth);
            }
          }}
          />
        </View>
      </PanGestureHandler>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, hasReported && styles.actionButtonDisabled]}
          onPress={() => onReport(post)}
          activeOpacity={0.85}
          disabled={hasReported}
        >
          <Text style={styles.actionButtonText}>{hasReported ? 'Already reported' : 'Report'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onReply(post)}
          activeOpacity={0.85}
        >
          <Text style={styles.actionButtonText}>Reply</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, !post.authorId && styles.actionButtonDisabled]}
          onPress={() => onBlockAuthor(post)}
          activeOpacity={0.85}
          disabled={!post.authorId}
        >
          <Text style={styles.actionButtonText}>Block author</Text>
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
  memberships,
  epsuPopulationById,
  reviewedPostIdsByEpsu,
  reportedPostIds,
  onReactToPost,
  onReportPost,
  onBlockPostAuthor,
  moderatedEpsuIds,
  hostedEpsuIds,
  userMemberships,
  hiddenEpsuIds,
  blockedAuthorIds = [],
  onLeaveSchoolEpsu,
  onJoinRegionalEpsu,
  currentCountryCode,
  currentIsAdmin = false,
}) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [epsuCategory, setEpsuCategory] = useState('regional');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const rentCard = {
    id: 'rent-epsu',
    code: '???',
    name: 'Suggest school Epsu',
    meta: 'Request a new school Epsu',
  };
  const suggestCard = {
    id: 'suggest-epsu',
    code: '???',
    name: 'Suggest regional Epsu',
    meta: 'Request a new regional Epsu',
  };
  const selectedEpsuId = route?.params?.epsuId ?? null;
  const selectedEpsu = epsus.find((epsu) => epsu.id === selectedEpsuId) ?? null;
  const membershipByEpsuId = useMemo(
    () =>
      userMemberships.reduce((accumulator, membership) => {
        accumulator[membership.epsuId] = membership;
        return accumulator;
      }, {}),
    [userMemberships]
  );
  void memberships;
  const selectedMembership = selectedEpsu ? membershipByEpsuId[selectedEpsu.id] ?? null : null;
  const canModerate = selectedEpsu
    ? currentIsAdmin || moderatedEpsuIds.includes(selectedEpsu.id)
    : false;
  const isHost = selectedEpsu
    ? currentIsAdmin || hostedEpsuIds.includes(selectedEpsu.id)
    : false;
  const filteredPosts = selectedEpsu
    ? posts.filter((post) => post.epsuId === selectedEpsu.id && !blockedAuthorIds.includes(post.authorId))
    : [];
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
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);
  const unratedCountByEpsu = useMemo(
    () =>
      epsus.reduce((accumulator, epsu) => {
        const reviewedIds = new Set(reviewedPostIdsByEpsu[epsu.id] ?? []);
        const unratedCount = posts.reduce((count, post) => {
          if (post.epsuId !== epsu.id) {
            return count;
          }

          return reviewedIds.has(post.id) ? count : count + 1;
        }, 0);

        accumulator[epsu.id] = unratedCount;
        return accumulator;
      }, {}),
    [epsus, posts, reviewedPostIdsByEpsu]
  );
  const totalReviewedCount = useMemo(
    () =>
      Object.values(reviewedPostIdsByEpsu).reduce(
        (total, epsuPostIds) => total + (Array.isArray(epsuPostIds) ? epsuPostIds.length : 0),
        0
      ),
    [reviewedPostIdsByEpsu]
  );
  const filteredEpsus = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleEpsus = epsus.filter((epsu) => !hiddenEpsuIds.includes(epsu.id));
    const sortEpsus = (items) =>
      [...items].sort((left, right) => {
        const leftMembership = membershipByEpsuId[left.id];
        const rightMembership = membershipByEpsuId[right.id];
        const leftIsJoined = currentIsAdmin || ['active', 'muted'].includes(leftMembership?.status);
        const rightIsJoined = currentIsAdmin || ['active', 'muted'].includes(rightMembership?.status);

        if (leftIsJoined !== rightIsJoined) {
          return leftIsJoined ? -1 : 1;
        }

        const leftMemberCount = epsuPopulationById[left.id]?.memberCount ?? 0;
        const rightMemberCount = epsuPopulationById[right.id]?.memberCount ?? 0;
        if (leftMemberCount !== rightMemberCount) {
          return rightMemberCount - leftMemberCount;
        }

        return left.name.localeCompare(right.name);
      });

    const categoryEpsus = sortEpsus(
      visibleEpsus.filter((epsu) => {
        if (epsuCategory === 'school') {
          return (
            epsu.scope === 'school' &&
            epsu.review_status === 'approved' &&
            (currentIsAdmin || (currentCountryCode && epsu.country_code === currentCountryCode))
          );
        }

        const membership = membershipByEpsuId[epsu.id];
        const isCurrentCountryRegional =
          currentIsAdmin ||
          !epsu.country_code ||
          (currentCountryCode && epsu.country_code === currentCountryCode);
        return (
          epsu.scope !== 'school' &&
          epsu.scope !== 'private' &&
          epsu.review_status === 'approved' &&
          isCurrentCountryRegional &&
          (currentIsAdmin || !membership || ['active', 'muted', 'invited'].includes(membership?.status))
        );
      })
    );
    const primaryCard = epsuCategory === 'school' ? rentCard : suggestCard;

    if (!normalizedQuery) return [primaryCard, ...categoryEpsus];

    return [
      primaryCard,
      ...categoryEpsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery)),
    ];
  }, [currentCountryCode, currentIsAdmin, epsuCategory, epsuPopulationById, epsus, hiddenEpsuIds, membershipByEpsuId, searchQuery]);

  const getEpsuMeta = (epsu) => {
    const membership = membershipByEpsuId[epsu.id];
    const summary = epsuPopulationById[epsu.id] ?? { memberCount: 0, onlineCount: 0 };
    const memberCount = summary.memberCount;
    const memberLabel = `${memberCount} members`;
    const populationLabel = `${memberLabel}, ${summary.onlineCount} online now`;

    if (hostedEpsuIds.includes(epsu.id)) {
      return populationLabel;
    }

    if (membership?.status === 'invited') {
      return `Access pending, ${populationLabel}`;
    }

    if (epsu.scope === 'school' && (membership?.status === 'active' || membership?.status === 'muted')) {
      return populationLabel;
    }

    if (epsu.scope === 'school' && !membership) {
      return `Tap to join, ${populationLabel}`;
    }

    if (epsu.scope !== 'school' && !membership) {
      return `Tap to join, ${populationLabel}`;
    }

    return populationLabel;
  };

  const handleEpsuPress = async (epsuId) => {
    const epsu = epsus.find((item) => item.id === epsuId);
    const membership = membershipByEpsuId[epsuId];
    const isHostedEpsu = currentIsAdmin || hostedEpsuIds.includes(epsuId);
    const isModeratedEpsu = currentIsAdmin || moderatedEpsuIds.includes(epsuId);

    if (!epsu) {
      return;
    }

    if (epsu.scope === 'school') {
      if (epsu.review_status !== 'approved') {
        return;
      }

      if (isHostedEpsu || isModeratedEpsu) {
        navigation.navigate('HomeEpsu', { epsuId });
        return;
      }

      if (membership?.status === 'active' || membership?.status === 'muted') {
        navigation.navigate('HomeEpsu', { epsuId });
        return;
      }

      if (membership?.status === 'invited') {
        return;
      }

      const result = await onJoinRegionalEpsu(epsuId);
      if (result?.ok) {
        navigation.navigate('HomeEpsu', { epsuId });
        return;
      }

      showAppDialog('School Epsu', result?.message ?? 'Could not join this school Epsu');
      return;
    }

    if (membership?.status === 'invited') {
      return;
    }

    if (!['active', 'muted'].includes(membership?.status)) {
      const result = await onJoinRegionalEpsu(epsuId);
      if (result?.ok) {
        navigation.navigate('HomeEpsu', { epsuId });
        return;
      }

      showAppDialog('Regional Epsu', result?.message ?? 'Could not join this regional Epsu');
      return;
    }

    navigation.navigate('HomeEpsu', { epsuId });
  };

  const handleLeave = async () => {
    if (!selectedEpsu) {
      return;
    }

    const result = await onLeaveSchoolEpsu(selectedEpsu.id);
    if (result?.ok) {
      navigation.navigate('HomeMain');
      return;
    }

    showAppDialog('School Epsu', 'Could not leave this Epsu');
  };

  React.useEffect(() => {
    if (!selectedEpsu || selectedEpsu.scope !== 'school' || currentIsAdmin) {
      return;
    }

    if (selectedEpsu.review_status !== 'approved') {
      navigation.replace('HomeMain');
    }
  }, [currentIsAdmin, isHost, navigation, selectedEpsu]);

  const unratedPosts = useMemo(() => {
    if (!selectedEpsu) {
      return [];
    }

    const reviewedIds = new Set(reviewedPostIdsByEpsu[selectedEpsu.id] ?? []);
    return filteredPosts.filter((post) => !reviewedIds.has(post.id));
  }, [filteredPosts, reviewedPostIdsByEpsu, selectedEpsu]);
  const currentPost = unratedPosts[0] ?? null;
  const replyTargetPost =
    currentPost?.replyToPostId && currentPost.replyToPostId !== currentPost.id
      ? filteredPosts.find((post) => post.id === currentPost.replyToPostId) ?? null
      : null;

  const handleReply = (post) => {
    navigation.navigate('Post', {
      replyNonce: Date.now(),
      replyTitle: `Reply to #${post.number}`,
      epsuId: post.epsuId,
      replyToPostId: post.id,
    });
  };

  const handleBlockAuthor = (post) => {
    if (!post?.authorId) {
      return;
    }

    showAppDialog(
      'Block author',
      'You will stop seeing future posts from this anonymous author',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const result = await onBlockPostAuthor(post.id);
            showAppDialog(
              'Block author',
              result?.ok ? 'You will no longer see posts from this anonymous author' : result?.message ?? 'Could not block this author'
            );
          },
        },
      ]
    );
  };

  if (!selectedEpsu) {
    return (
      <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.sectionEyebrow}>Choose an Epsu</Text>
        <Text style={styles.sectionTitle}>Your Epsus</Text>
        {epsuCategory === 'school' ? (
          <Text style={styles.sectionHint}>For your academic institute, three Epsus at a time</Text>
        ) : (
          <Text style={styles.sectionHint}>For your nearby community, one Epsu at a time</Text>
        )}
        <View style={styles.categoryToggle}>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              epsuCategory === 'regional' && styles.categoryButtonActive,
            ]}
            onPress={() => setEpsuCategory('regional')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.categoryButtonText,
                epsuCategory === 'regional' && styles.categoryButtonTextActive,
              ]}
            >
              Regional Epsus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              epsuCategory === 'school' && styles.categoryButtonActive,
            ]}
            onPress={() => setEpsuCategory('school')}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.categoryButtonText,
                epsuCategory === 'school' && styles.categoryButtonTextActive,
              ]}
            >
              School Epsus
            </Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder={epsuCategory === 'school' ? 'Search school Epsus' : 'Search regional Epsus'}
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
              item={{
                ...item,
                meta:
                  item.id === 'rent-epsu' || item.id === 'suggest-epsu' ? item.meta : getEpsuMeta(item),
              }}
              onPress={handleEpsuPress}
              onRentPress={(cardId) =>
                navigation.navigate(cardId === 'rent-epsu' ? 'RentEpsu' : 'JoinInvite')
              }
              unratedCount={unratedCountByEpsu[item.id] ?? 0}
              disabled={
                item.id !== 'rent-epsu' &&
                item.id !== 'suggest-epsu' &&
                membershipByEpsuId[item.id]?.status === 'invited'
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No Epsus found</Text>
              <Text style={styles.emptyText}>Try a different search</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.feedHeader}>
        <Text style={styles.sectionEyebrow}>Your Epsus</Text>
        <Text style={styles.sectionTitle}>{selectedEpsu.name}</Text>
      </View>

      {selectedEpsu.scope === 'school' && selectedMembership?.status === 'active' && !isHost ? (
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave} activeOpacity={0.85}>
          <Text style={styles.leaveButtonText}>Leave school Epsu</Text>
        </TouchableOpacity>
      ) : null}

      {canModerate || isHost ? (
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
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => navigation.navigate('ModerationRecords', { epsuId: selectedEpsu.id })}
            activeOpacity={0.85}
          >
            <Text style={styles.toolButtonText}>Records</Text>
          </TouchableOpacity>
          {isHost ? (
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => navigation.navigate('OwnerTools', { epsuId: selectedEpsu.id })}
              activeOpacity={0.85}
            >
              <Text style={styles.toolButtonText}>Host Tools</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {selectedMembership?.status === 'muted' ? (
        <View style={styles.mutedCard}>
          <Text style={styles.mutedTitle}>You have been muted for 24 hours</Text>
          <Text style={styles.mutedText}>Until then, you can not post or rate here</Text>
        </View>
      ) : currentPost ? (
        <ModerationPostCard
          key={`${currentPost.id}:${replyTargetPost?.id ?? 'none'}`}
          post={currentPost}
          replyTargetPost={replyTargetPost}
          hasReported={reportedPostIds.includes(currentPost.id)}
          showSwipeHint={totalReviewedCount < 5}
          onReact={(reaction, post) => onReactToPost(selectedEpsu.id, post.id, reaction)}
          onBlockAuthor={handleBlockAuthor}
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
          <Text style={styles.emptyTitle}>No active posts right now</Text>
          <Text style={styles.emptyText}>{nextBatchCountdown} for the next posts to arrive!</Text>
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
  sectionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7a5968',
    marginBottom: 14,
  },
  leaveButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e52b50',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  leaveButtonText: {
    color: '#e52b50',
    fontSize: 14,
    fontWeight: '800',
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
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 15,
    color: '#24171d',
  },
  categoryToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  categoryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryButtonActive: {
    backgroundColor: '#e52b50',
    borderColor: '#e52b50',
  },
  categoryButtonText: {
    color: '#7f6170',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  categoryButtonTextActive: {
    color: '#fff',
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
  epsuCardDisabled: {
    opacity: 0.65,
  },
  epsuBadge: {
    width: 46,
    height: 46,
    borderRadius: 24,
    backgroundColor: '#e52b50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  epsuBadgeImage: {
    width: 46,
    height: 46,
    borderRadius: 24,
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
    borderRadius: 16,
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
    overflow: 'hidden',
  },
  replyContextWrap: {
    marginBottom: 12,
  },
  replyContextLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  replyContextCard: {
    minHeight: 0,
    justifyContent: 'flex-start',
    backgroundColor: '#fff3f7',
    borderColor: '#ecd4dc',
    paddingTop: 16,
    paddingBottom: 16,
  },
  replyContextNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b26079',
    marginBottom: 8,
    textAlign: 'center',
  },
  replyContextTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1e1419',
    marginBottom: 10,
    textAlign: 'center',
  },
  replyContextBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6c5460',
    textAlign: 'center',
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  swipeOverlayLeft: {
    left: 0,
    width: '60%',
    alignItems: 'flex-start',
    paddingLeft: 18,
  },
  swipeOverlayRight: {
    right: 0,
    width: '60%',
    alignItems: 'flex-end',
    paddingRight: 18,
  },
  reactionBadge: {
    width: 34,
    height: 34,
    borderRadius: 16,
    backgroundColor: '#ffe0ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionHintRow: {
    position: 'absolute',
    top: 14,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  swipePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  swipePillLike: {
    backgroundColor: 'rgba(34, 139, 94, 0.92)',
  },
  swipePillDislike: {
    backgroundColor: 'rgba(181, 38, 76, 0.94)',
  },
  swipePillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
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
  swipeHint: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '700',
    color: '#8a5e70',
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
    borderRadius: 16,
    minHeight: 58,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 18,
    textAlign: 'center',
    includeFontPadding: false,
  },
  actionButtonDisabled: {
    backgroundColor: '#b97a8a',
  },
  mutedCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  mutedTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#20131a',
    textAlign: 'center',
    marginBottom: 10,
  },
  mutedText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#7a5968',
    textAlign: 'center',
  },
});
