/**
 * Cat-printer protocol implementation.
 *
 * Used by SC03h-365A and similar "cat / mini label" BLE thermal printers
 * sold on AliExpress/TikTok that use the iPrint / frogtosea app.
 *
 * GATT:
 *   Service:          0000ae30-0000-1000-8000-00805f9b34fb
 *   Write char:       0000ae01-0000-1000-8000-00805f9b34fb  (write-without-response)
 *
 * Packet format:
 *   [0x51] [0x78] [CMD] [0x00] [LEN_L] [LEN_H] [DATA…] [CRC8] [0xFF]
 *
 * Commands:
 *   0xAF  SetEnergy      data = [lo, hi] little-endian  (e.g. 0x04B0 = 1200)
 *   0xA2  PrintRow       data = 48 bytes of 1-bit raster (384 pixels, MSB first)
 *   0xA1  FeedPaper      data = [lines, 0x00]
 */

import type { EscPosReceipt } from "./escpos";

export const CAT_SERVICE  = "0000ae30-0000-1000-8000-00805f9b34fb";
export const CAT_WRITE_CH = "0000ae01-0000-1000-8000-00805f9b34fb";

const CMD_SET_ENERGY = 0xaf;
const CMD_PRINT_ROW  = 0xa2;
const CMD_FEED_PAPER = 0xa1;

const PRINT_WIDTH = 384;          // pixels per row
const BYTES_PER_ROW = PRINT_WIDTH / 8; // 48

function crc8(data: number[]): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function packet(cmd: number, data: number[]): number[] {
  const len = data.length;
  return [
    0x51, 0x78,
    cmd,
    0x00,
    len & 0xff, (len >> 8) & 0xff,
    ...data,
    crc8(data),
    0xff,
  ];
}

/** Render plain-text receipt lines onto an off-screen canvas → 1-bit raster rows */
function textToRasterRows(text: string): number[][] {
  const FONT_SIZE   = 16;  // px
  const LINE_HEIGHT = 20;  // px
  const MARGIN_X    = 6;   // px left/right padding
  const MARGIN_Y    = 6;   // px top padding

  const lines = text.split("\n");
  const height = MARGIN_Y * 2 + lines.length * LINE_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width  = PRINT_WIDTH;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, PRINT_WIDTH, height);
  ctx.fillStyle = "black";
  ctx.font      = `${FONT_SIZE}px "Courier New", monospace`;
  ctx.textBaseline = "top";

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], MARGIN_X, MARGIN_Y + i * LINE_HEIGHT);
  }

  const imgData = ctx.getImageData(0, 0, PRINT_WIDTH, height);
  const rows: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row = new Array<number>(BYTES_PER_ROW).fill(0);
    for (let x = 0; x < PRINT_WIDTH; x++) {
      const idx = (y * PRINT_WIDTH + x) * 4;
      const brightness = (imgData.data[idx] + imgData.data[idx + 1] + imgData.data[idx + 2]) / 3;
      if (brightness < 128) {
        row[Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Build the array of BLE packets to send for the given receipt text.
 * Each element is one complete cat-printer packet — send them one at a time
 * with a ~20ms delay between each.
 */
export function buildCatPrinterPackets(receiptText: string, energy = 1200): number[][] {
  const packets: number[][] = [];

  // 1. Set darkness (energy)
  packets.push(packet(CMD_SET_ENERGY, [energy & 0xff, (energy >> 8) & 0xff]));

  // 2. One packet per raster row
  const rows = textToRasterRows(receiptText);
  for (const row of rows) {
    packets.push(packet(CMD_PRINT_ROW, row));
  }

  // 3. Feed paper at end (48 blank lines so the print exits the head)
  packets.push(packet(CMD_FEED_PAPER, [0x30, 0x00]));

  return packets;
}

/** Test print – no receipt data needed */
export function buildTestCatPrinterPackets(storeName: string): number[][] {
  const width = 32; // chars (works fine for both 58mm and 80mm since we use pixels)
  const dash  = "-".repeat(width);
  const center = (s: string) => {
    const p = Math.max(0, Math.floor((width - s.length) / 2));
    return " ".repeat(p) + s;
  };
  const lines = [
    center(storeName || "ArtixPOS"),
    center("--- Test Print ---"),
    center(new Date().toLocaleString()),
    dash,
    center("Printer is working!"),
    center("BLE connection OK"),
    "",
    center("Thank you"),
  ].join("\n");

  return buildCatPrinterPackets(lines);
}

/** Convert a structured receipt into plain text for canvas rendering */
export function buildReceiptText(r: EscPosReceipt): string {
  const width = r.receiptWidth === "58mm" ? 32 : 42;
  const dash  = "-".repeat(width);
  const fmt   = (n: number) => `${r.currency}${n.toFixed(2)}`;

  const center = (s: string) => {
    const p = Math.max(0, Math.floor((width - s.length) / 2));
    return " ".repeat(p) + s;
  };

  const twoCol = (left: string, right: string) => {
    const maxLeft = width - right.length - 1;
    const l       = left.length > maxLeft ? left.slice(0, maxLeft - 1) + "…" : left;
    const spaces  = Math.max(1, width - l.length - right.length);
    return l + " ".repeat(spaces) + right;
  };

  const out: string[] = [];

  if (r.storeName)               out.push(center(r.storeName));
  if (r.headerText)              out.push(center(r.headerText));
  if (r.receiptTitle)            out.push(center(r.receiptTitle));
  if (r.dateStr)                 out.push(center(r.dateStr));
  if (r.showAddress  && r.address)       out.push(center(r.address));
  if (r.showPhone    && r.phone)         out.push(center(`Tel: ${r.phone}`));
  if (r.showEmail    && r.email)         out.push(center(r.email));
  if (r.showWebsite  && r.website)       out.push(center(r.website));
  if (r.customerName)            out.push(center(`Customer: ${r.customerName}`));

  if ((r.showOrderNumber && r.orderNumber) || (r.showCashier && r.cashierName)) {
    out.push("");
    if (r.showOrderNumber && r.orderNumber) out.push(twoCol(`Order #${r.orderNumber}`, ""));
    if (r.showCashier && r.cashierName)     out.push(twoCol("Cashier", r.cashierName));
  }

  out.push(dash);

  for (const item of r.items) {
    const label = item.sizeName
      ? `${item.name} (${item.sizeName}) x${item.qty}`
      : `${item.name} x${item.qty}`;
    const price = fmt(item.unitPrice * item.qty);
    out.push(twoCol(label, price));
    if (r.showUnitPrice && item.unitPrice > 0) {
      out.push(`  ${fmt(item.unitPrice)} x ${item.qty}`);
    }
    if (item.modifiers?.length) {
      out.push(`  + ${item.modifiers.map(m => m.name).join(", ")}`);
    }
    if (item.note) out.push(`  Note: ${item.note}`);
  }

  out.push(dash);

  out.push(twoCol("Subtotal", fmt(r.subtotal)));
  if (r.discount > 0) {
    const label = r.discountCode ? `Discount (${r.discountCode})` : "Discount";
    out.push(twoCol(label, `-${fmt(r.discount)}`));
  }
  if (r.tax > 0)   out.push(twoCol("Tax", fmt(r.tax)));
  if (r.loyaltyDiscount && r.loyaltyDiscount > 0) {
    out.push(twoCol("Loyalty Redemption", `-${fmt(r.loyaltyDiscount)}`));
  }

  out.push(dash);
  out.push(twoCol("TOTAL", fmt(r.total)));
  out.push(twoCol(`Payment (${r.paymentMethod.toUpperCase()})`, fmt(r.paymentAmount)));
  if (r.paymentMethod === "cash" && r.changeAmount > 0) {
    out.push(twoCol("Change", fmt(r.changeAmount)));
  }

  if (r.loyaltyPointsEarned && r.loyaltyPointsEarned > 0) {
    out.push("");
    out.push(center(`+${r.loyaltyPointsEarned} loyalty points earned`));
  }

  if (r.receiptFooter) {
    out.push(dash);
    out.push(center(r.receiptFooter));
  }

  out.push("");
  out.push(center("Thank you!"));
  if (r.showPoweredBy) out.push(center("Powered by ArtixPOS"));

  return out.join("\n");
}
