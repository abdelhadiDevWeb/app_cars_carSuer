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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';
import { apiRequest, getImageUrl, getBackendUrl } from '@/utils/backend';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { io, Socket } from 'socket.io-client';

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
  images: string[];
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
}

export default function CarsScreen() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cars, setCars] = useState<Car[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rdvFilter, setRdvFilter] = useState<'all' | 'with_rdv' | 'without_rdv' | 'termine' | 'temoignages'>('all');

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
  
  // Workshop filters
  const [workshopFilters, setWorkshopFilters] = useState({
    searchName: '',
    searchAdr: '',
    sortBy: 'name' as 'name' | 'price_low' | 'price_high',
    showCertifiedOnly: false,
  });

  const statusMeta = useMemo(() => {
    const map: Record<string, { label: string; colors: [string, string] }> = {
      no_proccess: { label: 'Brouillon', colors: ['#64748b', '#475569'] },
      en_attente: { label: 'En attente', colors: ['#f59e0b', '#d97706'] },
      actif: { label: 'Certifié', colors: ['#22c55e', '#16a34a'] },
      vendue: { label: 'Vendue', colors: ['#ef4444', '#dc2626'] },
    };
    return map;
  }, []);

  const rdvStatusMeta = useMemo(() => {
    const map: Record<string, { label: string; colors: [string, string] }> = {
      en_attente: { label: 'En attente', colors: ['#f59e0b', '#d97706'] },
      accepted: { label: 'Accepté', colors: ['#22c55e', '#16a34a'] },
      refused: { label: 'Refusé', colors: ['#ef4444', '#dc2626'] },
      start: { label: 'En cours', colors: ['#3b82f6', '#2563eb'] },
      en_cours: { label: 'En cours', colors: ['#3b82f6', '#2563eb'] }, // Handle en_cours status
      finish: { label: 'Terminé', colors: ['#64748b', '#475569'] },
    };
    return map;
  }, []);

  // Refresh function for socket updates (doesn't show loading)
  const refreshDataSilently = useCallback(async () => {
    if (!isAuthenticated || user?.type !== 'user') {
      console.log('Skipping refresh: not authenticated or not a user');
      return;
    }
    try {
      console.log('🔄 Refreshing cars and appointments data silently...');
      const [carsRes, rdvRes] = await Promise.all([
        apiRequest('/car/my-cars'),
        apiRequest('/rdv-workshop/my-appointments'),
      ]);

      const carsData = await carsRes.json().catch(() => null);
      const rdvData = await rdvRes.json().catch(() => null);

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
    } catch (err: any) {
      console.error('❌ Error refreshing cars/appointments:', err);
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
      const [carsRes, rdvRes] = await Promise.all([
        apiRequest('/car/my-cars'),
        apiRequest('/rdv-workshop/my-appointments'),
      ]);

      const carsData = await carsRes.json().catch(() => null);
      const rdvData = await rdvRes.json().catch(() => null);

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
    } catch (err: any) {
      console.error('Error fetching my cars/appointments:', err);
      Alert.alert('Erreur', err?.message || "Impossible de récupérer vos voitures.");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.type]);

  // Socket.IO connection for real-time updates
  const socketRef = useRef<Socket | null>(null);

  // Fetch data when page is focused
  useFocusEffect(
    useCallback(() => {
      if (!isLoading && isAuthenticated) {
        fetchMyCarsAndRdv();
      }
    }, [isLoading, isAuthenticated, fetchMyCarsAndRdv])
  );

  useEffect(() => {
    if (!isLoading) {
      fetchMyCarsAndRdv();
    }
  }, [isLoading, fetchMyCarsAndRdv]);

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

  // Filter cars based on RDV filter
  const filteredCars = useMemo(() => {
    if (rdvFilter === 'all') {
      return cars;
    }
    
    return cars.filter((car) => {
      const carId = car._id?.toString?.() || car.id || '';
      const apts = appointmentsByCarId.get(carId) || [];
      const hasRdv = apts.length > 0;
      
      if (rdvFilter === 'with_rdv') {
        return hasRdv;
      } else if (rdvFilter === 'without_rdv') {
        return !hasRdv;
      } else if (rdvFilter === 'termine') {
        // Show cars with finished RDV and active car status
        const hasFinishedRdv = apts.some((apt) => apt.status === 'finish');
        return hasFinishedRdv && car.status === 'actif';
      } else if (rdvFilter === 'temoignages') {
        // Show cars with finished RDV and active car status (same as termine but for testimonials display)
        const hasFinishedRdv = apts.some((apt) => apt.status === 'finish');
        return hasFinishedRdv && car.status === 'actif';
      }
      
      return true;
    });
  }, [cars, appointmentsByCarId, rdvFilter]);

  // Get certified and active cars
  const certifiedActiveCars = useMemo(() => {
    return cars.filter((car) => car.status === 'actif');
  }, [cars]);

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

  const pickImages = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission requise', "L'accès aux photos est nécessaire pour ajouter des images.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 10,
      } as any);

      if (!result.canceled && result.assets?.length) {
        // Validate file sizes (5MB max per file)
        const invalidFiles = result.assets.filter(asset => (asset.fileSize || 0) > 5 * 1024 * 1024);
        if (invalidFiles.length > 0) {
          Alert.alert('Erreur', 'Certains fichiers dépassent 5MB. Veuillez réduire leur taille.');
          return;
        }
        if (result.assets.length > 10) {
          Alert.alert('Erreur', 'Vous ne pouvez télécharger que 10 images maximum');
          return;
        }
        setPickedImages(result.assets);
      }
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || "Impossible d'ouvrir la galerie.");
    }
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
      let errorDetails = [];
      if (!brandMatch) {
        errorDetails.push(`La marque "${brand}" ne correspond pas à "${vinDetails.make}" du VIN`);
      }
      if (!modelMatch) {
        errorDetails.push(`Le modèle "${model}" ne correspond pas à "${vinDetails.model}" du VIN`);
      }
      return {
        match: false,
        error: `Les informations du véhicule ne correspondent pas au VIN vérifié.\n\n${errorDetails.join('\n')}\n\nVIN vérifié: ${vinDetails.make} ${vinDetails.model}${vinDetails.year ? ` (${vinDetails.year})` : ''}`
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
          setVinRemark(data.remark || 'VIN vérifié');
          setVinDetails(data.details || null);
        } else {
          setVinValid(false);
          let errorMessage = 'VIN invalide ou non trouvé. Veuillez vérifier le numéro.';
          
          if (data?.message) {
            if (typeof data.message === 'string') {
              errorMessage = data.message;
            }
          } else if (data?.error) {
            if (typeof data.error === 'string') {
              errorMessage = data.error;
            }
          }
          
          setVinError(errorMessage);
          setVinRemark('');
          setVinDetails(null);
        }
      } catch (error: any) {
        console.error('Error verifying VIN:', error);
        setVinValid(false);
        setVinError(error?.message || 'Erreur de connexion lors de la vérification du VIN. Veuillez réessayer.');
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
      Alert.alert('Validation', 'Marque, modèle, année, km et prix sont requis.');
      return;
    }

    // Price validation: must be at least 200,000
    if (isNaN(price) || price < 200000) {
      Alert.alert('Validation', 'Le prix minimum est de 200,000.00 DA');
      return;
    }

    // VIN validation if provided (unless bypass is enabled)
    if (carForm.vin && carForm.vin.length === 17 && !bypassVin) {
      if (vinValid === false || vinValidating) {
        Alert.alert('Validation', 'Veuillez vérifier que le VIN est valide avant de continuer');
        return;
      }
      if (vinValid === null) {
        Alert.alert('Validation', 'Veuillez attendre la vérification du VIN');
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
      Alert.alert('Validation', 'Ajoutez au moins une image.');
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

      pickedImages.forEach((asset, idx) => {
        const uri = asset.uri;
        const name = asset.fileName || `car_${Date.now()}_${idx}.jpg`;
        const type = (asset as any).mimeType || 'image/jpeg';
        form.append('images', { uri, name, type } as any);
      });

      const res = await apiRequest('/car/create', {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = data?.message || 'Erreur lors de la création';
        const extra = Array.isArray(data?.errors) ? `\n- ${data.errors.join('\n- ')}` : '';
        Alert.alert('Erreur', `${msg}${extra}`);
        return;
      }

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
      setPickedImages([]);
      setVinValid(null);
      setVinError('');
      setVinRemark('');
      setVinDetails(null);
      setBypassVin(false);
      await fetchMyCarsAndRdv();
      Alert.alert('Succès', 'Voiture ajoutée avec succès');
    } catch (err: any) {
      console.error('Create car error:', err);
      Alert.alert('Erreur', err?.message || 'Erreur lors de la création');
    } finally {
      setCreatingCar(false);
    }
  };

  const openRdvModal = async (car: Car) => {
    setSelectedCarForRdv(car);
    setRdvForm({ workshopId: '', date: '', time: '' });
    setAvailableTimes([]);
    setWorkshopFilters({ searchName: '', searchAdr: '', sortBy: 'name', showCertifiedOnly: false });
    setShowDatePicker(false);
    setShowRdvModal(true);
    if (!workshops.length) {
      try {
        setLoadingWorkshops(true);
        const res = await apiRequest('/workshop/active');
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

  // Filter and sort workshops
  const filteredAndSortedWorkshops = useMemo(() => {
    let filtered = [...workshops];

    // Filter by name
    if (workshopFilters.searchName.trim()) {
      const searchLower = workshopFilters.searchName.toLowerCase();
      filtered = filtered.filter(w => 
        w.name.toLowerCase().includes(searchLower)
      );
    }

    // Filter by address
    if (workshopFilters.searchAdr.trim()) {
      const searchLower = workshopFilters.searchAdr.toLowerCase();
      filtered = filtered.filter(w => 
        w.adr?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by certified only
    if (workshopFilters.showCertifiedOnly) {
      filtered = filtered.filter(w => w.certifie === true);
    }

    // Sort workshops
    filtered.sort((a, b) => {
      if (workshopFilters.sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (workshopFilters.sortBy === 'price_low') {
        // Get minimum price (considering both mechanic and paint prices)
        const getMinPrice = (w: Workshop) => {
          const prices = [];
          if (w.price_visit_mec) prices.push(w.price_visit_mec);
          if (w.price_visit_paint) prices.push(w.price_visit_paint);
          return prices.length > 0 ? Math.min(...prices) : Infinity;
        };
        const priceA = getMinPrice(a);
        const priceB = getMinPrice(b);
        if (priceA === priceB) return a.name.localeCompare(b.name);
        return priceA - priceB;
      } else if (workshopFilters.sortBy === 'price_high') {
        // Get maximum price
        const getMaxPrice = (w: Workshop) => {
          const prices = [];
          if (w.price_visit_mec) prices.push(w.price_visit_mec);
          if (w.price_visit_paint) prices.push(w.price_visit_paint);
          return prices.length > 0 ? Math.max(...prices) : -Infinity;
        };
        const priceA = getMaxPrice(a);
        const priceB = getMaxPrice(b);
        if (priceA === priceB) return a.name.localeCompare(b.name);
        return priceB - priceA;
      }
      return 0;
    });

    return filtered;
  }, [workshops, workshopFilters]);

  // Get workshop price display
  const getWorkshopPrice = (workshop: Workshop): string => {
    const prices = [];
    if (workshop.price_visit_mec) prices.push(`Mécanique: ${workshop.price_visit_mec.toLocaleString()} DA`);
    if (workshop.price_visit_paint) prices.push(`Peinture: ${workshop.price_visit_paint.toLocaleString()} DA`);
    if (prices.length === 0) return 'Prix non disponible';
    return prices.join(' • ');
  };

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
      Alert.alert('Validation', 'Atelier, date et heure sont requis.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Validation', 'Date invalide. Format attendu: YYYY-MM-DD');
      return;
    }
    if (!/^([0-1]?[0-9]|2[0-3]):(00|30)$/.test(time)) {
      Alert.alert('Validation', 'Heure invalide. Ex: 08:00, 08:30, 09:00');
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
        const msg = data?.message || 'Erreur lors de la création du rendez-vous';
        const extra = Array.isArray(data?.errors) ? `\n- ${data.errors.join('\n- ')}` : '';
        Alert.alert('Erreur', `${msg}${extra}`);
        return;
      }
      setShowRdvModal(false);
      setShowDatePicker(false);
      setSelectedCarForRdv(null);
      await fetchMyCarsAndRdv();
      Alert.alert('Succès', 'Rendez-vous créé avec succès');
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Erreur lors de la création du rendez-vous');
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
          <ThemedText style={styles.centerTitle}>Connexion requise</ThemedText>
          <ThemedText style={styles.centerText}>Connectez-vous pour voir vos voitures.</ThemedText>
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
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.title}>Mes voitures</ThemedText>
                  <ThemedText style={styles.subtitle}>Gérez vos annonces et vos rendez-vous</ThemedText>
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
                    Toutes
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
                    Avec RDV
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
                    Sans RDV
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
                    Terminé
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setRdvFilter('temoignages')}
                style={styles.filterButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={rdvFilter === 'temoignages' ? ['#9333ea', '#7c3aed'] : ['#f3f4f6', '#e5e7eb']}
                  style={styles.filterButtonGradient}
                >
                  <IconSymbol 
                    name="star.fill" 
                    size={scale(16)} 
                    color={rdvFilter === 'temoignages' ? '#ffffff' : '#6b7280'} 
                  />
                  <ThemedText style={[styles.filterButtonText, rdvFilter === 'temoignages' && styles.filterButtonTextActive]}>
                    Témoignages
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
              <ThemedText style={styles.loadingText}>Chargement...</ThemedText>
            </View>
          ) : filteredCars.length === 0 ? (
            <View style={styles.emptyBox}>
              <IconSymbol name="car" size={scale(52)} color="#94a3b8" />
              <ThemedText style={styles.emptyTitle}>
                {rdvFilter === 'with_rdv' ? 'Aucune voiture avec RDV' : 
                 rdvFilter === 'without_rdv' ? 'Toutes vos voitures ont un RDV' : 
                 rdvFilter === 'termine' ? 'Aucune voiture avec RDV terminé' :
                 rdvFilter === 'temoignages' ? 'Aucun témoignage disponible' :
                 'Aucune voiture'}
              </ThemedText>
              <ThemedText style={styles.emptyText}>
                {rdvFilter === 'all' 
                  ? 'Ajoutez votre première voiture pour commencer la vérification.'
                  : rdvFilter === 'termine'
                  ? 'Les voitures avec RDV terminé et statut actif apparaîtront ici.'
                  : rdvFilter === 'temoignages'
                  ? 'Les témoignages des voitures avec RDV terminé et statut actif apparaîtront ici.'
                  : 'Essayez un autre filtre pour voir plus de résultats.'}
              </ThemedText>
              {rdvFilter === 'all' && (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
                  <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.primaryBtnGradient}>
                    <IconSymbol name="plus.circle.fill" size={scale(20)} color="#ffffff" />
                    <ThemedText style={styles.primaryBtnText}>Ajouter une voiture</ThemedText>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ) : rdvFilter === 'temoignages' ? (
            // Témoignages Section - Special display for testimonials
            <View style={styles.temoignagesContainer}>
              <Animated.View entering={FadeInDown.duration(600)} style={styles.temoignagesHeader}>
                <LinearGradient
                  colors={['#f3e8ff', '#e9d5ff', '#fce7f3']}
                  style={styles.temoignagesHeaderGradient}
                >
                  <View style={styles.temoignagesHeaderContent}>
                    <View style={styles.temoignagesIconContainer}>
                      <LinearGradient
                        colors={['#9333ea', '#7c3aed']}
                        style={styles.temoignagesIconGradient}
                      >
                        <IconSymbol name="star.fill" size={scale(28)} color="#ffffff" />
                      </LinearGradient>
                    </View>
                    <View style={styles.temoignagesHeaderText}>
                      <ThemedText style={styles.temoignagesTitle}>Témoignages</ThemedText>
                      <ThemedText style={styles.temoignagesSubtitle}>
                        Voitures certifiées avec vérification terminée
                      </ThemedText>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>

              <View style={styles.temoignagesList}>
                {filteredCars.map((car, index) => {
                  const carId = car._id?.toString?.() || car.id || '';
                  const img = car.images?.[0] ? getImageUrl(car.images[0]) : null;
                  const apts = appointmentsByCarId.get(carId) || [];
                  const finishedApts = apts.filter((apt) => apt.status === 'finish');
                  const latestFinished = finishedApts[0];
                  const workshopName = latestFinished?.id_workshop?.name || latestFinished?.id_workshop?.email || 'Atelier';

                  return (
                    <Animated.View
                      key={carId}
                      entering={FadeInDown.duration(600).delay(index * 100)}
                      style={styles.temoignageCard}
                    >
                      <LinearGradient
                        colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
                        style={styles.temoignageCardGradient}
                      >
                        {/* Car Image */}
                        <View style={styles.temoignageImageContainer}>
                          {img ? (
                            <Image source={{ uri: img }} style={styles.temoignageImage} resizeMode="cover" />
                          ) : (
                            <View style={styles.temoignageImagePlaceholder}>
                              <IconSymbol name="car.fill" size={scale(40)} color="#94a3b8" />
                            </View>
                          )}
                          <View style={styles.temoignageBadge}>
                            <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.temoignageBadgeGradient}>
                              <IconSymbol name="checkmark.seal.fill" size={scale(16)} color="#ffffff" />
                              <ThemedText style={styles.temoignageBadgeText}>Certifié</ThemedText>
                            </LinearGradient>
                          </View>
                        </View>

                        {/* Car Info */}
                        <View style={styles.temoignageInfo}>
                          <ThemedText style={styles.temoignageCarName}>
                            {car.brand} {car.model}
                          </ThemedText>
                          <ThemedText style={styles.temoignageCarYear}>{car.year}</ThemedText>

                          <View style={styles.temoignageDetails}>
                            <View style={styles.temoignageDetailItem}>
                              <IconSymbol name="speedometer" size={scale(16)} color="#9333ea" />
                              <ThemedText style={styles.temoignageDetailText}>
                                {car.km?.toLocaleString?.() || car.km} km
                              </ThemedText>
                            </View>
                            <View style={styles.temoignageDetailItem}>
                              <IconSymbol name="tag.fill" size={scale(16)} color="#9333ea" />
                              <ThemedText style={styles.temoignageDetailText}>
                                {car.price?.toLocaleString?.() || car.price} DA
                              </ThemedText>
                            </View>
                          </View>

                          {/* Workshop Verification Info */}
                          {latestFinished && (
                            <View style={styles.temoignageVerification}>
                              <View style={styles.temoignageVerificationHeader}>
                                <IconSymbol name="shield.checkered" size={scale(18)} color="#9333ea" />
                                <ThemedText style={styles.temoignageVerificationTitle}>
                                  Vérifié par
                                </ThemedText>
                              </View>
                              <ThemedText style={styles.temoignageWorkshopName}>{workshopName}</ThemedText>
                              {latestFinished.date && (
                                <ThemedText style={styles.temoignageDate}>
                                  {new Date(latestFinished.date).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                  })}
                                </ThemedText>
                              )}
                            </View>
                          )}

                          {/* Action Button */}
                          <TouchableOpacity
                            style={styles.temoignageViewButton}
                            activeOpacity={0.85}
                            onPress={() => router.push(`/car/${carId}`)}
                          >
                            <LinearGradient colors={['#9333ea', '#7c3aed']} style={styles.temoignageViewButtonGradient}>
                              <IconSymbol name="doc.text.fill" size={scale(18)} color="#ffffff" />
                              <ThemedText style={styles.temoignageViewButtonText}>Voir les détails</ThemedText>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </LinearGradient>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredCars.map((car) => {
                const carId = car._id?.toString?.() || car.id || '';
                const img = car.images?.[0] ? getImageUrl(car.images[0]) : null;
                const meta = statusMeta[car.status] || { label: car.status, colors: ['#64748b', '#475569'] as [string, string] };
                const apts = appointmentsByCarId.get(carId) || [];
                const latest = apts[0];
                const rdvMeta = latest ? (rdvStatusMeta[latest.status] || { label: latest.status, colors: ['#64748b', '#475569'] as [string, string] }) : null;
                const workshopName = latest?.id_workshop?.name || latest?.id_workshop?.email || 'Atelier';

                return (
                  <View key={carId} style={styles.card}>
                    <View style={styles.cardImageWrap}>
                      {img ? (
                        <Image source={{ uri: img }} style={styles.cardImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.cardImagePlaceholder}>
                          <IconSymbol name="photo" size={scale(34)} color="#94a3b8" />
                          <ThemedText style={styles.cardImagePlaceholderText}>Aucune image</ThemedText>
                        </View>
                      )}

                      <View style={styles.badgesRow}>
                        <LinearGradient colors={meta.colors} style={styles.badge}>
                          <ThemedText style={styles.badgeText}>{meta.label}</ThemedText>
                        </LinearGradient>
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
                          <ThemedText style={styles.metaText}>{car.km?.toLocaleString?.() || car.km} km</ThemedText>
                        </View>
                        <View style={styles.metaItem}>
                          <IconSymbol name="tag.fill" size={scale(16)} color="#64748b" />
                          <ThemedText style={styles.metaText}>{car.price?.toLocaleString?.() || car.price} DH</ThemedText>
                        </View>
                      </View>

                      <View style={styles.rdvBox}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={styles.rdvTitle}>Rendez-vous atelier</ThemedText>
                          {latest ? (
                            <>
                              <View style={styles.rdvLine}>
                                <IconSymbol name="shield.fill" size={scale(16)} color="#0d9488" />
                                <ThemedText style={styles.rdvText}>{workshopName}</ThemedText>
                              </View>
                              <View style={styles.rdvLine}>
                                <IconSymbol name="calendar" size={scale(16)} color="#0d9488" />
                                <ThemedText style={styles.rdvText}>
                                  {new Date(latest.date).toLocaleDateString('fr-FR')} • {latest.time}
                                </ThemedText>
                              </View>
                            </>
                          ) : (
                            <ThemedText style={styles.rdvEmpty}>Aucun rendez-vous pour cette voiture.</ThemedText>
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
                          <ThemedText style={styles.secondaryBtnText}>Détails</ThemedText>
                        </TouchableOpacity>

                        {canCreateRdvForCar(car) ? (
                          <TouchableOpacity
                            style={styles.primarySmallBtn}
                            activeOpacity={0.85}
                            onPress={() => openRdvModal(car)}
                          >
                            <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.primarySmallBtnGradient}>
                              <IconSymbol name="calendar.fill" size={scale(18)} color="#ffffff" />
                              <ThemedText style={styles.primarySmallBtnText}>Créer RDV</ThemedText>
                            </LinearGradient>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.primarySmallBtnDisabled}>
                            <IconSymbol name="calendar.fill" size={scale(18)} color="#94a3b8" />
                            <ThemedText style={styles.primarySmallBtnDisabledText}>RDV existant</ThemedText>
                          </View>
                        )}
                      </View>
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
              <ThemedText style={styles.modalTitle}>Ajouter une voiture</ThemedText>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: padding.large }}>
              <TouchableOpacity style={styles.imagePickerBtn} activeOpacity={0.85} onPress={pickImages}>
                <LinearGradient colors={['#0d9488', '#14b8a6']} style={styles.imagePickerGradient}>
                  <IconSymbol name="camera.fill" size={scale(18)} color="#ffffff" />
                  <ThemedText style={styles.imagePickerText}>
                    {pickedImages.length ? `${pickedImages.length} image(s) sélectionnée(s)` : 'Ajouter des images'}
                  </ThemedText>
                </LinearGradient>
              </TouchableOpacity>

              {pickedImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: padding.medium }}>
                  <View style={{ flexDirection: 'row', gap: padding.small }}>
                    {pickedImages.map((img, idx) => (
                      <Image key={idx} source={{ uri: img.uri }} style={styles.thumb} />
                    ))}
                  </View>
                </ScrollView>
              )}

              <View style={styles.formGrid}>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Marque *</ThemedText>
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
                      placeholder="Entrez le nom de la marque"
                      placeholderTextColor="#94a3b8"
                      style={[styles.input, { marginTop: padding.small }]}
                    />
                  )}
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Modèle *</ThemedText>
                  <TextInput
                    value={carForm.model}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, model: t }))}
                    placeholder="Ex: Corolla"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Année *</ThemedText>
                  <TextInput
                    value={carForm.year}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, year: t.replace(/[^\d]/g, '') }))}
                    placeholder="2020"
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Kilométrage *</ThemedText>
                  <TextInput
                    value={carForm.km}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, km: t.replace(/[^\d]/g, '') }))}
                    placeholder="150000"
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Prix (DA) *</ThemedText>
                  <TextInput
                    value={carForm.price}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, price: t.replace(/[^\d.]/g, '') }))}
                    placeholder="200000"
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={[
                      styles.input,
                      carForm.price && parseFloat(carForm.price) < 200000 && styles.inputError,
                    ]}
                  />
                  <ThemedText style={styles.hintText}>Prix minimum: 200,000.00 DA</ThemedText>
                  {carForm.price && parseFloat(carForm.price) < 200000 && (
                    <ThemedText style={styles.errorText}>Le prix doit être d'au moins 200,000.00 DA</ThemedText>
                  )}
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>VIN (Numéro d'identification du véhicule)</ThemedText>
                  <View style={styles.vinInputWrapper}>
                    <TextInput
                      value={carForm.vin}
                      onChangeText={handleVinChange}
                      placeholder="17 caractères alphanumériques"
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
                    <ThemedText style={styles.hintText}>{carForm.vin.length}/17 caractères</ThemedText>
                  )}
                  {carForm.vin.length === 0 && (
                    <ThemedText style={styles.hintText}>17 caractères alphanumériques (sans I, O, Q)</ThemedText>
                  )}
                  
                  {vinValidating && (
                    <View style={styles.vinStatusBox}>
                      <ActivityIndicator size="small" color="#0d9488" />
                      <ThemedText style={styles.vinStatusText}>Vérification du VIN en cours...</ThemedText>
                    </View>
                  )}

                  {vinError && vinValid === false && !vinValidating && !bypassVin && (
                    <View style={styles.vinErrorBox}>
                      <IconSymbol name="exclamationmark.triangle.fill" size={scale(24)} color="#ef4444" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.vinErrorTitle}>VIN invalide ou non trouvé</ThemedText>
                        <ThemedText style={styles.vinErrorText}>{vinError}</ThemedText>
                        <TouchableOpacity
                          style={styles.bypassButton}
                          onPress={() => {
                            setBypassVin(true);
                          }}
                          activeOpacity={0.85}
                        >
                          <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.bypassButtonGradient}>
                            <ThemedText style={styles.bypassButtonText}>Créer quand même (VIN non vérifié)</ThemedText>
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
                        <ThemedText style={styles.vinBypassText}>Le véhicule sera créé sans vérification du VIN</ThemedText>
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
                        <ThemedText style={styles.vinSuccessTitle}>VIN valide et vérifié ✓</ThemedText>
                        {vinRemark && (
                          <ThemedText style={styles.vinSuccessRemark}>{vinRemark}</ThemedText>
                        )}
                        {vinDetails && (
                          <View style={styles.vinDetailsBox}>
                            <ThemedText style={styles.vinDetailsTitle}>Détails du véhicule :</ThemedText>
                            {vinDetails.make && (
                              <ThemedText style={styles.vinDetailsText}>Marque: {vinDetails.make}</ThemedText>
                            )}
                            {vinDetails.model && (
                              <ThemedText style={styles.vinDetailsText}>Modèle: {vinDetails.model}</ThemedText>
                            )}
                            {vinDetails.year && (
                              <ThemedText style={styles.vinDetailsText}>Année: {vinDetails.year}</ThemedText>
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
                              <ThemedText style={styles.vinDetailsText}>Carburant: {vinDetails.fuelType}</ThemedText>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Couleur</ThemedText>
                  <TextInput
                    value={carForm.color}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, color: t }))}
                    placeholder="Noir, Blanc..."
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
                <View style={styles.formField}>
                  <ThemedText style={styles.label}>Portes</ThemedText>
                  <TextInput
                    value={carForm.ports}
                    onChangeText={(t) => setCarForm((p) => ({ ...p, ports: t.replace(/[^\d]/g, '') }))}
                    placeholder="4"
                    keyboardType="numeric"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.chipsGroup}>
                <ThemedText style={styles.label}>Boîte</ThemedText>
                <View style={styles.chipsRow}>
                  {(['manuelle', 'auto', 'semi-auto'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      activeOpacity={0.85}
                      onPress={() => setCarForm((p) => ({ ...p, boite: p.boite === v ? '' : v }))}
                      style={[styles.chip, carForm.boite === v && styles.chipActive]}
                    >
                      <ThemedText style={[styles.chipText, carForm.boite === v && styles.chipTextActive]}>{v}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.chipsGroup}>
                <ThemedText style={styles.label}>Carburant</ThemedText>
                <View style={styles.chipsRow}>
                  {(['diesel', 'essence', 'gaz', 'electrique'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      activeOpacity={0.85}
                      onPress={() => setCarForm((p) => ({ ...p, type_gaz: p.type_gaz === v ? '' : v }))}
                      style={[styles.chip, carForm.type_gaz === v && styles.chipActive]}
                    >
                      <ThemedText style={[styles.chipText, carForm.type_gaz === v && styles.chipTextActive]}>{v}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formField}>
                <ThemedText style={styles.label}>Type moteur</ThemedText>
                <TextInput
                  value={carForm.type_enegine}
                  onChangeText={(t) => setCarForm((p) => ({ ...p, type_enegine: t }))}
                  placeholder="Ex: 1.6L"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                />
              </View>

              <View style={styles.formField}>
                <ThemedText style={styles.label}>Description</ThemedText>
                <TextInput
                  value={carForm.description}
                  onChangeText={(t) => setCarForm((p) => ({ ...p, description: t }))}
                  placeholder="Décrivez la voiture..."
                  placeholderTextColor="#94a3b8"
                  style={[styles.input, { height: scale(110), textAlignVertical: 'top', paddingTop: padding.medium }]}
                  multiline
                />
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

      {/* Brand Picker Modal */}
      <Modal visible={showBrandPicker} transparent animationType="fade" onRequestClose={() => setShowBrandPicker(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowBrandPicker(false)}
        >
          <View style={styles.brandPickerSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Sélectionner une marque</ThemedText>
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

      {/* RDV Modal */}
      <Modal visible={showRdvModal} transparent animationType="slide" onRequestClose={() => { setShowRdvModal(false); setShowDatePicker(false); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Créer un RDV</ThemedText>
              <TouchableOpacity onPress={() => { setShowRdvModal(false); setShowDatePicker(false); }} style={styles.modalClose} activeOpacity={0.85}>
                <IconSymbol name="xmark" size={scale(18)} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: padding.large }}>
              {selectedCarForRdv ? (
                <View style={styles.rdvCarHeader}>
                  <ThemedText style={styles.rdvCarTitle}>
                    {selectedCarForRdv.brand} {selectedCarForRdv.model} • {selectedCarForRdv.year}
                  </ThemedText>
                  <ThemedText style={styles.rdvCarSub}>Choisissez un atelier et un créneau</ThemedText>
                </View>
              ) : null}

              <ThemedText style={styles.label}>Atelier *</ThemedText>
              
              {/* Workshop Filters */}
              <View style={styles.workshopFiltersContainer}>
                <View style={styles.filterRow}>
                  <TextInput
                    value={workshopFilters.searchName}
                    onChangeText={(text) => setWorkshopFilters((p) => ({ ...p, searchName: text }))}
                    placeholder="Rechercher par nom..."
                    placeholderTextColor="#94a3b8"
                    style={styles.filterInput}
                  />
                  <TextInput
                    value={workshopFilters.searchAdr}
                    onChangeText={(text) => setWorkshopFilters((p) => ({ ...p, searchAdr: text }))}
                    placeholder="Rechercher par adresse..."
                    placeholderTextColor="#94a3b8"
                    style={styles.filterInput}
                  />
                </View>
                
                <View style={styles.filterChipsRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setWorkshopFilters((p) => ({ ...p, showCertifiedOnly: !p.showCertifiedOnly }))}
                    style={[styles.filterChip, workshopFilters.showCertifiedOnly && styles.filterChipActive]}
                  >
                    <IconSymbol name={workshopFilters.showCertifiedOnly ? "checkmark.seal.fill" : "checkmark.seal"} size={scale(16)} color={workshopFilters.showCertifiedOnly ? "#ffffff" : "#0d9488"} />
                    <ThemedText style={[styles.filterChipText, workshopFilters.showCertifiedOnly && styles.filterChipTextActive]}>
                      Certifiés uniquement
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <View style={styles.sortRow}>
                  <ThemedText style={styles.sortLabel}>Trier par:</ThemedText>
                  <View style={styles.sortChipsRow}>
                    {[
                      { key: 'name', label: 'Nom' },
                      { key: 'price_low', label: 'Prix ↑' },
                      { key: 'price_high', label: 'Prix ↓' },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        activeOpacity={0.85}
                        onPress={() => setWorkshopFilters((p) => ({ ...p, sortBy: option.key as any }))}
                        style={[styles.sortChip, workshopFilters.sortBy === option.key && styles.sortChipActive]}
                      >
                        <ThemedText style={[styles.sortChipText, workshopFilters.sortBy === option.key && styles.sortChipTextActive]}>
                          {option.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {loadingWorkshops ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color="#0d9488" />
                  <ThemedText style={styles.inlineLoadingText}>Chargement des ateliers...</ThemedText>
                </View>
              ) : filteredAndSortedWorkshops.length ? (
                <View style={styles.workshopList}>
                  {filteredAndSortedWorkshops.map((w) => {
                    const id = w.id || w._id || '';
                    const selected = rdvForm.workshopId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        activeOpacity={0.85}
                        onPress={() => {
                          setRdvForm((p) => ({ ...p, workshopId: id, time: '' }));
                          setAvailableTimes([]);
                          if (rdvForm.date) fetchAvailableTimes(id, rdvForm.date);
                        }}
                        style={[styles.workshopItem, selected && styles.workshopItemSelected]}
                      >
                        <View style={styles.workshopItemHeader}>
                          <View style={styles.workshopItemInfo}>
                            <View style={styles.workshopNameRow}>
                              <ThemedText style={[styles.workshopName, selected && styles.workshopNameSelected]}>{w.name}</ThemedText>
                              {w.certifie && (
                                <View style={styles.certifiedBadge}>
                                  <IconSymbol name="checkmark.seal.fill" size={scale(14)} color="#10b981" />
                                  <ThemedText style={styles.certifiedBadgeText}>Certifié</ThemedText>
                                </View>
                              )}
                            </View>
                            {!!w.adr && (
                              <View style={styles.workshopAdrRow}>
                                <IconSymbol name="location.fill" size={scale(14)} color="#64748b" />
                                <ThemedText style={[styles.workshopAdr, selected && styles.workshopAdrSelected]}>{w.adr}</ThemedText>
                              </View>
                            )}
                            <ThemedText style={[styles.workshopPrice, selected && styles.workshopPriceSelected]}>
                              {getWorkshopPrice(w)}
                            </ThemedText>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyWorkshopBox}>
                  <IconSymbol name="building.2" size={scale(48)} color="#94a3b8" />
                  <ThemedText style={styles.emptyText}>Aucun atelier trouvé avec ces filtres.</ThemedText>
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
                        : 'Sélectionner une date'}
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
                    placeholder="Ex: 08:30"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                )}
              </View>

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
            </ScrollView>
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
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: padding.medium,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.medium,
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
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '800',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: fontSizes.base,
    color: '#64748b',
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
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: scale(26),
    borderTopRightRadius: scale(26),
    padding: padding.large,
    maxHeight: '92%',
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
  // Témoignages Styles
  temoignagesContainer: {
    gap: padding.large,
  },
  temoignagesHeader: {
    borderRadius: scale(24),
    overflow: 'hidden',
    marginBottom: padding.medium,
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
  temoignagesHeaderGradient: {
    padding: padding.large,
    borderRadius: scale(24),
    borderWidth: 2,
    borderColor: '#e9d5ff',
  },
  temoignagesHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.medium,
  },
  temoignagesIconContainer: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(16),
    overflow: 'hidden',
  },
  temoignagesIconGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  temoignagesHeaderText: {
    flex: 1,
  },
  temoignagesTitle: {
    fontSize: fontSizes['2xl'],
    fontWeight: '900',
    color: '#9333ea',
    marginBottom: scale(4),
  },
  temoignagesSubtitle: {
    fontSize: fontSizes.sm,
    color: '#7c3aed',
    fontWeight: '600',
  },
  temoignagesList: {
    gap: padding.large,
  },
  temoignageCard: {
    borderRadius: scale(24),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#9333ea',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  temoignageCardGradient: {
    borderRadius: scale(24),
    borderWidth: 2,
    borderColor: '#e9d5ff',
    overflow: 'hidden',
  },
  temoignageImageContainer: {
    height: scale(200),
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  temoignageImage: {
    width: '100%',
    height: '100%',
  },
  temoignageImagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  temoignageBadge: {
    position: 'absolute',
    top: padding.medium,
    right: padding.medium,
  },
  temoignageBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    borderRadius: scale(999),
  },
  temoignageBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '900',
    color: '#ffffff',
  },
  temoignageInfo: {
    padding: padding.large,
    gap: padding.medium,
  },
  temoignageCarName: {
    fontSize: fontSizes.xl,
    fontWeight: '900',
    color: '#1f2937',
  },
  temoignageCarYear: {
    fontSize: fontSizes.md,
    color: '#6b7280',
    fontWeight: '700',
  },
  temoignageDetails: {
    flexDirection: 'row',
    gap: padding.large,
    flexWrap: 'wrap',
    paddingVertical: padding.medium,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
  },
  temoignageDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
  },
  temoignageDetailText: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    fontWeight: '700',
  },
  temoignageVerification: {
    marginTop: padding.small,
    padding: padding.medium,
    backgroundColor: '#faf5ff',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  temoignageVerificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: padding.small,
    marginBottom: scale(8),
  },
  temoignageVerificationTitle: {
    fontSize: fontSizes.sm,
    fontWeight: '800',
    color: '#9333ea',
  },
  temoignageWorkshopName: {
    fontSize: fontSizes.md,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: scale(4),
  },
  temoignageDate: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    fontWeight: '600',
  },
  temoignageViewButton: {
    borderRadius: scale(16),
    overflow: 'hidden',
    marginTop: padding.small,
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
  temoignageViewButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: padding.small,
    paddingVertical: padding.medium,
  },
  temoignageViewButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '900',
    color: '#ffffff',
  },
});
