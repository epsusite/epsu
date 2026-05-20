import { Platform } from 'react-native';
import { isValidCountryCode, normalizeCountryCode } from './countryCode';
import { clearEpsuPresence } from './api/epsus';
import { deleteOwnAccount, fetchAccountHistory } from './api/account';
import { signUpWithUniquePassword, updatePasswordWithUniqueness } from './api/auth';
import { ensureOnlineOrThrow, ensureOnlineResult } from './networkGuard';
import { registerPushToken, unregisterStoredPushToken } from './notificationApi';
import { getRegisteredPushTokenAsync } from './pushTokenRegistration';
import { createTemporarySupabaseAuthClient } from './supabase';

const PUBLIC_SITE_URL = 'https://epsu.site';
const RESET_PASSWORD_REDIRECT_URL = `${PUBLIC_SITE_URL}/reset-password`;

export function createAccountActions({
  supabase,
  notificationsModule,
  currentEmail,
  notificationsEnabled,
  setNotificationsEnabled,
  setCurrentPasswordLength,
  setCurrentHasAcceptedCommunityGuidelines,
}) {
  const formatSignUpError = (error) => {
    const rawMessage = error?.message?.trim() || 'Could not create account';
    const lowerMessage = rawMessage.toLowerCase();

    if (
      lowerMessage.includes('row-level security policy') &&
      lowerMessage.includes('profiles')
    ) {
      return {
        field: 'general',
        message:
          'Your account may already have been created. Check your email for a confirmation link before trying again.',
      };
    }

    if (
      lowerMessage.includes('user already registered') ||
      lowerMessage.includes('already been registered')
    ) {
      return {
        field: 'email',
        message: 'Email is already in use',
      };
    }

    if (lowerMessage.includes('error sending confirmation email')) {
      return {
        field: 'general',
        message:
          'Account creation reached email confirmation, but Supabase Auth could not send through the configured SMTP provider. Re-check the SMTP password/API key in Supabase Auth settings.',
      };
    }

    if (lowerMessage.includes('email rate limit exceeded')) {
      return {
        field: 'general',
        message: 'Too many confirmation emails were requested. Wait a bit and try signing up again.',
      };
    }

    if (lowerMessage.includes('signup is disabled')) {
      return {
        field: 'general',
        message: 'Account creation is currently disabled in Supabase Auth settings.',
      };
    }

    if (
      lowerMessage.includes('could not reach password policy service') ||
      lowerMessage.includes('failed to send a request to the edge function') ||
      lowerMessage.includes('functions fetch error') ||
      lowerMessage.includes('missing required secret')
    ) {
      return {
        field: 'general',
        message: 'Account creation is temporarily unavailable because password policy enforcement is offline.',
      };
    }

    if (lowerMessage.includes('invalid email')) {
      return {
        field: 'email',
        message: 'Enter a valid email address',
      };
    }

    if (lowerMessage.includes('password')) {
      return {
        field: 'password',
        message: rawMessage,
      };
    }

    return {
      field: 'general',
      message: `Account creation failed before confirmation email delivery: ${rawMessage}`,
    };
  };

  const handleSignUp = async ({ email, password, countryCode, isThirteenOrOlder, acceptedTerms }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const acceptedAt = new Date().toISOString();

    if (!isThirteenOrOlder) {
      return {
        ok: false,
        field: 'ageConfirmation',
        message: 'You must confirm that you are 13 or older',
      };
    }

    if (!acceptedTerms) {
      return {
        ok: false,
        field: 'terms',
        message: 'You must agree to the Terms of Service and Privacy Policy',
      };
    }

    if (!normalizedCountryCode || !isValidCountryCode(normalizedCountryCode)) {
      return {
        ok: false,
        field: 'countryCode',
        message: 'Use a 2-letter country code like EE or US',
      };
    }

    let data;
    try {
      data = await signUpWithUniquePassword({
        email: normalizedEmail,
        password,
        userData: {
          password_length: password.length,
          country_code: normalizedCountryCode,
          tos_privacy_accepted_at: acceptedAt,
        },
      });
    } catch (error) {
      return {
        ok: false,
        ...formatSignUpError(error),
      };
    }

    if (!data.session) {
      return {
        ok: false,
        requiresConfirmation: true,
        email: normalizedEmail,
        message: 'Check your email and tap the confirmation link to open Epsu and finish signup',
      };
    }

    return { ok: true };
  };

  const handleLogin = async ({ email, password }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        ok: false,
        field: 'password',
        message: 'Wrong email or password',
      };
    }
    return { ok: true };
  };

  const handleRequestPasswordReset = async (email) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const normalizedEmail = email?.trim().toLowerCase() ?? '';

    if (!normalizedEmail) {
      return {
        ok: false,
        field: 'email',
        message: 'Email is required',
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return {
        ok: false,
        field: 'email',
        message: 'Enter a valid email address',
      };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: RESET_PASSWORD_REDIRECT_URL,
    });

    if (error) {
      return {
        ok: false,
        field: 'email',
        message: error.message,
      };
    }

    return {
      ok: true,
      message: 'If that email has an Epsu account, a reset link is on the way',
    };
  };

  const handleCompletePasswordRecovery = async (password) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    if (!password) {
      return {
        ok: false,
        message: 'Password is required',
      };
    }

    if (password.length < 8) {
      return {
        ok: false,
        message: 'Password must be at least 8 characters',
      };
    }

    if (password.length > 64) {
      return {
        ok: false,
        message: 'Password must be 64 characters or fewer',
      };
    }

    try {
      await updatePasswordWithUniqueness({
        password,
        passwordLength: password.length,
      });
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not update password',
      };
    }

    setCurrentPasswordLength(password.length);
    return {
      ok: true,
      message: 'Password updated',
    };
  };

  const handleLogout = async () => {
    try {
      await unregisterStoredPushToken();
    } catch {
      // ignore push token cleanup errors during logout
    }

    try {
      await clearEpsuPresence();
    } catch {
      // ignore presence cleanup errors during logout
    }

    await supabase.auth.signOut({ scope: 'local' });
  };

  const handleRequestNotificationPermission = async () => {
    if (!notificationsModule) {
      return {
        ok: false,
        message: 'Notifications require expo-notifications to be installed and the app to be rebuilt',
        openSettings: true,
      };
    }

    if (Platform.OS === 'android') {
      await notificationsModule.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: notificationsModule.AndroidImportance.MAX,
        sound: 'epsu_notification.wav',
      });
    }

    const { status: existingStatus } = await notificationsModule.getPermissionsAsync();
    if (existingStatus === 'granted') {
      return {
        ok: true,
        message: 'Notifications are already enabled',
      };
    }

    const { status } = await notificationsModule.requestPermissionsAsync();
    if (status === 'granted') {
      return {
        ok: true,
        message: 'Notifications enabled',
      };
    }

    return {
      ok: false,
      message: 'Notifications are still off for Epsu',
      openSettings: true,
    };
  };

  const handleRegisterPushToken = async () => {
    if (!notificationsModule) {
      return {
        ok: false,
        message: 'Notifications require expo-notifications to be installed and the app to be rebuilt',
        openSettings: true,
      };
    }

    try {
      const { token, platform } = await getRegisteredPushTokenAsync(notificationsModule);
      await registerPushToken({ token, platform });
      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message?.trim() || 'Could not register this phone for push notifications.',
      };
    }
  };

  const handleToggleNotifications = async (nextValue) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        message: 'You must be logged in to update notifications',
      };
    }

    if (nextValue) {
      const permissionResult = await handleRequestNotificationPermission();
      if (!permissionResult?.ok) {
        return permissionResult;
      }

      const tokenResult = await handleRegisterPushToken();
      if (!tokenResult?.ok) {
        return tokenResult;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ notifications_enabled: nextValue })
      .eq('id', user.id);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    setNotificationsEnabled(nextValue);

    return {
      ok: true,
      message: nextValue ? 'Notifications enabled' : 'Notifications turned off in Epsu',
    };
  };

  const handleChangePassword = async ({ currentPassword, nextPassword }) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    if (!currentEmail) {
      return {
        ok: false,
        message: 'No email is available for this account',
      };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });

    if (signInError) {
      return {
        ok: false,
        message: 'Current password is incorrect',
      };
    }

    try {
      await updatePasswordWithUniqueness({
        password: nextPassword,
        passwordLength: nextPassword.length,
      });
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not change password',
      };
    }

    setCurrentPasswordLength(nextPassword.length);

    return {
      ok: true,
      message: 'Password changed successfully',
    };
  };

  const handleConfirmDeleteAccount = async (password) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    if (!currentEmail) {
      return {
        ok: false,
        message: 'No email is available for this account',
      };
    }

    if (!password?.trim()) {
      return {
        ok: false,
        message: 'Enter your password first',
      };
    }

    const tempSupabase = createTemporarySupabaseAuthClient();
    const { error: signInError } = await tempSupabase.auth.signInWithPassword({
      email: currentEmail,
      password,
    });

    await tempSupabase.auth.signOut().catch(() => {});

    if (signInError) {
      return {
        ok: false,
        message: 'Current password is incorrect',
      };
    }

    return {
      ok: true,
    };
  };

  const handleDeleteAccount = async (password) => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    if (!currentEmail) {
      return {
        ok: false,
        message: 'No email is available for this account',
      };
    }

    if (!password?.trim()) {
      return {
        ok: false,
        message: 'Enter your password first',
      };
    }

    try {
      await deleteOwnAccount();
    } catch (error) {
      return {
        ok: false,
        message: error?.message ?? 'Could not delete this account',
      };
    }

    await supabase.auth.signOut().catch(() => {});

    return {
      ok: true,
      message: 'Account deleted',
    };
  };

  const handleFetchAccountHistory = async (options = {}) => {
    await ensureOnlineOrThrow();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('You are no longer signed in. Log in again and try again');
    }

    return fetchAccountHistory(user.id, options);
  };

  const handleAcceptCommunityGuidelines = async () => {
    const offlineResult = await ensureOnlineResult();
    if (offlineResult) {
      return offlineResult;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        message: 'You are no longer signed in. Log in again and try again',
      };
    }

    const acceptedAt = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update({ community_guidelines_accepted_at: acceptedAt })
      .eq('id', user.id);

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    setCurrentHasAcceptedCommunityGuidelines(true);
    return { ok: true };
  };

  return {
    handleSignUp,
    handleLogin,
    handleRequestPasswordReset,
    handleCompletePasswordRecovery,
    handleLogout,
    handleToggleNotifications,
    handleRequestNotificationPermission,
    handleChangePassword,
    handleDeleteAccount,
    handleConfirmDeleteAccount,
    handleFetchAccountHistory,
    handleAcceptCommunityGuidelines,
  };
}
