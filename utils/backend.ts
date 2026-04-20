/**
 * Get the backend URL from environment variables
 * Falls back to default if not set
 *
 * Resolution order:
 * 1. EXPO_PUBLIC_BACKEND_URL / EXPO_PUBLIC_URLBACKEND (.env, build-time)
 * 2. expo.extra.API_URL from app.json (via expo-constants — good for EAS/production)
 * 3. http://localhost:8001
 *
 * Make sure to restart the Expo server after changing .env file
 */
import { DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';

function normalizeBackendUrl(rawUrl: string): string {
  // Remove spaces/quotes and accidental leading "=" from .env formatting mistakes.
  const trimmed = (rawUrl || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/^=+/, '');

  // Remove trailing slash if present.
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');

  // Ensure protocol exists, otherwise default to http.
  const withProtocol = /^https?:\/\//i.test(withoutTrailingSlash)
    ? withoutTrailingSlash
    : `http://${withoutTrailingSlash}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return 'http://localhost:8001';
  }
}

function getExtraApiUrl(): string | undefined {
  const extra = Constants.expoConfig?.extra ?? (Constants.manifest as { extra?: Record<string, unknown> } | null)?.extra;
  const v = extra?.API_URL;
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

export function getBackendUrl(): string {
  // In Expo, EXPO_PUBLIC_* vars are embedded at build time from .env
  const fromEnv =
    process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_URLBACKEND || '';
  const fromAppConfig = getExtraApiUrl() || '';
  const rawBackendUrl = fromEnv.trim() !== '' ? fromEnv : fromAppConfig.trim() !== '' ? fromAppConfig : 'http://localhost:8001';
  const cleanUrl = normalizeBackendUrl(rawBackendUrl);

  // Log in development to help debug
  if (__DEV__) {
    console.log('Backend URL:', cleanUrl, '(raw:', rawBackendUrl, ')');
  }

  return cleanUrl;
}

/**
 * Get the full image URL from a relative path
 */
export function getImageUrl(imagePath: string): string | null {
  if (!imagePath || imagePath.trim() === '') {
    return null;
  }

  const trimmed = imagePath.trim();

  // QR codes (and similar) are often stored as data URLs from the server (e.g. qrcode.toDataURL).
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  // If already a full URL, return as is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  
  // If it starts with /, it's already a path
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  
  // Combine with backend URL
  return `${getBackendUrl()}${cleanPath}`;
}

/**
 * Read response body as JSON when possible (handles HTML error pages from proxies / old deployments).
 */
export async function readResponseJson(response: Response): Promise<{
  data: Record<string, unknown>;
  rawText: string;
}> {
  const rawText = await response.text();
  try {
    const data = JSON.parse(rawText) as Record<string, unknown>;
    return { data, rawText };
  } catch {
    return { data: {}, rawText };
  }
}

/**
 * Make an API request to the backend
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const backendUrl = getBackendUrl();
  // Backend routes are prefixed with /api (see server_bun/index.ts line 183)
  // If endpoint already starts with /api, use it as is, otherwise add /api prefix
  const apiEndpoint = endpoint.startsWith('/api') 
    ? endpoint 
    : `/api${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const url = `${backendUrl}${apiEndpoint}`;
  
  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData;

  const defaultHeaders: HeadersInit = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  // Add token if available (from AsyncStorage)
  let token: string | null = null;
  let AsyncStorage: any | null = null;
  try {
    // Import AsyncStorage dynamically
    const AsyncStorageModule = await import('@react-native-async-storage/async-storage');
    AsyncStorage = AsyncStorageModule.default;
    token = await AsyncStorage.getItem('auth_token');
  } catch (error) {
    // If AsyncStorage is not available or fails, continue without token
    if (__DEV__) {
      console.warn('Could not get token from AsyncStorage:', error);
    }
  }
  
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Log request in development mode for debugging
  if (__DEV__) {
    console.log(`API Request: ${options.method || 'GET'} ${url}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    // If the backend says auth is invalid/expired, clear local token to stop request loops.
    if (response.status === 401) {
      // Always clear on auth failure to stop repeated calls with an expired JWT.
      try {
        const storage =
          AsyncStorage ??
          (await import('@react-native-async-storage/async-storage')).default;
        await storage.removeItem('auth_token');
        await storage.removeItem('auth_user');
      } finally {
        DeviceEventEmitter.emit('auth:expired');
      }
    }

    return response;
  } catch (error: any) {
    // Log error details in development
    if (__DEV__) {
      console.error('API Request Error:', error);
      console.error('URL:', url);
      console.error('Error message:', error?.message);
      console.error('Error type:', error?.name);
    }
    
    // Re-throw with more context
    throw new Error(
      error?.message || 
      `Impossible de se connecter au serveur. Vérifiez que le backend est démarré et que l'URL est correcte: ${backendUrl}`
    );
  }
}
