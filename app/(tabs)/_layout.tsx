import { Tabs, useSegments } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  Text,
  DeviceEventEmitter,
  AppState,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { useNotifications } from '@/hooks/useNotifications';
import { apiRequest } from '@/utils/backend';
import { scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';

// Custom animated tab icon component
function AnimatedTabIcon({ 
  focused, 
  iconName, 
  activeIconName 
}: { 
  focused: boolean; 
  iconName: string; 
  activeIconName: string;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(focused ? 1.2 : 1, {
            damping: 12,
            stiffness: 200,
          }),
        },
      ],
    };
  });

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      opacity: withSpring(focused ? 1 : 0, {
        damping: 15,
        stiffness: 150,
      }),
      transform: [
        {
          scale: withSpring(focused ? 1 : 0.8, {
            damping: 15,
            stiffness: 150,
          }),
        },
      ],
    };
  });

  return (
    <View style={styles.iconWrapper}>
      {focused && (
        <Animated.View style={[styles.tabIndicator, indicatorStyle]}>
          <LinearGradient
            colors={['rgba(13, 148, 136, 0.15)', 'rgba(20, 184, 166, 0.1)']}
            style={styles.tabIndicatorGradient}
          />
        </Animated.View>
      )}
      <Animated.View style={animatedStyle}>
        <IconSymbol
          size={26}
          name={focused ? activeIconName : iconName}
          color={focused ? '#0d9488' : '#9ca3af'}
        />
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  const { isViewingChat } = useChat();
  const { notifications } = useNotifications();
  const { t } = useTranslation();
  const segments = useSegments();
  const isOnChatTab = (segments as unknown as string[]).includes('chat');
  // No chats state; badge is driven by notifications from socket
  const screenWidth = Dimensions.get('window').width;
  const targetWidth = Math.round(screenWidth * 0.95);
  const horizontalMargin = Math.max((screenWidth - targetWidth) / 2, 0);
  const [showTabToast, setShowTabToast] = useState(false);
  const [tabToastText, setTabToastText] = useState<string>('');
  const lastNotifCountRef = React.useRef<number>(0);
  const lastUnreadChatsRef = React.useRef<number>(0);
  const suppressChatBadgeRef = React.useRef<boolean>(false);
  const prevIsOnChatTabRef = React.useRef<boolean>(isOnChatTab);
  
  // Unread chat messages count from socket-driven notifications (no polling)
  const unreadMessagesCount = notifications.filter((n: any) => !n.is_read && n.type === 'message').length;
  const effectiveUnreadMessagesCount = suppressChatBadgeRef.current ? 0 : unreadMessagesCount;

  // Show a brief toast above the navigator when a new notification or message arrives
  useEffect(() => {
    const currentNonMsg = notifications.filter((n: any) => !n.is_read && n.type !== 'message').length;
    if (currentNonMsg > (lastNotifCountRef.current || 0)) {
      setTabToastText(t('notifications.title'));
      setShowTabToast(true);
      const id = setTimeout(() => setShowTabToast(false), 2500);
      lastNotifCountRef.current = currentNonMsg;
      return () => clearTimeout(id);
    }
    lastNotifCountRef.current = currentNonMsg;
  }, [notifications, t]);

  useEffect(() => {
    if (effectiveUnreadMessagesCount > (lastUnreadChatsRef.current || 0)) {
      setTabToastText(t('notifications.newMessages') || t('notifications.newMessage') || 'New message');
      setShowTabToast(true);
      const id = setTimeout(() => setShowTabToast(false), 2500);
      lastUnreadChatsRef.current = effectiveUnreadMessagesCount;
      return () => clearTimeout(id);
    }
    lastUnreadChatsRef.current = effectiveUnreadMessagesCount;
  }, [effectiveUnreadMessagesCount, t]);

  // Suppress badge while user is on Chat tab or opens a conversation; resume after leaving
  useEffect(() => {
    // When chat tab is opened, hide badge immediately
    if (isOnChatTab || isViewingChat) {
      suppressChatBadgeRef.current = true;
    } else if (prevIsOnChatTabRef.current && !isOnChatTab) {
      // Left chat tab: allow badge again (it will reflect latest notifications)
      suppressChatBadgeRef.current = false;
    }
    prevIsOnChatTabRef.current = isOnChatTab;
  }, [isOnChatTab, isViewingChat]);

  // Also react to explicit events from chat screen
  useEffect(() => {
    const subOpened = DeviceEventEmitter.addListener('chatOpened', () => {
      suppressChatBadgeRef.current = true;
    });
    const subAllRead = DeviceEventEmitter.addListener('chatAllRead', () => {
      suppressChatBadgeRef.current = true;
    });
    return () => {
      subOpened.remove();
      subAllRead.remove();
    };
  }, []);

  // Broadcast foreground event so screens can refresh data
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        DeviceEventEmitter.emit('appForeground');
      }
    });
    return () => sub.remove();
  }, []);

  // Don't render tabs until auth state is loaded.
  // Keep this after hooks so hook order never changes between renders.
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#0d9488" />
      </View>
    );
  }

  return (
    <>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0d9488',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          ...(isViewingChat ? { display: 'none' } : {}),
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 72 : 68,
          paddingBottom: Platform.OS === 'ios' ? 10 : 8,
          paddingTop: 8,
            paddingLeft: scale(14),
            paddingRight: scale(22),
            // Centered pill inside a full-width area
          position: 'absolute',
          bottom: Platform.OS === 'ios'
              ? Math.max(insets.bottom + scale(16), scale(22))
              : Math.max(insets.bottom + scale(12), scale(18)),
            // Add outer space from the left and right edges
            left: Math.max(insets.left + scale(16), scale(16)),
            right: Math.max(insets.right + scale(16), scale(16)),
          borderRadius: 28,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.14,
              shadowRadius: 18,
            },
            android: {
              elevation: 18,
            },
          }),
        },
        tabBarLabelStyle: {
          display: 'none', // Hide tab labels
        },
        tabBarShowLabel: false, // Hide tab labels
        tabBarItemStyle: {
          paddingVertical: 6,
          borderRadius: 16,
          marginHorizontal: 4,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
      }}>
      {/* Always visible - Home */}
      <Tabs.Screen
        name="index"
        options={{
            title: t('tabs.home'),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="house"
              activeIconName="house.fill"
            />
          ),
        }}
      />
      
      {/* FAQ - Only visible when NOT authenticated */}
      <Tabs.Screen
        name="faq"
        options={{
            title: t('tabs.faq'),
          href: !isAuthenticated ? undefined : null, // Hide when authenticated
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="questionmark.circle"
              activeIconName="questionmark.circle.fill"
            />
          ),
        }}
      />

      {/* Cars - Only visible when authenticated (seller/user) */}
      <Tabs.Screen
        name="cars"
        options={{
            title: t('tabs.cars'),
          href: isAuthenticated ? undefined : null, // Hide when NOT authenticated
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="car"
              activeIconName="car.fill"
            />
          ),
        }}
      />
      
      {/* Workshop Certified - Always visible */}
      <Tabs.Screen
        name="workshop-certified"
        options={{
            title: t('tabs.workshops'),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="shield"
              activeIconName="shield.fill"
            />
          ),
        }}
      />
      
      {/* Scan - Always visible */}
      <Tabs.Screen
        name="scan"
        options={{
            title: t('tabs.scan'),
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="qrcode.viewfinder"
              activeIconName="qrcode.viewfinder"
            />
          ),
        }}
      />

      {/* Chat - Only visible when authenticated */}
      <Tabs.Screen
        name="chat"
        options={{
            title: t('tabs.messages'),
          href: isAuthenticated ? undefined : null, // Hide when NOT authenticated
          tabBarIcon: ({ focused }) => (
            <View style={{ position: 'relative' }}>
              <AnimatedTabIcon
                focused={focused}
                iconName="message"
                activeIconName="message.fill"
              />
              {effectiveUnreadMessagesCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {effectiveUnreadMessagesCount > 9 ? '9+' : effectiveUnreadMessagesCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      
      {/* Profile - Only visible when authenticated */}
      <Tabs.Screen
        name="profile"
        options={{
            title: t('tabs.profile'),
          href: isAuthenticated ? undefined : null, // Hide when NOT authenticated
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              iconName="person"
              activeIconName="person.fill"
            />
          ),
        }}
      />

      {/* Hidden tabs - cars and explore removed */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
      {showTabToast && (
      <View
        style={{
          position: 'absolute',
          bottom:
            (Platform.OS === 'ios'
              ? Math.max(insets.bottom + scale(16), scale(22))
              : Math.max(insets.bottom + scale(12), scale(18))) + (Platform.OS === 'ios' ? 80 : 72),
          left: Math.max(insets.left + scale(24), scale(24)),
          right: Math.max(insets.right + scale(24), scale(24)),
          alignItems: 'center',
        }}
        pointerEvents="none"
      >
        <View
          style={{
            backgroundColor: '#0f172a',
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 999,
            opacity: 0.92,
          }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '800' }}>{tabToastText}</Text>
        </View>
      </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tabIndicatorGradient: {
    width: '100%',
    height: '100%',
  },
  tabBadge: {
    position: 'absolute',
    top: scale(-4),
    right: scale(-4),
    backgroundColor: '#ef4444',
    borderRadius: scale(10),
    minWidth: scale(18),
    height: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(4),
    borderWidth: scale(2),
    borderColor: '#ffffff',
    zIndex: 10,
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
  tabBadgeText: {
    fontSize: scale(10),
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: scale(10),
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
