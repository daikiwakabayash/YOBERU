"use client";

import { useCallback } from "react";
import { translations, type Lang, type TranslationKey } from "./dictionary";

/**
 * Tiny in-house i18n hook for the public booking page. Returns:
 *   t  — lookup function: t("step1Title")
 *   lang — current language code ('ja' | 'en')
 *
 * No dependency on next-intl / react-i18next; just keys defined in
 * `feature/booking-link/i18n/dictionary.ts`.
 */
export function useT(lang: Lang) {
  const dict = translations[lang] ?? translations.ja;
  const t = useCallback(
    (key: TranslationKey) => {
      return dict[key] ?? translations.ja[key] ?? key;
    },
    [dict]
  );
  return { t, lang };
}
