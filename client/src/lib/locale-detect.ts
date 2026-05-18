export interface CountryData {
  code: string;
  name: string;
  flag: string;
  currency: string;
  phonePrefix: string;
  timezone: string;
}

export const COUNTRY_LIST: CountryData[] = [
  { code: "PH", name: "Philippines",        flag: "🇵🇭", currency: "₱",    phonePrefix: "+63",  timezone: "Asia/Manila" },
  { code: "US", name: "United States",       flag: "🇺🇸", currency: "$",    phonePrefix: "+1",   timezone: "America/New_York" },
  { code: "GB", name: "United Kingdom",      flag: "🇬🇧", currency: "£",    phonePrefix: "+44",  timezone: "Europe/London" },
  { code: "AU", name: "Australia",           flag: "🇦🇺", currency: "A$",   phonePrefix: "+61",  timezone: "Australia/Sydney" },
  { code: "CA", name: "Canada",              flag: "🇨🇦", currency: "CA$",  phonePrefix: "+1",   timezone: "America/Toronto" },
  { code: "SG", name: "Singapore",           flag: "🇸🇬", currency: "S$",   phonePrefix: "+65",  timezone: "Asia/Singapore" },
  { code: "MY", name: "Malaysia",            flag: "🇲🇾", currency: "RM",   phonePrefix: "+60",  timezone: "Asia/Kuala_Lumpur" },
  { code: "ID", name: "Indonesia",           flag: "🇮🇩", currency: "Rp",   phonePrefix: "+62",  timezone: "Asia/Jakarta" },
  { code: "TH", name: "Thailand",            flag: "🇹🇭", currency: "฿",   phonePrefix: "+66",  timezone: "Asia/Bangkok" },
  { code: "VN", name: "Vietnam",             flag: "🇻🇳", currency: "₫",   phonePrefix: "+84",  timezone: "Asia/Ho_Chi_Minh" },
  { code: "JP", name: "Japan",               flag: "🇯🇵", currency: "¥",    phonePrefix: "+81",  timezone: "Asia/Tokyo" },
  { code: "KR", name: "South Korea",         flag: "🇰🇷", currency: "₩",    phonePrefix: "+82",  timezone: "Asia/Seoul" },
  { code: "CN", name: "China",               flag: "🇨🇳", currency: "¥",    phonePrefix: "+86",  timezone: "Asia/Shanghai" },
  { code: "HK", name: "Hong Kong",           flag: "🇭🇰", currency: "HK$",  phonePrefix: "+852", timezone: "Asia/Hong_Kong" },
  { code: "TW", name: "Taiwan",              flag: "🇹🇼", currency: "NT$",  phonePrefix: "+886", timezone: "Asia/Taipei" },
  { code: "IN", name: "India",               flag: "🇮🇳", currency: "₹",    phonePrefix: "+91",  timezone: "Asia/Kolkata" },
  { code: "BD", name: "Bangladesh",          flag: "🇧🇩", currency: "৳",   phonePrefix: "+880", timezone: "Asia/Dhaka" },
  { code: "PK", name: "Pakistan",            flag: "🇵🇰", currency: "₨",    phonePrefix: "+92",  timezone: "Asia/Karachi" },
  { code: "LK", name: "Sri Lanka",           flag: "🇱🇰", currency: "Rs",   phonePrefix: "+94",  timezone: "Asia/Colombo" },
  { code: "MM", name: "Myanmar",             flag: "🇲🇲", currency: "K",    phonePrefix: "+95",  timezone: "Asia/Yangon" },
  { code: "KH", name: "Cambodia",            flag: "🇰🇭", currency: "៛",   phonePrefix: "+855", timezone: "Asia/Phnom_Penh" },
  { code: "LA", name: "Laos",                flag: "🇱🇦", currency: "₭",   phonePrefix: "+856", timezone: "Asia/Vientiane" },
  { code: "AE", name: "UAE",                 flag: "🇦🇪", currency: "د.إ", phonePrefix: "+971", timezone: "Asia/Dubai" },
  { code: "SA", name: "Saudi Arabia",        flag: "🇸🇦", currency: "﷼",   phonePrefix: "+966", timezone: "Asia/Riyadh" },
  { code: "QA", name: "Qatar",               flag: "🇶🇦", currency: "ر.ق", phonePrefix: "+974", timezone: "Asia/Qatar" },
  { code: "KW", name: "Kuwait",              flag: "🇰🇼", currency: "د.ك", phonePrefix: "+965", timezone: "Asia/Kuwait" },
  { code: "BH", name: "Bahrain",             flag: "🇧🇭", currency: "BD",   phonePrefix: "+973", timezone: "Asia/Bahrain" },
  { code: "OM", name: "Oman",                flag: "🇴🇲", currency: "ر.ع", phonePrefix: "+968", timezone: "Asia/Muscat" },
  { code: "IL", name: "Israel",              flag: "🇮🇱", currency: "₪",    phonePrefix: "+972", timezone: "Asia/Jerusalem" },
  { code: "NZ", name: "New Zealand",         flag: "🇳🇿", currency: "NZ$",  phonePrefix: "+64",  timezone: "Pacific/Auckland" },
  { code: "DE", name: "Germany",             flag: "🇩🇪", currency: "€",    phonePrefix: "+49",  timezone: "Europe/Berlin" },
  { code: "FR", name: "France",              flag: "🇫🇷", currency: "€",    phonePrefix: "+33",  timezone: "Europe/Paris" },
  { code: "ES", name: "Spain",               flag: "🇪🇸", currency: "€",    phonePrefix: "+34",  timezone: "Europe/Madrid" },
  { code: "IT", name: "Italy",               flag: "🇮🇹", currency: "€",    phonePrefix: "+39",  timezone: "Europe/Rome" },
  { code: "NL", name: "Netherlands",         flag: "🇳🇱", currency: "€",    phonePrefix: "+31",  timezone: "Europe/Amsterdam" },
  { code: "BE", name: "Belgium",             flag: "🇧🇪", currency: "€",    phonePrefix: "+32",  timezone: "Europe/Brussels" },
  { code: "PT", name: "Portugal",            flag: "🇵🇹", currency: "€",    phonePrefix: "+351", timezone: "Europe/Lisbon" },
  { code: "GR", name: "Greece",              flag: "🇬🇷", currency: "€",    phonePrefix: "+30",  timezone: "Europe/Athens" },
  { code: "AT", name: "Austria",             flag: "🇦🇹", currency: "€",    phonePrefix: "+43",  timezone: "Europe/Vienna" },
  { code: "CH", name: "Switzerland",         flag: "🇨🇭", currency: "CHF",  phonePrefix: "+41",  timezone: "Europe/Zurich" },
  { code: "SE", name: "Sweden",              flag: "🇸🇪", currency: "kr",   phonePrefix: "+46",  timezone: "Europe/Stockholm" },
  { code: "NO", name: "Norway",              flag: "🇳🇴", currency: "kr",   phonePrefix: "+47",  timezone: "Europe/Oslo" },
  { code: "DK", name: "Denmark",             flag: "🇩🇰", currency: "kr",   phonePrefix: "+45",  timezone: "Europe/Copenhagen" },
  { code: "FI", name: "Finland",             flag: "🇫🇮", currency: "€",    phonePrefix: "+358", timezone: "Europe/Helsinki" },
  { code: "PL", name: "Poland",              flag: "🇵🇱", currency: "zł",  phonePrefix: "+48",  timezone: "Europe/Warsaw" },
  { code: "RU", name: "Russia",              flag: "🇷🇺", currency: "₽",    phonePrefix: "+7",   timezone: "Europe/Moscow" },
  { code: "TR", name: "Turkey",              flag: "🇹🇷", currency: "₺",    phonePrefix: "+90",  timezone: "Europe/Istanbul" },
  { code: "UA", name: "Ukraine",             flag: "🇺🇦", currency: "₴",    phonePrefix: "+380", timezone: "Europe/Kiev" },
  { code: "ZA", name: "South Africa",        flag: "🇿🇦", currency: "R",    phonePrefix: "+27",  timezone: "Africa/Johannesburg" },
  { code: "NG", name: "Nigeria",             flag: "🇳🇬", currency: "₦",    phonePrefix: "+234", timezone: "Africa/Lagos" },
  { code: "KE", name: "Kenya",               flag: "🇰🇪", currency: "KSh",  phonePrefix: "+254", timezone: "Africa/Nairobi" },
  { code: "GH", name: "Ghana",               flag: "🇬🇭", currency: "₵",   phonePrefix: "+233", timezone: "Africa/Accra" },
  { code: "EG", name: "Egypt",               flag: "🇪🇬", currency: "£",    phonePrefix: "+20",  timezone: "Africa/Cairo" },
  { code: "MA", name: "Morocco",             flag: "🇲🇦", currency: "د.م.",phonePrefix: "+212", timezone: "Africa/Casablanca" },
  { code: "BR", name: "Brazil",              flag: "🇧🇷", currency: "R$",   phonePrefix: "+55",  timezone: "America/Sao_Paulo" },
  { code: "MX", name: "Mexico",              flag: "🇲🇽", currency: "$",    phonePrefix: "+52",  timezone: "America/Mexico_City" },
  { code: "CO", name: "Colombia",            flag: "🇨🇴", currency: "$",    phonePrefix: "+57",  timezone: "America/Bogota" },
  { code: "AR", name: "Argentina",           flag: "🇦🇷", currency: "$",    phonePrefix: "+54",  timezone: "America/Buenos_Aires" },
  { code: "CL", name: "Chile",               flag: "🇨🇱", currency: "$",    phonePrefix: "+56",  timezone: "America/Santiago" },
  { code: "PE", name: "Peru",                flag: "🇵🇪", currency: "S/.",  phonePrefix: "+51",  timezone: "America/Lima" },
];

const COUNTRY_BY_CODE: Record<string, CountryData> = Object.fromEntries(
  COUNTRY_LIST.map(c => [c.code, c])
);

const COUNTRY_CURRENCY_MAP: Record<string, string> = Object.fromEntries(
  COUNTRY_LIST.map(c => [c.code, c.currency])
);

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
  "Europe/Istanbul": "₺",
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

export function getCountryByCode(code: string): CountryData | null {
  return COUNTRY_BY_CODE[code] ?? null;
}

export interface LocaleInfo {
  timezone: string;
  currency: string;
  countryCode: string | null;
}

export function detectLocale(): LocaleInfo {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const languages: string[] = Array.isArray(navigator.languages) && navigator.languages.length
    ? Array.from(navigator.languages)
    : [navigator.language || ""];

  for (const lang of languages) {
    if (!lang) continue;
    const parts = lang.split("-");
    if (parts.length >= 2) {
      const region = parts[parts.length - 1].toUpperCase();
      if (region.length === 2 && COUNTRY_CURRENCY_MAP[region]) {
        return { timezone, currency: COUNTRY_CURRENCY_MAP[region], countryCode: region };
      }
    }
  }

  if (TIMEZONE_CURRENCY_MAP[timezone]) {
    const match = COUNTRY_LIST.find(c => c.timezone === timezone);
    return { timezone, currency: TIMEZONE_CURRENCY_MAP[timezone], countryCode: match?.code ?? null };
  }

  const tzRegion = timezone.split("/")[0];
  if (tzRegion === "Europe") return { timezone, currency: "€", countryCode: null };
  if (tzRegion === "America") return { timezone, currency: "$", countryCode: null };
  if (tzRegion === "Australia") return { timezone, currency: "A$", countryCode: null };
  if (tzRegion === "Pacific") return { timezone, currency: "$", countryCode: null };
  if (tzRegion === "Africa") return { timezone, currency: "$", countryCode: null };

  return { timezone, currency: "$", countryCode: null };
}
