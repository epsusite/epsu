import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { normalizeCountryCode } from './countryCode';
import {
  fetchEpsuActivePostCounts,
  fetchEpsuMemberships,
  fetchEpsuPopulationCounts,
  fetchModeratedEpsuIds,
  fetchHostedEpsuIds,
} from './api/epsus';
import { fetchFlaggedQueuedPostsForEpsu, fetchOpenReportsForEpsu } from './api/moderation';
import { purgeExpiredPersonalData } from './api/account';
import {
  fetchBlockedAuthorIds,
  deleteExpiredPosts,
  fetchPosts,
  fetchReportedPostIds,
  fetchReviewedPostIdsByEpsu,
  releaseQueuedPosts,
} from './api/feed';
import {
  ensureRegionalMemberships,
  fetchEpsusWithCountry,
  fetchHiddenEpsuIds,
  fetchVisibleMemberships,
} from './schoolApi';
import { deriveReplyTargetPostIds } from './appStateTransforms';

const BOOTSTRAP_CACHE_KEY = 'epsu_bootstrap_cache_v1';
const BOOTSTRAP_STEP_TIMEOUT_MS = 4000;
const INITIAL_AUTH_GRACE_MS = 4000;

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function safeBootstrapValue(label, load, fallbackValue, timeoutMs = BOOTSTRAP_STEP_TIMEOUT_MS) {
  try {
    return await withTimeout(Promise.resolve().then(load), timeoutMs, label);
  } catch (error) {
    void error;
    return fallbackValue;
  }
}

function logBootstrapTiming(label, startedAt) {
  void label;
  void startedAt;
}

function logBootstrapStep(message) {
  void message;
}

async function readBootstrapCache(userId) {
  try {
    const rawValue = await AsyncStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    if (parsedValue?.userId !== userId || !parsedValue?.data) {
      return null;
    }

    return parsedValue.data;
  } catch {
    return null;
  }
}

async function writeBootstrapCache(userId, data) {
  try {
    await AsyncStorage.setItem(
      BOOTSTRAP_CACHE_KEY,
      JSON.stringify({
        userId,
        savedAt: new Date().toISOString(),
        data,
      })
    );
  } catch {
    // ignore cache write failures
  }
}

function applyBootstrapData({
  data,
  setEpsus,
  setPosts,
  setReviewedPostIdsByEpsu,
  setReportedPostIds,
  setRepliedToPostIds,
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
  setActivePostCountByEpsu,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
}) {
  setEpsus(data.epsus ?? []);
  setPosts(data.posts ?? []);
  setReviewedPostIdsByEpsu(data.reviewedPostIdsByEpsu ?? {});
  setReportedPostIds(data.reportedPostIds ?? []);
  setRepliedToPostIds(data.repliedToPostIds ?? []);
  setModeratedEpsuIds(data.moderatedEpsuIds ?? []);
  setHostedEpsuIds(data.hostedEpsuIds ?? []);
  setMemberships(data.memberships ?? []);
  setUserMemberships(data.userMemberships ?? []);
  setHiddenEpsuIds(data.hiddenEpsuIds ?? []);
  setReports(data.reports ?? []);
  setEpsuPopulationById(data.epsuPopulationById ?? {});
  setActivePostCountByEpsu(data.activePostCountByEpsu ?? {});
  setQueuedFlaggedPosts(data.queuedFlaggedPosts ?? []);
  setBlockedAuthorIds(data.blockedAuthorIds ?? []);
}

export function resetSessionState({
  setCurrentUsername,
  setCurrentIsAdmin,
  setCurrentUserId,
  setCurrentEmail,
  setCurrentCountryCode,
  setCurrentHasAcceptedCommunityGuidelines,
  setNotificationsEnabled,
  setEpsus,
  setPosts,
  setReviewedPostIdsByEpsu,
  setReportedPostIds,
  setRepliedToPostIds,
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
  setActivePostCountByEpsu,
  setUnreadAppNotifications,
  setIsShowingAppNotification,
  setIsAuthenticated,
  setIsBootstrapping,
  setBootMessage,
  setHasHydratedAppData,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
}) {
  setCurrentUsername(null);
  setCurrentIsAdmin(false);
  setCurrentUserId(null);
  setCurrentEmail(null);
  setCurrentCountryCode(null);
  setCurrentHasAcceptedCommunityGuidelines(false);
  setNotificationsEnabled(false);
  setEpsus([]);
  setPosts([]);
  setReviewedPostIdsByEpsu({});
  setReportedPostIds([]);
  setRepliedToPostIds([]);
  setModeratedEpsuIds([]);
  setHostedEpsuIds([]);
  setMemberships([]);
  setUserMemberships([]);
  setHiddenEpsuIds([]);
  setReports([]);
  setEpsuPopulationById({});
  setActivePostCountByEpsu({});
  setQueuedFlaggedPosts([]);
  setBlockedAuthorIds([]);
  setUnreadAppNotifications([]);
  setIsShowingAppNotification(false);
  setIsAuthenticated(false);
  setIsBootstrapping(false);
  setBootMessage('');
  setHasHydratedAppData(false);
}

export function useAppBootstrap({
  supabase,
  isGuestMode,
  isOnline,
  setIsReady,
  setIsAuthenticated,
  setCurrentUserId,
  setCurrentUsername,
  setCurrentIsAdmin,
  setCurrentEmail,
  setCurrentCountryCode,
  setCurrentHasAcceptedCommunityGuidelines,
  setNotificationsEnabled,
  setCurrentPasswordLength,
  setEpsus,
  setPosts,
  setReviewedPostIdsByEpsu,
  setReportedPostIds,
  setRepliedToPostIds,
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
  setActivePostCountByEpsu,
  setUnreadAppNotifications,
  setIsShowingAppNotification,
  setIsBootstrapping,
  setBootMessage,
  setHasHydratedAppData,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
  currentEmail,
  authRefreshNonce = 0,
}) {
  useEffect(() => {
    if (isGuestMode) {
      setIsReady(true);
      return undefined;
    }

    if (!isOnline) {
      setIsReady(true);
      return undefined;
    }

    let isActive = true;
    let initialAuthResolved = false;
    let initialAuthFallbackTimeoutId = null;

    const clearInitialAuthFallback = () => {
      if (initialAuthFallbackTimeoutId) {
        clearTimeout(initialAuthFallbackTimeoutId);
        initialAuthFallbackTimeoutId = null;
      }
    };

    const resolveSignedOutState = () => {
      logBootstrapStep('resolveSignedOutState');
      resetSessionState({
        setCurrentUsername,
        setCurrentIsAdmin,
        setCurrentUserId,
        setCurrentEmail,
        setCurrentCountryCode,
        setCurrentHasAcceptedCommunityGuidelines,
        setNotificationsEnabled,
        setEpsus,
        setPosts,
        setReviewedPostIdsByEpsu,
        setReportedPostIds,
        setRepliedToPostIds,
        setModeratedEpsuIds,
        setHostedEpsuIds,
        setMemberships,
        setUserMemberships,
        setHiddenEpsuIds,
        setReports,
        setEpsuPopulationById,
        setActivePostCountByEpsu,
        setUnreadAppNotifications,
        setIsShowingAppNotification,
        setIsAuthenticated,
        setIsBootstrapping,
        setBootMessage,
        setHasHydratedAppData,
        setQueuedFlaggedPosts,
        setBlockedAuthorIds,
      });
      setIsReady(true);
    };

    const scheduleSignedOutFallback = () => {
      clearInitialAuthFallback();
      logBootstrapStep(`scheduleSignedOutFallback ${INITIAL_AUTH_GRACE_MS}ms`);
      initialAuthFallbackTimeoutId = setTimeout(() => {
        if (!isActive || initialAuthResolved) {
          return;
        }

        initialAuthResolved = true;
        logBootstrapStep('signedOutFallback fired');
        resolveSignedOutState();
      }, INITIAL_AUTH_GRACE_MS);
    };

    const hydrateUser = async (user) => {
      if (!user || !isActive) {
        return;
      }

      try {
        logBootstrapStep(`hydrateUser start user=${user.id}`);
        setIsBootstrapping(true);
        setBootMessage('Checking your account');

        const metadataCountryCode = normalizeCountryCode(user.user_metadata?.country_code ?? null);
        const metadataUsername = user.user_metadata?.username ?? null;

        // Let authenticated users into the app immediately using locally available auth metadata.
        // Slower profile/database hydration continues in the background.
        setCurrentUserId(user.id);
        setCurrentUsername(metadataUsername);
        setCurrentIsAdmin(false);
        setCurrentEmail(user.email ?? null);
        setCurrentCountryCode(metadataCountryCode);
        setCurrentHasAcceptedCommunityGuidelines(false);
        setNotificationsEnabled(false);
        setCurrentPasswordLength(user.user_metadata?.password_length ?? 8);
        setIsAuthenticated(true);
        setIsReady(true);
        setHasHydratedAppData(true);
        setBootMessage('Opening your app');

        const profileFetchStartedAt = Date.now();
        const profileResult = await safeBootstrapValue(
          'profiles.select',
          () =>
            supabase
              .from('profiles')
              .select('username, is_admin, notifications_enabled, country_code, community_guidelines_accepted_at')
              .eq('id', user.id)
              .maybeSingle(),
          null
        );
        logBootstrapTiming('profiles.select finished', profileFetchStartedAt);

        const profile = profileResult?.data ?? null;
        const profileLoaded = profileResult != null;
        const derivedCountryCode = normalizeCountryCode(
          profile
            ? (profile.country_code ?? null)
            : (user.user_metadata?.country_code ?? null)
        );

        if (!isActive) {
          return;
        }

        setCurrentUsername(profile?.username ?? metadataUsername);
        if (profileLoaded) {
          setCurrentIsAdmin(Boolean(profile?.is_admin));
        }
        setCurrentCountryCode(derivedCountryCode);
        if (profileLoaded) {
          setCurrentHasAcceptedCommunityGuidelines(Boolean(profile?.community_guidelines_accepted_at));
          setNotificationsEnabled(profile?.notifications_enabled ?? false);
        }
        logBootstrapStep(`identity ready user=${user.id} profileLoaded=${profileLoaded}`);

        const cachedData = await safeBootstrapValue(
          'readBootstrapCache',
          () => readBootstrapCache(user.id),
          null,
          3000
        );
        if (!isActive) {
          return;
        }

        if (cachedData) {
          logBootstrapStep(`bootstrap cache restored epsus=${cachedData.epsus?.length ?? 0} memberships=${cachedData.userMemberships?.length ?? 0}`);
          applyBootstrapData({
            data: cachedData,
            setEpsus,
            setPosts,
            setReviewedPostIdsByEpsu,
            setReportedPostIds,
            setRepliedToPostIds,
            setModeratedEpsuIds,
            setHostedEpsuIds,
            setMemberships,
            setUserMemberships,
            setHiddenEpsuIds,
            setReports,
            setEpsuPopulationById,
            setActivePostCountByEpsu,
            setQueuedFlaggedPosts,
            setBlockedAuthorIds,
          });
          setHasHydratedAppData(true);
        }

        setTimeout(async () => {
          try {
            if (!isActive) {
              return;
            }

            logBootstrapStep('background hydration start');
            setBootMessage(cachedData ? 'Refreshing your feed' : 'Loading your Epsus');

            const [
              loadedEpsus,
              loadedReviewedPostIdsByEpsu,
              loadedReportedPostIds,
              loadedBlockedAuthorIds,
              loadedModeratedEpsuIds,
              loadedHostedEpsuIds,
              loadedUserMemberships,
              loadedHiddenEpsuIds,
            ] = await Promise.all([
              safeBootstrapValue('fetchEpsusWithCountry', () => fetchEpsusWithCountry(), []),
              safeBootstrapValue('fetchReviewedPostIdsByEpsu', () => fetchReviewedPostIdsByEpsu(user.id), {}),
              safeBootstrapValue('fetchReportedPostIds', () => fetchReportedPostIds(user.id), []),
              safeBootstrapValue('fetchBlockedAuthorIds', () => fetchBlockedAuthorIds(), []),
              safeBootstrapValue('fetchModeratedEpsuIds', () => fetchModeratedEpsuIds(user.id), []),
              safeBootstrapValue('fetchHostedEpsuIds', () => fetchHostedEpsuIds(user.id), []),
              safeBootstrapValue(
                'fetchVisibleMemberships',
                () => fetchVisibleMemberships(user.id, { ensureAdminMemberships: Boolean(profile?.is_admin) }),
                []
              ),
              safeBootstrapValue('fetchHiddenEpsuIds', () => fetchHiddenEpsuIds(user.id), []),
            ]);
            const normalizedUserMemberships = loadedUserMemberships;

            logBootstrapStep(
              `background hydration fetched epsus=${loadedEpsus.length} userMemberships=${normalizedUserMemberships.length} moderated=${loadedModeratedEpsuIds.length} hosted=${loadedHostedEpsuIds.length}`
            );

            const activeMembershipEpsuIds = normalizedUserMemberships
              .filter((membership) => membership.status === 'active' || membership.status === 'muted')
              .map((membership) => membership.epsuId);

            if (!isActive) {
              return;
            }

            setBootMessage(cachedData ? 'Refreshing details' : 'Loading your feed');

            const loadedPostsResult = await safeBootstrapValue(
              'fetchPosts',
              () => fetchPosts(activeMembershipEpsuIds),
              []
            );

            if (!isActive) {
              return;
            }

            const initialBootstrapData = {
              epsus: loadedEpsus,
              posts: loadedPostsResult,
              reviewedPostIdsByEpsu: loadedReviewedPostIdsByEpsu,
              reportedPostIds: loadedReportedPostIds,
              repliedToPostIds: deriveReplyTargetPostIds(loadedPostsResult, user.id),
              moderatedEpsuIds: loadedModeratedEpsuIds,
              hostedEpsuIds: loadedHostedEpsuIds,
              memberships: cachedData?.memberships ?? [],
              userMemberships: normalizedUserMemberships,
              hiddenEpsuIds: loadedHiddenEpsuIds,
              reports: cachedData?.reports ?? [],
              epsuPopulationById: cachedData?.epsuPopulationById ?? {},
              activePostCountByEpsu: cachedData?.activePostCountByEpsu ?? {},
              queuedFlaggedPosts: cachedData?.queuedFlaggedPosts ?? [],
              blockedAuthorIds: loadedBlockedAuthorIds,
            };

            applyBootstrapData({
              data: initialBootstrapData,
              setEpsus,
              setPosts,
              setReviewedPostIdsByEpsu,
              setReportedPostIds,
              setRepliedToPostIds,
              setModeratedEpsuIds,
              setHostedEpsuIds,
              setMemberships,
              setUserMemberships,
              setHiddenEpsuIds,
              setReports,
              setEpsuPopulationById,
              setActivePostCountByEpsu,
              setQueuedFlaggedPosts,
              setBlockedAuthorIds,
            });
            setHasHydratedAppData(true);
            setIsBootstrapping(false);
            setBootMessage('');
            logBootstrapStep('initial bootstrap data applied');

            const [
              loadedMembershipGroups,
              loadedReportGroups,
              loadedQueuedFlaggedGroups,
              loadedEpsuPopulationById,
              loadedActivePostCountByEpsu,
            ] = await Promise.all([
              Promise.all(
                loadedHostedEpsuIds.map((epsuId) =>
                  safeBootstrapValue(`fetchEpsuMemberships:${epsuId}`, () => fetchEpsuMemberships(epsuId), [])
                )
              ),
              Promise.all(
                loadedModeratedEpsuIds.map((epsuId) =>
                  safeBootstrapValue(`fetchOpenReportsForEpsu:${epsuId}`, () => fetchOpenReportsForEpsu(epsuId), [])
                )
              ),
              Promise.all(
                loadedModeratedEpsuIds.map((epsuId) =>
                  safeBootstrapValue(
                    `fetchFlaggedQueuedPostsForEpsu:${epsuId}`,
                    () => fetchFlaggedQueuedPostsForEpsu(epsuId),
                    []
                  )
                )
              ),
              safeBootstrapValue(
                'fetchEpsuPopulationCounts',
                () => fetchEpsuPopulationCounts(loadedEpsus.map((epsu) => epsu.id)),
                {}
              ),
              safeBootstrapValue(
                'fetchEpsuActivePostCounts',
                () => fetchEpsuActivePostCounts(loadedEpsus.map((epsu) => epsu.id)),
                {}
              ),
            ]);

            if (!isActive) {
              return;
            }

            const loadedMembershipsResult = loadedMembershipGroups.flat();
            const loadedReportsResult = loadedReportGroups.flat();
            const loadedQueuedFlaggedPostsResult = loadedQueuedFlaggedGroups.flat();
            const normalizedMembershipsResult = loadedMembershipsResult;

            logBootstrapStep(
              `background hydration expanded memberships=${normalizedMembershipsResult.length} reports=${loadedReportsResult.length} queued=${loadedQueuedFlaggedPostsResult.length}`
            );

            const nextBootstrapData = {
              ...initialBootstrapData,
              memberships: normalizedMembershipsResult.filter((membership) => membership.status !== 'kicked'),
              reports: loadedReportsResult,
              epsuPopulationById: loadedEpsuPopulationById,
              activePostCountByEpsu: loadedActivePostCountByEpsu,
              queuedFlaggedPosts: loadedQueuedFlaggedPostsResult,
            };

            applyBootstrapData({
              data: nextBootstrapData,
              setEpsus,
              setPosts,
              setReviewedPostIdsByEpsu,
              setReportedPostIds,
              setRepliedToPostIds,
              setModeratedEpsuIds,
              setHostedEpsuIds,
              setMemberships,
              setUserMemberships,
              setHiddenEpsuIds,
              setReports,
              setEpsuPopulationById,
              setActivePostCountByEpsu,
              setQueuedFlaggedPosts,
              setBlockedAuthorIds,
            });
            void writeBootstrapCache(user.id, nextBootstrapData);
            logBootstrapStep('background hydration complete');

            void safeBootstrapValue('purgeExpiredPersonalData', () => purgeExpiredPersonalData(), null);
            void safeBootstrapValue('releaseQueuedPosts', () => releaseQueuedPosts(), null);
            void safeBootstrapValue('deleteExpiredPosts', () => deleteExpiredPosts(), null);
            if (derivedCountryCode) {
              void safeBootstrapValue(
                'ensureRegionalMemberships',
                () => ensureRegionalMemberships(derivedCountryCode),
                null
              );
            }
          } catch (error) {
            void error;
          } finally {
            if (isActive) {
              setHasHydratedAppData(true);
              setIsBootstrapping(false);
              setBootMessage('');
            }
          }
        }, 0);
      } catch (error) {
        void error;
        if (isActive) {
          setIsReady(true);
          setHasHydratedAppData(true);
          setIsBootstrapping(false);
          setBootMessage('');
        }
      }
    };

    async function initializeAuth() {
      let session = null;
      const sessionStartedAt = Date.now();
      logBootstrapStep('initializeAuth start');

      try {
        const result = await withTimeout(
          supabase.auth.getSession(),
          BOOTSTRAP_STEP_TIMEOUT_MS,
          'auth.getSession'
        );
        session = result.data.session;
      } catch {
        session = null;
      } finally {
        logBootstrapTiming('auth.getSession finished', sessionStartedAt);
      }

      if (!isActive) {
        return;
      }

      if (session?.user) {
        initialAuthResolved = true;
        clearInitialAuthFallback();
        logBootstrapStep(`initializeAuth session user=${session.user.id}`);
        await hydrateUser(session.user);
        return;
      }

      logBootstrapStep('initializeAuth no session');
      scheduleSignedOutFallback();
    }

    void initializeAuth().catch(() => {
      if (isActive) {
        scheduleSignedOutFallback();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      try {
        if (!isActive) {
          return;
        }

        initialAuthResolved = true;
        clearInitialAuthFallback();
        logBootstrapStep(`onAuthStateChange event=${_event} user=${session?.user?.id ?? 'none'}`);

        if (session?.user) {
          setTimeout(() => {
            if (!isActive) {
              return;
            }

            void hydrateUser(session.user);
          }, 0);
          return;
        }

        resolveSignedOutState();
      } catch {
        if (isActive) {
          setIsReady(true);
          setHasHydratedAppData(true);
          setIsBootstrapping(false);
          setBootMessage('');
        }
      }
    });

    return () => {
      isActive = false;
      clearInitialAuthFallback();
      subscription.unsubscribe();
    };
  }, [
    supabase,
    setIsReady,
    setIsAuthenticated,
    setCurrentUserId,
    setCurrentUsername,
    setCurrentIsAdmin,
    setCurrentEmail,
    setCurrentCountryCode,
    setCurrentHasAcceptedCommunityGuidelines,
    setNotificationsEnabled,
    setCurrentPasswordLength,
    setEpsus,
    setPosts,
    setReviewedPostIdsByEpsu,
    setReportedPostIds,
    setModeratedEpsuIds,
    setHostedEpsuIds,
    setMemberships,
    setUserMemberships,
    setHiddenEpsuIds,
    setReports,
    setEpsuPopulationById,
    setActivePostCountByEpsu,
    setUnreadAppNotifications,
    setIsShowingAppNotification,
    setIsBootstrapping,
    setBootMessage,
    setHasHydratedAppData,
    setQueuedFlaggedPosts,
    setBlockedAuthorIds,
    currentEmail,
    isGuestMode,
    isOnline,
    authRefreshNonce,
  ]);
}
