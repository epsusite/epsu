import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image as RNImage,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { fetchTrialEpsuCreatorState } from './lib/api/epsus';
import { getSchoolLogoUrl } from './lib/schoolLogo';
import { UI } from './lib/uiTheme';

const FEED_INTRO_SEEN_PREFIX = 'epsu_feed_intro_seen_v1:';
const GUEST_FEED_INTRO_SEEN_PREFIX = 'epsu_guest_feed_intro_seen_v1:';
const ANGRY_CAT_IMAGE = require('./assets/images/whyareyoureadingfiles.jpg');
const RENT_CARD = {
  id: 'rent-epsu',
  code: '???',
  name: 'Create school Epsu',
  meta: 'Request a trial Epsu now',
};
const SUGGEST_CARD = {
  id: 'suggest-epsu',
  code: '???',
  name: 'Create regional Epsu',
  meta: 'Request a trial Epsu now',
};
const REGIONAL_SCOPES = ['city', 'state', 'country'];

function CategoryHouseIcon({ color }) {
  return (
    <View style={styles.categoryIconBox}>
      <View
        style={[
          styles.houseRoof,
          {
            borderBottomColor: color,
          },
        ]}
      />
      <View style={[styles.houseBody, { borderColor: color }]}>
        <View style={[styles.houseDoor, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function CategoryCapIcon({ color }) {
  return (
    <View style={styles.categoryIconBox}>
      <View
        style={[
          styles.capTop,
          {
            borderBottomColor: color,
          },
        ]}
      />
      <View style={[styles.capBand, { backgroundColor: color }]} />
      <View style={[styles.capTasselStem, { backgroundColor: color }]} />
      <View style={[styles.capTasselTip, { backgroundColor: color }]} />
    </View>
  );
}

function mergePostsChronologically(currentPosts, incomingPosts) {
  const postMap = new Map();

  [...currentPosts, ...incomingPosts].forEach((post) => {
    if (!post?.id) {
      return;
    }

    postMap.set(post.id, post);
  });

  return Array.from(postMap.values()).sort((left, right) => {
    const releaseTimeDiff = new Date(left.releaseAt ?? 0).getTime() - new Date(right.releaseAt ?? 0).getTime();
    if (releaseTimeDiff !== 0) {
      return releaseTimeDiff;
    }

    return left.number - right.number;
  });
}

function getSeededFeedPosts({ cachedFeed, epsuId, posts }) {
  if (cachedFeed?.posts?.length) {
    return cachedFeed.posts;
  }

  return posts.filter((post) => post?.epsuId === epsuId);
}

function EpsuCard({ item, onPress, unratedCount, onRentPress, disabled = false, visuallyDisabled = false }) {
  const unreadLabel = unratedCount > 99 ? 'NEW POSTS 99+' : `NEW POSTS ${unratedCount}`;
  const isRentCard = item.id === 'rent-epsu';
  const isSuggestCard = item.id === 'suggest-epsu';
  const logoUrl = item.logo_path ? getSchoolLogoUrl(item.logo_path) : null;
  const isTrial = item.is_trial === true;

  return (
    <TouchableOpacity
      style={[styles.epsuCard, isTrial && styles.epsuCardTrial, visuallyDisabled && styles.epsuCardDisabled]}
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
          <View style={styles.epsuBadgePlaceholder} />
        )}
      </View>
      <View style={styles.epsuCopy}>
        <Text style={styles.epsuName}>{item.name}</Text>
        <Text style={styles.epsuMeta}>{item.meta ?? 'Joined Epsu'}</Text>
      </View>
      {!isRentCard && !isSuggestCard && !isTrial && unratedCount > 0 ? (
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
      {post.localImageSource ? (
        <View style={styles.postImageWrap}>
          <RNImage source={post.localImageSource} style={styles.postImage} resizeMode="cover" />
        </View>
      ) : (
        <Text style={styles.postBody}>{post.body}</Text>
      )}
      {showSwipeHint ? <Text style={styles.swipeHint}>Swipe right to like, left to dislike</Text> : null}
    </Animated.View>
  );
}

function ModerationPostCard({
  post,
  replyTargetPost,
  onReact,
  onReply,
  onReport,
  onBlockAuthor,
  hasReported,
  hasReplied,
  showSwipeHint,
  onIntroDismiss,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);
  const [cardWidth, setCardWidth] = useState(1);
  const [, setIsLocked] = useState(false);
  const [dismissedPostId, setDismissedPostId] = useState(null);
  const hasReplyContext = Boolean(post.replyToPostId && replyTargetPost?.id === post.replyToPostId);
  const isIntroCard = Boolean(post.isIntroCard);

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
      const actionPromise = isIntroCard ? onIntroDismiss?.(side, post) : onReact(side, post);
      void Promise.resolve(actionPromise).then((result) => {
        if (isIntroCard) {
          return;
        }

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
    const disallowLeftSwipe = post.isIntroCard && post.localImageSource;

    if (translationX >= swipeThreshold || velocityX >= flingVelocityThreshold) {
      runReaction('like');
      return;
    }

    if (!disallowLeftSwipe && (translationX <= -swipeThreshold || velocityX <= -flingVelocityThreshold)) {
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
        {isIntroCard ? null : (
          <>
            <TouchableOpacity
              style={[styles.actionButton, hasReported && styles.actionButtonDisabled]}
              onPress={() => onReport(post)}
              activeOpacity={0.85}
              disabled={hasReported}
            >
              <Text style={styles.actionButtonText}>{hasReported ? 'Already reported' : 'Report'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, hasReplied && styles.actionButtonDisabled]}
              onPress={() => onReply(post)}
              activeOpacity={0.85}
              disabled={hasReplied}
            >
              <Text style={styles.actionButtonText}>{hasReplied ? 'Already replied' : 'Reply'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, !post.authorId && styles.actionButtonDisabled]}
              onPress={() => onBlockAuthor(post)}
              activeOpacity={0.85}
              disabled={!post.authorId}
            >
              <Text style={styles.actionButtonText}>Block author</Text>
            </TouchableOpacity>
          </>
        )}
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
  activePostCountByEpsu = {},
  reviewedPostIdsByEpsu,
  reportedPostIds,
  repliedToPostIds = [],
  onReactToPost,
  onReportPost,
  onBlockPostAuthor,
  moderatedEpsuIds,
  hostedEpsuIds,
  userMemberships,
  hiddenEpsuIds,
  blockedAuthorIds = [],
  onLeaveEpsu,
  onJoinEpsu,
  onFetchEpsuFeedPage,
  onFetchPostById,
  currentCountryCode,
  currentIsAdmin = false,
  isGuestMode = false,
  onGuestLockedAction,
}) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [epsuCategory, setEpsuCategory] = useState('regional');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [feedIntroStage, setFeedIntroStage] = useState(null);
  const [selectedFeedPosts, setSelectedFeedPosts] = useState([]);
  const [selectedFeedOffset, setSelectedFeedOffset] = useState(0);
  const [selectedFeedHasMore, setSelectedFeedHasMore] = useState(true);
  const [isSelectedFeedLoading, setIsSelectedFeedLoading] = useState(false);
  const [hasLoadedSelectedFeed, setHasLoadedSelectedFeed] = useState(false);
  const [selectedFeedPageCache, setSelectedFeedPageCache] = useState({});
  const [selectedFeedPostCache, setSelectedFeedPostCache] = useState({});
  const replyContextLookupStatusRef = useRef({});
  const selectedFeedPageCacheRef = useRef({});
  const [trialCreatorState, setTrialCreatorState] = useState({
    isLocked: false,
    hasPendingSubmission: false,
    cooldownUntil: null,
  });
  const isFocused = useIsFocused();
  const feedIntroSeenKeyPrefix = isGuestMode ? GUEST_FEED_INTRO_SEEN_PREFIX : FEED_INTRO_SEEN_PREFIX;
  const rentCard = RENT_CARD;
  const suggestCard = SUGGEST_CARD;
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
  const isSelectedFeedInitialLoading = isSelectedFeedLoading && !hasLoadedSelectedFeed;
  const isSelectedFeedRefreshing = isSelectedFeedLoading && hasLoadedSelectedFeed;
  const canModerate = selectedEpsu
    ? currentIsAdmin || moderatedEpsuIds.includes(selectedEpsu.id)
    : false;
  const isHost = selectedEpsu
    ? currentIsAdmin || hostedEpsuIds.includes(selectedEpsu.id)
    : false;
  const filteredPosts = useMemo(() => {
    const selectedSourcePosts = selectedEpsu
      ? selectedFeedPosts
      : posts;

    return selectedEpsu
      ? selectedSourcePosts.filter((post) => post.epsuId === selectedEpsu.id && !blockedAuthorIds.includes(post.authorId))
      : [];
  }, [blockedAuthorIds, posts, selectedEpsu, selectedFeedPosts]);
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
  useEffect(() => {
    if (isGuestMode || selectedEpsu || !isFocused) {
      return undefined;
    }

    let isActive = true;

    fetchTrialEpsuCreatorState()
      .then((state) => {
        if (isActive) {
          setTrialCreatorState(state);
        }
      })
      .catch(() => {
        if (isActive) {
          setTrialCreatorState({
            isLocked: false,
            hasPendingSubmission: false,
            cooldownUntil: null,
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [isFocused, isGuestMode, selectedEpsu]);
  useEffect(() => {
    let isActive = true;

    const loadFeedIntroState = async () => {
      if (!selectedEpsu?.id) {
        if (isActive) {
          setFeedIntroStage(null);
        }
        return;
      }

      try {
        const storedValue = await AsyncStorage.getItem(`${feedIntroSeenKeyPrefix}${selectedEpsu.id}`);
        if (isActive) {
          setFeedIntroStage(storedValue === 'true' ? null : 'welcome');
        }
      } catch {
        if (isActive) {
          setFeedIntroStage('welcome');
        }
      }
    };

    void loadFeedIntroState();

    return () => {
      isActive = false;
    };
  }, [feedIntroSeenKeyPrefix, selectedEpsu?.id]);
  useEffect(() => {
    selectedFeedPageCacheRef.current = selectedFeedPageCache;
  }, [selectedFeedPageCache]);
  useEffect(() => {
    replyContextLookupStatusRef.current = {};
  }, [selectedEpsu?.id]);
  useEffect(() => {
    if (!selectedEpsu?.id) {
      setSelectedFeedPosts([]);
      setSelectedFeedOffset(0);
      setSelectedFeedHasMore(true);
      setIsSelectedFeedLoading(false);
      setHasLoadedSelectedFeed(false);
      return;
    }

    let isActive = true;
    const cachedFeed = selectedFeedPageCacheRef.current[selectedEpsu.id] ?? null;
    const seededFeedPosts = getSeededFeedPosts({
      cachedFeed,
      epsuId: selectedEpsu.id,
      posts,
    });
    const hasSeededFeedPosts = seededFeedPosts.length > 0;

    const loadInitialSelectedFeed = async () => {
      if (cachedFeed || hasSeededFeedPosts) {
        setSelectedFeedPosts(seededFeedPosts);
        setSelectedFeedOffset(cachedFeed.offset ?? 0);
        setSelectedFeedHasMore(cachedFeed ? Boolean(cachedFeed.hasMore) : true);
        setHasLoadedSelectedFeed(true);
      } else {
        setSelectedFeedPosts([]);
        setSelectedFeedOffset(0);
        setSelectedFeedHasMore(true);
        setHasLoadedSelectedFeed(false);
      }

      setIsSelectedFeedLoading(true);

      const result = await onFetchEpsuFeedPage(selectedEpsu.id, { offset: 0 });

      if (!isActive) {
        return;
      }

      if (result?.ok) {
        setSelectedFeedPosts((current) =>
          cachedFeed || hasSeededFeedPosts
            ? mergePostsChronologically(current, result.posts ?? [])
            : (result.posts ?? [])
        );
        setSelectedFeedOffset(
          cachedFeed
            ? Math.max(cachedFeed.offset ?? 0, result.nextOffset ?? (result.posts?.length ?? 0))
            : (result.nextOffset ?? (result.posts?.length ?? 0))
        );
        setSelectedFeedHasMore(Boolean(result.hasMore));
      } else {
        if (!cachedFeed && !hasSeededFeedPosts) {
          setSelectedFeedPosts([]);
          setSelectedFeedOffset(0);
          setSelectedFeedHasMore(false);
        }
      }

      setIsSelectedFeedLoading(false);
      setHasLoadedSelectedFeed(true);
    };

    void loadInitialSelectedFeed();

    return () => {
      isActive = false;
    };
  }, [onFetchEpsuFeedPage, posts, selectedEpsu?.id]);
  useEffect(() => {
    if (!selectedEpsu?.id || !hasLoadedSelectedFeed) {
      return;
    }

    setSelectedFeedPageCache((current) => ({
      ...current,
      [selectedEpsu.id]: {
        posts: selectedFeedPosts,
        offset: selectedFeedOffset,
        hasMore: selectedFeedHasMore,
      },
    }));
  }, [hasLoadedSelectedFeed, selectedEpsu?.id, selectedFeedHasMore, selectedFeedOffset, selectedFeedPosts]);
  useEffect(() => {
    if (!selectedEpsu?.id) {
      return;
    }

    setSelectedFeedPostCache((current) => {
      const next = { ...current };
      let hasChanges = false;

      [...selectedFeedPosts, ...posts]
        .filter((post) => post?.epsuId === selectedEpsu.id)
        .forEach((post) => {
          if (!post?.id) {
            return;
          }

          if (next[post.id] !== post) {
            next[post.id] = post;
            hasChanges = true;
          }
        });

      return hasChanges ? next : current;
    });
  }, [posts, selectedEpsu?.id, selectedFeedPosts]);
  useEffect(() => {
    if (!selectedEpsu?.id || posts.length === 0) {
      return;
    }

    setSelectedFeedPosts((current) => {
      const existingIds = new Set(current.map((post) => post.id));
      const incomingPosts = posts.filter((post) => post.epsuId === selectedEpsu.id && !existingIds.has(post.id));

      if (incomingPosts.length === 0) {
        return current;
      }

      return mergePostsChronologically(current, incomingPosts);
    });
  }, [posts, selectedEpsu?.id]);
  const unratedCountByEpsu = useMemo(() => {
    const visibleActivePostsByEpsu = posts.reduce((accumulator, post) => {
      if (!post?.epsuId || blockedAuthorIds.includes(post.authorId)) {
        return accumulator;
      }

      const existing = accumulator[post.epsuId] ?? [];
      existing.push(post);
      accumulator[post.epsuId] = existing;
      return accumulator;
    }, {});

    return epsus.reduce((accumulator, epsu) => {
      const reviewedIds = new Set(reviewedPostIdsByEpsu[epsu.id] ?? []);
      const visibleActivePosts = visibleActivePostsByEpsu[epsu.id] ?? [];
      const unratedCount = visibleActivePosts.filter((post) => !reviewedIds.has(post.id)).length;

      accumulator[epsu.id] = unratedCount;
      return accumulator;
    }, {});
  }, [blockedAuthorIds, epsus, posts, reviewedPostIdsByEpsu]);
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
        const leftGroup = leftIsJoined ? 0 : left.is_trial ? 1 : 2;
        const rightGroup = rightIsJoined ? 0 : right.is_trial ? 1 : 2;

        if (leftGroup !== rightGroup) {
          return leftGroup - rightGroup;
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
          REGIONAL_SCOPES.includes(epsu.scope) &&
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
  }, [currentCountryCode, currentIsAdmin, epsuCategory, epsuPopulationById, epsus, hiddenEpsuIds, membershipByEpsuId, rentCard, searchQuery, suggestCard]);

  const getEpsuMeta = (epsu) => {
    const membership = membershipByEpsuId[epsu.id];
    const summary = epsuPopulationById[epsu.id] ?? { memberCount: 0, onlineCount: 0 };
    const memberCount = summary.memberCount;
    const memberLabel = `${memberCount} members`;
    const populationLabel = `${memberLabel}, ${summary.onlineCount} online now`;
    const trialGoal = epsu.trial_member_goal ?? 14;
    const trialLabel = `${memberCount}/${trialGoal} members to become permanent`;

    if (epsu.is_trial) {
      return trialLabel;
    }

    if (isGuestMode) {
      return populationLabel;
    }

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

    if (REGIONAL_SCOPES.includes(epsu.scope) && !membership) {
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

    if (isGuestMode) {
      navigation.navigate('HomeEpsu', { epsuId });
      return;
    }

    if (epsu.review_status !== 'approved') {
      return;
    }

    if (isHostedEpsu || isModeratedEpsu || ['active', 'muted'].includes(membership?.status)) {
      navigation.navigate('HomeEpsu', { epsuId });
      return;
    }

    if (membership?.status === 'invited') {
      return;
    }

    const result = await onJoinEpsu(epsuId);
    if (result?.ok) {
      navigation.navigate('HomeEpsu', { epsuId });
      return;
    }

    showAppDialog('Epsu', result?.message ?? 'Could not join this Epsu');
  };

  const handleLeave = async () => {
    if (isGuestMode) {
      onGuestLockedAction?.();
      return;
    }

    if (!selectedEpsu) {
      return;
    }

    showAppDialog(
      'Leave Epsu',
      `Leave ${selectedEpsu.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const result = await onLeaveEpsu(selectedEpsu.id);
            if (result?.ok) {
              navigation.navigate('HomeMain');
              return;
            }

            showAppDialog('Epsu', result?.message ?? 'Could not leave this Epsu');
          },
        },
      ]
    );
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
  const introPost = useMemo(() => {
    if (!selectedEpsu || !feedIntroStage) {
      return null;
    }

    if (feedIntroStage === 'cat') {
      return {
        id: `intro-cat:${selectedEpsu.id}`,
        epsuId: selectedEpsu.id,
        authorId: null,
        number: 0,
        title: "It's not nice to dislike for no reason",
        body: '',
        likeCount: 0,
        dislikeCount: 0,
        replyToPostId: null,
        releaseAt: null,
        expireAt: null,
        isIntroCard: true,
        localImageSource: ANGRY_CAT_IMAGE,
      };
    }

    return {
      id: `intro:${selectedEpsu.id}`,
      epsuId: selectedEpsu.id,
      authorId: null,
      number: 0,
      title: `Welcome to ${selectedEpsu.name} feed!`,
      body: 'Swipe this post to see more',
      likeCount: 0,
      dislikeCount: 0,
      replyToPostId: null,
      releaseAt: null,
      expireAt: null,
      isIntroCard: true,
    };
  }, [feedIntroStage, selectedEpsu]);
  const currentPost = introPost ?? unratedPosts[0] ?? null;
  const replyTargetPost =
    !currentPost?.isIntroCard && currentPost?.replyToPostId && currentPost.replyToPostId !== currentPost.id
      ? filteredPosts.find((post) => post.id === currentPost.replyToPostId)
        ?? selectedFeedPostCache[currentPost.replyToPostId]
        ?? null
      : null;
  useEffect(() => {
    const replyTargetPostId = currentPost?.replyToPostId;

    if (
      !selectedEpsu?.id ||
      !replyTargetPostId ||
      currentPost?.isIntroCard ||
      replyTargetPostId === currentPost?.id ||
      replyTargetPost
    ) {
      return;
    }

    const lookupState = replyContextLookupStatusRef.current[replyTargetPostId];
    if (lookupState === 'pending' || lookupState === 'loaded' || lookupState === 'missing') {
      return;
    }

    replyContextLookupStatusRef.current[replyTargetPostId] = 'pending';

    let isActive = true;

    const loadReplyTargetPost = async () => {
      const result = await onFetchPostById(replyTargetPostId, selectedEpsu.id);

      if (!isActive) {
        return;
      }

      if (result?.ok && result.post?.id) {
        replyContextLookupStatusRef.current[replyTargetPostId] = 'loaded';
        setSelectedFeedPostCache((current) => ({
          ...current,
          [result.post.id]: result.post,
        }));
        return;
      }

      replyContextLookupStatusRef.current[replyTargetPostId] = 'missing';
    };

    void loadReplyTargetPost();

    return () => {
      isActive = false;
    };
  }, [
    currentPost?.id,
    currentPost?.isIntroCard,
    currentPost?.replyToPostId,
    onFetchPostById,
    replyTargetPost,
    selectedEpsu?.id,
  ]);

  const handleDismissIntroCard = async (side) => {
    if (!selectedEpsu?.id) {
      return { ok: true };
    }

    if (feedIntroStage === 'welcome' && side === 'dislike') {
      setFeedIntroStage('cat');
      return { ok: true };
    }

    setFeedIntroStage(null);
    await AsyncStorage.setItem(`${feedIntroSeenKeyPrefix}${selectedEpsu.id}`, 'true').catch(() => {});
    return { ok: true };
  };

  const handleReply = (post) => {
    if (isGuestMode) {
      onGuestLockedAction?.();
      return;
    }

    navigation.navigate('Post', {
      replyNonce: Date.now(),
      replyTitle: `Reply to #${post.number}`,
      epsuId: post.epsuId,
      replyToPostId: post.id,
    });
  };

  const handleBlockAuthor = (post) => {
    if (isGuestMode) {
      onGuestLockedAction?.();
      return;
    }

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
  useEffect(() => {
    if (!selectedEpsu?.id || introPost || currentPost || !hasLoadedSelectedFeed || !selectedFeedHasMore || isSelectedFeedLoading) {
      return;
    }

    let isActive = true;

    const loadMoreSelectedFeed = async () => {
      setIsSelectedFeedLoading(true);
      const result = await onFetchEpsuFeedPage(selectedEpsu.id, { offset: selectedFeedOffset });

      if (!isActive) {
        return;
      }

      if (result?.ok) {
        setSelectedFeedPosts((current) => mergePostsChronologically(current, result.posts ?? []));
        setSelectedFeedOffset(result.nextOffset ?? selectedFeedOffset);
        setSelectedFeedHasMore(Boolean(result.hasMore));
      } else {
        setSelectedFeedHasMore(false);
      }

      setIsSelectedFeedLoading(false);
    };

    void loadMoreSelectedFeed();

    return () => {
      isActive = false;
    };
  }, [
    currentPost,
    hasLoadedSelectedFeed,
    introPost,
    isSelectedFeedLoading,
    onFetchEpsuFeedPage,
    selectedEpsu?.id,
    selectedFeedHasMore,
    selectedFeedOffset,
  ]);

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
            <View style={styles.categoryButtonContent}>
              <CategoryHouseIcon color={epsuCategory === 'regional' ? '#fff' : UI.colors.primary} />
              <Text
                style={[
                  styles.categoryButtonText,
                  epsuCategory === 'regional' && styles.categoryButtonTextActive,
                ]}
              >
                Regional Epsus
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              epsuCategory === 'school' && styles.categoryButtonActive,
            ]}
            onPress={() => setEpsuCategory('school')}
            activeOpacity={0.85}
          >
            <View style={styles.categoryButtonContent}>
              <CategoryCapIcon color={epsuCategory === 'school' ? '#fff' : UI.colors.primary} />
              <Text
                style={[
                  styles.categoryButtonText,
                  epsuCategory === 'school' && styles.categoryButtonTextActive,
                ]}
              >
                School Epsus
              </Text>
            </View>
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
                isGuestMode
                  ? onGuestLockedAction?.()
                  : !trialCreatorState.isLocked
                    ? navigation.navigate(cardId === 'rent-epsu' ? 'RentEpsu' : 'JoinInvite')
                    : showAppDialog(
                        cardId === 'rent-epsu' ? 'School Epsu already created' : 'Regional Epsu already created',
                        'You will get a notification after Administration approves or rejects it'
                      )
              }
              unratedCount={unratedCountByEpsu[item.id] ?? 0}
              disabled={
                (
                  item.id !== 'rent-epsu' &&
                  item.id !== 'suggest-epsu' &&
                  membershipByEpsuId[item.id]?.status === 'invited'
                )
              }
              visuallyDisabled={
                ((item.id === 'rent-epsu' || item.id === 'suggest-epsu') && trialCreatorState.isLocked) ||
                (
                  item.id !== 'rent-epsu' &&
                  item.id !== 'suggest-epsu' &&
                  membershipByEpsuId[item.id]?.status === 'invited'
                )
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
        {isSelectedFeedRefreshing ? (
          <Text style={styles.refreshHint}>Refreshing posts...</Text>
        ) : null}
      </View>

      {['active', 'muted'].includes(selectedMembership?.status) && !isHost && !isGuestMode && !currentIsAdmin ? (
        <TouchableOpacity style={styles.leaveButton} onPress={handleLeave} activeOpacity={0.85}>
          <Text style={styles.leaveButtonText}>Leave Epsu</Text>
        </TouchableOpacity>
      ) : null}

      {!isGuestMode && (canModerate || isHost) ? (
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

      {currentPost ? (
        <ModerationPostCard
          key={`${currentPost.id}:${replyTargetPost?.id ?? 'none'}`}
          post={currentPost}
          replyTargetPost={replyTargetPost}
          hasReported={reportedPostIds.includes(currentPost.id)}
          hasReplied={repliedToPostIds.includes(currentPost.id)}
          showSwipeHint={totalReviewedCount < 5}
          onReact={(reaction, post) => onReactToPost(selectedEpsu.id, post.id, reaction)}
          onBlockAuthor={handleBlockAuthor}
          onIntroDismiss={handleDismissIntroCard}
          onReport={(post) =>
            isGuestMode
              ? onGuestLockedAction?.()
              : navigation.navigate('ReportReason', {
                  postId: post.id,
                  epsuId: selectedEpsu.id,
                })
          }
          onReply={handleReply}
        />
      ) : isSelectedFeedInitialLoading || !hasLoadedSelectedFeed ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Loading posts</Text>
          <Text style={styles.emptyText}>Pulling in this Epsu feed now</Text>
        </View>
      ) : selectedMembership?.status === 'muted' ? (
        <View style={styles.mutedCard}>
          <Text style={styles.mutedTitle}>You have been muted for 24 hours</Text>
          <Text style={styles.mutedText}>You can still read, react, and use your role tools. You just can not submit posts here right now</Text>
        </View>
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
    fontSize: UI.header.hintSize,
    lineHeight: UI.header.hintLineHeight,
    color: UI.colors.textMuted,
    marginBottom: UI.header.sectionGap,
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
    borderRadius: UI.radius.row,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 15,
    color: UI.colors.text,
  },
  categoryToggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  categoryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: UI.radius.row,
    borderWidth: 1,
    borderColor: UI.colors.border,
    backgroundColor: UI.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  categoryButtonActive: {
    backgroundColor: UI.colors.primary,
    borderColor: UI.colors.primary,
  },
  categoryButtonText: {
    color: UI.colors.textMuted,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  categoryIconBox: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  houseRoof: {
    position: 'absolute',
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  houseBody: {
    position: 'absolute',
    bottom: 1,
    width: 12,
    height: 9,
    borderWidth: 1.8,
    borderRadius: 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  houseDoor: {
    width: 3,
    height: 5,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  capTop: {
    position: 'absolute',
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  capBand: {
    position: 'absolute',
    top: 9,
    width: 12,
    height: 2.5,
    borderRadius: 999,
  },
  capTasselStem: {
    position: 'absolute',
    top: 6,
    right: 0,
    width: 1.6,
    height: 7,
    borderRadius: 999,
  },
  capTasselTip: {
    position: 'absolute',
    top: 12,
    right: -1,
    width: 4,
    height: 3,
    borderRadius: 999,
  },
  epsuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: UI.browseCard.minHeight,
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    padding: UI.spacing.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  epsuCardTrial: {
    backgroundColor: '#b7fb00',
    borderColor: '#d7ef8c',
  },
  epsuCardDisabled: {
    opacity: 0.65,
  },
  epsuBadge: {
    width: UI.browseCard.badgeSize,
    height: UI.browseCard.badgeSize,
    borderRadius: UI.browseCard.badgeRadius,
    backgroundColor: UI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: UI.browseCard.badgeGap,
  },
  epsuBadgeImage: {
    width: UI.browseCard.badgeSize,
    height: UI.browseCard.badgeSize,
    borderRadius: UI.browseCard.badgeRadius,
  },
  epsuBadgePlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  epsuCopy: {
    flex: 1,
  },
  epsuName: {
    fontSize: UI.browseCard.titleSize,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 4,
  },
  epsuMeta: {
    fontSize: UI.browseCard.metaSize,
    color: UI.colors.textMuted,
    lineHeight: 20,
  },
  newPostsBadge: {
    marginLeft: 12,
    backgroundColor: UI.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 9,
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
  refreshHint: {
    fontSize: 13,
    fontWeight: '700',
    color: UI.colors.textSoft,
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
    paddingHorizontal: UI.empty.horizontalPadding,
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
  postImageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  postImage: {
    width: 220,
    height: 220,
    borderRadius: 24,
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
