import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

interface User {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Load auth state from AsyncStorage on mount
  useEffect(() => {
    loadAuthState();
  }, []);

  // If the backend returns 401 (token expired/invalid), apiRequest will emit this event.
  // We clear auth state so NavigationHandler redirects the user to login/splash and polling stops.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('auth:expired', () => {
      void logout();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadAuthState = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (parseError) {
          console.error('Error parsing stored user:', parseError);
          // Clear invalid data
          await AsyncStorage.removeItem('auth_token');
          await AsyncStorage.removeItem('auth_user');
        }
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
      // Ensure we don't get stuck in loading state
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

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

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('auth_user');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error clearing auth state:', error);
    }
  };

  const refreshUser = async () => {
    // TODO: Implement user refresh from API if needed
    // For now, just reload from storage
    await loadAuthState();
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
