import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  TouchableOpacity,
  View,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { NotificationBanner } from '@/components/NotificationBanner';
import { LanguageProvider } from '@/contexts/LanguageContext';
import '@/utils/i18n';
import { LanguageFloatingButton } from '@/components/LanguageFloatingButton';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/utils/i18n';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiRequest } from '@/utils/backend';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTranslation } from 'react-i18next';

// Keep the native splash screen visible until we decide the app is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  initialRouteName: 'splash',
};

// Component to handle navigation based on auth state
function NavigationHandler() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Admins are web-only; clear session whenever an admin JWT is present so the app never stays “logged in”.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (user?.type === 'user' && user?.role === 'admin') {
      void (async () => {
        try {
          await AsyncStorage.setItem('admin_web_only_notice', '1');
        } catch {
          /* ignore */
        }
        await logout();
        router.replace('/login');
      })();
    }
  }, [isAuthenticated, isLoading, user?.type, user?.role, router, logout]);

  useEffect(() => {
    if (isLoading) return;

    try {
    const inSplashGroup = segments[0] === 'splash';
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';
    const inTabsGroup = segments[0] === '(tabs)';
    const inPublicCarDetails = segments[0] === 'car';

    // Splash screen handles its own routing (subscription check + visitor entry).
    // Avoid double redirects that can cause the splash to appear twice.
    if (inSplashGroup) return;

    if (!isAuthenticated) {
      // Keep public access for tabs and car details when not authenticated.
      if (!inSplashGroup && !inAuthGroup && !inTabsGroup && !inPublicCarDetails) {
        router.replace('/splash');
      }
    } else {
      // If authenticated, allow navigation as-is (splash will redirect when needed).
      }
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback to splash if navigation fails
      if (segments[0] !== 'splash') {
        try {
          router.replace('/splash');
        } catch (fallbackError) {
          console.error('Fallback navigation error:', fallbackError);
        }
      }
    }
  }, [isAuthenticated, isLoading, segments, router]);

  return null;
}

function SplashGate() {
  const { isLoading } = useAuth();
  const { isReady } = useLanguage();

  useEffect(() => {
    if (!isReady) return;
    if (isLoading) return;
    const id = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 50);
    return () => clearTimeout(id);
  }, [isReady, isLoading]);

  return null;
}

function ForegroundRefreshAndSubscriptionGuard() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { isReady } = useLanguage();
  const router = useRouter();
  const { t, i18n: i18nHook } = useTranslation();
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!isReady) return;

    const checkSubscription = async () => {
      if (checkingRef.current) return;
      if (!isAuthenticated || isLoading) return;
      // Same rule as server requireSeller: only normal clients need this route; workshops/admins get 403 and must not be treated as "expired".
      const isSellerClient = user?.type === 'user' && user?.role !== 'admin';
      if (!isSellerClient) return;

      checkingRef.current = true;
      try {
        const res = await apiRequest('/abonnement/my-subscription');
        if (res.status === 401) {
          return;
        }
        if (!res.ok) {
          return;
        }
        const data = await res.json().catch(() => null);
        const now = Date.now();
        const isExpired =
          !data?.ok ||
          !data?.hasSubscription ||
          !data?.subscription?.date_end ||
          new Date(data.subscription.date_end).getTime() < now;

        if (isExpired) {
          setShowExpiredModal(true);
          // Best-effort server-side status updates (ignore failures)
          try {
            await apiRequest('/auth/profile', {
              method: 'PUT',
              body: JSON.stringify({ status: false }),
            });
          } catch {}
          try {
            await apiRequest('/abonnement/deactivate', { method: 'POST' });
          } catch {}
        }
      } catch {
        // ignore: keep app usable if backend is temporarily unreachable
      } finally {
        checkingRef.current = false;
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Tell screens to refresh their data
        DeviceEventEmitter.emit('appForeground');
        // Re-check subscription
        void checkSubscription();
      }
    });

    return () => sub.remove();
  }, [isAuthenticated, isLoading, isReady, user?.type, user?.role]);

  if (!showExpiredModal) return null;

  return (
    <View style={stylesSub.modalOverlay}>
      <View key={i18nHook.language} style={stylesSub.modalCardWrapper}>
        <LinearGradient colors={['#ffffff', '#f8fafc']} style={stylesSub.modalCard}>
          <View style={stylesSub.modalIconContainer}>
            <LinearGradient colors={['#f59e0b', '#d97706']} style={stylesSub.modalIconGradient}>
              <IconSymbol name="exclamationmark.triangle.fill" size={28} color="#ffffff" />
            </LinearGradient>
          </View>
          <ThemedText style={stylesSub.modalTitle}>{t('subscription.expiredTitle')}</ThemedText>
          <ThemedText style={stylesSub.modalText}>{t('subscription.expiredContactBody')}</ThemedText>
          <TouchableOpacity
            onPress={async () => {
              try {
                await logout();
              } finally {
                setShowExpiredModal(false);
                router.replace('/(tabs)');
              }
            }}
            activeOpacity={0.9}
            style={stylesSub.modalButton}
          >
            <LinearGradient colors={['#0d9488', '#14b8a6']} style={stylesSub.modalButtonGradient}>
              <IconSymbol name="arrow.right.circle.fill" size={18} color="#ffffff" />
              <ThemedText style={stylesSub.modalButtonText}>{t('common.ok')}</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const inSplash = segments[0] === 'splash';

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <AuthProvider>
          <NotificationProvider>
            <SplashGate />
            <ForegroundRefreshAndSubscriptionGuard />
            <ChatProvider>
              <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <NavigationHandler />
                <Stack>
                  <Stack.Screen name="splash" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="login" options={{ headerShown: false }} />
                  <Stack.Screen name="register" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                </Stack>
                <NotificationBanner />
                {/* Language button placement:
                    - On splash: show in header (top-right)
                    - On other pages: show above bottom navigation (bottom-right) */}
                {inSplash ? (
                  <LanguageFloatingButton position="top-right" variant="icon" />
                ) : (
                  <LanguageFloatingButton position="bottom-right" bottomOffset={0} variant="icon" />
                )}
                <StatusBar style="auto" />
              </ThemeProvider>
            </ChatProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </I18nextProvider>
  );
}

const stylesSub = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 99999,
    elevation: 99999,
  },
  modalCardWrapper: {
    width: '100%',
    maxWidth: 420,
    zIndex: 100000,
    elevation: 100000,
  },
  modalCard: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalIconGradient: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 22,
  },
  modalButton: {
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
