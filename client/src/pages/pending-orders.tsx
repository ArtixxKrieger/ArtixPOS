import { usePendingOrders, useDeletePendingOrder, useUpdatePendingOrder } from "@/hooks/use-pending-orders";
import { useCreateSale } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, CheckCircle2, XCircle, CreditCard, User, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface OrderItem {
  quantity: number;
  product: {
    name: string;
  };
  size?: {
    name: string;
  };
  modifiers?: Array<{
    name: string;
  }>;
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
        toast({
          title: "Order Completed",
          description: "Pending order has been processed as a sale."
        });
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
        toast({
          title: "Payment Updated",
          description: "Order status has been updated."
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-12 w-64 bg-muted rounded-2xl"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-96 bg-muted rounded-[2.5rem]"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10">

      <div className="flex items-center gap-4 mb-8">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white shadow-xl">
          <Clock className="h-7 w-7" />
        </div>

        <div>
          <h2 className="text-3xl font-black tracking-tight">Pending Orders</h2>
          <p className="text-sm text-muted-foreground font-medium">
            Manage unpaid or parked transactions
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card rounded-[3rem] p-24 text-center text-muted-foreground flex flex-col items-center border border-border/50 shadow-sm">
          <div className="h-24 w-24 rounded-full bg-muted/30 flex items-center justify-center mb-6">
            <Clock className="h-12 w-12 opacity-20" />
          </div>
          <p className="text-xl font-bold text-foreground">
            No pending orders
          </p>
          <p className="mt-2">Orders you save will appear here for processing.</p>
        </div>
      ) : (

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">

          {orders.map((order) => {
            const items = (order.items as OrderItem[]) || [];
            const itemCount = items.reduce((acc, i) => acc + (i.quantity || 0), 0);

            const total = parseNumeric(order.total || "0");
            const paid = parseNumeric(order.paymentAmount || "0");
            const isPaid = order.status === "paid" || paid >= total;

            return (

              <Card
                key={order.id}
                className="rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col bg-card group"
              >

                <CardContent className="p-0 flex-1 flex flex-col">

                  <div className="p-8 flex-1">

                    <div className="flex justify-between items-start mb-6">

                      <div className="flex flex-col gap-2">

                        <div className="bg-primary/10 text-primary px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest w-fit uppercase">
                          {order.createdAt ? format(new Date(order.createdAt), "MMM d, h:mm a") : "Date unknown"}
                        </div>

                        <div className={`flex items-center gap-1.5 text-xs font-black tracking-tight ${isPaid ? "text-emerald-500" : "text-amber-500"}`}>
                          {isPaid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          {isPaid ? "FULLY PAID" : "UNPAID"}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <CreditCard className="h-3 w-3" /> {order.paymentMethod || "CASH"}
                        </div>

                      </div>

                      <span className="font-black text-2xl text-primary">
                        {formatCurrency(order.total || "0", settings?.currency)}
                      </span>

                    </div>

                    <div className="space-y-4 mb-8 bg-secondary/30 p-5 rounded-3xl border border-border/50">

                      <div className="flex items-center justify-between gap-2">

                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.1em]">
                          Payment
                        </span>

                        <div className="flex gap-2">

                          <Input
                            type="number"
                            placeholder="0.00"
                            className="w-28 h-9 text-right bg-background border-none text-xs font-black rounded-xl shadow-sm focus-visible:ring-primary/20"
                            value={payments[order.id] ?? order.paymentAmount ?? ""}
                            onChange={(e) =>
                              setPayments(prev => ({
                                ...prev,
                                [order.id]: e.target.value
                              }))
                            }
                          />

                          <Button
                            size="sm"
                            className="h-9 px-4 text-[10px] font-black rounded-xl shadow-md"
                            onClick={() => handleUpdatePayment(order)}
                          >
                            SET
                          </Button>

                        </div>

                      </div>

                      {Number(payments[order.id] ?? order.paymentAmount ?? "0") > total && (
                        <div className="flex justify-between items-center pt-2 border-t border-border/50">
                          <span className="text-[10px] font-black text-emerald-600 uppercase">Change</span>
                          <span className="font-black text-emerald-600 text-sm">
                            {formatCurrency(
                              Math.max(
                                0,
                                Number(payments[order.id] ?? order.paymentAmount ?? "0") - total
                              ),
                              settings?.currency
                            )}
                          </span>
                        </div>
                      )}

                    </div>

                    {(order.customerName || order.notes) && (
                      <div className="mb-6 space-y-2">
                        {order.customerName && (
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <User className="h-3 w-3 text-primary" /> {order.customerName}
                          </div>
                        )}
                        {order.notes && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded-lg italic">
                            <FileText className="h-3 w-3" /> {order.notes}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">
                      {itemCount} ITEMS
                    </p>

                    <div className="max-h-48 overflow-y-auto pr-2 scrollbar-hide">

                      <ul className="space-y-3">

                        {items.map((item, i) => (

                          <li key={i} className="flex flex-col py-3 border-b border-border/30 last:border-0">
                            <div className="flex justify-between items-start">
                              <span className="font-black text-sm leading-tight max-w-[70%]">
                                {item.quantity || 0}x {item.product?.name || "Unknown"}
                              </span>
                              {item.size && (
                                <span className="text-[9px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                  {item.size.name}
                                </span>
                              )}
                            </div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {item.modifiers.map((m: any) => (
                                  <span key={m.name} className="text-[9px] font-bold text-muted-foreground/80 bg-muted/50 px-2 py-0.5 rounded-md italic">
                                    + {m.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </li>

                        ))}

                      </ul>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 bg-muted/20 border-t border-border/50 h-20">

                    <Button
                      variant="ghost"
                      className="h-full rounded-none hover:bg-destructive/10 hover:text-destructive font-black text-xs tracking-widest uppercase border-r border-border/50"
                      onClick={() => {
                        if (confirm("Discard this order?")) {
                          deleteOrder.mutate(order.id);
                        }
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Discard
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-full rounded-none text-primary hover:bg-primary/10 font-black text-xs tracking-widest uppercase"
                      onClick={() => handleComplete(order)}
                      disabled={createSale.isPending}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Finalize
                    </Button>

                  </div>

                </CardContent>

              </Card>

            );

          })}

        </div>

      )}

    </div>
  );
}