import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { apiRequest, getImageUrl } from '@/utils/backend';

const padding = getPadding();
const fontSizes = getFontSizes();

interface Workshop {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  adr: string;
  phone: string;
  type: 'paint_vehicle' | 'mechanic' | 'mechanic_paint_inspector';
  status: boolean;
  verfie: boolean;
  certifie: boolean;
  price_visit_mec?: number | null;
  price_visit_paint?: number | null;
}

type SectionType = 'all' | 'certified' | 'not_certified';

export default function WorkshopCertifiedScreen() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [workshopImages, setWorkshopImages] = useState<Record<string, string>>({});

  const fetchWorkshopImage = async (workshopId: string) => {
    try {
      const res = await apiRequest(`/user-image/${workshopId}`);
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.ok && data?.userImage?.image) {
          return getImageUrl(data.userImage.image);
        }
      }
    } catch (error) {
      // Image not found or error - return null
    }
    return null;
  };

  const fetchWorkshops = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/workshop/active');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.workshops)) {
        setWorkshops(data.workshops);
        
        // Fetch images for all workshops
        const imagePromises = data.workshops.map(async (workshop: Workshop) => {
          const workshopId = workshop.id || workshop._id;
          if (workshopId) {
            const imageUrl = await fetchWorkshopImage(workshopId);
            return { workshopId, imageUrl };
          }
          return { workshopId: '', imageUrl: null };
        });
        
        const imageResults = await Promise.all(imagePromises);
        const imagesMap: Record<string, string> = {};
        imageResults.forEach(({ workshopId, imageUrl }) => {
          if (workshopId && imageUrl) {
            imagesMap[workshopId] = imageUrl;
          }
        });
        setWorkshopImages(imagesMap);
      }
    } catch (error) {
      console.error('Error fetching workshops:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorkshops();
  }, []);

  const filteredWorkshops = useMemo(() => {
    let filtered = [...workshops];

    // Filter by section
    if (activeSection === 'certified') {
      filtered = filtered.filter(w => w.certifie === true);
    } else if (activeSection === 'not_certified') {
      filtered = filtered.filter(w => w.certifie === false);
    }

    // Filter by search query (name or address)
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(queryLower) ||
        w.adr.toLowerCase().includes(queryLower)
      );
    }

    return filtered;
  }, [workshops, activeSection, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWorkshops();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'paint_vehicle':
        return 'Peinture';
      case 'mechanic':
        return 'Mécanique';
      case 'mechanic_paint_inspector':
        return 'Mécanique & Peinture';
      default:
        return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'paint_vehicle':
        return ['#3b82f6', '#2563eb'];
      case 'mechanic':
        return ['#10b981', '#059669'];
      case 'mechanic_paint_inspector':
        return ['#f59e0b', '#d97706'];
      default:
        return ['#64748b', '#475569'];
    }
  };

  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0d9488" />
        }
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.header}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#3b82f6', '#2563eb']}
                style={styles.iconGradient}
              >
                <IconSymbol name="shield.fill" size={scale(48)} color="#ffffff" />
              </LinearGradient>
            </View>
            <ThemedText style={styles.title}>Ateliers</ThemedText>
            <ThemedText style={styles.subtitle}>
              Trouvez un atelier de vérification près de chez vous
            </ThemedText>
          </LinearGradient>
        </Animated.View>

        {/* Search Input */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(100).springify()}
          style={styles.searchContainer}
        >
          <View style={styles.searchInputContainer}>
            <IconSymbol name="magnifyingglass" size={scale(20)} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher par nom ou adresse..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark.circle.fill" size={scale(20)} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Section Tabs */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200).springify()}
          style={styles.sectionTabs}
        >
          <TouchableOpacity
            onPress={() => setActiveSection('all')}
            style={[styles.sectionTab, activeSection === 'all' && styles.sectionTabActive]}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'all' ? ['#0d9488', '#14b8a6'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <ThemedText style={[styles.sectionTabText, activeSection === 'all' && styles.sectionTabTextActive]}>
                Tous ({workshops.length})
              </ThemedText>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSection('certified')}
            style={[styles.sectionTab, activeSection === 'certified' && styles.sectionTabActive]}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'certified' ? ['#0d9488', '#14b8a6'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <IconSymbol
                name="checkmark.seal.fill"
                size={scale(16)}
                color={activeSection === 'certified' ? '#ffffff' : '#10b981'}
                style={{ marginRight: scale(4) }}
              />
              <ThemedText style={[styles.sectionTabText, activeSection === 'certified' && styles.sectionTabTextActive]}>
                Certifiés ({workshops.filter(w => w.certifie).length})
              </ThemedText>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSection('not_certified')}
            style={[styles.sectionTab, activeSection === 'not_certified' && styles.sectionTabActive]}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'not_certified' ? ['#0d9488', '#14b8a6'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <ThemedText style={[styles.sectionTabText, activeSection === 'not_certified' && styles.sectionTabTextActive]}>
                Non Certifiés ({workshops.filter(w => !w.certifie).length})
              </ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Workshops List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0d9488" />
            <ThemedText style={styles.loadingText}>Chargement des ateliers...</ThemedText>
          </View>
        ) : filteredWorkshops.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="building.2" size={scale(64)} color="#cbd5e1" />
            <ThemedText style={styles.emptyText}>
              {searchQuery.trim() ? 'Aucun atelier trouvé avec cette recherche' : 'Aucun atelier disponible'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.workshopsList}>
            {filteredWorkshops.map((workshop) => (
              <Animated.View
                key={workshop.id || workshop._id}
                entering={FadeInDown.duration(400).springify()}
                style={styles.workshopCard}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                  style={styles.workshopCardGradient}
                >
                  {/* Workshop Image/Icon */}
                  <View style={styles.workshopImageContainer}>
                    {workshopImages[workshop.id || workshop._id || ''] ? (
                      <Image
                        source={{ uri: workshopImages[workshop.id || workshop._id || ''] }}
                        style={styles.workshopImage}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={getTypeColor(workshop.type)}
                        style={styles.workshopImageGradient}
                      >
                        <ThemedText style={styles.workshopInitials}>
                          {getInitials(workshop.name)}
                        </ThemedText>
                      </LinearGradient>
                    )}
                  </View>

                  {/* Workshop Info */}
                  <View style={styles.workshopInfo}>
                    <View style={styles.workshopHeader}>
                      <ThemedText style={styles.workshopName} numberOfLines={1}>
                        {workshop.name}
                      </ThemedText>
                      {workshop.certifie && (
                        <View style={styles.certifiedBadge}>
                          <IconSymbol name="checkmark.seal.fill" size={scale(14)} color="#10b981" />
                          <ThemedText style={styles.certifiedBadgeText}>Certifié</ThemedText>
                        </View>
                      )}
                    </View>

                    <View style={styles.workshopDetailRow}>
                      <IconSymbol name="mappin.fill" size={scale(14)} color="#64748b" />
                      <ThemedText style={styles.workshopDetail} numberOfLines={2}>
                        {workshop.adr}
                      </ThemedText>
                    </View>

                    <View style={styles.workshopDetailRow}>
                      <IconSymbol name="phone.fill" size={scale(14)} color="#64748b" />
                      <ThemedText style={styles.workshopDetail}>{workshop.phone}</ThemedText>
                    </View>

                    <View style={styles.workshopDetailRow}>
                      <IconSymbol name="wrench.fill" size={scale(14)} color="#64748b" />
                      <ThemedText style={styles.workshopDetail}>{getTypeLabel(workshop.type)}</ThemedText>
                    </View>

                    {/* Prices */}
                    {(workshop.price_visit_mec || workshop.price_visit_paint) && (
                      <View style={styles.pricesContainer}>
                        {workshop.price_visit_mec && (
                          <View style={styles.priceBadge}>
                            <ThemedText style={styles.priceLabel}>Mécanique:</ThemedText>
                            <ThemedText style={styles.priceValue}>{workshop.price_visit_mec} DA</ThemedText>
                          </View>
                        )}
                        {workshop.price_visit_paint && (
                          <View style={styles.priceBadge}>
                            <ThemedText style={styles.priceLabel}>Peinture:</ThemedText>
                            <ThemedText style={styles.priceValue}>{workshop.price_visit_paint} DA</ThemedText>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: padding.large * 2,
  },
  header: {
    marginBottom: padding.medium,
    borderRadius: scale(24),
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    alignItems: 'center',
  },
  iconContainer: {
    width: scale(100),
    height: scale(100),
    borderRadius: scale(50),
    overflow: 'hidden',
    marginBottom: padding.medium,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#1f2937',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: padding.horizontal,
    marginBottom: padding.medium,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    paddingHorizontal: padding.medium,
    paddingVertical: scale(12),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: padding.small,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.md,
    color: '#1f2937',
  },
  clearButton: {
    padding: scale(4),
  },
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: padding.horizontal,
    marginBottom: padding.large,
    gap: padding.small,
  },
  sectionTab: {
    flex: 1,
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  sectionTabActive: {
    // Active state handled by gradient
  },
  sectionTabGradient: {
    paddingVertical: scale(12),
    paddingHorizontal: padding.small,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sectionTabText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#64748b',
  },
  sectionTabTextActive: {
    color: '#ffffff',
  },
  loadingContainer: {
    padding: padding.large * 2,
    alignItems: 'center',
    gap: padding.medium,
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: '#64748b',
  },
  emptyContainer: {
    padding: padding.large * 2,
    alignItems: 'center',
    gap: padding.medium,
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  workshopsList: {
    paddingHorizontal: padding.horizontal,
    gap: padding.medium,
  },
  workshopCard: {
    borderRadius: scale(20),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  workshopCardGradient: {
    padding: padding.medium,
    flexDirection: 'row',
    gap: padding.medium,
  },
  workshopImageContainer: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(16),
    overflow: 'hidden',
  },
  workshopImage: {
    width: '100%',
    height: '100%',
  },
  workshopImageGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workshopInitials: {
    fontSize: fontSizes['2xl'],
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  workshopInfo: {
    flex: 1,
    gap: scale(6),
  },
  workshopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    flexWrap: 'wrap',
  },
  workshopName: {
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: '#1f2937',
    flex: 1,
  },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(4),
    paddingHorizontal: scale(8),
    borderRadius: scale(999),
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  certifiedBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#10b981',
  },
  workshopDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  workshopDetail: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    flex: 1,
  },
  pricesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: padding.small,
    marginTop: scale(4),
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(6),
    paddingHorizontal: scale(10),
    borderRadius: scale(8),
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
  },
  priceLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: '#0d9488',
  },
  priceValue: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#0d9488',
  },
});
