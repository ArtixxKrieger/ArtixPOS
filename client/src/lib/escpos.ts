const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const enc = new TextEncoder();

function bytes(...vals: number[]): number[] {
  return vals;
}

function text(str: string): number[] {
  return Array.from(enc.encode(str));
}

function pad(str: string, len: number): string {
  return str.slice(0, len).padEnd(len);
}

function rpad(str: string, len: number): string {
  return str.slice(0, len).padStart(len);
}

function row(left: string, right: string, width: number): number[] {
  const available = width - right.length;
  const l = pad(left, Math.max(1, available));
  return text(l + rpad(right, right.length) + "\n");
}

function center(str: string, width: number): number[] {
  const len = str.length;
  if (len >= width) return text(str.slice(0, width) + "\n");
  const pad2 = Math.floor((width - len) / 2);
  return text(" ".repeat(pad2) + str + "\n");
}

function dashes(width: number): number[] {
  return text("-".repeat(width) + "\n");
}

function line(): number[] {
  return bytes(LF);
}

export interface EscPosReceipt {
  storeName?: string;
  headerText?: string;
  receiptTitle?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  showAddress?: boolean;
  showPhone?: boolean;
  showEmail?: boolean;
  showWebsite?: boolean;
  showOrderNumber?: boolean;
  showCashier?: boolean;
  showUnitPrice?: boolean;
  showPoweredBy?: boolean;
  orderNumber?: number | null;
  cashierName?: string;
  dateStr?: string;
  customerName?: string;
  items: Array<{
    name: string;
    sizeName?: string;
    qty: number;
    unitPrice: number;
    modifiers?: Array<{ name: string; price: string }>;
    note?: string;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  discountCode?: string | null;
  loyaltyDiscount?: number;
  loyaltyPointsEarned?: number;
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  changeAmount: number;
  currency: string;
  receiptFooter?: string;
  receiptWidth?: string;
}

function fmt(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}

export function buildReceiptEscPos(r: EscPosReceipt): Uint8Array {
  const width = r.receiptWidth === "58mm" ? 32 : 42;
  const out: number[] = [];

  const push = (...chunks: number[][]) => {
    for (const c of chunks) out.push(...c);
  };

  push(
    bytes(ESC, 0x40),
    bytes(ESC, 0x61, 0x01),
  );

  if (r.storeName) push(bytes(ESC, 0x45, 1), center(r.storeName, width), bytes(ESC, 0x45, 0));
  if (r.headerText) push(center(r.headerText, width));
  if (r.receiptTitle) push(center(r.receiptTitle, width));
  if (r.dateStr) push(center(r.dateStr, width));
  if (r.showAddress && r.address) push(center(r.address, width));
  if (r.showPhone && r.phone) push(center(`Tel: ${r.phone}`, width));
  if (r.showEmail && r.email) push(center(r.email, width));
  if (r.showWebsite && r.website) push(center(r.website, width));
  if (r.customerName) push(center(`Customer: ${r.customerName}`, width));

  push(bytes(ESC, 0x61, 0x00));

  if ((r.showOrderNumber && r.orderNumber) || (r.showCashier && r.cashierName)) {
    push(line());
    if (r.showOrderNumber && r.orderNumber) push(row(`Order #${r.orderNumber}`, "", width));
    if (r.showCashier && r.cashierName) push(row("Cashier", r.cashierName, width));
  }

  push(dashes(width));

  for (const item of r.items) {
    const label = item.sizeName ? `${item.name} (${item.sizeName}) x${item.qty}` : `${item.name} x${item.qty}`;
    const price = fmt(item.unitPrice * item.qty, r.currency);
    push(row(label, price, width));
    if (r.showUnitPrice && item.unitPrice > 0) {
      push(text(`  ${fmt(item.unitPrice, r.currency)} x ${item.qty}\n`));
    }
    if (item.modifiers && item.modifiers.length > 0) {
      push(text(`  + ${item.modifiers.map(m => m.name).join(", ")}\n`));
    }
    if (item.note) push(text(`  Note: ${item.note}\n`));
  }

  push(dashes(width));

  push(row("Subtotal", fmt(r.subtotal, r.currency), width));
  if (r.discount > 0) {
    const label = r.discountCode ? `Discount (${r.discountCode})` : "Discount";
    push(row(label, `-${fmt(r.discount, r.currency)}`, width));
  }
  if (r.tax > 0) push(row("Tax", fmt(r.tax, r.currency), width));
  if (r.loyaltyDiscount && r.loyaltyDiscount > 0) {
    push(row("Loyalty Redemption", `-${fmt(r.loyaltyDiscount, r.currency)}`, width));
  }

  push(dashes(width));
  push(bytes(ESC, 0x45, 1));
  push(row("TOTAL", fmt(r.total, r.currency), width));
  push(bytes(ESC, 0x45, 0));

  push(row(`Payment (${r.paymentMethod.toUpperCase()})`, fmt(r.paymentAmount, r.currency), width));
  if (r.paymentMethod === "cash" && r.changeAmount > 0) {
    push(row("Change", fmt(r.changeAmount, r.currency), width));
  }

  if (r.loyaltyPointsEarned && r.loyaltyPointsEarned > 0) {
    push(line());
    push(bytes(ESC, 0x61, 0x01));
    push(text(`+${r.loyaltyPointsEarned} loyalty points earned\n`));
    push(bytes(ESC, 0x61, 0x00));
  }

  if (r.receiptFooter) {
    push(dashes(width));
    push(bytes(ESC, 0x61, 0x01));
    push(text(r.receiptFooter + "\n"));
    push(bytes(ESC, 0x61, 0x00));
  }

  push(line());
  push(bytes(ESC, 0x61, 0x01));
  push(text("Thank you!\n"));
  if (r.showPoweredBy) push(text("Powered by ArtixPOS\n"));
  push(bytes(ESC, 0x61, 0x00));

  push(bytes(LF, LF, LF));
  push(bytes(GS, 0x56, 0x42, 0x00));

  return new Uint8Array(out);
}

export function buildTestPrintEscPos(storeName: string, receiptWidth?: string): Uint8Array {
  const width = receiptWidth === "58mm" ? 32 : 42;
  const out: number[] = [];
  const push = (...chunks: number[][]) => { for (const c of chunks) out.push(...c); };

  const now = new Date().toLocaleString();
  push(
    bytes(ESC, 0x40),
    bytes(ESC, 0x61, 0x01),
    bytes(ESC, 0x45, 1), center(storeName || "ArtixPOS", width), bytes(ESC, 0x45, 0),
    center("--- Test Print ---", width),
    center(now, width),
    dashes(width),
    center("Printer is working correctly!", width),
    bytes(LF, LF, LF),
    bytes(GS, 0x56, 0x42, 0x00),
  );
  return new Uint8Array(out);
}
