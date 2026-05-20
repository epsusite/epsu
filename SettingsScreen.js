import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAppDialog } from './components/AppDialog';
import { findCountryByCode } from './lib/countries';
import { UI } from './lib/uiTheme';

let SharingModule = null;
try {
  SharingModule = require('expo-sharing');
} catch {
  SharingModule = null;
}

const DOCUMENT_URLS = {
  'Terms of Service': 'https://epsu.site/terms',
  'Community Guidelines': 'https://epsu.site/guidelines',
  'Privacy Policy': 'https://epsu.site/privacy',
};
const SUPPORT_EMAIL = 'epsu.site@protonmail.com';
const CRISIS_EMAIL = SUPPORT_EMAIL;
const RANDOM_FOODS = [
  'Pizza',
  'Sushi',
  'Tacos',
  'Pasta',
  'Burgers',
  'Ramen',
  'Dumplings',
  'Croissants',
  'Ice cream',
  'Falafel',
];

function formatCountry(value) {
  if (!value) {
    return 'Not set';
  }

  return findCountryByCode(value)?.name ?? value.toUpperCase();
}

function formatHistoryTime(value) {
  if (!value) {
    return 'Time unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SettingsRow({ label, value, onPress, destructive = false, isLast = false }) {
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, destructive && styles.destructiveText]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, destructive && styles.destructiveText]}>{value}</Text> : null}
    </TouchableOpacity>
  );
}

function SettingsToggleRow({ label, value, onValueChange, disabled = false, isLast = false }) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.switchWrap}>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: '#d9c1cb', true: '#f08aa0' }}
          thumbColor={value ? '#e52b50' : '#f4f3f4'}
          ios_backgroundColor="#d9c1cb"
          style={Platform.OS === 'ios' ? styles.iosSwitch : null}
        />
      </View>
    </View>
  );
}

function SettingsAction({ label, onPress, destructive = false, brand = false, isLast = false }) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.actionText, brand && styles.brandText, destructive && styles.destructiveText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function submitNow(handler) {
  Keyboard.dismiss();
  handler?.();
}

function ScreenFrame({ insets, eyebrow, title, children }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </ScrollView>
  );
}

function SettingsMainScreen({
  navigation,
  currentIsAdmin,
  currentEmail,
  currentCountryCode,
  notificationsEnabled,
  pushRegistrationStatus,
  onToggleNotifications,
  onRequestNotificationPermission,
  onLogout,
}) {
  const insets = useSafeAreaInsets();
  const [randomFood] = useState(
    () => RANDOM_FOODS[Math.floor(Math.random() * RANDOM_FOODS.length)] ?? 'Pizza'
  );
  const [localNotificationsEnabled, setLocalNotificationsEnabled] = useState(notificationsEnabled);
  const [isNotificationsBusy, setIsNotificationsBusy] = useState(false);

  useEffect(() => {
    if (!isNotificationsBusy) {
      setLocalNotificationsEnabled(notificationsEnabled);
    }
  }, [isNotificationsBusy, notificationsEnabled]);

  const openDocument = async (title) => {
    const url = DOCUMENT_URLS[title];
    await WebBrowser.openBrowserAsync(url);
  };

  const handleNotificationsToggle = async (nextValue) => {
    if (isNotificationsBusy) {
      return;
    }

    const previousValue = notificationsEnabled;
    setIsNotificationsBusy(true);
    setLocalNotificationsEnabled(nextValue);
    const result = await onToggleNotifications(nextValue);
    setIsNotificationsBusy(false);

    if (result?.ok) {
      return;
    }

    setLocalNotificationsEnabled(previousValue);

    if (!nextValue) {
      showAppDialog('Notifications', result?.message ?? 'Could not turn notifications off');
      return;
    }

    showAppDialog('Notifications', result?.message ?? 'Could not turn notifications on', result?.openSettings ? [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          Linking.openSettings();
        },
      },
    ] : [{ text: 'OK' }]);
  };

  return (
    <ScreenFrame insets={insets} eyebrow="Your settings" title="Settings">
      <View style={styles.card}>
        <SettingsRow label="Email" value={currentEmail ?? 'Not set'} />
        <SettingsRow
          label="Country"
          value={formatCountry(currentCountryCode)}
        />
        <SettingsAction label="Change password" onPress={() => navigation.navigate('ChangePassword')} />
        <SettingsToggleRow
          label="Notifications"
          value={localNotificationsEnabled}
          onValueChange={handleNotificationsToggle}
          disabled={isNotificationsBusy}
        />
        <SettingsAction label="Account history" onPress={() => navigation.navigate('AccountHistory')} />
        <SettingsAction label="Help" onPress={() => navigation.navigate('Help')} />
        <SettingsAction label="Terms of Service" onPress={() => openDocument('Terms of Service')} />
        <SettingsAction label="Community Guidelines" onPress={() => openDocument('Community Guidelines')} />
        <SettingsAction label="Privacy Policy" onPress={() => openDocument('Privacy Policy')} />
        <SettingsAction label="Log out" onPress={onLogout} destructive />
        <SettingsAction
          label="Delete account"
          onPress={() => navigation.navigate('DeleteAccount')}
          destructive
          isLast={!currentIsAdmin}
        />
        {currentIsAdmin ? (
          <SettingsAction
            label="Administration"
            onPress={() => navigation.navigate('Admin')}
            isLast
          />
        ) : null}
      </View>

      <Text style={styles.randomFoodText}>{randomFood}</Text>
    </ScreenFrame>
  );
}

function HistorySection({ title, items }) {
  return (
    <View style={styles.historySection}>
      <Text style={styles.historySectionTitle}>{title}</Text>
      {items.length ? (
        items.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <Text style={styles.historyTitle}>{item.title}</Text>
            <Text style={styles.historyMeta}>{item.meta}</Text>
            <Text style={styles.historyTime}>{formatHistoryTime(item.createdAt)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>Nothing here yet</Text>
      )}
    </View>
  );
}

function AccountHistoryScreen({ onFetchAccountHistory }) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) {
      return;
    }

    try {
      setIsExporting(true);
      const exportHistory = await onFetchAccountHistory({ full: true });
      const fileName = `epsu-account-history-${Date.now()}`;
      const fileContents = JSON.stringify(exportHistory, null, 2);

      if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

        if (!permission.granted || !permission.directoryUri) {
          showAppDialog('Account history', 'Choose a folder to download your data file');
          return;
        }

        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          'application/json'
        );

        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, fileContents, {
          encoding: 'utf8',
        });

        showAppDialog('Account history', 'Downloaded your data file to the selected folder');
        return;
      }

      const fileUri = `${FileSystem.documentDirectory}epsu-account-history-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, fileContents, {
        encoding: 'utf8',
      });

      if (Platform.OS === 'ios' && SharingModule && (await SharingModule.isAvailableAsync())) {
        await SharingModule.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Save account history',
          UTI: 'public.json',
        });
        showAppDialog('Account history', 'Your data file is ready to save');
        return;
      }

      showAppDialog('Account history', `Saved your data file\n\n${fileUri}`);
    } catch (nextError) {
      showAppDialog('Account history', nextError?.message ?? 'Could not save account history file');
    } finally {
      setIsExporting(false);
    }
  };

  const loadHistory = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await onFetchAccountHistory();
      setHistory(result);
      setError('');
    } catch (nextError) {
      setHistory(null);
      setError(nextError?.message ?? 'Could not load account history');
    } finally {
      setIsLoading(false);
    }
  }, [onFetchAccountHistory]);

  useFocusEffect(
    React.useCallback(() => {
      loadHistory().catch(() => {});
    }, [loadHistory])
  );

  return (
    <ScreenFrame insets={insets} eyebrow="Your settings" title="Account history">
      <View style={styles.card}>
        <Text style={styles.panelText}>This page lists the main account data tied to you</Text>
        {history?.meta?.sectionLimit ? (
          <Text style={styles.panelSubtext}>
            Showing the most recent {history.meta.sectionLimit} items per section here. Export the data file for full history.
          </Text>
        ) : null}
        {isLoading ? <ActivityIndicator color="#e52b50" style={styles.historyLoader} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {history ? (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, styles.exportButton]}
              onPress={handleExport}
              activeOpacity={0.85}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Download data file</Text>
              )}
            </TouchableOpacity>
            <View style={styles.summaryGrid}>
              <SettingsRow label="Posts" value={`${history.summary.posts}`} />
              <SettingsRow label="Reactions" value={`${history.summary.reactions}`} />
              <SettingsRow label="Reports you filed" value={`${history.summary.reports}`} />
              <SettingsRow label="Notifications" value={`${history.summary.notifications}`} />
              <SettingsRow label="Memberships" value={`${history.summary.memberships}`} />
              <SettingsRow label="Hosted Epsus" value={`${history.summary.hostedEpsus}`} />
              <SettingsRow label="Suggested Epsus" value={`${history.summary.suggestions}`} />
              <SettingsRow label="Action records" value={`${history.summary.moderationActions}`} />
            </View>
            <HistorySection title="Posts" items={history.posts} />
            <HistorySection title="Memberships" items={history.memberships} />
            <HistorySection title="Actions involving you" items={history.moderationActions} />
            <HistorySection title="Reports you filed" items={history.reports} />
            <HistorySection title="Reactions" items={history.reactions} />
            <HistorySection title="Notifications" items={history.notifications} />
            <HistorySection title="Hosted Epsus" items={history.hostedEpsus} />
            <HistorySection title="Suggested Epsus" items={history.suggestions} />
          </>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

function HelpLink({ label, value, onPress }) {
  return (
    <TouchableOpacity style={styles.helpRow} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.helpLabel}>{label}</Text>
      <Text style={styles.helpValue}>{value}</Text>
    </TouchableOpacity>
  );
}

function HelpScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScreenFrame insets={insets} eyebrow="Your settings" title="Help">
      <View style={[styles.card, styles.helpCard]}>
        <Text style={styles.contactLabel}>Administrator contact</Text>
        <HelpLink
          label="Email"
          value={SUPPORT_EMAIL}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </View>

      <View style={[styles.card, styles.helpCard]}>
        <Text style={styles.contactLabel}>Crisis contact</Text>
        <HelpLink
          label="Email"
          value={CRISIS_EMAIL}
          onPress={() => Linking.openURL(`mailto:${CRISIS_EMAIL}`)}
        />
      </View>
    </ScreenFrame>
  );
}

function ChangePasswordScreen({ onChangePassword }) {
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSuccessMessage('');

    if (!currentPassword || !nextPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }

    if (nextPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setIsSubmitting(true);
    const result = await onChangePassword({
      currentPassword,
      nextPassword,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSuccessMessage(result.message ?? 'Password changed successfully');
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  return (
    <ScreenFrame insets={insets} eyebrow="Your settings" title="Change password">
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Current password"
          placeholderTextColor="#8d6676"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#8d6676"
          secureTextEntry
          value={nextPassword}
          onChangeText={setNextPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor="#8d6676"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        <TouchableOpacity style={styles.primaryButton} onPressIn={() => submitNow(handleSubmit)} activeOpacity={0.85} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Change password</Text>}
        </TouchableOpacity>
      </View>
    </ScreenFrame>
  );
}

function DeleteAccountScreen({ onDeleteAccount, onConfirmDeleteAccount }) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    if (isSubmitting) {
      return;
    }

    setError('');
    setIsSubmitting(true);

    const verificationResult = await onConfirmDeleteAccount(password);
    setIsSubmitting(false);

    if (!verificationResult?.ok) {
      setError(verificationResult?.message ?? 'Could not verify your password');
      return;
    }

    showAppDialog('Delete account', 'This action cannot be undone', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError('');
          setIsSubmitting(true);
          const result = await onDeleteAccount(password);
          setIsSubmitting(false);

          if (!result?.ok) {
            setError(result?.message ?? 'Could not delete this account');
          }
        },
      },
    ]);
  };

  return (
    <ScreenFrame insets={insets} eyebrow="Your settings" title="Delete account">
      <View style={styles.card}>
        <Text style={styles.warningText}>Confirm with your password to permanently delete this account</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#8d6676"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.primaryButton, styles.deleteButton]}
          onPressIn={() => submitNow(() => {
            void handleDelete();
          })}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Delete account</Text>}
        </TouchableOpacity>
      </View>
    </ScreenFrame>
  );
}

export default function SettingsScreen(props) {
  const { mode = 'main' } = props;

  if (mode === 'change-password') {
    return <ChangePasswordScreen {...props} />;
  }

  if (mode === 'delete-account') {
    return <DeleteAccountScreen {...props} />;
  }

  if (mode === 'account-history') {
    return <AccountHistoryScreen {...props} />;
  }

  if (mode === 'help') {
    return <HelpScreen {...props} />;
  }

  return <SettingsMainScreen {...props} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: UI.colors.background,
  },
  content: {
    paddingHorizontal: UI.spacing.screen,
    paddingBottom: 28,
    flexGrow: 1,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 18,
  },
  card: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 2,
  },
  heroCard: {
    backgroundColor: UI.colors.surface,
    borderRadius: UI.radius.card,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: UI.spacing.card,
    marginBottom: UI.spacing.gap,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: UI.colors.text,
    marginBottom: 6,
  },
  panelText: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  panelSubtext: {
    fontSize: 13,
    lineHeight: 19,
    color: UI.colors.textSoft,
    marginTop: -6,
    marginBottom: 14,
  },
  randomFoodText: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: UI.colors.textMuted,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: UI.colors.borderSoft,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.colors.text,
  },
  rowValue: {
    fontSize: 15,
    color: UI.colors.textMuted,
    maxWidth: '48%',
    textAlign: 'right',
  },
  switchWrap: {
    minWidth: Platform.OS === 'ios' ? 68 : 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: Platform.OS === 'ios' ? -2 : 0,
  },
  iosSwitch: {
    marginVertical: -2,
  },
  actionButton: {
    minHeight: 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: UI.colors.borderSoft,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.colors.text,
  },
  brandText: {
    color: UI.colors.primary,
  },
  destructiveText: {
    color: UI.colors.danger,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: UI.colors.background,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: UI.colors.text,
    marginBottom: 12,
    justifyContent: 'center',
  },
  historyInput: {
    minHeight: 112,
    paddingVertical: 14,
    textAlignVertical: 'top',
  },
  inputValue: {
    color: '#24171d',
    fontSize: 15,
    fontWeight: '700',
  },
  inputPlaceholder: {
    color: '#8d6676',
    fontSize: 15,
    fontWeight: '500',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: UI.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#e52b50',
  },
  exportButton: {
    marginBottom: 14,
  },
  contactLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: UI.colors.textSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 8,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: '800',
    color: UI.colors.primary,
    marginBottom: 12,
  },
  historyHelpText: {
    fontSize: 14,
    lineHeight: 20,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  helpCard: {
    marginTop: 14,
  },
  helpRow: {
    minHeight: 56,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: UI.colors.borderSoft,
    paddingVertical: 10,
  },
  helpLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: UI.colors.text,
    marginBottom: 4,
  },
  helpValue: {
    fontSize: 14,
    color: '#e52b50',
    fontWeight: '700',
  },
  summaryGrid: {
    marginTop: 4,
    marginBottom: 14,
  },
  historyLoader: {
    marginVertical: 12,
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: '#f7dbe5',
    paddingTop: 14,
    marginTop: 2,
  },
  historySectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 10,
  },
  historyRow: {
    borderRadius: 14,
    backgroundColor: UI.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: UI.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: UI.colors.text,
    marginBottom: 4,
  },
  historyMeta: {
    fontSize: 13,
    color: UI.colors.textMuted,
    marginBottom: 4,
  },
  historyTime: {
    fontSize: 12,
    color: UI.colors.textSoft,
  },
  primaryButtonText: {
    color: UI.colors.surface,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  warningText: {
    fontSize: 15,
    lineHeight: 22,
    color: UI.colors.textMuted,
    marginBottom: 14,
  },
  errorText: {
    color: UI.colors.danger,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  successText: {
    color: UI.colors.success,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
});
