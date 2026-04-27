import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getExpoProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    Constants.manifest2?.extra?.expoClient?.extra?.eas?.projectId ??
    null
  );
}

export async function getRegisteredPushTokenAsync(notificationsModule) {
  if (!notificationsModule) {
    throw new Error('Notifications require expo-notifications to be installed and the app to be rebuilt');
  }

  if (Platform.OS === 'android') {
    await notificationsModule.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: notificationsModule.AndroidImportance.MAX,
      sound: 'epsu_notification.wav',
    });

    const tokenResult = await notificationsModule.getDevicePushTokenAsync();
    const token = tokenResult?.data?.trim();
    if (!token) {
      throw new Error('This phone did not return an Android push token.');
    }

    return {
      token,
      platform: Platform.OS,
    };
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error('Push token setup is missing from this app build.');
  }

  const tokenResult = await notificationsModule.getExpoPushTokenAsync({ projectId });
  const token = tokenResult?.data?.trim();
  if (!token) {
    throw new Error('This phone did not return a push token.');
  }

  return {
    token,
    platform: Platform.OS,
  };
}
