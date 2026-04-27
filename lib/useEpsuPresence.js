import { useEffect } from 'react';
import { AppState } from 'react-native';

import { clearEpsuPresence, fetchEpsuPopulationCounts, syncEpsuPresence } from './api/epsus';

export function useEpsuPresence({
  epsus,
  isAuthenticated,
  isOnline,
  userMemberships,
  setEpsuPopulationById,
}) {
  useEffect(() => {
    if (!isOnline || !isAuthenticated) {
      return;
    }

    let isMounted = true;
    const activeMembershipEpsuIds = userMemberships
      .filter((membership) => membership.status === 'active')
      .map((membership) => membership.epsuId);
    const allEpsuIds = epsus.map((epsu) => epsu.id);

    const refreshPresence = async () => {
      if (!isMounted) {
        return;
      }

      try {
        await syncEpsuPresence(activeMembershipEpsuIds);
        if (!isMounted) {
          return;
        }

        setEpsuPopulationById(await fetchEpsuPopulationCounts(allEpsuIds));
      } catch {
        if (isMounted) {
          setEpsuPopulationById((current) => current);
        }
      }
    };

    const clearPresence = async () => {
      try {
        await clearEpsuPresence();
      } catch {
        return;
      }
    };

    void refreshPresence();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPresence();
        return;
      }

      void clearPresence();
    });

    return () => {
      isMounted = false;
      appStateSubscription.remove();
    };
  }, [epsus, isAuthenticated, isOnline, userMemberships, setEpsuPopulationById]);
}
