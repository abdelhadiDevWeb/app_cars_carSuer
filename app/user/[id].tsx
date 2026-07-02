import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getImageUrl } from '@/utils/backend';
import { getRouteParamId } from '@/utils/openChatWithUser';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

const padding = getPadding();
const fontSizes = getFontSizes();

interface User {
  _id: string;
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: boolean;
  role?: string;
  certifie?: boolean;
}

interface Rate {
  _id: string;
  id?: string;
  id_rater: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  message: string | null;
  star: number;
  createdAt: string;
}

interface SellerCar {
  _id: string;
  id?: string;
  brand: string;
  model: string;
  year: number;
  km: number;
  price: number;
  status: string;
  images?: string[];
}

export default function UserDetailsPage() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const userId = getRouteParamId(params.id as string | string[] | undefined);
  const { user: currentUser, isAuthenticated, token } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rates, setRates] = useState<Rate[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [loadingRates, setLoadingRates] = useState(true);
  const [canRate, setCanRate] = useState(false);
  const [userRate, setUserRate] = useState<Rate | null>(null);
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingStar, setRatingStar] = useState(0);
  const [ratingMessage, setRatingMessage] = useState('');
  const [isSubmittingRate, setIsSubmittingRate] = useState(false);
  const [sellerCars, setSellerCars] = useState<SellerCar[]>([]);
  const [loadingCars, setLoadingCars] = useState(true);

  // Hide default header
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const loadRatingMeta = useCallback(async () => {
    if (!userId || !currentUser || !token || !isAuthenticated || userId === currentUser._id) {
      setCanRate(false);
      return;
    }

    try {
      const res = await apiRequest(`/rate/user/${userId}/can-rate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setCanRate(data.canRate || false);
      }
    } catch (error) {
      console.error('Error checking if can rate:', error);
    }

    try {
      const res = await apiRequest(`/rate/user/${userId}/my-rate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.rate) {
          setUserRate(data.rate);
          setRatingStar(data.rate.star);
          setRatingMessage(data.rate.message || '');
        }
      }
    } catch (error) {
      console.error('Error fetching user rate:', error);
    }
  }, [userId, currentUser, token, isAuthenticated]);

  const loadUserPageData = useCallback(async (silent = false) => {
    if (!userId) {
      if (!silent) {
        setLoading(false);
        setError('Utilisateur non trouvé');
      }
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const userRes = await apiRequest(`/auth/user/${encodeURIComponent(userId)}`);
      const userData = await userRes.json().catch(() => null);

      if (!userRes.ok || !userData?.ok || !userData.user) {
        if (!silent) {
          setError(
            typeof userData?.message === 'string'
              ? userData.message
              : 'Utilisateur non trouvé',
          );
        }
        return;
      }

      setUser(userData.user);
      setError('');

      const imageRes = await apiRequest(`/user-image/${encodeURIComponent(userId)}`);
      if (imageRes.ok) {
        const imageData = await imageRes.json().catch(() => null);
        if (imageData?.ok && imageData.userImage) {
          setProfileImage(imageData.userImage.image);
        }
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      if (!silent) {
        setError('Erreur de connexion. Veuillez réessayer.');
      }
    } finally {
      if (!silent) setLoading(false);
    }

    try {
      if (!silent) setLoadingRates(true);
      const res = await apiRequest(`/rate/user/${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          setRates(data.rates || []);
          setAverageRating(data.averageRating || 0);
          setTotalRatings(data.totalRatings || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching rates:', error);
    } finally {
      if (!silent) setLoadingRates(false);
    }

    try {
      if (!silent) setLoadingCars(true);
      const carsRes = await apiRequest(`/car/by-owner/${encodeURIComponent(userId)}`);
      if (carsRes.ok) {
        const carsData = await carsRes.json().catch(() => null);
        if (carsData?.ok && Array.isArray(carsData.cars)) {
          setSellerCars(carsData.cars);
        } else {
          setSellerCars([]);
        }
      } else {
        setSellerCars([]);
      }
    } catch (error) {
      console.error('Error fetching seller cars:', error);
      setSellerCars([]);
    } finally {
      if (!silent) setLoadingCars(false);
    }

    await loadRatingMeta();
  }, [userId, loadRatingMeta]);

  useEffect(() => {
    void loadUserPageData(false);
  }, [loadUserPageData]);

  useFocusEffect(
    useCallback(() => {
      if (userId) void loadUserPageData(true);
    }, [userId, loadUserPageData])
  );

  const { refreshing, onRefresh } = usePullToRefresh(() => loadUserPageData(true));

  const handleSubmitRate = async () => {
    if (!ratingStar || ratingStar < 1 || ratingStar > 5) {
      Alert.alert('Erreur', 'Veuillez sélectionner une note entre 1 et 5 étoiles');
      return;
    }

    if (!token) {
      Alert.alert('Erreur', 'Vous devez être connecté pour noter');
      return;
    }

    try {
      setIsSubmittingRate(true);
      const res = await apiRequest('/rate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: userId,
          targetType: 'User',
          star: ratingStar,
          message: ratingMessage.trim() || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          Alert.alert('Succès', userRate ? 'Note mise à jour avec succès' : 'Note ajoutée avec succès');
          setShowRateModal(false);
          // Refresh rates
          const ratesRes = await apiRequest(`/rate/user/${userId}`);
          if (ratesRes.ok) {
            const ratesData = await ratesRes.json();
            if (ratesData.ok) {
              setRates(ratesData.rates || []);
              setAverageRating(ratesData.averageRating || 0);
              setTotalRatings(ratesData.totalRatings || 0);
            }
          }
          // Refresh user rate
          const userRateRes = await apiRequest(`/rate/user/${userId}/my-rate`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (userRateRes.ok) {
            const userRateData = await userRateRes.json();
            if (userRateData.ok && userRateData.rate) {
              setUserRate(userRateData.rate);
            }
          }
        }
      } else {
        const data = await res.json();
        Alert.alert('Erreur', data.message || 'Erreur lors de l\'envoi de la note');
      }
    } catch (error) {
      console.error('Error submitting rate:', error);
      Alert.alert('Erreur', 'Erreur lors de l\'envoi de la note');
    } finally {
      setIsSubmittingRate(false);
    }
  };

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

  const handlePhonePress = () => {
    if (user?.phone) {
      Linking.openURL(`tel:${user.phone}`);
    }
  };

  const handleEmailPress = () => {
    if (user?.email) {
      Linking.openURL(`mailto:${user.email}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0d9488" />
          <ThemedText style={styles.loadingText}>Chargement...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={scale(48)} color="#ef4444" />
          <ThemedText style={styles.errorText}>{error || "Utilisateur non trouvé"}</ThemedText>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <ThemedText style={styles.backButtonText}>Retour</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0d9488" colors={['#0d9488']} />
        }
      >
        {/* Profile Card */}
        <Animated.View
          entering={FadeInDown.duration(500)}
          style={styles.profileCard}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.profileCardGradient}
          >
            <View style={styles.profileHeader}>
              {profileImage ? (
                <View style={styles.avatarContainer}>
                  <Image
                    source={{ uri: getImageUrl(profileImage) || '' }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                  {user.certifie && (
                    <View style={styles.certifiedBadge}>
                      <IconSymbol name="checkmark.seal.fill" size={scale(16)} color="#ffffff" />
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.avatarContainer}>
                  <LinearGradient
                    colors={['#0d9488', '#14b8a6']}
                    style={styles.avatarGradient}
                  >
                    <ThemedText style={styles.avatarText}>{getUserInitials()}</ThemedText>
                  </LinearGradient>
                  {user.certifie && (
                    <View style={styles.certifiedBadge}>
                      <IconSymbol name="checkmark.seal.fill" size={scale(16)} color="#ffffff" />
                    </View>
                  )}
                </View>
              )}
              
              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <ThemedText style={styles.name}>
                    {user.firstName} {user.lastName}
                  </ThemedText>
                  {user.certifie && (
                    <View style={styles.certifiedTag}>
                      <IconSymbol name="checkmark.seal.fill" size={scale(12)} color="#22c55e" />
                      <ThemedText style={styles.certifiedTagText}>Certifié</ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.email}>{user.email}</ThemedText>
                <View style={styles.statusContainer}>
                  {user.status ? (
                    <View style={styles.statusBadgeActive}>
                      <ThemedText style={styles.statusBadgeText}>Compte vérifié</ThemedText>
                    </View>
                  ) : (
                    <View style={styles.statusBadgePending}>
                      <ThemedText style={styles.statusBadgeTextPending}>Compte en attente</ThemedText>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Contact Info */}
            <View style={styles.contactSection}>
              <ThemedText style={styles.sectionTitle}>Informations de contact</ThemedText>
              <View style={styles.contactList}>
                <TouchableOpacity
                  onPress={handlePhonePress}
                  style={styles.contactItem}
                  activeOpacity={0.7}
                >
                  <View style={styles.contactIcon}>
                    <IconSymbol name="phone.fill" size={scale(18)} color="#0d9488" />
                  </View>
                  <ThemedText style={styles.contactText}>{user.phone}</ThemedText>
                  <IconSymbol name="chevron.right" size={scale(16)} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEmailPress}
                  style={styles.contactItem}
                  activeOpacity={0.7}
                >
                  <View style={styles.contactIcon}>
                    <IconSymbol name="envelope.fill" size={scale(18)} color="#0d9488" />
                  </View>
                  <ThemedText style={styles.contactText}>{user.email}</ThemedText>
                  <IconSymbol name="chevron.right" size={scale(16)} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Ratings Section */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100)}
          style={styles.ratingsCard}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.ratingsCardGradient}
          >
            <View style={styles.ratingsHeader}>
              <ThemedText style={styles.sectionTitle}>Avis et notes</ThemedText>
              {canRate && (
                <TouchableOpacity
                  onPress={() => {
                    if (userRate) {
                      setRatingStar(userRate.star);
                      setRatingMessage(userRate.message || '');
                    } else {
                      setRatingStar(0);
                      setRatingMessage('');
                    }
                    setShowRateModal(true);
                  }}
                  style={styles.rateButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#0d9488', '#14b8a6']}
                    style={styles.rateButtonGradient}
                  >
                    <IconSymbol name="star.fill" size={scale(16)} color="#ffffff" />
                    <ThemedText style={styles.rateButtonText}>
                      {userRate ? 'Modifier ma note' : 'Noter ce vendeur'}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {/* Average Rating */}
            {loadingRates ? (
              <View style={styles.loadingRatesContainer}>
                <ActivityIndicator size="large" color="#0d9488" />
              </View>
            ) : totalRatings > 0 ? (
              <>
                <View style={styles.averageRatingContainer}>
                  <View style={styles.averageRatingBox}>
                    <ThemedText style={styles.averageRatingValue}>
                      {averageRating.toFixed(1)}
                    </ThemedText>
                    <View style={styles.starsContainer}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <IconSymbol
                          key={star}
                          name={star <= Math.round(averageRating) ? 'star.fill' : 'star'}
                          size={scale(20)}
                          color={star <= Math.round(averageRating) ? '#fbbf24' : '#d1d5db'}
                        />
                      ))}
                    </View>
                    <ThemedText style={styles.totalRatingsText}>
                      {totalRatings} avis
                    </ThemedText>
                  </View>
                </View>

                {/* Ratings List */}
                <View style={styles.ratingsList}>
                  {rates.map((rate) => (
                    <View key={rate._id || rate.id} style={styles.ratingItem}>
                      <View style={styles.ratingHeader}>
                        <View>
                          <ThemedText style={styles.raterName}>
                            {rate.id_rater?.firstName} {rate.id_rater?.lastName}
                          </ThemedText>
                          <View style={styles.ratingStars}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <IconSymbol
                                key={star}
                                name={star <= rate.star ? 'star.fill' : 'star'}
                                size={scale(14)}
                                color={star <= rate.star ? '#fbbf24' : '#d1d5db'}
                              />
                            ))}
                          </View>
                        </View>
                        <ThemedText style={styles.ratingDate}>
                          {new Date(rate.createdAt).toLocaleDateString('fr-FR')}
                        </ThemedText>
                      </View>
                      {rate.message && (
                        <ThemedText style={styles.ratingMessage}>{rate.message}</ThemedText>
                      )}
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.noRatingsContainer}>
                <IconSymbol name="star" size={scale(64)} color="#9ca3af" />
                <ThemedText style={styles.noRatingsText}>Aucun avis pour le moment</ThemedText>
                {canRate && (
                  <ThemedText style={styles.noRatingsSubtext}>
                    Soyez le premier à noter ce vendeur !
                  </ThemedText>
                )}
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Seller cars */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={styles.carsCard}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.carsCardGradient}
          >
            <ThemedText style={styles.sectionTitle}>Véhicules en vente</ThemedText>

            {loadingCars ? (
              <View style={styles.loadingCarsContainer}>
                <ActivityIndicator size="large" color="#0d9488" />
              </View>
            ) : sellerCars.length === 0 ? (
              <View style={styles.noCarsContainer}>
                <IconSymbol name="car" size={scale(48)} color="#9ca3af" />
                <ThemedText style={styles.noCarsText}>
                  Aucun véhicule en vente pour le moment
                </ThemedText>
              </View>
            ) : (
              <View style={styles.carsList}>
                {sellerCars.map((car) => {
                  const carId = car._id || car.id;
                  const imageUri =
                    car.images && car.images.length > 0
                      ? getImageUrl(car.images[0])
                      : null;

                  return (
                    <TouchableOpacity
                      key={carId}
                      style={styles.carCard}
                      activeOpacity={0.9}
                      onPress={() => router.push(`/car/${carId}` as any)}
                    >
                      <View style={styles.carImageWrap}>
                        {imageUri ? (
                          <Image
                            source={{ uri: imageUri }}
                            style={styles.carImage}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.carImagePlaceholder}>
                            <IconSymbol name="car.fill" size={scale(32)} color="#9ca3af" />
                          </View>
                        )}
                        <View style={styles.carYearBadge}>
                          <ThemedText style={styles.carYearBadgeText}>{car.year}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.carInfo}>
                        <ThemedText style={styles.carTitle} numberOfLines={1}>
                          {car.brand} {car.model}
                        </ThemedText>
                        <View style={styles.carMetaRow}>
                          <View style={styles.carMetaItem}>
                            <IconSymbol name="speedometer" size={scale(14)} color="#64748b" />
                            <ThemedText style={styles.carMetaText}>
                              {car.km?.toLocaleString() || 0} km
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.carPrice}>
                            {car.price?.toLocaleString() || 0} DA
                          </ThemedText>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </ScrollView>

      {/* Rate Modal */}
      <Modal
        visible={showRateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.modalContent}
          >
            <LinearGradient
              colors={['#fbbf24', '#f59e0b']}
              style={styles.modalHeader}
            >
              <ThemedText style={styles.modalTitle}>
                {userRate ? 'Modifier votre note' : 'Noter ce vendeur'}
              </ThemedText>
              <TouchableOpacity
                onPress={() => setShowRateModal(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark" size={scale(20)} color="#ffffff" />
              </TouchableOpacity>
            </LinearGradient>

            <View style={styles.modalBody}>
              <View style={styles.starSelectionContainer}>
                <ThemedText style={styles.starSelectionLabel}>
                  Votre note (1-5 étoiles)
                </ThemedText>
                <View style={styles.starSelection}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRatingStar(star)}
                      style={styles.starButton}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        name={star <= ratingStar ? 'star.fill' : 'star'}
                        size={scale(40)}
                        color={star <= ratingStar ? '#fbbf24' : '#d1d5db'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.messageInputContainer}>
                <ThemedText style={styles.messageInputLabel}>
                  Votre avis (optionnel)
                </ThemedText>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Partagez votre expérience avec ce vendeur..."
                  placeholderTextColor="#9ca3af"
                  value={ratingMessage}
                  onChangeText={setRatingMessage}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                />
                <ThemedText style={styles.charCount}>
                  {ratingMessage.length}/500 caractères
                </ThemedText>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={handleSubmitRate}
                  disabled={isSubmittingRate || ratingStar === 0}
                  style={[
                    styles.submitButton,
                    (isSubmittingRate || ratingStar === 0) && styles.submitButtonDisabled,
                  ]}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#fbbf24', '#f59e0b']}
                    style={styles.submitButtonGradient}
                  >
                    {isSubmittingRate ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <ThemedText style={styles.submitButtonText}>
                        {userRate ? 'Mettre à jour' : 'Envoyer'}
                      </ThemedText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowRateModal(false)}
                  style={styles.cancelButton}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.cancelButtonText}>Annuler</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: padding.medium,
    fontSize: fontSizes.md,
    color: '#64748b',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: padding.large,
  },
  errorText: {
    fontSize: fontSizes.lg,
    color: '#ef4444',
    marginTop: padding.medium,
    textAlign: 'center',
  },
  backButton: {
    marginTop: padding.large,
    paddingHorizontal: padding.large,
    paddingVertical: padding.medium,
    backgroundColor: '#0d9488',
    borderRadius: scale(12),
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: padding.horizontal,
    paddingBottom: padding.large * 2,
  },
  profileCard: {
    marginBottom: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  profileCardGradient: {
    padding: padding.large,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: padding.large,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: padding.medium,
  },
  avatar: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    borderWidth: scale(3),
    borderColor: '#0d9488',
  },
  avatarGradient: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scale(3),
    borderColor: '#0d9488',
  },
  avatarText: {
    fontSize: fontSizes['2xl'],
    fontWeight: '700',
    color: '#ffffff',
  },
  certifiedBadge: {
    position: 'absolute',
    bottom: scale(-2),
    right: scale(-2),
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scale(2),
    borderColor: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: scale(4),
  },
  name: {
    fontSize: fontSizes['2xl'],
    fontWeight: '700',
    color: '#1f2937',
    marginRight: padding.small,
  },
  certifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(8),
    gap: scale(4),
  },
  certifiedTagText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#22c55e',
  },
  email: {
    fontSize: fontSizes.md,
    color: '#64748b',
    marginBottom: padding.small,
  },
  statusContainer: {
    marginTop: scale(4),
  },
  statusBadgeActive: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: scale(16),
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#22c55e',
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: scale(16),
    alignSelf: 'flex-start',
  },
  statusBadgeTextPending: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#f59e0b',
  },
  contactSection: {
    marginTop: padding.medium,
    paddingTop: padding.medium,
    borderTopWidth: scale(1),
    borderTopColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: padding.medium,
  },
  contactList: {
    gap: padding.medium,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.medium,
  },
  contactIcon: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    fontSize: fontSizes.md,
    color: '#1f2937',
    flex: 1,
  },
  ratingsCard: {
    marginTop: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  ratingsCardGradient: {
    padding: padding.large,
  },
  ratingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: padding.large,
  },
  rateButton: {
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  rateButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    gap: scale(6),
  },
  rateButtonText: {
    color: '#ffffff',
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  loadingRatesContainer: {
    paddingVertical: padding.large * 2,
    alignItems: 'center',
  },
  averageRatingContainer: {
    marginBottom: padding.large,
    padding: padding.large,
    backgroundColor: '#fef3c7',
    borderRadius: scale(16),
    borderWidth: scale(1),
    borderColor: '#fbbf24',
  },
  averageRatingBox: {
    alignItems: 'center',
  },
  averageRatingValue: {
    fontSize: fontSizes['4xl'],
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: padding.small,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: scale(4),
    marginBottom: padding.small,
  },
  totalRatingsText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
  },
  ratingsList: {
    gap: padding.medium,
  },
  ratingItem: {
    padding: padding.medium,
    backgroundColor: '#f9fafb',
    borderRadius: scale(16),
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: padding.small,
  },
  raterName: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: scale(4),
  },
  ratingStars: {
    flexDirection: 'row',
    gap: scale(2),
  },
  ratingDate: {
    fontSize: fontSizes.xs,
    color: '#9ca3af',
  },
  ratingMessage: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    marginTop: padding.small,
  },
  noRatingsContainer: {
    alignItems: 'center',
    paddingVertical: padding.large * 2,
  },
  noRatingsText: {
    fontSize: fontSizes.lg,
    color: '#64748b',
    marginTop: padding.medium,
  },
  noRatingsSubtext: {
    fontSize: fontSizes.sm,
    color: '#9ca3af',
    marginTop: padding.small,
  },
  carsCard: {
    marginTop: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  carsCardGradient: {
    padding: padding.large,
  },
  loadingCarsContainer: {
    paddingVertical: padding.large * 2,
    alignItems: 'center',
  },
  noCarsContainer: {
    alignItems: 'center',
    paddingVertical: padding.large * 2,
  },
  noCarsText: {
    fontSize: fontSizes.md,
    color: '#64748b',
    marginTop: padding.medium,
    textAlign: 'center',
  },
  carsList: {
    gap: padding.medium,
  },
  carCard: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: scale(16),
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  carImageWrap: {
    width: scale(112),
    height: scale(96),
    backgroundColor: '#e5e7eb',
    position: 'relative',
  },
  carImage: {
    width: '100%',
    height: '100%',
  },
  carImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  carYearBadge: {
    position: 'absolute',
    top: scale(6),
    left: scale(6),
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: scale(8),
  },
  carYearBadgeText: {
    color: '#ffffff',
    fontSize: fontSizes.xs,
    fontWeight: '700',
  },
  carInfo: {
    flex: 1,
    padding: padding.medium,
    justifyContent: 'center',
  },
  carTitle: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: scale(8),
  },
  carMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(8),
  },
  carMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    flex: 1,
  },
  carMetaText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
  },
  carPrice: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#0d9488',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: padding.large,
  },
  modalContent: {
    width: '100%',
    maxWidth: scale(400),
    backgroundColor: '#ffffff',
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: padding.large,
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  modalCloseButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: padding.large,
  },
  starSelectionContainer: {
    marginBottom: padding.large,
  },
  starSelectionLabel: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: padding.medium,
  },
  starSelection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: scale(8),
  },
  starButton: {
    padding: scale(4),
  },
  messageInputContainer: {
    marginBottom: padding.large,
  },
  messageInputLabel: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: padding.small,
  },
  messageInput: {
    borderWidth: scale(2),
    borderColor: '#e5e7eb',
    borderRadius: scale(12),
    padding: padding.medium,
    fontSize: fontSizes.md,
    color: '#1f2937',
    minHeight: scale(100),
    backgroundColor: '#ffffff',
  },
  charCount: {
    fontSize: fontSizes.xs,
    color: '#9ca3af',
    marginTop: scale(4),
    textAlign: 'right',
  },
  modalActions: {
    flexDirection: 'row',
    gap: padding.medium,
  },
  submitButton: {
    flex: 1,
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonGradient: {
    paddingVertical: padding.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
    backgroundColor: '#e5e7eb',
    borderRadius: scale(12),
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
