import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { showAppDialog } from '../components/AppDialog';
import {
  fetchUnreadAppNotifications,
  markAppNotificationRead,
  PUSH_TOKEN_STORAGE_KEY,
  registerPushToken,
  unregisterPushToken,
} from './notificationApi';
import { fetchModeratedEpsuIds, fetchHostedEpsuIds } from './api/epsus';
import { fetchEpsusWithCountry, fetchVisibleMemberships } from './schoolApi';
import { getRegisteredPushTokenAsync } from './pushTokenRegistration';
import { requireSupabase } from './supabase';

const UNREAD_NOTIFICATIONS_FALLBACK_POLL_MS = 60000;

function getMsUntilNextUtcHour(now = Date.now()) {
  const nextHour = new Date(now);
  nextHour.setUTCMinutes(0, 0, 250);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return Math.max(250, nextHour.getTime() - now);
}

function getPushSyncErrorMessage(error) {
  const rawMessage = error?.message?.trim();
  if (!rawMessage) {
    return 'Could not register this phone for push notifications.';
  }

  return rawMessage;
}

async function refreshAppNotificationContext({
  currentUserId,
  currentIsAdmin,
  setEpsus,
  setUserMemberships,
  setHostedEpsuIds,
  setModeratedEpsuIds,
  addNotificationDiagnostic,
}) {
  const [
    epsusResult,
    userMembershipsResult,
    hostedEpsuIdsResult,
    moderatedEpsuIdsResult,
  ] = await Promise.allSettled([
    fetchEpsusWithCountry(),
    fetchVisibleMemberships(currentUserId, { ensureAdminMemberships: currentIsAdmin }),
    fetchHostedEpsuIds(currentUserId),
    fetchModeratedEpsuIds(currentUserId),
  ]);

  addNotificationDiagnostic?.('notification_context_fetch_finished', {
    epsusOk: epsusResult.status === 'fulfilled',
    membershipsOk: userMembershipsResult.status === 'fulfilled',
    hostedOk: hostedEpsuIdsResult.status === 'fulfilled',
    moderatedOk: moderatedEpsuIdsResult.status === 'fulfilled',
  });

  if (epsusResult.status === 'fulfilled') {
    setEpsus(epsusResult.value);
  }

  if (userMembershipsResult.status === 'fulfilled') {
    setUserMemberships(userMembershipsResult.value);
  }

  if (hostedEpsuIdsResult.status === 'fulfilled') {
    setHostedEpsuIds(hostedEpsuIdsResult.value);
  }

  if (moderatedEpsuIdsResult.status === 'fulfilled') {
    setModeratedEpsuIds(moderatedEpsuIdsResult.value);
  }
}

export function useAppNotifications({
  currentUserId,
  currentIsAdmin,
  isAuthenticated,
  allowNotificationPrompts = true,
  isOnline,
  notificationsEnabled,
  notificationsModule,
  handleToggleNotifications,
  unreadAppNotifications,
  isShowingAppNotification,
  setUnreadAppNotifications,
  setIsShowingAppNotification,
  setEpsus,
  setUserMemberships,
  setHostedEpsuIds,
  setModeratedEpsuIds,
  setPushRegistrationStatus,
  setPushRegistrationMessage,
  addNotificationDiagnostic,
}) {
  useEffect(() => {
    if (!allowNotificationPrompts || !isOnline || !isAuthenticated || !currentUserId || !notificationsModule) {
      setPushRegistrationStatus('idle');
      setPushRegistrationMessage('');
      return;
    }

    let isActive = true;
    const promptKey = `epsu_notifications_soft_prompt_v2:${currentUserId}`;

    const requestSoftPrompt = async () => {
      try {
        const alreadyPrompted = await AsyncStorage.getItem(promptKey);
        if (alreadyPrompted || !isActive || notificationsEnabled) {
          return;
        }

        await AsyncStorage.setItem(promptKey, '1');
        addNotificationDiagnostic?.('soft_prompt_shown');
        showAppDialog(
          'Turn on notifications?',
          'Get review results and important Epsu updates, you can keep them off if you want',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                await handleToggleNotifications(true);
              },
            },
          ]
        );
      } catch {
        return;
      }
    };

    void requestSoftPrompt();

    return () => {
      isActive = false;
    };
  }, [
    currentUserId,
    isAuthenticated,
    allowNotificationPrompts,
    isOnline,
    notificationsEnabled,
    notificationsModule,
    setPushRegistrationMessage,
    setPushRegistrationStatus,
    handleToggleNotifications,
    addNotificationDiagnostic,
  ]);

  useEffect(() => {
    if (!allowNotificationPrompts || !isOnline || !isAuthenticated || !currentUserId || !notificationsModule) {
      return;
    }

    let isActive = true;
    const errorPromptKey = `epsu_push_sync_error_v1:${currentUserId}`;

    const syncPushToken = async () => {
      try {
        const lastToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

        if (!notificationsEnabled) {
          if (lastToken) {
            await unregisterPushToken(lastToken).catch(() => {});
            await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
            addNotificationDiagnostic?.('token_unregistered', { tokenPrefix: lastToken.slice(0, 24) });
          }
          if (isActive) {
            setPushRegistrationStatus('disabled');
            setPushRegistrationMessage('Push delivery is off in Epsu settings.');
          }
          addNotificationDiagnostic?.('push_disabled');
          return;
        }

        const permission = await notificationsModule.getPermissionsAsync();
        addNotificationDiagnostic?.('permission_checked', { status: permission.status });
        if (permission.status !== 'granted') {
          if (isActive) {
            setPushRegistrationStatus('permission_missing');
            setPushRegistrationMessage('Android notification permission is not granted.');
          }
          return;
        }

        if (Platform.OS === 'android') {
          await notificationsModule.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: notificationsModule.AndroidImportance.MAX,
            sound: 'epsu_notification.wav',
          });
        }

        const { token, platform } = await getRegisteredPushTokenAsync(notificationsModule);
        if (!token || !isActive) {
          throw new Error('This phone did not return a push token.');
        }

        await registerPushToken({ token, platform });
        addNotificationDiagnostic?.('token_registered', {
          platform,
          tokenPrefix: token.slice(0, 32),
        });
        if (isActive) {
          setPushRegistrationStatus('registered');
          setPushRegistrationMessage(`Push token registered: ${token}`);
        }
        await AsyncStorage.removeItem(errorPromptKey).catch(() => {});
      } catch (error) {
        console.warn('Push token sync failed', error);
        addNotificationDiagnostic?.('token_sync_failed', error?.message ?? String(error));
        if (isActive) {
          setPushRegistrationStatus('error');
          setPushRegistrationMessage(getPushSyncErrorMessage(error));
        }
        const alreadyPrompted = await AsyncStorage.getItem(errorPromptKey).catch(() => null);
        if (!alreadyPrompted && isActive) {
          await AsyncStorage.setItem(errorPromptKey, '1').catch(() => {});
          showAppDialog('Notifications', getPushSyncErrorMessage(error));
        }
      }
    };

    void syncPushToken();

    return () => {
      isActive = false;
    };
  }, [
    currentUserId,
    isAuthenticated,
    allowNotificationPrompts,
    isOnline,
    notificationsEnabled,
    notificationsModule,
    setPushRegistrationMessage,
    setPushRegistrationStatus,
    addNotificationDiagnostic,
  ]);

  useEffect(() => {
    if (!allowNotificationPrompts || !isOnline || !isAuthenticated || !currentUserId) {
      return;
    }

    const supabase = requireSupabase();
    let isActive = true;
    let hourBoundaryTimeout = null;
    let hourRetryTimeout = null;

    const loadUnreadNotifications = async () => {
      const notificationsResult = await Promise.allSettled([
        fetchUnreadAppNotifications(),
      ]).then((results) => results[0]);

      if (!isActive) {
        return;
      }

      addNotificationDiagnostic?.('unread_fetch_finished', {
        notificationsOk: notificationsResult.status === 'fulfilled',
        notificationsCount: notificationsResult.status === 'fulfilled' ? notificationsResult.value.length : null,
      });

      if (notificationsResult.status === 'fulfilled') {
        setUnreadAppNotifications(notificationsResult.value);
      } else {
        setUnreadAppNotifications([]);
      }
    };

    const loadNotificationContext = async () => {
      await refreshAppNotificationContext({
        currentUserId,
        currentIsAdmin,
        setEpsus,
        setUserMemberships,
        setHostedEpsuIds,
        setModeratedEpsuIds,
        addNotificationDiagnostic,
      });
    };

    const scheduleHourBoundaryRefresh = () => {
      hourBoundaryTimeout = setTimeout(() => {
        void loadUnreadNotifications();

        hourRetryTimeout = setTimeout(() => {
          void loadUnreadNotifications();
        }, 2500);

        scheduleHourBoundaryRefresh();
      }, getMsUntilNextUtcHour());
    };

    void loadUnreadNotifications();
    void loadNotificationContext();
    scheduleHourBoundaryRefresh();

    const notificationChannel = supabase
      .channel(`app-notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_notifications',
          filter: `profile_id=eq.${currentUserId}`,
        },
        () => {
          addNotificationDiagnostic?.('notification_realtime_event');
          void loadUnreadNotifications();
        }
      )
      .subscribe((status) => {
        addNotificationDiagnostic?.('notification_realtime_status', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void loadUnreadNotifications();
        }
      });

    const pollUnreadNotifications = setInterval(() => {
      if (AppState.currentState === 'active') {
        void loadUnreadNotifications();
      }
    }, UNREAD_NOTIFICATIONS_FALLBACK_POLL_MS);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadUnreadNotifications();
        void loadNotificationContext();
      }
    });

    const receivedSubscription = notificationsModule?.addNotificationReceivedListener?.(() => {
      addNotificationDiagnostic?.('push_received_foreground');
      void loadUnreadNotifications();
    });

    const responseSubscription = notificationsModule?.addNotificationResponseReceivedListener?.(() => {
      addNotificationDiagnostic?.('push_response_received');
      void loadUnreadNotifications();
    });

    return () => {
      isActive = false;
      if (hourBoundaryTimeout) {
        clearTimeout(hourBoundaryTimeout);
      }
      if (hourRetryTimeout) {
        clearTimeout(hourRetryTimeout);
      }
      clearInterval(pollUnreadNotifications);
      appStateSubscription.remove();
      receivedSubscription?.remove?.();
      responseSubscription?.remove?.();
      void supabase.removeChannel(notificationChannel);
    };
  }, [
    currentUserId,
    currentIsAdmin,
    isAuthenticated,
    allowNotificationPrompts,
    isOnline,
    notificationsModule,
    setUnreadAppNotifications,
    setEpsus,
    setUserMemberships,
    setHostedEpsuIds,
    setModeratedEpsuIds,
    addNotificationDiagnostic,
  ]);

  useEffect(() => {
    if (isShowingAppNotification || unreadAppNotifications.length === 0) {
      return;
    }

    const nextNotification = unreadAppNotifications[0];
    setIsShowingAppNotification(true);
    addNotificationDiagnostic?.('popup_shown', {
      title: nextNotification.title,
      kind: nextNotification.kind,
    });
    showAppDialog(
      nextNotification.title,
      nextNotification.body,
      [
        {
          text: 'OK',
          onPress: async () => {
            try {
              await markAppNotificationRead(nextNotification.id);
              addNotificationDiagnostic?.('popup_marked_read', { id: nextNotification.id });
            } catch {
              // keep UX moving even if the read flag fails
            }

            setUnreadAppNotifications((current) =>
              current.filter((notification) => notification.id !== nextNotification.id)
            );
          },
        },
      ],
      {
        onClose: () => {
          setIsShowingAppNotification(false);
        },
      }
    );
  }, [
    isShowingAppNotification,
    unreadAppNotifications,
    setIsShowingAppNotification,
    setUnreadAppNotifications,
    addNotificationDiagnostic,
  ]);

}
