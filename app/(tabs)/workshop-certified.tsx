import React, { useCallback, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { pageTitleBlockStyles } from '@/utils/pageTitleStyles';
import { apiRequest, getImageUrl } from '@/utils/backend';
import { useTranslation } from 'react-i18next';
import { useLocation } from '@/contexts/LocationContext';
import { haversineKm, normalizeRegion } from '@/utils/geoDistance';
import { getWorkshopTypeIcon } from '@/utils/workshopDisplay';

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
  locationLat?: number | null;
  locationLng?: number | null;
  locationRegion?: string | null;
  real_time?: boolean;
}

type SectionType = 'nearest' | 'real_time' | 'other';

function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export default function WorkshopCertifiedScreen() {
  const { t } = useTranslation();
  const { lat: userLat, lng: userLng, region: userRegion } = useLocation();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>('nearest');
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
    } catch {
      // ignore
    }
    return null;
  };

  const fetchWorkshops = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/workshop/all');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.workshops)) {
        setWorkshops(data.workshops);

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
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchWorkshops();
    }, [fetchWorkshops])
  );

  const hasLocation = (w: Workshop) =>
    typeof w.locationLat === 'number' && typeof w.locationLng === 'number';

  const distanceKm = useCallback(
    (w: Workshop): number | null => {
      if (userLat == null || userLng == null) return null;
      if (!hasLocation(w)) return null;
      return haversineKm(userLat, userLng, w.locationLat!, w.locationLng!);
    },
    [userLat, userLng],
  );

  // Filter by search first
  const addressFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workshops.filter(
      (w) =>
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.adr.toLowerCase().includes(q),
    );
  }, [workshops, searchQuery]);

  // Section: nearest (workshops that have location data, sorted by distance)
  const nearestSorted = useMemo(() => {
    const sellerR = normalizeRegion(userRegion);
    return addressFiltered
      .filter((w) => hasLocation(w))
      .sort((a, b) => {
        const aMatch = !!(sellerR && normalizeRegion(a.locationRegion ?? undefined) === sellerR);
        const bMatch = !!(sellerR && normalizeRegion(b.locationRegion ?? undefined) === sellerR);
        if (sellerR) {
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
        }
        const da = distanceKm(a);
        const db = distanceKm(b);
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [addressFiltered, userRegion, distanceKm]);

  // Section: real_time (workshops with real_time === true)
  const realTimeWorkshops = useMemo(
    () =>
      addressFiltered
        .filter((w) => !!w.real_time)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [addressFiltered],
  );

  // Section: other (everything not in nearest or real_time)
  const otherWorkshops = useMemo(() => {
    const nearestIds = new Set(nearestSorted.map((w) => String(w._id || w.id)));
    const rtIds = new Set(realTimeWorkshops.map((w) => String(w._id || w.id)));
    return addressFiltered
      .filter((w) => {
        const wId = String(w._id || w.id);
        return !nearestIds.has(wId) && !rtIds.has(wId);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [addressFiltered, nearestSorted, realTimeWorkshops]);

  const sectionData =
    activeSection === 'nearest'
      ? nearestSorted
      : activeSection === 'real_time'
        ? realTimeWorkshops
        : otherWorkshops;

  const sectionDesc =
    activeSection === 'nearest'
      ? t('workshops.sectionNearestDesc')
      : activeSection === 'real_time'
        ? t('workshops.sectionRealTimeDesc')
        : t('workshops.sectionOtherDesc');

  const onRefresh = () => {
    setRefreshing(true);
    fetchWorkshops();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'paint_vehicle':
        return t('workshops.type_paint');
      case 'mechanic':
        return t('workshops.type_mechanic');
      case 'mechanic_paint_inspector':
        return t('workshops.type_both');
      default:
        return type;
    }
  };

  const getTypeColor = (type: string): readonly [string, string] => {
    switch (type) {
      case 'paint_vehicle':
        return ['#3b82f6', '#2563eb'] as const;
      case 'mechanic':
        return ['#10b981', '#059669'] as const;
      case 'mechanic_paint_inspector':
        return ['#f59e0b', '#d97706'] as const;
      default:
        return ['#64748b', '#475569'] as const;
    }
  };

  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const openMaps = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`,
    }) ?? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    });
  };

  const renderWorkshopCard = (workshop: Workshop) => {
    const wId = workshop.id || workshop._id || '';
    const dist = formatDistance(distanceKm(workshop));
    const hasMec = workshop.price_visit_mec != null && workshop.price_visit_mec > 0;
    const hasPaint = workshop.price_visit_paint != null && workshop.price_visit_paint > 0;

    return (
      <Animated.View
        key={wId}
        entering={FadeInDown.duration(400).springify()}
        style={styles.workshopCard}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
          style={styles.workshopCardGradient}
        >
          {/* Image / Initials */}
          <View style={styles.workshopImageContainer}>
            {workshopImages[wId] ? (
              <Image
                source={{ uri: workshopImages[wId] }}
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

          {/* Info */}
          <View style={styles.workshopInfo}>
            {/* Name + certified badge */}
            <View style={styles.workshopHeader}>
              <ThemedText style={styles.workshopName} numberOfLines={1}>
                {workshop.name}
              </ThemedText>
              {workshop.certifie && (
                <View style={styles.certifiedBadge}>
                  <IconSymbol name="checkmark.seal.fill" size={scale(12)} color="#10b981" />
                  <ThemedText style={styles.certifiedBadgeText}>{t('workshops.certified')}</ThemedText>
                </View>
              )}
            </View>

            {/* Address */}
            <View style={styles.workshopDetailRow}>
              <IconSymbol name="mappin.fill" size={scale(12)} color="#64748b" />
              <ThemedText style={styles.workshopDetail} numberOfLines={2}>
                {workshop.adr}
              </ThemedText>
            </View>

            {/* Phone */}
            <View style={styles.workshopDetailRow}>
              <IconSymbol name="phone.fill" size={scale(12)} color="#64748b" />
              <ThemedText style={styles.workshopDetail}>{workshop.phone}</ThemedText>
            </View>

            {/* Email */}
            {!!workshop.email && (
              <View style={styles.workshopDetailRow}>
                <IconSymbol name="envelope.fill" size={scale(12)} color="#64748b" />
                <ThemedText style={styles.workshopDetail} numberOfLines={1}>
                  {workshop.email}
                </ThemedText>
              </View>
            )}

            {/* Type */}
            <View style={styles.workshopDetailRow}>
              <IconSymbol name={getWorkshopTypeIcon(workshop.type)} size={scale(12)} color="#64748b" />
              <ThemedText style={styles.workshopDetail}>{getTypeLabel(workshop.type)}</ThemedText>
            </View>

            {/* Distance + Wilaya badges */}
            {(dist || workshop.locationRegion) && (
              <View style={styles.badgesRow}>
                {dist && (
                  <View style={styles.distanceBadge}>
                    <IconSymbol name="location.fill" size={scale(12)} color="#3b82f6" />
                    <ThemedText style={styles.distanceBadgeText}>
                      {t('workshops.distanceApprox')} {dist}
                    </ThemedText>
                  </View>
                )}
                {workshop.locationRegion && (
                  <View style={styles.wilayaBadge}>
                    <IconSymbol name="globe" size={scale(12)} color="#6366f1" />
                    <ThemedText style={styles.wilayaBadgeText}>
                      {t('workshops.wilaya')}: {workshop.locationRegion}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}

            {/* Prices */}
            <View style={styles.pricesContainer}>
              {hasMec && (
                <View style={styles.priceBadge}>
                  <IconSymbol name="wrench.fill" size={scale(12)} color="#0d9488" />
                  <ThemedText style={styles.priceLabel}>{t('workshops.type_mechanic')}:</ThemedText>
                  <ThemedText style={styles.priceValue}>{workshop.price_visit_mec!.toLocaleString()} DA</ThemedText>
                </View>
              )}
              {hasPaint && (
                <View style={[styles.priceBadge, styles.priceBadgePaint]}>
                  <IconSymbol name="paintbrush.fill" size={scale(12)} color="#c2410c" />
                  <ThemedText style={styles.priceLabelPaint}>{t('workshops.type_paint')}:</ThemedText>
                  <ThemedText style={styles.priceValuePaint}>{workshop.price_visit_paint!.toLocaleString()} DA</ThemedText>
                </View>
              )}
              {!hasMec && !hasPaint && (
                <View style={styles.priceBadgeEmpty}>
                  <IconSymbol name="info.circle.fill" size={scale(12)} color="#9ca3af" />
                  <ThemedText style={styles.priceEmptyText}>{t('workshops.priceNotSet')}</ThemedText>
                </View>
              )}
            </View>

            {/* Actions: Directions button */}
            {hasLocation(workshop) && (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => openMaps(workshop.locationLat!, workshop.locationLng!)}
                  style={styles.directionsButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#3b82f6', '#6366f1']}
                    style={styles.directionsButtonGradient}
                  >
                    <IconSymbol name="location.fill" size={scale(12)} color="#ffffff" />
                    <ThemedText style={styles.directionsButtonText}>{t('workshops.itinerary')}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
    );
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
            <View style={pageTitleBlockStyles.block}>
              <ThemedText style={pageTitleBlockStyles.cardTitle}>{t('workshops.title')}</ThemedText>
              <ThemedText style={pageTitleBlockStyles.cardSubtitle}>{t('workshops.subtitle')}</ThemedText>
            </View>
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
              placeholder={t('workshops.searchPlaceholder')}
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

        {/* Geo hint */}
        {userLat == null && (
          <View style={styles.geoHint}>
            <IconSymbol name="location.slash.fill" size={scale(16)} color="#0d9488" />
            <ThemedText style={styles.geoHintText}>{t('workshops.geoHint')}</ThemedText>
          </View>
        )}

        {/* Section Tabs */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200).springify()}
          style={styles.sectionTabs}
        >
          <TouchableOpacity
            onPress={() => setActiveSection('nearest')}
            style={styles.sectionTab}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'nearest' ? ['#0d9488', '#14b8a6'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <IconSymbol
                name="location.fill"
                size={scale(18)}
                color={activeSection === 'nearest' ? '#ffffff' : '#0d9488'}
              />
              <ThemedText
                style={[styles.sectionTabText, activeSection === 'nearest' && styles.sectionTabTextActive]}
                numberOfLines={1}
              >
                {t('workshops.sectionNearest')}
              </ThemedText>
              <View style={[styles.sectionCount, activeSection === 'nearest' && styles.sectionCountActive]}>
                <ThemedText style={[styles.sectionCountText, activeSection === 'nearest' && styles.sectionCountTextActive]}>
                  {nearestSorted.length}
                </ThemedText>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSection('real_time')}
            style={styles.sectionTab}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'real_time' ? ['#10b981', '#059669'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <IconSymbol
                name="bolt.fill"
                size={scale(18)}
                color={activeSection === 'real_time' ? '#ffffff' : '#10b981'}
              />
              <ThemedText
                style={[styles.sectionTabText, activeSection === 'real_time' && styles.sectionTabTextActive]}
                numberOfLines={1}
              >
                {t('workshops.sectionRealTime')}
              </ThemedText>
              <View style={[styles.sectionCount, activeSection === 'real_time' && styles.sectionCountActiveGreen]}>
                <ThemedText style={[styles.sectionCountText, activeSection === 'real_time' && styles.sectionCountTextActive]}>
                  {realTimeWorkshops.length}
                </ThemedText>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSection('other')}
            style={styles.sectionTab}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={activeSection === 'other' ? ['#3b82f6', '#6366f1'] : ['#f1f5f9', '#e2e8f0']}
              style={styles.sectionTabGradient}
            >
              <IconSymbol
                name="building.2.fill"
                size={scale(18)}
                color={activeSection === 'other' ? '#ffffff' : '#3b82f6'}
              />
              <ThemedText
                style={[styles.sectionTabText, activeSection === 'other' && styles.sectionTabTextActive]}
                numberOfLines={1}
              >
                {t('workshops.sectionOther')}
              </ThemedText>
              <View style={[styles.sectionCount, activeSection === 'other' && styles.sectionCountActiveBlue]}>
                <ThemedText style={[styles.sectionCountText, activeSection === 'other' && styles.sectionCountTextActive]}>
                  {otherWorkshops.length}
                </ThemedText>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Section description */}
        <View style={styles.sectionDescContainer}>
          <ThemedText style={styles.sectionDescText}>{sectionDesc}</ThemedText>
        </View>

        {/* Workshops List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0d9488" />
            <ThemedText style={styles.loadingText}>{t('workshops.loading')}</ThemedText>
          </View>
        ) : sectionData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="building.2" size={scale(64)} color="#cbd5e1" />
            <ThemedText style={styles.emptyText}>
              {searchQuery.trim()
                ? t('workshops.sectionEmpty')
                : t('workshops.sectionEmpty')}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.workshopsList}>
            {sectionData.map(renderWorkshopCard)}
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
    paddingBottom: scale(140),
  },
  header: {
    marginBottom: padding.medium,
    borderRadius: scale(24),
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    paddingVertical: padding.large,
    paddingHorizontal: padding.medium,
    alignItems: 'center',
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  searchContainer: {
    paddingHorizontal: padding.horizontal,
    marginBottom: padding.medium,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: scale(14),
    paddingHorizontal: padding.medium,
    paddingVertical: scale(10),
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
  geoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginHorizontal: padding.horizontal,
    marginBottom: padding.medium,
    paddingVertical: scale(10),
    paddingHorizontal: scale(14),
    backgroundColor: '#f0fdfa',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#ccfbf1',
  },
  geoHintText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    flex: 1,
  },
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: padding.horizontal,
    marginBottom: scale(10),
    gap: scale(8),
  },
  sectionTab: {
    flex: 1,
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  sectionTabGradient: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(4),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: scale(4),
  },
  sectionTabText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  sectionTabTextActive: {
    color: '#ffffff',
  },
  sectionCount: {
    backgroundColor: '#e2e8f0',
    borderRadius: scale(999),
    minWidth: scale(22),
    paddingHorizontal: scale(6),
    paddingVertical: scale(2),
    alignItems: 'center',
  },
  sectionCountActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sectionCountActiveGreen: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sectionCountActiveBlue: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sectionCountText: {
    fontSize: scale(10),
    fontWeight: '800',
    color: '#64748b',
  },
  sectionCountTextActive: {
    color: '#ffffff',
  },
  sectionDescContainer: {
    paddingHorizontal: padding.horizontal,
    marginBottom: padding.medium,
  },
  sectionDescText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
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
    gap: scale(10),
  },
  workshopCard: {
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  workshopCardGradient: {
    padding: scale(12),
    flexDirection: 'row',
    gap: scale(10),
  },
  workshopImageContainer: {
    width: scale(60),
    height: scale(60),
    borderRadius: scale(14),
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
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  workshopInfo: {
    flex: 1,
    gap: scale(4),
  },
  workshopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    flexWrap: 'wrap',
  },
  workshopName: {
    fontSize: fontSizes.md,
    fontWeight: '900',
    color: '#1f2937',
    flexShrink: 1,
  },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingVertical: scale(2),
    paddingHorizontal: scale(6),
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
    alignItems: 'flex-start',
    gap: scale(5),
  },
  workshopDetail: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    flex: 1,
    lineHeight: scale(16),
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(4),
    marginTop: scale(1),
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingVertical: scale(2),
    paddingHorizontal: scale(6),
    borderRadius: scale(8),
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  distanceBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#3b82f6',
  },
  wilayaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(2),
    paddingHorizontal: scale(6),
    borderRadius: scale(8),
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  wilayaBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#7c3aed',
  },
  pricesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(4),
    marginTop: scale(2),
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    borderRadius: scale(8),
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
  },
  priceBadgePaint: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
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
  priceLabelPaint: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: '#c2410c',
  },
  priceValuePaint: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#c2410c',
  },
  priceBadgeEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    borderRadius: scale(8),
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  priceEmptyText: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: scale(4),
    gap: scale(6),
  },
  directionsButton: {
    borderRadius: scale(8),
    overflow: 'hidden',
  },
  directionsButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(6),
    paddingHorizontal: scale(10),
  },
  directionsButtonText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#ffffff',
  },
});
