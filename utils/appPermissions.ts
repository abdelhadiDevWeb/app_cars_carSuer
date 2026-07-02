import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const PUSH_PERMISSION_PROMPTED_KEY = 'push_notification_permission_prompted';

const isExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

async function getNotificationsModule() {
  if (isExpoGoAndroid) return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Ask for push notification permission once, the first time the user opens the app (home).
 * Does not require login — system dialog only.
 */
export async function promptPushNotificationPermissionFirstTime(): Promise<void> {
  try {
    const alreadyPrompted = await AsyncStorage.getItem(PUSH_PERMISSION_PROMPTED_KEY);
    if (alreadyPrompted === '1') return;

    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      await AsyncStorage.setItem(PUSH_PERMISSION_PROMPTED_KEY, '1');
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          enableVibrate: true,
          showBadge: true,
        });
      } catch {
        /* optional */
      }
    }

    await AsyncStorage.setItem(PUSH_PERMISSION_PROMPTED_KEY, '1');
  } catch {
    /* user can enable later in settings */
  }
}
