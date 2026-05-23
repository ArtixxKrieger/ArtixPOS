import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { Printer } from "lucide-react";
import { format } from "date-fns";
import { useSettings } from "@/hooks/use-settings";
import { useBlePrinter } from "@/lib/ble-printer-context";
import { buildReceiptEscPos } from "@/lib/escpos";
import { buildReceiptText, catCharsPerLine } from "@/lib/catprinter";
import { useToast } from "@/hooks/use-toast";
import { type UserSetting } from "@shared/schema";

interface ReceiptItem {
  product: { name: string; price?: string | number };
  quantity: number;
  size?: { name: string; price: string };
  modifiers?: { name: string; price: string }[];
  note?: string;
}

export interface ReceiptData {
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  taxRate?: number;
  discount: number;
  loyaltyDiscount: number;
  tip?: number;
  total: number;
  paymentMethod: string;
  paymentAmount: number;
  changeAmount: number;
  customerName?: string;
  storeName?: string;
  receiptFooter?: string;
  currency: string;
  discountCode?: string | null;
  loyaltyPointsEarned?: number;
  orderNumber?: number | null;
  cashierName?: string;
  wifiVoucher?: { code: string; durationMinutes: number; ssid?: string; password?: string };
  // BIR Compliance
  orNumber?: string;
  discountType?: "regular" | "sc" | "pwd";
  scPwdId?: string;
  vatableSales?: number;
  vatExemptSales?: number;
  zeroRatedSales?: number;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}

function buildReceiptHtml(
  printableId: string,
  settings: Partial<UserSetting> | null | undefined,
): string | null {
  const el = document.getElementById(printableId);
  if (!el) return null;
  const paperMm = (settings?.receiptWidth ?? "58mm") === "58mm" ? "58mm" : "80mm";
  const fs = settings?.receiptFontSize ?? 25;
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      @page { size: ${paperMm} auto; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { font-family: 'Courier New', 'Lucida Console', monospace; font-size: ${fs}px; font-weight: 600; color: #000; background: #fff; width: ${paperMm}; padding: 3mm 2mm 8mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .center { text-align: center; }
      .bold { font-weight: 800; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; }
      .item-name { flex: 1; margin-right: 8px; }
      .total-row { font-weight: 800; font-size: ${fs + 2}px; }
      .footer { text-align: center; margin-top: 8px; font-size: ${fs - 2}px; }
      .muted { color: #555; }
      .small { font-size: ${fs - 2}px; }
      .green { color: #16a34a; }
    </style>
  </head>
  <body>
    ${el.innerHTML}
    <script>window.onload = function() { window.print(); window.close(); }<\/script>
  </body>
</html>`;
}

export function ReceiptModal({ open, onClose, receipt }: ReceiptModalProps) {
  const { data: settings } = useSettings();
  const { printer, print } = useBlePrinter();
  const { toast } = useToast();

  if (!receipt) return null;

  const s: Partial<UserSetting> = settings ?? {};
  const { currency } = receipt;
  const now = new Date();

  const receiptWidth = s.receiptWidth ?? "58mm";
  const printDarkness = s.printDarkness ?? 65535;
  const receiptFontSize = 25;
  const receiptTitle = s.receiptTitle ?? "OFFICIAL RECEIPT";
  const receiptHeaderText = s.receiptHeaderText ?? "";
  const receiptWebsite = s.receiptWebsite ?? "";
  const showAddress = (s.receiptShowAddress ?? 1) === 1;
  const showPhone = (s.receiptShowPhone ?? 1) === 1;
  const showEmail = (s.receiptShowEmail ?? 0) === 1;
  const showWebsite = (s.receiptShowWebsite ?? 0) === 1;
  const showOrderNumber = (s.receiptShowOrderNumber ?? 1) === 1;
  const showCashier = (s.receiptShowCashier ?? 0) === 1;
  const showUnitPrice = (s.receiptShowUnitPrice ?? 0) === 1;
  const showPoweredBy = true;

  const storeAddress = s.address ?? "";
  const storePhone = s.phone ?? "";
  const storeEmail = s.emailContact ?? "";

  // BIR compliance fields from settings
  const storeTin = s.tin ?? "";
  const ptuNumber = s.ptuNumber ?? "";
  const accreditationNumber = s.accreditationNumber ?? "";
  const machineSerialNumber = s.machineSerialNumber ?? "";
  const vatRegistered = (s.vatRegistered ?? 1) === 1;
  const taxRate = parseFloat(s.taxRate ?? "12") || 12;

  // BIR receipt fields
  const isScPwd = receipt.discountType === "sc" || receipt.discountType === "pwd";
  const vatableSales = receipt.vatableSales ?? (isScPwd ? 0 : receipt.subtotal - receipt.discount);
  const vatExemptSales = receipt.vatExemptSales ?? (isScPwd ? receipt.subtotal - receipt.discount : 0);
  const zeroRatedSales = receipt.zeroRatedSales ?? 0;

  const isCash = receipt.paymentMethod === "cash";
  const hasDiscount = receipt.discount > 0;

  const hasTip = (receipt.tip ?? 0) > 0;

  const handlePrint = () => {
    if (printer.connected) {
      // Close immediately so cashier can start next sale
      onClose();
      const receiptData = {
        storeName: receipt.storeName ?? s.storeName ?? "",
        headerText: receiptHeaderText,
        receiptTitle,
        address: storeAddress,
        phone: storePhone,
        email: storeEmail,
        website: receiptWebsite,
        showAddress,
        showPhone,
        showEmail,
        showWebsite,
        showOrderNumber,
        showCashier,
        showUnitPrice,
        showPoweredBy,
        orderNumber: receipt.orderNumber,
        cashierName: receipt.cashierName,
        dateStr: format(now, "MMM d, yyyy h:mm a"),
        customerName: receipt.customerName,
        // BIR compliance fields
        tin: storeTin || undefined,
        ptuNumber: ptuNumber || undefined,
        accreditationNumber: accreditationNumber || undefined,
        machineSerialNumber: machineSerialNumber || undefined,
        orNumber: receipt.orNumber,
        vatRegistered: !!(s.vatRegistered),
        vatableSales,
        vatExemptSales,
        zeroRatedSales,
        discountType: receipt.discountType,
        scPwdId: receipt.scPwdId,
        items: receipt.items.map(item => ({
          name: item.product.name,
          sizeName: item.size?.name,
          qty: item.quantity,
          unitPrice:
            parseFloat(item.size?.price || String(item.product.price ?? "0") || "0") +
            (item.modifiers || []).reduce((acc, m) => acc + parseFloat(m.price || "0"), 0),
          modifiers: item.modifiers,
          note: item.note,
        })),
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        taxRate: receipt.taxRate,
        discount: receipt.discount,
        discountCode: receipt.discountCode,
        loyaltyDiscount: receipt.loyaltyDiscount,
        loyaltyPointsEarned: receipt.loyaltyPointsEarned,
        total: receipt.total,
        paymentMethod: receipt.paymentMethod,
        paymentAmount: receipt.paymentAmount,
        changeAmount: receipt.changeAmount,
        currency,
        receiptFooter: receipt.receiptFooter,
        receiptWidth,
      };
      // Compute chars-per-line to match the requested font size on the cat printer
      const charsPerLine = catCharsPerLine(receiptFontSize);
      // Fire in background — don't block the UI
      print({
        escpos: buildReceiptEscPos(receiptData),
        catText: buildReceiptText(receiptData, charsPerLine) + "\n\n",
        energy: printDarkness,
        catReceiptWidth: receiptWidth,
        catFontSize: receiptFontSize,
      }).then(result => {
        if (result.ok) {
          toast({ title: "Receipt printed", description: `Sent to ${printer.name}` });
        } else {
          toast({ title: "Print failed", description: result.error, variant: "destructive" });
        }
      });
    } else {
      const fs = receiptFontSize;
      const fmt = (n: number) => formatCurrency(n, currency);
      const dateStr = format(now, "MMM d, yyyy h:mm a");

      const itemsHtml = receipt.items.map(item => {
        const basePrice = parseFloat(item.size?.price || String(item.product.price ?? "0") || "0");
        const modsTotal = (item.modifiers || []).reduce((acc, m) => acc + parseFloat(m.price || "0"), 0);
        const unitPrice = basePrice + modsTotal;
        const lineTotal = unitPrice * item.quantity;
        return `
          <div class="row">
            <span class="item-name">${item.product.name}${item.size ? ` (${item.size.name})` : ""} x${item.quantity}</span>
            <span class="price">${fmt(lineTotal)}</span>
          </div>
          ${showUnitPrice && unitPrice > 0 ? `<div class="muted" style="padding-left:12px">${fmt(unitPrice)} × ${item.quantity}</div>` : ""}
          ${item.modifiers && item.modifiers.length > 0 ? `<div class="muted" style="padding-left:12px">+ ${item.modifiers.map(m => m.name).join(", ")}</div>` : ""}
          ${item.note ? `<div class="muted" style="padding-left:12px;font-style:italic">Note: ${item.note}</div>` : ""}
        `;
      }).join("");

      const paperWidth = receiptWidth === "58mm" ? "58mm" : "80mm";
      const printHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Receipt</title>
    <meta charset="utf-8" />
    <style>
      /* ── Critical for plug-and-play thermal printers ──────────────────────
         Without @page, the browser injects its own margins (~20mm) which
         causes content to overflow or get cut off on 58mm / 80mm paper.
         "size: Xmm auto" tells the browser (and OS print driver) the exact
         paper width; "auto" height lets the receipt grow as long as needed. */
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        font-family: 'Courier New', 'Lucida Console', monospace;
        font-size: ${fs}px;
        font-weight: 900;
        color: #000;
        background: #fff;
        /* Use physical mm width so it maps 1-to-1 onto the paper */
        width: ${paperWidth};
        /* Tiny side padding so text isn't flush against the cutter rail */
        padding: 3mm 2mm 8mm 2mm;
        /* Force black ink — no gray, no color */
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .center { text-align: center; }
      .bold { font-weight: 900; }
      .line { border-top: 2px solid #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin: 2px 0; }
      .item-name { flex: 1; min-width: 0; word-break: break-word; font-weight: 900; }
      .price { flex-shrink: 0; white-space: nowrap; }
      .total-row { font-weight: 900; font-size: ${fs + 2}px; }
      .muted { color: #000; font-size: ${fs - 2}px; }
      .green { color: #000; font-weight: 900; }
      .footer { text-align: center; color: #000; }
    </style>
  </head>
  <body>
    <div class="center">
      ${receipt.storeName ? `<p class="bold" style="font-size:${fs + 2}px">${receipt.storeName}</p>` : ""}
      ${receiptHeaderText ? `<p class="muted">${receiptHeaderText}</p>` : ""}
      ${receiptTitle ? `<p style="font-size:${fs - 1}px;font-weight:700">${receiptTitle}</p>` : ""}
      <p class="muted">${dateStr}</p>
      ${showAddress && storeAddress ? `<p class="muted">${storeAddress}</p>` : ""}
      ${showPhone && storePhone ? `<p class="muted">Tel: ${storePhone}</p>` : ""}
      ${showEmail && storeEmail ? `<p class="muted">${storeEmail}</p>` : ""}
      ${storeTin ? `<p class="muted" style="font-size:${fs - 3}px">VAT Reg. TIN: ${storeTin}</p>` : ""}
      ${ptuNumber ? `<p class="muted" style="font-size:${fs - 3}px">PTU No.: ${ptuNumber}</p>` : ""}
      ${accreditationNumber ? `<p class="muted" style="font-size:${fs - 3}px">Accreditation No.: ${accreditationNumber}</p>` : ""}
      ${machineSerialNumber ? `<p class="muted" style="font-size:${fs - 3}px">Machine S/N: ${machineSerialNumber}</p>` : ""}
      ${receipt.customerName ? `<p class="muted">Customer: ${receipt.customerName}</p>` : ""}
    </div>
    ${receipt.orNumber ? `<div class="row muted" style="margin-bottom:2px;font-size:${fs - 2}px"><span>O.R. No.</span><span>${receipt.orNumber}</span></div>` : ""}
    ${showOrderNumber && receipt.orderNumber ? `<div class="row muted" style="margin-bottom:4px"><span>Order #</span><span>${receipt.orderNumber}</span></div>` : ""}
    ${showCashier && receipt.cashierName ? `<div class="row muted" style="margin-bottom:4px"><span>Cashier</span><span>${receipt.cashierName}</span></div>` : ""}
    <div class="line"></div>
    ${itemsHtml}
    <div class="line"></div>
    ${isScPwd ? `<p class="bold" style="text-align:center;font-size:${fs - 1}px;letter-spacing:0.5px">** SC/PWD DISCOUNT APPLIED **</p>` : ""}
    <div class="row muted"><span>Subtotal</span><span class="price">${fmt(receipt.subtotal)}</span></div>
    ${hasDiscount && isScPwd ? `<div class="row" style="color:#000;font-size:${fs - 1}px"><span>${receipt.discountType === "sc" ? "SC" : "PWD"} Discount (20%)</span><span class="price">-${fmt(receipt.discount)}</span></div>` : ""}
    ${hasDiscount && !isScPwd ? `<div class="row" style="color:#000;font-size:${fs - 1}px"><span>Discount${receipt.discountCode ? ` (${receipt.discountCode})` : ""}</span><span class="price">-${fmt(receipt.discount)}</span></div>` : ""}
    ${hasTip ? `<div class="row muted"><span>Tip</span><span class="price">${fmt(receipt.tip ?? 0)}</span></div>` : ""}
    <div class="line"></div>
    ${vatRegistered ? `
    <div class="row muted" style="font-size:${fs - 2}px"><span>VATable Sales</span><span class="price">${fmt(vatableSales)}</span></div>
    <div class="row muted" style="font-size:${fs - 2}px"><span>VAT Amount (${taxRate}%)</span><span class="price">${fmt(receipt.tax)}</span></div>
    ${vatExemptSales > 0 ? `<div class="row muted" style="font-size:${fs - 2}px"><span>VAT-Exempt Sales</span><span class="price">${fmt(vatExemptSales)}</span></div>` : ""}
    ${zeroRatedSales > 0 ? `<div class="row muted" style="font-size:${fs - 2}px"><span>Zero-Rated Sales</span><span class="price">${fmt(zeroRatedSales)}</span></div>` : ""}
    <div class="line"></div>
    ` : ""}
    ${isScPwd || !vatRegistered ? `<p class="muted" style="text-align:center;font-size:${fs - 4}px;margin-bottom:2px">THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX</p>` : ""}
    <div class="row total-row"><span>TOTAL DUE</span><span class="price">${fmt(receipt.total)}</span></div>
    <div class="row muted"><span>Payment (${receipt.paymentMethod.toUpperCase()})</span><span class="price">${fmt(receipt.paymentAmount)}</span></div>
    ${isCash && receipt.changeAmount > 0 ? `<div class="row green"><span>Change</span><span class="price">${fmt(receipt.changeAmount)}</span></div>` : ""}
    ${isScPwd && receipt.scPwdId ? `<div class="row muted" style="font-size:${fs - 2}px;margin-top:4px"><span>${receipt.discountType === "sc" ? "SC" : "PWD"} ID No.</span><span>${receipt.scPwdId}</span></div>` : ""}
    ${receipt.wifiVoucher ? `<div class="line"></div>
      <p class="center bold">FREE WIFI VOUCHER</p>
      ${receipt.wifiVoucher.ssid ? `<div class="row muted"><span>Network</span><span>${receipt.wifiVoucher.ssid}</span></div>` : ""}
      ${receipt.wifiVoucher.password ? `<div class="row muted"><span>Password</span><span>${receipt.wifiVoucher.password}</span></div>` : ""}
      <div class="row"><span>Code</span><span class="bold">${receipt.wifiVoucher.code}</span></div>
      <p class="center muted">Valid for ${receipt.wifiVoucher.durationMinutes} min after first use</p>
    ` : ""}
    ${receipt.receiptFooter ? `<div class="line"></div><p class="footer">${receipt.receiptFooter}</p>` : ""}
    <p class="center" style="color:#000;margin-top:6px">Thank you!</p>
    <p class="center" style="color:#000;font-size:${fs - 3}px;margin-top:2px">Powered by ArtixPOS</p>
    <script>window.onload = function() { window.print(); window.close(); }<\/script>
  </body>
</html>`;

      onClose();
      // Window width is just a preview hint — actual paper width is set via
      // @page CSS. 240px ≈ 58mm at 96dpi; 340px ≈ 80mm.
      const winWidth = receiptWidth === "58mm" ? 260 : 340;
      const win = window.open("", "_blank", `width=${winWidth},height=700`);
      if (!win) { toast({ title: "Allow pop-ups to print receipts", variant: "destructive" }); return; }
      win.document.write(printHtml);
      win.document.close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] sm:w-full rounded-3xl p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-bold">Receipt</DialogTitle>
        </DialogHeader>

        <div className="px-5 overflow-y-auto scrollbar-hide flex-1 min-h-0">
          <div id="receipt-printable" className="font-mono space-y-1 text-[13px]">
            <div className="center text-center mb-3">
              {receipt.storeName && (
                <p className="bold font-bold text-[14px]">{receipt.storeName}</p>
              )}
              {receiptHeaderText && (
                <p className="text-muted-foreground text-[11px]">{receiptHeaderText}</p>
              )}
              {receiptTitle && (
                <p className="font-semibold text-muted-foreground mt-0.5 text-[11px]">{receiptTitle}</p>
              )}
              <p className="text-muted-foreground mt-0.5 text-[11px]">{format(now, "MMM d, yyyy h:mm a")}</p>
              {showAddress && storeAddress && (
                <p className="text-muted-foreground text-[11px]">{storeAddress}</p>
              )}
              {showPhone && storePhone && (
                <p className="text-muted-foreground text-[11px]">Tel: {storePhone}</p>
              )}
              {showEmail && storeEmail && (
                <p className="text-muted-foreground text-[11px]">{storeEmail}</p>
              )}
              {showWebsite && receiptWebsite && (
                <p className="text-muted-foreground text-[11px]">{receiptWebsite}</p>
              )}
              {storeTin && (
                <p className="text-muted-foreground text-[10px]">VAT Reg. TIN: {storeTin}</p>
              )}
              {ptuNumber && (
                <p className="text-muted-foreground text-[10px]">PTU No.: {ptuNumber}</p>
              )}
              {accreditationNumber && (
                <p className="text-muted-foreground text-[10px]">Accreditation No.: {accreditationNumber}</p>
              )}
              {machineSerialNumber && (
                <p className="text-muted-foreground text-[10px]">Machine S/N: {machineSerialNumber}</p>
              )}
              {receipt.customerName && (
                <p className="mt-0.5 text-[11px]">Customer: {receipt.customerName}</p>
              )}
            </div>

            <div className="space-y-0.5 mb-1">
              {receipt.orNumber && (
                <div className="flex justify-between text-muted-foreground text-[11px]" data-testid="text-or-number">
                  <span>O.R. No.</span>
                  <span className="tabular-nums font-semibold">{receipt.orNumber}</span>
                </div>
              )}
              {showOrderNumber && receipt.orderNumber && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Order #</span>
                  <span className="tabular-nums">{receipt.orderNumber}</span>
                </div>
              )}
              {showCashier && receipt.cashierName && (
                <div className="flex justify-between text-muted-foreground text-[11px]">
                  <span>Cashier</span>
                  <span>{receipt.cashierName}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-border/60 my-2" />

            <div className="space-y-1.5">
              {receipt.items.map((item, i) => {
                const basePrice = parseFloat(item.size?.price || String(item.product.price ?? "0") || "0");
                const modsTotal = (item.modifiers || []).reduce((s, m) => s + parseFloat(m.price || "0"), 0);
                const unitPrice = basePrice + modsTotal;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-[13px]">
                      <span className="flex-1 mr-2 font-medium">
                        {item.product.name}
                        {item.size && <span className="text-muted-foreground"> ({item.size.name})</span>}
                        {" "}x{item.quantity}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(unitPrice * item.quantity, currency)}
                      </span>
                    </div>
                    {showUnitPrice && unitPrice > 0 && (
                      <div className="unit-price pl-3 text-muted-foreground text-[11px]">
                        {formatCurrency(unitPrice, currency)} × {item.quantity}
                      </div>
                    )}
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="pl-3 text-muted-foreground text-[11px]">
                        {item.modifiers.map(m => `+ ${m.name}`).join(", ")}
                      </div>
                    )}
                    {item.note && (
                      <div className="pl-3 text-muted-foreground italic text-[11px]">Note: {item.note}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-dashed border-border/60 my-2" />

            {isScPwd && (
              <div className="text-center py-1">
                <span className="text-[10px] font-bold tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded px-2 py-0.5">
                  ** {receipt.discountType === "sc" ? "SENIOR CITIZEN" : "PWD"} DISCOUNT APPLIED **
                </span>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between text-muted-foreground text-[12px]">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(receipt.subtotal, currency)}</span>
              </div>
              {hasDiscount && isScPwd && (
                <div className="flex justify-between text-rose-500 text-[12px]">
                  <span>{receipt.discountType === "sc" ? "SC" : "PWD"} Discount (20%)</span>
                  <span className="tabular-nums">-{formatCurrency(receipt.discount, currency)}</span>
                </div>
              )}
              {hasDiscount && !isScPwd && (
                <div className="flex justify-between text-rose-500 text-[12px]">
                  <span>Discount {receipt.discountCode ? `(${receipt.discountCode})` : ""}</span>
                  <span className="tabular-nums">-{formatCurrency(receipt.discount, currency)}</span>
                </div>
              )}
              {hasTip && (
                <div className="flex justify-between text-muted-foreground text-[12px]">
                  <span>Tip</span>
                  <span className="tabular-nums" data-testid="text-receipt-tip">{formatCurrency(receipt.tip ?? 0, currency)}</span>
                </div>
              )}
              {vatRegistered && (
                <div className="border-t border-dashed border-border/40 pt-1 space-y-0.5">
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>VATable Sales</span>
                    <span className="tabular-nums">{formatCurrency(vatableSales, currency)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>VAT Amount ({taxRate}%)</span>
                    <span className="tabular-nums">{formatCurrency(receipt.tax, currency)}</span>
                  </div>
                  {vatExemptSales > 0 && (
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>VAT-Exempt Sales</span>
                      <span className="tabular-nums">{formatCurrency(vatExemptSales, currency)}</span>
                    </div>
                  )}
                  {zeroRatedSales > 0 && (
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Zero-Rated Sales</span>
                      <span className="tabular-nums">{formatCurrency(zeroRatedSales, currency)}</span>
                    </div>
                  )}
                </div>
              )}
              {(isScPwd || !vatRegistered) && (
                <p className="text-center text-muted-foreground text-[9px] py-1 border-t border-dashed border-border/40">
                  THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX
                </p>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-dashed border-border/60 text-[14px]">
                <span>TOTAL DUE</span>
                <span className="tabular-nums">{formatCurrency(receipt.total, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-[12px]">
                <span>Payment ({receipt.paymentMethod.toUpperCase()})</span>
                <span className="tabular-nums">{formatCurrency(receipt.paymentAmount, currency)}</span>
              </div>
              {isCash && receipt.changeAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold green text-[12px]">
                  <span>Change</span>
                  <span className="tabular-nums">{formatCurrency(receipt.changeAmount, currency)}</span>
                </div>
              )}
              {isScPwd && receipt.scPwdId && (
                <div className="flex justify-between text-muted-foreground text-[11px] pt-1 border-t border-dashed border-border/40">
                  <span>{receipt.discountType === "sc" ? "SC" : "PWD"} ID No.</span>
                  <span className="font-semibold">{receipt.scPwdId}</span>
                </div>
              )}
            </div>

            {receipt.wifiVoucher && (
              <div className="mt-3 rounded-lg border border-dashed border-border/60 p-3" data-testid="block-wifi-voucher">
                <p className="text-center font-bold text-[12px]">FREE WIFI VOUCHER</p>
                {receipt.wifiVoucher.ssid && (
                  <div className="flex justify-between text-muted-foreground text-[11px] mt-1">
                    <span>Network</span><span>{receipt.wifiVoucher.ssid}</span>
                  </div>
                )}
                {receipt.wifiVoucher.password && (
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Password</span><span>{receipt.wifiVoucher.password}</span>
                  </div>
                )}
                <div className="flex justify-between text-[12px] mt-1">
                  <span>Code</span>
                  <span className="font-bold tracking-wider" data-testid="text-wifi-code">{receipt.wifiVoucher.code}</span>
                </div>
                <p className="text-center text-muted-foreground text-[10px] mt-1">
                  Valid for {receipt.wifiVoucher.durationMinutes} min after first use
                </p>
              </div>
            )}

            {receipt.receiptFooter && (
              <>
                <div className="border-t border-dashed border-border/60 my-2" />
                <p className="footer text-center text-muted-foreground text-[11px]">{receipt.receiptFooter}</p>
              </>
            )}
            <p className="text-center text-muted-foreground/50 mt-3 text-[11px]">Thank you!</p>
            {showPoweredBy && (
              <p className="text-center text-muted-foreground/30 mt-1 pb-4 text-[10px]">Powered by ArtixPOS</p>
            )}
          </div>
        </div>

        {printer.name && (
          <div className="px-5 pb-1 shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {printer.connected ? `Ready — ${printer.name}` : `Reconnecting to ${printer.name}…`}
              </p>
            </div>
          </div>
        )}

        <div
          className="px-5 pt-2 flex gap-2 shrink-0"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 12px, 20px)" }}
        >
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-10"
            onClick={onClose}
            data-testid="button-close-receipt"
          >
            Close
          </Button>
          <Button
            className="flex-1 rounded-xl h-10 font-bold"
            onClick={handlePrint}
            data-testid="button-print-receipt"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
