"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

import en from "@/locales/en.json";
import zhTW from "@/locales/zh-TW.json";
import zhCN from "@/locales/zh-CN.json";
import ja from "@/locales/ja.json";
import es from "@/locales/es.json";
import ko from "@/locales/ko.json";
import fr from "@/locales/fr.json";
import ms from "@/locales/ms.json";

export type Locale = "en" | "zh-TW" | "zh-CN" | "ja" | "es" | "ko" | "fr" | "ms";

const STORAGE_KEY = "preferred-locale";

const translations: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  "zh-TW": zhTW as Record<string, string>,
  "zh-CN": zhCN as Record<string, string>,
  ja: ja as Record<string, string>,
  es: es as Record<string, string>,
  ko: ko as Record<string, string>,
  fr: fr as Record<string, string>,
  ms: ms as Record<string, string>,
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
  t: (key: string, vars?: Record<string, string | number>) => string;
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
    (key: string, vars?: Record<string, string | number>): string => {
      let str = translations[locale]?.[key] ?? translations.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{{${k}}}`, String(v));
        }
      }
      return str;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
