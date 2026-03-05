import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Platform, PanResponder, DeviceEventEmitter } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useRouter, useSegments, usePathname } from 'expo-router';
import { apiRequest } from '@/utils/backend';
import { scale, getPadding, getFontSizes } from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function NotificationBanner() {
  const { isAuthenticated } = useAuth();
  const { isViewingChat } = useChat();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const translateY = useSharedValue(-150);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const [isVisible, setIsVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if we're on the messages/chat page
  const isOnMessagesPage = segments.includes('chat') || pathname?.includes('/chat') || pathname?.includes('messages');

  // Get the latest unread notification
  // Show message notifications in banner on all pages (they're excluded from bell badge)
  const latestUnread = notifications.find((n) => !n.is_read);
  const latestUnreadId = latestUnread?.id || latestUnread?._id || '';

  // Track the last notification ID we showed (in memory)
  const lastShownNotificationIdRef = useRef<string>('');
  // Track all shown notification IDs (persisted in AsyncStorage)
  const [shownNotificationIds, setShownNotificationIds] = React.useState<Set<string>>(new Set());
  const shownNotificationIdsRef = useRef<Set<string>>(new Set());

  // Load shown notification IDs from AsyncStorage on mount
  useEffect(() => {
    const loadShownIds = async () => {
      try {
        const stored = await AsyncStorage.getItem('shownNotificationIds');
        if (stored) {
          const ids = new Set(JSON.parse(stored));
          shownNotificationIdsRef.current = ids;
          setShownNotificationIds(ids);
        }
      } catch (error) {
        console.error('Error loading shown notification IDs:', error);
      }
    };
    if (isAuthenticated) {
      loadShownIds();
    }
  }, [isAuthenticated]);

  // Save shown notification IDs to AsyncStorage
  const saveShownNotificationId = React.useCallback(async (notificationId: string) => {
    try {
      shownNotificationIdsRef.current.add(notificationId);
      setShownNotificationIds(new Set(shownNotificationIdsRef.current));
      const idsArray = Array.from(shownNotificationIdsRef.current);
      // Keep only last 100 notification IDs to prevent storage bloat
      const trimmedIds = idsArray.slice(-100);
      await AsyncStorage.setItem('shownNotificationIds', JSON.stringify(trimmedIds));
      shownNotificationIdsRef.current = new Set(trimmedIds);
    } catch (error) {
      console.error('Error saving shown notification ID:', error);
    }
  }, []);

  const hideBanner = React.useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setDismissed(true);
    setIsVisible(false);
    translateY.value = withTiming(-150, { duration: 300 });
    translateX.value = withTiming(0, { duration: 300 });
    opacity.value = withTiming(0, { duration: 300 });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    
    // Hide banner if viewing a chat
    if (isViewingChat) {
      if (isVisible) {
        hideBanner();
      }
      return;
    }
    
    // Show banner when NOT viewing a chat and we have unread notifications
    // Check if we have a new unread notification that hasn't been shown before
    // Note: latestUnread is already filtered to exclude message notifications when on messages page
    const hasNewNotification = latestUnread && 
      latestUnreadId !== lastShownNotificationIdRef.current &&
      !shownNotificationIdsRef.current.has(latestUnreadId);
    
    if (hasNewNotification) {
      // Reset dismissed state for new notification (even if it was previously dismissed)
      setDismissed(false);
      setIsVisible(true);
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 100,
      });
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: 300 });
      
      // Update the last shown notification ID
      lastShownNotificationIdRef.current = latestUnreadId;
      // Save to AsyncStorage so it persists across page navigations
      saveShownNotificationId(latestUnreadId);
      
      // If it's a message notification and we're NOT on messages page, refresh chats data
      // This will update the Messages tab badge immediately
      if (latestUnread.type === 'message' && !isOnMessagesPage) {
        // Emit event to trigger immediate refresh in tab layout
        DeviceEventEmitter.emit('refreshChats');
      }
      
      // Clear any existing timer
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
      
      // Auto-dismiss after exactly 5 seconds
      autoDismissTimerRef.current = setTimeout(() => {
        hideBanner();
        // Reset dismissed state after 5 seconds to allow new notifications
        setTimeout(() => {
          setDismissed(false);
        }, 5000);
      }, 5000);
    } else if (latestUnread && !dismissed && latestUnreadId === lastShownNotificationIdRef.current && isVisible) {
      // Same notification is still showing, ensure timer is running
      if (!autoDismissTimerRef.current) {
        autoDismissTimerRef.current = setTimeout(() => {
          hideBanner();
          setTimeout(() => {
            setDismissed(false);
          }, 5000);
        }, 5000);
      }
    } else if (unreadCount === 0 || !latestUnread) {
      // No unread notifications, hide banner
      hideBanner();
      lastShownNotificationIdRef.current = '';
    } else if (latestUnread && shownNotificationIdsRef.current.has(latestUnreadId)) {
      // Notification was already shown before, don't show it again
      // Just hide the banner if it's visible
      if (isVisible) {
        hideBanner();
      }
    }

    // Don't clear timer in cleanup - let it run to completion
    // Only clear when explicitly needed (new notification, hide banner, etc.)
  }, [unreadCount, latestUnreadId, isAuthenticated, hideBanner, isViewingChat, latestUnread, dismissed, isVisible, isOnMessagesPage, saveShownNotificationId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Clear auto-dismiss timer when user starts dragging
        if (autoDismissTimerRef.current) {
          clearTimeout(autoDismissTimerRef.current);
          autoDismissTimerRef.current = null;
        }
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.value = gestureState.dx;
        translateY.value = gestureState.dy;
        // Fade out as user drags
        const distance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        opacity.value = Math.max(0, 1 - distance / 200);
      },
      onPanResponderRelease: (_, gestureState) => {
        const distance = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        const velocity = Math.sqrt(gestureState.vx ** 2 + gestureState.vy ** 2);
        
        // If dragged more than 50px or with velocity > 0.5, hide it
        if (distance > 50 || velocity > 0.5) {
          translateY.value = withTiming(-200, { duration: 300 });
          translateX.value = withTiming(gestureState.dx > 0 ? 400 : -400, { duration: 300 });
          opacity.value = withTiming(0, { duration: 300 }, () => {
            runOnJS(setDismissed)(true);
            runOnJS(setIsVisible)(false);
            setTimeout(() => runOnJS(setDismissed)(false), 5000);
          });
        } else {
          // Spring back to original position
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          opacity.value = withTiming(1, { duration: 300 });
          // Restart auto-dismiss timer if banner is still visible
          const currentLatestUnread = notifications.find((n) => !n.is_read);
          if (unreadCount > 0 && currentLatestUnread && !dismissed) {
            autoDismissTimerRef.current = setTimeout(() => {
              hideBanner();
              setTimeout(() => setDismissed(false), 5000);
            }, 5000);
          }
        }
      },
    })
  ).current;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: opacity.value,
  }));

  const handlePress = async () => {
    if (latestUnread) {
      const notificationId = latestUnread.id || latestUnread._id || '';
      if (!latestUnread.is_read && notificationId) {
        await markAsRead(notificationId);
      }

      // Hide banner immediately
      hideBanner();
      setTimeout(() => setDismissed(false), 5000);

      // Navigate based on notification type
      if (latestUnread.type === 'message') {
        // Navigate to messages page with the specific chat
        router.push(`/(tabs)/chat?userId=${latestUnread.id_sender?._id || latestUnread.id_sender?.id || latestUnread.id_sender}`);
      } else if (
        latestUnread.type === 'done_rdv_workshop' ||
        latestUnread.type === 'cancel_rdv_workshop' ||
        latestUnread.type === 'rdv_workshop' ||
        latestUnread.type === 'accept_rdv' ||
        latestUnread.message?.toLowerCase().includes('rendez-vous') ||
        latestUnread.message?.toLowerCase().includes('rdv')
      ) {
        router.push('/(tabs)/cars');
      } else if (latestUnread.type === 'car_price_warning' && latestUnread.carId) {
        router.push(`/car/${latestUnread.carId}`);
      } else {
        router.push('/(tabs)');
      }
    }
  };

  const handleDismiss = () => {
    hideBanner();
    setTimeout(() => setDismissed(false), 5000);
  };

  // Don't show banner if:
  // - Not authenticated
  // - Not visible
  // - No unread notification
  // - Viewing a chat between two users
  // Note: We already filter out message notifications when on messages page in latestUnread
  if (!isAuthenticated || !isVisible || !latestUnread || isViewingChat) {
    return null;
  }

  // Get sender name - prioritize firstName + lastName, then firstName, then name, never show 'Système'
  const senderName = (() => {
    if (latestUnread.id_sender?.firstName && latestUnread.id_sender?.lastName) {
      return `${latestUnread.id_sender.firstName} ${latestUnread.id_sender.lastName}`;
    }
    if (latestUnread.id_sender?.firstName) {
      return latestUnread.id_sender.firstName;
    }
    if (latestUnread.id_sender?.name) {
      return latestUnread.id_sender.name;
    }
    // Don't show "Système" - return empty string or a generic message
    return '';
  })();

  return (
    <Animated.View style={[styles.container, animatedStyle]} pointerEvents="box-none">
      <Animated.View style={styles.banner} {...panResponder.panHandlers}>
        <AnimatedTouchableOpacity
          onPress={handlePress}
          activeOpacity={0.9}
          style={styles.bannerContent}
        >
        <LinearGradient
          colors={['#0d9488', '#14b8a6', '#2dd4bf']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <IconSymbol 
                name={latestUnread.type === 'message' ? "message.fill" : "bell.fill"} 
                size={scale(20)} 
                color="#ffffff" 
              />
            </View>
            <View style={styles.textContainer}>
              {senderName ? (
                <ThemedText style={styles.sender} numberOfLines={1}>
                  {senderName}
                </ThemedText>
              ) : null}
              <ThemedText style={styles.message} numberOfLines={2}>
                {latestUnread.message}
              </ThemedText>
            </View>
            <TouchableOpacity
              onPress={handleDismiss}
              style={styles.dismissButton}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={scale(16)} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
        </AnimatedTouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: scale(60),
    left: 0,
    right: 0,
    zIndex: 9999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  banner: {
    width: '100%',
  },
  bannerContent: {
    width: '100%',
    flex: 1,
  },
  gradient: {
    paddingTop: padding.medium,
    paddingBottom: padding.medium,
    paddingHorizontal: padding.medium,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.medium,
  },
  iconContainer: {
    position: 'relative',
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: scale(-6),
    right: scale(-6),
    backgroundColor: '#ef4444',
    borderRadius: scale(11),
    minWidth: scale(22),
    height: scale(22),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(4),
    borderWidth: scale(2.5),
    borderColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: fontSizes.xs,
    includeFontPadding: false,
    textAlignVertical: 'center',
    width: '100%',
    letterSpacing: 0.2,
  },
  textContainer: {
    flex: 1,
    gap: scale(2),
  },
  sender: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#ffffff',
  },
  message: {
    fontSize: fontSizes.xs,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    lineHeight: fontSizes.sm * 1.3,
  },
  dismissButton: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
