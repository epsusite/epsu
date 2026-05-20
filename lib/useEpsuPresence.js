import { useEffect } from 'react';
import { AppState } from 'react-native';

import { requireSupabase } from './supabase';
import { clearEpsuPresence, fetchEpsuPopulationCounts, syncEpsuPresence } from './api/epsus';

const PRESENCE_REFRESH_INTERVAL_MS = 30000;
const PRESENCE_REALTIME_REFRESH_DEBOUNCE_MS = 1200;

function logPresenceStep(label, startedAt, details = '') {
  void label;
  void startedAt;
  void details;
}

function logPresenceState(message) {
  void message;
}

export function useEpsuPresence({
  currentUserId,
  epsus,
  hasHydratedAppData,
  isAuthenticated,
  isBootstrapping,
  isReady,
  isOnline,
  userMemberships,
  setEpsuPopulationById,
}) {
  useEffect(() => {
    logPresenceState(
      `clear-effect ready=${isReady} auth=${isAuthenticated} online=${isOnline} bootstrapping=${isBootstrapping} hydrated=${hasHydratedAppData} user=${currentUserId ?? 'none'}`
    );
    if (!isReady) {
      logPresenceState('clear-effect skipped reason=not_ready');
      return undefined;
    }

    if (isAuthenticated && isOnline) {
      logPresenceState('clear-effect skipped reason=session_active');
      return undefined;
    }

    const clearStartedAt = Date.now();
    void clearEpsuPresence()
      .then(() => {
        logPresenceStep('clearEpsuPresence finished', clearStartedAt, 'session_inactive');
      })
      .catch(() => {});

    return undefined;
  }, [isAuthenticated, isOnline, isReady]);

  useEffect(() => {
    logPresenceState(
      `sync-effect ready=${isReady} auth=${isAuthenticated} online=${isOnline} bootstrapping=${isBootstrapping} hydrated=${hasHydratedAppData} user=${currentUserId ?? 'none'} memberships=${userMemberships.length} epsus=${epsus.length}`
    );
    if (!isReady || isBootstrapping || !isOnline || !isAuthenticated || !currentUserId || !hasHydratedAppData) {
      logPresenceState('sync-effect skipped reason=gate_blocked');
      return undefined;
    }

    let isMounted = true;
    const activeMembershipEpsuIds = userMemberships
      .filter((membership) => membership.status === 'active' || membership.status === 'muted')
      .map((membership) => membership.epsuId);
    const allEpsuIds = epsus.map((epsu) => epsu.id);
    const supabase = requireSupabase();

    if (userMemberships.length === 0 || activeMembershipEpsuIds.length === 0 || allEpsuIds.length === 0) {
      logPresenceState(
        `sync-effect skipped reason=empty_state memberships=${userMemberships.length} active_memberships=${activeMembershipEpsuIds.length} visible_epsus=${allEpsuIds.length}`
      );
      return undefined;
    }

    let refreshIntervalId = null;
    let refreshTimeoutId = null;

    const refreshPresence = async () => {
      if (!isMounted) {
        return;
      }

      const refreshStartedAt = Date.now();
      void refreshStartedAt;

      try {
        const syncStartedAt = Date.now();
        await syncEpsuPresence(activeMembershipEpsuIds);
        logPresenceStep('syncEpsuPresence finished', syncStartedAt, `active_memberships=${activeMembershipEpsuIds.length}`);
        if (!isMounted) {
          return;
        }

        const fetchStartedAt = Date.now();
        const nextPopulation = await fetchEpsuPopulationCounts(allEpsuIds);
        logPresenceStep(
          'fetchEpsuPopulationCounts finished',
          fetchStartedAt,
          `visible_epsus=${allEpsuIds.length}`
        );
        setEpsuPopulationById(nextPopulation);
        const totalOnline = Object.values(nextPopulation).reduce(
          (sum, counts) => sum + Number(counts?.onlineCount ?? 0),
          0
        );
        logPresenceStep('refresh finished', refreshStartedAt, `total_online=${totalOnline}`);
      } catch (error) {
        if (isMounted) {
          setEpsuPopulationById((current) => current);
        }
        void error;
      }
    };

    const scheduleRefreshPresence = () => {
      if (!isMounted || AppState.currentState !== 'active') {
        return;
      }

      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }

      refreshTimeoutId = setTimeout(() => {
        refreshTimeoutId = null;
        void refreshPresence();
      }, PRESENCE_REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const clearPresence = async () => {
      const clearStartedAt = Date.now();
      try {
        await clearEpsuPresence();
        logPresenceStep('clearEpsuPresence finished', clearStartedAt);
      } catch (error) {
        void error;
      }
    };

    void refreshPresence();
    refreshIntervalId = setInterval(() => {
      if (AppState.currentState === 'active') {
        void refreshPresence();
      }
    }, PRESENCE_REFRESH_INTERVAL_MS);

    const presenceChannels = allEpsuIds.map((epsuId) =>
      supabase
        .channel(`presence:${currentUserId}:${epsuId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'epsu_presence',
            filter: `epsu_id=eq.${epsuId}`,
          },
          () => {
            scheduleRefreshPresence();
          }
        )
        .subscribe()
    );

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPresence();
        return;
      }

      if (nextState === 'background') {
        void clearPresence();
      }
    });

    return () => {
      isMounted = false;
      if (refreshIntervalId) {
        clearInterval(refreshIntervalId);
      }
      if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
      }
      appStateSubscription.remove();
      presenceChannels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [
    currentUserId,
    epsus,
    hasHydratedAppData,
    isAuthenticated,
    isBootstrapping,
    isOnline,
    isReady,
    userMemberships,
    setEpsuPopulationById,
  ]);
}
