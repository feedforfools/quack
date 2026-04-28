import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import it from "./locales/it.json";

/** Supported locale codes. */
export const SUPPORTED_LANGUAGES = ["en", "it"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Detect the preferred language from the browser.
 * Falls back to English if no supported match is found.
 */
function detectLanguage(): SupportedLanguage {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith("it")) return "it";
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    // React already escapes values — no need for i18next to do it twice.
    escapeValue: false,
  },
});

export default i18n;
