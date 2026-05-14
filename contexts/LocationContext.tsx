import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Location from 'expo-location';

interface LocationState {
  lat: number | null;
  lng: number | null;
  region: string | null;
  loading: boolean;
}

interface LocationContextType extends LocationState {
  refresh: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType>({
  lat: null,
  lng: null,
  region: null,
  loading: true,
  refresh: async () => {},
});

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lng: null,
    region: null,
    loading: true,
  });

  const fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      let region: string | null = null;
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        region = geo?.region ?? geo?.city ?? null;
      } catch {
        // Reverse geocode can fail offline — lat/lng are still useful
      }

      setState({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        region,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  return (
    <LocationContext.Provider value={{ ...state, refresh: fetchLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
