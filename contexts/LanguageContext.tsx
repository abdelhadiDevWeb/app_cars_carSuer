import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { getDeviceLanguage, type SupportedLanguage } from '@/utils/i18n';

type LanguageContextType = {
  language: SupportedLanguage;
  isReady: boolean;
  setLanguage: (lang: SupportedLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'app_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('fr');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const initial: SupportedLanguage =
          stored === 'fr' || stored === 'en' || stored === 'ar'
            ? stored
            : getDeviceLanguage();
        setLanguageState(initial);
        await i18n.changeLanguage(initial);
      } catch {
        const fallback = getDeviceLanguage();
        setLanguageState(fallback);
        await i18n.changeLanguage(fallback);
      } finally {
        setIsReady(true);
      }
    };
    void load();
  }, []);

  const setLanguage = async (lang: SupportedLanguage) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);
    await i18n.changeLanguage(lang);
  };

  const value = useMemo(() => ({ language, isReady, setLanguage }), [language, isReady]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

