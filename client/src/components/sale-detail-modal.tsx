import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Receipt, CreditCard, Smartphone, Calendar, Hash, Tag, FileText } from "lucide-react";

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
  total?: string | number | null;
  paymentMethod?: string | null;
  paymentAmount?: string | number | null;
  changeAmount?: string | number | null;
  notes?: string | null;
  createdAt?: string | null;
};

interface SaleDetailModalProps {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
}

export function SaleDetailModal({ sale, open, onClose }: SaleDetailModalProps) {
  const { data: settings } = useSettings();
  const currency = (settings as any)?.currency || "₱";

  if (!sale) return null;

  const items = (sale.items as SaleItem[]) || [];
  const subtotal = parseNumeric(sale.subtotal);
  const tax = parseNumeric(sale.tax);
  const discount = parseNumeric(sale.discount);
  const total = parseNumeric(sale.total);
  const paymentAmount = parseNumeric(sale.paymentAmount);
  const changeAmount = parseNumeric(sale.changeAmount);

  const isOnline = sale.paymentMethod === "online";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full rounded-2xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 via-transparent to-transparent px-5 pt-5 pb-4 border-b border-border">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="h-4.5 w-4.5 text-primary h-[18px] w-[18px]" />
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

          <div className="flex items-center gap-2 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" />
              <span className="font-mono font-medium">TXN-{String(sale.id).padStart(4, "0")}</span>
            </span>
            <span className="text-muted-foreground/30 text-xs">·</span>
            <span className={[
              "flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold",
              isOnline
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            ].join(" ")}>
              {isOnline
                ? <Smartphone className="h-3 w-3" />
                : <CreditCard className="h-3 w-3" />}
              {isOnline ? "Online" : "Cash"}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-hide">
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
                  <span>Discount</span>
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
      </DialogContent>
    </Dialog>
  );
}
