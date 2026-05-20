import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import {
  Animated,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AppCheckboxRow from './components/AppCheckboxRow';
import { showAppDialog } from './components/AppDialog';
import { detectFlaggedKeywords } from './lib/flaggedPostKeywords';
import { fetchEpsuPostQuota } from './lib/api/feed';
import { getSchoolLogoUrl } from './lib/schoolLogo';
import { UI } from './lib/uiTheme';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const TITLE_MIN_LENGTH = 2;
const TITLE_MAX_LENGTH = 100;
const BODY_MIN_LENGTH = 2;
const BODY_MAX_LENGTH = 1000;
const POST_DRAFT_KEY_PREFIX = 'post_screen_draft_v2';
const GUIDELINES_URL = 'https://epsu.site/guidelines';
const POST_MASCOT_IMAGE = require('./assets/images/1000133182.png');
const MASCOT_HEAD_ANCHOR_X_RATIO = 0.36;
const MASCOT_HEAD_ANCHOR_Y_RATIO = 0.24;

function getPostDraftKey({ currentUserId, isGuestMode }) {
  if (isGuestMode) {
    return `${POST_DRAFT_KEY_PREFIX}:guest`;
  }

  if (currentUserId) {
    return `${POST_DRAFT_KEY_PREFIX}:${currentUserId}`;
  }

  return `${POST_DRAFT_KEY_PREFIX}:anonymous`;
}

function logPostSubmitTiming(label, startedAt) {
  const durationMs = Date.now() - startedAt;
  console.log(`[post-submit] ${label} finished (${durationMs}ms)`);
}

function getCounterText(length, minLength, maxLength) {
  return `${length}/${maxLength}`;
}

function getMeaningfulLength(value) {
  return value.trim().length;
}

function formatReleaseTime(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'the next hourly batch';
  }

  return parsed.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}

function formatCountdown(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return '--:--:--';
  }

  const diffMs = Math.max(0, parsed.getTime() - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function EpsuPickerItem({ item, isSelected, onPress }) {
  const logoUrl = item.logo_path ? getSchoolLogoUrl(item.logo_path) : null;

  return (
    <TouchableOpacity
      style={[styles.epsuItem, isSelected && styles.epsuItemSelected]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.85}
    >
      <View style={[styles.epsuIcon, isSelected && styles.epsuIconSelected]}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.epsuIconImage} contentFit="cover" />
        ) : (
          <View style={[styles.epsuIconPlaceholder, isSelected && styles.epsuIconPlaceholderSelected]} />
        )}
      </View>
      <View style={styles.epsuTextWrap}>
        <Text style={[styles.epsuName, isSelected && styles.epsuNameSelected]}>{item.name}</Text>
        <Text style={[styles.epsuMeta, isSelected && styles.epsuMetaSelected]}>Post to this Epsu</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PostScreen({
  navigation,
  route,
  onSubmitPost,
  onAcceptCommunityGuidelines,
  hasAcceptedCommunityGuidelines,
  epsus,
  userMemberships,
  currentUserId,
  isGuestMode = false,
  onGuestLockedAction,
  currentCountryCode,
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const handledReplyNonce = useRef(null);
  const mascotOffset = useRef(new Animated.Value(0)).current;
  const mascotOpacity = useRef(new Animated.Value(1)).current;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedEpsuId, setSelectedEpsuId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [acceptedGuidelinesLocally, setAcceptedGuidelinesLocally] = useState(false);
  const [isGuidelinesModalVisible, setIsGuidelinesModalVisible] = useState(false);
  const [activeReplyToPostId, setActiveReplyToPostId] = useState(null);
  const [activeReplyTitle, setActiveReplyTitle] = useState('');
  const [pendingSubmitOptions, setPendingSubmitOptions] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postQuota, setPostQuota] = useState(null);
  const [mascotBubbleLayout, setMascotBubbleLayout] = useState({ width: 140, height: 42 });
  const accessibleEpsus = useMemo(() => {
    if (isGuestMode) {
      return epsus.filter(
        (epsu) => epsu.review_status === 'approved' && epsu.country_code === currentCountryCode
      );
    }

    const membershipByEpsuId = userMemberships.reduce((accumulator, membership) => {
      accumulator[membership.epsuId] = membership;
      return accumulator;
    }, {});

    return epsus.filter((epsu) => {
      const membership = membershipByEpsuId[epsu.id];
      return ['active', 'muted'].includes(membership?.status) && epsu.review_status === 'approved';
    });
  }, [currentCountryCode, epsus, isGuestMode, userMemberships]);
  const filteredEpsus = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const baseEpsus = normalizedQuery
      ? accessibleEpsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery))
      : accessibleEpsus;

    return baseEpsus.filter((epsu) => epsu.id !== selectedEpsuId);
  }, [accessibleEpsus, searchQuery, selectedEpsuId]);
  const selectedEpsu = accessibleEpsus.find((epsu) => epsu.id === selectedEpsuId) ?? null;
  const hasNoJoinedEpsus = !isGuestMode && accessibleEpsus.length === 0;
  const selectedMembership = userMemberships.find((membership) => membership.epsuId === selectedEpsuId) ?? null;
  const titleLength = getMeaningfulLength(title);
  const bodyLength = getMeaningfulLength(body);
  const isReplyMode = Boolean(activeReplyToPostId);
  const isMutedSubmitBlock = selectedMembership?.status === 'muted';

  const isTitleReady = titleLength >= TITLE_MIN_LENGTH;
  const isBodyReady = bodyLength >= BODY_MIN_LENGTH;
  const hasValidSelectedEpsu = Boolean(selectedEpsu);
  const canSubmit = isTitleReady && isBodyReady && hasValidSelectedEpsu && !isSubmitting && !isMutedSubmitBlock;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);
  const shouldHideMascot = keyboardHeight > 0 || isInputFocused;
  const quotaCountdown = formatCountdown(postQuota?.resetsAt);
  const isCompactMascot = windowWidth < 380 || fontScale > 1.1;
  const mascotImageWidth = Math.round(
    Math.max(104, Math.min(isCompactMascot ? 132 : 168, windowWidth * (isCompactMascot ? 0.3 : 0.36)))
  );
  const mascotImageHeight = Math.round(mascotImageWidth * (1755 / 1080));
  const mascotBubbleMaxWidth = Math.round(
    Math.max(112, Math.min(isCompactMascot ? 142 : 176, windowWidth * (isCompactMascot ? 0.32 : 0.38)))
  );
  const mascotGap = isCompactMascot ? 4 : 8;
  const mascotRightOffset = Math.max(10, Math.min(22, Math.round(windowWidth * 0.045)));
  const mascotBottomOffset = insets.bottom + Math.max(68, Math.min(96, Math.round(windowHeight * 0.1)));
  const mascotRestingOffset = hasValidSelectedEpsu ? Math.round(mascotImageHeight * 0.72) : 0;
  const mascotHiddenOffset = Math.round(mascotImageHeight + Math.max(44, Math.min(88, windowHeight * 0.08)));
  const mascotBubbleMarginBottom = Math.max(12, Math.round(mascotImageHeight * 0.1));
  const mascotHeadAnchor = useMemo(
    () => ({
      x: Math.round(mascotImageWidth * MASCOT_HEAD_ANCHOR_X_RATIO),
      y: Math.round(mascotImageHeight * MASCOT_HEAD_ANCHOR_Y_RATIO),
    }),
    [mascotImageHeight, mascotImageWidth]
  );
  const mascotTail = useMemo(() => {
    const bubbleWidth = mascotBubbleLayout.width || 140;
    const bubbleHeight = mascotBubbleLayout.height || 42;
    const bubbleTop = mascotImageHeight - mascotBubbleMarginBottom - bubbleHeight;
    const startX = bubbleWidth - 6;
    const startY = bubbleTop + bubbleHeight * 0.64;
    const targetX = bubbleWidth + mascotGap + mascotHeadAnchor.x - 6;
    const targetY = mascotHeadAnchor.y;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const distance = Math.max(18, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
    const angleDeg = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
    const length = Math.max(18, Math.round(distance * 0.62));
    const thickness = Math.max(18, Math.round(mascotImageWidth * 0.12));
    const endX = startX + Math.cos((angleDeg * Math.PI) / 180) * length;
    const endY = startY + Math.sin((angleDeg * Math.PI) / 180) * length;

    return {
      width: length,
      height: thickness,
      left: (startX + endX) / 2 - length / 2,
      top: (startY + endY) / 2 - thickness / 2,
      angleDeg,
    };
  }, [mascotBubbleLayout.height, mascotBubbleLayout.width, mascotBubbleMarginBottom, mascotGap, mascotHeadAnchor.x, mascotHeadAnchor.y, mascotImageHeight, mascotImageWidth]);
  const postDraftKey = useMemo(
    () => getPostDraftKey({ currentUserId, isGuestMode }),
    [currentUserId, isGuestMode]
  );

  useEffect(() => {
    let isActive = true;

    const restoreDraft = async () => {
      try {
        const rawDraft = await AsyncStorage.getItem(postDraftKey);
        if (!rawDraft || !isActive) {
          return;
        }

        const parsedDraft = JSON.parse(rawDraft);
        setTitle(parsedDraft.title ?? '');
        setBody(parsedDraft.body ?? '');
        setSelectedEpsuId(parsedDraft.selectedEpsuId ?? null);
        setSearchQuery(parsedDraft.searchQuery ?? '');
        setActiveReplyToPostId(parsedDraft.activeReplyToPostId ?? null);
        setActiveReplyTitle(parsedDraft.activeReplyTitle ?? '');
      } catch {
        return;
      }
    };

    restoreDraft();

    return () => {
      isActive = false;
    };
  }, [postDraftKey]);

  useEffect(() => {
    AsyncStorage.setItem(
      postDraftKey,
      JSON.stringify({
        title,
        body,
        selectedEpsuId,
        searchQuery,
        activeReplyToPostId,
        activeReplyTitle,
      })
    ).catch(() => {});
  }, [activeReplyTitle, activeReplyToPostId, body, postDraftKey, searchQuery, selectedEpsuId, title]);

  useEffect(() => {
    const handleKeyboardShow = (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    };

    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      setIsInputFocused(false);
    };

    const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(mascotOffset, {
        toValue: shouldHideMascot ? mascotHiddenOffset : mascotRestingOffset,
        tension: 54,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(mascotOpacity, {
        toValue: shouldHideMascot ? 0 : 1,
        duration: shouldHideMascot ? 140 : 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mascotHiddenOffset, mascotOffset, mascotOpacity, mascotRestingOffset, shouldHideMascot]);

  useEffect(() => {
    if (!selectedEpsuId) {
      return;
    }

    const stillAccessible = accessibleEpsus.some((epsu) => epsu.id === selectedEpsuId);
    if (!stillAccessible) {
      setSelectedEpsuId(null);
      setPostQuota(null);
    }
  }, [accessibleEpsus, selectedEpsuId]);

  useEffect(() => {
    if (!selectedEpsuId) {
      setPostQuota(null);
      return;
    }

    let isActive = true;

    const loadQuota = async () => {
      try {
        const nextQuota = await fetchEpsuPostQuota(selectedEpsuId);
        if (isActive) {
          setPostQuota(nextQuota);
        }
      } catch {
        if (isActive) {
          setPostQuota(null);
        }
      }
    };

    void loadQuota();

    return () => {
      isActive = false;
    };
  }, [selectedEpsuId]);

  useEffect(() => {
    if (!postQuota?.resetsAt) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setPostQuota((current) => (current ? { ...current } : current));
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [postQuota?.resetsAt]);

  useEffect(() => {
    const replyNonce = route?.params?.replyNonce;
    const replyTitle = route?.params?.replyTitle;
    const replyEpsuId = route?.params?.epsuId;

    if (!replyNonce || handledReplyNonce.current === replyNonce) {
      return;
    }

    handledReplyNonce.current = replyNonce;
    setTitle(replyTitle ?? '');
    setActiveReplyTitle(replyTitle ?? '');
    setBody('');
    setSearchQuery('');
    setActiveReplyToPostId(route?.params?.replyToPostId ?? null);
    if (replyEpsuId) {
      setSelectedEpsuId(replyEpsuId);
    }
  }, [route?.params]);

  const handleTitleChange = (value) => {
    if (isReplyMode) {
      return;
    }

    if (value.length <= TITLE_MAX_LENGTH) {
      setTitle(value);
    }
  };

  const handleBodyChange = (value) => {
    if (value.length <= BODY_MAX_LENGTH) {
      setBody(value);
    }
  };

  const handleInputFocus = () => {
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
  };

  const performSubmit = async (submitOptions = {}) => {
    const startedAt = Date.now();
    setIsSubmitting(true);
    const submittedEpsuId = selectedEpsuId;
    const submittedTitle = title.trim();
    const submittedBody = body.trim();
    const submittedReplyToPostId = activeReplyToPostId;
    const submittedReplyTitle = activeReplyTitle;

    setTitle('');
    setBody('');
    setSelectedEpsuId(null);
    setSearchQuery('');
    setActiveReplyToPostId(null);
    setActiveReplyTitle('');
    setPendingSubmitOptions(null);

    try {
      const result = await onSubmitPost({
        epsuId: submittedEpsuId,
        title: submittedTitle,
        body: submittedBody,
        replyToPostId: submittedReplyToPostId,
        flaggedKeywords: submitOptions.flaggedKeywords ?? [],
      });
      logPostSubmitTiming('createPost', startedAt);

      showAppDialog(
        'Post queued',
        `Your post is queued for ${formatReleaseTime(result?.releaseAt)}.`
      );
      if (submittedEpsuId) {
        const nextQuota = await fetchEpsuPostQuota(submittedEpsuId).catch(() => null);
        setPostQuota(nextQuota);
      }
    } catch (error) {
      void submittedTitle;
      void submittedBody;
      void submittedEpsuId;
      void submittedReplyToPostId;
      void submittedReplyTitle;
      setIsSubmitting(false);
      console.warn('[post-submit] createPost failed', error?.message ?? error);
      logPostSubmitTiming('createPost', startedAt);
      const message =
        error?.message?.trim() ||
        error?.details?.trim() ||
        error?.hint?.trim() ||
        'Could not save this post';
      showAppDialog('Post', message);
      return;
    }

    await AsyncStorage.removeItem(postDraftKey).catch(() => {});
    navigation.setParams({
      replyNonce: undefined,
      replyTitle: undefined,
      replyToPostId: undefined,
      epsuId: undefined,
    });
    navigation.navigate('Home', {
      screen: 'HomeEpsu',
      params: { epsuId: submittedEpsuId },
    });
    setIsSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) {
      console.warn(
        '[post-submit] handleSubmit blocked',
        `canSubmit=${canSubmit} isSubmitting=${isSubmitting} epsuId=${selectedEpsuId ?? 'none'} titleLength=${titleLength} bodyLength=${bodyLength}`
      );
      return;
    }

    if (isGuestMode) {
      onGuestLockedAction?.();
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const flaggedKeywords = detectFlaggedKeywords(trimmedTitle, trimmedBody);
    console.log(
      '[post-submit] handleSubmit start',
      `epsuId=${selectedEpsuId ?? 'none'} titleLength=${trimmedTitle.length} bodyLength=${trimmedBody.length} flaggedKeywords=${flaggedKeywords.join(',') || 'none'}`
    );
    setPendingSubmitOptions({
      flaggedKeywords,
    });

    if (!hasAcceptedCommunityGuidelines) {
      setIsGuidelinesModalVisible(true);
      return;
    }

    await performSubmit({
      flaggedKeywords,
    });
  };

  const handleSelectEpsu = (epsuId) => {
    if (isReplyMode) {
      return;
    }

    setSelectedEpsuId(epsuId);
    setSearchQuery('');
  };

  const handleClearSelectedEpsu = () => {
    if (isReplyMode) {
      return;
    }

    setSelectedEpsuId(null);
  };

  const handleCancelReply = () => {
    setActiveReplyToPostId(null);
    setActiveReplyTitle('');
    setTitle('');
    setBody('');
    setSelectedEpsuId(null);
    setSearchQuery('');
    navigation.setParams({
      replyNonce: undefined,
      replyTitle: undefined,
      replyToPostId: undefined,
      epsuId: undefined,
    });
  };

  const handleOpenGuidelines = async () => {
    await WebBrowser.openBrowserAsync(GUIDELINES_URL);
  };

  const handleAcceptGuidelines = async () => {
    if (!acceptedGuidelinesLocally) {
      return;
    }

    const result = await onAcceptCommunityGuidelines();
    if (!result?.ok) {
      showAppDialog('Community Guidelines', result?.message ?? 'Could not save your agreement');
      return;
    }
    setIsGuidelinesModalVisible(false);
    await performSubmit(pendingSubmitOptions ?? {});
    setPendingSubmitOptions(null);
  };

  if (hasNoJoinedEpsus) {
    return (
      <View style={styles.emptyScreen}>
        <ImageBackground
          source={require('./assets/images/1774535505571.jpg')}
          style={styles.emptyBg}
          resizeMode="cover"
        >
          <StatusBar barStyle="light-content" />
          <View
            style={[
              styles.emptyOverlay,
              { paddingBottom: insets.bottom + UI.auth.screenPaddingBottom + 40 },
            ]}
          >
            <View style={styles.emptyInner}>
              <Text style={styles.emptyTitle}>Become a member</Text>
              <View style={styles.emptyTextWrap}>
                <Text style={styles.emptyText}>
                  You currently aren&apos;t a member of any Epsu yet. Join one now in the Home menu to make your first post here
                </Text>
              </View>
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 300 },
        ]}
        keyboardShouldPersistTaps="always"
      >
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Write a post</Text>
          <Text style={styles.sectionTitle}>Which Epsu to post?</Text>
          {isMutedSubmitBlock ? (
            <View style={styles.mutedNoticeCard}>
              <Text style={styles.mutedNoticeTitle}>You are muted here for 24 hours</Text>
              <Text style={styles.mutedNoticeText}>You can still react and use your role tools, but you cannot submit posts in this Epsu right now</Text>
            </View>
          ) : null}
          <TextInput
            style={styles.searchInput}
            placeholder={
              isReplyMode
                ? 'Cancel reply to switch Epsu'
                : selectedEpsuId
                  ? 'Search to switch Epsu'
                  : 'Search your Epsus'
            }
            placeholderTextColor="#8d6676"
            value={searchQuery}
            onChangeText={setSearchQuery}
            editable={!isReplyMode}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {selectedEpsu ? (
            <View style={styles.selectedWrap}>
              <Text style={styles.selectedLabel}>Selected Epsu</Text>
              <EpsuPickerItem
                item={selectedEpsu}
                isSelected
                onPress={handleClearSelectedEpsu}
              />
            </View>
          ) : null}

          {searchQuery.trim() && filteredEpsus.length > 0 ? (
            <View style={styles.epsuList}>
              {filteredEpsus.map((epsu) => (
                <EpsuPickerItem
                  key={epsu.id}
                  item={epsu}
                  isSelected={epsu.id === selectedEpsuId}
                  onPress={handleSelectEpsu}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.searchHint}>
              {searchQuery.trim()
                ? 'No matching Epsus'
                : selectedEpsuId
                  ? ''
                  : 'Search to choose an Epsu'}
            </Text>
          )}
        </View>

        <View style={styles.fieldBlock}>
          {isReplyMode ? (
            <View style={styles.replyTitleRow}>
              <Text style={styles.replyTitleText}>{activeReplyTitle || title}</Text>
              <TouchableOpacity onPress={handleCancelReply} activeOpacity={0.85}>
                <Text style={styles.cancelReplyText}>CANCEL REPLY</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.counter}>
                {getCounterText(titleLength, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH)}
              </Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Title"
                placeholderTextColor="#8d6676"
                value={title}
                onChangeText={handleTitleChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </>
          )}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.counter}>
            {getCounterText(bodyLength, BODY_MIN_LENGTH, BODY_MAX_LENGTH)}
          </Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="Write your thoughts here (be respectful and kind! 🌸)"
            placeholderTextColor="#8d6676"
            value={body}
            onChangeText={handleBodyChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            multiline
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>

        {hasValidSelectedEpsu && postQuota ? (
          <Text style={styles.quotaText}>
            {postQuota.postsLeft} posts left, {postQuota.repliesLeft} replies left until {quotaCountdown}
          </Text>
        ) : null}
      </ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.mascotWrap,
          {
            right: mascotRightOffset,
            bottom: mascotBottomOffset,
            opacity: mascotOpacity,
            transform: [{ translateY: mascotOffset }],
          },
        ]}
      >
        <View
          style={[
            styles.mascotRow,
            {
              gap: mascotGap,
            },
          ]}
        >
            <View
              style={[
                styles.mascotBubble,
              {
                maxWidth: mascotBubbleMaxWidth,
                marginBottom: mascotBubbleMarginBottom,
              },
            ]}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setMascotBubbleLayout((current) =>
                current.width === width && current.height === height
                  ? current
                  : { width, height }
              );
            }}
          >
            <Text allowFontScaling={false} style={styles.mascotBubbleText}>I&apos;m watching you! :3</Text>
          </View>
          <Svg
            pointerEvents="none"
            style={[
              styles.mascotBubbleTail,
              {
                width: mascotTail.width,
                height: mascotTail.height,
                left: mascotTail.left,
                top: mascotTail.top,
                transform: [{ rotate: `${mascotTail.angleDeg}deg` }],
              },
            ]}
            viewBox={`0 0 ${mascotTail.width} ${mascotTail.height}`}
          >
            <Path
              d={`M 0 ${mascotTail.height * 0.22}
                  Q ${mascotTail.width * 0.22} 0 ${mascotTail.width * 0.56} ${mascotTail.height * 0.18}
                  Q ${mascotTail.width * 0.84} ${mascotTail.height * 0.3} ${mascotTail.width} ${mascotTail.height * 0.5}
                  Q ${mascotTail.width * 0.84} ${mascotTail.height * 0.7} ${mascotTail.width * 0.56} ${mascotTail.height * 0.82}
                  Q ${mascotTail.width * 0.22} ${mascotTail.height} 0 ${mascotTail.height * 0.78} Z`}
              fill="#ffffff"
              stroke="#20131a"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </Svg>
          <Image
            source={POST_MASCOT_IMAGE}
            style={[
              styles.mascotImage,
              {
                width: mascotImageWidth,
                height: mascotImageHeight,
              },
            ]}
            contentFit="contain"
            contentPosition="right bottom"
          />
        </View>
      </Animated.View>

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
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={() => {
            Keyboard.dismiss();
            void handleSubmit();
          }}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          <Text style={styles.submitText}>{isSubmitting ? 'Submitting' : 'Submit'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={isGuidelinesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsGuidelinesModalVisible(false)}
      >
        <View style={styles.guidelinesModalOverlay}>
          <View style={styles.guidelinesModalCard}>
            <Text style={styles.guidelinesModalTitle}>Community Guidelines</Text>
            <Text style={styles.guidelinesText}>
              Before your first post, confirm that you have read Epsu&apos;s Community Guidelines
            </Text>
            <AppCheckboxRow
              checked={acceptedGuidelinesLocally}
              onPress={() => setAcceptedGuidelinesLocally((current) => !current)}
            >
              I have read Epsu&apos;s{' '}
              <Text style={styles.inlineLink} onPress={handleOpenGuidelines}>
                Community Guidelines
              </Text>
            </AppCheckboxRow>
            <View style={styles.guidelinesModalActions}>
              <Pressable
                style={styles.buttonSlot}
                onPress={() => setIsGuidelinesModalVisible(false)}
              >
                <View style={[styles.guidelinesModalButton, styles.guidelinesModalButtonSecondary]}>
                  <Text style={[styles.guidelinesModalButtonText, styles.guidelinesModalButtonSecondaryText]}>
                    Cancel
                  </Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.buttonSlot}
                onPress={handleAcceptGuidelines}
                disabled={!acceptedGuidelinesLocally}
              >
                <View
                  style={[
                    styles.guidelinesModalButton,
                    !acceptedGuidelinesLocally && styles.guidelinesModalButtonDisabled,
                  ]}
                >
                  <Text style={styles.guidelinesModalButtonText}>Submit</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  emptyScreen: {
    flex: 1,
    backgroundColor: '#e52b50',
  },
  emptyBg: {
    flex: 1,
  },
  emptyOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emptyInner: {
    marginHorizontal: UI.auth.horizontalPadding,
  },
  emptyTitle: {
    fontSize: UI.auth.titleSize,
    fontWeight: '900',
    color: '#fff',
    marginBottom: UI.auth.titleSpacing,
    letterSpacing: -0.5,
  },
  emptyTextWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#e52b50',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 340,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 18,
    flexGrow: 1,
    paddingBottom: 250,
    gap: 18,
  },
  section: {
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
  },
  epsuList: {
    gap: 10,
  },
  selectedWrap: {
    gap: 8,
  },
  inlineLink: {
    color: '#e52b50',
    fontWeight: '800',
  },
  guidelinesModalOverlay: {
    flex: 1,
    backgroundColor: UI.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.modal.overlayPadding,
  },
  guidelinesModalCard: {
    width: '100%',
    maxWidth: UI.modal.maxWidth,
    borderRadius: UI.radius.modal,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: UI.spacing.modal,
    paddingTop: UI.spacing.modal,
    paddingBottom: UI.spacing.card,
    gap: 14,
  },
  guidelinesModalTitle: {
    fontSize: UI.modal.titleSize,
    fontWeight: '900',
    color: UI.colors.primary,
  },
  guidelinesText: {
    fontSize: UI.modal.bodySize,
    lineHeight: UI.modal.bodyLineHeight,
    color: UI.colors.textMuted,
  },
  guidelinesModalActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: UI.spacing.gap - 2,
    marginTop: 6,
  },
  buttonSlot: {
    flex: 1,
  },
  guidelinesModalButton: {
    width: '100%',
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidelinesModalButtonSecondary: {
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  guidelinesModalButtonDisabled: {
    backgroundColor: UI.colors.border,
  },
  guidelinesModalButtonText: {
    color: UI.colors.surface,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  guidelinesModalButtonSecondaryText: {
    color: UI.colors.primary,
  },
  selectedLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  searchInput: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#24171d',
  },
  mutedNoticeCard: {
    backgroundColor: '#fff1f4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f2bcc8',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  mutedNoticeTitle: {
    color: '#20131a',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  mutedNoticeText: {
    color: '#7f6170',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  searchHint: {
    fontSize: 14,
    color: '#8d6676',
  },
  epsuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  epsuItemSelected: {
    backgroundColor: '#e52b50',
    borderColor: '#e52b50',
  },
  epsuIcon: {
    width: 46,
    height: 46,
    borderRadius: 24,
    backgroundColor: '#f7dbe5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  epsuIconImage: {
    width: 46,
    height: 46,
    borderRadius: 24,
  },
  epsuIconSelected: {
    backgroundColor: '#fff',
  },
  epsuIconPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#e52b50',
  },
  epsuIconPlaceholderSelected: {
    backgroundColor: '#e52b50',
  },
  epsuTextWrap: {
    flex: 1,
  },
  epsuName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 3,
  },
  epsuNameSelected: {
    color: '#fff',
  },
  epsuMeta: {
    fontSize: 13,
    color: '#7f6170',
  },
  epsuMetaSelected: {
    color: 'rgba(255,255,255,0.82)',
  },
  fieldBlock: {
    gap: 8,
  },
  replyTitleRow: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  replyTitleText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#24171d',
  },
  cancelReplyText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#e52b50',
    letterSpacing: 0.5,
  },
  counter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
  },
  titleInput: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#24171d',
    fontWeight: '600',
  },
  bodyInput: {
    minHeight: 220,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 24,
    color: '#24171d',
  },
  quotaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8a5e70',
    marginTop: -2,
  },
  submitWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
    zIndex: 3,
  },
  mascotWrap: {
    position: 'absolute',
    zIndex: 1,
  },
  mascotRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  mascotBubble: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#20131a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#20131a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 3,
  },
  mascotBubbleText: {
    color: '#20131a',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  mascotBubbleTail: {
    position: 'absolute',
    zIndex: 2,
  },
  mascotImage: {
    zIndex: 1,
  },
  submitButton: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#efbcc9',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});


