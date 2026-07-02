import { apiRequest } from '@/utils/backend';
import {
  isInAlgeriaBounds,
  mergeAlgeriaAdmin,
  parseAlgeriaAdminFromDisplayName,
  parseAlgeriaAdminFromGoogleComponents,
  type GoogleAddressComponent,
} from '@/utils/algeriaGeocode';

const ALGERIA_CENTER = '36.7538,3.0588';
const ALGERIA_RADIUS = '800000';

export type PlaceSuggestion = {
  placeId: string;
  label: string;
  description: string;
};

export type ResolvedPlace = {
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string | null;
  commune: string;
  wilaya: string;
  daira: string;
};

function getGoogleApiKey(): string | null {
  const key =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_API_MAP?.trim();
  return key || null;
}

function adminFromComponents(
  components: GoogleAddressComponent[] | undefined,
  formattedAddress: string,
): Pick<ResolvedPlace, 'commune' | 'wilaya' | 'daira'> {
  const fromGoogle = parseAlgeriaAdminFromGoogleComponents(components);
  const fromName = parseAlgeriaAdminFromDisplayName(formattedAddress);
  return mergeAlgeriaAdmin(fromGoogle, fromName);
}

function toResolvedPlace(
  lat: number,
  lng: number,
  formattedAddress: string,
  placeId: string | null,
  components?: GoogleAddressComponent[],
): ResolvedPlace | null {
  if (!isInAlgeriaBounds(lat, lng)) return null;
  const admin = adminFromComponents(components, formattedAddress);
  return {
    lat,
    lng,
    formattedAddress,
    placeId,
    ...admin,
  };
}

async function googleAutocompleteDirect(input: string): Promise<PlaceSuggestion[]> {
  const key = getGoogleApiKey();
  if (!key) return [];

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('key', key);
  url.searchParams.set('components', 'country:dz');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('location', ALGERIA_CENTER);
  url.searchParams.set('radius', ALGERIA_RADIUS);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    predictions?: {
      place_id: string;
      description: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }[];
  };

  if (json?.status !== 'OK' && json?.status !== 'ZERO_RESULTS') return [];

  return (json.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    description: p.description,
    label: p.structured_formatting?.main_text
      ? [p.structured_formatting.main_text, p.structured_formatting.secondary_text].filter(Boolean).join(', ')
      : p.description,
  }));
}

async function googlePlaceDetailsDirect(placeId: string): Promise<ResolvedPlace | null> {
  const key = getGoogleApiKey();
  if (!key) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'fr');
  url.searchParams.set(
    'fields',
    'formatted_address,geometry,address_components,place_id,name',
  );

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    result?: {
      formatted_address?: string;
      place_id?: string;
      name?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: GoogleAddressComponent[];
    };
  };

  if (json?.status !== 'OK' || !json.result?.geometry?.location) return null;

  const lat = Number(json.result.geometry.location.lat);
  const lng = Number(json.result.geometry.location.lng);
  const formattedAddress =
    json.result.formatted_address ||
    (json.result.name ? `${json.result.name}, Algérie` : '');

  return toResolvedPlace(
    lat,
    lng,
    formattedAddress,
    json.result.place_id ?? placeId,
    json.result.address_components,
  );
}

async function googleReverseDirect(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const key = getGoogleApiKey();
  if (!key) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'fr');
  url.searchParams.set('result_type', 'street_address|route|locality|sublocality|administrative_area_level_2|administrative_area_level_1');

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    results?: {
      formatted_address?: string;
      place_id?: string;
      address_components?: GoogleAddressComponent[];
    }[];
  };

  if (json?.status !== 'OK' || !json.results?.length) return null;

  const hit =
    json.results.find((r) =>
      r.address_components?.some((c) => c.types.includes('country') && c.short_name === 'DZ'),
    ) ?? json.results[0];

  return toResolvedPlace(
    lat,
    lng,
    hit.formatted_address || '',
    hit.place_id ?? null,
    hit.address_components,
  );
}

/** Google Places autocomplete — Algeria only (same as web workshop register). */
export async function autocompletePlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const res = await apiRequest(`/geocode/places/autocomplete?q=${encodeURIComponent(q)}`);
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: PlaceSuggestion[];
    };
    if (res.ok && json?.ok && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {
    /* server unavailable — try direct */
  }

  return googleAutocompleteDirect(q);
}

/** Resolve a Google place_id to coordinates + Algeria admin fields. */
export async function resolvePlaceDetails(placeId: string): Promise<ResolvedPlace | null> {
  try {
    const res = await apiRequest(
      `/geocode/places/details?place_id=${encodeURIComponent(placeId)}`,
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: ResolvedPlace;
    };
    if (res.ok && json?.ok && json.data) {
      return json.data;
    }
  } catch {
    /* fallback */
  }

  return googlePlaceDetailsDirect(placeId);
}

/** Reverse geocode GPS coordinates via Google Geocoding API. */
export async function reverseGeocodePlace(lat: number, lng: number): Promise<ResolvedPlace | null> {
  try {
    const res = await apiRequest(
      `/geocode/google/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`,
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: ResolvedPlace;
    };
    if (res.ok && json?.ok && json.data) {
      return json.data;
    }
  } catch {
    /* fallback */
  }

  return googleReverseDirect(lat, lng);
}
