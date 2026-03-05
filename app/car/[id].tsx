import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Car {
  _id: string;
  id?: string;
  brand: string;
  model: string;
  year: number;
  km: number;
  price: number;
  status: 'no_proccess' | 'en_attente' | 'actif' | 'vendue' | string;
  images: string[];
  vin?: string;
  vinRemark?: string;
  color?: string;
  ports?: number;
  boite?: 'manuelle' | 'auto' | 'semi-auto' | string;
  type_gaz?: 'diesel' | 'gaz' | 'essence' | 'electrique' | string;
  type_enegine?: string;
  description?: string;
  accident?: boolean;
  usedby?: string;
  qr?: string;
  owner: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    certifie?: boolean;
  } | string;
  createdAt?: string;
  updatedAt?: string;
}

export default function CarDetailsPage() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { isAuthenticated, user } = useAuth();
  const carId = params.id as string;
  
  const [car, setCar] = useState<Car | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [workshopImages, setWorkshopImages] = useState<Record<string, string>>({});
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showContact, setShowContact] = useState(false);

  // Hide default header
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    if (!carId) {
      setError('ID de voiture manquant');
      setLoading(false);
      return;
    }

    const fetchCar = async () => {
      try {
        setLoading(true);
        const response = await apiRequest(`/car/${carId}`);
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data?.message || 'Voiture non trouvée');
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (data.ok && data.car) {
          setCar(data.car);
        } else {
          setError('Voiture non trouvée');
        }
      } catch (err: any) {
        console.error('Error fetching car:', err);
        setError(err?.message || 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    const fetchAppointments = async () => {
      try {
        setLoadingAppointments(true);
        const response = await apiRequest(`/rdv-workshop/car/${carId}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.appointments) {
            // Filter only finished appointments
            const finishedAppointments = data.appointments.filter((apt: any) => apt.status === 'finish');
            setAppointments(finishedAppointments);
            
            // Fetch workshop images
            const workshopIds = finishedAppointments
              .map((apt: any) => apt.id_workshop?._id || apt.id_workshop?.id || apt.id_workshop)
              .filter((id: any) => id);
            
            const workshopImagesMap: Record<string, string> = {};
            await Promise.all(
              workshopIds.map(async (workshopId: string) => {
                try {
                  const imgResponse = await apiRequest(`/user-image/${workshopId}`);
                  if (imgResponse.ok) {
                    const imgData = await imgResponse.json();
                    if (imgData.ok && imgData.userImage?.image) {
                      workshopImagesMap[workshopId] = imgData.userImage.image;
                    }
                  }
                } catch (error) {
                  console.error(`Error fetching image for workshop ${workshopId}:`, error);
                }
              })
            );
            setWorkshopImages(workshopImagesMap);
          }
        }
      } catch (err: any) {
        console.error('Error fetching appointments:', err);
      } finally {
        setLoadingAppointments(false);
      }
    };

    fetchCar();
    fetchAppointments();
  }, [carId]);

  const handleChatPress = () => {
    if (!isAuthenticated) {
      Alert.alert('Connexion requise', 'Veuillez vous connecter pour contacter le vendeur');
      router.push('/login');
      return;
    }

    if (!car?.owner || typeof car.owner === 'string') {
      Alert.alert('Erreur', 'Informations du vendeur non disponibles');
      return;
    }

    router.push(`/(tabs)/chat?userId=${car.owner._id}`);
  };

  const statusMeta: Record<string, { label: string; colors: [string, string] }> = {
    no_proccess: { label: 'En traitement', colors: ['#64748b', '#475569'] },
    en_attente: { label: 'En attente', colors: ['#f59e0b', '#d97706'] },
    actif: { label: 'Certifié', colors: ['#22c55e', '#16a34a'] },
    vendue: { label: 'Vendue', colors: ['#ef4444', '#dc2626'] },
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

  if (error || !car) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={scale(48)} color="#ef4444" />
          <ThemedText style={styles.errorText}>{error || 'Voiture non trouvée'}</ThemedText>
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

  const meta = statusMeta[car.status] || { label: car.status, colors: ['#64748b', '#475569'] as [string, string] };
  const carName = `${car.brand} ${car.model}`;
  const ownerName = typeof car.owner === 'object' 
    ? `${car.owner.firstName} ${car.owner.lastName}` 
    : 'Vendeur';
  const isOwner = isAuthenticated && user?._id && typeof car.owner === 'object' && car.owner._id === user._id;

  // Generate QR code URL if car has QR - use getImageUrl to get the full URL
  const qrCodeUrl = car.qr ? getImageUrl(car.qr) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButtonHeader}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.9)']}
            style={styles.backButtonGradient}
          >
            <IconSymbol name="chevron.left" size={scale(20)} color="#1f2937" />
          </LinearGradient>
        </TouchableOpacity>
        
        {!isOwner && (
          <TouchableOpacity
            onPress={handleChatPress}
            style={styles.chatButtonHeader}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#0d9488', '#14b8a6']}
              style={styles.chatButtonGradient}
            >
              <IconSymbol name="message.fill" size={scale(18)} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Image */}
        <Animated.View
          entering={FadeIn.duration(500)}
          style={styles.mainImageContainer}
        >
          {car.images && car.images.length > 0 ? (
            <Image
              source={{ uri: getImageUrl(car.images[selectedImage]) }}
              style={styles.mainImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <IconSymbol name="car.fill" size={scale(64)} color="#9ca3af" />
            </View>
          )}
          
          {/* Status Badge - positioned on top right of image */}
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.statusBadgeContainer}
          >
            <LinearGradient
              colors={meta.colors}
              style={styles.statusBadge}
            >
              <ThemedText style={styles.statusBadgeText}>{meta.label}</ThemedText>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* Thumbnail Images */}
        {car.images && car.images.length > 1 && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(100)}
            style={styles.thumbnailContainer}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailScrollContent}
            >
              {car.images.map((img, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => setSelectedImage(index)}
                  style={[
                    styles.thumbnail,
                    selectedImage === index && styles.thumbnailSelected,
                  ]}
                  activeOpacity={0.7}
                >
                  <Image
                    source={{ uri: getImageUrl(img) }}
                    style={styles.thumbnailImage}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Car Info Card */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={styles.infoCard}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.infoCardGradient}
          >
            <View style={styles.carTitleRow}>
              <View style={styles.carTitleContainer}>
                <ThemedText style={styles.carTitle}>{carName}</ThemedText>
                <ThemedText style={styles.carYear}>{car.year}</ThemedText>
              </View>
              <View style={styles.priceContainer}>
                <ThemedText style={styles.price}>{car.price?.toLocaleString() || 0}</ThemedText>
                <ThemedText style={styles.priceUnit}>DA</ThemedText>
              </View>
            </View>

            {/* Car Details Grid */}
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <IconSymbol name="speedometer" size={scale(20)} color="#0d9488" />
                <View style={styles.detailContent}>
                  <ThemedText style={styles.detailLabel}>Kilométrage</ThemedText>
                  <ThemedText style={styles.detailValue}>{car.km?.toLocaleString() || 0} km</ThemedText>
                </View>
              </View>

              {car.color && (
                <View style={styles.detailItem}>
                  <IconSymbol name="paintbrush.fill" size={scale(20)} color="#0d9488" />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Couleur</ThemedText>
                    <ThemedText style={styles.detailValue}>{car.color}</ThemedText>
                  </View>
                </View>
              )}

              {car.boite && (
                <View style={styles.detailItem}>
                  <IconSymbol name="gearshape.fill" size={scale(20)} color="#0d9488" />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Boîte</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      {car.boite === 'manuelle' ? 'Manuelle' : car.boite === 'auto' ? 'Automatique' : car.boite}
                    </ThemedText>
                  </View>
                </View>
              )}

              {car.type_gaz && (
                <View style={styles.detailItem}>
                  <IconSymbol name="fuel" size={scale(20)} color="#0d9488" />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Carburant</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      {car.type_gaz === 'diesel' ? 'Diesel' : 
                       car.type_gaz === 'essence' ? 'Essence' : 
                       car.type_gaz === 'gaz' ? 'GPL' : 
                       car.type_gaz === 'electrique' ? 'Électrique' : car.type_gaz}
                    </ThemedText>
                  </View>
                </View>
              )}

              {car.ports && (
                <View style={styles.detailItem}>
                  <IconSymbol name="car.side.fill" size={scale(20)} color="#0d9488" />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Portes</ThemedText>
                    <ThemedText style={styles.detailValue}>{car.ports}</ThemedText>
                  </View>
                </View>
              )}

              {car.vin && (
                <View style={styles.detailItem}>
                  <IconSymbol name="doc.text.fill" size={scale(20)} color="#0d9488" />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>VIN</ThemedText>
                    <ThemedText style={styles.detailValue}>{car.vin}</ThemedText>
                  </View>
                </View>
              )}

              {car.accident !== undefined && (
                <View style={styles.detailItem}>
                  <IconSymbol 
                    name={car.accident ? "exclamationmark.triangle.fill" : "checkmark.circle.fill"} 
                    size={scale(20)} 
                    color={car.accident ? "#ef4444" : "#22c55e"} 
                  />
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Accident</ThemedText>
                    <ThemedText style={[styles.detailValue, car.accident && styles.accidentYes]}>
                      {car.accident ? 'Oui' : 'Non'}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>

            {/* Description */}
            {car.description && (
              <View style={styles.descriptionContainer}>
                <ThemedText style={styles.descriptionLabel}>Description</ThemedText>
                <ThemedText style={styles.descriptionText}>{car.description}</ThemedText>
              </View>
            )}

            {/* Owner Info */}
            {typeof car.owner === 'object' && car.owner._id && (
              <TouchableOpacity
                onPress={() => {
                  const ownerId = car.owner._id;
                  console.log('Navigating to user:', ownerId);
                  router.push(`/user/${ownerId}` as any);
                }}
                style={styles.ownerContainer}
                activeOpacity={0.8}
              >
                <View style={styles.ownerHeader}>
                  <IconSymbol name="person.fill" size={scale(20)} color="#0d9488" />
                  <ThemedText style={styles.ownerTitle}>Vendeur</ThemedText>
                  {car.owner.certifie && (
                    <View style={styles.certifiedBadge}>
                      <IconSymbol name="checkmark.seal.fill" size={scale(14)} color="#ffffff" />
                      <ThemedText style={styles.certifiedText}>Certifié</ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.ownerName}>{ownerName}</ThemedText>
                {car.owner.phone && (
                  <ThemedText style={styles.ownerPhone}>{car.owner.phone}</ThemedText>
                )}
                <View style={styles.viewProfileHint}>
                  <ThemedText style={styles.viewProfileText}>Voir le profil →</ThemedText>
                </View>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </Animated.View>

        {/* QR Code Section */}
        {car.qr && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(300)}
            style={styles.qrCard}
          >
            <LinearGradient
              colors={['#f0fdfa', '#ccfbf1', '#99f6e4']}
              style={styles.qrCardGradient}
            >
              <View style={styles.qrHeader}>
                <View style={styles.qrIconContainer}>
                  <IconSymbol name="qrcode.viewfinder" size={scale(24)} color="#0d9488" />
                </View>
                <ThemedText style={styles.qrTitle}>Code QR de vérification</ThemedText>
              </View>

              <View style={styles.qrCodeContainer}>
                <LinearGradient
                  colors={['#ffffff', '#f9fafb']}
                  style={styles.qrCodeWrapper}
                >
                  {qrCodeUrl ? (
                    <Image
                      source={{ uri: qrCodeUrl || '' }}
                      style={styles.qrCodeImage}
                      contentFit="contain"
                    />
                  ) : null}
                </LinearGradient>
              </View>

              <ThemedText style={styles.qrDescription}>
                Scannez ce code QR pour vérifier le statut de vérification de ce véhicule
              </ThemedText>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Verification Reports Section */}
        {appointments.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(350)}
            style={styles.verificationSection}
          >
            <LinearGradient
              colors={['#f3e8ff', '#e9d5ff', '#fce7f3']}
              style={styles.verificationSectionGradient}
            >
              <View style={styles.verificationHeader}>
                <View style={styles.verificationIconContainer}>
                  <LinearGradient
                    colors={['#9333ea', '#7c3aed']}
                    style={styles.verificationIconGradient}
                  >
                    <IconSymbol name="checkmark.circle.fill" size={scale(24)} color="#ffffff" />
                  </LinearGradient>
                </View>
                <ThemedText style={styles.verificationTitle}>Rapport de vérification</ThemedText>
              </View>

              {appointments.map((appointment: any, idx: number) => (
                <View key={idx} style={styles.appointmentCard}>
                  {/* Workshop Info */}
                  {appointment.id_workshop && (
                    <TouchableOpacity
                      onPress={() => {
                        const workshopId = appointment.id_workshop._id || appointment.id_workshop.id || appointment.id_workshop;
                        console.log('Navigating to workshop:', workshopId);
                        if (workshopId) {
                          router.push(`/workshop/${workshopId}` as any);
                        } else {
                          console.error('Workshop ID is missing');
                        }
                      }}
                      style={styles.workshopInfoCard}
                      activeOpacity={0.8}
                    >
                      <ThemedText style={styles.workshopInfoLabel}>Atelier de vérification</ThemedText>
                      <View style={styles.workshopInfoRow}>
                        {workshopImages[appointment.id_workshop._id || appointment.id_workshop.id || appointment.id_workshop] ? (
                          <Image
                            source={{ uri: getImageUrl(workshopImages[appointment.id_workshop._id || appointment.id_workshop.id || appointment.id_workshop]) }}
                            style={styles.workshopImage}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.workshopInitials}>
                            <ThemedText style={styles.workshopInitialsText}>
                              {(appointment.id_workshop.name || 'A')[0]}
                            </ThemedText>
                          </View>
                        )}
                        <View style={styles.workshopInfo}>
                          <ThemedText style={styles.workshopName}>
                            {appointment.id_workshop.name || 'Atelier'}
                          </ThemedText>
                          {appointment.id_workshop.certifie && (
                            <View style={styles.certifiedBadge}>
                              <IconSymbol name="checkmark.seal.fill" size={scale(12)} color="#22c55e" />
                              <ThemedText style={styles.certifiedBadgeText}>Certifié</ThemedText>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.viewProfileHint}>
                        <ThemedText style={styles.viewProfileText}>Voir le profil →</ThemedText>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Verification Images */}
                  {appointment.images && appointment.images.length > 0 && (
                    <View style={styles.verificationImagesSection}>
                      <View style={styles.verificationImagesHeader}>
                        <IconSymbol name="photo.fill" size={scale(18)} color="#9333ea" />
                        <ThemedText style={styles.verificationImagesTitle}>
                          Images de vérification ({appointment.images.length})
                        </ThemedText>
                      </View>
                      <View style={styles.verificationImagesGrid}>
                        {appointment.images.map((image: string, imgIdx: number) => (
                          <View key={imgIdx} style={styles.verificationImageContainer}>
                            <Image
                              source={{ uri: getImageUrl(image) || image }}
                              style={styles.verificationImage}
                              contentFit="cover"
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* PDF Report */}
                  {appointment.rapport_pdf && (
                    <View style={styles.pdfSection}>
                      <View style={styles.pdfHeader}>
                        <IconSymbol name="doc.fill" size={scale(18)} color="#9333ea" />
                        <ThemedText style={styles.pdfTitle}>Rapport PDF</ThemedText>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          const pdfUrl = getImageUrl(appointment.rapport_pdf) || appointment.rapport_pdf;
                          try {
                            const canOpen = await Linking.canOpenURL(pdfUrl);
                            if (canOpen) {
                              await Linking.openURL(pdfUrl);
                            } else {
                              Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF');
                            }
                          } catch (error) {
                            console.error('Error opening PDF:', error);
                            Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF');
                          }
                        }}
                        style={styles.pdfButton}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={['#9333ea', '#7c3aed']}
                          style={styles.pdfButtonGradient}
                        >
                          <IconSymbol name="doc.fill" size={scale(20)} color="#ffffff" />
                          <ThemedText style={styles.pdfButtonText}>Voir le rapport PDF</ThemedText>
                          <IconSymbol name="arrow.up.right" size={scale(16)} color="#ffffff" />
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </LinearGradient>
          </Animated.View>
        )}

        {/* Contact Button */}
        {!isOwner && (
          <Animated.View
            entering={FadeInDown.duration(600).delay(400)}
            style={styles.contactButtonContainer}
          >
            <TouchableOpacity
              onPress={handleChatPress}
              style={styles.contactButton}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#0d9488', '#14b8a6']}
                style={styles.contactButtonGradient}
              >
                <IconSymbol name="message.fill" size={scale(20)} color="#ffffff" />
                <ThemedText style={styles.contactButtonText}>Contacter le vendeur</ThemedText>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: padding.large,
    gap: scale(16),
  },
  errorText: {
    fontSize: fontSizes.lg,
    color: '#ef4444',
    textAlign: 'center',
  },
  backButton: {
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: padding.medium,
    paddingTop: padding.small,
    paddingBottom: padding.medium,
    zIndex: 10,
  },
  backButtonHeader: {
    borderRadius: scale(20),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  backButtonGradient: {
    width: scale(40),
    height: scale(40),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: scale(20),
  },
  chatButtonHeader: {
    borderRadius: scale(20),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  chatButtonGradient: {
    width: scale(40),
    height: scale(40),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: scale(20),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: padding.large * 2,
  },
  statusBadgeContainer: {
    position: 'absolute',
    top: padding.medium,
    right: padding.medium,
    zIndex: 10,
  },
  statusBadge: {
    paddingHorizontal: padding.medium,
    paddingVertical: padding.small,
    borderRadius: scale(20),
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
  statusBadgeText: {
    color: '#ffffff',
    fontSize: fontSizes.sm,
    fontWeight: '800',
  },
  mainImageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
    backgroundColor: '#e5e7eb',
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  thumbnailContainer: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
  },
  thumbnailScrollContent: {
    gap: scale(12),
  },
  thumbnail: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(12),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailSelected: {
    borderColor: '#0d9488',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  infoCard: {
    marginHorizontal: padding.medium,
    marginTop: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
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
  infoCardGradient: {
    padding: padding.large,
    borderRadius: scale(24),
  },
  carTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: padding.large,
  },
  carTitleContainer: {
    flex: 1,
  },
  carTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: scale(4),
  },
  carYear: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    fontWeight: '600',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: fontSizes['2xl'],
    fontWeight: '800',
    color: '#0d9488',
  },
  priceUnit: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    fontWeight: '600',
  },
  detailsGrid: {
    gap: scale(16),
    marginBottom: padding.large,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    padding: padding.medium,
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: fontSizes.xs,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: scale(2),
  },
  detailValue: {
    fontSize: fontSizes.md,
    color: '#1f2937',
    fontWeight: '700',
  },
  accidentYes: {
    color: '#ef4444',
  },
  descriptionContainer: {
    marginTop: padding.medium,
    padding: padding.medium,
    backgroundColor: '#f9fafb',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  descriptionLabel: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: scale(8),
  },
  descriptionText: {
    fontSize: fontSizes.md,
    color: '#374151',
    lineHeight: fontSizes.md * 1.5,
  },
  ownerContainer: {
    marginTop: padding.large,
    padding: padding.medium,
    backgroundColor: '#f0fdfa',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#ccfbf1',
  },
  ownerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: scale(8),
  },
  ownerTitle: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '700',
    flex: 1,
  },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#22c55e',
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(8),
  },
  certifiedText: {
    fontSize: fontSizes.xs,
    color: '#ffffff',
    fontWeight: '800',
  },
  ownerName: {
    fontSize: fontSizes.lg,
    color: '#1f2937',
    fontWeight: '700',
    marginBottom: scale(4),
  },
  ownerPhone: {
    fontSize: fontSizes.md,
    color: '#6b7280',
  },
  viewProfileHint: {
    marginTop: padding.small,
    alignItems: 'flex-end',
  },
  viewProfileText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '600',
  },
  qrCard: {
    marginHorizontal: padding.medium,
    marginTop: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  qrCardGradient: {
    padding: padding.large,
    borderRadius: scale(24),
    borderWidth: 2,
    borderColor: '#ccfbf1',
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginBottom: padding.large,
  },
  qrIconContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(12),
    backgroundColor: '#0d9488',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#0d9488',
    flex: 1,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginBottom: padding.medium,
  },
  qrCodeWrapper: {
    padding: scale(20),
    borderRadius: scale(16),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  qrCodeImage: {
    width: scale(200),
    height: scale(200),
  },
  qrDescription: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: fontSizes.sm * 1.5,
  },
  contactButtonContainer: {
    marginHorizontal: padding.medium,
    marginTop: padding.large,
  },
  contactButton: {
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
  contactButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(12),
    paddingVertical: padding.large,
    paddingHorizontal: padding.large,
  },
  contactButtonText: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: '#ffffff',
  },
  verificationSection: {
    marginHorizontal: padding.medium,
    marginTop: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#9333ea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  verificationSectionGradient: {
    padding: padding.large,
    borderRadius: scale(24),
    borderWidth: 2,
    borderColor: '#e9d5ff',
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginBottom: padding.large,
  },
  verificationIconContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  verificationIconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verificationTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#9333ea',
    flex: 1,
  },
  appointmentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: scale(20),
    padding: padding.large,
    marginBottom: padding.medium,
    borderWidth: 2,
    borderColor: '#e9d5ff',
  },
  workshopInfoCard: {
    marginBottom: padding.medium,
    padding: padding.medium,
    backgroundColor: '#faf5ff',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  workshopInfoLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: padding.small,
  },
  workshopInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  workshopImage: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#9333ea',
  },
  workshopInitials: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(12),
    backgroundColor: '#9333ea',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7c3aed',
  },
  workshopInitialsText: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: '#ffffff',
  },
  workshopInfo: {
    flex: 1,
    gap: scale(4),
  },
  workshopName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
  },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    alignSelf: 'flex-start',
    paddingVertical: scale(4),
    paddingHorizontal: scale(8),
    borderRadius: scale(999),
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  certifiedBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#22c55e',
  },
  verificationImagesSection: {
    marginBottom: padding.medium,
  },
  verificationImagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: padding.medium,
  },
  verificationImagesTitle: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
  },
  verificationImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(12),
  },
  verificationImageContainer: {
    width: (SCREEN_WIDTH - padding.medium * 2 - padding.large * 2 - scale(24)) / 3,
    height: scale(120),
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  verificationImage: {
    width: '100%',
    height: '100%',
  },
  pdfSection: {
    marginTop: padding.medium,
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: padding.medium,
  },
  pdfTitle: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
  },
  pdfButton: {
    borderRadius: scale(16),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#9333ea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  pdfButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(12),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
  },
  pdfButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#ffffff',
  },
});
