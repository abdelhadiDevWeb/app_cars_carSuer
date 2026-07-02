import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { getBackendUrl } from '@/utils/backend';

interface User {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  type: 'user' | 'workshop';
  role?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function clearStoredAuth(): Promise<void> {
  await AsyncStorage.removeItem('auth_token');
  await AsyncStorage.removeItem('auth_user');
}

function mapMeUser(raw: Record<string, unknown>): User | null {
  const id = (raw._id as string) || (raw.id as string);
  const email = raw.email as string;
  if (!id || !email) return null;
  return {
    _id: id,
    email,
    firstName: raw.firstName as string | undefined,
    lastName: raw.lastName as string | undefined,
    name: raw.name as string | undefined,
    type: raw.type as 'user' | 'workshop',
    role: raw.role as string | undefined,
  };
}

/** Validate JWT with the server before restoring a session from AsyncStorage. */
async function validateStoredSession(
  token: string,
  storedUserJson: string,
): Promise<{ user: User } | { invalid: true } | { offline: true }> {
  const parseCachedUser = (): User | null => {
    try {
      const parsed = JSON.parse(storedUserJson) as Record<string, unknown>;
      return mapMeUser(parsed);
    } catch {
      return null;
    }
  };

  try {
    const res = await fetch(`${getBackendUrl()}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401) return { invalid: true };

    // Rate limit / server busy — keep cached session, do not spam the API.
    if (res.status === 429 || res.status >= 500) {
      const cached = parseCachedUser();
      return cached ? { user: cached } : { offline: true };
    }

    if (!res.ok) {
      const cached = parseCachedUser();
      return cached ? { user: cached } : { offline: true };
    }

    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      user?: Record<string, unknown>;
    } | null;

    if (!data?.ok || !data.user) return { invalid: true };

    const user = mapMeUser(data.user);
    if (!user) return { invalid: true };

    if (user.type === 'user' && user.role !== 'admin' && data.user.status === false) {
      return { invalid: true };
    }

    return { user };
  } catch {
    const cached = parseCachedUser();
    return cached ? { user: cached } : { offline: true };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const logout = useCallback(async () => {
    try {
      await clearStoredAuth();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error clearing auth state:', error);
    }
  }, []);

  const loadAuthState = useCallback(async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('auth_user');

      if (!storedToken || !storedUser) {
        setIsAuthenticated(false);
        setToken(null);
        setUser(null);
        return;
      }

      try {
        JSON.parse(storedUser);
      } catch (parseError) {
        console.error('Error parsing stored user:', parseError);
        await clearStoredAuth();
        setIsAuthenticated(false);
        setToken(null);
        setUser(null);
        return;
      }

      const validation = await validateStoredSession(storedToken, storedUser);
      if ('invalid' in validation) {
        await clearStoredAuth();
        setIsAuthenticated(false);
        setToken(null);
        setUser(null);
        return;
      }
      if ('offline' in validation) {
        const cached = (() => {
          try {
            return mapMeUser(JSON.parse(storedUser) as Record<string, unknown>);
          } catch {
            return null;
          }
        })();
        if (cached) {
          setToken(storedToken);
          setUser(cached);
          setIsAuthenticated(true);
          return;
        }
        await clearStoredAuth();
        setIsAuthenticated(false);
        setToken(null);
        setUser(null);
        return;
      }

      setToken(storedToken);
      setUser(validation.user);
      setIsAuthenticated(true);
      try {
        await AsyncStorage.setItem('auth_user', JSON.stringify(validation.user));
      } catch {
        /* ignore cache write failure */
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
      setIsAuthenticated(false);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuthState();
  }, [loadAuthState]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('auth:expired', () => {
      void logout();
    });

    return () => {
      subscription.remove();
    };
  }, [logout]);

  const login = async (newToken: string, newUser: User) => {
    try {
      await AsyncStorage.setItem('auth_token', newToken);
      await AsyncStorage.setItem('auth_user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error saving auth state:', error);
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('auth_user');
      if (!storedToken || !storedUser) return;

      const validation = await validateStoredSession(storedToken, storedUser);
      if ('invalid' in validation) {
        await logout();
        return;
      }
      if ('offline' in validation) {
        try {
          const cached = mapMeUser(JSON.parse(storedUser) as Record<string, unknown>);
          if (cached) setUser(cached);
        } catch {
          /* ignore */
        }
        return;
      }
      setUser(validation.user);
      await AsyncStorage.setItem('auth_user', JSON.stringify(validation.user));
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
