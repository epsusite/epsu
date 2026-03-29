import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

const foods = ['Pizza', 'Burger', 'Sushi', 'Pasta', 'Tacos', 'Ice Cream', 'Salad', 'Ramen', 'Steak', 'Donuts'];
const DOCUMENT_URLS = {
  'Terms of service': 'https://epsu.site/terms',
  'Community guidelines': 'https://epsu.site/guidelines',
  'Data use and privacy': 'https://epsu.site/privacy',
  'Epsu whitepaper': 'https://epsu.site/whitepaper',
};

function getRandomFood() {
  return foods[Math.floor(Math.random() * foods.length)];
}

function SettingsRow({ label, value, onPress, destructive = false }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, destructive && styles.destructiveText]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, destructive && styles.destructiveText]}>{value}</Text> : null}
    </TouchableOpacity>
  );
}

function SettingsAction({ label, onPress, destructive = false, brand = false }) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.actionText, brand && styles.brandText, destructive && styles.destructiveText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SettingsMainScreen({
  navigation,
  currentUsername,
  currentEmail,
  currentPasswordLength,
  notificationsEnabled,
  onLogout,
}) {
  const [food, setFood] = useState(() => getRandomFood());
  const docs = useMemo(
    () => [
      'Terms of service',
      'Community guidelines',
      'Data use and privacy',
      'Epsu whitepaper',
    ],
    []
  );

  const openDocument = async (title) => {
    const url = DOCUMENT_URLS[title];
    await WebBrowser.openBrowserAsync(url);
  };

  const handleNotificationsPress = () => {
    Alert.alert('Notifications', 'Open your phone settings to manage notifications for Epsu.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          Linking.openSettings();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionEyebrow}>Your settings</Text>
      <Text style={styles.sectionTitle}>List</Text>

      <View style={styles.card}>
        <SettingsRow label="Username" value={currentUsername ?? 'unknown'} />
        <SettingsRow label="Email" value={currentEmail ?? 'unknown'} />
        <SettingsRow label="Password" value={'*'.repeat(Math.max(currentPasswordLength ?? 0, 1))} />
        <SettingsAction label="Change password" onPress={() => navigation.navigate('ChangePassword')} />
        <SettingsRow
          label="Notifications"
          value={notificationsEnabled ? 'On' : 'Off'}
          onPress={handleNotificationsPress}
        />
        <SettingsRow label="Current plan" value="Annual" />
        <SettingsRow label="Renewal date" value="April 2, 2027" />
        <SettingsAction
          label="Cancel / renew"
          onPress={() => Alert.alert('Billing', 'Subscription management will be added later.')}
        />
        {docs.map((title) => (
          <SettingsAction key={title} label={title} onPress={() => openDocument(title)} />
        ))}
        <SettingsAction label="Log out" onPress={onLogout} brand />
        <SettingsAction
          label="Delete account"
          onPress={() => navigation.navigate('DeleteAccount')}
          destructive
        />
        <View style={[styles.actionButton, styles.foodButton]}>
          <Text style={styles.foodValue}>{food}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ChangePasswordScreen({ onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!currentPassword || !nextPassword || !confirmPassword) {
      setError('All password fields are required.');
      return;
    }

    if (nextPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    const result = await onChangePassword({
      currentPassword,
      nextPassword,
    });

    if (!result.ok) {
      setError(result.message);
      return;
    }

    Alert.alert('Password changed', 'Your password has been updated.');
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionEyebrow}>Your settings</Text>
      <Text style={styles.sectionTitle}>Change password</Text>

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
        <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>Change password</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function DeleteAccountScreen({ onDeleteAccount }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleDelete = () => {
    Alert.alert('Delete account', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError('');
          const result = await onDeleteAccount(password);

          if (!result.ok) {
            setError(result.message);
            return;
          }
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionEyebrow}>Your settings</Text>
      <Text style={styles.sectionTitle}>Delete account</Text>

      <View style={styles.card}>
        <Text style={styles.warningText}>Confirm with your password to permanently delete this account.</Text>
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
          onPress={handleDelete}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Delete account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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

  return <SettingsMainScreen {...props} />;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: '#fff8fb',
    flexGrow: 1,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f7dbe5',
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#211319',
  },
  rowValue: {
    fontSize: 15,
    color: '#7f6170',
    maxWidth: '48%',
    textAlign: 'right',
  },
  actionButton: {
    minHeight: 54,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f7dbe5',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#211319',
  },
  destructiveText: {
    color: '#d72647',
  },
  brandText: {
    color: '#e52b50',
  },
  foodButton: {
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingBottom: 14,
  },
  foodValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#20131a',
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#fff8fb',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#24171d',
    marginBottom: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#e52b50',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#d72647',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  warningText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5d404c',
    marginBottom: 14,
  },
  errorText: {
    color: '#d72647',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
});
