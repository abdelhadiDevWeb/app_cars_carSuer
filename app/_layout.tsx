import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { NotificationBanner } from '@/components/NotificationBanner';

export const unstable_settings = {
  initialRouteName: 'splash',
};

// Component to handle navigation based on auth state
function NavigationHandler() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inSplashGroup = segments[0] === 'splash';
    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!isAuthenticated) {
      // If not authenticated and not already on splash/login/register, go to splash
      if (!inSplashGroup && !inAuthGroup && !inTabsGroup) {
        router.replace('/splash');
      }
    } else {
      // If authenticated and on splash, go to tabs
      if (inSplashGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, isLoading, segments, router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
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
          <StatusBar style="auto" />
        </ThemeProvider>
      </ChatProvider>
    </AuthProvider>
  );
}
