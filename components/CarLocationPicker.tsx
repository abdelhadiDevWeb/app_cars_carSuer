import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { useTranslation } from 'react-i18next';
import {
  autocompletePlaces,
  resolvePlaceDetails,
  reverseGeocodePlace,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/utils/googlePlaces';

const padding = getPadding();
const fontSizes = getFontSizes();

export type CarLocationValue = {
  lat: number | null;
  lng: number | null;
  formattedAddress: string;
  commune: string;
  wilaya: string;
  daira: string;
};

export const EMPTY_CAR_LOCATION: CarLocationValue = {
  lat: null,
  lng: null,
  formattedAddress: '',
  commune: '',
  wilaya: '',
  daira: '',
};

type CarLocationPickerProps = {
  value: CarLocationValue;
  onChange: (value: CarLocationValue) => void;
};

function FieldLabel({ icon, label }: { icon: IconSymbolName; label: string }) {
  return (
    <View style={styles.labelRow}>
      <View style={styles.labelIconBox}>
        <IconSymbol name={icon} size={scale(14)} color="#0d9488" />
      </View>
      <ThemedText style={styles.label}>{label}</ThemedText>
    </View>
  );
}

function IconTextInput({
  icon,
  value,
  onChangeText,
  placeholder,
}: {
  icon: IconSymbolName;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.inputRow}>
      <View style={styles.inputIconBox}>
        <IconSymbol name={icon} size={scale(16)} color="#0d9488" />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        style={styles.inputWithIcon}
      />
    </View>
  );
}

function applyResolvedPlace(resolved: ResolvedPlace, current: CarLocationValue): CarLocationValue {
  return {
    lat: resolved.lat,
    lng: resolved.lng,
    formattedAddress: resolved.formattedAddress || current.formattedAddress,
    commune: resolved.commune || current.commune,
    wilaya: resolved.wilaya || current.wilaya,
    daira: resolved.daira || current.daira,
  };
}

export function CarLocationPicker({ value, onChange }: CarLocationPickerProps) {
  const { t } = useTranslation();
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const applyLatLng = useCallback(
    async (lat: number, lng: number) => {
      try {
        setGeoError('');
        const resolved = await reverseGeocodePlace(lat, lng);
        if (resolved) {
          onChange(applyResolvedPlace(resolved, valueRef.current));
        } else {
          onChange({ ...valueRef.current, lat, lng });
          setGeoError(t('cars.location.outsideAlgeria'));
        }
      } catch {
        onChange({ ...valueRef.current, lat, lng });
        setGeoError(t('cars.location.geoFailed'));
      }
    },
    [onChange, t],
  );

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await autocompletePlaces(query);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const pickSearchResult = async (row: PlaceSuggestion) => {
    setSearchQ(row.description || row.label);
    setSearchResults([]);
    setSearching(true);
    setGeoError('');
    try {
      const resolved = await resolvePlaceDetails(row.placeId);
      if (resolved) {
        onChange(applyResolvedPlace(resolved, valueRef.current));
      } else {
        setGeoError(t('cars.location.placeResolveFailed'));
      }
    } catch {
      setGeoError(t('cars.location.placeResolveFailed'));
    } finally {
      setSearching(false);
    }
  };

  const useMyPosition = async () => {
    setGeoBusy(true);
    setGeoError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGeoError(t('cars.location.permissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await applyLatLng(pos.coords.latitude, pos.coords.longitude);
    } catch {
      setGeoError(t('cars.location.geoFailed'));
    } finally {
      setGeoBusy(false);
    }
  };

  const handleFieldChange = (field: 'commune' | 'wilaya' | 'daira', text: string) => {
    onChange({ ...value, [field]: text });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.infoBox}>
        <View style={styles.infoIconBox}>
          <IconSymbol name="info.circle.fill" size={scale(18)} color="#0d9488" />
        </View>
        <ThemedText style={styles.infoText}>{t('cars.location.hint')}</ThemedText>
      </View>

      <View style={styles.field}>
        <FieldLabel icon="magnifyingglass" label={t('cars.location.searchLabel')} />
        <View style={styles.inputRow}>
          <View style={styles.inputIconBox}>
            <IconSymbol name="magnifyingglass" size={scale(16)} color="#0d9488" />
          </View>
          <TextInput
            value={searchQ}
            onChangeText={(text) => {
              setSearchQ(text);
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => void runSearch(text), 350);
            }}
            placeholder={t('cars.location.searchPlaceholder')}
            placeholderTextColor="#94a3b8"
            style={styles.inputWithIcon}
          />
          {searching ? (
            <ActivityIndicator size="small" color="#0d9488" style={styles.searchSpinner} />
          ) : null}
        </View>
        {searchResults.length > 0 && (
          <ScrollView style={styles.resultsList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {searchResults.map((row) => (
              <TouchableOpacity
                key={row.placeId}
                style={styles.resultItem}
                activeOpacity={0.85}
                onPress={() => void pickSearchResult(row)}
              >
                <View style={styles.resultIconBox}>
                  <IconSymbol name="mappin.circle.fill" size={scale(16)} color="#0d9488" />
                </View>
                <View style={styles.resultTextCol}>
                  <ThemedText style={styles.resultMainText} numberOfLines={1}>
                    {row.label}
                  </ThemedText>
                  {row.description !== row.label ? (
                    <ThemedText style={styles.resultSubText} numberOfLines={1}>
                      {row.description}
                    </ThemedText>
                  ) : null}
                </View>
                <IconSymbol name="chevron.right" size={scale(14)} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <TouchableOpacity
        style={[styles.geoBtn, geoBusy && styles.geoBtnDisabled]}
        activeOpacity={0.85}
        onPress={() => void useMyPosition()}
        disabled={geoBusy}
      >
        <View style={styles.geoIconBox}>
          {geoBusy ? (
            <ActivityIndicator size="small" color="#0d9488" />
          ) : (
            <IconSymbol name="location.fill" size={scale(18)} color="#0d9488" />
          )}
        </View>
        <ThemedText style={styles.geoBtnText}>
          {geoBusy ? t('cars.location.locating') : t('cars.location.useMyPosition')}
        </ThemedText>
      </TouchableOpacity>

      {geoError ? (
        <View style={styles.errorBox}>
          <IconSymbol name="exclamationmark.triangle.fill" size={scale(16)} color="#dc2626" />
          <ThemedText style={styles.errorText}>{geoError}</ThemedText>
        </View>
      ) : null}

      {value.formattedAddress ? (
        <View style={styles.addressPreview}>
          <View style={styles.addressPreviewHeader}>
            <View style={styles.labelIconBox}>
              <IconSymbol name="doc.text.fill" size={scale(14)} color="#64748b" />
            </View>
            <ThemedText style={styles.addressPreviewLabel}>{t('cars.location.selectedAddress')}</ThemedText>
          </View>
          <View style={styles.addressPreviewBody}>
            <IconSymbol name="mappin.fill" size={scale(16)} color="#0d9488" />
            <ThemedText style={styles.addressPreviewText}>{value.formattedAddress}</ThemedText>
          </View>
        </View>
      ) : null}

      <View style={styles.adminGrid}>
        <View style={styles.adminField}>
          <FieldLabel icon="building.2.fill" label={`${t('cars.location.commune')} *`} />
          <IconTextInput
            icon="building.2.fill"
            value={value.commune}
            onChangeText={(text) => handleFieldChange('commune', text)}
            placeholder={t('cars.location.communePlaceholder')}
          />
        </View>
        <View style={styles.adminField}>
          <FieldLabel icon="globe" label={`${t('cars.location.wilaya')} *`} />
          <IconTextInput
            icon="globe"
            value={value.wilaya}
            onChangeText={(text) => handleFieldChange('wilaya', text)}
            placeholder={t('cars.location.wilayaPlaceholder')}
          />
        </View>
        <View style={styles.adminField}>
          <FieldLabel icon="map.fill" label={t('cars.location.daira')} />
          <IconTextInput
            icon="map.fill"
            value={value.daira}
            onChangeText={(text) => handleFieldChange('daira', text)}
            placeholder={t('cars.location.dairaPlaceholder')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: padding.medium,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  labelIconBox: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(8),
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#374151',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(10),
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  infoIconBox: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#0f766e',
    lineHeight: Math.round(fontSizes.sm * 1.45),
  },
  field: {
    gap: scale(8),
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: scale(12),
    paddingLeft: scale(4),
    paddingRight: scale(12),
  },
  inputIconBox: {
    width: scale(40),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdfa',
    borderRadius: scale(10),
    marginVertical: scale(4),
    marginLeft: scale(4),
  },
  inputWithIcon: {
    flex: 1,
    paddingHorizontal: scale(10),
    paddingVertical: Platform.OS === 'ios' ? scale(12) : scale(10),
    fontSize: fontSizes.base,
    color: '#1e293b',
  },
  searchSpinner: {
    marginLeft: scale(4),
  },
  resultsList: {
    maxHeight: scale(200),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: scale(12),
    backgroundColor: '#ffffff',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingHorizontal: scale(10),
    paddingVertical: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  resultIconBox: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextCol: {
    flex: 1,
    gap: scale(2),
  },
  resultMainText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0f172a',
  },
  resultSubText: {
    fontSize: fontSizes.xs,
    color: '#64748b',
  },
  geoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(10),
    paddingVertical: scale(12),
    paddingHorizontal: scale(14),
    borderRadius: scale(12),
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  geoIconBox: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  geoBtnDisabled: {
    opacity: 0.7,
  },
  geoBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#0d9488',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
    padding: scale(10),
    borderRadius: scale(10),
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#dc2626',
    lineHeight: Math.round(fontSizes.sm * 1.4),
  },
  addressPreview: {
    padding: scale(12),
    borderRadius: scale(12),
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: scale(8),
  },
  addressPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  addressPreviewLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  addressPreviewBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
  },
  addressPreviewText: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#334155',
    lineHeight: Math.round(fontSizes.sm * 1.4),
  },
  adminGrid: {
    gap: padding.medium,
  },
  adminField: {
    gap: scale(8),
  },
});
