import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/utils/backend';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');
const padding = getPadding();
const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);
  
  // Animation values
  const logoScale = useSharedValue(1);
  const logoOpacity = useSharedValue(1);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(30);
  const buttonScale = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const backgroundRotation = useSharedValue(0);

  // Visitor splash flow: show Start button after a short delay (no auto navigation).
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setShowStartButton(false);
      const id = setTimeout(() => setShowStartButton(true), 600);
      return () => clearTimeout(id);
    }
  }, [isAuthenticated, isLoading]);

  // Redirect if already authenticated (after subscription check)
  useEffect(() => {
    const checkAndRoute = async () => {
      if (isLoading || !isAuthenticated) return;
      try {
        const res = await apiRequest('/abonnement/my-subscription');
        const data = await res.json().catch(() => null);
        const now = Date.now();
        const isExpired =
          !res.ok ||
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
          return;
        }
        router.replace('/(tabs)');
      } catch (e) {
        // If check fails, still allow into app (or choose to block)
        router.replace('/(tabs)');
      }
    };
    checkAndRoute();
  }, [isAuthenticated, isLoading, router, logout]);

  // Start animations on mount
  useEffect(() => {
    // Background rotation animation (continuous)
    backgroundRotation.value = withTiming(360, {
      duration: 20000,
      repeat: Infinity,
    });

    // Logo animation sequence
    logoOpacity.value = withTiming(1, { duration: 800 });
    logoScale.value = withSpring(1, {
      damping: 12,
      stiffness: 100,
    });

    // Title animation (after logo)
    titleOpacity.value = withDelay(400, withTiming(1, { duration: 600 }));
    titleTranslateY.value = withDelay(400, withSpring(0, {
      damping: 15,
      stiffness: 100,
    }));

    // Button animation (we trigger visibility with state; animation starts from 0)
    buttonOpacity.value = withTiming(0, { duration: 0 });
    buttonScale.value = withTiming(0, { duration: 0 });
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const backgroundAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${backgroundRotation.value}deg` }],
  }));

  useEffect(() => {
    if (!showStartButton) return;
    buttonOpacity.value = withTiming(1, { duration: 350 });
    buttonScale.value = withSpring(1, { damping: 12, stiffness: 120 });
  }, [showStartButton, buttonOpacity, buttonScale]);

  const handleStartPress = () => {
    try {
      buttonScale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withSpring(1, { damping: 10, stiffness: 300 })
      );
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error navigating to tabs:', error);
    }
  };

  // While auth is loading, render nothing to avoid showing splash briefly for connected users.
  if (isLoading) return null;

  // Don't show splash if authenticated (will redirect) - but show logo during redirect
  if (isAuthenticated) {
    // If subscription expired: show ONLY the modal and block navigation until OK is pressed.
    if (showExpiredModal) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" />
          <View style={styles.modalOverlay}>
            <Animated.View entering={FadeInDown.duration(250).springify()} style={styles.modalCardWrapper}>
              <LinearGradient key={i18n.language} colors={['#ffffff', '#f8fafc']} style={styles.modalCard}>
                <View style={styles.modalIconContainer}>
                  <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.modalIconGradient}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={28} color="#ffffff" />
                  </LinearGradient>
        </View>
                <ThemedText style={styles.modalTitle}>
                  {t('subscription.expiredTitle') || 'Subscription expired'}
                </ThemedText>
                <ThemedText style={styles.modalText}>
                  {t('subscription.expiredBody') || 'Your subscription has expired.'}
                </ThemedText>
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
                  style={styles.modalButton}
                >
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.modalButtonGradient}>
                    <IconSymbol name="arrow.right.circle.fill" size={18} color="#ffffff" />
                    <ThemedText style={styles.modalButtonText}>{t('common.ok')}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
    }

    // Authenticated + not expired: route happens in effect -> render nothing to avoid "double splash".
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      
      {/* Animated Background Gradient Circles */}
      <View style={styles.backgroundContainer}>
        <Animated.View style={[styles.gradientCircle1, backgroundAnimatedStyle]}>
          <LinearGradient
            colors={['rgba(13, 148, 136, 0.15)', 'rgba(20, 184, 166, 0.1)', 'transparent']}
            style={styles.gradientCircle1Inner}
          />
        </Animated.View>
        <Animated.View style={[styles.gradientCircle2, backgroundAnimatedStyle]}>
          <LinearGradient
            colors={['rgba(20, 184, 166, 0.12)', 'rgba(13, 148, 136, 0.08)', 'transparent']}
            style={styles.gradientCircle2Inner}
          />
        </Animated.View>
        <Animated.View style={[styles.gradientCircle3, backgroundAnimatedStyle]}>
          <LinearGradient
            colors={['rgba(13, 148, 136, 0.1)', 'rgba(20, 184, 166, 0.15)', 'transparent']}
            style={styles.gradientCircle3Inner}
          />
        </Animated.View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo */}
        <Animated.View
          style={[styles.logoContainer, logoAnimatedStyle]}
        >
          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/carsure.jpeg')}
              style={styles.logo}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              onError={(error) => {
                console.error('Error loading logo:', error);
              }}
            />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View
          entering={FadeInDown.duration(800).delay(400).springify()}
          style={[styles.titleContainer, titleAnimatedStyle]}
        >
          <ThemedText style={styles.title}>{t('splash.title')}</ThemedText>
          <ThemedText style={styles.subtitle}>
            {t('splash.subtitle')}
          </ThemedText>
        </Animated.View>

        {/* Start Button (visitor only) */}
        {!isAuthenticated && showStartButton ? (
        <AnimatedTouchableOpacity
            entering={FadeInUp.duration(700).springify()}
          style={[styles.buttonContainer, buttonAnimatedStyle]}
          onPress={handleStartPress}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#0d9488', '#14b8a6', '#2dd4bf']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
              <ThemedText style={styles.buttonText}>{t('splash.start')}</ThemedText>
          </LinearGradient>
        </AnimatedTouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -width * 0.3,
    right: -width * 0.2,
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
  },
  gradientCircle1Inner: {
    width: '100%',
    height: '100%',
    borderRadius: width * 0.6,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -width * 0.4,
    left: -width * 0.3,
    width: width * 1.4,
    height: width * 1.4,
    borderRadius: width * 0.7,
  },
  gradientCircle2Inner: {
    width: '100%',
    height: '100%',
    borderRadius: width * 0.7,
  },
  gradientCircle3: {
    position: 'absolute',
    top: height * 0.3,
    left: -width * 0.2,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
  },
  gradientCircle3Inner: {
    width: '100%',
    height: '100%',
    borderRadius: width * 0.4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: padding.horizontal,
    zIndex: 1,
  },
  logoContainer: {
    marginBottom: padding.large * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: scale(280),
    height: scale(280),
    borderRadius: scale(24),
    overflow: 'hidden',
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: padding.large * 2,
    paddingHorizontal: padding.large,
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: padding.small,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: fontSizes.lg * 1.5,
    paddingHorizontal: padding.medium,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: scale(320),
    borderRadius: scale(16),
    overflow: 'hidden',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: padding.large,
    paddingHorizontal: padding.large * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: padding.horizontal,
    zIndex: 9999,
    elevation: 9999,
  },
  modalCardWrapper: {
    width: '100%',
    maxWidth: scale(420),
    zIndex: 10000,
    elevation: 10000,
  },
  modalCard: {
    borderRadius: 20,
    paddingVertical: padding.large,
    paddingHorizontal: padding.large,
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
    marginBottom: padding.medium,
  },
  modalIconGradient: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: padding.small,
  },
  modalText: {
    fontSize: fontSizes.md,
    color: '#334155',
    textAlign: 'center',
    marginBottom: padding.large,
  },
  modalButton: {
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(18),
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
