import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import ar from "./locales/ar.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import vi from "./locales/vi.json";
import id from "./locales/id.json";
import tl from "./locales/tl.json";
import hi from "./locales/hi.json";
import th from "./locales/th.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";
import nl from "./locales/nl.json";
import ms from "./locales/ms.json";

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
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      pt: { translation: pt },
      it: { translation: it },
      ar: { translation: ar },
      zh: { translation: zh },
      ja: { translation: ja },
      ko: { translation: ko },
      vi: { translation: vi },
      id: { translation: id },
      tl: { translation: tl },
      hi: { translation: hi },
      th: { translation: th },
      ru: { translation: ru },
      tr: { translation: tr },
      nl: { translation: nl },
      ms: { translation: ms },
    },
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "artixpos_language",
    },
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on("languageChanged", applyLanguageAttrs);
applyLanguageAttrs(i18n.language);

export default i18n;
