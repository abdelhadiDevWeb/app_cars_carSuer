import { Tabs } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Platform, StyleSheet, View, Text, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { apiRequest } from '@/utils/backend';
import { scale } from '@/utils/responsive';

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
  const { notifications } = useNotifications();
  const [chats, setChats] = useState<any[]>([]);
  
  // Fetch chats to get unread message count
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const fetchChats = async () => {
        try {
          const response = await apiRequest('/chat/my-chats');
          if (response.ok) {
            const data = await response.json();
            if (data.ok && data.chats) {
              setChats(data.chats);
            }
          }
        } catch (error) {
          console.error('Error fetching chats for badge:', error);
        }
      };
      fetchChats();
      
      // Listen for custom event to refresh chats immediately (from NotificationBanner or chat page)
      const subscription = DeviceEventEmitter.addListener('refreshChats', (updatedChats?: any[]) => {
        if (updatedChats && Array.isArray(updatedChats)) {
          // If chats data is provided, update immediately (real-time)
          setChats(updatedChats);
        } else {
          // Otherwise, fetch from API
          fetchChats();
        }
      });
      
      // Refresh chats periodically to update badge
      const interval = setInterval(fetchChats, 5000);
      
      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }
  }, [isAuthenticated, isLoading]);
  
  // Count chats with unread messages (show 1 per chat, not total count)
  const unreadMessagesCount = chats.filter((chat) => (chat.unreadCount || 0) > 0).length;

  // Don't render tabs until auth state is loaded
  if (isLoading) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0d9488',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          borderTopWidth: 0,
          // Fixed height to ensure consistency across all pages
          height: Platform.OS === 'ios' 
            ? Math.max(60 + insets.bottom, 70) // Minimum 70px on iOS
            : 70, // Fixed 70px on Android
          paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 12,
          paddingTop: 8,
          paddingHorizontal: 12,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          // Ensure consistent styling
          elevation: Platform.OS === 'android' ? 20 : 0,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -6 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
            },
            android: {
              elevation: 20,
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
          title: 'Accueil',
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
          title: 'FAQ',
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
          title: 'Voitures',
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
          title: 'Ateliers',
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
          title: 'Scanner',
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
          title: 'Messages',
          href: isAuthenticated ? undefined : null, // Hide when NOT authenticated
          tabBarIcon: ({ focused }) => (
            <View style={{ position: 'relative' }}>
              <AnimatedTabIcon
                focused={focused}
                iconName="message"
                activeIconName="message.fill"
              />
              {unreadMessagesCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
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
          title: 'Profil',
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
