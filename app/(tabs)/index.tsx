import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolate,
  useAnimatedScrollHandler,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getImageUrl } from '@/utils/backend';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from 'react-i18next';
// Removed BlurView import - using gradient backgrounds instead for better compatibility

import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  scale,
  fontScale,
  getResponsiveValue,
  isSmallDevice,
  getPadding,
  getFontSizes,
} from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();

// Carousel data - you can replace with actual car images
// Carousel will use active cars data

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, user, logout, token } = useAuth();
  const { notifications, unreadCount: unreadNotificationsCount, markAsRead, markAllAsRead } = useNotifications();
  const { t } = useTranslation();
  // Exclude message notifications from header badge count (only show non-message notifications)
  const nonMessageNotificationsCount = notifications.filter((n) => !n.is_read && n.type !== 'message').length;
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [authButtonLayout, setAuthButtonLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const scrollViewRef = useRef<ScrollView>(null);
  const mainScrollViewRef = useRef<ScrollView>(null);
  const filtersSectionRef = useRef<View>(null);
  const scrollY = useSharedValue(0);
  
  // Car listing state
  const [cars, setCars] = useState<any[]>([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [searchFilters, setSearchFilters] = useState({
    brand: '',
    model: '',
    maxPrice: '',
    minPrice: '',
    maxKm: '',
    minKm: '',
    minYear: '',
    maxYear: '',
    color: '',
    ports: '',
    boite: '',
    type_gaz: '',
    type_enegine: '',
    accident: '',
    usedby: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Animation values
  const heroOpacity = useSharedValue(0);
  const carouselScale = useSharedValue(0.9);
  const headerTranslateY = useSharedValue(0);
  const headerOpacity = useSharedValue(1);
  
  // Button press animations
  const primaryButtonScale = useSharedValue(1);
  const secondaryButtonScale = useSharedValue(1);
  const loginButtonScale = useSharedValue(1);
  
  // Trust badge animation
  const trustBadgeScale = useSharedValue(0);
  const trustBadgeRotation = useSharedValue(-10);
  

  // Fetch user image when authenticated
  React.useEffect(() => {
    const fetchUserImage = async () => {
      if (isAuthenticated && user?._id) {
        try {
          const response = await apiRequest(`/user-image/${user._id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.ok && data.userImage?.image) {
              setUserImage(getImageUrl(data.userImage.image));
            }
          }
        } catch (error) {
          console.error('Error fetching user image:', error);
        }
      } else {
        setUserImage(null);
      }
    };

    fetchUserImage();
  }, [isAuthenticated, user]);

  // Notifications are now handled by useNotifications hook

  React.useEffect(() => {
    // Staggered entrance animations
    heroOpacity.value = withTiming(1, { duration: 1000 });
    carouselScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    
    // Trust badge animation
    trustBadgeScale.value = withSpring(1, { damping: 10, stiffness: 120 });
    trustBadgeRotation.value = withSpring(0, { damping: 12 });
  }, []);

  // Scroll handler for parallax effect
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      
      // Header parallax effect
      if (event.contentOffset.y > 0) {
        headerTranslateY.value = Math.min(event.contentOffset.y * 0.5, 50);
        headerOpacity.value = Math.max(1 - event.contentOffset.y / 100, 0.9);
      } else {
        headerTranslateY.value = 0;
        headerOpacity.value = 1;
      }
    },
  });

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, 300],
          [0, -50],
          Extrapolate.CLAMP
        ),
      },
    ],
  }));

  const carouselAnimatedStyle = useAnimatedStyle(() => {
    // Only use scale, remove rotateY as it's not well supported on all platforms
    return {
      transform: [
        { scale: carouselScale.value },
      ],
    };
  });

  const trustBadgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: trustBadgeScale.value },
      { rotate: `${trustBadgeRotation.value}deg` },
    ],
  }));

  const primaryButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: primaryButtonScale.value }],
  }));

  const secondaryButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: secondaryButtonScale.value }],
  }));

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
    opacity: headerOpacity.value,
  }));

  const loginButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loginButtonScale.value }],
  }));

  const handleAuthButtonPress = () => {
    loginButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    setShowAuthMenu((prev) => !prev);
  };

  const handleUserButtonPress = () => {
    loginButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    setShowUserMenu((prev) => !prev);
  };

  const handleAuthButtonLayout = (event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setAuthButtonLayout({ x, y, width, height });
  };

  const handleLoginPress = () => {
    setShowAuthMenu(false);
    router.push('/login');
  };

  const handleRegisterPress = () => {
    setShowAuthMenu(false);
    router.push('/register');
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    router.replace('/(tabs)');
  };

  const handleNotificationPress = () => {
    setShowNotifications(true);
  };

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    await markAsRead(notificationId);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user) return 'U';
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (user.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const handlePrimaryButtonPress = () => {
    primaryButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    // Scroll to filters section and open filters
    setTimeout(() => {
      // First open filters
      setShowFilters(true);
      // Then scroll to filters section after a short delay
      setTimeout(() => {
        if (filtersSectionRef.current && mainScrollViewRef.current) {
          filtersSectionRef.current.measureLayout(
            mainScrollViewRef.current as any,
            (x, y) => {
              mainScrollViewRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
            },
            () => {
              // Fallback: scroll to approximate position (around 700px from top)
              mainScrollViewRef.current?.scrollTo({ y: 700, animated: true });
            }
          );
        } else {
          // Fallback: scroll to approximate position
          mainScrollViewRef.current?.scrollTo({ y: 700, animated: true });
        }
      }, 100);
    }, 150);
  };

  const handleSecondaryButtonPress = () => {
    secondaryButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    setTimeout(() => router.push('/(tabs)/cars'), 150);
  };



  // Fetch active cars
  const fetchActiveCars = async (filters?: typeof searchFilters) => {
    try {
      setLoadingCars(true);
      const params = new URLSearchParams();
      if (filters) {
        if (filters.brand) params.append('brand', filters.brand);
        if (filters.model) params.append('model', filters.model);
        if (filters.minPrice) params.append('minPrice', filters.minPrice);
        if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
        if (filters.minKm) params.append('minKm', filters.minKm);
        if (filters.maxKm) params.append('maxKm', filters.maxKm);
        if (filters.minYear) params.append('minYear', filters.minYear);
        if (filters.maxYear) params.append('maxYear', filters.maxYear);
        if (filters.color) params.append('color', filters.color);
        if (filters.ports) params.append('ports', filters.ports);
        if (filters.boite) params.append('boite', filters.boite);
        if (filters.type_gaz) params.append('type_gaz', filters.type_gaz);
        if (filters.type_enegine) params.append('type_enegine', filters.type_enegine);
        if (filters.accident) params.append('accident', filters.accident);
        if (filters.usedby) params.append('usedby', filters.usedby);
      }
      
      const queryString = params.toString();
      const endpoint = `/car/active${queryString ? `?${queryString}` : ''}`;
      const response = await apiRequest(endpoint);
      
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.cars) {
          setCars(data.cars);
        }
      }
    } catch (error) {
      console.error('Error fetching active cars:', error);
    } finally {
      setLoadingCars(false);
    }
  };

  // Fetch cars on mount
  React.useEffect(() => {
    fetchActiveCars();
  }, []);

  // Reset carousel index when cars change
  React.useEffect(() => {
    setCurrentCarouselIndex(0);
  }, [cars]);

  const handleSearch = () => {
    fetchActiveCars(searchFilters);
  };

  const handleFilterChange = (field: string, value: string) => {
    const newFilters = {
      ...searchFilters,
      [field]: value,
    };
    setSearchFilters(newFilters);
    
    // If all filters are empty, show all cars
    const allEmpty = Object.values(newFilters).every(val => !val || val === '');
    if (allEmpty) {
      fetchActiveCars();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'actif':
        return { text: t('home.status_active'), colors: ['#10b981', '#059669'] };
      case 'en_attente':
        return { text: t('home.status_pending'), colors: ['#f59e0b', '#d97706'] };
      case 'sold':
        return { text: t('home.status_sold'), colors: ['#6b7280', '#4b5563'] };
      case 'no_proccess':
        return { text: t('home.status_notProcessed'), colors: ['#ef4444', '#dc2626'] };
      default:
        return { text: status, colors: ['#6b7280', '#4b5563'] };
    }
  };

  // Get active cars for carousel (max 5)
  const carouselCars = cars.filter(car => car.status === 'actif').slice(0, 5);

  const handleCarouselPrev = () => {
    if (carouselCars.length === 0) return;
    const prevIndex =
      currentCarouselIndex === 0
        ? carouselCars.length - 1
        : currentCarouselIndex - 1;
    setCurrentCarouselIndex(prevIndex);
    scrollViewRef.current?.scrollTo({
      x: prevIndex * (SCREEN_WIDTH * 0.9 - 32),
      animated: true,
    });
  };

  const handleCarouselNext = () => {
    if (carouselCars.length === 0) return;
    const nextIndex = (currentCarouselIndex + 1) % carouselCars.length;
    setCurrentCarouselIndex(nextIndex);
    scrollViewRef.current?.scrollTo({
      x: nextIndex * (SCREEN_WIDTH * 0.9 - 32),
      animated: true,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={mainScrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Platform.OS === 'ios' 
              ? scale(100) 
              : scale(100) + Math.max(insets.bottom, 0), // Account for tab bar height + Android nav bar
          }
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Header with Logo and Auth/User Button */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={[styles.simpleHeader, headerAnimatedStyle]}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.9)']}
            style={styles.headerBlur}
          >
            <View style={styles.simpleHeaderContent}>
              {/* Logo with animation */}
              <Animated.View
                entering={FadeInDown.duration(600).delay(100).springify()}
                style={styles.logoContainer}
              >
                <Animated.View style={styles.logoImageContainer}>
                  <Image
                    source={require('@/assets/carsure.jpeg')}
                    style={styles.logoImage}
                    contentFit="contain"
                  />
                </Animated.View>
                <View style={styles.logoTextContainer}>
                  <ThemedText style={styles.logoTextMain}>CarSure</ThemedText>
                </View>
              </Animated.View>

              {/* Auth Button or User Avatar */}
              {!isAuthenticated ? (
                <View style={styles.authMenuContainer}>
                  <AnimatedTouchableOpacity
                    onPress={handleAuthButtonPress}
                    onLayout={handleAuthButtonLayout}
                    style={[styles.authIconButton, loginButtonAnimatedStyle]}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.authIconButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <IconSymbol name="person.circle.fill" size={scale(24)} color="#ffffff" />
                    </LinearGradient>
                  </AnimatedTouchableOpacity>
                </View>
              ) : (
                <View style={styles.userActionsContainer}>
                  {/* Notification Icon */}
                  <AnimatedTouchableOpacity
                    onPress={handleNotificationPress}
                    style={styles.notificationButton}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.notificationButtonGradient}
                    >
                      <IconSymbol name="bell.fill" size={scale(20)} color="#ffffff" />
                    </LinearGradient>
                    {nonMessageNotificationsCount > 0 && (
                      <View style={styles.notificationBadge}>
                        <ThemedText style={styles.notificationBadgeText}>
                          {nonMessageNotificationsCount > 9 ? '9+' : nonMessageNotificationsCount}
                        </ThemedText>
                      </View>
                    )}
                  </AnimatedTouchableOpacity>

                  {/* User Avatar */}
                  <AnimatedTouchableOpacity
                    onPress={handleUserButtonPress}
                    style={[styles.userAvatarButton, loginButtonAnimatedStyle]}
                    activeOpacity={0.8}
                  >
                    {userImage ? (
                      <Image
                        source={{ uri: userImage }}
                        style={styles.userAvatarImage}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={['#0d9488', '#14b8a6']}
                        style={styles.userAvatarGradient}
                      >
                        <ThemedText style={styles.userAvatarText}>
                          {getUserInitials()}
                        </ThemedText>
                      </LinearGradient>
                    )}
                  </AnimatedTouchableOpacity>
                </View>
              )}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Background gradient decoration */}
        <View style={styles.backgroundDecoration}>
          <LinearGradient
            colors={['rgba(13, 148, 136, 0.05)', 'transparent']}
            style={styles.gradientCircle1}
          />
          <LinearGradient
            colors={['rgba(20, 184, 166, 0.08)', 'transparent']}
            style={styles.gradientCircle2}
          />
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Hero Section */}
          <Animated.View
            style={[styles.heroSection, heroAnimatedStyle]}
          >
            {/* Trust Badge with animation */}
            <Animated.View
              style={[styles.trustBadge, trustBadgeAnimatedStyle]}
            >
              <LinearGradient
                colors={['#f0fdfa', '#ccfbf1']}
                style={styles.trustBadgeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <IconSymbol name="sparkles" size={18} color="#0d9488" />
                <ThemedText style={styles.trustBadgeText}>
                  {t('home.trustBadge')}
                </ThemedText>
              </LinearGradient>
            </Animated.View>

            {/* Main Headline */}
            <View>
              <ThemedText style={styles.mainHeadline}>
                {t('home.headlinePre')}{' '}
                <ThemedText style={styles.highlightText}>
                  {t('home.headlineHighlight')}
          </ThemedText>{' '}
                {t('home.headlinePost')}
              </ThemedText>
            </View>

            {/* Description */}
            <View style={styles.descriptionContainer}>
              <ThemedText style={styles.description}>
                {t('home.description')}
              </ThemedText>
            </View>

            {/* Trust Indicators */}
            <View style={styles.trustIndicators}>
              <View style={styles.trustBadgeSmall}>
                <LinearGradient
                  colors={['#f0fdf4', '#dcfce7']}
                  style={styles.trustBadgeSmallGradient}
                >
                  <IconSymbol name="checkmark.circle.fill" size={18} color="#10b981" />
                  <ThemedText style={styles.trustBadgeSmallText}>
                    {t('home.verifiedByExperts')}
                  </ThemedText>
                </LinearGradient>
              </View>
              <View style={[styles.trustBadgeSmall, styles.trustBadgeBlue]}>
                <LinearGradient
                  colors={['#eff6ff', '#dbeafe']}
                  style={styles.trustBadgeSmallGradient}
                >
                  <IconSymbol name="shield.fill" size={18} color="#3b82f6" />
                  <ThemedText style={styles.trustBadgeSmallText}>
                    {t('home.secure')}
                  </ThemedText>
                </LinearGradient>
              </View>
            </View>

            {/* CTA Buttons with press animations */}
            <View style={styles.ctaButtons}>
              <AnimatedTouchableOpacity
                onPress={handlePrimaryButtonPress}
                style={[styles.primaryButton, primaryButtonAnimatedStyle]}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                  style={styles.primaryButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <IconSymbol name="magnifyingglass" size={22} color="#fff" />
                  <ThemedText style={styles.primaryButtonText}>
                    {t('home.findCar')}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={18} color="#fff" />
                </LinearGradient>
              </AnimatedTouchableOpacity>

              <AnimatedTouchableOpacity
                onPress={handleSecondaryButtonPress}
                style={[styles.secondaryButton, secondaryButtonAnimatedStyle]}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)']}
                  style={styles.secondaryButtonBlur}
                >
                  <ThemedText style={styles.secondaryButtonText}>
                    {t('home.sellCar')}
                  </ThemedText>
                </LinearGradient>
              </AnimatedTouchableOpacity>
            </View>
          </Animated.View>

          {/* Carousel Section with 3D effect */}
          <Animated.View
            style={[styles.carouselContainer, carouselAnimatedStyle]}
          >
            <View style={styles.carouselWrapper}>
              {/* Certification Badge with glassmorphism */}
              <Animated.View
                entering={FadeIn.duration(800).delay(600).springify()}
                style={styles.certificationBadge}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.certificationBadgeBlur}
                >
                  <IconSymbol name="checkmark.circle.fill" size={16} color="#0d9488" />
                  <ThemedText style={styles.certificationBadgeText}>
                    {t('home.certified')}
        </ThemedText>
                </LinearGradient>
              </Animated.View>

              {/* Carousel */}
              <View style={styles.carousel}>
                {carouselCars.length > 0 ? (
                  <ScrollView
                    ref={scrollViewRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                      const index = Math.round(
                        e.nativeEvent.contentOffset.x /
                          (SCREEN_WIDTH * 0.9 - 32)
                      );
                      setCurrentCarouselIndex(index);
                    }}
                    style={styles.carouselScroll}
                  >
                    {carouselCars.map((car, index) => {
                      const carImage = car.images && car.images.length > 0 
                        ? getImageUrl(car.images[0]) 
                        : null;
                      const carName = `${car.brand} ${car.model} ${car.year}`;
                      
                      return (
                        <TouchableOpacity
                          key={car._id || car.id || index}
                          onPress={() => router.push(`/car/${car._id || car.id}`)}
                          activeOpacity={0.9}
                          style={styles.carouselItem}
                        >
                          {carImage ? (
                            <Image
                              source={{ uri: carImage }}
                              style={styles.carouselImage}
                              contentFit="cover"
                              transition={300}
                            />
                          ) : (
                            <View style={styles.carouselImagePlaceholder}>
                              <IconSymbol name="car.fill" size={64} color="#9ca3af" />
                            </View>
                          )}
                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.7)']}
                            style={styles.carouselOverlay}
                          />
                          {/* Car Info Overlay */}
                          <View style={styles.carouselInfoOverlay}>
                            <ThemedText style={styles.carouselCarName}>{carName}</ThemedText>
                            <ThemedText style={styles.carouselCarPrice}>
                              {car.price?.toLocaleString() || 0} {t('home.priceCurrency')}
                            </ThemedText>
                            <View style={styles.carouselCarDetails}>
                              <ThemedText style={styles.carouselCarDetail}>
                                {car.km?.toLocaleString() || 0} {t('home.mileageUnit')}
                              </ThemedText>
                              <ThemedText style={styles.carouselCarDetail}>•</ThemedText>
                              <ThemedText style={styles.carouselCarDetail}>{car.year}</ThemedText>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={styles.carouselEmpty}>
                    <IconSymbol name="car.fill" size={64} color="#9ca3af" />
                    <ThemedText style={styles.carouselEmptyText}>
                      {t('home.noActiveCars')}
                    </ThemedText>
                  </View>
                )}

                {/* Navigation Arrows with hover effect */}
                {carouselCars.length > 1 && (
                  <>
                    <AnimatedTouchableOpacity
                      onPress={handleCarouselPrev}
                      style={[styles.carouselArrow, styles.carouselArrowLeft]}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                        style={styles.carouselArrowBlur}
                      >
                        <IconSymbol name="chevron.left" size={22} color="#1f2937" />
                      </LinearGradient>
                    </AnimatedTouchableOpacity>
                    <AnimatedTouchableOpacity
                      onPress={handleCarouselNext}
                      style={[styles.carouselArrow, styles.carouselArrowRight]}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                        style={styles.carouselArrowBlur}
                      >
                        <IconSymbol name="chevron.right" size={22} color="#1f2937" />
                      </LinearGradient>
                    </AnimatedTouchableOpacity>
                  </>
                )}

                {/* Pagination Dots */}
                {carouselCars.length > 0 && (
                  <View style={styles.pagination}>
                    {carouselCars.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.paginationDot,
                          index === currentCarouselIndex &&
                            styles.paginationDotActive,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Car Listings Section */}
          <Animated.View
            entering={FadeInDown.duration(600).delay(400).springify()}
            style={styles.carListingsSection}
          >
            <View style={styles.carListingsHeader}>
              <ThemedText style={styles.carListingsTitle}>
                {t('home.latestOffersTitle')}
              </ThemedText>
              <ThemedText style={styles.carListingsSubtitle}>
                {t('home.latestOffersSubtitle')}
              </ThemedText>
            </View>

            {/* Modern Search/Filter Section */}
            <Animated.View
              ref={filtersSectionRef}
              entering={FadeInDown.duration(500).delay(200).springify()}
              style={styles.modernFilterSection}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.modernFilterBlur}
              >
                {/* Main Search Bar */}
                <View style={styles.modernSearchBar}>
                  <View style={styles.searchIconContainer}>
                    <IconSymbol name="magnifyingglass" size={20} color="#0d9488" />
                  </View>
                  <TextInput
                    style={styles.modernSearchInput}
                    placeholder={t('home.searchPlaceholder')}
                    value={searchFilters.brand || searchFilters.model || ''}
                    onChangeText={(text) => {
                      const newFilters = {
                        ...searchFilters,
                        brand: text,
                        model: text,
                      };
                      setSearchFilters(newFilters);
                      
                      // If search is cleared and all other filters are empty, show all cars
                      if (!text || text.trim() === '') {
                        const otherFiltersEmpty = !newFilters.minPrice && !newFilters.maxPrice &&
                          !newFilters.minKm && !newFilters.maxKm &&
                          !newFilters.minYear && !newFilters.maxYear &&
                          !newFilters.color && !newFilters.ports &&
                          !newFilters.boite && !newFilters.type_gaz &&
                          !newFilters.type_enegine && !newFilters.accident &&
                          !newFilters.usedby;
                        
                        if (otherFiltersEmpty) {
                          fetchActiveCars();
                        }
                      }
                    }}
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity
                    onPress={handleSearch}
                    style={styles.modernSearchButton}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.modernSearchButtonGradient}
                    >
                      <IconSymbol name="arrow.right" size={18} color="#ffffff" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* Filter Toggle Button */}
                <TouchableOpacity
                  onPress={() => setShowFilters(!showFilters)}
                  style={styles.modernFilterToggle}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={showFilters ? ['#0d9488', '#14b8a6'] : ['#f3f4f6', '#e5e7eb']}
                    style={styles.modernFilterToggleGradient}
                  >
                    <IconSymbol 
                      name="slider.horizontal.3" 
                      size={18} 
                      color={showFilters ? "#ffffff" : "#6b7280"} 
                    />
                    <ThemedText style={[
                      styles.modernFilterToggleText,
                      showFilters && styles.modernFilterToggleTextActive
                    ]}>
                      {t('home.advancedFilters')}
                    </ThemedText>
                    <IconSymbol 
                      name={showFilters ? "chevron.up" : "chevron.down"} 
                      size={16} 
                      color={showFilters ? "#ffffff" : "#6b7280"} 
                    />
                  </LinearGradient>
                </TouchableOpacity>

                {/* Advanced Filters */}
                {showFilters && (
                  <Animated.View
                    entering={FadeInDown.duration(300).springify()}
                    style={styles.modernAdvancedFilters}
                  >
                    <ScrollView
                      style={styles.modernAdvancedFiltersScroll}
                      contentContainerStyle={styles.modernAdvancedFiltersContent}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.priceLabel')}
                      </ThemedText>
                      <View style={styles.modernFilterInputRow}>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="tag.fill" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.min')}
                            value={searchFilters.minPrice}
                            onChangeText={(text) => handleFilterChange('minPrice', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="tag.fill" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.max')}
                            value={searchFilters.maxPrice}
                            onChangeText={(text) => handleFilterChange('maxPrice', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.mileage')}
                      </ThemedText>
                      <View style={styles.modernFilterInputRow}>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="speedometer" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.min')}
                            value={searchFilters.minKm}
                            onChangeText={(text) => handleFilterChange('minKm', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="speedometer" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.max')}
                            value={searchFilters.maxKm}
                            onChangeText={(text) => handleFilterChange('maxKm', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.year')}
                      </ThemedText>
                      <View style={styles.modernFilterInputRow}>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="calendar" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.min')}
                            value={searchFilters.minYear}
                            onChangeText={(text) => handleFilterChange('minYear', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="calendar" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.max')}
                            value={searchFilters.maxYear}
                            onChangeText={(text) => handleFilterChange('maxYear', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.features')}
                      </ThemedText>
                      <View style={styles.modernFilterInputRow}>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="paintbrush.fill" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.color')}
                            value={searchFilters.color}
                            onChangeText={(text) => handleFilterChange('color', text)}
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                        <View style={styles.modernFilterInputWrapper}>
                          <IconSymbol name="car.side.fill" size={16} color="#6b7280" />
                          <TextInput
                            style={styles.modernFilterInput}
                            placeholder={t('home.filters.doorsPlaceholder')}
                            value={searchFilters.ports}
                            onChangeText={(text) => handleFilterChange('ports', text)}
                            keyboardType="numeric"
                            placeholderTextColor="#9ca3af"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.gearbox')}
                      </ThemedText>
                      <View style={styles.modernFilterSelectRow}>
                        {['', 'manuelle', 'auto', 'semi-auto'].map((value) => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleFilterChange('boite', value)}
                            style={[
                              styles.modernFilterSelectOption,
                              searchFilters.boite === value && styles.modernFilterSelectOptionActive,
                            ]}
                          >
                            <ThemedText style={[
                              styles.modernFilterSelectOptionText,
                              searchFilters.boite === value && styles.modernFilterSelectOptionTextActive,
                            ]}>
                              {value === ''
                                ? t('home.filters.gearbox_all')
                                : value === 'manuelle'
                                  ? t('home.filters.gearbox_manual')
                                  : value === 'auto'
                                    ? t('home.filters.gearbox_auto')
                                    : t('home.filters.gearbox_semi')}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.fuel')}
                      </ThemedText>
                      <View style={styles.modernFilterSelectRow}>
                        {['', 'diesel', 'gaz', 'essence', 'electrique'].map((value) => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleFilterChange('type_gaz', value)}
                            style={[
                              styles.modernFilterSelectOption,
                              searchFilters.type_gaz === value && styles.modernFilterSelectOptionActive,
                            ]}
                          >
                            <ThemedText style={[
                              styles.modernFilterSelectOptionText,
                              searchFilters.type_gaz === value && styles.modernFilterSelectOptionTextActive,
                            ]}>
                              {value === ''
                                ? t('home.filters.fuel_all')
                                : value === 'diesel'
                                  ? t('home.filters.fuel_diesel')
                                  : value === 'gaz'
                                    ? t('home.filters.fuel_gas')
                                    : value === 'essence'
                                      ? t('home.filters.fuel_petrol')
                                      : t('home.filters.fuel_electric')}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.engineType')}
                      </ThemedText>
                      <View style={styles.modernFilterInputWrapper}>
                        <IconSymbol name="gearshape.fill" size={16} color="#6b7280" />
                        <TextInput
                          style={styles.modernFilterInput}
                          placeholder={t('home.filters.enginePlaceholder')}
                          value={searchFilters.type_enegine}
                          onChangeText={(text) => handleFilterChange('type_enegine', text)}
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.usedBy')}
                      </ThemedText>
                      <View style={styles.modernFilterSelectRow}>
                        {['', 'Particulier', 'Professionnel'].map((value) => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleFilterChange('usedby', value)}
                            style={[
                              styles.modernFilterSelectOption,
                              searchFilters.usedby === value && styles.modernFilterSelectOptionActive,
                            ]}
                          >
                            <ThemedText style={[
                              styles.modernFilterSelectOptionText,
                              searchFilters.usedby === value && styles.modernFilterSelectOptionTextActive,
                            ]}>
                              {value === ''
                                ? t('home.filters.usedBy_all')
                                : value === 'Particulier'
                                  ? t('home.filters.usedBy_private')
                                  : t('home.filters.usedBy_pro')}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.modernFilterGroup}>
                      <ThemedText style={styles.modernFilterGroupTitle}>
                        {t('home.filters.accident')}
                      </ThemedText>
                      <View style={styles.modernFilterSelectRow}>
                        {['', 'false', 'true'].map((value) => (
                          <TouchableOpacity
                            key={value}
                            onPress={() => handleFilterChange('accident', value)}
                            style={[
                              styles.modernFilterSelectOption,
                              searchFilters.accident === value && styles.modernFilterSelectOptionActive,
                            ]}
                          >
                            <ThemedText style={[
                              styles.modernFilterSelectOptionText,
                              searchFilters.accident === value && styles.modernFilterSelectOptionTextActive,
                            ]}>
                              {value === ''
                                ? t('home.filters.accident_all')
                                : value === 'false'
                                ? t('home.filters.accident_no')
                                : t('home.filters.accident_yes')}
                            </ThemedText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        const emptyFilters = {
                          brand: '',
                          model: '',
                          maxPrice: '',
                          minPrice: '',
                          maxKm: '',
                          minKm: '',
                          minYear: '',
                          maxYear: '',
                          color: '',
                          ports: '',
                          boite: '',
                          type_gaz: '',
                          type_enegine: '',
                          accident: '',
                          usedby: '',
                        };
                        setSearchFilters(emptyFilters);
                        // Fetch all cars when filters are reset
                        fetchActiveCars();
                      }}
                      style={styles.resetFiltersButton}
                    >
                      <ThemedText style={styles.resetFiltersText}>
                        {t('home.filters.reset')}
                      </ThemedText>
                    </TouchableOpacity>
                    </ScrollView>
                  </Animated.View>
                )}
              </LinearGradient>
            </Animated.View>

            {/* Cars Grid */}
            {loadingCars ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0d9488" />
                <ThemedText style={styles.loadingText}>{t('home.loadingCars')}</ThemedText>
              </View>
            ) : cars.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="car.fill" size={48} color="#9ca3af" />
                <ThemedText style={styles.emptyText}>{t('home.emptyCars')}</ThemedText>
              </View>
            ) : (
              <View style={styles.carsList}>
                {cars.map((car, index) => {
                  const statusBadge = getStatusBadge(car.status);
                  return (
                    <Animated.View
                      key={car._id || car.id}
                      entering={FadeInDown.duration(400).delay(index * 100).springify()}
                      style={styles.webStyleCarCard}
                    >
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                        style={styles.webStyleCarCardBlur}
                      >
                        {/* Car Image - Full Width Top */}
                        <TouchableOpacity
                          onPress={() => router.push(`/car/${car._id || car.id}`)}
                          activeOpacity={0.9}
                        >
                          <View style={styles.webStyleCarImageContainer}>
                            {car.images && car.images.length > 0 && getImageUrl(car.images[0]) ? (
                              <Image
                                source={{ uri: getImageUrl(car.images[0])! }}
                                style={styles.webStyleCarImage}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={styles.webStyleCarImagePlaceholder}>
                                <IconSymbol name="car.fill" size={64} color="#9ca3af" />
                              </View>
                            )}
                            <LinearGradient
                              colors={['transparent', 'rgba(0,0,0,0.3)']}
                              style={styles.webStyleCarImageOverlay}
                            />
                            {/* Status Badge */}
                            <View style={styles.webStyleCarStatusBadge}>
                              <LinearGradient
                                colors={statusBadge.colors}
                                style={styles.webStyleCarStatusBadgeGradient}
                              >
                                <ThemedText style={styles.webStyleCarStatusText}>
                                  {car.status === 'actif' ? `✓ ${t('workshops.certified')}` : statusBadge.text}
                                </ThemedText>
                              </LinearGradient>
                            </View>
                            {/* Year Badge */}
                            <View style={styles.webStyleCarYearBadge}>
                              <ThemedText style={styles.webStyleCarYearText}>{car.year}</ThemedText>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Car Info Section */}
                        <View style={styles.webStyleCarInfo}>
                          {/* Title */}
                          <TouchableOpacity
                            onPress={() => router.push(`/car/${car._id || car.id}`)}
                            activeOpacity={0.9}
                          >
                            <ThemedText style={styles.webStyleCarTitle}>
                              {car.brand} {car.model}
                            </ThemedText>
                          </TouchableOpacity>

                          {/* Owner Info */}
                          {car.owner && typeof car.owner === 'object' && (
                            <TouchableOpacity
                              onPress={() => {
                                const ownerId = car.owner._id || car.owner.id;
                                if (ownerId) {
                                  router.push(`/user/${ownerId}` as any);
                                }
                              }}
                              activeOpacity={0.7}
                              style={styles.webStyleCarOwnerSection}
                            >
                              <View style={styles.webStyleCarOwnerAvatar}>
                                <LinearGradient
                                  colors={['#0d9488', '#14b8a6']}
                                  style={styles.webStyleCarOwnerAvatarGradient}
                                >
                                  <ThemedText style={styles.webStyleCarOwnerAvatarText}>
                                    {car.owner.firstName?.[0]}{car.owner.lastName?.[0]}
                                  </ThemedText>
                                </LinearGradient>
                              </View>
                              <View style={styles.webStyleCarOwnerInfo}>
                              <ThemedText style={styles.webStyleCarOwnerLabel}>{t('car.seller')}</ThemedText>
                                <View style={styles.webStyleCarOwnerNameRow}>
                                  <ThemedText style={styles.webStyleCarOwnerName}>
                                    {car.owner.firstName} {car.owner.lastName}
                                  </ThemedText>
                                  {car.owner.certifie && (
                                    <View style={styles.webStyleCertifiedBadge}>
                                      <IconSymbol name="checkmark.seal.fill" size={10} color="#ffffff" />
                                    </View>
                                  )}
                                </View>
                              </View>
                            </TouchableOpacity>
                          )}

                          {/* Details Row - Km and Year */}
                          <View style={styles.webStyleCarDetailsRow}>
                            <View style={styles.webStyleCarDetailBox}>
                              <LinearGradient
                                colors={['#eff6ff', '#dbeafe']}
                                style={styles.webStyleCarDetailIconBox}
                              >
                                <IconSymbol name="speedometer" size={20} color="#3b82f6" />
                              </LinearGradient>
                              <ThemedText style={styles.webStyleCarDetailValue}>
                                {car.km?.toLocaleString() || 0} {t('home.mileageUnit')}
                              </ThemedText>
                            </View>
                            <View style={styles.webStyleCarDetailBox}>
                              <LinearGradient
                                colors={['#f0fdfa', '#ccfbf1']}
                                style={styles.webStyleCarDetailIconBox}
                              >
                                <IconSymbol name="calendar" size={20} color="#0d9488" />
                              </LinearGradient>
                              <ThemedText style={styles.webStyleCarDetailValue}>
                                {car.year}
                              </ThemedText>
                            </View>
                          </View>

                          {/* VIN */}
                          {car.vin && (
                            <View style={styles.webStyleCarVin}>
                              <IconSymbol name="doc.text.fill" size={16} color="#0d9488" />
                              <ThemedText style={styles.webStyleCarVinText}>
                                VIN: {car.vin}
                              </ThemedText>
                            </View>
                          )}

                          {/* Price and Status */}
                          <View style={styles.webStyleCarPriceRow}>
                            <View style={styles.webStyleCarPriceContainer}>
                              <Animated.View
                                entering={FadeInDown.duration(600).delay(300).springify()}
                              >
                                <ThemedText style={styles.webStyleCarPrice}>
                                  {car.price?.toLocaleString() || 0} {t('home.priceCurrency')}
                                </ThemedText>
                              </Animated.View>
                            </View>
                            {car.status === 'actif' && (
                              <View style={styles.webStyleCarActiveBadge}>
                                <IconSymbol name="checkmark.circle.fill" size={16} color="#ffffff" />
                                <ThemedText style={styles.webStyleCarActiveText}>{t('home.active')}</ThemedText>
                              </View>
                            )}
                          </View>

                          {/* Action Buttons */}
                          <View style={styles.webStyleCarActions}>
                            <TouchableOpacity
                              onPress={() => router.push(`/car/${car._id || car.id}`)}
                              style={styles.webStyleCarDetailsButton}
                              activeOpacity={0.9}
                            >
                              <LinearGradient
                                colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                                style={styles.webStyleCarDetailsButtonGradient}
                              >
                                <ThemedText style={styles.webStyleCarDetailsButtonText}>
                                  {t('home.viewDetails')}
                                </ThemedText>
                              </LinearGradient>
                            </TouchableOpacity>
                            {isAuthenticated && car.owner && typeof car.owner === 'object' && car.owner._id !== user?._id && (
                              <TouchableOpacity
                                onPress={() => router.push(`/(tabs)/chat?userId=${car.owner._id}`)}
                                style={styles.webStyleCarChatButton}
                                activeOpacity={0.9}
                              >
                                <LinearGradient
                                  colors={['#3b82f6', '#2563eb']}
                                  style={styles.webStyleCarChatButtonGradient}
                                >
                                  <IconSymbol name="message.fill" size={18} color="#ffffff" />
                                </LinearGradient>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </LinearGradient>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </View>
      </Animated.ScrollView>

      {/* Auth Menu Modal */}
      <Modal
        visible={showAuthMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAuthMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAuthMenu(false)}>
          <View style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInDown.duration(200).springify()}
              style={styles.authDropdownModal}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.authDropdownBlur}
              >
                <TouchableOpacity
                  onPress={handleLoginPress}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="person.fill" size={scale(18)} color="#0d9488" />
                  <ThemedText style={styles.authMenuItemText}>
                    {t('auth.login')}
                  </ThemedText>
                </TouchableOpacity>
                <View style={styles.authMenuDivider} />
                <TouchableOpacity
                  onPress={handleRegisterPress}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="person.badge.plus.fill" size={scale(18)} color="#0d9488" />
                  <ThemedText style={styles.authMenuItemText}>
                    {t('auth.register')}
                  </ThemedText>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* User Menu Modal */}
      <Modal
        visible={showUserMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUserMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowUserMenu(false)}>
          <View style={styles.modalOverlay}>
            <Animated.View
              entering={FadeInDown.duration(200).springify()}
              style={styles.userDropdownModal}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.authDropdownBlur}
              >
                {/* User Info */}
                <View style={styles.userMenuHeader}>
                  {userImage ? (
                    <Image
                      source={{ uri: userImage }}
                      style={styles.userMenuAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.userMenuAvatarGradient}
                    >
                      <ThemedText style={styles.userMenuAvatarText}>
                        {getUserInitials()}
                      </ThemedText>
                    </LinearGradient>
                  )}
                  <View style={styles.userMenuInfo}>
                    <ThemedText style={styles.userMenuName}>
                      {user?.firstName && user?.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user?.email || 'Utilisateur'}
                    </ThemedText>
                    <ThemedText style={styles.userMenuEmail}>
                      {user?.email}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.authMenuDivider} />
                <TouchableOpacity
                  onPress={() => {
                    setShowUserMenu(false);
                    router.push('/(tabs)/profile');
                  }}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="person.fill" size={scale(20)} color="#0d9488" />
                  <ThemedText style={styles.authMenuItemText}>
                    {t('tabs.profile')}
                  </ThemedText>
                </TouchableOpacity>
                <View style={styles.authMenuDivider} />
                <TouchableOpacity
                  onPress={() => {
                    setShowUserMenu(false);
                    router.push('/(tabs)/workshop-certified');
                  }}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="shield.fill" size={scale(20)} color="#3b82f6" />
                  <ThemedText style={styles.authMenuItemText}>
                    {t('home.workshopsCertified')}
                  </ThemedText>
                </TouchableOpacity>
                <View style={styles.authMenuDivider} />
                <TouchableOpacity
                  onPress={() => {
                    setShowUserMenu(false);
                    router.push('/(tabs)/scan');
                  }}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="qrcode.viewfinder" size={scale(20)} color="#0d9488" />
                  <ThemedText style={styles.authMenuItemText}>
                    {t('tabs.scan')}
                  </ThemedText>
                </TouchableOpacity>
                <View style={styles.authMenuDivider} />
                <TouchableOpacity
                  onPress={handleLogout}
                  style={styles.authMenuItem}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="arrow.right.square.fill" size={scale(20)} color="#ef4444" />
                  <ThemedText style={[styles.authMenuItemText, styles.logoutText]}>
                    {t('profile.logout')}
                  </ThemedText>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.notificationsModalOverlay}>
          <TouchableWithoutFeedback onPress={() => setShowNotifications(false)}>
            <View style={styles.notificationsModalBackdrop} />
          </TouchableWithoutFeedback>
          <Animated.View
            entering={FadeInDown.duration(300).springify()}
            style={styles.notificationsModal}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.notificationsModalGradient}
            >
              {/* Header */}
              <View style={styles.notificationsHeader}>
                <ThemedText style={styles.notificationsTitle}>
                  {t('notifications.title')}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowNotifications(false)}
                  style={styles.closeButton}
                >
                  <IconSymbol name="xmark.circle.fill" size={scale(24)} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {/* Mark all as read button */}
              {nonMessageNotificationsCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllAsRead}
                  style={styles.markAllReadButton}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.markAllReadText}>
                    {t('notifications.markAllAsRead')}
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Notifications List */}
              <ScrollView
                style={styles.notificationsList}
                contentContainerStyle={styles.notificationsListContent}
                showsVerticalScrollIndicator={false}
              >
                {notifications.filter((n) => n.type !== 'message').length === 0 ? (
                  <View style={styles.emptyNotifications}>
                    <IconSymbol name="bell.slash.fill" size={scale(48)} color="#9ca3af" />
                    <ThemedText style={styles.emptyNotificationsText}>
                      {t('notifications.empty')}
                    </ThemedText>
                  </View>
                ) : (
                  notifications.filter((n) => n.type !== 'message').map((notification) => {
                    const notificationId = notification.id || notification._id || '';
                    const senderName = notification.id_sender?.name || 
                                      notification.id_sender?.firstName || 
                                      (notification.id_sender?.firstName && notification.id_sender?.lastName
                                        ? `${notification.id_sender.firstName} ${notification.id_sender.lastName}`
                                        : t('notifications.senderWorkshop'));
                    
                    return (
                      <TouchableOpacity
                        key={notificationId}
                        onPress={async () => {
                          if (!notification.is_read) {
                            await handleMarkNotificationAsRead(notificationId);
                          }
                          setShowNotifications(false);
                          
                          // Navigate based on notification type (like web dashboard)
                          if (notification.type === 'message') {
                            router.push(`/(tabs)/chat?userId=${notification.id_sender?._id || notification.id_sender?.id || notification.id_sender}`);
                          } else if (
                            notification.type === 'done_rdv_workshop' || 
                            notification.type === 'cancel_rdv_workshop' || 
                            notification.type === 'rdv_workshop' ||
                            notification.type === 'accept_rdv' ||
                            notification.message?.toLowerCase().includes('rendez-vous') ||
                            notification.message?.toLowerCase().includes('rdv')
                          ) {
                            router.push('/(tabs)/cars');
                          } else if (notification.type === 'car_price_warning' && notification.carId) {
                            router.push(`/(tabs)/cars`);
                          }
                        }}
                        style={[
                          styles.notificationItem,
                          !notification.is_read && styles.notificationItemUnread,
                        ]}
                        activeOpacity={0.7}
                      >
                        <View style={styles.notificationContent}>
                          {senderName && senderName !== 'Atelier' && (
                            <ThemedText style={styles.notificationSender}>
                              {senderName}
                            </ThemedText>
                          )}
                          <ThemedText style={styles.notificationMessage}>
                            {notification.message}
                          </ThemedText>
                          <ThemedText style={styles.notificationDate}>
                            {new Date(notification.createdAt).toLocaleDateString(i18n.language.startsWith('ar') ? 'ar' : (i18n.language.startsWith('en') ? 'en-GB' : 'fr-FR'), {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </ThemedText>
                        </View>
                        {!notification.is_read && (
                          <View style={styles.unreadDot} />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </LinearGradient>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: scale(100),
  },
  simpleHeader: {
    position: 'relative',
    zIndex: 100,
    paddingHorizontal: padding.horizontal,
    paddingTop: scale(8),
    paddingBottom: scale(8),
    marginTop: scale(4),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  simpleHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: scale(12),
  },
  headerBlur: {
    borderRadius: scale(24),
    overflow: 'hidden',
    paddingHorizontal: padding.horizontal,
    paddingVertical: scale(10),
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  logoImageContainer: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(12),
    overflow: 'hidden',
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoTextContainer: {
    marginLeft: scale(4),
  },
  logoTextMain: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: 0.5,
  },
  authMenuContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  authIconButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  authIconButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authDropdownBlur: {
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  authMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(16),
    paddingVertical: padding.large,
    paddingHorizontal: padding.large,
    backgroundColor: 'transparent',
  },
  authMenuDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginHorizontal: 8,
  },
  authMenuItemText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  authDropdownModal: {
    position: 'absolute',
    top: scale(80),
    right: padding.horizontal,
    minWidth: scale(180),
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  userMenuContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  userAvatarButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  userAvatarImage: {
    width: '100%',
    height: '100%',
  },
  userAvatarGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#ffffff',
  },
  userDropdownModal: {
    position: 'absolute',
    top: scale(80),
    right: padding.horizontal,
    minWidth: scale(280),
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  userMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(16),
    padding: padding.large,
    backgroundColor: 'transparent',
  },
  userMenuAvatar: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(30),
  },
  userMenuAvatarGradient: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(30),
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMenuAvatarText: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#ffffff',
  },
  userMenuInfo: {
    flex: 1,
  },
  userMenuName: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: scale(4),
  },
  userMenuEmail: {
    fontSize: fontSizes.sm,
    color: '#64748b',
  },
  logoutText: {
    color: '#ef4444',
  },
  userActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  notificationButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  notificationButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: scale(22),
  },
  notificationBadge: {
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
  notificationBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: fontSizes.xs,
    includeFontPadding: false,
    textAlignVertical: 'center',
    width: '100%',
  },
  notificationsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  notificationsModalBackdrop: {
    flex: 1,
  },
  notificationsModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '80%',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  notificationsModalGradient: {
    flex: 1,
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    borderWidth: scale(1),
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  notificationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: padding.large,
    borderBottomWidth: scale(1),
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  notificationsTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: scale(4),
  },
  markAllReadButton: {
    padding: padding.medium,
    alignItems: 'center',
    borderBottomWidth: scale(1),
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  markAllReadText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '600',
  },
  notificationsList: {
    flex: 1,
  },
  notificationsListContent: {
    padding: padding.medium,
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: padding.large * 2,
  },
  emptyNotificationsText: {
    fontSize: fontSizes.md,
    color: '#9ca3af',
    marginTop: padding.medium,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: padding.medium,
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    marginBottom: padding.small,
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
  },
  notificationItemUnread: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
    borderWidth: scale(2),
  },
  notificationContent: {
    flex: 1,
  },
  notificationSender: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#0d9488',
    marginBottom: scale(4),
  },
  notificationMessage: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: scale(4),
  },
  notificationDate: {
    fontSize: fontSizes.xs,
    color: '#64748b',
  },
  unreadDot: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: '#0d9488',
    marginLeft: padding.small,
  },
  backgroundDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    zIndex: 0,
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.6,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    opacity: 0.4,
  },
  mainContent: {
    flexDirection: SCREEN_WIDTH < 768 ? 'column' : 'row',
    flexWrap: 'wrap',
    padding: padding.large,
    gap: scale(28),
    zIndex: 1,
  },
  heroSection: {
    flex: 1,
    width: SCREEN_WIDTH < 768 ? '100%' : '48%',
    minWidth: SCREEN_WIDTH < 768 ? SCREEN_WIDTH - 48 : 400,
    gap: 28,
    paddingTop: 8,
  },
  trustBadge: {
    alignSelf: 'flex-start',
    borderRadius: 28,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  trustBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.15)',
  },
  trustBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0d9488',
    letterSpacing: 0.3,
  },
  mainHeadline: {
    fontSize: getResponsiveValue({
      small: fontSizes['3xl'],
      medium: fontScale(42),
      large: fontScale(50),
      default: fontSizes['3xl'],
    }),
    fontWeight: '900',
    lineHeight: getResponsiveValue({
      small: fontSizes['3xl'] * 1.25,
      medium: fontScale(50),
      large: fontScale(60),
      default: fontSizes['3xl'] * 1.25,
    }),
    color: '#0f172a',
    letterSpacing: -0.8,
  },
  highlightText: {
    color: '#0d9488',
    fontWeight: '900',
  },
  descriptionContainer: {
    marginTop: 12,
  },
  description: {
    fontSize: getResponsiveValue({
      small: fontSizes.md,
      medium: fontSizes.lg,
      default: fontSizes.md,
    }),
    lineHeight: getResponsiveValue({
      small: fontSizes.md * 1.5,
      medium: fontSizes.lg * 1.5,
      default: fontSizes.md * 1.5,
    }),
    color: '#64748b',
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  trustIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(14),
    marginTop: padding.small,
  },
  trustBadgeSmall: {
    borderRadius: scale(22),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  trustBadgeSmallGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
  },
  trustBadgeBlue: {
    ...Platform.select({
      ios: {
        shadowColor: '#3b82f6',
      },
    }),
  },
  trustBadgeSmallText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#166534',
  },
  ctaButtons: {
    gap: 14,
    marginTop: 12,
  },
  primaryButton: {
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  secondaryButtonBlur: {
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderRadius: 16,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  carouselContainer: {
    flex: 1,
    width: SCREEN_WIDTH < 768 ? '100%' : '48%',
    minWidth: SCREEN_WIDTH < 768 ? SCREEN_WIDTH - 40 : 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselWrapper: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
  },
  certificationBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  certificationBadgeBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  certificationBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0d9488',
    letterSpacing: 0.3,
  },
  carousel: {
    width: '100%',
    height: SCREEN_WIDTH < 375 ? 300 : SCREEN_WIDTH < 768 ? 380 : 480,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  carouselScroll: {
    width: '100%',
    height: '100%',
  },
  carouselItem: {
    width: SCREEN_WIDTH * 0.9 - 40,
    height: '100%',
    position: 'relative',
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  carouselOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  carouselInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: padding.large,
    zIndex: 10,
  },
  carouselCarName: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: scale(4),
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  carouselCarPrice: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#0d9488',
    marginBottom: scale(8),
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  carouselCarDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  carouselCarDetail: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  carouselEmpty: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(16),
  },
  carouselEmptyText: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    fontWeight: '600',
  },
  carouselArrow: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -24 }],
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  carouselArrowBlur: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselArrowLeft: {
    left: 16,
  },
  carouselArrowRight: {
    right: 16,
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    backgroundColor: '#ffffff',
    width: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  // Car Listings Styles
  carListingsSection: {
    marginTop: scale(60),
    paddingHorizontal: padding.horizontal,
  },
  carListingsHeader: {
    marginBottom: padding.large * 1.5,
    alignItems: 'center',
  },
  carListingsTitle: {
    fontSize: fontSizes['3xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  carListingsSubtitle: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    textAlign: 'center',
  },
  // Modern Filter Styles
  modernFilterSection: {
    marginBottom: padding.large * 1.5,
    borderRadius: scale(24),
    overflow: 'visible',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modernFilterBlur: {
    padding: padding.large,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: scale(24),
    overflow: 'visible',
  },
  modernSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: scale(16),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: padding.medium,
    overflow: 'hidden',
    minHeight: scale(56),
  },
  searchIconContainer: {
    paddingLeft: padding.medium,
    paddingRight: scale(8),
  },
  modernSearchInput: {
    flex: 1,
    height: scale(56),
    fontSize: fontSizes.md,
    color: '#1f2937',
    fontWeight: '500',
    paddingVertical: 0,
  },
  modernSearchButton: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(16),
    overflow: 'hidden',
    marginLeft: scale(8),
  },
  modernSearchButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernFilterToggle: {
    borderRadius: scale(16),
    overflow: 'hidden',
  },
  modernFilterToggleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    paddingVertical: scale(14),
    paddingHorizontal: padding.medium,
  },
  modernFilterToggleText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#6b7280',
  },
  modernFilterToggleTextActive: {
    color: '#ffffff',
  },
  modernAdvancedFilters: {
    marginTop: padding.medium,
    paddingTop: padding.medium,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    maxHeight: scale(600),
    overflow: 'visible',
  },
  modernAdvancedFiltersScroll: {
    maxHeight: scale(550),
  },
  modernAdvancedFiltersContent: {
    paddingBottom: padding.large * 2,
    gap: 0,
  },
  modernFilterGroup: {
    marginBottom: padding.large,
  },
  modernFilterGroupTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: scale(12),
  },
  modernFilterInputRow: {
    flexDirection: 'row',
    gap: scale(12),
  },
  modernFilterInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: padding.medium,
    gap: scale(8),
    minHeight: scale(56),
  },
  modernFilterInput: {
    flex: 1,
    height: scale(56),
    fontSize: fontSizes.md,
    color: '#1f2937',
    fontWeight: '500',
    paddingVertical: 0,
  },
  modernFilterSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  modernFilterSelectOption: {
    paddingHorizontal: scale(16),
    paddingVertical: scale(10),
    borderRadius: scale(12),
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  modernFilterSelectOptionActive: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488',
  },
  modernFilterSelectOptionText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: '#6b7280',
  },
  modernFilterSelectOptionTextActive: {
    color: '#ffffff',
  },
  resetFiltersButton: {
    marginTop: padding.medium,
    paddingVertical: scale(12),
    alignItems: 'center',
  },
  resetFiltersText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: '#ef4444',
  },
  loadingContainer: {
    padding: padding.large * 2,
    alignItems: 'center',
    gap: scale(16),
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: '#6b7280',
  },
  emptyContainer: {
    padding: padding.large * 2,
    alignItems: 'center',
    gap: scale(16),
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: '#6b7280',
  },
  // Web-Style Car Cards (Matching Web Design)
  carsList: {
    gap: scale(24),
  },
  webStyleCarCard: {
    width: '100%',
    borderRadius: scale(24),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#f3f4f6',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  webStyleCarCardBlur: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
  },
  webStyleCarImageContainer: {
    width: '100%',
    height: scale(224),
    position: 'relative',
    backgroundColor: '#f3f4f6',
  },
  webStyleCarImage: {
    width: '100%',
    height: '100%',
  },
  webStyleCarImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  webStyleCarImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  webStyleCarStatusBadge: {
    position: 'absolute',
    top: scale(16),
    left: scale(16),
    borderRadius: scale(20),
    overflow: 'hidden',
  },
  webStyleCarStatusBadgeGradient: {
    paddingHorizontal: scale(16),
    paddingVertical: scale(8),
  },
  webStyleCarStatusText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  webStyleCarYearBadge: {
    position: 'absolute',
    bottom: scale(16),
    right: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: scale(12),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  webStyleCarYearText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#1f2937',
  },
  webStyleCarInfo: {
    padding: padding.large,
    gap: scale(16),
  },
  webStyleCarTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: scale(12),
    lineHeight: fontSizes['2xl'] * 1.2,
  },
  webStyleCarOwnerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginBottom: scale(12),
  },
  webStyleCarOwnerAvatar: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0d9488',
  },
  webStyleCarOwnerAvatarGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webStyleCarOwnerAvatarText: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#ffffff',
  },
  webStyleCarOwnerInfo: {
    flex: 1,
  },
  webStyleCarOwnerLabel: {
    fontSize: fontSizes.xs,
    color: '#6b7280',
    marginBottom: scale(2),
  },
  webStyleCarOwnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    flexWrap: 'wrap',
  },
  webStyleCarOwnerName: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0d9488',
  },
  webStyleCertifiedBadge: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  webStyleCarDetailsRow: {
    flexDirection: 'row',
    gap: scale(16),
    backgroundColor: '#f9fafb',
    padding: padding.medium,
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: scale(12),
  },
  webStyleCarDetailBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  webStyleCarDetailIconBox: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  webStyleCarDetailValue: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
  },
  webStyleCarVin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingTop: scale(8),
    paddingBottom: scale(8),
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: scale(12),
  },
  webStyleCarVinText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0d9488',
    fontFamily: 'monospace',
  },
  webStyleCarPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(12),
    paddingBottom: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  webStyleCarPriceContainer: {
    flex: 1,
  },
  webStyleCarPrice: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#0d9488',
  },
  webStyleCarActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: '#10b981',
    paddingHorizontal: scale(16),
    paddingVertical: scale(8),
    borderRadius: scale(20),
  },
  webStyleCarActiveText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
  webStyleCarActions: {
    flexDirection: 'row',
    gap: scale(12),
  },
  webStyleCarDetailsButton: {
    flex: 1,
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  webStyleCarDetailsButtonGradient: {
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  webStyleCarDetailsButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#ffffff',
  },
  webStyleCarChatButton: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  webStyleCarChatButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
