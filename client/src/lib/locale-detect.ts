// Country code → currency symbol (ISO 3166-1 alpha-2 → symbol)
// Used as PRIMARY detection via navigator.language (e.g. "en-PH" → "PH" → "₱").
// This is set by the user's language/region preference, not the device's physical origin.
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // Asia Pacific
  PH: "₱",   // Philippines
  JP: "¥",   // Japan
  CN: "¥",   // China
  HK: "HK$", // Hong Kong
  SG: "S$",  // Singapore
  MY: "RM",  // Malaysia
  ID: "Rp",  // Indonesia
  TH: "฿",  // Thailand
  KR: "₩",  // South Korea
  IN: "₹",  // India
  LK: "Rs",  // Sri Lanka
  BD: "৳",  // Bangladesh
  PK: "₨",  // Pakistan
  TW: "NT$", // Taiwan
  VN: "₫",  // Vietnam
  MM: "K",   // Myanmar
  KH: "៛",  // Cambodia
  LA: "₭",  // Laos
  MN: "₮",  // Mongolia
  KZ: "₸",  // Kazakhstan
  UZ: "сўм", // Uzbekistan
  AE: "د.إ", // UAE
  SA: "﷼",  // Saudi Arabia
  IR: "﷼",  // Iran
  AZ: "₼",  // Azerbaijan
  GE: "₾",  // Georgia
  IL: "₪",  // Israel
  CY: "€",  // Cyprus
  AU: "A$",  // Australia
  NZ: "NZ$", // New Zealand
  FJ: "FJ$", // Fiji
  GU: "$",   // Guam
  // Europe
  GB: "£",   // UK
  IE: "€",  // Ireland
  FR: "€",  // France
  DE: "€",  // Germany
  ES: "€",  // Spain
  IT: "€",  // Italy
  NL: "€",  // Netherlands
  BE: "€",  // Belgium
  AT: "€",  // Austria
  CH: "CHF", // Switzerland
  SE: "kr",  // Sweden
  NO: "kr",  // Norway
  DK: "kr",  // Denmark
  FI: "€",  // Finland
  PL: "zł", // Poland
  CZ: "Kč", // Czech Republic
  HU: "Ft",  // Hungary
  RO: "lei", // Romania
  BG: "лв", // Bulgaria
  RS: "дин", // Serbia
  HR: "€",  // Croatia
  GR: "€",  // Greece
  PT: "€",  // Portugal
  RU: "₽",  // Russia
  UA: "₴",  // Ukraine
  // Americas
  US: "$",   // USA
  CA: "CA$", // Canada
  MX: "$",   // Mexico
  CO: "$",   // Colombia
  PE: "S/.", // Peru
  CL: "$",   // Chile
  AR: "$",   // Argentina
  BR: "R$",  // Brazil
  VE: "Bs.", // Venezuela
  BO: "Bs",  // Bolivia
  PY: "₲",  // Paraguay
  UY: "$U",  // Uruguay
  EC: "$",   // Ecuador
  PA: "B/.", // Panama
  CR: "₡",  // Costa Rica
  CU: "$",   // Cuba
  JM: "J$",  // Jamaica
  GT: "Q",   // Guatemala
  HN: "L",   // Honduras
  SV: "$",   // El Salvador
  NI: "C$",  // Nicaragua
  DO: "$",   // Dominican Republic
  PR: "$",   // Puerto Rico
  // Africa
  ZA: "R",   // South Africa
  EG: "£",   // Egypt
  NG: "₦",  // Nigeria
  KE: "KSh", // Kenya
  GH: "₵",  // Ghana
  MA: "د.م.", // Morocco
  TN: "د.ت", // Tunisia
  DZ: "دج", // Algeria
  ET: "Br",  // Ethiopia
  TZ: "TSh", // Tanzania
  UG: "USh", // Uganda
  RW: "FRw", // Rwanda
  ZM: "ZK",  // Zambia
  ZW: "$",   // Zimbabwe
  MZ: "MT",  // Mozambique
};

// Timezone → currency (FALLBACK — used when language has no region tag)
const TIMEZONE_CURRENCY_MAP: Record<string, string> = {
  "Asia/Manila": "₱",
  "Asia/Tokyo": "¥",
  "Asia/Shanghai": "¥",
  "Asia/Hong_Kong": "HK$",
  "Asia/Singapore": "S$",
  "Asia/Kuala_Lumpur": "RM",
  "Asia/Jakarta": "Rp",
  "Asia/Bangkok": "฿",
  "Asia/Seoul": "₩",
  "Asia/Kolkata": "₹",
  "Asia/Colombo": "Rs",
  "Asia/Dhaka": "৳",
  "Asia/Karachi": "₨",
  "Asia/Taipei": "NT$",
  "Asia/Ho_Chi_Minh": "₫",
  "Asia/Yangon": "K",
  "Asia/Phnom_Penh": "៛",
  "Asia/Vientiane": "₭",
  "Asia/Ulaanbaatar": "₮",
  "Asia/Almaty": "₸",
  "Asia/Tashkent": "сўм",
  "Asia/Dubai": "د.إ",
  "Asia/Riyadh": "﷼",
  "Asia/Tehran": "﷼",
  "Asia/Baku": "₼",
  "Asia/Tbilisi": "₾",
  "Asia/Jerusalem": "₪",
  "Asia/Nicosia": "€",
  "Europe/London": "£",
  "Europe/Dublin": "€",
  "Europe/Paris": "€",
  "Europe/Berlin": "€",
  "Europe/Madrid": "€",
  "Europe/Rome": "€",
  "Europe/Amsterdam": "€",
  "Europe/Brussels": "€",
  "Europe/Vienna": "€",
  "Europe/Zurich": "CHF",
  "Europe/Stockholm": "kr",
  "Europe/Oslo": "kr",
  "Europe/Copenhagen": "kr",
  "Europe/Helsinki": "€",
  "Europe/Warsaw": "zł",
  "Europe/Prague": "Kč",
  "Europe/Budapest": "Ft",
  "Europe/Bucharest": "lei",
  "Europe/Sofia": "лв",
  "Europe/Belgrade": "дин",
  "Europe/Zagreb": "€",
  "Europe/Athens": "€",
  "Europe/Lisbon": "€",
  "Europe/Moscow": "₽",
  "Europe/Kiev": "₴",
  "America/New_York": "$",
  "America/Chicago": "$",
  "America/Denver": "$",
  "America/Los_Angeles": "$",
  "America/Phoenix": "$",
  "America/Anchorage": "$",
  "Pacific/Honolulu": "$",
  "America/Toronto": "CA$",
  "America/Vancouver": "CA$",
  "America/Halifax": "CA$",
  "America/Mexico_City": "$",
  "America/Bogota": "$",
  "America/Lima": "S/.",
  "America/Santiago": "$",
  "America/Buenos_Aires": "$",
  "America/Sao_Paulo": "R$",
  "America/Caracas": "Bs.",
  "America/La_Paz": "Bs",
  "America/Asuncion": "₲",
  "America/Montevideo": "$U",
  "America/Guayaquil": "$",
  "America/Panama": "B/.",
  "America/Costa_Rica": "₡",
  "America/Havana": "$",
  "America/Jamaica": "J$",
  "Africa/Johannesburg": "R",
  "Africa/Cairo": "£",
  "Africa/Lagos": "₦",
  "Africa/Nairobi": "KSh",
  "Africa/Accra": "₵",
  "Africa/Casablanca": "د.م.",
  "Africa/Tunis": "د.ت",
  "Africa/Algiers": "دج",
  "Africa/Addis_Ababa": "Br",
  "Africa/Dar_es_Salaam": "TSh",
  "Africa/Kampala": "USh",
  "Africa/Kigali": "FRw",
  "Australia/Sydney": "A$",
  "Australia/Melbourne": "A$",
  "Australia/Brisbane": "A$",
  "Australia/Perth": "A$",
  "Australia/Adelaide": "A$",
  "Pacific/Auckland": "NZ$",
  "Pacific/Fiji": "FJ$",
  "Pacific/Guam": "$",
};

export interface LocaleInfo {
  timezone: string;
  currency: string;
}

export function detectLocale(): LocaleInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  // PRIMARY: use browser language preference list (set by the user, not the device origin).
  // e.g. "fil-PH" → region "PH" → "₱"
  // e.g. "en-PH"  → region "PH" → "₱"
  // e.g. "ja-JP"  → region "JP" → "¥"
  const languages: string[] = Array.isArray(navigator.languages) && navigator.languages.length
    ? Array.from(navigator.languages)
    : [navigator.language || ""];

  for (const lang of languages) {
    if (!lang) continue;
    // BCP 47 tags: "en-PH", "fil-PH", "zh-Hans-CN" — region is always the last segment
    const parts = lang.split("-");
    if (parts.length >= 2) {
      const region = parts[parts.length - 1].toUpperCase();
      // Only accept 2-letter country codes (ISO 3166-1 alpha-2), not subtags like "Latn"
      if (region.length === 2 && COUNTRY_CURRENCY_MAP[region]) {
        return { timezone, currency: COUNTRY_CURRENCY_MAP[region] };
      }
    }
  }

  // FALLBACK: timezone-based detection (less accurate — reflects device physical origin,
  // not the user's country. Used when language tag has no region subtag.)
  if (TIMEZONE_CURRENCY_MAP[timezone]) {
    return { timezone, currency: TIMEZONE_CURRENCY_MAP[timezone] };
  }

  const tzRegion = timezone.split("/")[0];
  if (tzRegion === "Europe") return { timezone, currency: "€" };
  if (tzRegion === "America") return { timezone, currency: "$" };
  if (tzRegion === "Australia") return { timezone, currency: "A$" };
  if (tzRegion === "Pacific") return { timezone, currency: "$" };
  if (tzRegion === "Africa") return { timezone, currency: "$" };

  return { timezone, currency: "$" };
}
