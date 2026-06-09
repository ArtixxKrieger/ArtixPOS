export interface CountryPricing {
  symbol: string;
  proMonthly: number;
  proAnnual: number;
  proMonthlyEq: number;
  businessMonthly: number;
  businessAnnual: number;
  businessMonthlyEq: number;
  proSavingsText: string;
  businessSavingsText: string;
}

const PRICING_BY_COUNTRY: Record<string, CountryPricing> = {
  PH: {
    symbol: "₱",
    proMonthly: 499,
    proAnnual: 4999,
    proMonthlyEq: 416,
    businessMonthly: 999,
    businessAnnual: 9999,
    businessMonthlyEq: 833,
    proSavingsText: "Save ₱1,000/yr",
    businessSavingsText: "Save ₱2,000/yr",
  },
  US: {
    symbol: "$",
    proMonthly: 9,
    proAnnual: 89,
    proMonthlyEq: 7,
    businessMonthly: 19,
    businessAnnual: 189,
    businessMonthlyEq: 16,
    proSavingsText: "Save $19/yr",
    businessSavingsText: "Save $39/yr",
  },
  GB: {
    symbol: "£",
    proMonthly: 8,
    proAnnual: 75,
    proMonthlyEq: 6,
    businessMonthly: 16,
    businessAnnual: 155,
    businessMonthlyEq: 13,
    proSavingsText: "Save £21/yr",
    businessSavingsText: "Save £37/yr",
  },
  AU: {
    symbol: "A$",
    proMonthly: 15,
    proAnnual: 139,
    proMonthlyEq: 12,
    businessMonthly: 29,
    businessAnnual: 289,
    businessMonthlyEq: 24,
    proSavingsText: "Save A$41/yr",
    businessSavingsText: "Save A$59/yr",
  },
  CA: {
    symbol: "CA$",
    proMonthly: 12,
    proAnnual: 119,
    proMonthlyEq: 10,
    businessMonthly: 24,
    businessAnnual: 239,
    businessMonthlyEq: 20,
    proSavingsText: "Save CA$25/yr",
    businessSavingsText: "Save CA$49/yr",
  },
  SG: {
    symbol: "S$",
    proMonthly: 12,
    proAnnual: 119,
    proMonthlyEq: 10,
    businessMonthly: 24,
    businessAnnual: 239,
    businessMonthlyEq: 20,
    proSavingsText: "Save S$25/yr",
    businessSavingsText: "Save S$49/yr",
  },
  MY: {
    symbol: "RM",
    proMonthly: 39,
    proAnnual: 389,
    proMonthlyEq: 32,
    businessMonthly: 79,
    businessAnnual: 789,
    businessMonthlyEq: 66,
    proSavingsText: "Save RM79/yr",
    businessSavingsText: "Save RM159/yr",
  },
  ID: {
    symbol: "Rp",
    proMonthly: 129000,
    proAnnual: 1289000,
    proMonthlyEq: 107000,
    businessMonthly: 259000,
    businessAnnual: 2589000,
    businessMonthlyEq: 215000,
    proSavingsText: "Save Rp260k/yr",
    businessSavingsText: "Save Rp519k/yr",
  },
  TH: {
    symbol: "฿",
    proMonthly: 299,
    proAnnual: 2990,
    proMonthlyEq: 249,
    businessMonthly: 599,
    businessAnnual: 5990,
    businessMonthlyEq: 499,
    proSavingsText: "Save ฿598/yr",
    businessSavingsText: "Save ฿1,198/yr",
  },
  VN: {
    symbol: "₫",
    proMonthly: 199000,
    proAnnual: 1990000,
    proMonthlyEq: 165000,
    businessMonthly: 399000,
    businessAnnual: 3990000,
    businessMonthlyEq: 333000,
    proSavingsText: "Save ₫398k/yr",
    businessSavingsText: "Save ₫789k/yr",
  },
  JP: {
    symbol: "¥",
    proMonthly: 1200,
    proAnnual: 11900,
    proMonthlyEq: 990,
    businessMonthly: 2400,
    businessAnnual: 23900,
    businessMonthlyEq: 1990,
    proSavingsText: "Save ¥2,500/yr",
    businessSavingsText: "Save ¥4,900/yr",
  },
  KR: {
    symbol: "₩",
    proMonthly: 12000,
    proAnnual: 119000,
    proMonthlyEq: 9900,
    businessMonthly: 24000,
    businessAnnual: 239000,
    businessMonthlyEq: 19900,
    proSavingsText: "Save ₩25,000/yr",
    businessSavingsText: "Save ₩49,000/yr",
  },
  IN: {
    symbol: "₹",
    proMonthly: 499,
    proAnnual: 4999,
    proMonthlyEq: 416,
    businessMonthly: 999,
    businessAnnual: 9999,
    businessMonthlyEq: 833,
    proSavingsText: "Save ₹999/yr",
    businessSavingsText: "Save ₹1,999/yr",
  },
  DE: {
    symbol: "€",
    proMonthly: 9,
    proAnnual: 89,
    proMonthlyEq: 7,
    businessMonthly: 19,
    businessAnnual: 189,
    businessMonthlyEq: 16,
    proSavingsText: "Save €19/yr",
    businessSavingsText: "Save €39/yr",
  },
};

const USD_PRICING: CountryPricing = {
  symbol: "$",
  proMonthly: 9,
  proAnnual: 89,
  proMonthlyEq: 7,
  businessMonthly: 19,
  businessAnnual: 189,
  businessMonthlyEq: 16,
  proSavingsText: "Save $19/yr",
  businessSavingsText: "Save $39/yr",
};

export function getPricingByCurrency(currencySymbol?: string): CountryPricing {
  if (currencySymbol) {
    const match = Object.values(PRICING_BY_COUNTRY).find((p) => p.symbol === currencySymbol);
    if (match) return match;
  }
  return USD_PRICING;
}

export function formatPrice(amount: number, symbol: string): string {
  const isWhole = Number.isInteger(amount);
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}
