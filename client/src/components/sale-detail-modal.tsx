import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Receipt, CreditCard, Smartphone, Hash, Tag, FileText, RotateCcw, UserCircle2, ShieldCheck, Printer, Ban, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-admin";
import { useBlePrinter } from "@/lib/ble-printer-context";
import { buildReceiptEscPos } from "@/lib/escpos";
import { buildReceiptText, catCharsPerLine } from "@/lib/catprinter";
import { useDeleteSale } from "@/hooks/use-sales";
import { type UserSetting } from "@shared/schema";

type SaleItem = {
  cartId?: string;
  product?: { name?: string; price?: string | number };
  quantity?: number;
  size?: { name?: string; price?: string | number };
  modifiers?: { name?: string; price?: string | number }[];
  note?: string;
};

type Sale = {
  id?: number | null;
  items?: SaleItem[] | unknown;
  subtotal?: string | number | null;
  tax?: string | number | null;
  discount?: string | number | null;
  discountCode?: string | null;
  total?: string | number | null;
  paymentMethod?: string | null;
  paymentAmount?: string | number | null;
  changeAmount?: string | number | null;
  notes?: string | null;
  createdAt?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  refundedAt?: string | null;
  refundedBy?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  voidReason?: string | null;
  receiptNumber?: string | null;
  orNumber?: string | null;
  invoiceNumber?: string | null;
};

interface SaleDetailModalProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash:    <CreditCard className="h-3 w-3" />,
  card:    <CreditCard className="h-3 w-3" />,
  online:  <Smartphone className="h-3 w-3" />,
  ewallet: <Smartphone className="h-3 w-3" />,
  gcash:   <Smartphone className="h-3 w-3" />,
  maya:    <Smartphone className="h-3 w-3" />,
  paymaya: <Smartphone className="h-3 w-3" />,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash:    "Cash",
  card:    "Card",
  online:  "Online",
  ewallet: "E-Wallet",
  gcash:   "E-Wallet",
  maya:    "E-Wallet",
  paymaya: "E-Wallet",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash:    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  card:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  online:  "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ewallet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  gcash:   "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  maya:    "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  paymaya: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

export function SaleDetailModal({ sale, open, onClose }: SaleDetailModalProps) {
  const { data: settings, isLoading: _settingsLoading } = useSettings();
  const currency = settings?.currency || "₱";
  const { toast } = useToast();
  const { isManagerOrAbove } = useAuth();
  const { data: perms, isLoading: permsLoading } = useMyPermissions();
  const { printer: blePrinter, print: blePrint } = useBlePrinter();
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const canRefund = isManagerOrAbove && perms?.canRefund !== false;
  const canVoid = isManagerOrAbove;

  const isAlreadyRefunded = !!sale?.refundedAt;
  const isVoided = !!sale?.deletedAt;

  const refundMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/refunds", {
      saleId: sale?.id,
      amount: sale?.total,
      reason: refundReason,
      items: sale?.items,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
      toast({ title: "Refund processed successfully" });
      setShowRefund(false);
      setRefundReason("");
      onClose();
    },
    onError: () => toast({ title: "Refund failed", description: "Could not process the refund." }),
  });

  const deleteSaleMutation = useDeleteSale();
  const handleVoid = () => {
    if (!sale?.id) return;
    deleteSaleMutation.mutate(
      { id: sale.id, reason: voidReason.trim() || undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
          toast({ title: "Sale voided", description: "The sale has been permanently voided in the audit log." });
          setShowVoid(false);
          setVoidReason("");
          onClose();
        },
        onError: (err) => {
          toast({ title: "Void failed", description: (err as Error).message, variant: "destructive" });
        },
      }
    );
  };

  if (!sale) return null;

  const items = (sale.items as SaleItem[]) || [];
  const subtotal = parseNumeric(sale.subtotal);
  const tax = parseNumeric(sale.tax);
  const discount = parseNumeric(sale.discount);
  const total = parseNumeric(sale.total);
  const paymentAmount = parseNumeric(sale.paymentAmount);
  const changeAmount = parseNumeric(sale.changeAmount);
  const method = sale.paymentMethod || "cash";

  const handleReprint = async () => {
    const s: Partial<UserSetting> = settings ?? {};
    const receiptWidth = s.receiptWidth ?? "80mm";
    const storeName = s.storeName ?? "";
    const address = s.address ?? "";
    const phone = s.phone ?? "";
    const emailContact = s.emailContact ?? "";
    const receiptFooter = s.receiptFooter ?? "";
    const receiptTitle = s.receiptTitle ?? "OFFICIAL RECEIPT";
    const receiptHeaderText = s.receiptHeaderText ?? "";
    const receiptWebsite = s.receiptWebsite ?? "";
    const showAddress = (s.receiptShowAddress ?? 1) === 1;
    const showPhone = (s.receiptShowPhone ?? 1) === 1;
    const showEmail = (s.receiptShowEmail ?? 0) === 1;
    const showWebsite = (s.receiptShowWebsite ?? 0) === 1;
    const showOrderNumber = (s.receiptShowOrderNumber ?? 1) === 1;
    const showUnitPrice = (s.receiptShowUnitPrice ?? 0) === 1;
    const showPoweredBy = true;
    const fs = 25;
    const cur = currency;
    const taxRateNum = parseNumeric(s.taxRate ?? 0);
    const vatLabel = s.taxRate ? `VAT (${s.taxRate}%)` : "VAT";
    const printDarkness = s.printDarkness ?? 65535;

    const fmt = (n: number) => formatCurrency(n, cur);
    const txn = `TXN-${String(sale.id ?? 0).padStart(4, "0")}`;
    const receiptNumber = sale.receiptNumber || txn;
    const orNumber = sale.orNumber || receiptNumber;
    const invoiceNumber = sale.invoiceNumber || "";
    const dateStr = sale.createdAt ? format(new Date(sale.createdAt), "MMM d, yyyy h:mm a") : format(new Date(), "MMM d, yyyy h:mm a");

    if (blePrinter.connected) {
      const escPosData = {
        storeName,
        headerText: receiptHeaderText,
        receiptTitle,
        address,
        phone,
        email: emailContact,
        website: receiptWebsite,
        showAddress,
        showPhone,
        showEmail,
        showWebsite,
        showOrderNumber,
        showCashier: false,
        showUnitPrice,
        showPoweredBy,
        orderNumber: sale.id ?? undefined,
        dateStr,
        items: items.map(item => {
          const basePrice = parseNumeric(item.size?.price ?? item.product?.price);
          const modsTotal = (item.modifiers ?? []).reduce((acc, m) => acc + parseNumeric(m.price), 0);
          return {
            name: item.product?.name ?? "Item",
            sizeName: item.size?.name,
            qty: item.quantity || 1,
            unitPrice: basePrice + modsTotal,
            modifiers: (item.modifiers ?? []).map(m => ({ name: m.name ?? "", price: String(m.price ?? "0") })),
          };
        }),
        subtotal,
        tax,
        taxRate: taxRateNum,
        discount,
        discountCode: sale.discountCode ?? null,
        total,
        paymentMethod: method,
        paymentAmount,
        changeAmount,
        currency: cur,
        receiptFooter,
        receiptWidth,
      };
      const charsPerLine = catCharsPerLine(fs);
      const result = await blePrint({
        escpos: buildReceiptEscPos(escPosData),
        catText: buildReceiptText(escPosData, charsPerLine) + "\n\n",
        energy: printDarkness,
        catReceiptWidth: receiptWidth,
        catFontSize: fs,
      });
      if (result.ok) {
        toast({ title: "Receipt reprinted", description: `Sent to ${blePrinter.name}` });
      } else {
        toast({ title: "Print failed", description: result.error, variant: "destructive" });
      }
      return;
    }

    const itemsHtml = items.map(item => {
      const basePrice = parseNumeric(item.size?.price ?? item.product?.price);
      const modsTotal = (item.modifiers ?? []).reduce((acc, m) => acc + parseNumeric(m.price), 0);
      const unitPrice = basePrice + modsTotal;
      const lineTotal = unitPrice * (item.quantity || 1);
      return `
        <div class="row">
          <span class="item-name">${item.product?.name ?? "Item"}${item.size?.name ? ` (${item.size.name})` : ""} x${item.quantity}</span>
          <span class="price">${fmt(lineTotal)}</span>
        </div>
        ${showUnitPrice && unitPrice > 0 ? `<div class="muted" style="padding-left:12px;font-size:${fs - 2}px">${fmt(unitPrice)} × ${item.quantity}</div>` : ""}
        ${(item.modifiers ?? []).length > 0 ? `<div class="muted" style="padding-left:12px">+ ${(item.modifiers ?? []).map(m => m.name).join(", ")}</div>` : ""}
      `;
    }).join("");

    const paperMm = receiptWidth === "58mm" ? "58mm" : "80mm";
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page{size:${paperMm} auto;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{font-family:'Courier New','Lucida Console',monospace;font-size:${fs}px;font-weight:900;color:#000;background:#fff;width:${paperMm};padding:3mm 2mm 8mm 2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .center{text-align:center}
  .bold{font-weight:900}
  .line{border-top:2px solid #000;margin:6px 0}
  .row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:2px 0}
  .item-name{flex:1;min-width:0;word-break:break-word;font-weight:900}
  .price{flex-shrink:0;white-space:nowrap}
  .total-row{font-weight:900;font-size:${fs + 2}px}
  .muted{color:#000;font-size:${fs - 2}px}
  .green{color:#000;font-weight:900}
  .footer{text-align:center;font-size:${fs - 2}px;color:#000}
</style></head>
<body>
<div class="center">
  ${storeName ? `<p class="bold" style="font-size:${fs + 2}px">${storeName}</p>` : ""}
  ${receiptHeaderText ? `<p style="font-size:${fs - 2}px">${receiptHeaderText}</p>` : ""}
  ${receiptTitle ? `<p style="font-size:${fs - 1}px;font-weight:700">${receiptTitle}</p>` : ""}
  <p class="muted" style="font-size:${fs - 3}px">${dateStr}</p>
  ${showAddress && address ? `<p class="muted" style="font-size:${fs - 3}px">${address}</p>` : ""}
  ${showPhone && phone ? `<p class="muted" style="font-size:${fs - 3}px">Tel: ${phone}</p>` : ""}
  ${showEmail && emailContact ? `<p class="muted" style="font-size:${fs - 3}px">${emailContact}</p>` : ""}
  ${showWebsite && receiptWebsite ? `<p class="muted" style="font-size:${fs - 3}px">${receiptWebsite}</p>` : ""}
  ${sale.customerName ? `<p style="font-size:${fs - 3}px">Customer: ${sale.customerName}</p>` : ""}
</div>
  ${showOrderNumber ? `<div class="row muted" style="font-size:${fs - 3}px;margin-bottom:4px"><span>Order #</span><span>${txn}</span></div>` : ""}
  <div class="row muted" style="font-size:${fs - 3}px"><span>Receipt #</span><span>${receiptNumber}</span></div>
  <div class="row muted" style="font-size:${fs - 3}px"><span>O.R. #</span><span>${orNumber}</span></div>
  <div class="row muted" style="font-size:${fs - 3}px"><span>Invoice #</span><span>${invoiceNumber || "-"}</span></div>
<div class="line"></div>
${itemsHtml}
<div class="line"></div>
<div class="row muted"><span>Subtotal</span><span class="price">${fmt(subtotal)}</span></div>
${discount > 0 ? `<div class="row" style="color:#000;font-size:${fs - 2}px"><span>Discount${sale.discountCode ? ` (${sale.discountCode})` : ""}</span><span class="price">-${fmt(discount)}</span></div>` : ""}
  <div class="row muted"><span>${vatLabel}</span><span class="price">${fmt(tax)}</span></div>
<div class="line"></div>
<div class="row total-row"><span>TOTAL</span><span class="price">${fmt(total)}</span></div>
<div class="row muted"><span>Payment (${(method).toUpperCase()})</span><span class="price">${fmt(paymentAmount)}</span></div>
${changeAmount > 0 ? `<div class="row green"><span>Change</span><span class="price">${fmt(changeAmount)}</span></div>` : ""}
${receiptFooter ? `<div class="line"></div><p class="footer">${receiptFooter}</p>` : ""}
<p class="center" style="color:#000;margin-top:6px;font-size:${fs - 2}px">Thank you!</p>
${showPoweredBy ? `<p class="center" style="font-size:${fs - 4}px;color:#000;margin-top:2px">Powered by ArtixPOS</p>` : ""}
<script>window.onload=function(){window.print();window.close()}<\/script>
</body></html>`;

    const winWidth = receiptWidth === "58mm" ? 260 : 340;
    const win = window.open("", "_blank", `width=${winWidth},height=700`);
    if (!win) { alert("Please allow pop-ups to print receipts."); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md w-full rounded-2xl p-0 overflow-hidden gap-0">
          {}
          <div className={["px-5 pt-5 pb-4 border-b border-border", isVoided ? "bg-gradient-to-br from-rose-500/10 via-transparent to-transparent" : "bg-gradient-to-br from-primary/10 via-transparent to-transparent"].join(" ")}>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className={["h-9 w-9 rounded-xl flex items-center justify-center shrink-0", isVoided ? "bg-rose-500/10" : "bg-primary/10"].join(" ")}>
                  {isVoided ? <Ban className="h-[18px] w-[18px] text-rose-500" /> : <Receipt className="h-[18px] w-[18px] text-primary" />}
                </div>
                <div>
                  <DialogTitle className="text-base font-bold leading-tight">Transaction Details</DialogTitle>
                  {sale.createdAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(sale.createdAt), "MMMM d, yyyy · h:mm a")}
                    </p>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hash className="h-3 w-3" />
                <span className="font-mono font-medium">TXN-{String(sale.id).padStart(4, "0")}</span>
              </span>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <span className={[
                "flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold",
                PAYMENT_COLORS[method] || "bg-secondary text-muted-foreground",
              ].join(" ")}>
                {PAYMENT_ICONS[method] || <CreditCard className="h-3 w-3" />}
                {PAYMENT_LABELS[method] || method}
              </span>
              {isVoided && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <Ban className="h-3 w-3" />
                    VOID
                  </span>
                </>
              )}
              {isAlreadyRefunded && !isVoided && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                    <RotateCcw className="h-3 w-3" />
                    Refunded
                  </span>
                </>
              )}
              {sale.customerName && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <UserCircle2 className="h-3 w-3" />
                    {sale.customerName}
                  </span>
                </>
              )}
            </div>

            {}
            {isVoided && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-500/8 border border-rose-500/15">
                <ShieldCheck className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    Voided {sale.deletedAt ? format(new Date(sale.deletedAt), "MMM d, yyyy · h:mm a") : ""}
                  </p>
                  {sale.voidReason && (
                    <p className="text-xs text-rose-500/80 mt-0.5">Reason: {sale.voidReason}</p>
                  )}
                </div>
              </div>
            )}

            {}
            {isAlreadyRefunded && !isVoided && sale.refundedAt && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/8 border border-rose-500/15">
                <ShieldCheck className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Refunded on {format(new Date(sale.refundedAt), "MMM d, yyyy · h:mm a")}
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
            {}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
                Order Items · {items.length} {items.length === 1 ? "item" : "items"}
              </p>
              <div className="space-y-2">
                {items.map((item, i) => {
                  const itemPrice = parseNumeric(item.size?.price ?? item.product?.price ?? 0);
                  const modsTotal = (item.modifiers ?? []).reduce(
                    (sum, m) => sum + parseNumeric(m.price), 0
                  );
                  const lineTotal = (itemPrice + modsTotal) * (item.quantity ?? 1);

                  return (
                    <div key={i} className="glass-card rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm leading-tight">
                            {item.quantity && item.quantity > 1 ? `${item.quantity}× ` : ""}
                            {item.product?.name || "Item"}
                          </p>
                          {item.size && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Size: {item.size.name}
                              {item.size.price ? ` (+${formatCurrency(item.size.price, currency)})` : ""}
                            </p>
                          )}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {item.modifiers.map((mod, j) => (
                                <p key={j} className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Tag className="h-2.5 w-2.5 shrink-0" />
                                  {mod.name}
                                  {mod.price ? ` +${formatCurrency(mod.price, currency)}` : ""}
                                </p>
                              ))}
                            </div>
                          )}
                          {item.note && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                              <FileText className="h-2.5 w-2.5 shrink-0" />
                              {item.note}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-bold tabular-nums text-primary shrink-0">
                          {formatCurrency(lineTotal, currency)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {}
            {sale.notes && (
              <div className="glass-card rounded-xl p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Order Note</p>
                <p className="text-sm text-foreground/80">{sale.notes}</p>
              </div>
            )}

            {}
            {(
              <div className="glass-card rounded-xl p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Payment Summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-rose-600 dark:text-rose-400">
                      <span className="flex items-center gap-1">
                        Discount {sale.discountCode && (
                          <code className="text-[9px] bg-rose-500/10 px-1.5 py-0.5 rounded font-mono">
                            {sale.discountCode}
                          </code>
                        )}
                      </span>
                      <span className="tabular-nums font-medium">-{formatCurrency(discount, currency)}</span>
                    </div>
                  )}
                  {tax > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{settings?.taxRate ? `VAT (${settings.taxRate}%)` : "VAT"}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(tax, currency)}</span>
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-border flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="tabular-nums text-primary">{formatCurrency(total, currency)}</span>
                  </div>
                  {paymentAmount > 0 && (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Amount Paid</span>
                        <span className="tabular-nums font-medium">{formatCurrency(paymentAmount, currency)}</span>
                      </div>
                      {changeAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                          <span>Change</span>
                          <span className="tabular-nums font-medium">{formatCurrency(changeAmount, currency)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {}
          {!isVoided && (
            <div className={["px-5 space-y-2", isManagerOrAbove ? "pt-0 pb-2" : "pb-5"].join(" ")}>
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl"
                onClick={handleReprint}
                data-testid="button-reprint-receipt"
              >
                <Printer className="h-3.5 w-3.5 mr-2" /> Print Receipt
              </Button>
            </div>
          )}

          {}
          {!permsLoading && canRefund && !isVoided && (
            <div className="px-5 pb-2">
              {isAlreadyRefunded ? (
                <div className="w-full h-10 rounded-xl flex items-center justify-center gap-2 bg-rose-500/8 border border-rose-500/15 text-rose-500 text-sm font-medium">
                  <RotateCcw className="h-3.5 w-3.5" />
                  This transaction has been refunded
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-10 rounded-xl text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/5"
                  onClick={() => setShowRefund(true)}
                  data-testid="button-open-refund"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-2" /> Process Refund
                </Button>
              )}
            </div>
          )}

          {}
          {!permsLoading && canVoid && !isVoided && !isAlreadyRefunded && (
            <div className="px-5 pb-5">
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl text-rose-700 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/5"
                onClick={() => setShowVoid(true)}
                data-testid="button-open-void"
              >
                <Ban className="h-3.5 w-3.5 mr-2" /> Void Sale
              </Button>
            </div>
          )}

          {isVoided && (
            <div className="px-5 pb-5">
              <div className="w-full h-10 rounded-xl flex items-center justify-center gap-2 bg-rose-500/8 border border-rose-500/15 text-rose-500 text-sm font-medium">
                <Ban className="h-3.5 w-3.5" />
                This sale has been voided
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={showRefund} onOpenChange={setShowRefund}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-rose-500" /> Process Refund
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Refund Amount</p>
              <p className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(total, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Reason (optional)</p>
              <Textarea
                placeholder="e.g. Customer requested refund, wrong item ordered…"
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                className="rounded-xl resize-none text-sm"
                rows={3}
                data-testid="input-refund-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowRefund(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white"
                onClick={() => refundMutation.mutate()}
                disabled={refundMutation.isPending}
                data-testid="button-confirm-refund"
              >
                {refundMutation.isPending ? "Processing…" : "Confirm Refund"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={showVoid} onOpenChange={setShowVoid}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" /> Void Sale
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-4 flex items-start gap-3 bg-rose-500/5 border border-rose-500/15">
              <Ban className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">This action cannot be undone</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The sale will be permanently marked as VOID in the BIR audit log. All void entries are permanently retained for compliance.
                </p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Sale Amount</p>
              <p className="text-2xl font-bold text-primary tabular-nums">{formatCurrency(total, currency)}</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">TXN-{String(sale.id).padStart(4, "0")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Void Reason <span className="text-rose-500">*</span></p>
              <Textarea
                placeholder="e.g. Wrong items entered, duplicate transaction, system error…"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                className="rounded-xl resize-none text-sm"
                rows={3}
                data-testid="input-void-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowVoid(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 text-white"
                onClick={handleVoid}
                disabled={deleteSaleMutation.isPending || !voidReason.trim()}
                data-testid="button-confirm-void"
              >
                {deleteSaleMutation.isPending ? "Voiding…" : "Void Sale"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
