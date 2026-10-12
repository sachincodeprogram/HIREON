/**
 * HIREON — lightweight i18n (no extra native dependency).
 *
 * - Language choice device par AsyncStorage me save hoti hai.
 * - Screens `useTranslation()` se `t()` lete hain, taaki language badalte hi
 *   poora app turant re-render ho jaye (app restart ki zarurat nahi).
 * - Kisi key ka Hindi translation missing ho to English dikhega, aur English
 *   bhi missing ho to key khud — kabhi crash nahi hoga.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en';
import hi from './locales/hi';

export type LanguageCode = 'en' | 'hi';
export type TranslationKey = keyof typeof en;
type Params = Record<string, string | number>;

export interface LanguageOption {
  code:       LanguageCode;
  name:       string;   // English name
  nativeName: string;   // apni script me
  sample:     string;   // picker me chhota preview
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', sample: 'Fast & reliable parcel delivery' },
  { code: 'hi', name: 'Hindi',   nativeName: 'हिन्दी',  sample: 'तेज़ और भरोसेमंद पार्सल डिलीवरी' },
];

const DICTS: Record<LanguageCode, Partial<Record<TranslationKey, string>>> = { en, hi };
const STORAGE_KEY = '@hireon/language';

let currentLanguage: LanguageCode = 'en';

const interpolate = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m)) : text;

/** Non-component code (services) ke liye — screens me `useTranslation().t` use karo. */
export const translate = (key: TranslationKey, params?: Params, lang: LanguageCode = currentLanguage) =>
  interpolate(DICTS[lang][key] ?? en[key] ?? key, params);

/** Headless/background code (FCM handler) ke liye — React tree ke bina saved bhasha load karo. */
export const loadSavedLanguage = async (): Promise<LanguageCode> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) currentLanguage = saved as LanguageCode;
  } catch { /* default English */ }
  return currentLanguage;
};

interface LanguageContextValue {
  language:    LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t:           (key: TranslationKey, params?: Params) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language:    'en',
  setLanguage: () => {},
  t:           (key, params) => translate(key, params, 'en'),
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLang] = useState<LanguageCode>('en');
  const [ready,    setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved && saved in DICTS) {
          currentLanguage = saved as LanguageCode;
          setLang(saved as LanguageCode);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback((code: LanguageCode) => {
    currentLanguage = code;
    setLang(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translate(key, params, language),
  }), [language, setLanguage]);

  // Saved language load hone tak kuch mat dikhao — warna ek pal English flash hota hai.
  if (!ready) return null;

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = () => useContext(LanguageContext);
