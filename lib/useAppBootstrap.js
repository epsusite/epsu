import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { normalizeCountryCode } from './countryCode';
import {
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

const BOOTSTRAP_CACHE_KEY = 'epsu_bootstrap_cache_v1';
const BOOTSTRAP_STEP_TIMEOUT_MS = 12000;
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
    console.warn(`[bootstrap] ${label} failed`, error?.message ?? error);
    return fallbackValue;
  }
}

function logBootstrapTiming(label, startedAt) {
  const durationMs = Date.now() - startedAt;
  console.log(`[bootstrap] ${label} (${durationMs}ms)`);
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
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
}) {
  setEpsus(data.epsus ?? []);
  setPosts(data.posts ?? []);
  setReviewedPostIdsByEpsu(data.reviewedPostIdsByEpsu ?? {});
  setReportedPostIds(data.reportedPostIds ?? []);
  setModeratedEpsuIds(data.moderatedEpsuIds ?? []);
  setHostedEpsuIds(data.hostedEpsuIds ?? []);
  setMemberships(data.memberships ?? []);
  setUserMemberships(data.userMemberships ?? []);
  setHiddenEpsuIds(data.hiddenEpsuIds ?? []);
  setReports(data.reports ?? []);
  setEpsuPopulationById(data.epsuPopulationById ?? {});
  setQueuedFlaggedPosts(data.queuedFlaggedPosts ?? []);
  setBlockedAuthorIds(data.blockedAuthorIds ?? []);
}

function resetSessionState({
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
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
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
  setModeratedEpsuIds([]);
  setHostedEpsuIds([]);
  setMemberships([]);
  setUserMemberships([]);
  setHiddenEpsuIds([]);
  setReports([]);
  setEpsuPopulationById({});
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
  setModeratedEpsuIds,
  setHostedEpsuIds,
  setMemberships,
  setUserMemberships,
  setHiddenEpsuIds,
  setReports,
  setEpsuPopulationById,
  setUnreadAppNotifications,
  setIsShowingAppNotification,
  setIsBootstrapping,
  setBootMessage,
  setHasHydratedAppData,
  setQueuedFlaggedPosts,
  setBlockedAuthorIds,
  authRefreshNonce = 0,
}) {
  useEffect(() => {
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
        setModeratedEpsuIds,
        setHostedEpsuIds,
        setMemberships,
        setUserMemberships,
        setHiddenEpsuIds,
        setReports,
        setEpsuPopulationById,
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
      initialAuthFallbackTimeoutId = setTimeout(() => {
        if (!isActive || initialAuthResolved) {
          return;
        }

        initialAuthResolved = true;
        resolveSignedOutState();
      }, INITIAL_AUTH_GRACE_MS);
    };

    const hydrateUser = async (user) => {
      if (!user || !isActive) {
        return;
      }

      try {
        setIsBootstrapping(true);
        setHasHydratedAppData(false);
        setBootMessage('Checking your account');

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

        setCurrentUserId(user.id);
        setCurrentUsername(profile?.username ?? user.user_metadata?.username ?? null);
        if (profileLoaded) {
          setCurrentIsAdmin(Boolean(profile?.is_admin));
        }
        setCurrentEmail(user.email ?? null);
        setCurrentCountryCode(derivedCountryCode);
        setCurrentHasAcceptedCommunityGuidelines(Boolean(profile?.community_guidelines_accepted_at));
        if (profileLoaded) {
          setNotificationsEnabled(profile?.notifications_enabled ?? false);
        }
        setCurrentPasswordLength(user.user_metadata?.password_length ?? 8);
        setIsAuthenticated(true);
        setIsReady(true);
        // Let the user into the app once auth and identity are known.
        // Heavier feed/bootstrap data can continue loading in the background.
        setHasHydratedAppData(true);
        setBootMessage('Opening your app');

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
          applyBootstrapData({
            data: cachedData,
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
              safeBootstrapValue('fetchVisibleMemberships', () => fetchVisibleMemberships(user.id), []),
              safeBootstrapValue('fetchHiddenEpsuIds', () => fetchHiddenEpsuIds(user.id), []),
            ]);

            const activeMembershipEpsuIds = loadedUserMemberships
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
              moderatedEpsuIds: loadedModeratedEpsuIds,
              hostedEpsuIds: loadedHostedEpsuIds,
              memberships: cachedData?.memberships ?? [],
              userMemberships: loadedUserMemberships,
              hiddenEpsuIds: loadedHiddenEpsuIds,
              reports: cachedData?.reports ?? [],
              epsuPopulationById: cachedData?.epsuPopulationById ?? {},
              queuedFlaggedPosts: cachedData?.queuedFlaggedPosts ?? [],
              blockedAuthorIds: loadedBlockedAuthorIds,
            };

            applyBootstrapData({
              data: initialBootstrapData,
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
              setQueuedFlaggedPosts,
              setBlockedAuthorIds,
            });
            setHasHydratedAppData(true);
            setIsBootstrapping(false);
            setBootMessage('');

            const [
              loadedMembershipGroups,
              loadedReportGroups,
              loadedQueuedFlaggedGroups,
              loadedEpsuPopulationById,
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
            ]);

            if (!isActive) {
              return;
            }

            const loadedMembershipsResult = loadedMembershipGroups.flat();
            const loadedReportsResult = loadedReportGroups.flat();
            const loadedQueuedFlaggedPostsResult = loadedQueuedFlaggedGroups.flat();

            const nextBootstrapData = {
              ...initialBootstrapData,
              memberships: loadedMembershipsResult.filter((membership) => membership.status !== 'kicked'),
              reports: loadedReportsResult,
              epsuPopulationById: loadedEpsuPopulationById,
              queuedFlaggedPosts: loadedQueuedFlaggedPostsResult,
            };

            applyBootstrapData({
              data: nextBootstrapData,
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
              setQueuedFlaggedPosts,
              setBlockedAuthorIds,
            });
            void writeBootstrapCache(user.id, nextBootstrapData);

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
            console.warn('[bootstrap] background hydration failed', error?.message ?? error);
          } finally {
            if (isActive) {
              setHasHydratedAppData(true);
              setIsBootstrapping(false);
              setBootMessage('');
            }
          }
        }, 0);
      } catch (error) {
        console.warn('[bootstrap] hydrateUser failed', error?.message ?? error);
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
        await hydrateUser(session.user);
        return;
      }

      scheduleSignedOutFallback();
    }

    void initializeAuth().catch(() => {
      if (isActive) {
        scheduleSignedOutFallback();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!isActive) {
          return;
        }

        initialAuthResolved = true;
        clearInitialAuthFallback();

        if (session?.user) {
          await hydrateUser(session.user);
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
    setUnreadAppNotifications,
    setIsShowingAppNotification,
    setIsBootstrapping,
    setBootMessage,
    setHasHydratedAppData,
    setQueuedFlaggedPosts,
    setBlockedAuthorIds,
    isOnline,
    authRefreshNonce,
  ]);
}
