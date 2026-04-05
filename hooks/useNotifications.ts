import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getBackendUrl } from '@/utils/backend';

let notificationHandlerConfigured = false;

const isExpoGoAndroid =
  Platform.OS === 'android' &&
  Constants.executionEnvironment === 'storeClient';

async function getNotificationsModule() {
  if (isExpoGoAndroid) {
    return null;
  }

  try {
    const Notifications = await import('expo-notifications');
    return Notifications;
  } catch (error) {
    console.error('Error loading expo-notifications:', error);
    return null;
  }
}

async function configureNotificationHandler() {
  if (notificationHandlerConfigured) return;

  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    notificationHandlerConfigured = true;
  } catch (error) {
    console.error('Error setting notification handler:', error);
  }
}

export interface Notification {
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

export function useNotifications() {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const isViewingChatRef = useRef(false);
  const activeChatUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Request notification permissions and register for push notifications
  useEffect(() => {
    if (isAuthenticated && user?._id) {
      // Wrap in try-catch to prevent app crash if notification setup fails
      registerForPushNotificationsAsync().catch((error) => {
        console.error('Error registering for push notifications:', error);
        // Don't crash the app if notifications fail
      });
    }
  }, [isAuthenticated, user]);

  // Fetch notifications from API
  const fetchNotifications = async () => {
    if (!isAuthenticated || !user?._id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const response = await apiRequest('/notification');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.notifications) {
          // Filter out notifications with type "other" (like web dashboard)
          const filteredNotifications = data.notifications.filter(
            (notif: any) => notif.type !== 'other'
          );
          setNotifications(filteredNotifications);
          const unread = filteredNotifications.filter((n: any) => !n.is_read).length;
          setUnreadCount(unread);
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Setup Socket.IO connection
  useEffect(() => {
    if (!isAuthenticated || !user?._id || user?.type !== 'user') {
      return;
    }

    const backendUrl = getBackendUrl();
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected for notifications');
      const userId = user._id || (user as any).id;
      if (userId) {
        socket.emit('join_user', userId);
      }
    });

    socket.on('new_notification', (data: any) => {
      console.log('New notification received via socket:', data);
      
      // Handle different data structures from backend
      const notification = data?.notification || data;
      
      if (notification && (notification.id || notification._id)) {
        // Filter out "other" type notifications
        if (notification.type === 'other') return;

        // If user is currently viewing the same chat sender, auto-mark as read and skip banner/unread increment.
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
            // Optimistic local update for this sender notifications.
            markMessageNotificationsAsReadForUser(senderIdStr);
            // Persist read status on backend.
            apiRequest(`/notification/read-chat-messages/${senderIdStr}`, {
              method: 'PUT',
            }).catch((err) => {
              console.error('Error auto-marking chat notifications as read:', err);
            });
            return;
          }
        }

        // Check if notification already exists to avoid duplicates
        setNotifications((prev) => {
          const notificationId = notification._id || notification.id;
          const exists = prev.some((n: any) => 
            (n._id || n.id) === notificationId
          );
          if (exists) return prev;
          
          // Add new notification at the beginning
          const updated = [notification, ...prev];
          return updated.slice(0, 50); // Keep only last 50
        });

        setUnreadCount((prev) => prev + 1);

        // Show push notification (with error handling)
        try {
          schedulePushNotification(notification);
        } catch (error) {
          console.error('Error scheduling push notification:', error);
          // Continue even if notification display fails
        }
      }

      // Also refresh from API to ensure consistency
      fetchNotifications();
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socketRef.current = socket;

    return () => {
      const userId = user._id || (user as any).id;
      if (userId) {
        socket.emit('leave_user', userId);
      }
      socket.close();
    };
  }, [isAuthenticated, user]);

  // Track active chat (from chat screen) so same-chat notifications can be ignored/auto-read.
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

  // Fetch notifications on mount only
  useEffect(() => {
    if (isAuthenticated && user?._id) {
      fetchNotifications();
    }
  }, [isAuthenticated, user]);

  // Setup notification listeners
  useEffect(() => {
    if (isExpoGoAndroid) {
      return;
    }

    try {
      (async () => {
        const Notifications = await getNotificationsModule();
        if (!Notifications) return;

        // Listen for notifications received while app is in foreground
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
          console.log('Notification received:', notification);
          fetchNotifications();
        });

        // Listen for user tapping on notification
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
          console.log('Notification tapped:', response);
          const data = response.notification.request.content.data;
          void data;
        });
      })();
    } catch (error) {
      console.error('Error setting up notification listeners:', error);
      // Continue without listeners if setup fails
    }

    return () => {
      try {
        if (notificationListener.current) {
          notificationListener.current.remove();
        }
        if (responseListener.current) {
          responseListener.current.remove();
        }
      } catch (error) {
        console.error('Error removing notification listeners:', error);
      }
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await apiRequest(`/notification/${notificationId}/read`, {
        method: 'PUT',
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === notificationId || n._id === notificationId) ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await apiRequest('/notification/read-all', {
        method: 'PUT',
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Mark chat message notifications as read (optimistic update + API call)
  const markChatMessagesAsRead = async (otherUserId: string) => {
    try {
      // Count unread message notifications for this user before updating
      let unreadCountToSubtract = 0;
      
      // Optimistically update local state immediately
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (n.type === 'message' && 
              (n.id_sender?._id === otherUserId || 
               n.id_sender?.id === otherUserId || 
               n.id_sender === otherUserId) &&
              !n.is_read) {
            unreadCountToSubtract++;
            return { ...n, is_read: true };
          }
          return n;
        });
        return updated;
      });
      
      // Update unread count optimistically
      if (unreadCountToSubtract > 0) {
        setUnreadCount((prev) => Math.max(0, prev - unreadCountToSubtract));
      }

      // Then call API to mark as read on backend
      await apiRequest(`/notification/read-chat-messages/${otherUserId}`, {
        method: 'PUT',
      });
      
      // Refresh from API to ensure consistency
      await fetchNotifications();
    } catch (error) {
      console.error('Error marking chat messages as read:', error);
      // On error, refresh from API to get correct state
      await fetchNotifications();
    }
  };

  // Helper function to mark message notifications as read for a specific user (optimistic only)
  const markMessageNotificationsAsReadForUser = (otherUserId: string) => {
    // Optimistically update local state immediately
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.type === 'message' && 
            (n.id_sender?._id === otherUserId || 
             n.id_sender?.id === otherUserId || 
             n.id_sender === otherUserId) &&
            !n.is_read) {
          return { ...n, is_read: true };
        }
        return n;
      })
    );
    
    // Update unread count optimistically
    setUnreadCount((prev) => {
      const messageNotificationsForUser = notifications.filter(
        (n) => n.type === 'message' && 
               (n.id_sender?._id === otherUserId || 
                n.id_sender?.id === otherUserId || 
                n.id_sender === otherUserId) &&
               !n.is_read
      ).length;
      return Math.max(0, prev - messageNotificationsForUser);
    });
  };

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    markChatMessagesAsRead,
    markMessageNotificationsAsReadForUser,
  };
}

async function schedulePushNotification(notification: Notification) {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.id_sender?.name || 
               notification.id_sender?.firstName || 
               'Nouvelle notification',
        body: notification.message,
        data: {
          notificationId: notification.id || notification._id,
          type: notification.type,
          carId: notification.carId,
          senderId: notification.id_sender?._id || notification.id_sender?.id,
        },
        sound: true,
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('Error scheduling notification:', error);
    // Don't throw - continue even if notification fails
  }
}

async function registerForPushNotificationsAsync() {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) {
      if (isExpoGoAndroid) {
        console.log('Expo Go Android detected (SDK 53+): remote push registration skipped.');
      }
      return null;
    }

    let token;

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
        // Continue even if channel setup fails
      }
    }

    let finalStatus;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (permissionError) {
      console.error('Error getting notification permissions:', permissionError);
      return null; // Return early if we can't get permissions
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }
    
    try {
      // Get Expo Push Token with project configuration
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'b95545e2-f0c9-4012-a8e3-975beeef796a', // From app.json eas.projectId
      });
      token = tokenData.data;
      console.log('Push notification token:', token);
      
      // Send token to backend to store for user
      // This allows backend to send push notifications even when app is closed
      try {
        const authToken = await AsyncStorage.getItem('auth_token');
        if (authToken) {
          const backendUrl = getBackendUrl();
          const response = await fetch(`${backendUrl}/api/user/push-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({ 
              pushToken: token,
              platform: Platform.OS,
              deviceId: Device.modelName || Device.deviceName || 'unknown',
            }),
          });
          
          if (response.ok) {
            console.log('Push token saved to backend successfully');
          } else {
            const errorText = await response.text();
            console.error('Failed to save push token to backend:', errorText);
          }
        } else {
          console.log('No auth token available, will retry after login');
        }
      } catch (saveError) {
        console.error('Error saving push token:', saveError);
        // Don't throw - continue even if save fails
      }
    } catch (tokenError: any) {
      // Handle Firebase error gracefully on Android
      if (tokenError?.message?.includes('FirebaseApp') || tokenError?.message?.includes('FCM')) {
        console.warn('⚠️  Firebase not configured. Push notifications will work via Socket.IO when app is open.');
        console.warn('   To enable push notifications when app is closed, configure Firebase:');
        console.warn('   1. Create Firebase project');
        console.warn('   2. Download google-services.json');
        console.warn('   3. Place it in app_car/');
        console.warn('   4. Rebuild APK');
        return null;
      }
      console.error('Error getting push token:', tokenError);
      return null;
    }
    
    return token;
  } catch (error) {
    console.error('Unexpected error in registerForPushNotificationsAsync:', error);
    return null; // Always return something to prevent crash
  }
}
