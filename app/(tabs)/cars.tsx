import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Image,
  Platform,
  AppState,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { pageTitleBlockStyles } from '@/utils/pageTitleStyles';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { useLocation } from '@/contexts/LocationContext';
import { haversineKm, normalizeRegion } from '@/utils/geoDistance';
import { getWorkshopTypeIcon } from '@/utils/workshopDisplay';
import {
  openChargilyCheckoutUrl,
  warmUpChargilyBrowser,
} from '@/utils/openChargilyCheckout';
import {
  fetchSponsorCheckoutUrl,
  isPendingSponsorPayment,
  isSponsorActive,
  isSponsorCancelled,
  isSponsorExpiredPaid,
  pollSponsorPaymentStatus,
  verifySponsorPaidStatus,
} from '@/utils/sponsorPayment';
import { createAsyncThrottle } from '@/utils/requestThrottle';
import { CarLocationPicker, EMPTY_CAR_LOCATION, type CarLocationValue } from '@/components/CarLocationPicker';

const padding = getPadding();
const fontSizes = getFontSizes();

type CarStatus = 'no_proccess' | 'en_attente' | 'actif' | 'vendue' | string;

interface Car {
  _id: string;
  id?: string;
  brand: string;
  model: string;
  year: number;
  km: number;
  price: number;
  status: CarStatus;
  images?: string[];
  vin?: string;
  color?: string;
  ports?: number;
  boite?: 'manuelle' | 'auto' | 'semi-auto' | string;
  type_gaz?: 'diesel' | 'gaz' | 'essence' | 'electrique' | string;
  type_enegine?: string;
  description?: string;
  accident?: boolean;
  usedby?: string;
  createdAt?: string;
  /** Optional workflow tag from API, e.g. fin / rdv_fin */
  type?: string;
}

/** Active cars that belong only in the « Fini » tab: finished RDV and/or type fin|rdv_fin */
function isFiniSectionCar(car: Car, apts: Appointment[]): boolean {
  if (car.status !== 'actif') return false;
  const raw = String(car.type ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  const byType =
    raw === 'fin' || raw === 'rdv_fin' || raw === 'rdvfin';
  const byRdv = apts.some((a) => a.status === 'finish');
  return byType || byRdv;
}

interface Appointment {
  id?: string;
  _id?: string;
  id_car: any;
  id_workshop: any;
  date: string;
  time: string;
  status: 'en_attente' | 'accepted' | 'refused' | 'start' | 'finish' | string;
}

interface Workshop {
  id: string;
  _id?: string;
  name: string;
  email?: string;
  phone?: string;
  adr?: string;
  type?: 'paint_vehicle' | 'mechanic' | 'mechanic_paint_inspector';
  certifie?: boolean;
  price_visit_mec?: number | null;
  price_visit_paint?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationRegion?: string | null;
  real_time?: boolean;
}

/**
 * Sponsorship returned by `GET /api/sponsor/my-sponsors`.
 * `id_car` is populated server-side with a small subset of car fields; when the
 * referenced car has been deleted we still receive a string id back.
 */
interface Sponsor {
  id?: string;
  _id: string;
  id_car: string | (Partial<Car> & { _id: string });
  id_owner: string;
  start_date: string;
  end_date: string;
  duration: number;
  /** Price paid for this sponsorship (DA). 0 for legacy rows. */
  price: number;
  status: boolean;
  payment_status?: 'pending' | 'paid' | 'failed' | 'cancelled';
  chargily_checkout_id?: string | null;
  paid_at?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** A purchasable sponsor plan (`abonnement_sponsor`). */
interface SponsorPlan {
  id: string;
  duration: number;
  price: number;
}

/** A car returned by `GET /api/sponsor/sponsorable-cars`. */
interface SponsorableCar {
  id: string;
  _id: string;
  brand?: string;
  model?: string;
  year?: number;
  images?: string[];
  price?: number;
  status?: string;
  /** ISO date of the most recent sponsor on this car (now expired/cancelled), or null. */
  previous_sponsor_end_date: string | null;
  had_previous_sponsor: boolean;
}

/** Minimal lift so the RDV button sits low but clears the floating tab bar. */
function getRdvModalFooterBottomPad(insets: { bottom: number }): number {
  const tabBarClearance = Platform.OS === 'ios' ? scale(56) : scale(52);
  return Math.max(insets.bottom, scale(6)) + tabBarClearance;
}

/** Reschedule modal is full-screen — pin confirm button near the bottom edge. */
function getRescheduleModalFooterBottomPad(insets: { bottom: number }): number {
  return Math.max(insets.bottom, scale(8));
}

export default function CarsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, user, isLoading } = useAuth();
  // We pull `i18n` here so we can format dates in the active language locale
  // (and so a language change forces this component to re-render).
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cars, setCars] = useState<Car[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [rdvFilter, setRdvFilter] = useState<'all' | 'with_rdv' | 'without_rdv' | 'termine' | 'sponsor'>('all');

  // Create-Sponsor flow state ------------------------------------------------
  const [showCreateSponsorModal, setShowCreateSponsorModal] = useState(false);
  const [sponsorableCars, setSponsorableCars] = useState<SponsorableCar[]>([]);
  const [loadingSponsorableCars, setLoadingSponsorableCars] = useState(false);
  const [sponsorPlans, setSponsorPlans] = useState<SponsorPlan[]>([]);
  const [loadingSponsorPlans, setLoadingSponsorPlans] = useState(false);
  const [selectedSponsorCarId, setSelectedSponsorCarId] = useState<string>('');
  const [selectedSponsorPlanId, setSelectedSponsorPlanId] = useState<string>('');
  const [creatingSponsor, setCreatingSponsor] = useState(false);
  // Payment modal shown after a successful create.
  const [showSponsorPaymentModal, setShowSponsorPaymentModal] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<{
    car: SponsorableCar | null;
    plan: SponsorPlan | null;
    sponsorId?: string;
  }>({ car: null, plan: null });
  const [paymentDone, setPaymentDone] = useState(false);
  const [payingNow, setPayingNow] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  /** Set when user is sent to Chargily; verified when app returns to foreground. */
  const pendingPaymentContextRef = useRef<{
    sponsorId: string;
    car: SponsorableCar | null;
    plan: SponsorPlan | null;
  } | null>(null);
  const paymentVerifyInFlightRef = useRef(false);

  // `now` ticks every minute so the "time remaining" text on each sponsor card
  // stays accurate without forcing a re-fetch.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Add car modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [creatingCar, setCreatingCar] = useState(false);
  const [carForm, setCarForm] = useState({
    brand: '',
    model: '',
    year: '',
    km: '',
    price: '',
    vin: '',
    color: '',
    ports: '',
    boite: '' as '' | 'manuelle' | 'auto' | 'semi-auto',
    type_gaz: '' as '' | 'diesel' | 'gaz' | 'essence' | 'electrique',
    type_enegine: '',
    description: '',
    accident: false,
    usedby: '',
  });
  const [pickedImages, setPickedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);

  // VIN verification states
  const [vinValidating, setVinValidating] = useState(false);
  const [vinValid, setVinValid] = useState<boolean | null>(null);
  const [vinError, setVinError] = useState('');
  const [vinRemark, setVinRemark] = useState('');
  const [vinDetails, setVinDetails] = useState<any>(null);
  const [bypassVin, setBypassVin] = useState(false);
  const [customBrand, setCustomBrand] = useState('');
  const [showCustomBrand, setShowCustomBrand] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);

  // Color picker (options come from backend table `Color`)
  const [availableColors, setAvailableColors] = useState<{ id: string; name: string }[]>([]);
  const [loadingColors, setLoadingColors] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [customColor, setCustomColor] = useState('');
  const [locationData, setLocationData] = useState<CarLocationValue>(EMPTY_CAR_LOCATION);

  // RDV modal
  const [showRdvModal, setShowRdvModal] = useState(false);
  const [creatingRdv, setCreatingRdv] = useState(false);
  const [selectedCarForRdv, setSelectedCarForRdv] = useState<Car | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loadingWorkshops, setLoadingWorkshops] = useState(false);
  const [rdvForm, setRdvForm] = useState({
    workshopId: '',
    date: '',
    time: '',
  });
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleAvailableTimes, setRescheduleAvailableTimes] = useState<string[]>([]);
  const [loadingRescheduleTimes, setLoadingRescheduleTimes] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isCancellingRdv, setIsCancellingRdv] = useState(false);
  const [showRescheduleDatePicker, setShowRescheduleDatePicker] = useState(false);
  const [rescheduleSelectedDate, setRescheduleSelectedDate] = useState<Date>(new Date());
  // Upload modal for image progress on create car
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  
  // Workshop filters
  const [workshopFilters, setWorkshopFilters] = useState({
    searchName: '',
    searchAdr: '',
    sortBy: 'name' as 'name' | 'price_low' | 'price_high',
  });
  const [rdvWorkshopSection, setRdvWorkshopSection] = useState<'nearest' | 'real_time' | 'other'>('nearest');
  const { lat: userLat, lng: userLng, region: userRegion } = useLocation();

  const statusMeta = useMemo(() => {
    const map: Record<string, { label: string; colors: [string, string] }> = {
      no_proccess: { label: t('cars.status.draft'), colors: ['#64748b', '#475569'] },
      en_attente: { label: t('cars.status.pending'), colors: ['#f59e0b', '#d97706'] },
      actif: { label: t('cars.status.certified'), colors: ['#22c55e', '#16a34a'] },
      vendue: { label: t('cars.status.sold'), colors: ['#ef4444', '#dc2626'] },
    };
    return map;
  }, [t]);

  const rdvStatusMeta = useMemo(() => {
    const map: Record<string, { label: string; colors: [string, string] }> = {
      en_attente: { label: t('cars.rdvStatus.pending'), colors: ['#f59e0b', '#d97706'] },
      accepted: { label: t('cars.rdvStatus.accepted'), colors: ['#22c55e', '#16a34a'] },
      refused: { label: t('cars.rdvStatus.refused'), colors: ['#ef4444', '#dc2626'] },
      start: { label: t('cars.rdvStatus.inProgress'), colors: ['#3b82f6', '#2563eb'] },
      en_cours: { label: t('cars.rdvStatus.inProgress'), colors: ['#3b82f6', '#2563eb'] }, // Handle en_cours status
      finish: { label: t('cars.rdvStatus.finished'), colors: ['#64748b', '#475569'] },
    };
    return map;
  }, [t]);

  // Refresh function for socket updates (doesn't show loading)
  const refreshDataSilently = useCallback(async () => {
    if (!isAuthenticated || user?.type !== 'user') {
      console.log('Skipping refresh: not authenticated or not a user');
      return;
    }
    try {
      console.log('🔄 Refreshing cars / appointments / sponsors data silently...');
      const [carsRes, rdvRes, sponsorRes] = await Promise.all([
        apiRequest('/car/my-cars'),
        apiRequest('/rdv-workshop/my-appointments'),
        apiRequest('/sponsor/my-sponsors'),
      ]);

      const carsData = await carsRes.json().catch(() => null);
      const rdvData = await rdvRes.json().catch(() => null);
      const sponsorData = await sponsorRes.json().catch(() => null);

      if (carsRes.ok && carsData?.ok && Array.isArray(carsData.cars)) {
        console.log(`✅ Updated ${carsData.cars.length} cars`);
        setCars(carsData.cars);
      } else {
        console.log('⚠️ Failed to fetch cars or invalid response');
      }

      if (rdvRes.ok && rdvData?.ok && Array.isArray(rdvData.appointments)) {
        console.log(`✅ Updated ${rdvData.appointments.length} appointments`);
        setAppointments(rdvData.appointments);
      } else {
        console.log('⚠️ Failed to fetch appointments or invalid response');
      }

      if (sponsorRes.ok && sponsorData?.ok && Array.isArray(sponsorData.sponsors)) {
        console.log(`✅ Updated ${sponsorData.sponsors.length} sponsors`);
        setSponsors(sponsorData.sponsors);
      } else {
        console.log('⚠️ Failed to fetch sponsors or invalid response');
      }
    } catch (err: any) {
      console.error('❌ Error refreshing cars/appointments/sponsors:', err);
    }
  }, [isAuthenticated, user?.type]);

  const fetchMyCarsAndRdv = useCallback(async () => {
    if (!isAuthenticated) return;
    if (user?.type !== 'user') {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [carsRes, rdvRes, sponsorRes] = await Promise.all([
        apiRequest('/car/my-cars'),
        apiRequest('/rdv-workshop/my-appointments'),
        apiRequest('/sponsor/my-sponsors'),
      ]);

      const carsData = await carsRes.json().catch(() => null);
      const rdvData = await rdvRes.json().catch(() => null);
      const sponsorData = await sponsorRes.json().catch(() => null);

      if (carsRes.ok && carsData?.ok && Array.isArray(carsData.cars)) {
        setCars(carsData.cars);
      } else {
        setCars([]);
      }

      if (rdvRes.ok && rdvData?.ok && Array.isArray(rdvData.appointments)) {
        setAppointments(rdvData.appointments);
      } else {
        setAppointments([]);
      }

      if (sponsorRes.ok && sponsorData?.ok && Array.isArray(sponsorData.sponsors)) {
        setSponsors(sponsorData.sponsors);
      } else {
        setSponsors([]);
      }
    } catch (err: unknown) {
      console.error('Error fetching my cars/appointments/sponsors:', err);
      Alert.alert(t('common.error'), t('cars.fetchMyCarsFailed'));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.type, t]);

  const throttledFetchMyCars = useMemo(
    () => createAsyncThrottle(2500),
    [],
  );

  const loadMyCarsAndRdv = useCallback(() => {
    void throttledFetchMyCars(() => fetchMyCarsAndRdv());
  }, [throttledFetchMyCars, fetchMyCarsAndRdv]);

  // Socket.IO connection for real-time updates
  const socketRef = useRef<Socket | null>(null);

  // Fetch data when page is focused (throttled — avoids triple burst on open).
  useFocusEffect(
    useCallback(() => {
      if (!isLoading && isAuthenticated) {
        loadMyCarsAndRdv();
      }
    }, [isLoading, isAuthenticated, loadMyCarsAndRdv])
  );

  // Refresh when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated) {
        loadMyCarsAndRdv();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, loadMyCarsAndRdv]);

  useEffect(() => {
    if (!showAddModal) return;
    setLocationData(EMPTY_CAR_LOCATION);
  }, [showAddModal]);

  // Reference colors: GET /api/car/colors-reference -> { ok: true, colors: [{ id, name }] }
  // Prefetch when the seller opens this tab; retry when Add Car / color picker opens if still empty.
  // Do NOT cancel in-flight fetches on modal close — a prior bug set a "fetched" ref before the
  // request finished, then cleanup cancelled setState, leaving the ref stuck and colors empty forever.
  const colorsInFlightRef = useRef<Promise<void> | null>(null);
  const colorsLoadAttemptRef = useRef(0);

  const loadReferenceColors = useCallback(async (): Promise<void> => {
    if (colorsInFlightRef.current) {
      return colorsInFlightRef.current;
    }

    const attempt = ++colorsLoadAttemptRef.current;
    const promise = (async () => {
      setLoadingColors(true);
      try {
        const res = await apiRequest('/car/colors-reference');
        const data = await res.json().catch(() => ({} as any));
        if (attempt !== colorsLoadAttemptRef.current) return;

        if (res.ok && data?.ok && Array.isArray(data.colors)) {
          const list = data.colors
            .filter((c: any) => c && typeof c.name === 'string' && c.name.trim())
            .map((c: any) => ({ id: String(c.id ?? c._id ?? c.name), name: String(c.name) }));
          setAvailableColors(list);
          if (__DEV__) console.log('[Cars] Loaded reference colors:', list.length);
        } else if (__DEV__) {
          console.warn('[Cars] Bad colors-reference response:', res.status, data);
        }
      } catch (err) {
        if (attempt === colorsLoadAttemptRef.current) {
          console.warn('[Cars] Failed to load reference colors:', err);
        }
      } finally {
        if (attempt === colorsLoadAttemptRef.current) {
          setLoadingColors(false);
        }
      }
    })();

    colorsInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      if (colorsInFlightRef.current === promise) {
        colorsInFlightRef.current = null;
      }
    }
  }, []);

  const openColorPicker = useCallback(() => {
    setShowColorPicker(true);
    if (availableColors.length === 0 && !loadingColors) {
      void loadReferenceColors();
    }
  }, [availableColors.length, loadingColors, loadReferenceColors]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadReferenceColors();
  }, [isAuthenticated, loadReferenceColors]);

  useEffect(() => {
    if (!showAddModal || availableColors.length > 0) return;
    void loadReferenceColors();
  }, [showAddModal, availableColors.length, loadReferenceColors]);

  // Setup Socket.IO for real-time updates
  useEffect(() => {
    if (!isAuthenticated || !user?._id || user?.type !== 'user') {
      return;
    }

    // Close existing socket if any
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const backendUrl = getBackendUrl();
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected for cars page');
      const userId = user._id || (user as any).id;
      if (userId) {
        socket.emit('join_user', userId);
      }
    });

    // Listen for new notifications - refresh on ANY notification when on cars page
    // This ensures we catch all car/RDV status changes immediately, including from workshops
    socket.on('new_notification', (notificationData: any) => {
      console.log('📬 New notification received on cars page:', notificationData);
      
      // When user is on cars page, refresh on ANY notification
      // This catches all updates including workshop notifications about cars/RDVs
      console.log('🔄 Refreshing cars page data immediately...');
      
      // Refresh immediately - no delay needed as backend already processed
      refreshDataSilently();
    });

    // Listen for new appointment updates (creation)
    socket.on('new_appointment', (appointmentData: any) => {
      console.log('📅 New appointment received on cars page:', appointmentData);
      // Refresh appointments data immediately (silently)
      refreshDataSilently();
    });

    // Listen for appointment status updates
    socket.on('appointment_status_update', (appointmentData: any) => {
      console.log('Appointment status update received on cars page:', appointmentData);
      // Refresh appointments data immediately when status changes (silently)
      refreshDataSilently();
    });

    // Listen for RDV status changes
    socket.on('rdv_status_update', (rdvData: any) => {
      console.log('RDV status update received on cars page:', rdvData);
      // Refresh appointments data immediately (silently)
      refreshDataSilently();
    });

    // Listen for car status updates
    socket.on('car_status_update', (carData: any) => {
      console.log('Car status update received on cars page:', carData);
      // Refresh cars data immediately when status changes (silently)
      refreshDataSilently();
    });

    // Listen for car updates in general
    socket.on('car_update', (carData: any) => {
      console.log('Car update received on cars page:', carData);
      // Refresh cars data immediately (silently)
      refreshDataSilently();
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected from cars page');
    });

    socket.on('error', (error: any) => {
      console.error('Socket error on cars page:', error);
    });

    socketRef.current = socket;

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, user?._id, user?.type, refreshDataSilently]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMyCarsAndRdv();
    setRefreshing(false);
  }, [fetchMyCarsAndRdv]);

  const appointmentsByCarId = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const apt of appointments) {
      const carId =
        apt?.id_car?._id?.toString?.() ||
        apt?.id_car?.id?.toString?.() ||
        (typeof apt?.id_car === 'string' ? apt.id_car : null);
      if (!carId) continue;
      const existing = map.get(carId) || [];
      existing.push(apt);
      map.set(carId, existing);
    }
    // Sort each list by date/time desc
    for (const [carId, list] of map.entries()) {
      list.sort((a, b) => {
        const ad = new Date(a.date).getTime();
        const bd = new Date(b.date).getTime();
        if (bd !== ad) return bd - ad;
        return (b.time || '').localeCompare(a.time || '');
      });
      map.set(carId, list);
    }
    return map;
  }, [appointments]);

  /**
   * Index of sponsors by car id. Each value is the most recent (latest end_date)
   * sponsor for that car, so the active-sponsor pill on car cards in the
   * `all` / `termine` views shows the sponsor that's actually live right now.
   */
  const sponsorsByCarId = useMemo(() => {
    const map = new Map<string, Sponsor>();
    for (const s of sponsors) {
      if (!isSponsorActive(s, now)) continue;
      const carId =
        typeof s.id_car === 'string'
          ? s.id_car
          : (s.id_car as any)?._id?.toString?.() || (s.id_car as any)?.id?.toString?.();
      if (!carId) continue;
      const existing = map.get(carId);
      if (!existing) {
        map.set(carId, s);
        continue;
      }
      const existingEnd = new Date(existing.end_date).getTime();
      const candidateEnd = new Date(s.end_date).getTime();
      if (candidateEnd > existingEnd) map.set(carId, s);
    }
    return map;
  }, [sponsors, now]);

  const { pendingSponsors, activeSponsors, inactiveSponsors } = useMemo(() => {
    const pending: Sponsor[] = [];
    const active: Sponsor[] = [];
    const inactive: Sponsor[] = [];
    for (const s of sponsors) {
      if (isPendingSponsorPayment(s)) pending.push(s);
      else if (isSponsorActive(s, now)) active.push(s);
      else inactive.push(s);
    }
    return { pendingSponsors: pending, activeSponsors: active, inactiveSponsors: inactive };
  }, [sponsors, now]);

  // Verify payment when user returns from the system browser (Chargily).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const ctx = pendingPaymentContextRef.current;
      if (!ctx?.sponsorId || paymentVerifyInFlightRef.current) return;

      paymentVerifyInFlightRef.current = true;
      setPaymentSummary({
        car: ctx.car,
        plan: ctx.plan,
        sponsorId: ctx.sponsorId,
      });
      setShowSponsorPaymentModal(true);
      setVerifyingPayment(true);
      setPaymentError('');

      void (async () => {
        try {
          const paid = await pollSponsorPaymentStatus(ctx.sponsorId);
          if (paid) {
            pendingPaymentContextRef.current = null;
            setPaymentDone(true);
          } else {
            setPaymentError(t('cars.sponsor.paymentVerifyPending'));
          }
          void refreshDataSilently();
        } finally {
          setVerifyingPayment(false);
          paymentVerifyInFlightRef.current = false;
        }
      })();
    });
    return () => sub.remove();
  }, [refreshDataSilently, t]);

  const openPaymentForSponsor = useCallback(
    (sponsor: Sponsor) => {
      const populated =
        typeof sponsor.id_car === 'object' && sponsor.id_car !== null
          ? (sponsor.id_car as Partial<Car> & { _id: string })
          : null;
      setPaymentSummary({
        car: populated
          ? {
              id: populated._id || (typeof sponsor.id_car === 'string' ? sponsor.id_car : ''),
              _id: populated._id || '',
              brand: populated.brand,
              model: populated.model,
              year: populated.year,
              had_previous_sponsor: false,
              previous_sponsor_end_date: null,
            }
          : null,
        plan: {
          id: '',
          duration: sponsor.duration,
          price: sponsor.price,
        },
        sponsorId: sponsor._id || sponsor.id,
      });
      setPaymentDone(false);
      setPaymentError('');
      setVerifyingPayment(false);
      setShowSponsorPaymentModal(true);
    },
    []
  );

  /**
   * Map the i18next short code to a BCP-47 locale that the Intl API understands.
   * This is what makes the sponsor section's dates respect the user's chosen
   * language (fr → fr-FR, en → en-US, ar → ar-DZ).
   */
  const dateLocale = useMemo(() => {
    switch (i18n.language) {
      case 'en':
        return 'en-US';
      case 'ar':
        return 'ar-DZ';
      case 'fr':
      default:
        return 'fr-FR';
    }
  }, [i18n.language]);

  const formatLocalDate = useCallback(
    (iso: string): string => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      try {
        return d.toLocaleDateString(dateLocale);
      } catch {
        return d.toLocaleDateString();
      }
    },
    [dateLocale]
  );

  /**
   * Format the time remaining until `end_date` as "Xd Yh Zm". Returns the
   * localized "Expired" label once the deadline has passed.
   */
  const formatTimeRemaining = useCallback(
    (endDateIso: string): string => {
      const endMs = new Date(endDateIso).getTime();
      if (!Number.isFinite(endMs)) return '';
      const diff = endMs - now;
      if (diff <= 0) return t('cars.sponsor.expired');

      const totalMinutes = Math.floor(diff / (60 * 1000));
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;

      const parts: string[] = [];
      if (days > 0) parts.push(`${days}${t('cars.sponsor.daysShort')}`);
      if (hours > 0) parts.push(`${hours}${t('cars.sponsor.hoursShort')}`);
      // Always show minutes when nothing else fits, otherwise hide when 0.
      if (parts.length === 0 || minutes > 0) {
        parts.push(`${minutes}${t('cars.sponsor.minutesShort')}`);
      }
      return parts.join(' ');
    },
    [now, t]
  );

  const renderSponsorCard = useCallback(
    (s: Sponsor) => {
      const populated =
        typeof s.id_car === 'object' && s.id_car !== null
          ? (s.id_car as Partial<Car> & { _id: string })
          : null;
      const carId = populated?._id || (typeof s.id_car === 'string' ? s.id_car : '');
      const img =
        populated?.images && populated.images[0] ? getImageUrl(populated.images[0]) : null;
      const active = isSponsorActive(s, now);
      const pending = isPendingSponsorPayment(s);
      const cancelled = isSponsorCancelled(s);
      const expired = isSponsorExpiredPaid(s, now);
      const remaining = formatTimeRemaining(s.end_date);
      const startStr = pending ? t('cars.sponsor.afterPayment') : formatLocalDate(s.start_date);
      const endStr = pending ? t('cars.sponsor.afterPayment') : formatLocalDate(s.end_date);

      return (
        <View key={s._id} style={styles.card}>
          <View style={styles.cardImageWrap}>
            {img ? (
              <Image source={{ uri: img }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={styles.cardImagePlaceholder}>
                <IconSymbol name="photo" size={scale(34)} color="#94a3b8" />
                <ThemedText style={styles.cardImagePlaceholderText}>{t('cars.noImage')}</ThemedText>
              </View>
            )}

            <View style={styles.badgesRow}>
              <LinearGradient
                colors={
                  active
                    ? ['#9333ea', '#7c3aed']
                    : pending
                      ? ['#f59e0b', '#d97706']
                      : ['#64748b', '#475569']
                }
                style={styles.badge}
              >
                <ThemedText style={styles.badgeText}>
                  {active
                    ? t('cars.sponsor.active')
                    : pending
                      ? t('cars.sponsor.pendingPayment')
                      : cancelled
                        ? t('cars.sponsor.cancelled')
                        : t('cars.sponsor.expired')}
                </ThemedText>
              </LinearGradient>
              {populated?.year != null ? (
                <View style={styles.yearPill}>
                  <ThemedText style={styles.yearPillText}>{populated.year}</ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.cardBody}>
            <ThemedText style={styles.cardTitle}>
              {populated
                ? `${populated.brand ?? ''} ${populated.model ?? ''}`.trim()
                : t('cars.unknownCar')}
            </ThemedText>

            <View style={styles.sponsorInfoBox}>
              <View style={styles.sponsorInfoRow}>
                <IconSymbol name="calendar" size={scale(16)} color="#7c3aed" />
                <ThemedText style={styles.sponsorInfoLabel}>{t('cars.sponsor.startDate')}</ThemedText>
                <ThemedText style={styles.sponsorInfoValue}>{startStr}</ThemedText>
              </View>
              <View style={styles.sponsorInfoRow}>
                <IconSymbol name="calendar" size={scale(16)} color="#7c3aed" />
                <ThemedText style={styles.sponsorInfoLabel}>{t('cars.sponsor.endDate')}</ThemedText>
                <ThemedText style={styles.sponsorInfoValue}>{endStr}</ThemedText>
              </View>
              <View style={styles.sponsorInfoRow}>
                <IconSymbol name="clock.fill" size={scale(16)} color="#7c3aed" />
                <ThemedText style={styles.sponsorInfoLabel}>{t('cars.sponsor.duration')}</ThemedText>
                <ThemedText style={styles.sponsorInfoValue}>
                  {s.duration} {t('cars.sponsor.daysShort')}
                </ThemedText>
              </View>
              {s.price > 0 ? (
                <View style={styles.sponsorInfoRow}>
                  <IconSymbol name="tag.fill" size={scale(16)} color="#7c3aed" />
                  <ThemedText style={styles.sponsorInfoLabel}>{t('cars.sponsor.price')}</ThemedText>
                  <ThemedText style={styles.sponsorInfoValue}>
                    {s.price.toLocaleString()} {t('home.priceCurrency')}
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {pending ? (
              <View style={styles.sponsorPendingBox}>
                <ThemedText style={styles.sponsorPendingText}>
                  {t('cars.sponsor.pendingPaymentRequired')}
                </ThemedText>
                <TouchableOpacity
                  style={styles.sponsorPayBtn}
                  activeOpacity={0.9}
                  onPress={() => openPaymentForSponsor(s)}
                >
                  <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.sponsorPayBtnGradient}>
                    <ThemedText style={styles.sponsorPayBtnText}>
                      {t('cars.sponsor.payButtonChargily')}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.sponsorRemainingBox, !active && styles.sponsorRemainingBoxExpired]}>
                <IconSymbol
                  name={active ? 'clock.fill' : 'exclamationmark.triangle.fill'}
                  size={scale(18)}
                  color={active ? '#7c3aed' : '#94a3b8'}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.sponsorRemainingLabel}>
                    {active ? t('cars.sponsor.timeRemaining') : t('cars.sponsor.statusLabel')}
                  </ThemedText>
                  <ThemedText
                    style={[styles.sponsorRemainingValue, !active && styles.sponsorRemainingValueExpired]}
                  >
                    {active
                      ? remaining
                      : cancelled
                        ? t('cars.sponsor.cancelled')
                        : expired
                          ? t('cars.sponsor.expired')
                          : t('cars.sponsor.inactive')}
                  </ThemedText>
                </View>
              </View>
            )}

            {carId ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/car/${carId}`)}
                >
                  <IconSymbol name="doc.text.fill" size={scale(18)} color="#0d9488" />
                  <ThemedText style={styles.secondaryBtnText}>{t('common.details')}</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [formatLocalDate, formatTimeRemaining, now, openPaymentForSponsor, router, t],
  );

  // -------------------------------------------------------------------------
  // Create-Sponsor flow handlers
  // -------------------------------------------------------------------------

  /**
   * Open the Create Sponsor modal and lazily load both the eligible cars
   * (active, no active sponsor) and the available subscription plans in
   * parallel from the backend.
   */
  const openCreateSponsorModal = useCallback(async () => {
    setSelectedSponsorCarId('');
    setSelectedSponsorPlanId('');
    setShowCreateSponsorModal(true);

    setLoadingSponsorableCars(true);
    setLoadingSponsorPlans(true);
    try {
      const [carsRes, plansRes] = await Promise.all([
        apiRequest('/sponsor/sponsorable-cars'),
        apiRequest('/sponsor/plans'),
      ]);
      const carsData = await carsRes.json().catch(() => null);
      const plansData = await plansRes.json().catch(() => null);

      if (carsRes.ok && carsData?.ok && Array.isArray(carsData.cars)) {
        setSponsorableCars(carsData.cars);
      } else {
        setSponsorableCars([]);
      }

      if (plansRes.ok && plansData?.ok && Array.isArray(plansData.plans)) {
        setSponsorPlans(plansData.plans);
      } else {
        setSponsorPlans([]);
      }
    } catch (err) {
      console.error('[Sponsor] Failed to load create-modal data:', err);
      setSponsorableCars([]);
      setSponsorPlans([]);
    } finally {
      setLoadingSponsorableCars(false);
      setLoadingSponsorPlans(false);
    }
  }, []);

  /**
   * Submit the Create Sponsor form. On success: close the picker modal, open
   * the payment summary modal, and refresh the user's sponsor list.
   */
  const submitCreateSponsor = useCallback(async () => {
    if (!selectedSponsorCarId || !selectedSponsorPlanId) {
      Alert.alert(t('common.validation'), t('cars.sponsor.selectCarAndPlan'));
      return;
    }
    const car = sponsorableCars.find((c) => c.id === selectedSponsorCarId) || null;
    const plan = sponsorPlans.find((p) => p.id === selectedSponsorPlanId) || null;

    try {
      setCreatingSponsor(true);
      const res = await apiRequest('/sponsor/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_car: selectedSponsorCarId,
          id_abonnement: selectedSponsorPlanId,
        }),
      });
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data?.ok) {
        Alert.alert(
          t('common.error'),
          data?.message || t('cars.sponsor.createFailed')
        );
        return;
      }

      // Close the picker, refresh the sponsor list, and open the payment modal.
      setShowCreateSponsorModal(false);
      const sponsorId =
        data.sponsor?.id || data.sponsor?._id || data.sponsor_id || undefined;
      setPaymentSummary({ car, plan, sponsorId });
      setPaymentDone(false);
      setPaymentError('');
      setShowSponsorPaymentModal(true);
      // Refresh the sponsor list in the background so the new card shows up.
      void refreshDataSilently();
    } catch (err: any) {
      console.error('[Sponsor] Create sponsor error:', err);
      Alert.alert(t('common.error'), t('cars.sponsor.createFailed'));
    } finally {
      setCreatingSponsor(false);
    }
  }, [
    selectedSponsorCarId,
    selectedSponsorPlanId,
    sponsorableCars,
    sponsorPlans,
    t,
    refreshDataSilently,
  ]);

  /** Chargily checkout — close modal, open in-app browser (Custom Tabs), then verify payment. */
  const handlePayNow = useCallback(async () => {
    if (paymentDone) {
      setShowSponsorPaymentModal(false);
      setPaymentSummary({ car: null, plan: null });
      setPaymentDone(false);
      setPaymentError('');
      pendingPaymentContextRef.current = null;
      void refreshDataSilently();
      return;
    }

    const sponsorId = paymentSummary.sponsorId;
    if (!sponsorId) {
      setPaymentError(t('cars.sponsor.sponsorNotFound'));
      return;
    }

    warmUpChargilyBrowser();
    setPayingNow(true);
    setPaymentError('');

    try {
      const data = await fetchSponsorCheckoutUrl(sponsorId, t);

      if (data.message) {
        setPaymentError(data.message);
        setPayingNow(false);
        return;
      }

      if (data.already_paid === true) {
        setPayingNow(false);
        void refreshDataSilently();
        const confirmed = await verifySponsorPaidStatus(sponsorId);
        if (confirmed) {
          pendingPaymentContextRef.current = null;
          setPaymentDone(true);
        } else {
          setPaymentError(t('cars.sponsor.paymentNotConfirmed'));
        }
        return;
      }

      const checkoutUrl =
        typeof data.checkout_url === 'string' ? data.checkout_url.trim() : '';
      if (!checkoutUrl) {
        setPaymentError(t('cars.sponsor.checkoutUrlMissing'));
        setPayingNow(false);
        return;
      }

      const payContext = {
        sponsorId,
        car: paymentSummary.car,
        plan: paymentSummary.plan,
      };
      pendingPaymentContextRef.current = payContext;

      // Close modal first — Android blocks Custom Tabs while a RN Modal is visible.
      setPayingNow(false);
      setShowSponsorPaymentModal(false);
      await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 400 : 200));

      paymentVerifyInFlightRef.current = true;
      const openResult = await openChargilyCheckoutUrl(checkoutUrl);

      if (openResult === 'failed') {
        paymentVerifyInFlightRef.current = false;
        pendingPaymentContextRef.current = null;
        setPaymentSummary({
          car: payContext.car,
          plan: payContext.plan,
          sponsorId: payContext.sponsorId,
        });
        setShowSponsorPaymentModal(true);
        setPaymentError(t('cars.sponsor.cannotOpenPaymentUrl'));
        return;
      }

      if (openResult === 'external_launched') {
        // Linking opened the system browser — AppState listener verifies on return.
        paymentVerifyInFlightRef.current = false;
        return;
      }

      // In-app browser closed — verify payment immediately.
      setPaymentSummary({
        car: payContext.car,
        plan: payContext.plan,
        sponsorId: payContext.sponsorId,
      });
      setShowSponsorPaymentModal(true);
      setVerifyingPayment(true);
      setPaymentError('');

      try {
        const paid = await pollSponsorPaymentStatus(sponsorId);
        if (paid) {
          pendingPaymentContextRef.current = null;
          setPaymentDone(true);
        } else {
          setPaymentError(t('cars.sponsor.paymentVerifyPending'));
        }
        void refreshDataSilently();
      } finally {
        setVerifyingPayment(false);
        paymentVerifyInFlightRef.current = false;
      }
    } catch {
      setPaymentError(t('cars.sponsor.paymentConnectionError'));
      setPayingNow(false);
      paymentVerifyInFlightRef.current = false;
    }
  }, [
    paymentDone,
    paymentSummary.sponsorId,
    paymentSummary.car,
    paymentSummary.plan,
    t,
    refreshDataSilently,
  ]);

  // Filter cars based on RDV filter (Fini cars only appear in « Fini »)
  // The Sponsor tab renders its own dedicated list (see Sponsor section below),
  // so we return an empty list here to skip the regular car cards.
  const filteredCars = useMemo(() => {
    if (rdvFilter === 'sponsor') {
      return [];
    }

    return cars.filter((car) => {
      const carId = car._id?.toString?.() || car.id || '';
      const apts = appointmentsByCarId.get(carId) || [];
      const hasRdv = apts.length > 0;
      const hasActiveOrPendingRdv = apts.some((apt) => apt.status !== 'finish');
      const isFini = isFiniSectionCar(car, apts);

      if (rdvFilter === 'all') {
        return true;
      }
      if (rdvFilter === 'with_rdv') {
        return hasRdv && hasActiveOrPendingRdv && !isFini;
      }
      if (rdvFilter === 'without_rdv') {
        return !hasRdv && !isFini;
      }
      if (rdvFilter === 'termine') {
        return isFini;
      }

      return true;
    });
  }, [cars, appointmentsByCarId, rdvFilter]);

  const canCreateRdvForCar = useCallback(
    (car: Car) => {
      const carId = car._id?.toString?.() || car.id;
      if (!carId) return false;
      const apts = appointmentsByCarId.get(carId) || [];
      if (apts.length === 0) return true;
      const latest = apts[0];
      // Allow new RDV only if latest is refused
      return latest?.status === 'refused';
    },
    [appointmentsByCarId]
  );

  const canManageSellerRdv = useCallback(
    (status: string) => status === 'en_attente' || status === 'accepted',
    [],
  );

  const toDateInputValue = useCallback((dateVal: string | Date) => {
    const d = new Date(dateVal);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const getWorkshopIdFromAppointment = useCallback((apt: Appointment) => {
    const iw = apt.id_workshop;
    if (iw && typeof iw === 'object') return String(iw._id || iw.id || '');
    return String(iw || '');
  }, []);

  const getAppointmentId = useCallback(
    (apt: Appointment) => String(apt._id || apt.id || ''),
    [],
  );

  const getWorkshopNameFromAppointment = useCallback((apt: Appointment) => {
    const iw = apt.id_workshop;
    if (iw && typeof iw === 'object' && iw.name) return String(iw.name);
    return '';
  }, []);

  const fetchRescheduleAvailableTimes = useCallback(
    async (workshopId: string, date: string, appointmentId: string) => {
      if (!workshopId || !date) return;
      try {
        setLoadingRescheduleTimes(true);
        setRescheduleAvailableTimes([]);
        const query =
          `?id_workshop=${encodeURIComponent(workshopId)}` +
          `&date=${encodeURIComponent(date)}` +
          `&exclude_appointment_id=${encodeURIComponent(appointmentId)}`;
        const res = await apiRequest(`/rdv-workshop/available-times${query}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && Array.isArray(data.availableTimes)) {
          setRescheduleAvailableTimes(data.availableTimes);
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingRescheduleTimes(false);
      }
    },
    [],
  );

  const openRescheduleModal = useCallback(
    (appointment: Appointment) => {
      const dateStr = toDateInputValue(appointment.date);
      setRescheduleTarget(appointment);
      setRescheduleDate(dateStr);
      setRescheduleTime(appointment.time || '');
      setRescheduleAvailableTimes([]);
      const [year, month, day] = dateStr.split('-').map(Number);
      setRescheduleSelectedDate(new Date(year, month - 1, day));
      setShowRescheduleDatePicker(false);
      setShowRescheduleModal(true);
      const workshopId = getWorkshopIdFromAppointment(appointment);
      const appointmentId = getAppointmentId(appointment);
      if (workshopId && dateStr) {
        void fetchRescheduleAvailableTimes(workshopId, dateStr, appointmentId);
      }
    },
    [toDateInputValue, getWorkshopIdFromAppointment, getAppointmentId, fetchRescheduleAvailableTimes],
  );

  const submitRescheduleRdv = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) {
      Alert.alert(t('common.validation'), t('cars.validation.rdvRequired'));
      return;
    }
    const appointmentId = getAppointmentId(rescheduleTarget);
    try {
      setIsRescheduling(true);
      const res = await apiRequest(`/rdv-workshop/my-appointments/${appointmentId}/reschedule`, {
        method: 'PUT',
        body: JSON.stringify({ date: rescheduleDate, time: rescheduleTime }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert(t('common.error'), data?.message || t('cars.errors.genericRescheduleRdv'));
        return;
      }
      setShowRescheduleModal(false);
      setRescheduleTarget(null);
      Alert.alert(t('common.success'), data?.message || t('cars.success.rdvRescheduled'));
      await refreshDataSilently();
    } catch (err) {
      console.error('submitRescheduleRdv:', err);
      Alert.alert(t('common.error'), t('cars.errors.genericRescheduleRdv'));
    } finally {
      setIsRescheduling(false);
    }
  };

  const promptCancelRdv = (appointment: Appointment) => {
    const workshopName = getWorkshopNameFromAppointment(appointment);
    Alert.alert(
      t('cars.cancelRdvTitle'),
      t('cars.cancelRdvMessage') + (workshopName ? `\n\n${workshopName}` : ''),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cars.cancelRdvConfirm'),
          style: 'destructive',
          onPress: () => void submitCancelRdv(appointment),
        },
      ],
    );
  };

  const submitCancelRdv = async (appointment: Appointment) => {
    const appointmentId = getAppointmentId(appointment);
    try {
      setIsCancellingRdv(true);
      const res = await apiRequest(`/rdv-workshop/my-appointments/${appointmentId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert(t('common.error'), data?.message || t('cars.errors.genericCancelRdv'));
        return;
      }
      Alert.alert(t('common.success'), data?.message || t('cars.success.rdvCancelled'));
      await refreshDataSilently();
    } catch (err) {
      console.error('submitCancelRdv:', err);
      Alert.alert(t('common.error'), t('cars.errors.genericCancelRdv'));
    } finally {
      setIsCancellingRdv(false);
    }
  };

  useEffect(() => {
    if (!showRescheduleModal || !rescheduleTarget || !rescheduleDate) return;
    const workshopId = getWorkshopIdFromAppointment(rescheduleTarget);
    const appointmentId = getAppointmentId(rescheduleTarget);
    if (!workshopId) return;
    void fetchRescheduleAvailableTimes(workshopId, rescheduleDate, appointmentId);
  }, [
    showRescheduleModal,
    rescheduleTarget,
    rescheduleDate,
    getWorkshopIdFromAppointment,
    getAppointmentId,
    fetchRescheduleAvailableTimes,
  ]);

  // Maximum number of images allowed
  const MAX_IMAGES = 10;

  const pickImages = async () => {
    try {
      // Check current images count
      const remainingSlots = MAX_IMAGES - pickedImages.length;
      if (remainingSlots <= 0) {
        Alert.alert(t('cars.limits.reachedTitle'), t('cars.limits.maxImages', { max: MAX_IMAGES }));
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('cars.permissions.requiredTitle'), t('cars.permissions.photosBody'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: remainingSlots, // Limit based on remaining slots
      });

      if (!result.canceled && result.assets?.length) {
        // Validate file sizes (5MB max per file)
        const invalidFiles = result.assets.filter(asset => (asset.fileSize || 0) > 5 * 1024 * 1024);
        if (invalidFiles.length > 0) {
          Alert.alert(t('common.error'), t('cars.errors.someFilesTooLarge'));
          return;
        }
        
        // Check total images count
        const newTotal = pickedImages.length + result.assets.length;
        if (newTotal > MAX_IMAGES) {
          Alert.alert(
            t('cars.limits.reachedTitle'),
            t('cars.limits.maxImagesWithSelected', { max: MAX_IMAGES, count: pickedImages.length })
          );
          return;
        }

        // Show progress modal while importing selected images
        setShowUploadModal(true);
        setUploadPercent(0);
        await new Promise((r) => setTimeout(r, 30));
        const toAdd = result.assets;
        const existing = [...pickedImages];
        for (let i = 0; i < toAdd.length; i++) {
          existing.push(toAdd[i]);
          const pct = Math.round(((i + 1) / toAdd.length) * 100);
          setUploadPercent(pct);
          // yield to UI
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 10));
        }
        setPickedImages(existing);
        setShowUploadModal(false);
        setUploadPercent(0);
      }
    } catch (err: unknown) {
      console.error('pickImages:', err);
      Alert.alert(t('common.error'), t('cars.errors.openGallery'));
    }
  };

  const takePicture = async () => {
    try {
      // Check current images count
      const remainingSlots = MAX_IMAGES - pickedImages.length;
      if (remainingSlots <= 0) {
        Alert.alert(t('cars.limits.reachedTitle'), t('cars.limits.maxImages', { max: MAX_IMAGES }));
        return;
      }

      // Request camera permission
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('cars.permissions.requiredTitle'), t('cars.permissions.cameraBody'));
        return;
      }

      // On Android APK, camera capture can return a URI that Expo can't display
      // unless media-library permission is granted too.
      if (Platform.OS === 'android') {
        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mediaPermission.granted) {
          Alert.alert(
            t('cars.permissions.requiredTitle'),
            t('cars.permissions.photosBody')
          );
          return;
        }
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        
        // Validate file size (5MB max)
        if ((asset.fileSize || 0) > 5 * 1024 * 1024) {
          Alert.alert(t('common.error'), t('cars.errors.imageTooLarge'));
          return;
        }

        // Check total images count
        if (pickedImages.length >= MAX_IMAGES) {
          Alert.alert(t('cars.limits.reachedTitle'), t('cars.limits.maxImages', { max: MAX_IMAGES }));
          return;
        }

        // Show quick progress while adding camera image
        setShowUploadModal(true);
        setUploadPercent(0);
        await new Promise((r) => setTimeout(r, 30));
        setUploadPercent(60);
        setPickedImages([...pickedImages, asset]);
        await new Promise((r) => setTimeout(r, 80));
        setUploadPercent(100);
        await new Promise((r) => setTimeout(r, 120));
        setShowUploadModal(false);
        setUploadPercent(0);
      }
    } catch (err: unknown) {
      console.error('takePicture:', err);
      Alert.alert(t('common.error'), t('cars.errors.openCamera'));
    }
  };

  // Normalize URIs so Expo Image can display them on Android APK builds.
  const getDisplayImageUri = (uri?: string | null) => {
    if (!uri) return null;
    if (
      uri.startsWith('file://') ||
      uri.startsWith('content://') ||
      uri.startsWith('http://') ||
      uri.startsWith('https://')
    ) {
      return uri;
    }
    return `file://${uri}`;
  };

  const showImagePickerOptions = () => {
    const remainingSlots = MAX_IMAGES - pickedImages.length;
    if (remainingSlots <= 0) {
      Alert.alert(t('cars.limits.reachedTitle'), t('cars.limits.maxImages', { max: MAX_IMAGES }));
      return;
    }

    Alert.alert(
      t('cars.addImagesTitle'),
      `${pickedImages.length}/${MAX_IMAGES}`,
      [
        {
          text: 'Camera',
          onPress: takePicture,
        },
        {
          text: 'Gallery',
          onPress: pickImages,
        },
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
      ]
    );
  };

  // Normalize strings for comparison
  const normalizeString = (str: string): string => {
    return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  };

  // Check if brand/model match VIN data
  const checkBrandModelMatch = (brand: string, model: string): { match: boolean; error?: string } => {
    if (!vinDetails || !vinValid) {
      return { match: true };
    }

    const normalizedBrand = normalizeString(brand);
    const normalizedModel = normalizeString(model);
    const normalizedVinMake = normalizeString(vinDetails.make || '');
    const normalizedVinModel = normalizeString(vinDetails.model || '');

    const brandMatch = normalizedBrand === normalizedVinMake || 
                       normalizedVinMake.includes(normalizedBrand) || 
                       normalizedBrand.includes(normalizedVinMake);

    const modelMatch = normalizedModel === normalizedVinModel || 
                       normalizedVinModel.includes(normalizedModel) || 
                       normalizedModel.includes(normalizedVinModel);

    if (!brandMatch || !modelMatch) {
      const errorDetails: string[] = [];
      if (!brandMatch) {
        errorDetails.push(
          t('cars.vinBrandMismatch', { brand, vinMake: vinDetails.make })
        );
      }
      if (!modelMatch) {
        errorDetails.push(
          t('cars.vinModelMismatch', { model, vinModel: vinDetails.model })
        );
      }
      const header = t('cars.vinMismatchHeader');
      const verifiedLine = t('cars.vinVerifiedLine', {
        make: vinDetails.make,
        model: vinDetails.model,
        year: vinDetails.year ? ` (${vinDetails.year})` : '',
      });
      return {
        match: false,
        error: `${header}\n\n${errorDetails.join('\n')}\n\n${verifiedLine}`,
      };
    }

    return { match: true };
  };

  // Handle VIN change and verification
  const handleVinChange = async (vin: string) => {
    // Clean VIN: uppercase, remove invalid chars, limit to 17
    const cleanedVin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
    setCarForm({ ...carForm, vin: cleanedVin });
    setVinError('');
    setVinValid(null);
    setVinRemark('');
    setVinDetails(null);
    setBypassVin(false);

    if (cleanedVin.length === 17) {
      setVinValidating(true);
      try {
        const response = await apiRequest('/car/verify-vin', {
          method: 'POST',
          body: JSON.stringify({ vin: cleanedVin }),
        });

        const data = await response.json().catch(() => null);

        if (response.ok && data?.ok && data.valid) {
          setVinValid(true);
          setVinError('');
          setVinRemark(data.remark || t('cars.vinVerifiedShort'));
          setVinDetails(data.details || null);
        } else {
          setVinValid(false);
          setVinError(t('cars.vinInvalidOrNotFound'));
          setVinRemark('');
          setVinDetails(null);
        }
      } catch (error: unknown) {
        console.error('Error verifying VIN:', error);
        setVinValid(false);
        setVinError(t('cars.vinConnectionError'));
        setVinRemark('');
        setVinDetails(null);
      } finally {
        setVinValidating(false);
      }
    }
  };

  const submitCreateCar = async () => {
    const finalBrand = showCustomBrand ? customBrand.trim() : carForm.brand.trim();
    const model = carForm.model.trim();
    const year = parseInt(carForm.year, 10);
    const km = parseInt(carForm.km, 10);
    const price = parseFloat(carForm.price);

    // Basic validation
    if (!finalBrand || !model || !year || isNaN(year) || isNaN(km) || isNaN(price)) {
      Alert.alert(t('common.validation'), t('cars.validation.requiredMain'));
      return;
    }

    // Year bounds validation: backend requires > 1900
    const currentYear = new Date().getFullYear();
    if (year <= 1900 || year > currentYear + 1) {
      Alert.alert(
        t('common.validation'),
        t('cars.errors.genericCreate') + '\n' + (t('cars.validation.invalidDate') || "L'année doit être supérieure à 1900")
      );
      return;
    }

    // Price validation: must be at least 200,000
    if (isNaN(price) || price < 200000) {
      Alert.alert(t('common.validation'), t('cars.validation.minPrice'));
      return;
    }

    // VIN validation if provided (unless bypass is enabled)
    if (carForm.vin && carForm.vin.length === 17 && !bypassVin) {
      if (vinValid === false || vinValidating) {
        Alert.alert(t('common.validation'), t('cars.validation.checkVin'));
        return;
      }
      if (vinValid === null) {
        Alert.alert(t('common.validation'), t('cars.validation.waitVin'));
        return;
      }

      // Check if brand and model match VIN data
      const matchResult = checkBrandModelMatch(finalBrand, model);
      if (!matchResult.match) {
        Alert.alert('Validation', matchResult.error || 'Les informations du véhicule ne correspondent pas au VIN vérifié');
        return;
      }
    }

    if (!pickedImages.length) {
      Alert.alert(t('common.validation'), t('cars.validation.addAtLeastOneImage'));
      return;
    }

    if (!locationData.commune.trim() || !locationData.wilaya.trim()) {
      Alert.alert(t('common.validation'), t('cars.validation.locationRequired'));
      return;
    }

    try {
      setCreatingCar(true);
      const form = new FormData();
      form.append('brand', finalBrand);
      form.append('model', model);
      form.append('year', String(year));
      form.append('km', String(km));
      form.append('price', String(price));

      if (carForm.vin.trim() && carForm.vin.length === 17) {
        form.append('vin', carForm.vin.trim());
        if (bypassVin) {
          form.append('bypassVin', 'true');
        }
      }
      if (carForm.color.trim()) form.append('color', carForm.color.trim());
      if (carForm.ports.trim()) form.append('ports', carForm.ports.trim());
      if (carForm.boite) form.append('boite', carForm.boite);
      if (carForm.type_gaz) form.append('type_gaz', carForm.type_gaz);
      if (carForm.type_enegine.trim()) form.append('type_enegine', carForm.type_enegine.trim());
      if (carForm.description.trim()) form.append('description', carForm.description.trim());
      if (carForm.usedby.trim()) form.append('usedby', carForm.usedby.trim());
      form.append('accident', carForm.accident ? 'true' : 'false');
      form.append('locationCommune', locationData.commune.trim());
      form.append('locationWilaya', locationData.wilaya.trim());
      if (locationData.daira.trim()) form.append('locationDaira', locationData.daira.trim());
      if (locationData.lat != null) form.append('locationLat', String(locationData.lat));
      if (locationData.lng != null) form.append('locationLng', String(locationData.lng));
      if (locationData.formattedAddress.trim()) {
        form.append('locationFormattedAddress', locationData.formattedAddress.trim());
      }

      // Validate that we have images to upload
      if (pickedImages.length === 0) {
        Alert.alert(t('common.validation'), t('cars.validation.addAtLeastOneImage'));
        return;
      }

      // Add images to FormData
      // React Native FormData format for file upload on Android/iOS
      pickedImages.forEach((asset, idx) => {
        if (!asset || !asset.uri) {
          console.warn(`Skipping invalid image asset at index ${idx}`);
          return;
        }
        
        // Get the URI - keep it as is (expo-image-picker already provides correct format)
        let uri = asset.uri;
        
        // Ensure file:// prefix for React Native FormData
        if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
          uri = `file://${uri}`;
        }
        
        // Extract filename
        let fileName = asset.fileName || 
                        asset.uri.split('/').pop()?.split('?')[0] || 
                        `car_${Date.now()}_${idx}.jpg`;
        
        // Get MIME type
        let mimeType = asset.mimeType || 
                       (asset as any).type || 
                       (fileName.toLowerCase().endsWith('.png') ? 'image/png' : 
                        fileName.toLowerCase().endsWith('.gif') ? 'image/gif' : 
                        fileName.toLowerCase().endsWith('.webp') ? 'image/webp' : 
                        (fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) ? 'image/jpeg' :
                        'image/jpeg');

        // Normalize HEIC/HEIF to JPEG (backend only allows JPEG/PNG/WEBP/GIF)
        const lowerMime = String(mimeType).toLowerCase();
        const isHeic = lowerMime.includes('heic') || lowerMime.includes('heif') || fileName.toLowerCase().endsWith('.heic') || fileName.toLowerCase().endsWith('.heif');
        if (isHeic) {
          mimeType = 'image/jpeg';
          if (!fileName.toLowerCase().endsWith('.jpg') && !fileName.toLowerCase().endsWith('.jpeg')) {
            fileName = fileName.replace(/\.(heic|heif)$/i, '') + '.jpg';
          }
        }

        // Enforce allowed set
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(mimeType)) {
          mimeType = 'image/jpeg';
          if (!fileName.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)) {
            fileName = fileName + '.jpg';
          }
        }
        
        // React Native FormData format: { uri, name, type }
        // For Android, uri can be file:// or content://
        // For iOS, uri should be file://
        form.append('images', {
          uri: uri,
          name: fileName,
          type: mimeType,
        } as any);
        
        // Log for debugging (works in production too if needed)
        console.log(`[Image Upload] Adding image ${idx + 1}/${pickedImages.length}:`, {
          uri: uri.substring(0, 50) + '...',
          name: fileName,
          type: mimeType,
          platform: Platform.OS,
        });
      });

      console.log(`[Car Creation] Uploading car with ${pickedImages.length} image(s)...`);
      console.log(`[Car Creation] Platform: ${Platform.OS}`);

      // Switch to XHR upload to track progress in a modal
      const backendUrl = getBackendUrl();
      const url = `${backendUrl}/api/car/create`;
      setShowUploadModal(true);
      setUploadPercent(0);
      await new Promise((r) => setTimeout(r, 60));
      const res: Response = await new Promise(async (resolve, reject) => {
        try {
          let token: string | null = null;
          try {
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            token = await AsyncStorage.getItem('auth_token');
          } catch {}
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url);
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setUploadPercent(pct);
            }
          };
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              const status = xhr.status;
              const statusText = xhr.statusText;
              const text = xhr.responseText ?? '';
              const response: Response = {
                ok: status >= 200 && status < 300,
                status,
                statusText,
                headers: new Headers(),
                url,
                redirected: false,
                type: 'basic',
                clone: () => response,
                body: null as any,
                bodyUsed: true,
                arrayBuffer: async () => new TextEncoder().encode(text).buffer,
                blob: async () => new Blob([text]),
                formData: async () => new FormData(),
                json: async () => {
                  try { return JSON.parse(text || '{}'); } catch { return null as any; }
                },
                text: async () => text,
              } as unknown as Response;
              resolve(response);
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(form as any);
        } catch (e) {
          reject(e as any);
        }
      });
      
      console.log(`[Car Creation] Response status: ${res.status}`);
      
      const data = await res.json().catch((err) => {
        console.error('[Car Creation] JSON parse error:', err);
        return null;
      });
      
      if (!res.ok || !data?.ok) {
        console.error('[Car Creation] Error response:', {
          status: res.status,
          statusText: res.statusText,
          data,
        });

        Alert.alert(t('common.error'), t('cars.errors.genericCreate'));
        return;
      }
      
      console.log('[Car Creation] Success!', data);
      setUploadPercent(100);

      setShowAddModal(false);
      setCarForm({
        brand: '',
        model: '',
        year: '',
        km: '',
        price: '',
        vin: '',
        color: '',
        ports: '',
        boite: '',
        type_gaz: '',
        type_enegine: '',
        description: '',
        accident: false,
        usedby: '',
      });
      setCustomBrand('');
      setShowCustomBrand(false);
      setCustomColor('');
      setShowCustomColor(false);
      setPickedImages([]);
      setVinValid(null);
      setVinError('');
      setVinRemark('');
      setVinDetails(null);
      setBypassVin(false);
      setLocationData(EMPTY_CAR_LOCATION);
      await fetchMyCarsAndRdv();
      Alert.alert(t('common.success'), t('cars.success.carCreated'));
    } catch (err: unknown) {
      console.error('Create car error:', err);
      Alert.alert(t('common.error'), t('cars.errors.genericCreate'));
    } finally {
      setCreatingCar(false);
      setShowUploadModal(false);
      setUploadPercent(0);
    }
  };

  const openRdvModal = async (car: Car) => {
    setSelectedCarForRdv(car);
    setRdvForm({ workshopId: '', date: '', time: '' });
    setAvailableTimes([]);
    setWorkshopFilters({ searchName: '', searchAdr: '', sortBy: 'name' });
    setRdvWorkshopSection('nearest');
    setShowDatePicker(false);
    setShowRdvModal(true);
    if (!workshops.length) {
      try {
        setLoadingWorkshops(true);
        // Use /workshop/all so the RDV picker shows every workshop in the
        // database (including pending / not-yet-activated ones), not just the
        // ones with status=true returned by /workshop/active.
        const res = await apiRequest('/workshop/all');
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && Array.isArray(data.workshops)) {
          setWorkshops(data.workshops);
        }
      } catch (err) {
        // ignore
      } finally {
        setLoadingWorkshops(false);
      }
    }
  };

  const wsHasLocation = useCallback(
    (w: Workshop) => typeof w.locationLat === 'number' && typeof w.locationLng === 'number',
    [],
  );

  const wsDistanceKm = useCallback(
    (w: Workshop): number | null => {
      if (userLat == null || userLng == null) return null;
      if (!wsHasLocation(w)) return null;
      return haversineKm(userLat, userLng, w.locationLat!, w.locationLng!);
    },
    [userLat, userLng, wsHasLocation],
  );

  const wsFormatDist = (km: number | null): string | null => {
    if (km == null) return null;
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  const rdvBaseFiltered = useMemo(() => {
    let filtered = [...workshops];
    const nameQ = workshopFilters.searchName.trim().toLowerCase();
    const adrQ = workshopFilters.searchAdr.trim().toLowerCase();
    if (nameQ) filtered = filtered.filter(w => w.name.toLowerCase().includes(nameQ));
    if (adrQ) filtered = filtered.filter(w => w.adr?.toLowerCase().includes(adrQ));
    return filtered;
  }, [workshops, workshopFilters]);

  const rdvNearestWorkshops = useMemo(() => {
    const sellerR = normalizeRegion(userRegion);
    return rdvBaseFiltered
      .filter(w => wsHasLocation(w))
      .sort((a, b) => {
        const aMatch = !!(sellerR && normalizeRegion(a.locationRegion ?? undefined) === sellerR);
        const bMatch = !!(sellerR && normalizeRegion(b.locationRegion ?? undefined) === sellerR);
        if (sellerR) {
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
        }
        const da = wsDistanceKm(a);
        const db = wsDistanceKm(b);
        if (da != null && db != null && da !== db) return da - db;
        if (da != null && db == null) return -1;
        if (da == null && db != null) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [rdvBaseFiltered, userRegion, wsDistanceKm, wsHasLocation]);

  const rdvRealTimeWorkshops = useMemo(
    () => rdvBaseFiltered.filter(w => !!w.real_time).sort((a, b) => a.name.localeCompare(b.name)),
    [rdvBaseFiltered],
  );

  const rdvOtherWorkshops = useMemo(() => {
    const nearIds = new Set(rdvNearestWorkshops.map(w => String(w._id || w.id)));
    const rtIds = new Set(rdvRealTimeWorkshops.map(w => String(w._id || w.id)));
    return rdvBaseFiltered
      .filter(w => {
        const wId = String(w._id || w.id);
        return !nearIds.has(wId) && !rtIds.has(wId);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rdvBaseFiltered, rdvNearestWorkshops, rdvRealTimeWorkshops]);

  const rdvSectionData = useMemo(() => {
    if (rdvWorkshopSection === 'nearest') return rdvNearestWorkshops;
    if (rdvWorkshopSection === 'real_time') return rdvRealTimeWorkshops;
    return rdvOtherWorkshops;
  }, [rdvWorkshopSection, rdvNearestWorkshops, rdvRealTimeWorkshops, rdvOtherWorkshops]);

  const fetchAvailableTimes = async (workshopId: string, date: string) => {
    if (!workshopId || !date) return;
    try {
      setLoadingTimes(true);
      setAvailableTimes([]);
      const query = `?id_workshop=${encodeURIComponent(workshopId)}&date=${encodeURIComponent(date)}`;
      const res = await apiRequest(`/rdv-workshop/available-times${query}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.availableTimes)) {
        setAvailableTimes(data.availableTimes);
      }
    } catch (err) {
      // ignore
    } finally {
      setLoadingTimes(false);
    }
  };

  const submitCreateRdv = async () => {
    if (!selectedCarForRdv) return;
    const workshopId = rdvForm.workshopId;
    const date = rdvForm.date.trim();
    const time = rdvForm.time.trim();

    if (!workshopId || !date || !time) {
      Alert.alert(t('common.validation'), t('cars.validation.rdvRequired'));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert(t('common.validation'), t('cars.validation.invalidDate'));
      return;
    }
    if (!/^([0-1]?[0-9]|2[0-3]):(00|30)$/.test(time)) {
      Alert.alert(t('common.validation'), t('cars.validation.invalidTime'));
      return;
    }

    const carId = selectedCarForRdv._id?.toString?.() || selectedCarForRdv.id;
    try {
      setCreatingRdv(true);
      const res = await apiRequest('/rdv-workshop/create', {
        method: 'POST',
        body: JSON.stringify({
          id_workshop: workshopId,
          id_car: carId,
          date,
          time,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        Alert.alert(t('common.error'), t('cars.errors.genericCreateRdv'));
        return;
      }
      setShowRdvModal(false);
      setShowDatePicker(false);
      setSelectedCarForRdv(null);
      await fetchMyCarsAndRdv();
      Alert.alert(t('common.success'), t('cars.success.rdvCreated'));
    } catch (err: unknown) {
      console.error('submitCreateRdv:', err);
      Alert.alert(t('common.error'), t('cars.errors.genericCreateRdv'));
    } finally {
      setCreatingRdv(false);
    }
  };

  if (!isAuthenticated) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />
        <View style={styles.center}>
          <IconSymbol name="lock.fill" size={scale(44)} color="#64748b" />
          <ThemedText style={styles.centerTitle}>{t('cars.loginRequiredTitle')}</ThemedText>
          <ThemedText style={styles.centerText}>{t('cars.loginRequiredBody')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).springify()} style={styles.header}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={styles.iconContainer}>
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.iconGradient}>
                    <IconSymbol name="car.fill" size={scale(42)} color="#ffffff" />
                  </LinearGradient>
                </View>
                <View style={styles.headerTextCol}>
                  <ThemedText style={pageTitleBlockStyles.headerTitle}>{t('cars.title')}</ThemedText>
                  <ThemedText style={pageTitleBlockStyles.headerSubtitle}>{t('cars.subtitle')}</ThemedText>
                </View>
              </View>

              <TouchableOpacity
                style={styles.addButton}
                activeOpacity={0.85}
                onPress={() => setShowAddModal(true)}
              >
                <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.addButtonGradient}>
                  <IconSymbol name="plus" size={scale(22)} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* RDV Filter */}
        {!loading && cars.length > 0 && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.filterContainer}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterButtons}
            >
              <TouchableOpacity
                onPress={() => setRdvFilter('all')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'all' ? ['#0d9488', '#14b8a6'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'all' && styles.filterButtonTextActive]}>
                    {t('cars.filtersTabs.all')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRdvFilter('with_rdv')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'with_rdv' ? ['#0d9488', '#14b8a6'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <IconSymbol 
                    name="calendar.fill" 
                    size={scale(16)} 
                    color={rdvFilter === 'with_rdv' ? '#ffffff' : '#6b7280'} 
                  />
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'with_rdv' && styles.filterButtonTextActive]}>
                    {t('cars.filtersTabs.withRdv')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRdvFilter('without_rdv')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'without_rdv' ? ['#0d9488', '#14b8a6'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <IconSymbol 
                    name="calendar" 
                    size={scale(16)} 
                    color={rdvFilter === 'without_rdv' ? '#ffffff' : '#6b7280'} 
                  />
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'without_rdv' && styles.filterButtonTextActive]}>
                    {t('cars.filtersTabs.withoutRdv')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRdvFilter('termine')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'termine' ? ['#0d9488', '#14b8a6'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <IconSymbol 
                    name="checkmark.circle.fill" 
                    size={scale(16)} 
                    color={rdvFilter === 'termine' ? '#ffffff' : '#6b7280'} 
                  />
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'termine' && styles.filterButtonTextActive]}>
                    {t('cars.filtersTabs.finished')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRdvFilter('sponsor')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'sponsor' ? ['#9333ea', '#7c3aed'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <IconSymbol
                    name="star.fill"
                    size={scale(16)}
                    color={rdvFilter === 'sponsor' ? '#ffffff' : '#6b7280'}
                  />
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'sponsor' && styles.filterButtonTextActive]}>
                    {t('cars.filtersTabs.sponsor')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        )}

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0d9488" />
              <ThemedText style={styles.loadingText}>{t('cars.loading')}</ThemedText>
            </View>
          ) : rdvFilter === 'sponsor' ? (
            <View>
              {/* Always-visible "+ Create Sponsor" button at the top of the section */}
              <TouchableOpacity
                style={styles.createSponsorBtn}
                activeOpacity={0.85}
                onPress={openCreateSponsorModal}
              >
                <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.createSponsorBtnGradient}>
                  <IconSymbol name="plus.circle.fill" size={scale(20)} color="#ffffff" />
                  <ThemedText style={styles.createSponsorBtnText}>{t('cars.sponsor.createButton')}</ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              {sponsors.length === 0 ? (
                <View style={styles.emptyBox}>
                  <IconSymbol name="star.fill" size={scale(52)} color="#94a3b8" />
                  <ThemedText style={styles.emptyTitle}>{t('cars.empty.sponsor')}</ThemedText>
                  <ThemedText style={styles.emptyText}>{t('cars.empty.sponsorHint')}</ThemedText>
                </View>
              ) : (
                <View style={styles.list}>
                  {pendingSponsors.length > 0 ? (
                    <View style={styles.sponsorSection}>
                      <ThemedText style={styles.sponsorSectionTitle}>
                        {t('cars.sponsor.pendingSectionTitle')}
                      </ThemedText>
                      {pendingSponsors.map(renderSponsorCard)}
                    </View>
                  ) : null}
                  {activeSponsors.length > 0 ? (
                    <View style={styles.sponsorSection}>
                      <ThemedText style={styles.sponsorSectionTitle}>
                        {t('cars.sponsor.activeSectionTitle')}
                      </ThemedText>
                      {activeSponsors.map(renderSponsorCard)}
                    </View>
                  ) : null}
                  {inactiveSponsors.length > 0 ? (
                    <View style={styles.sponsorSection}>
                      <ThemedText style={styles.sponsorSectionTitle}>
                        {t('cars.sponsor.inactiveSectionTitle')}
                      </ThemedText>
                      {inactiveSponsors.map(renderSponsorCard)}
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          ) : filteredCars.length === 0 ? (
            <View style={styles.emptyBox}>
              <IconSymbol name="car" size={scale(52)} color="#94a3b8" />
              <ThemedText style={styles.emptyTitle}>
                {rdvFilter === 'with_rdv' ? t('cars.empty.withRdv') :
                 rdvFilter === 'without_rdv' ? t('cars.empty.withoutRdv') :
                 rdvFilter === 'termine' ? t('cars.empty.finished') :
                 t('cars.empty.default')}
              </ThemedText>
              <ThemedText style={styles.emptyText}>
                {rdvFilter === 'all'
                  ? t('cars.empty.allHint')
                  : rdvFilter === 'termine'
                  ? t('cars.empty.finishedHint')
                  : t('cars.empty.otherHint')}
              </ThemedText>
              {rdvFilter === 'all' && (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.primaryBtnGradient}>
                    <IconSymbol name="plus.circle.fill" size={scale(20)} color="#ffffff" />
                    <ThemedText style={styles.primaryBtnText}>{t('cars.addCar')}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.list}>
              {filteredCars.map((car) => {
                if (!car) return null;
                const carId = car._id?.toString?.() || car.id || '';
                const img = car.images && Array.isArray(car.images) && car.images[0] ? getImageUrl(car.images[0]) : null;
                const meta = statusMeta[car.status] || { label: car.status, colors: ['#64748b', '#475569'] as [string, string] };
                const apts = appointmentsByCarId.get(carId) || [];
                const latest = apts[0];
                const rdvMeta = latest ? (rdvStatusMeta[latest.status] || { label: latest.status, colors: ['#64748b', '#475569'] as [string, string] }) : null;
                const workshopName = latest?.id_workshop?.name || latest?.id_workshop?.email || t('workshops.title');
                const carSponsor = sponsorsByCarId.get(carId);
                const carSponsorActive = !!carSponsor && isSponsorActive(carSponsor, now);

                return (
                  <View key={carId} style={styles.card}>
                    <View style={styles.cardImageWrap}>
                      {img ? (
                        <Image source={{ uri: img }} style={styles.cardImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.cardImagePlaceholder}>
                          <IconSymbol name="photo" size={scale(34)} color="#94a3b8" />
                          <ThemedText style={styles.cardImagePlaceholderText}>{t('cars.noImage')}</ThemedText>
                        </View>
                      )}

                      <View style={styles.badgesRow}>
                        <LinearGradient colors={meta.colors} style={styles.badge}>
                          <ThemedText style={styles.badgeText}>{meta.label}</ThemedText>
                        </LinearGradient>
                        {carSponsorActive ? (
                          <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.sponsorPill}>
                            <IconSymbol name="star.fill" size={scale(12)} color="#ffffff" />
                            <ThemedText style={styles.sponsorPillText}>{t('cars.sponsor.activeBadge')}</ThemedText>
                          </LinearGradient>
                        ) : null}
                        <View style={styles.yearPill}>
                          <ThemedText style={styles.yearPillText}>{car.year}</ThemedText>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardBody}>
                      <ThemedText style={styles.cardTitle}>
                        {car.brand} {car.model}
                      </ThemedText>

                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <IconSymbol name="speedometer" size={scale(16)} color="#64748b" />
                          <ThemedText style={styles.metaText}>{car.km?.toLocaleString?.() || car.km} {t('home.mileageUnit')}</ThemedText>
                        </View>
                        <View style={styles.metaItem}>
                          <IconSymbol name="tag.fill" size={scale(16)} color="#64748b" />
                          <ThemedText style={styles.metaText}>{car.price?.toLocaleString?.() || car.price} {t('home.priceCurrency')}</ThemedText>
                        </View>
                      </View>

                      <View style={styles.rdvBox}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.rdvTitle}>{t('cars.appointmentTitle')}</ThemedText>
                          {latest ? (
                            <>
                              <View style={styles.rdvLine}>
                                <IconSymbol name="shield.fill" size={scale(16)} color="#0d9488" />
                                <ThemedText style={styles.rdvText}>{workshopName}</ThemedText>
                              </View>
                              <View style={styles.rdvLine}>
                                <IconSymbol name="calendar" size={scale(16)} color="#0d9488" />
                                <ThemedText style={styles.rdvText}>
                                  {new Date(latest.date).toLocaleDateString(dateLocale)} • {latest.time}
                                </ThemedText>
                              </View>
                            </>
                          ) : (
                            <ThemedText style={styles.rdvEmpty}>{t('cars.noAppointment')}</ThemedText>
                          )}
                        </View>

                        {latest && rdvMeta ? (
                          <LinearGradient colors={rdvMeta.colors} style={styles.rdvStatusPill}>
                            <ThemedText style={styles.rdvStatusText}>{rdvMeta.label}</ThemedText>
                          </LinearGradient>
                        ) : null}
                      </View>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          activeOpacity={0.85}
                          onPress={() => router.push(`/car/${carId}`)}
                        >
                          <IconSymbol name="doc.text.fill" size={scale(18)} color="#0d9488" />
                          <ThemedText style={styles.secondaryBtnText}>{t('common.details')}</ThemedText>
                        </TouchableOpacity>

                        {canCreateRdvForCar(car) ? (
                          <TouchableOpacity
                            style={styles.primarySmallBtn}
                            activeOpacity={0.85}
                            onPress={() => openRdvModal(car)}
                          >
                            <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.primarySmallBtnGradient}>
                              <IconSymbol name="calendar.fill" size={scale(18)} color="#ffffff" />
                                <ThemedText style={styles.primarySmallBtnText}>{t('cars.createRdv')}</ThemedText>
                            </LinearGradient>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.primarySmallBtnDisabled}>
                            <IconSymbol name="calendar.fill" size={scale(18)} color="#94a3b8" />
                            <ThemedText style={styles.primarySmallBtnDisabledText}>{t('cars.rdvExisting')}</ThemedText>
                          </View>
                        )}
                      </View>

                      {latest && canManageSellerRdv(latest.status) ? (
                        <View style={styles.rdvManageRow}>
                          <TouchableOpacity
                            style={styles.rdvManageBtn}
                            activeOpacity={0.85}
                            onPress={() => openRescheduleModal(latest)}
                            disabled={isRescheduling || isCancellingRdv}
                          >
                            <IconSymbol name="calendar" size={scale(16)} color="#0d9488" />
                            <ThemedText style={styles.rdvManageBtnText}>{t('cars.rescheduleRdv')}</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rdvCancelBtn}
                            activeOpacity={0.85}
                            onPress={() => promptCancelRdv(latest)}
                            disabled={isRescheduling || isCancellingRdv}
                          >
                            <IconSymbol name="xmark.circle.fill" size={scale(16)} color="#dc2626" />
                            <ThemedText style={styles.rdvCancelBtnText}>{t('cars.cancelRdv')}</ThemedText>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add Car Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('cars.addCarModalTitle')}</ThemedText>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: padding.large }}>
              <TouchableOpacity style={styles.imagePickerBtn} activeOpacity={0.85} onPress={showImagePickerOptions}>
                <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.imagePickerGradient}>
                  <IconSymbol name="camera.fill" size={scale(18)} color="#ffffff" />
                  <ThemedText style={styles.imagePickerText}>
                    {pickedImages.length
                      ? t('cars.addImagesCounter', { count: pickedImages.length, max: MAX_IMAGES })
                      : t('cars.addImagesMax', { max: MAX_IMAGES })}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              {pickedImages.length > 0 && (
                <View style={{ marginTop: padding.medium }}>
                  <ThemedText style={{ fontSize: scale(12), color: '#666', marginBottom: padding.small }}>
                    {pickedImages.length}/{MAX_IMAGES} images sélectionnées
                  </ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: padding.small }}>
                    {pickedImages.map((img, idx) => (
                        <View key={idx} style={{ position: 'relative' }}>
                          {getDisplayImageUri(img.uri) ? (
                            <Image
                              source={{ uri: getDisplayImageUri(img.uri) as string }}
                              style={styles.thumb}
                              contentFit="cover"
                            />
                          ) : null}
                          <TouchableOpacity
                            style={{
                              position: 'absolute',
                              top: -5,
                              right: -5,
                              backgroundColor: '#ef4444',
                              borderRadius: scale(12),
                              width: scale(24),
                              height: scale(24),
                              justifyContent: 'center',
                              alignItems: 'center',
                              borderWidth: 2,
                              borderColor: '#ffffff',
                            }}
                            onPress={() => {
                              const newImages = pickedImages.filter((_, i) => i !== idx);
                              setPickedImages(newImages);
                            }}
                            activeOpacity={0.7}
                          >
                            <IconSymbol name="xmark" size={scale(12)} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                    ))}
                  </View>
                </ScrollView>
                </View>
              )}

              <View style={styles.formGrid}>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.brand')}</ThemedText>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowBrandPicker(true)}
                    style={styles.selectInput}
                  >
                    <ThemedText style={[styles.selectInputText, !carForm.brand && styles.selectInputPlaceholder]}>
                      {showCustomBrand ? customBrand || 'Entrez le nom de la marque' : carForm.brand || 'Sélectionner une marque'}
                    </ThemedText>
                    <IconSymbol name="chevron.down" size={scale(18)} color="#64748b" />
                  </TouchableOpacity>
                  {showCustomBrand && (
                    <TextInput
                      value={customBrand}
                      onChangeText={(t) => {
                        setCustomBrand(t);
                        setCarForm((p) => ({ ...p, brand: t }));
                      }}
                      placeholder={t('cars.placeholders.brandName')}
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, { marginTop: padding.small }]}
                    />
                  )}
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.model')}</ThemedText>
                  <TextInput
                    value={carForm.model}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, model: t }))}
                    placeholder={t('cars.placeholders.modelExample')}
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.year')}</ThemedText>
                  <TextInput
                    value={carForm.year}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, year: t.replace(/[^\d]/g, '') }))}
                    placeholder={t('cars.placeholders.yearExample')}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.mileage')}</ThemedText>
                  <TextInput
                    value={carForm.km}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, km: t.replace(/[^\d]/g, '') }))}
                    placeholder={t('cars.placeholders.mileageExample')}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.price', { currency: t('home.priceCurrency') })}</ThemedText>
                  <TextInput
                    value={carForm.price}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, price: t.replace(/[^\d.]/g, '') }))}
                    placeholder={t('cars.placeholders.priceExample')}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={[
                      styles.input,
                      carForm.price && parseFloat(carForm.price) < 200000 && styles.inputError,
                    ]}
                  />
                  <ThemedText style={styles.hintText}>{t('cars.form.priceMinHint', { currency: t('home.priceCurrency') })}</ThemedText>
                  {carForm.price && parseFloat(carForm.price) < 200000 && (
                    <ThemedText style={styles.errorText}>Le prix doit être d'au moins 200,000.00 DA</ThemedText>
                  )}
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.vin')}</ThemedText>
                  <View style={styles.vinInputWrapper}>
                    <TextInput
                      value={carForm.vin}
                      onChangeText={handleVinChange}
                      placeholder={t('cars.placeholders.vinHint')}
                      placeholderTextColor="#94a3b8"
                      maxLength={17}
                      style={[
                        styles.input,
                        vinValid === false && !vinValidating && styles.inputError,
                        vinValid === true && !vinValidating && styles.inputSuccess,
                      ]}
                      autoCapitalize="characters"
                    />
                    {vinValidating && (
                      <View style={styles.vinStatusIcon}>
                        <ActivityIndicator size="small" color="#0d9488" />
                      </View>
                    )}
                    {vinValid === true && !vinValidating && (
                      <View style={styles.vinStatusIcon}>
                        <IconSymbol name="checkmark.seal.fill" size={scale(20)} color="#22c55e" />
                      </View>
                    )}
                    {vinValid === false && !vinValidating && carForm.vin.length === 17 && (
                      <View style={styles.vinStatusIcon}>
                        <IconSymbol name="exclamationmark.triangle.fill" size={scale(20)} color="#f59e0b" />
                      </View>
                    )}
                  </View>
                  {carForm.vin.length > 0 && carForm.vin.length < 17 && (
                    <ThemedText style={styles.hintText}>
                      {carForm.vin.length}/17
                    </ThemedText>
                  )}
                  {carForm.vin.length === 0 && (
                    <ThemedText style={styles.hintText}>{t('cars.placeholders.vinHint')}</ThemedText>
                  )}
                  
                  {vinValidating && (
                    <View style={styles.vinStatusBox}>
                      <ActivityIndicator size="small" color="#0d9488" />
                      <ThemedText style={styles.vinStatusText}>{t('cars.vinChecking')}</ThemedText>
                    </View>
                  )}

                  {vinError && vinValid === false && !vinValidating && !bypassVin && (
                    <View style={styles.vinErrorBox}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={scale(24)} color="#ef4444" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.vinErrorTitle}>{t('cars.vinInvalidTitle')}</ThemedText>
                        <ThemedText style={styles.vinErrorText}>{vinError}</ThemedText>
                        <TouchableOpacity
                          style={styles.bypassButton}
                          onPress={() => {
                            setBypassVin(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.bypassButtonGradient}>
                            <ThemedText style={styles.bypassButtonText}>{t('cars.bypassVin')}</ThemedText>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {bypassVin && vinValid === false && (
                    <View style={styles.vinBypassBox}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={scale(24)} color="#f59e0b" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.vinBypassTitle}>Mode contournement activé</ThemedText>
                        <ThemedText style={styles.vinBypassText}>{t('cars.vinBypassText')}</ThemedText>
                      </View>
                      <TouchableOpacity
                        onPress={() => setBypassVin(false)}
                        style={styles.bypassCancelButton}
                        activeOpacity={0.85}
                      >
                        <ThemedText style={styles.bypassCancelText}>Annuler</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )}

                  {vinValid === true && !vinValidating && (
                    <View style={styles.vinSuccessBox}>
                      <IconSymbol name="checkmark.seal.fill" size={scale(24)} color="#22c55e" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.vinSuccessTitle}>{t('cars.vinSuccessTitle')}</ThemedText>
                        {vinRemark && (
                          <ThemedText style={styles.vinSuccessRemark}>{vinRemark}</ThemedText>
                        )}
                        {vinDetails && (
                          <View style={styles.vinDetailsBox}>
                            <ThemedText style={styles.vinDetailsTitle}>Détails du véhicule :</ThemedText>
                            {vinDetails.make && (
                              <ThemedText style={styles.vinDetailsText}>{t('cars.form.brand').replace(' *','')}: {vinDetails.make}</ThemedText>
                            )}
                            {vinDetails.model && (
                              <ThemedText style={styles.vinDetailsText}>{t('cars.form.model').replace(' *','')}: {vinDetails.model}</ThemedText>
                            )}
                            {vinDetails.year && (
                              <ThemedText style={styles.vinDetailsText}>{t('cars.form.year').replace(' *','')}: {vinDetails.year}</ThemedText>
                            )}
                            {vinDetails.bodyType && (
                              <ThemedText style={styles.vinDetailsText}>Type: {vinDetails.bodyType}</ThemedText>
                            )}
                            {vinDetails.engine && (
                              <ThemedText style={styles.vinDetailsText}>Moteur: {vinDetails.engine}</ThemedText>
                            )}
                            {vinDetails.transmission && (
                              <ThemedText style={styles.vinDetailsText}>Transmission: {vinDetails.transmission}</ThemedText>
                            )}
                            {vinDetails.fuelType && (
                              <ThemedText style={styles.vinDetailsText}>{t('cars.form.fuel')}: {vinDetails.fuelType}</ThemedText>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.color')}</ThemedText>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={openColorPicker}
                    style={styles.selectInput}
                  >
                    <ThemedText style={[styles.selectInputText, !carForm.color && styles.selectInputPlaceholder]}>
                      {showCustomColor
                        ? customColor || t('cars.placeholders.colorExample')
                        : carForm.color || t('cars.selectColor')}
                    </ThemedText>
                    {loadingColors ? (
                      <ActivityIndicator size="small" color="#0d9488" />
                    ) : (
                      <IconSymbol name="chevron.down" size={scale(18)} color="#64748b" />
                    )}
                  </TouchableOpacity>
                  {showCustomColor && (
                    <TextInput
                      value={customColor}
                      onChangeText={(t) => {
                        setCustomColor(t);
                        setCarForm((p) => ({ ...p, color: t }));
                      }}
                      placeholder={t('cars.placeholders.colorExample')}
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, { marginTop: padding.small }]}
                    />
                  )}
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>{t('cars.form.doors')}</ThemedText>
                  <TextInput
                    value={carForm.ports}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, ports: t.replace(/[^\d]/g, '') }))}
                    placeholder={t('cars.placeholders.doorsExample')}
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.chipsGroup}>
                <ThemedText style={styles.label}>{t('cars.form.gearbox')}</ThemedText>
                <View style={styles.chipsRow}>
                  {(['manuelle', 'auto', 'semi-auto'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      activeOpacity={0.85}
                      onPress={() => setCarForm((p) => ({ ...p, boite: p.boite === v ? '' : v }))}
                      style={[styles.chip, carForm.boite === v && styles.chipActive]}
                    >
                      <ThemedText style={[styles.chipText, carForm.boite === v && styles.chipTextActive]}>
                        {v === 'manuelle'
                          ? t('home.filters.gearbox_manual')
                          : v === 'auto'
                          ? t('home.filters.gearbox_auto')
                          : t('home.filters.gearbox_semi')}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.chipsGroup}>
                <ThemedText style={styles.label}>{t('cars.form.fuel')}</ThemedText>
                <View style={styles.chipsRow}>
                  {(['diesel', 'essence', 'gaz', 'electrique'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      activeOpacity={0.85}
                      onPress={() => setCarForm((p) => ({ ...p, type_gaz: p.type_gaz === v ? '' : v }))}
                      style={[styles.chip, carForm.type_gaz === v && styles.chipActive]}
                    >
                      <ThemedText style={[styles.chipText, carForm.type_gaz === v && styles.chipTextActive]}>
                        {v === 'diesel'
                          ? t('home.filters.fuel_diesel')
                          : v === 'essence'
                          ? t('home.filters.fuel_petrol')
                          : v === 'gaz'
                          ? t('home.filters.fuel_gas')
                          : t('home.filters.fuel_electric')}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formField}>
                <ThemedText style={styles.label}>Type moteur</ThemedText>
                <TextInput
                  value={carForm.type_enegine}
                  onChangeText={(t) => setCarForm((p) => ({ ...p, type_enegine: t }))}
                  placeholder={t('cars.placeholders.engineTypeExample')}
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
              </View>

              <View style={styles.formField}>
                <ThemedText style={styles.label}>{t('cars.form.description')}</ThemedText>
                <TextInput
                  value={carForm.description}
                  onChangeText={(t) => setCarForm((p) => ({ ...p, description: t }))}
                  placeholder={t('cars.placeholders.descriptionExample')}
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, { height: scale(110), textAlignVertical: 'top', paddingTop: padding.medium }]}
                  multiline
                />
              </View>

              <View style={styles.locationSection}>
                <View style={styles.locationSectionTitleRow}>
                  <View style={styles.locationSectionIconBox}>
                    <IconSymbol name="mappin.circle.fill" size={scale(18)} color="#0d9488" />
                  </View>
                  <ThemedText style={styles.locationSectionTitle}>{t('cars.location.sectionTitle')} *</ThemedText>
                </View>
                <CarLocationPicker value={locationData} onChange={setLocationData} />
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.9}
                onPress={submitCreateCar}
                disabled={creatingCar}
              >
                <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.submitBtnGradient}>
                  {creatingCar ? <ActivityIndicator color="#ffffff" /> : <IconSymbol name="plus.circle.fill" size={scale(18)} color="#ffffff" />}
                  <ThemedText style={styles.submitBtnText}>{creatingCar ? 'Création...' : 'Créer'}</ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Upload Progress Modal (during image upload) */}
      <Modal visible={showUploadModal} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={styles.uploadProgressCard}>
            <ThemedText style={styles.uploadProgressTitle}>{t('cars.creating')}</ThemedText>
            <View style={styles.uploadProgressTrack}>
              <View style={[styles.uploadProgressFill, { width: `${Math.max(0, Math.min(100, uploadPercent))}%` }]} />
            </View>
            <ThemedText style={styles.uploadProgressText}>{Math.max(0, Math.min(100, uploadPercent))}%</ThemedText>
          </View>
        </View>
      </Modal>
      {/* Upload progress modal removed as requested */}
      {/* Brand Picker Modal */}
      <Modal visible={showBrandPicker} transparent animationType="fade" onRequestClose={() => setShowBrandPicker(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowBrandPicker(false)}
        >
          <View style={styles.brandPickerSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('cars.selectBrand') || 'Select brand'}</ThemedText>
              <TouchableOpacity onPress={() => setShowBrandPicker(false)} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {['Volkswagen', 'Hyundai', 'Renault', 'Peugeot', 'BMW', 'Mercedes', 'Audi', 'Toyota'].map((brand) => (
                <TouchableOpacity
                  key={brand}
                  style={styles.brandOption}
                  onPress={() => {
                    setCarForm((p) => ({ ...p, brand }));
                    setShowCustomBrand(false);
                    setCustomBrand('');
                    setShowBrandPicker(false);
                  }}
                  activeOpacity={0.85}
                >
                  <ThemedText style={styles.brandOptionText}>{brand}</ThemedText>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.brandOption}
                onPress={() => {
                  setShowCustomBrand(true);
                  setCarForm((p) => ({ ...p, brand: '' }));
                  setShowBrandPicker(false);
                }}
                activeOpacity={0.85}
              >
                <ThemedText style={styles.brandOptionText}>Autre</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Color Picker Modal (options come from backend table `Color`) */}
      <Modal visible={showColorPicker} transparent animationType="fade" onRequestClose={() => setShowColorPicker(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowColorPicker(false)}
        >
          <View style={styles.brandPickerSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('cars.selectColor')}</ThemedText>
              <TouchableOpacity onPress={() => setShowColorPicker(false)} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {loadingColors ? (
                <View style={{ paddingVertical: padding.large, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0d9488" />
                </View>
              ) : availableColors.length === 0 ? (
                <View style={{ paddingVertical: padding.large, alignItems: 'center' }}>
                  <ThemedText style={{ color: '#64748b' }}>{t('cars.noColorsAvailable')}</ThemedText>
                </View>
              ) : (
                availableColors.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.brandOption}
                    onPress={() => {
                      setCarForm((p) => ({ ...p, color: c.name }));
                      setShowCustomColor(false);
                      setCustomColor('');
                      setShowColorPicker(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={styles.brandOptionText}>{c.name}</ThemedText>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={styles.brandOption}
                onPress={() => {
                  setShowCustomColor(true);
                  setCarForm((p) => ({ ...p, color: '' }));
                  setCustomColor('');
                  setShowColorPicker(false);
                }}
                activeOpacity={0.85}
              >
                <ThemedText style={styles.brandOptionText}>{t('cars.colorOther')}</ThemedText>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create Sponsor Modal -------------------------------------------- */}
      <Modal
        visible={showCreateSponsorModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateSponsorModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('cars.sponsor.createTitle')}</ThemedText>
              <TouchableOpacity
                onPress={() => setShowCreateSponsorModal(false)}
                style={styles.modalClose}
                activeOpacity={0.85}
              >
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: padding.large }}>
              {/* Step 1 — Pick the car ---------------------------------- */}
              <ThemedText style={styles.label}>{t('cars.sponsor.selectCar')}</ThemedText>
              {loadingSponsorableCars ? (
                <View style={{ paddingVertical: padding.medium, alignItems: 'center' }}>
                  <ActivityIndicator color="#9333ea" />
                </View>
              ) : sponsorableCars.length === 0 ? (
                <View style={styles.sponsorEmptyInline}>
                  <IconSymbol name="car" size={scale(28)} color="#94a3b8" />
                  <ThemedText style={styles.sponsorEmptyInlineText}>
                    {t('cars.sponsor.noEligibleCars')}
                  </ThemedText>
                </View>
              ) : (
                <View style={{ gap: padding.small }}>
                  {sponsorableCars.map((car) => {
                    const selected = selectedSponsorCarId === car.id;
                    const img = car.images && car.images[0] ? getImageUrl(car.images[0]) : null;
                    const previousEnd = car.previous_sponsor_end_date
                      ? formatLocalDate(car.previous_sponsor_end_date)
                      : null;
                    return (
                      <TouchableOpacity
                        key={car.id}
                        activeOpacity={0.85}
                        onPress={() => setSelectedSponsorCarId(car.id)}
                        style={[styles.sponsorPickerCar, selected && styles.sponsorPickerCarSelected]}
                      >
                        <View style={styles.sponsorPickerCarImageWrap}>
                          {img ? (
                            <Image source={{ uri: img }} style={styles.sponsorPickerCarImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.sponsorPickerCarImage, styles.cardImagePlaceholder]}>
                              <IconSymbol name="photo" size={scale(20)} color="#94a3b8" />
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.sponsorPickerCarTitle}>
                            {`${car.brand ?? ''} ${car.model ?? ''}`.trim() || t('cars.unknownCar')}
                            {car.year ? ` • ${car.year}` : ''}
                          </ThemedText>
                          {previousEnd ? (
                            <View style={styles.sponsorPickerHintRow}>
                              <IconSymbol name="clock.fill" size={scale(12)} color="#94a3b8" />
                              <ThemedText style={styles.sponsorPickerHintText}>
                                {t('cars.sponsor.previousSponsorEnded', { date: previousEnd })}
                              </ThemedText>
                            </View>
                          ) : (
                            <ThemedText style={styles.sponsorPickerHintText}>
                              {t('cars.sponsor.neverSponsored')}
                            </ThemedText>
                          )}
                        </View>
                        <View style={[styles.sponsorPickerRadio, selected && styles.sponsorPickerRadioSelected]}>
                          {selected ? (
                            <IconSymbol name="checkmark" size={scale(14)} color="#ffffff" />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Step 2 — Pick the plan --------------------------------- */}
              <ThemedText style={[styles.label, { marginTop: padding.medium }]}>
                {t('cars.sponsor.selectPlan')}
              </ThemedText>
              {loadingSponsorPlans ? (
                <View style={{ paddingVertical: padding.medium, alignItems: 'center' }}>
                  <ActivityIndicator color="#9333ea" />
                </View>
              ) : sponsorPlans.length === 0 ? (
                <View style={styles.sponsorEmptyInline}>
                  <IconSymbol name="tag.fill" size={scale(24)} color="#94a3b8" />
                  <ThemedText style={styles.sponsorEmptyInlineText}>
                    {t('cars.sponsor.noPlans')}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.sponsorPlanGrid}>
                  {sponsorPlans.map((plan) => {
                    const selected = selectedSponsorPlanId === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        activeOpacity={0.85}
                        onPress={() => setSelectedSponsorPlanId(plan.id)}
                        style={[styles.sponsorPlanCard, selected && styles.sponsorPlanCardSelected]}
                      >
                        <ThemedText
                          style={[styles.sponsorPlanDuration, selected && styles.sponsorPlanDurationSelected]}
                        >
                          {plan.duration} {t('cars.sponsor.daysShort')}
                        </ThemedText>
                        <ThemedText
                          style={[styles.sponsorPlanPrice, selected && styles.sponsorPlanPriceSelected]}
                        >
                          {plan.price.toLocaleString()} {t('home.priceCurrency')}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Submit ------------------------------------------------- */}
              <TouchableOpacity
                style={[styles.submitBtn, { marginTop: padding.large }]}
                activeOpacity={0.9}
                onPress={submitCreateSponsor}
                disabled={
                  creatingSponsor ||
                  !selectedSponsorCarId ||
                  !selectedSponsorPlanId
                }
              >
                <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.submitBtnGradient}>
                  {creatingSponsor ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <IconSymbol name="checkmark.circle.fill" size={scale(18)} color="#ffffff" />
                  )}
                  <ThemedText style={styles.submitBtnText}>
                    {creatingSponsor
                      ? t('cars.sponsor.creatingSponsor')
                      : t('cars.sponsor.confirmCreate')}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sponsor Payment Modal -------------------------------------------- */}
      <Modal
        visible={showSponsorPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!payingNow) {
            setShowSponsorPaymentModal(false);
            setPaymentSummary({ car: null, plan: null });
            setPaymentDone(false);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.paymentCard}>
            {verifyingPayment ? (
              <View style={styles.paymentVerifyWrap}>
                <ActivityIndicator size="large" color="#7c3aed" />
                <ThemedText style={styles.paymentTitle}>{t('cars.sponsor.verifyingPayment')}</ThemedText>
                <ThemedText style={styles.paymentSub}>{t('cars.sponsor.pleaseWait')}</ThemedText>
              </View>
            ) : paymentDone ? (
              <>
                <View style={styles.paymentSuccessIconWrap}>
                  <IconSymbol name="checkmark.seal.fill" size={scale(56)} color="#22c55e" />
                </View>
                <ThemedText style={styles.paymentTitle}>{t('cars.sponsor.paymentSuccess')}</ThemedText>
                <ThemedText style={styles.paymentSub}>
                  {t('cars.sponsor.paymentSuccessHint')}
                </ThemedText>
                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: padding.medium }]}
                  activeOpacity={0.9}
                  onPress={handlePayNow}
                >
                  <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.submitBtnGradient}>
                    <IconSymbol name="checkmark" size={scale(18)} color="#ffffff" />
                    <ThemedText style={styles.submitBtnText}>{t('common.close')}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.paymentHeader}>
                  <IconSymbol name="tag.fill" size={scale(28)} color="#7c3aed" />
                  <ThemedText style={styles.paymentTitle}>{t('cars.sponsor.payTitle')}</ThemedText>
                </View>

                {paymentSummary.car ? (
                  <View style={styles.paymentSummaryRow}>
                    <IconSymbol name="car.fill" size={scale(16)} color="#64748b" />
                    <ThemedText style={styles.paymentSummaryLabel}>{t('cars.sponsor.payCar')}</ThemedText>
                    <ThemedText style={styles.paymentSummaryValue}>
                      {`${paymentSummary.car.brand ?? ''} ${paymentSummary.car.model ?? ''}`.trim() || t('cars.unknownCar')}
                    </ThemedText>
                  </View>
                ) : null}
                {paymentSummary.plan ? (
                  <>
                    <View style={styles.paymentSummaryRow}>
                      <IconSymbol name="clock.fill" size={scale(16)} color="#64748b" />
                      <ThemedText style={styles.paymentSummaryLabel}>{t('cars.sponsor.duration')}</ThemedText>
                      <ThemedText style={styles.paymentSummaryValue}>
                        {paymentSummary.plan.duration} {t('cars.sponsor.daysShort')}
                      </ThemedText>
                    </View>
                    <View style={styles.paymentTotalRow}>
                      <ThemedText style={styles.paymentTotalLabel}>{t('cars.sponsor.payTotal')}</ThemedText>
                      <ThemedText style={styles.paymentTotalValue}>
                        {paymentSummary.plan.price.toLocaleString()} {t('home.priceCurrency')}
                      </ThemedText>
                    </View>
                  </>
                ) : null}

                <ThemedText style={styles.paymentNote}>{t('cars.sponsor.payNoteChargily')}</ThemedText>

                {paymentError ? (
                  <View style={styles.paymentErrorBox}>
                    <ThemedText style={styles.paymentErrorText}>{paymentError}</ThemedText>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: padding.medium }]}
                  activeOpacity={0.9}
                  onPress={handlePayNow}
                  disabled={payingNow || !paymentSummary.sponsorId}
                >
                  <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.submitBtnGradient}>
                    {payingNow ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <IconSymbol name="lock.fill" size={scale(18)} color="#ffffff" />
                    )}
                    <ThemedText style={styles.submitBtnText}>
                      {payingNow ? t('cars.sponsor.redirecting') : t('cars.sponsor.payButtonChargily')}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.payLaterBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    pendingPaymentContextRef.current = null;
                    setShowSponsorPaymentModal(false);
                    setPaymentSummary({ car: null, plan: null });
                    setPaymentError('');
                  }}
                  disabled={payingNow}
                >
                  <ThemedText style={styles.payLaterText}>{t('cars.sponsor.payLater')}</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* RDV Modal */}
      <Modal visible={showRdvModal} transparent animationType="slide" onRequestClose={() => { setShowRdvModal(false); setShowDatePicker(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, styles.rdvModalSheet]}>
            <View style={[styles.modalHeader, styles.rdvModalHeader]}>
              <ThemedText style={styles.modalTitle}>Créer un RDV</ThemedText>
              <TouchableOpacity onPress={() => { setShowRdvModal(false); setShowDatePicker(false); }} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.rdvModalScroll} contentContainerStyle={{ paddingBottom: padding.medium }}>
              {selectedCarForRdv ? (
                <View style={styles.rdvCarHeader}>
                  <ThemedText style={styles.rdvCarTitle}>
                    {selectedCarForRdv.brand} {selectedCarForRdv.model} • {selectedCarForRdv.year}
                  </ThemedText>
                  <ThemedText style={styles.rdvCarSub}>Choisissez un atelier et un créneau</ThemedText>
                </View>
              ) : null}

              <ThemedText style={styles.label}>{t('cars.rdvWorkshopLabel')} *</ThemedText>

              {/* Search */}
              <View style={styles.workshopFiltersContainer}>
                <View style={styles.filterRow}>
                  <TextInput
                    value={workshopFilters.searchName}
                    onChangeText={(text) => setWorkshopFilters((p) => ({ ...p, searchName: text }))}
                    placeholder={t('cars.placeholders.workshopSearchName')}
                    placeholderTextColor="#94a3b8"
                    style={styles.filterInput}
                  />
                  <TextInput
                    value={workshopFilters.searchAdr}
                    onChangeText={(text) => setWorkshopFilters((p) => ({ ...p, searchAdr: text }))}
                    placeholder={t('cars.placeholders.workshopSearchAdr')}
                    placeholderTextColor="#94a3b8"
                    style={styles.filterInput}
                  />
                </View>
              </View>

              {/* Section tabs: Nearest / Real-time / Other */}
              <View style={styles.rdvSectionTabs}>
                <TouchableOpacity
                  onPress={() => setRdvWorkshopSection('nearest')}
                  style={styles.rdvSectionTab}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={rdvWorkshopSection === 'nearest' ? ['#0d9488', '#14b8a6'] : ['#f1f5f9', '#e2e8f0']}
                    style={styles.rdvSectionTabGrad}
                  >
                    <IconSymbol name="location.fill" size={scale(16)} color={rdvWorkshopSection === 'nearest' ? '#fff' : '#0d9488'} />
                    <ThemedText style={[styles.rdvSectionTabText, rdvWorkshopSection === 'nearest' && styles.rdvSectionTabTextActive]} numberOfLines={1}>
                      {t('workshops.sectionNearest')}
                    </ThemedText>
                    <View style={[styles.rdvSectionCount, rdvWorkshopSection === 'nearest' && styles.rdvSectionCountActive]}>
                      <ThemedText style={[styles.rdvSectionCountText, rdvWorkshopSection === 'nearest' && styles.rdvSectionCountTextActive]}>
                        {rdvNearestWorkshops.length}
                      </ThemedText>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setRdvWorkshopSection('real_time')}
                  style={styles.rdvSectionTab}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={rdvWorkshopSection === 'real_time' ? ['#10b981', '#059669'] : ['#f1f5f9', '#e2e8f0']}
                    style={styles.rdvSectionTabGrad}
                  >
                    <IconSymbol name="bolt.fill" size={scale(16)} color={rdvWorkshopSection === 'real_time' ? '#fff' : '#10b981'} />
                    <ThemedText style={[styles.rdvSectionTabText, rdvWorkshopSection === 'real_time' && styles.rdvSectionTabTextActive]} numberOfLines={1}>
                      {t('workshops.sectionRealTime')}
                    </ThemedText>
                    <View style={[styles.rdvSectionCount, rdvWorkshopSection === 'real_time' && styles.rdvSectionCountActive]}>
                      <ThemedText style={[styles.rdvSectionCountText, rdvWorkshopSection === 'real_time' && styles.rdvSectionCountTextActive]}>
                        {rdvRealTimeWorkshops.length}
                      </ThemedText>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setRdvWorkshopSection('other')}
                  style={styles.rdvSectionTab}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={rdvWorkshopSection === 'other' ? ['#3b82f6', '#6366f1'] : ['#f1f5f9', '#e2e8f0']}
                    style={styles.rdvSectionTabGrad}
                  >
                    <IconSymbol name="building.2.fill" size={scale(16)} color={rdvWorkshopSection === 'other' ? '#fff' : '#3b82f6'} />
                    <ThemedText style={[styles.rdvSectionTabText, rdvWorkshopSection === 'other' && styles.rdvSectionTabTextActive]} numberOfLines={1}>
                      {t('workshops.sectionOther')}
                    </ThemedText>
                    <View style={[styles.rdvSectionCount, rdvWorkshopSection === 'other' && styles.rdvSectionCountActive]}>
                      <ThemedText style={[styles.rdvSectionCountText, rdvWorkshopSection === 'other' && styles.rdvSectionCountTextActive]}>
                        {rdvOtherWorkshops.length}
                      </ThemedText>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {loadingWorkshops ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color="#0d9488" />
                  <ThemedText style={styles.inlineLoadingText}>{t('workshops.loading')}</ThemedText>
                </View>
              ) : rdvSectionData.length ? (
                <View style={styles.workshopList}>
                  {rdvSectionData.map((w) => {
                    const id = w.id || w._id || '';
                    const selected = rdvForm.workshopId === id;
                    const dist = wsFormatDist(wsDistanceKm(w));
                    const typeLabel =
                      w.type === 'mechanic' ? t('workshops.type_mechanic')
                        : w.type === 'paint_vehicle' ? t('workshops.type_paint')
                        : w.type === 'mechanic_paint_inspector' ? t('workshops.type_both')
                        : w.type ?? '';
                    return (
                      <TouchableOpacity
                        key={id}
                        activeOpacity={0.85}
                        onPress={() => {
                          setRdvForm((p) => ({ ...p, workshopId: id, time: '' }));
                          setAvailableTimes([]);
                          if (rdvForm.date) fetchAvailableTimes(id, rdvForm.date);
                        }}
                        style={[styles.rdvWsCard, selected && styles.rdvWsCardSelected]}
                      >
                        {/* Name + certified */}
                        <View style={styles.rdvWsHeader}>
                          <ThemedText style={[styles.rdvWsName, selected && { color: '#fff' }]} numberOfLines={1}>{w.name}</ThemedText>
                          {w.certifie && (
                            <View style={styles.rdvWsCertBadge}>
                              <IconSymbol name="checkmark.seal.fill" size={scale(12)} color="#10b981" />
                              <ThemedText style={styles.rdvWsCertText}>{t('workshops.certified')}</ThemedText>
                            </View>
                          )}
                        </View>

                        {/* Address */}
                        {!!w.adr && (
                          <View style={styles.rdvWsDetailRow}>
                            <IconSymbol name="mappin.fill" size={scale(12)} color={selected ? '#d1fae5' : '#64748b'} />
                            <ThemedText style={[styles.rdvWsDetail, selected && { color: '#d1fae5' }]} numberOfLines={2}>{w.adr}</ThemedText>
                          </View>
                        )}

                        {/* Phone */}
                        {!!w.phone && (
                          <View style={styles.rdvWsDetailRow}>
                            <IconSymbol name="phone.fill" size={scale(12)} color={selected ? '#d1fae5' : '#64748b'} />
                            <ThemedText style={[styles.rdvWsDetail, selected && { color: '#d1fae5' }]}>{w.phone}</ThemedText>
                          </View>
                        )}

                        {/* Email */}
                        {!!w.email && (
                          <View style={styles.rdvWsDetailRow}>
                            <IconSymbol name="envelope.fill" size={scale(12)} color={selected ? '#d1fae5' : '#64748b'} />
                            <ThemedText style={[styles.rdvWsDetail, selected && { color: '#d1fae5' }]} numberOfLines={1}>{w.email}</ThemedText>
                          </View>
                        )}

                        {/* Type */}
                        {!!typeLabel && (
                          <View style={styles.rdvWsDetailRow}>
                            <IconSymbol name={getWorkshopTypeIcon(w.type)} size={scale(12)} color={selected ? '#d1fae5' : '#64748b'} />
                            <ThemedText style={[styles.rdvWsDetail, selected && { color: '#d1fae5' }]}>{typeLabel}</ThemedText>
                          </View>
                        )}

                        {/* Badges: distance + wilaya */}
                        {(dist || w.locationRegion) && (
                          <View style={styles.rdvWsBadgesRow}>
                            {dist && (
                              <View style={styles.rdvWsDistBadge}>
                                <IconSymbol name="location.fill" size={scale(10)} color="#3b82f6" />
                                <ThemedText style={styles.rdvWsDistText}>{dist}</ThemedText>
                              </View>
                            )}
                            {w.locationRegion && (
                              <View style={styles.rdvWsWilayaBadge}>
                                <IconSymbol name="globe" size={scale(10)} color="#6366f1" />
                                <ThemedText style={styles.rdvWsWilayaText}>{w.locationRegion}</ThemedText>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Prices */}
                        <View style={styles.rdvWsPricesRow}>
                          {w.price_visit_mec != null && w.price_visit_mec > 0 && (
                            <View style={styles.rdvWsPriceBadge}>
                              <IconSymbol name="wrench.fill" size={scale(10)} color="#0d9488" />
                              <ThemedText style={styles.rdvWsPriceText}>{t('workshops.type_mechanic')}: {w.price_visit_mec.toLocaleString()} DA</ThemedText>
                            </View>
                          )}
                          {w.price_visit_paint != null && w.price_visit_paint > 0 && (
                            <View style={[styles.rdvWsPriceBadge, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
                              <IconSymbol name="paintbrush.fill" size={scale(10)} color="#c2410c" />
                              <ThemedText style={[styles.rdvWsPriceText, { color: '#c2410c' }]}>{t('workshops.type_paint')}: {w.price_visit_paint.toLocaleString()} DA</ThemedText>
                            </View>
                          )}
                          {(!w.price_visit_mec || w.price_visit_mec === 0) && (!w.price_visit_paint || w.price_visit_paint === 0) && (
                            <View style={styles.rdvWsPriceEmptyRow}>
                              <IconSymbol name="info.circle.fill" size={scale(10)} color="#94a3b8" />
                              <ThemedText style={styles.rdvWsPriceEmpty}>{t('workshops.priceNotSet')}</ThemedText>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyWorkshopBox}>
                  <IconSymbol name="building.2" size={scale(48)} color="#94a3b8" />
                  <ThemedText style={styles.emptyText}>{t('workshops.sectionEmpty')}</ThemedText>
                </View>
              )}

              <View style={{ marginTop: padding.medium }}>
                <ThemedText style={styles.label}>Date *</ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    if (rdvForm.date) {
                      const [year, month, day] = rdvForm.date.split('-').map(Number);
                      setSelectedDate(new Date(year, month - 1, day));
                    }
                    setShowDatePicker(true);
                  }}
                  style={styles.dateInput}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <IconSymbol name="calendar" size={scale(20)} color="#64748b" style={{ marginRight: padding.small }} />
                    <ThemedText style={[styles.dateInputText, !rdvForm.date && styles.dateInputPlaceholder]}>
                      {rdvForm.date
                        ? new Date(rdvForm.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : t('cars.selectDate')}
                    </ThemedText>
                  </View>
                  <IconSymbol name="chevron.right" size={scale(18)} color="#94a3b8" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, date) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                        if (event.type === 'set' && date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const formattedDate = `${year}-${month}-${day}`;
                          setRdvForm((p) => ({ ...p, date: formattedDate, time: '' }));
                          setSelectedDate(date);
                          if (rdvForm.workshopId) {
                            fetchAvailableTimes(rdvForm.workshopId, formattedDate);
                          }
                        }
                      } else if (Platform.OS === 'ios' && date) {
                        // On iOS, just update the selectedDate state when scrolling
                        // The actual form update happens when user clicks "Confirmer"
                        setSelectedDate(date);
                      }
                    }}
                    minimumDate={new Date()}
                    locale="fr-FR"
                  />
                )}
                {Platform.OS === 'ios' && showDatePicker && (
                  <View style={styles.datePickerActions}>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={[styles.datePickerButton, styles.datePickerButtonCancel]}
                      activeOpacity={0.85}
                    >
                      <ThemedText style={styles.datePickerButtonText}>Annuler</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const year = selectedDate.getFullYear();
                        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                        const day = String(selectedDate.getDate()).padStart(2, '0');
                        const formattedDate = `${year}-${month}-${day}`;
                        setRdvForm((p) => ({ ...p, date: formattedDate, time: '' }));
                        setShowDatePicker(false);
                        if (rdvForm.workshopId) {
                          fetchAvailableTimes(rdvForm.workshopId, formattedDate);
                        }
                      }}
                      style={[styles.datePickerButton, styles.datePickerButtonConfirm]}
                      activeOpacity={0.85}
                    >
                      <ThemedText style={[styles.datePickerButtonText, { color: '#ffffff' }]}>Confirmer</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={{ marginTop: padding.medium }}>
                <ThemedText style={styles.label}>Heure *</ThemedText>
                {loadingTimes ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color="#0d9488" />
                    <ThemedText style={styles.inlineLoadingText}>Chargement des créneaux...</ThemedText>
                  </View>
                ) : availableTimes.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: padding.small }}>
                    <View style={{ flexDirection: 'row', gap: padding.small }}>
                      {availableTimes.map((t) => {
                        const selected = rdvForm.time === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            activeOpacity={0.85}
                            onPress={() => setRdvForm((p) => ({ ...p, time: t }))}
                            style={[styles.timeChip, selected && styles.timeChipSelected]}
                          >
                            <ThemedText style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>{t}</ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : (
                  <TextInput
                    value={rdvForm.time}
                    onChangeText={(t) => setRdvForm((p) => ({ ...p, time: t.replace(/[^\d:]/g, '').slice(0, 5) }))}
                    placeholder={t('cars.placeholders.timeExample')}
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                )}
              </View>
            </ScrollView>

            <SafeAreaView
              edges={[]}
              style={[styles.rdvModalFooterSafe, { paddingBottom: getRdvModalFooterBottomPad(insets) }]}
            >
              <View style={styles.rdvModalFooter}>
                <TouchableOpacity
                  style={styles.submitBtn}
                  activeOpacity={0.9}
                  onPress={submitCreateRdv}
                  disabled={creatingRdv}
                >
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.submitBtnGradient}>
                    {creatingRdv ? <ActivityIndicator color="#ffffff" /> : <IconSymbol name="calendar.fill" size={scale(18)} color="#ffffff" />}
                    <ThemedText style={styles.submitBtnText}>{creatingRdv ? 'Création...' : 'Créer le RDV'}</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>

      {/* Reschedule RDV Modal */}
      <Modal
        visible={showRescheduleModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isRescheduling) {
            setShowRescheduleModal(false);
            setShowRescheduleDatePicker(false);
            setRescheduleTarget(null);
          }
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, styles.rdvModalSheet, styles.rescheduleModalSheet]}>
            <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.rescheduleModalHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rescheduleModalTitle}>{t('cars.rescheduleModalTitle')}</ThemedText>
                {rescheduleTarget ? (
                  <ThemedText style={styles.rescheduleModalSub}>
                    {(() => {
                      const rc = rescheduleTarget.id_car;
                      const carLabel =
                        rc && typeof rc === 'object'
                          ? `${rc.brand || ''} ${rc.model || ''}`.trim()
                          : '';
                      const ws = getWorkshopNameFromAppointment(rescheduleTarget);
                      return [carLabel, ws].filter(Boolean).join(' — ');
                    })()}
                  </ThemedText>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!isRescheduling) {
                    setShowRescheduleModal(false);
                    setShowRescheduleDatePicker(false);
                    setRescheduleTarget(null);
                  }
                }}
                style={styles.rescheduleModalClose}
                activeOpacity={0.85}
                disabled={isRescheduling}
              >
                <IconSymbol name="xmark" size={scale(18)} color="#ffffff" />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.rdvModalScroll}
              contentContainerStyle={{ paddingBottom: padding.medium }}
            >
              <ThemedText style={styles.rescheduleHint}>{t('cars.rescheduleHint')}</ThemedText>

              <ThemedText style={styles.label}>{t('cars.dateLabel')} *</ThemedText>
              <TouchableOpacity
                onPress={() => setShowRescheduleDatePicker(true)}
                style={styles.dateInput}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <IconSymbol name="calendar" size={scale(20)} color="#64748b" style={{ marginRight: padding.small }} />
                  <ThemedText style={[styles.dateInputText, !rescheduleDate && styles.dateInputPlaceholder]}>
                    {rescheduleDate
                      ? new Date(rescheduleDate + 'T00:00:00').toLocaleDateString(dateLocale, {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : t('cars.selectDate')}
                  </ThemedText>
                </View>
                <IconSymbol name="chevron.right" size={scale(18)} color="#94a3b8" />
              </TouchableOpacity>
              {showRescheduleDatePicker ? (
                <DateTimePicker
                  value={rescheduleSelectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    if (Platform.OS === 'android') {
                      setShowRescheduleDatePicker(false);
                      if (event.type === 'set' && date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const formattedDate = `${year}-${month}-${day}`;
                        setRescheduleDate(formattedDate);
                        setRescheduleTime('');
                        setRescheduleSelectedDate(date);
                      }
                    } else if (Platform.OS === 'ios' && date) {
                      setRescheduleSelectedDate(date);
                    }
                  }}
                  minimumDate={new Date()}
                  locale={dateLocale}
                />
              ) : null}
              {Platform.OS === 'ios' && showRescheduleDatePicker ? (
                <View style={styles.datePickerActions}>
                  <TouchableOpacity
                    onPress={() => setShowRescheduleDatePicker(false)}
                    style={[styles.datePickerButton, styles.datePickerButtonCancel]}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={styles.datePickerButtonText}>{t('common.cancel')}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const year = rescheduleSelectedDate.getFullYear();
                      const month = String(rescheduleSelectedDate.getMonth() + 1).padStart(2, '0');
                      const day = String(rescheduleSelectedDate.getDate()).padStart(2, '0');
                      const formattedDate = `${year}-${month}-${day}`;
                      setRescheduleDate(formattedDate);
                      setRescheduleTime('');
                      setShowRescheduleDatePicker(false);
                    }}
                    style={[styles.datePickerButton, styles.datePickerButtonConfirm]}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={[styles.datePickerButtonText, { color: '#ffffff' }]}>
                      {t('common.confirm')}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ) : null}

              <View style={{ marginTop: padding.medium }}>
                <ThemedText style={styles.label}>{t('cars.timeLabel')} *</ThemedText>
                {loadingRescheduleTimes ? (
                  <ThemedText style={styles.rescheduleLoadingText}>{t('cars.loadingSlots')}</ThemedText>
                ) : rescheduleAvailableTimes.length === 0 && rescheduleDate ? (
                  <ThemedText style={styles.rescheduleNoSlotsText}>{t('cars.noSlotsForDate')}</ThemedText>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: padding.small }}>
                    <View style={{ flexDirection: 'row', gap: padding.small }}>
                      {rescheduleAvailableTimes.map((slot) => {
                      const selected = rescheduleTime === slot;
                      return (
                        <TouchableOpacity
                          key={slot}
                          activeOpacity={0.85}
                          onPress={() => setRescheduleTime(slot)}
                          style={[styles.timeChip, selected && styles.timeChipSelected]}
                        >
                          <ThemedText style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>
                            {slot}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                    </View>
                  </ScrollView>
                )}
              </View>
            </ScrollView>

            <SafeAreaView
              edges={['bottom']}
              style={[
                styles.rdvModalFooterSafe,
                styles.rescheduleModalFooterSafe,
                { paddingBottom: getRescheduleModalFooterBottomPad(insets) },
              ]}
            >
              <View style={styles.rdvModalFooter}>
                <TouchableOpacity
                  style={styles.submitBtn}
                  activeOpacity={0.9}
                  onPress={submitRescheduleRdv}
                  disabled={isRescheduling || !rescheduleDate || !rescheduleTime}
                >
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.submitBtnGradient}>
                    <ThemedText style={styles.submitBtnText}>
                      {isRescheduling ? t('common.loading') : t('cars.confirmReschedule')}
                    </ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: scale(100),
  },
  header: {
    marginBottom: padding.large,
    borderRadius: scale(24),
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: padding.medium,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: scale(4),
  },
  iconContainer: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(18),
    overflow: 'hidden',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(16),
    overflow: 'hidden',
  },
  addButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: padding.horizontal,
  },
  loadingBox: {
    backgroundColor: '#ffffff',
    borderRadius: scale(20),
    padding: padding.large,
    alignItems: 'center',
    gap: padding.medium,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  loadingText: {
    color: '#64748b',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  emptyBox: {
    backgroundColor: '#ffffff',
    borderRadius: scale(24),
    padding: padding.large,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: padding.small,
  },
  emptyTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#1f2937',
    marginTop: padding.small,
  },
  emptyText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: fontSizes.sm * 1.5,
  },
  primaryBtn: {
    marginTop: padding.medium,
    width: '100%',
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.md,
  },
  list: {
    gap: padding.large,
    paddingBottom: padding.large,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: scale(22),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardImageWrap: {
    height: scale(200),
    backgroundColor: '#f1f5f9',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
  },
  cardImagePlaceholderText: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  badgesRow: {
    position: 'absolute',
    top: padding.medium,
    left: padding.medium,
    right: padding.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(10),
    borderRadius: scale(999),
  },
  badgeText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  yearPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: scale(6),
    paddingHorizontal: scale(10),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  yearPillText: {
    color: '#0f172a',
    fontWeight: '900',
    fontSize: fontSizes.xs,
  },
  sponsorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(5),
    paddingHorizontal: scale(10),
    borderRadius: scale(999),
  },
  sponsorPillText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  sponsorInfoBox: {
    marginTop: padding.small,
    backgroundColor: '#faf5ff',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e9d5ff',
    paddingVertical: padding.small,
    paddingHorizontal: padding.medium,
    gap: scale(6),
  },
  sponsorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  sponsorInfoLabel: {
    color: '#6b21a8',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  sponsorInfoValue: {
    marginLeft: 'auto',
    color: '#0f172a',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  sponsorRemainingBox: {
    marginTop: padding.small,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    backgroundColor: '#f5f3ff',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#ddd6fe',
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
  },
  sponsorRemainingBoxExpired: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  sponsorRemainingLabel: {
    color: '#7c3aed',
    fontWeight: '700',
    fontSize: fontSizes.xs,
  },
  sponsorRemainingValue: {
    color: '#5b21b6',
    fontWeight: '900',
    fontSize: fontSizes.md,
  },
  sponsorRemainingValueExpired: {
    color: '#64748b',
  },
  sponsorPendingBox: {
    marginTop: padding.small,
    backgroundColor: '#fffbeb',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: padding.medium,
    gap: scale(10),
  },
  sponsorPendingText: {
    color: '#b45309',
    fontWeight: '600',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  sponsorPayBtn: {
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  sponsorPayBtnGradient: {
    paddingVertical: scale(10),
    alignItems: 'center',
  },
  sponsorPayBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  // ----- Create Sponsor button + modal styles ------
  sponsorSection: {
    gap: padding.medium,
    marginBottom: padding.large,
  },
  sponsorSectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: padding.small,
  },
  createSponsorBtn: {
    marginBottom: padding.medium,
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  createSponsorBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.large,
  },
  createSponsorBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.md,
  },
  sponsorEmptyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    backgroundColor: '#f8fafc',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sponsorEmptyInlineText: {
    flex: 1,
    color: '#64748b',
    fontWeight: '600',
    fontSize: fontSizes.sm,
  },
  sponsorPickerCar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    padding: padding.small,
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  sponsorPickerCarSelected: {
    borderColor: '#9333ea',
    backgroundColor: '#faf5ff',
  },
  sponsorPickerCarImageWrap: {
    width: scale(54),
    height: scale(54),
    borderRadius: scale(10),
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  sponsorPickerCarImage: {
    width: '100%',
    height: '100%',
  },
  sponsorPickerCarTitle: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: fontSizes.md,
  },
  sponsorPickerHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    marginTop: scale(2),
  },
  sponsorPickerHintText: {
    color: '#94a3b8',
    fontSize: fontSizes.xs,
    fontWeight: '600',
  },
  sponsorPickerRadio: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorPickerRadioSelected: {
    borderColor: '#9333ea',
    backgroundColor: '#9333ea',
  },
  sponsorPlanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: padding.small,
  },
  sponsorPlanCard: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    gap: scale(4),
  },
  sponsorPlanCardSelected: {
    borderColor: '#9333ea',
    backgroundColor: '#faf5ff',
  },
  sponsorPlanDuration: {
    color: '#0f172a',
    fontWeight: '900',
    fontSize: fontSizes.lg,
  },
  sponsorPlanDurationSelected: {
    color: '#7c3aed',
  },
  sponsorPlanPrice: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  sponsorPlanPriceSelected: {
    color: '#7c3aed',
  },
  // ----- Payment modal styles -----
  paymentCard: {
    marginHorizontal: padding.large,
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: '#ffffff',
    borderRadius: scale(20),
    padding: padding.large,
    gap: padding.small,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    marginBottom: padding.small,
  },
  paymentTitle: {
    color: '#0f172a',
    fontWeight: '900',
    fontSize: fontSizes.lg,
  },
  paymentSub: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  paymentSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    paddingVertical: scale(6),
  },
  paymentSummaryLabel: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  paymentSummaryValue: {
    marginLeft: 'auto',
    color: '#0f172a',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  paymentTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: padding.small,
    paddingTop: padding.small,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  paymentTotalLabel: {
    color: '#0f172a',
    fontWeight: '900',
    fontSize: fontSizes.md,
  },
  paymentTotalValue: {
    color: '#7c3aed',
    fontWeight: '900',
    fontSize: fontSizes.lg,
  },
  paymentNote: {
    marginTop: padding.small,
    color: '#0d9488',
    fontSize: fontSizes.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  paymentErrorBox: {
    marginTop: padding.small,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: scale(10),
    padding: padding.small,
  },
  paymentErrorText: {
    color: '#b91c1c',
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  paymentVerifyWrap: {
    alignItems: 'center',
    paddingVertical: padding.large,
    gap: scale(12),
  },
  payLaterBtn: {
    marginTop: padding.small,
    paddingVertical: scale(10),
    alignItems: 'center',
  },
  payLaterText: {
    color: '#64748b',
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  paymentSuccessIconWrap: {
    alignItems: 'center',
    marginBottom: padding.small,
  },
  cardBody: {
    padding: padding.large,
    gap: padding.medium,
  },
  cardTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#0f172a',
  },
  metaRow: {
    flexDirection: 'row',
    gap: padding.large,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
  },
  metaText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  rdvBox: {
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    padding: padding.medium,
    flexDirection: 'row',
    gap: padding.medium,
    alignItems: 'flex-start',
  },
  rdvTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: scale(6),
  },
  rdvLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    marginBottom: scale(6),
  },
  rdvText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: fontSizes.sm,
  },
  rdvEmpty: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: fontSizes.sm,
  },
  rdvStatusPill: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(10),
    borderRadius: scale(999),
    alignSelf: 'flex-start',
  },
  rdvStatusText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: padding.medium,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: scale(14),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
  },
  secondaryBtnText: {
    color: '#0d9488',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  primarySmallBtn: {
    flex: 1,
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  primarySmallBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
  },
  primarySmallBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: fontSizes.sm,
  },
  primarySmallBtnDisabled: {
    flex: 1,
    borderRadius: scale(14),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
  },
  primarySmallBtnDisabledText: {
    color: '#94a3b8',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  rdvManageRow: {
    flexDirection: 'row',
    gap: padding.small,
    marginTop: padding.medium,
  },
  rdvManageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.small,
    paddingHorizontal: padding.small,
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
  },
  rdvManageBtnText: {
    color: '#0d9488',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  rdvCancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.small,
    paddingHorizontal: padding.small,
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  rdvCancelBtnText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  rescheduleModalSheet: {
    padding: 0,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  rescheduleModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: padding.large,
    gap: padding.medium,
  },
  rescheduleModalTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: '#ffffff',
  },
  rescheduleModalSub: {
    marginTop: padding.small,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  rescheduleModalClose: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  rescheduleHint: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    marginBottom: padding.medium,
    lineHeight: scale(20),
  },
  rescheduleLoadingText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    marginTop: padding.small,
  },
  rescheduleNoSlotsText: {
    fontSize: fontSizes.sm,
    color: '#b45309',
    marginTop: padding.small,
  },
  rescheduleModalFooterSafe: {
    marginTop: 'auto',
    paddingTop: padding.small,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: padding.horizontal,
    gap: padding.small,
  },
  centerTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: padding.small,
  },
  centerText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    textAlign: 'center',
  },
  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  uploadProgressCard: {
    width: '86%',
    maxWidth: scale(420),
    backgroundColor: '#ffffff',
    borderRadius: scale(18),
    padding: padding.large,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: '40%',
  },
  uploadProgressTitle: {
    fontWeight: '900',
    fontSize: fontSizes.lg,
    color: '#0f172a',
    marginBottom: padding.medium,
    textAlign: 'center',
  },
  uploadProgressTrack: {
    width: '100%',
    height: scale(10),
    backgroundColor: '#f1f5f9',
    borderRadius: scale(999),
    overflow: 'hidden',
  },
  uploadProgressFill: {
    height: '100%',
    backgroundColor: '#14b8a6',
  },
  uploadProgressText: {
    marginTop: padding.small,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: scale(26),
    borderTopRightRadius: scale(26),
    padding: padding.large,
    maxHeight: '92%',
  },
  rdvModalSheet: {
    flex: 1,
    maxHeight: '96%',
    paddingBottom: 0,
    paddingHorizontal: 0,
    justifyContent: 'flex-end',
  },
  rdvModalHeader: {
    paddingHorizontal: padding.large,
  },
  rdvModalScroll: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: padding.large,
  },
  rdvModalFooterSafe: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: padding.large,
    marginTop: 'auto',
  },
  rdvModalFooter: {
    paddingTop: padding.small,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: padding.medium,
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalClose: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  imagePickerBtn: {
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  imagePickerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
  },
  imagePickerText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: fontSizes.sm,
  },
  thumb: {
    width: scale(70),
    height: scale(70),
    borderRadius: scale(14),
    backgroundColor: '#f1f5f9',
  },
  formGrid: {
    marginTop: padding.large,
    gap: padding.medium,
  },
  locationSection: {
    marginTop: padding.large,
    paddingTop: padding.medium,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: padding.medium,
  },
  locationSectionTitle: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: '800',
    color: '#0f172a',
  },
  locationSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  locationSectionIconBox: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(10),
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  formField: {
    gap: scale(6),
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#0f172a',
  },
  input: {
    height: scale(52),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    paddingHorizontal: padding.medium,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: fontSizes.md,
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  inputSuccess: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  hintText: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    marginTop: scale(4),
  },
  errorText: {
    fontSize: fontSizes.xs,
    color: '#ef4444',
    fontWeight: '700',
    marginTop: scale(4),
  },
  selectWrapper: {
    position: 'relative',
  },
  selectContainer: {
    position: 'relative',
  },
  selectInput: {
    height: scale(52),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    paddingHorizontal: padding.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    flex: 1,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: fontSizes.md,
  },
  selectInputPlaceholder: {
    color: '#94a3b8',
  },
  brandPickerSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: scale(26),
    borderTopRightRadius: scale(26),
    padding: padding.large,
    maxHeight: '70%',
    marginTop: 'auto',
  },
  brandOption: {
    paddingVertical: padding.medium,
    paddingHorizontal: padding.medium,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  brandOptionText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#0f172a',
  },
  vinInputWrapper: {
    position: 'relative',
  },
  vinStatusIcon: {
    position: 'absolute',
    right: padding.medium,
    top: '50%',
    transform: [{ translateY: -scale(10) }],
  },
  vinStatusBox: {
    marginTop: padding.small,
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    padding: padding.medium,
    backgroundColor: '#f0fdfa',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  vinStatusText: {
    fontSize: fontSizes.sm,
    color: '#0d9488',
    fontWeight: '700',
  },
  vinErrorBox: {
    marginTop: padding.small,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
    padding: padding.medium,
    backgroundColor: '#fef2f2',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  vinErrorTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#991b1b',
    marginBottom: scale(4),
  },
  vinErrorText: {
    fontSize: fontSizes.sm,
    color: '#991b1b',
    lineHeight: fontSizes.sm * 1.5,
    marginBottom: padding.small,
  },
  bypassButton: {
    borderRadius: scale(10),
    overflow: 'hidden',
    marginTop: padding.small,
  },
  bypassButtonGradient: {
    paddingVertical: padding.small,
    paddingHorizontal: padding.medium,
    alignItems: 'center',
  },
  bypassButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  vinBypassBox: {
    marginTop: padding.small,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
    padding: padding.medium,
    backgroundColor: '#fffbeb',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#fde68a',
  },
  vinBypassTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#92400e',
    marginBottom: scale(4),
  },
  vinBypassText: {
    fontSize: fontSizes.sm,
    color: '#92400e',
    lineHeight: fontSizes.sm * 1.5,
  },
  bypassCancelButton: {
    paddingVertical: padding.small,
    paddingHorizontal: padding.medium,
  },
  bypassCancelText: {
    color: '#f59e0b',
    fontWeight: '800',
    fontSize: fontSizes.sm,
  },
  vinSuccessBox: {
    marginTop: padding.small,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: padding.medium,
    padding: padding.medium,
    backgroundColor: '#f0fdf4',
    borderRadius: scale(12),
    borderWidth: 2,
    borderColor: '#bbf7d0',
  },
  vinSuccessTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#166534',
    marginBottom: scale(4),
  },
  vinSuccessRemark: {
    fontSize: fontSizes.sm,
    color: '#166534',
    fontWeight: '700',
    marginBottom: padding.small,
  },
  vinDetailsBox: {
    marginTop: padding.small,
    paddingTop: padding.small,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
    gap: scale(4),
  },
  vinDetailsTitle: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#166534',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: scale(4),
  },
  vinDetailsText: {
    fontSize: fontSizes.xs,
    color: '#166534',
    fontWeight: '600',
  },
  chipsGroup: {
    marginTop: padding.large,
    gap: padding.small,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: padding.small,
  },
  chip: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa',
  },
  chipText: {
    color: '#64748b',
    fontWeight: '800',
    fontSize: fontSizes.xs,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: '#0d9488',
  },
  submitBtn: {
    marginTop: padding.large,
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  submitBtnGradient: {
    paddingVertical: padding.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: fontSizes.md,
  },
  rdvCarHeader: {
    backgroundColor: '#f8fafc',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: padding.medium,
    marginBottom: padding.medium,
  },
  rdvCarTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '900',
    color: '#0f172a',
  },
  rdvCarSub: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    marginTop: scale(4),
    fontWeight: '600',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
  },
  inlineLoadingText: {
    color: '#64748b',
    fontWeight: '700',
  },
  workshopFiltersContainer: {
    marginTop: padding.small,
    marginBottom: padding.medium,
    gap: padding.medium,
    padding: padding.medium,
    backgroundColor: '#f8fafc',
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterRow: {
    gap: padding.small,
  },
  filterInput: {
    height: scale(44),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: padding.medium,
    color: '#0f172a',
    fontWeight: '600',
    fontSize: fontSizes.sm,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: padding.small,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#0d9488',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#0d9488',
  },
  filterChipText: {
    color: '#0d9488',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  sortRow: {
    gap: padding.small,
  },
  sortLabel: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#64748b',
  },
  sortChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: padding.small,
  },
  sortChip: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  sortChipActive: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa',
  },
  sortChipText: {
    color: '#64748b',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  sortChipTextActive: {
    color: '#0d9488',
  },
  workshopList: {
    gap: padding.small,
    marginTop: padding.small,
  },
  workshopItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: scale(14),
    padding: padding.medium,
  },
  workshopItemSelected: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa',
    borderWidth: 2,
  },
  workshopItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  workshopItemInfo: {
    flex: 1,
    gap: scale(6),
  },
  workshopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    flexWrap: 'wrap',
  },
  workshopName: {
    fontWeight: '900',
    color: '#0f172a',
    fontSize: fontSizes.md,
  },
  workshopNameSelected: {
    color: '#0d9488',
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
    color: '#10b981',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  workshopAdrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginTop: scale(2),
  },
  workshopAdr: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: fontSizes.sm,
    flex: 1,
  },
  workshopAdrSelected: {
    color: '#0d9488',
  },
  workshopPrice: {
    color: '#0d9488',
    fontWeight: '800',
    fontSize: fontSizes.sm,
    marginTop: scale(4),
  },
  workshopPriceSelected: {
    color: '#059669',
  },
  emptyWorkshopBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: padding.large,
    gap: padding.small,
  },
  rdvSectionTabs: {
    flexDirection: 'row',
    gap: scale(6),
    marginBottom: scale(10),
    marginTop: scale(4),
  },
  rdvSectionTab: {
    flex: 1,
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  rdvSectionTabGrad: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(4),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: scale(3),
  },
  rdvSectionTabText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  rdvSectionTabTextActive: {
    color: '#ffffff',
  },
  rdvSectionCount: {
    backgroundColor: '#e2e8f0',
    borderRadius: scale(999),
    minWidth: scale(20),
    paddingHorizontal: scale(5),
    paddingVertical: scale(1),
    alignItems: 'center',
  },
  rdvSectionCountActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  rdvSectionCountText: {
    fontSize: scale(9),
    fontWeight: '800',
    color: '#64748b',
  },
  rdvSectionCountTextActive: {
    color: '#ffffff',
  },
  rdvWsCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    borderRadius: scale(14),
    padding: scale(10),
    gap: scale(4),
  },
  rdvWsCardSelected: {
    borderColor: '#0d9488',
    backgroundColor: '#0d9488',
    borderWidth: 2,
  },
  rdvWsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    flexWrap: 'wrap',
  },
  rdvWsName: {
    fontWeight: '900',
    color: '#0f172a',
    fontSize: fontSizes.md,
    flexShrink: 1,
  },
  rdvWsCertBadge: {
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
  rdvWsCertText: {
    color: '#10b981',
    fontWeight: '800',
    fontSize: fontSizes.xs,
  },
  rdvWsDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(5),
  },
  rdvWsDetail: {
    fontSize: fontSizes.xs,
    color: '#64748b',
    flex: 1,
    lineHeight: scale(16),
  },
  rdvWsBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(4),
    marginTop: scale(1),
  },
  rdvWsDistBadge: {
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
  rdvWsDistText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#3b82f6',
  },
  rdvWsWilayaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    paddingVertical: scale(2),
    paddingHorizontal: scale(6),
    borderRadius: scale(8),
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  rdvWsWilayaText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#7c3aed',
  },
  rdvWsPricesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(4),
    marginTop: scale(2),
  },
  rdvWsPriceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingVertical: scale(2),
    paddingHorizontal: scale(6),
    borderRadius: scale(8),
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
  },
  rdvWsPriceText: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: '#0d9488',
  },
  rdvWsPriceEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
  },
  rdvWsPriceEmpty: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  timeChip: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(14),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  timeChipSelected: {
    borderColor: '#0d9488',
    backgroundColor: '#f0fdfa',
  },
  timeChipText: {
    color: '#64748b',
    fontWeight: '900',
    fontSize: fontSizes.sm,
  },
  timeChipTextSelected: {
    color: '#0d9488',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderRadius: scale(12),
    paddingHorizontal: padding.medium,
    paddingVertical: scale(14),
    marginTop: padding.small,
  },
  dateInputText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
  },
  dateInputPlaceholder: {
    color: '#94a3b8',
    fontWeight: '400',
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: padding.small,
    marginTop: padding.small,
    paddingTop: padding.small,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  datePickerButton: {
    paddingVertical: scale(10),
    paddingHorizontal: padding.medium,
    borderRadius: scale(8),
    minWidth: scale(100),
    alignItems: 'center',
  },
  datePickerButtonCancel: {
    backgroundColor: '#f1f5f9',
  },
  datePickerButtonConfirm: {
    backgroundColor: '#0d9488',
  },
  datePickerButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#64748b',
  },
  filterContainer: {
    paddingHorizontal: padding.medium,
    paddingTop: padding.medium,
    paddingBottom: padding.small,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: scale(12),
    paddingHorizontal: padding.medium,
  },
  filterButton: {
    minWidth: scale(100),
    borderRadius: scale(12),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  filterButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    paddingVertical: padding.medium,
    paddingHorizontal: padding.small,
  },
  filterButtonText: {
    fontSize: fontSizes.sm,
    fontWeight: '700',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  certifiedSection: {
    marginHorizontal: padding.medium,
    marginTop: padding.medium,
    borderRadius: scale(20),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  certifiedSectionGradient: {
    padding: padding.large,
    borderRadius: scale(20),
    borderWidth: 2,
    borderColor: '#bbf7d0',
  },
  certifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    marginBottom: padding.medium,
  },
  certifiedIconContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(12),
    overflow: 'hidden',
  },
  certifiedIconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  certifiedTitle: {
    fontSize: fontSizes.xl,
    fontWeight: '800',
    color: '#16a34a',
  },
  certifiedSubtitle: {
    fontSize: fontSizes.sm,
    color: '#15803d',
    fontWeight: '600',
  },
  certifiedCarsScroll: {
    gap: scale(12),
    paddingRight: padding.medium,
  },
  certifiedCarCard: {
    width: scale(200),
    borderRadius: scale(16),
    overflow: 'hidden',
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
  certifiedCarCardGradient: {
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#dcfce7',
  },
  certifiedCarImage: {
    width: '100%',
    height: scale(120),
  },
  certifiedCarImagePlaceholder: {
    width: '100%',
    height: scale(120),
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  certifiedCarInfo: {
    padding: padding.medium,
    gap: scale(4),
  },
  certifiedCarName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
  },
  certifiedCarYear: {
    fontSize: fontSizes.sm,
    color: '#6b7280',
    fontWeight: '600',
  },
  certifiedCarBadge: {
    marginTop: scale(4),
  },
  certifiedCarBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    alignSelf: 'flex-start',
    paddingVertical: scale(4),
    paddingHorizontal: scale(8),
    borderRadius: scale(999),
  },
  certifiedCarBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '800',
    color: '#ffffff',
  },
});
