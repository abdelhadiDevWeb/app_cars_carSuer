import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getBackendUrl } from '@/utils/backend';

let notificationHandlerConfigured = false;

/** EAS / app.json extra.eas.projectId — required for getExpoPushTokenAsync on release APK/IPA */
function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  const id = fromExtra || fromEas;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : undefined;
}

async function savePushTokenToBackend(
  expoPushToken: string,
  authJwt: string
): Promise<boolean> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await apiRequest('/user/push-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authJwt}` },
        body: JSON.stringify({
          pushToken: expoPushToken,
          platform: Platform.OS,
          deviceId: Device.modelName || Device.deviceName || 'unknown',
        }),
      });
      if (response.ok) {
        console.log('Push token saved to backend successfully');
        return true;
      }
      const errText = await response.text().catch(() => '');
      console.warn(`Push token save attempt ${attempt}/${maxAttempts} failed:`, response.status, errText);
    } catch (e) {
      console.warn(`Push token save attempt ${attempt}/${maxAttempts} error:`, e);
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  return false;
}

const isExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

async function getNotificationsModule() {
  if (isExpoGoAndroid) return null;
  try {
    return await import('expo-notifications');
  } catch (error) {
    console.error('Error loading expo-notifications:', error);
    return null;
  }
}

async function syncNativeBadgeCount(unread: number) {
  const Notifications = await getNotificationsModule();
  if (!Notifications?.setBadgeCountAsync) return;
  try {
    const n = Math.max(0, Math.min(unread, 99));
    await Notifications.setBadgeCountAsync(n);
  } catch (e) {
    console.warn('setBadgeCountAsync failed:', e);
  }
}

async function configureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        // Avoid stacking badge from each delivery; sync count from API via syncNativeBadgeCount
        shouldSetBadge: false,
      }),
    });
    notificationHandlerConfigured = true;
  } catch (error) {
    console.error('Error setting notification handler:', error);
  }
}

export interface NotificationItem {
  id: string;
  _id?: string;
  message: string;
  type: string;
  is_read: boolean;
  id_sender?: any;
  id_receiver?: string;
  createdAt: string;
  carId?: string;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markChatMessagesAsRead: (otherUserId: string) => Promise<void>;
  markMessageNotificationsAsReadForUser: (otherUserId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, token: authJwt } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);
  const isViewingChatRef = useRef(false);
  const activeChatUserIdRef = useRef<string | null>(null);
  const lastProcessedNotificationIdRef = useRef<string | null>(null);
  const lastProcessedAtRef = useRef<number>(0);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || !user?._id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      await syncNativeBadgeCount(0);
      return;
    }

    try {
      const response = await apiRequest('/notification');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.notifications) {
          const filteredNotifications = data.notifications.filter(
            (notif: any) => notif.type !== 'other'
          ) as NotificationItem[];
          setNotifications(filteredNotifications);
          const unread = filteredNotifications.filter((n: any) => !n.is_read).length;
          setUnreadCount(unread);
          await syncNativeBadgeCount(unread);
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?._id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      void syncNativeBadgeCount(0);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?._id || !authJwt) {
      return;
    }
    void registerForPushNotificationsAsync(authJwt).catch((error) => {
      console.error('Error registering for push notifications:', error);
    });
  }, [isAuthenticated, user?._id, authJwt]);

  // Re-run when app returns to foreground (e.g. user enabled notifications in system settings).
  const lastPushRegisterRef = useRef(0);
  useEffect(() => {
    if (!isAuthenticated || !user?._id || !authJwt) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastPushRegisterRef.current < 5000) return;
      lastPushRegisterRef.current = now;
      void registerForPushNotificationsAsync(authJwt).catch(() => {});
    });
    return () => sub.remove();
  }, [isAuthenticated, user?._id, authJwt]);

  useEffect(() => {
    if (!isAuthenticated || !user?._id) {
      return;
    }
    fetchNotifications();
  }, [isAuthenticated, user?._id, fetchNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !user?._id || user?.type !== 'user') {
      return;
    }

    const backendUrl = getBackendUrl();
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      const userId = user._id || (user as any).id;
      if (userId) socket.emit('join_user', userId);
    });

    socket.on('new_notification', (data: any) => {
      const notification = data?.notification || data;
      if (!notification || !(notification.id || notification._id)) return;
      if (notification.type === 'other') return;

      const nid = String(notification._id || notification.id);
      const now = Date.now();
      if (lastProcessedNotificationIdRef.current === nid && now - lastProcessedAtRef.current < 3000) {
        return;
      }
      lastProcessedNotificationIdRef.current = nid;
      lastProcessedAtRef.current = now;

      if (notification.type === 'message') {
        const senderId = notification.id_sender?._id || notification.id_sender?.id || notification.id_sender;
        const senderIdStr = senderId?.toString?.() || '';
        const activeChatUserId = activeChatUserIdRef.current || '';
        if (
          isViewingChatRef.current &&
          senderIdStr &&
          activeChatUserId &&
          senderIdStr === activeChatUserId
        ) {
          setNotifications((prev) => {
            let marked = 0;
            const next = prev.map((n) => {
              if (
                n.type === 'message' &&
                (n.id_sender?._id === senderIdStr ||
                  n.id_sender?.id === senderIdStr ||
                  n.id_sender === senderIdStr) &&
                !n.is_read
              ) {
                marked++;
                return { ...n, is_read: true };
              }
              return n;
            });
            if (marked > 0) {
              setUnreadCount((p) => {
                const nu = Math.max(0, p - marked);
                void syncNativeBadgeCount(nu);
                return nu;
              });
            }
            return next;
          });
          apiRequest(`/notification/read-chat-messages/${senderIdStr}`, { method: 'PUT' }).catch((err) => {
            console.error('Error auto-marking chat notifications as read:', err);
          });
          return;
        }
      }

      setNotifications((prev) => {
        const exists = prev.some((n: any) => (n._id || n.id) === nid);
        if (exists) return prev;
        const updated = [notification as NotificationItem, ...prev];
        return updated.slice(0, 50);
      });

      // Single source of truth for counts + OS badge (avoids duplicate increments vs fetch).
      void fetchNotifications();
    });

    socket.on('disconnect', () => console.log('Socket disconnected'));

    socketRef.current = socket;

    return () => {
      const userId = user._id || (user as any).id;
      if (userId) socket.emit('leave_user', userId);
      socket.close();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?._id, user?.type, fetchNotifications]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'activeChatChanged',
      (payload?: { isViewingChat?: boolean; otherUserId?: string | null }) => {
        isViewingChatRef.current = !!payload?.isViewingChat;
        activeChatUserIdRef.current = payload?.otherUserId || null;
      }
    );
    return () => {
      subscription.remove();
      isViewingChatRef.current = false;
      activeChatUserIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isExpoGoAndroid) return;

    let cancelled = false;

    (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || cancelled) return;

      notificationListener.current = Notifications.addNotificationReceivedListener(() => {
        void fetchNotifications();
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
        void fetchNotifications();
      });
    })();

    return () => {
      cancelled = true;
      try {
        notificationListener.current?.remove();
        responseListener.current?.remove();
      } catch (e) {
        console.error('Error removing notification listeners:', e);
      }
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated && user?._id) {
        void fetchNotifications();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, user?._id, fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await apiRequest(`/notification/${notificationId}/read`, {
        method: 'PUT',
      });
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId || n._id === notificationId ? { ...n, is_read: true } : n
          )
        );
        setUnreadCount((prev) => {
          const next = Math.max(0, prev - 1);
          void syncNativeBadgeCount(next);
          return next;
        });
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await apiRequest('/notification/read-all', { method: 'PUT' });
      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
        await syncNativeBadgeCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const markChatMessagesAsRead = async (otherUserId: string) => {
    try {
      let unreadCountToSubtract = 0;
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (
            n.type === 'message' &&
            (n.id_sender?._id === otherUserId ||
              n.id_sender?.id === otherUserId ||
              n.id_sender === otherUserId) &&
            !n.is_read
          ) {
            unreadCountToSubtract++;
            return { ...n, is_read: true };
          }
          return n;
        });
        return updated;
      });
      if (unreadCountToSubtract > 0) {
        setUnreadCount((prev) => {
          const next = Math.max(0, prev - unreadCountToSubtract);
          void syncNativeBadgeCount(next);
          return next;
        });
      }
      await apiRequest(`/notification/read-chat-messages/${otherUserId}`, { method: 'PUT' });
      await fetchNotifications();
    } catch (error) {
      console.error('Error marking chat messages as read:', error);
      await fetchNotifications();
    }
  };

  const markMessageNotificationsAsReadForUser = (otherUserId: string) => {
    let toSubtract = 0;
    setNotifications((prev) => {
      const next = prev.map((n) => {
        if (
          n.type === 'message' &&
          (n.id_sender?._id === otherUserId ||
            n.id_sender?.id === otherUserId ||
            n.id_sender === otherUserId) &&
          !n.is_read
        ) {
          toSubtract++;
          return { ...n, is_read: true };
        }
        return n;
      });
      return next;
    });
    if (toSubtract > 0) {
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - toSubtract);
        void syncNativeBadgeCount(next);
        return next;
      });
    }
  };

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    markChatMessagesAsRead,
    markMessageNotificationsAsReadForUser,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}

async function registerForPushNotificationsAsync(authJwt: string) {
  try {
    if (!Device.isDevice) {
      console.log('Push notifications: skipped (simulator / non-device)');
      return null;
    }

    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      if (isExpoGoAndroid) {
        console.log('Expo Go Android detected (SDK 53+): remote push registration skipped.');
      }
      return null;
    }

    let token: string | undefined;

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
      } catch (channelError) {
        console.error('Error setting notification channel:', channelError);
      }
    }

    let finalStatus: string;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (permissionError) {
      console.error('Error getting notification permissions:', permissionError);
      return null;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      console.error(
        'Expo projectId missing. Set expo.extra.eas.projectId in app.json (EAS) and rebuild the APK.'
      );
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      token = tokenData.data;
      console.log('Expo push token obtained:', token?.slice(0, 24) + '…');

      const saved = await savePushTokenToBackend(token, authJwt);
      if (!saved) {
        console.error('Could not persist push token to backend after retries');
      }
    } catch (tokenError: any) {
      const msg = String(tokenError?.message || tokenError || '');
      if (
        msg.includes('FirebaseApp') ||
        msg.includes('FCM') ||
        msg.includes('Firebase') ||
        msg.includes('google-services')
      ) {
        console.warn(
          'Firebase / FCM not linked to this build. Ensure google-services.json matches package com.boojaaa.carsure, then run a new EAS build.'
        );
        return null;
      }
      if (msg.includes('FCM server key') || msg.includes('Expo')) {
        console.warn(
          'Expo Push cannot deliver to Android until FCM is configured for this project. In expo.dev: Project → Credentials → Android → add FCM / Google Service Account (see Expo push docs), then rebuild APK.'
        );
      }
      console.error('Error getting push token:', tokenError);
      return null;
    }

    return token ?? null;
  } catch (error) {
    console.error('Unexpected error in registerForPushNotificationsAsync:', error);
    return null;
  }
}
