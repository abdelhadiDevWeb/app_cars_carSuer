// ============================================
// NOTIFICATIONS HOOK - COMMENTED FOR EXPO GO
// When ready to enable push notifications, uncomment this code
// ============================================

import { useEffect, useRef, useState } from 'react';
// import { Platform } from 'react-native';
// import * as Notifications from 'expo-notifications';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getBackendUrl } from '@/utils/backend';

// Configure notification handler
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//   }),
// });

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
  // const notificationListener = useRef<any>(null);
  // const responseListener = useRef<any>(null);

  // Request notification permissions and register for push notifications
  // useEffect(() => {
  //   registerForPushNotificationsAsync();
  // }, []);

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

        // Show push notification
        // schedulePushNotification(notification); // COMMENTED FOR EXPO GO
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

  // Fetch notifications on mount only
  useEffect(() => {
    if (isAuthenticated && user?._id) {
      fetchNotifications();
    }
  }, [isAuthenticated, user]);

  // Setup notification listeners
  // useEffect(() => {
  //   // Listen for notifications received while app is in foreground
  //   notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
  //     console.log('Notification received:', notification);
  //     // Refresh notifications when a push notification is received
  //     fetchNotifications();
  //   });

  //   // Listen for user tapping on notification
  //   responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
  //     console.log('Notification tapped:', response);
  //     const data = response.notification.request.content.data;
  //     // Handle navigation based on notification data
  //     // This will be handled by the component using this hook
  //   });

  //   return () => {
  //     if (notificationListener.current) {
  //       Notifications.removeNotificationSubscription(notificationListener.current);
  //     }
  //     if (responseListener.current) {
  //       Notifications.removeNotificationSubscription(responseListener.current);
  //     }
  //   };
  // }, []);

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

// async function schedulePushNotification(notification: Notification) {
//   await Notifications.scheduleNotificationAsync({
//     content: {
//       title: notification.id_sender?.name || 
//              notification.id_sender?.firstName || 
//              'Nouvelle notification',
//       body: notification.message,
//       data: {
//         notificationId: notification.id || notification._id,
//         type: notification.type,
//         carId: notification.carId,
//         senderId: notification.id_sender?._id || notification.id_sender?.id,
//       },
//       sound: true,
//     },
//     trigger: null, // Show immediately
//   });
// }

// async function registerForPushNotificationsAsync() {
//   let token;

//   if (Platform.OS === 'android') {
//     await Notifications.setNotificationChannelAsync('default', {
//       name: 'default',
//       importance: Notifications.AndroidImportance.MAX,
//       vibrationPattern: [0, 250, 250, 250],
//       lightColor: '#FF231F7C',
//     });
//   }

//   const { status: existingStatus } = await Notifications.getPermissionsAsync();
//   let finalStatus = existingStatus;
  
//   if (existingStatus !== 'granted') {
//     const { status } = await Notifications.requestPermissionsAsync();
//     finalStatus = status;
//   }
  
//   if (finalStatus !== 'granted') {
//     console.log('Failed to get push token for push notification!');
//     return;
//   }
  
//   token = (await Notifications.getExpoPushTokenAsync()).data;
//   console.log('Push notification token:', token);
  
//   // TODO: Send token to backend to store for user
//   // This would allow backend to send push notifications even when app is closed
  
//   return token;
// }
