import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
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
import { useAuth } from '@/contexts/AuthContext';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';

const { width, height } = Dimensions.get('window');
const padding = getPadding();
const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  
  // Animation values
  const logoScale = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(30);
  const buttonScale = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const backgroundRotation = useSharedValue(0);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, router]);

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

    // Button animation (after title)
    buttonOpacity.value = withDelay(800, withTiming(1, { duration: 600 }));
    buttonScale.value = withDelay(800, withSpring(1, {
      damping: 12,
      stiffness: 100,
    }));
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

  const handleStartPress = () => {
    buttonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    router.replace('/(tabs)');
  };

  // Don't show splash if authenticated or still loading
  if (isLoading || isAuthenticated) {
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
          entering={FadeIn.duration(1000)}
          style={[styles.logoContainer, logoAnimatedStyle]}
        >
          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/carsure.jpeg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View
          entering={FadeInDown.duration(800).delay(400).springify()}
          style={[styles.titleContainer, titleAnimatedStyle]}
        >
          <ThemedText style={styles.title}>Bienvenue sur CarSure</ThemedText>
          <ThemedText style={styles.subtitle}>
            Votre plateforme de confiance pour l'achat et la vente de véhicules
          </ThemedText>
        </Animated.View>

        {/* Start Button */}
        <AnimatedTouchableOpacity
          entering={FadeInUp.duration(800).delay(800).springify()}
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
            <ThemedText style={styles.buttonText}>Commencer</ThemedText>
          </LinearGradient>
        </AnimatedTouchableOpacity>
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
  },
  logoWrapper: {
    width: scale(200),
    height: scale(200),
    borderRadius: scale(24),
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 4,
    borderColor: '#f0fdfa',
    overflow: 'hidden',
  },
  logo: {
    width: scale(160),
    height: scale(160),
    borderRadius: scale(20),
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
});
