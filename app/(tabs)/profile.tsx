import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from 'react-i18next';
import {
  getPadding,
  getFontSizes,
  scale,
  SCREEN_WIDTH,
} from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function ProfileScreen() {
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const { unreadCount } = useNotifications();
  const { t } = useTranslation();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Animation values
  const headerScale = useSharedValue(1);
  const statsOpacity = useSharedValue(0);
  const editButtonScale = useSharedValue(1);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/(tabs)');
      return;
    }
    fetchUserData();
    fetchUserImage();
    fetchStats();
    fetchSubscription();
  }, [isAuthenticated]);

  useEffect(() => {
    // Entrance animations
    headerScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    statsOpacity.value = withTiming(1, { duration: 800 });
  }, []);

  // Refresh on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchUserData();
        fetchUserImage();
        fetchSubscription();
      }
    });
    return () => sub.remove();
  }, []);

  const fetchUserData = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest('/auth/me');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          setUserData(data.user);
          setEditForm({
            firstName: data.user.firstName || '',
            lastName: data.user.lastName || '',
            phone: data.user.phone || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserImage = async () => {
    if (!user?._id) return;
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
  };

  const fetchStats = async () => {
    if (!user || user.type !== 'user') return;
    try {
      const response = await apiRequest('/seller-stats');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.stats) {
          setStats(data.stats);
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchSubscription = async () => {
    if (!user || user.type !== 'user') return;
    try {
      const response = await apiRequest('/abonnement/my-subscription');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.hasSubscription && data.subscription) {
          setSubscription(data.subscription);
        }
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
  };

  // Timer effect to update remaining time
  useEffect(() => {
    if (!subscription || !subscription.date_end) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endDate = new Date(subscription.date_end).getTime();
      const difference = endDate - now;

      if (difference <= 0) {
      setTimeRemaining(t('subscription.expired'));
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeRemaining(`${days}j ${hours}h ${minutes}m ${seconds}s`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [subscription]);

  const handleImagePicker = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('profile.permissionPhotos'), t('profile.permissionPhotosBody'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadProfileImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), t('errors.selectImageFailed'));
    }
  };

  const uploadProfileImage = async (imageUri: string) => {
    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      const filename = imageUri.split('/').pop() || 'profile.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('profileImage', {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      // For FormData, we need to let fetch set Content-Type automatically (with boundary)
      // So we'll make a direct fetch call instead of using apiRequest
      const cleanUrl = getBackendUrl().replace(/\/$/, '');
      const url = `${cleanUrl}/api/user-image/upload`;

      // Get token
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage.getItem('auth_token');

      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Don't set Content-Type - let fetch set it automatically with boundary

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.userImage?.image) {
          setUserImage(getImageUrl(data.userImage.image));
          Alert.alert(t('common.success'), t('profile.photoUpdated'));
        }
      } else {
        const errorData = await response.json();
        Alert.alert(t('common.error'), errorData.message || t('errors.updatePhotoFailed'));
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common.error'), t('errors.uploadImageFailed'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      Alert.alert(t('common.error'), t('profile.nameRequired'));
      return;
    }

    try {
      setIsUpdating(true);
      const response = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          await refreshUser();
          await fetchUserData();
          setShowEditModal(false);
          Alert.alert(t('common.success'), t('profile.profileUpdated'));
        }
      } else {
        const errorData = await response.json();
        Alert.alert(t('common.error'), errorData.message || t('errors.updateProfileFailed'));
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert(t('common.error'), t('errors.updateProfileFailed'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      Alert.alert(t('common.error'), t('profile.allFieldsRequired'));
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert(t('common.error'), t('profile.passwordsNoMatch'));
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      Alert.alert(t('common.error'), t('profile.passwordMin8'));
      return;
    }

    try {
      setIsUpdating(true);
      const response = await apiRequest('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setShowPasswordModal(false);
          setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
          Alert.alert(t('common.success'), t('profile.passwordUpdated'));
        }
      } else {
        const errorData = await response.json();
        Alert.alert(t('common.error'), errorData.message || t('errors.changePasswordFailed'));
      }
    } catch (error) {
      console.error('Error changing password:', error);
      Alert.alert(t('common.error'), t('errors.changePasswordFailed'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('profile.logoutTitle'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  const getUserInitials = () => {
    if (!userData) return 'U';
    const firstName = userData.firstName || '';
    const lastName = userData.lastName || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) {
      return firstName.substring(0, 2).toUpperCase();
    }
    if (userData.email) {
      return userData.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: headerScale.value }],
  }));

  const statsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: statsOpacity.value,
  }));

  const editButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: editButtonScale.value }],
  }));

  const handleEditButtonPress = () => {
    editButtonScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 300 })
    );
    setShowEditModal(true);
  };

  const getCountdownParts = () => {
    if (!subscription?.date_end) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    const diff = new Date(subscription.date_end).getTime() - Date.now();
    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, expired: false };
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0d9488" />
          <ThemedText style={styles.loadingText}>{t('common.loading')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  const countdown = getCountdownParts();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Background decoration */}
        <View style={styles.backgroundDecoration}>
          <LinearGradient
            colors={['rgba(13, 148, 136, 0.08)', 'transparent']}
            style={styles.gradientCircle1}
          />
          <LinearGradient
            colors={['rgba(20, 184, 166, 0.06)', 'transparent']}
            style={styles.gradientCircle2}
          />
        </View>

        {/* Profile Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={[styles.profileHeader, headerAnimatedStyle]}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerBlur}
          >
            {/* Profile Image */}
            <View style={styles.profileImageContainer}>
              {userImage ? (
                <Image
                  source={{ uri: userImage }}
                  style={styles.profileImage}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={['#0d9488', '#14b8a6', '#2dd4bf']}
                  style={styles.profileImageGradient}
                >
                  <ThemedText style={styles.profileImageText}>
                    {getUserInitials()}
                  </ThemedText>
                </LinearGradient>
              )}
              <TouchableOpacity
                onPress={handleImagePicker}
                style={styles.editImageButton}
                disabled={isUploadingImage}
              >
                <LinearGradient
                  colors={['#0d9488', '#14b8a6']}
                  style={styles.editImageButtonGradient}
                >
                  {isUploadingImage ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <IconSymbol name="camera.fill" size={16} color="#ffffff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* User Info */}
            <View style={styles.userInfo}>
              <ThemedText style={styles.userName}>
                {userData?.firstName && userData?.lastName
                  ? `${userData.firstName} ${userData.lastName}`
                  : userData?.email || t('profile.defaultUser')}
              </ThemedText>
              <ThemedText style={styles.userEmail}>{userData?.email}</ThemedText>

              {/* Status Badges */}
              <View style={styles.badgesContainer}>
                {userData?.certifie && (
                  <View style={styles.badge}>
                    <LinearGradient
                      colors={['#f0fdf4', '#dcfce7']}
                      style={styles.badgeGradient}
                    >
                      <IconSymbol name="checkmark.seal.fill" size={14} color="#10b981" />
                      <ThemedText style={styles.badgeText}>Certifié</ThemedText>
                    </LinearGradient>
                  </View>
                )}
                {userData?.status && (
                  <View style={styles.badge}>
                    <LinearGradient
                      colors={['#eff6ff', '#dbeafe']}
                      style={styles.badgeGradient}
                    >
                      <IconSymbol name="checkmark.circle.fill" size={14} color="#3b82f6" />
                      <ThemedText style={styles.badgeText}>{t('profile.active') || 'Active'}</ThemedText>
                    </LinearGradient>
                  </View>
                )}
                {userData?.role === 'admin' && (
                  <View style={styles.badge}>
                    <LinearGradient
                      colors={['#fef3c7', '#fde68a']}
                      style={styles.badgeGradient}
                    >
                      <IconSymbol name="star.fill" size={14} color="#f59e0b" />
                      <ThemedText style={styles.badgeText}>{t('profile.admin') || 'Admin'}</ThemedText>
                    </LinearGradient>
                  </View>
                )}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Stats Cards */}
        {false && stats && user?.type === 'user' && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(200).springify()}
            style={[styles.statsContainer, statsAnimatedStyle]}
          >
            <View style={styles.statsRow}>
              <Animated.View
                entering={FadeInDown.duration(600).delay(100).springify()}
                style={[styles.statCard, styles.statCardActive]}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.statCardBlur}
                >
                  <View style={styles.statIconContainer}>
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.statIconGradient}
                    >
                      <IconSymbol name="car.fill" size={24} color="#ffffff" />
                    </LinearGradient>
                  </View>
                  <Animated.View
                    entering={FadeInDown.duration(600).delay(200).springify()}
                  >
                    <ThemedText style={styles.statValue}>{stats.activeCars || 0}</ThemedText>
                  </Animated.View>
                  <ThemedText style={styles.statLabel}>Voitures actives</ThemedText>
                </LinearGradient>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.duration(600).delay(200).springify()}
                style={[styles.statCard, styles.statCardRdv]}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.statCardBlur}
                >
                  <View style={styles.statIconContainer}>
                    <LinearGradient
                      colors={['#3b82f6', '#2563eb']}
                      style={styles.statIconGradient}
                    >
                      <IconSymbol name="calendar.fill" size={24} color="#ffffff" />
                    </LinearGradient>
                  </View>
                  <Animated.View
                    entering={FadeInDown.duration(600).delay(300).springify()}
                  >
                    <ThemedText style={styles.statValue}>{stats.upcomingAppointments || 0}</ThemedText>
                  </Animated.View>
                  <ThemedText style={styles.statLabel}>Rendez-vous</ThemedText>
                </LinearGradient>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.duration(600).delay(300).springify()}
                style={[styles.statCard, styles.statCardSold]}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.statCardBlur}
                >
                  <View style={styles.statIconContainer}>
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      style={styles.statIconGradient}
                    >
                      <IconSymbol name="checkmark.circle.fill" size={24} color="#ffffff" />
                    </LinearGradient>
                  </View>
                  <Animated.View
                    entering={FadeInDown.duration(600).delay(400).springify()}
                  >
                    <ThemedText style={styles.statValue}>{stats.soldCars || 0}</ThemedText>
                  </Animated.View>
                  <ThemedText style={styles.statLabel}>Vendues</ThemedText>
                </LinearGradient>
              </Animated.View>
            </View>
          </Animated.View>
        )}

        {/* Subscription Section */}
        {subscription && subscription.type_abonnement && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(350).springify()}
            style={styles.subscriptionContainer}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.subscriptionCard}
            >
              <View style={styles.subscriptionHeader}>
                <View style={styles.subscriptionIconContainer}>
                  <LinearGradient
                    colors={['#8b5cf6', '#7c3aed']}
                    style={styles.subscriptionIconGradient}
                  >
                    <IconSymbol name="star.fill" size={24} color="#ffffff" />
                  </LinearGradient>
                </View>
                <View style={styles.subscriptionHeaderText}>
                  <ThemedText style={styles.subscriptionTitle}>{t('subscription.activeTitle')}</ThemedText>
                  <ThemedText style={styles.subscriptionType}>
                    {subscription.type_abonnement.name || t('subscription.plan')}
                  </ThemedText>
                </View>
                <View style={styles.subscriptionStatusBadge}>
                  <IconSymbol name="checkmark.circle.fill" size={14} color="#10b981" />
                  <ThemedText style={styles.subscriptionStatusText}>{t('subscription.statusActive')}</ThemedText>
                </View>
              </View>

              <View style={styles.subscriptionDetails}>
                <View style={styles.subscriptionDetailRow}>
                  <ThemedText style={styles.subscriptionDetailLabel}>{t('subscription.startDate')}</ThemedText>
                  <ThemedText style={styles.subscriptionDetailValue}>
                    {new Date(subscription.date_start).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </ThemedText>
                </View>
                <View style={styles.subscriptionDetailRow}>
                  <ThemedText style={styles.subscriptionDetailLabel}>{t('subscription.endDate')}</ThemedText>
                  <ThemedText style={styles.subscriptionDetailValue}>
                    {new Date(subscription.date_end).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </ThemedText>
                </View>
              </View>

              {/* Timer */}
              <View style={styles.timerContainer}>
                <LinearGradient
                  colors={['#f0fdf4', '#dcfce7']}
                  style={styles.timerGradient}
                >
                  <View style={styles.timerHeader}>
                    <IconSymbol name="clock.fill" size={18} color="#10b981" />
                    <ThemedText style={styles.timerLabel}>Temps restant</ThemedText>
                  </View>

                  {countdown.expired ? (
                    <ThemedText style={styles.timerValue}>Expiré</ThemedText>
                  ) : (
                    <View style={styles.timerBoxesRow}>
                      <View style={styles.timerBox}>
                        <ThemedText style={styles.timerBoxValue}>{countdown.days}</ThemedText>
                        <ThemedText style={styles.timerBoxLabel}>{t('subscription.days')}</ThemedText>
                      </View>
                      <View style={styles.timerBox}>
                        <ThemedText style={styles.timerBoxValue}>{countdown.hours}</ThemedText>
                        <ThemedText style={styles.timerBoxLabel}>{t('subscription.hours')}</ThemedText>
                      </View>
                      <View style={styles.timerBox}>
                        <ThemedText style={styles.timerBoxValue}>{countdown.minutes}</ThemedText>
                        <ThemedText style={styles.timerBoxLabel}>{t('subscription.minutes')}</ThemedText>
                      </View>
                      <View style={styles.timerBox}>
                        <ThemedText style={styles.timerBoxValue}>{countdown.seconds}</ThemedText>
                        <ThemedText style={styles.timerBoxLabel}>{t('subscription.seconds')}</ThemedText>
                      </View>
                    </View>
                  )}
                  <ThemedText style={styles.timerSubValue}>{timeRemaining || t('subscription.calculating')}</ThemedText>
                </LinearGradient>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Action Cards */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(400).springify()}
          style={styles.actionsContainer}
        >
          {/* Edit Profile */}
          <AnimatedTouchableOpacity
            onPress={handleEditButtonPress}
            style={[styles.actionCard, editButtonAnimatedStyle]}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.actionCardBlur}
            >
              <View style={styles.actionContent}>
                <View style={styles.actionIconContainer}>
                  <LinearGradient
                    colors={['#0d9488', '#14b8a6']}
                    style={styles.actionIconGradient}
                  >
                    <IconSymbol name="pencil" size={20} color="#ffffff" />
                  </LinearGradient>
                </View>
                <View style={styles.actionTextContainer}>
                  <ThemedText style={styles.actionTitle}>{t('profile.editProfile')}</ThemedText>
                  <ThemedText style={styles.actionSubtitle}>{t('profile.updateInfo')}</ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9ca3af" />
              </View>
            </LinearGradient>
          </AnimatedTouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity
            onPress={() => setShowPasswordModal(true)}
            style={styles.actionCard}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.actionCardBlur}
            >
              <View style={styles.actionContent}>
                <View style={styles.actionIconContainer}>
                  <LinearGradient
                    colors={['#3b82f6', '#2563eb']}
                    style={styles.actionIconGradient}
                  >
                    <IconSymbol name="lock.fill" size={20} color="#ffffff" />
                  </LinearGradient>
                </View>
                <View style={styles.actionTextContainer}>
                  <ThemedText style={styles.actionTitle}>{t('profile.changePassword')}</ThemedText>
                  <ThemedText style={styles.actionSubtitle}>{t('profile.updatePassword')}</ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9ca3af" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* My Cars */}
          {user?.type === 'user' && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/cars')}
              style={styles.actionCard}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.actionCardBlur}
              >
                <View style={styles.actionContent}>
                  <View style={styles.actionIconContainer}>
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      style={styles.actionIconGradient}
                    >
                      <IconSymbol name="car.fill" size={20} color="#ffffff" />
                    </LinearGradient>
                  </View>
                  <View style={styles.actionTextContainer}>
                    <ThemedText style={styles.actionTitle}>{t('cars.title')}</ThemedText>
                    <ThemedText style={styles.actionSubtitle}>{t('profile.manageListings')}</ThemedText>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color="#9ca3af" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.actionCard}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
              style={styles.actionCardBlur}
            >
              <View style={styles.actionContent}>
                <View style={styles.actionIconContainer}>
                  <LinearGradient
                    colors={['#ef4444', '#dc2626']}
                    style={styles.actionIconGradient}
                  >
                    <IconSymbol name="arrow.right.square.fill" size={20} color="#ffffff" />
                  </LinearGradient>
                </View>
                <View style={styles.actionTextContainer}>
                  <ThemedText style={[styles.actionTitle, styles.logoutText]}>
                    {t('profile.logout')}
                  </ThemedText>
                  <ThemedText style={styles.actionSubtitle}>{t('profile.logoutSubtitle')}</ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#9ca3af" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowEditModal(false)}
            />
            <Animated.View
              entering={FadeInDown.duration(300).springify()}
              style={styles.modalContent}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.modalBlur}
              >
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <ThemedText style={styles.modalTitle}>{t('profile.editProfile')}</ThemedText>
                  <TouchableOpacity
                    onPress={() => setShowEditModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <IconSymbol name="xmark.circle.fill" size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                {/* Form */}
                <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>{t('register.firstName')}</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={editForm.firstName}
                      onChangeText={(text) =>
                        setEditForm({ ...editForm, firstName: text })
                      }
                      placeholder={t('register.firstName')}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>{t('register.lastName')}</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={editForm.lastName}
                      onChangeText={(text) =>
                        setEditForm({ ...editForm, lastName: text })
                      }
                      placeholder={t('register.lastName')}
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>{t('register.phone')}</ThemedText>
                    <TextInput
                      style={styles.input}
                      value={editForm.phone}
                      onChangeText={(text) =>
                        setEditForm({ ...editForm, phone: text })
                      }
                      placeholder="+213 XXX XX XX XX"
                      placeholderTextColor="#9ca3af"
                      keyboardType="phone-pad"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>{t('auth.email')}</ThemedText>
                    <TextInput
                      style={[styles.input, styles.inputDisabled]}
                      value={userData?.email || ''}
                      editable={false}
                      placeholderTextColor="#9ca3af"
                    />
                    <ThemedText style={styles.inputHint}>
                      L'email ne peut pas être modifié
                    </ThemedText>
                  </View>
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    onPress={() => setShowEditModal(false)}
                    style={styles.modalCancelButton}
                  >
                    <ThemedText style={styles.modalCancelText}>{t('common.cancel')}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleUpdateProfile}
                    disabled={isUpdating}
                    style={styles.modalSaveButton}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.modalSaveButtonGradient}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.modalSaveText}>{t('common.save')}</ThemedText>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={showPasswordModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowPasswordModal(false)}
            />
            <Animated.View
              entering={FadeInDown.duration(300).springify()}
              style={styles.modalContent}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                style={styles.modalBlur}
              >
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <ThemedText style={styles.modalTitle}>{t('profile.changePassword')}</ThemedText>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPasswordModal(false);
                      setPasswordForm({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      });
                    }}
                    style={styles.modalCloseButton}
                  >
                    <IconSymbol name="xmark.circle.fill" size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                {/* Form */}
                <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>{t('profile.currentPassword')}</ThemedText>
                    <View style={styles.passwordInputWrapper}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.currentPassword}
                        onChangeText={(text) =>
                          setPasswordForm({ ...passwordForm, currentPassword: text })
                        }
                        placeholder="••••••••"
                        placeholderTextColor="#9ca3af"
                        secureTextEntry={!showPasswords.current}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setShowPasswords({
                            ...showPasswords,
                            current: !showPasswords.current,
                          })
                        }
                        style={styles.eyeButton}
                      >
                        <IconSymbol
                          name={showPasswords.current ? 'eye.slash.fill' : 'eye.fill'}
                          size={20}
                          color="#6b7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>Nouveau mot de passe</ThemedText>
                    <View style={styles.passwordInputWrapper}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.newPassword}
                        onChangeText={(text) =>
                          setPasswordForm({ ...passwordForm, newPassword: text })
                        }
                        placeholder="••••••••"
                        placeholderTextColor="#9ca3af"
                        secureTextEntry={!showPasswords.new}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setShowPasswords({
                            ...showPasswords,
                            new: !showPasswords.new,
                          })
                        }
                        style={styles.eyeButton}
                      >
                        <IconSymbol
                          name={showPasswords.new ? 'eye.slash.fill' : 'eye.fill'}
                          size={20}
                          color="#6b7280"
                        />
                      </TouchableOpacity>
                    </View>
                    <ThemedText style={styles.inputHint}>
                      Min. 8 caractères, majuscule, minuscule, chiffre et caractère spécial
                    </ThemedText>
                  </View>

                  <View style={styles.inputContainer}>
                    <ThemedText style={styles.inputLabel}>
                      Confirmer le nouveau mot de passe
                    </ThemedText>
                    <View style={styles.passwordInputWrapper}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.confirmPassword}
                        onChangeText={(text) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: text })
                        }
                        placeholder="••••••••"
                        placeholderTextColor="#9ca3af"
                        secureTextEntry={!showPasswords.confirm}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setShowPasswords({
                            ...showPasswords,
                            confirm: !showPasswords.confirm,
                          })
                        }
                        style={styles.eyeButton}
                      >
                        <IconSymbol
                          name={showPasswords.confirm ? 'eye.slash.fill' : 'eye.fill'}
                          size={20}
                          color="#6b7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>

                {/* Modal Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPasswordModal(false);
                      setPasswordForm({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      });
                    }}
                    style={styles.modalCancelButton}
                  >
                    <ThemedText style={styles.modalCancelText}>{t('common.cancel')}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleChangePassword}
                    disabled={isUpdating}
                    style={styles.modalSaveButton}
                  >
                    <LinearGradient
                      colors={['#0d9488', '#14b8a6']}
                      style={styles.modalSaveButtonGradient}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <ThemedText style={styles.modalSaveText}>Modifier</ThemedText>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: scale(100),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: scale(16),
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: '#6b7280',
  },
  backgroundDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 400,
    zIndex: 0,
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
  },
  profileHeader: {
    margin: padding.large,
    marginTop: padding.large * 1.5,
    borderRadius: scale(24),
    overflow: 'hidden',
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  headerBlur: {
    padding: padding.large * 1.5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: padding.medium,
  },
  profileImage: {
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  profileImageGradient: {
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  profileImageText: {
    fontSize: fontSizes['3xl'],
    fontWeight: '800',
    color: '#ffffff',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#ffffff',
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
  editImageButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    alignItems: 'center',
    width: '100%',
  },
  userName: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  userEmail: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    marginBottom: padding.medium,
    textAlign: 'center',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: scale(8),
  },
  badge: {
    borderRadius: scale(20),
    overflow: 'hidden',
  },
  badgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#1f2937',
  },
  statsContainer: {
    marginHorizontal: padding.large,
    marginBottom: padding.large,
    zIndex: 1,
  },
  statsRow: {
    flexDirection: 'column',
    gap: scale(10),
  },
  statCard: {
    width: '100%',
    borderRadius: scale(20),
    overflow: 'hidden',
    borderWidth: 1.8,
    borderColor: '#e2e8f0',
    minHeight: scale(100),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  statCardActive: {
    borderColor: '#99f6e4',
  },
  statCardRdv: {
    borderColor: '#bfdbfe',
  },
  statCardSold: {
    borderColor: '#86efac',
  },
  statCardBlur: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: scale(20),
  },
  statIconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  statIconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: scale(2),
    letterSpacing: -0.5,
    textAlign: 'right',
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  subscriptionContainer: {
    marginHorizontal: padding.large,
    marginBottom: padding.large,
    zIndex: 1,
  },
  subscriptionCard: {
    borderRadius: scale(20),
    padding: padding.large,
    borderWidth: 1.5,
    borderColor: '#ddd6fe',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: padding.large,
    gap: scale(12),
  },
  subscriptionIconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  subscriptionIconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionHeaderText: {
    flex: 1,
  },
  subscriptionStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingHorizontal: scale(10),
    paddingVertical: scale(6),
    borderRadius: scale(999),
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  subscriptionStatusText: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#10b981',
  },
  subscriptionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: scale(2),
  },
  subscriptionType: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  subscriptionDetails: {
    marginBottom: padding.large,
    gap: scale(12),
  },
  subscriptionDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: scale(8),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  subscriptionDetailLabel: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    fontWeight: '600',
  },
  subscriptionDetailValue: {
    fontSize: fontSizes.md,
    color: '#1f2937',
    fontWeight: '700',
  },
  timerContainer: {
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#ffffff',
  },
  timerGradient: {
    gap: scale(10),
    padding: padding.medium,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
  },
  timerLabel: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#10b981',
  },
  timerValue: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'center',
  },
  timerBoxesRow: {
    flexDirection: 'row',
    gap: scale(6),
    justifyContent: 'space-between',
  },
  timerBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: '#d1fae5',
    alignItems: 'center',
    paddingVertical: scale(9),
  },
  timerBoxValue: {
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: '#047857',
    lineHeight: scale(20),
    fontVariant: ['tabular-nums'],
  },
  timerBoxLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#10b981',
  },
  timerSubValue: {
    fontSize: fontSizes.xs,
    color: '#047857',
    textAlign: 'center',
    fontWeight: '700',
  },
  actionsContainer: {
    marginHorizontal: padding.large,
    gap: scale(12),
    zIndex: 1,
  },
  actionCard: {
    borderRadius: scale(16),
    overflow: 'hidden',
    marginBottom: scale(12),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  actionCardBlur: {
    padding: padding.large,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(16),
  },
  actionIconContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  actionIconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: scale(2),
  },
  actionSubtitle: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
  },
  logoutText: {
    color: '#ef4444',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: 'transparent',
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    maxHeight: '90%',
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
  modalBlur: {
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: padding.large,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#1f2937',
  },
  modalCloseButton: {
    padding: scale(4),
  },
  modalForm: {
    maxHeight: 400,
    padding: padding.large,
  },
  inputContainer: {
    marginBottom: padding.large,
  },
  inputLabel: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
    color: '#374151',
    marginBottom: scale(8),
  },
  input: {
    height: scale(48),
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    paddingHorizontal: padding.medium,
    fontSize: fontSizes.md,
    color: '#1f2937',
  },
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  passwordInput: {
    flex: 1,
    height: scale(48),
    paddingHorizontal: padding.medium,
    fontSize: fontSizes.md,
    color: '#1f2937',
  },
  eyeButton: {
    padding: padding.medium,
  },
  inputHint: {
    fontSize: fontSizes.xs,
    color: '#9ca3af',
    marginTop: scale(4),
  },
  modalFooter: {
    flexDirection: 'row',
    gap: scale(12),
    padding: padding.large,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalCancelButton: {
    flex: 1,
    height: scale(48),
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  modalCancelText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#6b7280',
  },
  modalSaveButton: {
    flex: 1,
    borderRadius: scale(12),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  modalSaveButtonGradient: {
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#ffffff',
  },
});
