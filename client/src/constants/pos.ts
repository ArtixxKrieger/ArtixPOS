

export const DEFAULT_PAYMENT_METHODS: ReadonlyArray<{
  id: string;
  label: string;
  isCash: boolean;
}> = [
  { id: "cash",    label: "Cash",     isCash: true  },
  { id: "card",    label: "Card",     isCash: false },
  { id: "ewallet", label: "E-Wallet", isCash: false },
] as const;

export const CAFE_STYLE_BUSINESS_SUBTYPES = ["cafe", "bakery", "food_truck"] as const;

export const BARCODE_BURST_MS = 100;

export const MIN_BARCODE_LENGTH = 4;

export const GS1_AIM_PREFIXES: ReadonlyArray<string> = [
  "]C1",
  "]C0",
  "]E0",
  "]E1",
  "]E2",
  "]E3",
  "]e0",
  "]d1",
  "]d2",
  "]Q1",
  "]Q3",
  "]I1",
  "]A0",
  "]A1",
  "]F1",
  "]G0",
];
