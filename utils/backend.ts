/**
 * Get the backend URL from environment variables
 * Falls back to default if not set
 * 
 * For React Native/Expo, use EXPO_PUBLIC_ prefix in .env file
 * Example: EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
 * 
 * Make sure to restart the Expo server after changing .env file
 */
export function getBackendUrl(): string {
  // In Expo, environment variables prefixed with EXPO_PUBLIC_ are available
  // They are loaded from .env file at build time
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 
                     process.env.EXPO_PUBLIC_URLBACKEND || 
                     'http://localhost:8001';
  
  // Remove trailing slash if present
  const cleanUrl = backendUrl.replace(/\/$/, '');
  
  // Log in development to help debug
  if (__DEV__) {
    console.log('Backend URL:', cleanUrl);
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
  
  // If already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If it starts with /, it's already a path
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  
  // Combine with backend URL
  return `${getBackendUrl()}${cleanPath}`;
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
  try {
    // Import AsyncStorage dynamically
    const AsyncStorageModule = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = AsyncStorageModule.default;
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
