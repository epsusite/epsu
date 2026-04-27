import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireSupabase } from './supabase';

export const PUSH_TOKEN_STORAGE_KEY = 'epsu_last_expo_push_token';

export async function fetchUnreadAppNotifications() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('fetch_unread_app_notifications');

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markAppNotificationRead(notificationId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('mark_app_notification_read', {
    p_notification_id: notificationId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function registerPushToken({ token, platform }) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('register_push_token', {
    p_expo_push_token: token,
    p_platform: platform,
  });

  if (error) {
    throw error;
  }

  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  return data;
}

export async function unregisterPushToken(token) {
  if (!token) {
    return { ok: true };
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('unregister_push_token', {
    p_expo_push_token: token,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function unregisterStoredPushToken() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (!token) {
    return { ok: true };
  }

  try {
    return await unregisterPushToken(token);
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  }
}
