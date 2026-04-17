import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Receipt, CreditCard, Smartphone, Hash, Tag, FileText, RotateCcw, UserCircle2, Percent, ShieldCheck, Printer } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
};

interface SaleDetailModalProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash: <CreditCard className="h-3 w-3" />,
  card: <CreditCard className="h-3 w-3" />,
  online: <Smartphone className="h-3 w-3" />,
  gcash: <Smartphone className="h-3 w-3" />,
  maya: <Smartphone className="h-3 w-3" />,
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  online: "Online",
  gcash: "GCash",
  maya: "Maya",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  card: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  online: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  gcash: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  maya: "bg-green-500/10 text-green-600 dark:text-green-400",
};

export function SaleDetailModal({ sale, open, onClose }: SaleDetailModalProps) {
  const { data: settings } = useSettings();
  const currency = (settings as any)?.currency || "₱";
  const { toast } = useToast();
  const { isManagerOrAbove } = useAuth();
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const isAlreadyRefunded = !!sale?.refundedAt;

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

  if (!sale) return null;

  const items = (sale.items as SaleItem[]) || [];
  const subtotal = parseNumeric(sale.subtotal);
  const tax = parseNumeric(sale.tax);
  const discount = parseNumeric(sale.discount);
  const total = parseNumeric(sale.total);
  const paymentAmount = parseNumeric(sale.paymentAmount);
  const changeAmount = parseNumeric(sale.changeAmount);
  const method = sale.paymentMethod || "cash";

  const handleReprint = () => {
    const s = (settings ?? {}) as Record<string, any>;
    const receiptWidth = s.receiptWidth ?? "80mm";
    const paperPx = receiptWidth === "58mm" ? 210 : 280;
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
    const showPoweredBy = (s.receiptShowPoweredBy ?? 1) === 1;
    const cur = currency;

    const fmt = (n: number) => formatCurrency(n, cur);
    const txn = `TXN-${String(sale.id ?? 0).padStart(4, "0")}`;
    const dateStr = sale.createdAt ? format(new Date(sale.createdAt), "MMM d, yyyy h:mm a") : format(new Date(), "MMM d, yyyy h:mm a");

    const itemsHtml = items.map(item => {
      const basePrice = parseNumeric((item.size as any)?.price);
      const modsTotal = ((item.modifiers || []) as any[]).reduce((s: number, m: any) => s + parseNumeric(m.price), 0);
      const unitPrice = basePrice + modsTotal;
      const lineTotal = unitPrice * (item.quantity || 1);
      return `
        <div class="row">
          <span class="item-name">${(item.product as any)?.name ?? "Item"}${(item.size as any)?.name ? ` (${(item.size as any).name})` : ""} x${item.quantity}</span>
          <span>${fmt(lineTotal)}</span>
        </div>
        ${showUnitPrice && unitPrice > 0 ? `<div class="muted" style="padding-left:12px;font-size:10px">${fmt(unitPrice)} × ${item.quantity}</div>` : ""}
        ${((item.modifiers || []) as any[]).length > 0 ? `<div class="muted" style="padding-left:12px">+ ${((item.modifiers || []) as any[]).map((m: any) => m.name).join(", ")}</div>` : ""}
      `;
    }).join("");

    const html = `<!DOCTYPE html>
<html><head><title>Receipt</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:12px;width:${paperPx}px;padding:12px}
  .center{text-align:center}
  .bold{font-weight:bold}
  .line{border-top:1px dashed #000;margin:6px 0}
  .row{display:flex;justify-content:space-between;margin:2px 0}
  .item-name{flex:1;margin-right:8px;font-weight:500}
  .total-row{font-weight:bold;font-size:14px}
  .muted{color:#555}
  .green{color:#16a34a;font-weight:600}
  .footer{text-align:center;font-size:10px;color:#555}
</style></head>
<body>
<div class="center">
  ${storeName ? `<p class="bold">${storeName}</p>` : ""}
  ${receiptHeaderText ? `<p style="font-size:10px">${receiptHeaderText}</p>` : ""}
  ${receiptTitle ? `<p style="font-size:11px">${receiptTitle}</p>` : ""}
  <p class="muted" style="font-size:10px">${dateStr}</p>
  ${showAddress && address ? `<p class="muted" style="font-size:10px">${address}</p>` : ""}
  ${showPhone && phone ? `<p class="muted" style="font-size:10px">Tel: ${phone}</p>` : ""}
  ${showEmail && emailContact ? `<p class="muted" style="font-size:10px">${emailContact}</p>` : ""}
  ${showWebsite && receiptWebsite ? `<p class="muted" style="font-size:10px">${receiptWebsite}</p>` : ""}
  ${sale.customerName ? `<p style="font-size:10px">Customer: ${sale.customerName}</p>` : ""}
</div>
${showOrderNumber ? `<div class="row muted" style="font-size:10px;margin-bottom:4px"><span>Order #</span><span>${txn}</span></div>` : ""}
<div class="line"></div>
${itemsHtml}
<div class="line"></div>
<div class="row muted"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
${discount > 0 ? `<div class="row" style="color:#e11d48"><span>Discount${sale.discountCode ? ` (${sale.discountCode})` : ""}</span><span>-${fmt(discount)}</span></div>` : ""}
${tax > 0 ? `<div class="row muted"><span>Tax</span><span>${fmt(tax)}</span></div>` : ""}
<div class="line"></div>
<div class="row total-row"><span>TOTAL</span><span>${fmt(total)}</span></div>
<div class="row muted"><span>Payment (${(method).toUpperCase()})</span><span>${fmt(paymentAmount)}</span></div>
${changeAmount > 0 ? `<div class="row green"><span>Change</span><span>${fmt(changeAmount)}</span></div>` : ""}
${receiptFooter ? `<div class="line"></div><p class="footer">${receiptFooter}</p>` : ""}
<p class="center muted" style="margin-top:6px;font-size:10px">Thank you!</p>
${showPoweredBy ? `<p class="center" style="font-size:8px;color:#ccc;margin-top:2px">Powered by ArtixPOS</p>` : ""}
<script>window.onload=function(){window.print();window.close()}<\/script>
</body></html>`;

    const win = window.open("", "_blank", "width=360,height=700");
    if (!win) { alert("Please allow pop-ups to print receipts."); return; }
    win.document.write(html);
    win.document.close();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md w-full rounded-2xl p-0 overflow-hidden gap-0">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent px-5 pt-5 pb-4 border-b border-border">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="h-[18px] w-[18px] text-primary" />
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
              {isAlreadyRefunded && (
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

            {/* Refunded details banner */}
            {isAlreadyRefunded && sale.refundedAt && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/8 border border-rose-500/15">
                <ShieldCheck className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Refunded on {format(new Date(sale.refundedAt), "MMM d, yyyy · h:mm a")}
                </p>
              </div>
            )}
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
            {/* Items */}
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

            {/* Notes */}
            {sale.notes && (
              <div className="glass-card rounded-xl p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Order Note</p>
                <p className="text-sm text-foreground/80">{sale.notes}</p>
              </div>
            )}

            {/* Payment breakdown */}
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
                    <span>Tax</span>
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
          </div>

          {/* Print Receipt */}
          <div className={["px-5", isManagerOrAbove ? "pt-0 pb-2" : "pb-5"].join(" ")}>
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl"
              onClick={handleReprint}
              data-testid="button-reprint-receipt"
            >
              <Printer className="h-3.5 w-3.5 mr-2" /> Print Receipt
            </Button>
          </div>

          {/* Refund footer — only for manager/owner, only if not already refunded */}
          {isManagerOrAbove && (
            <div className="px-5 pb-5">
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
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={showRefund} onOpenChange={setShowRefund}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-rose-500" /> Process Refund
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Refund amount</p>
              <p className="text-2xl font-black text-rose-500 tabular-nums">{formatCurrency(total, currency)}</p>
              <p className="text-xs text-muted-foreground mt-1">TXN-{String(sale.id).padStart(4, "0")}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason for refund</label>
              <Textarea
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                placeholder="e.g. Customer changed mind, defective product..."
                rows={3}
                data-testid="input-refund-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRefund(false)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!refundReason.trim() || refundMutation.isPending}
                onClick={() => refundMutation.mutate()}
                data-testid="button-confirm-refund"
              >
                {refundMutation.isPending ? "Processing..." : "Confirm Refund"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
