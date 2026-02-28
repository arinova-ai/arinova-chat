"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

import en from "@/locales/en.json";
import zhTW from "@/locales/zh-TW.json";
import zhCN from "@/locales/zh-CN.json";
import ja from "@/locales/ja.json";

export type Locale = "en" | "zh-TW" | "zh-CN" | "ja";

const STORAGE_KEY = "preferred-locale";

const translations: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  "zh-TW": zhTW as Record<string, string>,
  "zh-CN": zhCN as Record<string, string>,
  ja: ja as Record<string, string>,
};

function readLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved in translations) return saved as Locale;
  return "en";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function useTranslation() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // storage unavailable
    }
  }, []);

  // Sync on mount (SSR hydration)
  useEffect(() => {
    const saved = readLocale();
    if (saved !== locale) setLocaleState(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useCallback(
    (key: string): string => translations[locale]?.[key] ?? translations.en[key] ?? key,
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
