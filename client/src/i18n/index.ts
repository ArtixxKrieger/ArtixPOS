import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", dir: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", dir: "ltr" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "中文", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "th", name: "Thai", nativeName: "ภาษาไทย", dir: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", dir: "ltr" },
  { code: "tl", name: "Filipino", nativeName: "Filipino", dir: "ltr" },
];

// Each entry is a separate Vite chunk — only downloaded when the user picks that language.
// English is always bundled (it's the fallback and the most common locale).
const LOCALE_LOADERS: Record<string, () => Promise<any>> = {
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  pt: () => import("./locales/pt.json"),
  it: () => import("./locales/it.json"),
  nl: () => import("./locales/nl.json"),
  ru: () => import("./locales/ru.json"),
  tr: () => import("./locales/tr.json"),
  ar: () => import("./locales/ar.json"),
  hi: () => import("./locales/hi.json"),
  zh: () => import("./locales/zh.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  th: () => import("./locales/th.json"),
  vi: () => import("./locales/vi.json"),
  id: () => import("./locales/id.json"),
  ms: () => import("./locales/ms.json"),
  tl: () => import("./locales/tl.json"),
};

export async function loadLocale(code: string): Promise<void> {
  if (code === "en" || i18n.hasResourceBundle(code, "translation")) return;
  const loader = LOCALE_LOADERS[code];
  if (!loader) return;
  try {
    const mod = await loader();
    i18n.addResourceBundle(code, "translation", mod.default ?? mod, true, true);
  } catch {
    // Fail silently — English fallback handles missing translations
  }
}

function applyLanguageAttrs(lng: string) {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === lng) ?? SUPPORTED_LANGUAGES[0];
  document.documentElement.lang = lng;
  document.documentElement.dir = lang.dir;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    detection: {
      // Only read from localStorage — never auto-detect from the browser's
      // navigator.language. The browser language reflects language preference,
      // not a user choice inside the app. English is the default until the
      // user explicitly picks a different language in Settings.
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "artixpos_language",
    },
    interpolation: {
      escapeValue: false,
    },
    // Allow adding resource bundles after init (for lazy-loaded locales)
    partialBundledLanguages: true,
    load: "languageOnly",
  });

// Patch changeLanguage so it always ensures the locale is loaded first.
// This replaces every call-site in the app — no changes needed elsewhere.
const _origChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (lng?: string, callback?: any) => {
  if (lng && lng !== "en") await loadLocale(lng);
  return _origChangeLanguage(lng, callback);
};

i18n.on("languageChanged", applyLanguageAttrs);
applyLanguageAttrs(i18n.language);

// Pre-load the user's saved language preference so the UI switches on first
// render without a flash. Only reads from localStorage — never from the
// browser navigator so English stays the default for new users.
const _initialLang = (() => {
  try { return localStorage.getItem("artixpos_language") || "en"; }
  catch { return "en"; }
})();

if (_initialLang !== "en" && LOCALE_LOADERS[_initialLang]) {
  loadLocale(_initialLang).then(() => {
    if (!i18n.hasResourceBundle(_initialLang, "translation")) return;
    if (i18n.language === _initialLang || i18n.language.startsWith(_initialLang)) {
      i18n.emit("languageChanged", i18n.language);
    } else {
      i18n.changeLanguage(_initialLang);
    }
  });
}

export default i18n;
