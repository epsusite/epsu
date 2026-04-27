import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { detectFlaggedKeywords } from './lib/flaggedPostKeywords';
import { fetchEpsuPostQuota } from './lib/api/feed';
import { getSchoolLogoUrl } from './lib/schoolLogo';
import useSubmitButtonAnimation from './lib/useSubmitButtonAnimation';

const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 100;
const BODY_MIN_LENGTH = 10;
const BODY_MAX_LENGTH = 1000;
const POST_DRAFT_KEY = 'post_screen_draft';
const GUIDELINES_URL = 'https://epsu.site/guidelines';
const POST_MASCOT_IMAGE = require('./assets/images/1000133182.png');

function logPostSubmitTiming(label, startedAt) {
  const durationMs = Date.now() - startedAt;
  console.log(`[post-submit] ${label} finished (${durationMs}ms)`);
}

function getCounterText(length, minLength, maxLength) {
  if (length < minLength) {
    return `${length}/${minLength}`;
  }

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
          <Text style={styles.epsuIconText}>{item.code}</Text>
        )}
      </View>
      <View style={styles.epsuTextWrap}>
        <Text style={[styles.epsuName, isSelected && styles.epsuNameSelected]}>{item.name}</Text>
        <Text style={[styles.epsuMeta, isSelected && styles.epsuMetaSelected]}>Post to this Epsu</Text>
      </View>
    </TouchableOpacity>
  );
}

function CheckboxRow({ checked, children, onPress }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onPress}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <View style={styles.checkboxContent}>
        <Text style={styles.checkboxText}>{children}</Text>
      </View>
    </Pressable>
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
}) {
  const insets = useSafeAreaInsets();
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
  const accessibleEpsus = useMemo(() => {
    const membershipByEpsuId = userMemberships.reduce((accumulator, membership) => {
      accumulator[membership.epsuId] = membership;
      return accumulator;
    }, {});

    return epsus.filter((epsu) => {
      const membership = membershipByEpsuId[epsu.id];
      return membership?.status === 'active' && epsu.review_status === 'approved';
    });
  }, [epsus, userMemberships]);
  const filteredEpsus = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const baseEpsus = normalizedQuery
      ? accessibleEpsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery))
      : accessibleEpsus;

    return baseEpsus.filter((epsu) => epsu.id !== selectedEpsuId);
  }, [accessibleEpsus, searchQuery, selectedEpsuId]);
  const selectedEpsu = accessibleEpsus.find((epsu) => epsu.id === selectedEpsuId) ?? null;
  const titleLength = getMeaningfulLength(title);
  const bodyLength = getMeaningfulLength(body);
  const isReplyMode = Boolean(activeReplyToPostId);

  const isTitleReady = titleLength >= TITLE_MIN_LENGTH;
  const isBodyReady = bodyLength >= BODY_MIN_LENGTH;
  const canSubmit = isTitleReady && isBodyReady && !!selectedEpsuId && !isSubmitting;
  const submitAnimationStyle = useSubmitButtonAnimation(canSubmit);
  const shouldHideMascot = keyboardHeight > 0 || isInputFocused;
  const mascotRestingOffset = selectedEpsuId ? 128 : 0;
  const quotaCountdown = formatCountdown(postQuota?.resetsAt);

  useEffect(() => {
    let isActive = true;

    const restoreDraft = async () => {
      try {
        const rawDraft = await AsyncStorage.getItem(POST_DRAFT_KEY);
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
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      POST_DRAFT_KEY,
      JSON.stringify({
        title,
        body,
        selectedEpsuId,
        searchQuery,
        activeReplyToPostId,
        activeReplyTitle,
      })
    ).catch(() => {});
  }, [activeReplyTitle, activeReplyToPostId, body, searchQuery, selectedEpsuId, title]);

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
        toValue: shouldHideMascot ? 240 : mascotRestingOffset,
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
  }, [mascotOffset, mascotOpacity, mascotRestingOffset, shouldHideMascot]);

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

    await AsyncStorage.removeItem(POST_DRAFT_KEY).catch(() => {});
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
          />
        </View>

        {selectedEpsuId && postQuota ? (
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
            bottom: insets.bottom + 72,
            opacity: mascotOpacity,
            transform: [
              { translateY: mascotOffset },
              { translateX: selectedEpsuId ? 6 : 0 },
            ],
          },
        ]}
      >
          <View style={styles.mascotBubble}>
            <Text style={styles.mascotBubbleText}>I&apos;m watching you! :3</Text>
            <View style={styles.mascotBubbleTail} />
          </View>
          <Image
            source={POST_MASCOT_IMAGE}
            style={styles.mascotImage}
            contentFit="contain"
            contentPosition="right bottom"
          />
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
            <CheckboxRow
              checked={acceptedGuidelinesLocally}
              onPress={() => setAcceptedGuidelinesLocally((current) => !current)}
            >
              I have read Epsu&apos;s{' '}
              <Text style={styles.inlineLink} onPress={handleOpenGuidelines}>
                Community Guidelines
              </Text>
            </CheckboxRow>
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 4,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#f0b7ca',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: '#e52b50',
    borderColor: '#e52b50',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  checkboxText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#20131a',
  },
  checkboxContent: {
    flex: 1,
  },
  inlineLink: {
    color: '#e52b50',
    fontWeight: '800',
  },
  guidelinesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(32, 19, 26, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  guidelinesModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f2d8e0',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
  },
  guidelinesModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#e52b50',
  },
  guidelinesText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6d4f5c',
  },
  guidelinesModalActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 6,
  },
  buttonSlot: {
    flex: 1,
  },
  guidelinesModalButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#e52b50',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidelinesModalButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#efbcc9',
  },
  guidelinesModalButtonDisabled: {
    backgroundColor: '#efbcc9',
  },
  guidelinesModalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  guidelinesModalButtonSecondaryText: {
    color: '#e52b50',
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
  epsuIconText: {
    color: '#e52b50',
    fontSize: 15,
    fontWeight: '900',
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
    right: -6,
    width: 206,
    height: 224,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  mascotBubble: {
    position: 'absolute',
    top: 28,
    left: -66,
    maxWidth: 150,
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
    right: 12,
    bottom: 10,
    width: 16,
    height: 16,
    backgroundColor: '#ffffff',
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#20131a',
    transform: [{ rotate: '-18deg' }],
  },
  mascotImage: {
    width: 190,
    height: 208,
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

