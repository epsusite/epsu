import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCOUNTS_STORAGE_KEY = 'epsu.accounts';

export async function loadAccounts() {
  const rawValue = await AsyncStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

export async function saveAccounts(accounts) {
  await AsyncStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}
