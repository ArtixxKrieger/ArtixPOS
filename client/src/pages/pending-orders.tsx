import { usePendingOrders, useDeletePendingOrder, useUpdatePendingOrder } from "@/hooks/use-pending-orders";
import { useCreateSale } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, CheckCircle2, XCircle, CreditCard, FileText, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface OrderItem {
  quantity: number;
  product: { name: string };
  size?: { name: string };
  modifiers?: Array<{ name: string }>;
}

interface PendingOrder {
  id: number;
  items: OrderItem[];
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  paymentMethod: string;
  paymentAmount: string;
  changeAmount: string;
  status: string;
  customerName: string | null;
  notes: string | null;
  createdAt: string | null;
}

export default function PendingOrders() {
  const { data: orders = [], isLoading } = usePendingOrders();
  const { data: settings } = useSettings();
  const deleteOrder = useDeletePendingOrder();
  const updateOrder = useUpdatePendingOrder();
  const createSale = useCreateSale();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Record<number, string>>({});

  const currency = settings?.currency || "₱";

  const handleComplete = (order: PendingOrder) => {
    const paidAmount = Number(payments[order.id] ?? order.paymentAmount ?? "0");
    const total = parseNumeric(order.total || "0");
    createSale.mutate({
      items: order.items || [],
      subtotal: order.subtotal || "0",
      tax: order.tax || "0",
      discount: order.discount || "0",
      total: order.total || "0",
      paymentMethod: order.paymentMethod || "cash",
      paymentAmount: paidAmount.toString(),
      changeAmount: Math.max(0, paidAmount - total).toString(),
      customerName: order.customerName || null,
      notes: order.notes || null,
    }, {
      onSuccess: () => {
        deleteOrder.mutate(order.id);
        toast({ title: "Order Completed", description: "Processed as a sale." });
      }
    });
  };

  const handleUpdatePayment = (order: PendingOrder) => {
    const paidAmount = Number(payments[order.id] ?? "0");
    const total = parseNumeric(order.total || "0");
    updateOrder.mutate({
      id: order.id,
      paymentAmount: paidAmount.toString(),
      changeAmount: Math.max(0, paidAmount - total).toString(),
      status: paidAmount >= total ? "paid" : "unpaid",
    }, {
      onSuccess: () => {
        toast({ title: "Payment Updated", description: "Order status updated." });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-48 bg-muted rounded-3xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 page-enter pb-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/25 shrink-0">
          <Clock className="h-5.5 w-5.5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">Pending Orders</h2>
          <p className="text-xs text-muted-foreground font-medium">
            {orders.length === 0 ? "No pending orders" : `${orders.length} order${orders.length !== 1 ? "s" : ""} waiting`}
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="glass-card rounded-3xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Clock className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold">No pending orders</p>
          <p className="text-sm text-muted-foreground/70">Orders you save will appear here</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const items = (order.items as OrderItem[]) || [];
            const itemCount = items.reduce((acc, i) => acc + (i.quantity || 0), 0);
            const total = parseNumeric(order.total || "0");
            const paid = parseNumeric(order.paymentAmount || "0");
            const isPaid = order.status === "paid" || paid >= total;
            const changeAmt = Math.max(0, Number(payments[order.id] ?? order.paymentAmount ?? "0") - total);

            return (
              <div
                key={order.id}
                data-testid={`pending-order-${order.id}`}
                className="bg-card rounded-3xl shadow-md border border-border/30 overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300"
              >
                {/* Card header */}
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3 border-b border-border/30">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      <Calendar className="h-3 w-3" />
                      {order.createdAt ? format(new Date(order.createdAt), "MMM d, h:mm a") : "Unknown time"}
                    </div>
                    <div className={[
                      "flex items-center gap-1.5 text-xs font-bold",
                      isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                    ].join(" ")}>
                      {isPaid
                        ? <><CheckCircle2 className="h-3.5 w-3.5" />Paid</>
                        : <><XCircle className="h-3.5 w-3.5" />Unpaid</>
                      }
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <CreditCard className="h-3 w-3" />
                      {order.paymentMethod || "Cash"}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-primary tabular-nums">
                      {formatCurrency(order.total || "0", currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{itemCount} items</p>
                  </div>
                </div>

                {/* Items list */}
                <div className="px-5 py-3 space-y-2 flex-1 max-h-44 overflow-y-auto scrollbar-hide">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/20 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          <span className="text-primary font-bold">{item.quantity}×</span> {item.product?.name || "Unknown"}
                        </p>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            + {item.modifiers.map((m: any) => m.name).join(", ")}
                          </p>
                        )}
                      </div>
                      {item.size && (
                        <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                          {item.size.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="px-5 pb-3 flex items-start gap-1.5 text-xs text-muted-foreground italic">
                    <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{order.notes}</span>
                  </div>
                )}

                {/* Payment input */}
                <div className="px-5 py-3 bg-secondary/20 border-t border-border/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment</span>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="w-28 h-8 text-right bg-background border-none text-xs font-bold rounded-xl"
                        value={payments[order.id] ?? order.paymentAmount ?? ""}
                        onChange={(e) => setPayments(prev => ({ ...prev, [order.id]: e.target.value }))}
                        data-testid={`input-payment-${order.id}`}
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 text-[10px] font-bold rounded-xl"
                        onClick={() => handleUpdatePayment(order)}
                      >
                        Set
                      </Button>
                    </div>
                  </div>
                  {changeAmt > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Change</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
                        {formatCurrency(changeAmt, currency)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 border-t border-border/30">
                  <Button
                    variant="ghost"
                    className="h-12 rounded-none rounded-bl-3xl hover:bg-destructive/8 hover:text-destructive text-muted-foreground text-xs font-bold tracking-wide border-r border-border/30"
                    onClick={() => {
                      if (confirm("Discard this order?")) deleteOrder.mutate(order.id);
                    }}
                    data-testid={`button-discard-${order.id}`}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Discard
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-12 rounded-none rounded-br-3xl text-primary hover:bg-primary/8 text-xs font-bold tracking-wide"
                    onClick={() => handleComplete(order)}
                    disabled={createSale.isPending}
                    data-testid={`button-finalize-${order.id}`}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Finalize
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
