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

  if (TIMEZONE_CURRENCY_MAP[timezone]) {
    return { timezone, currency: TIMEZONE_CURRENCY_MAP[timezone] };
  }

  const region = timezone.split("/")[0];
  if (region === "Europe") return { timezone, currency: "€" };
  if (region === "America") return { timezone, currency: "$" };
  if (region === "Australia") return { timezone, currency: "A$" };
  if (region === "Pacific") return { timezone, currency: "$" };
  if (region === "Africa") return { timezone, currency: "$" };

  return { timezone, currency: "₱" };
}
