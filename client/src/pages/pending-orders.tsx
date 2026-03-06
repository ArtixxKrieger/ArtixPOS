import { usePendingOrders, useDeletePendingOrder, useUpdatePendingOrder } from "@/hooks/use-pending-orders";
import { useCreateSale } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function PendingOrders() {
  const { data: orders = [], isLoading } = usePendingOrders();
  const { data: settings } = useSettings();
  const deleteOrder = useDeletePendingOrder();
  const updateOrder = useUpdatePendingOrder();
  const createSale = useCreateSale();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Record<number, string>>({});

  const handleComplete = (order: any) => {
    const paidAmount = Number(payments[order.id]) || Number(order.paymentAmount) || 0;
    const total = parseNumeric(order.total);

    createSale.mutate({
      items: order.items,
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      paymentMethod: order.paymentMethod || "cash",
      paymentAmount: paidAmount.toString(),
      changeAmount: Math.max(0, paidAmount - total).toString(),
      customerName: order.customerName,
      notes: order.notes,
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

  const handleUpdatePayment = (order: any) => {
    const paidAmount = Number(payments[order.id]) || 0;
    const total = parseNumeric(order.total);

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
      <div className="p-8 text-center animate-pulse">
        Loading pending orders...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground shadow-sm">
          <Clock className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-2xl font-bold">Pending Orders</h2>
          <p className="text-sm text-muted-foreground">
            Manage unpaid or parked transactions
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center text-muted-foreground flex flex-col items-center border border-border/50 shadow-sm">
          <Clock className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium text-foreground">
            No pending orders
          </p>
          <p>Orders you save will appear here.</p>
        </div>
      ) : (

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

          {orders.map((order) => {

            const items = order.items as any[];
            const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);

            const total = parseNumeric(order.total);
            const paid = parseNumeric(order.paymentAmount || 0);
            const isPaid = order.status === "paid" || paid >= total;

            return (

              <Card
                key={order.id}
                className="rounded-3xl border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
              >

                <CardContent className="p-0 flex-1 flex flex-col">

                  <div className="p-5 flex-1">

                    <div className="flex justify-between items-start mb-4">

                      <div className="flex flex-col gap-1">

                        <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold tracking-wide w-fit">
                          {format(new Date(order.createdAt!), "MMMM d, h:mm a")}
                        </div>

                        <div className={`flex items-center gap-1 text-xs font-bold ${isPaid ? "text-green-500" : "text-amber-500"}`}>
                          {isPaid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {isPaid ? "PAID" : "UNPAID"}
                        </div>

                        {/* Payment Method */}
                        <div className="text-xs font-semibold text-muted-foreground">
                          Method: {order.paymentMethod?.toUpperCase() || "CASH"}
                        </div>

                      </div>

                      <span className="font-black text-xl">
                        {formatCurrency(order.total, settings?.currency)}
                      </span>

                    </div>

                    <div className="space-y-3 mb-4">

                      <div className="flex items-center justify-between gap-2">

                        <span className="text-xs font-medium text-muted-foreground">
                          Amount Paid
                        </span>

                        <div className="flex gap-2">

                          <Input
                            type="number"
                            placeholder="0.00"
                            className="w-24 h-8 text-right bg-secondary border-none text-xs font-bold"
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
                            variant="outline"
                            className="h-8 px-2 text-[10px]"
                            onClick={() => handleUpdatePayment(order)}
                          >
                            Update
                          </Button>

                        </div>

                      </div>

                      {Number(payments[order.id] || order.paymentAmount) > total && (
                        <div className="flex justify-between text-xs font-bold text-green-600">
                          <span>Change</span>
                          <span>
                            {formatCurrency(
                              Math.max(
                                0,
                                Number(payments[order.id] || order.paymentAmount) - total
                              ),
                              settings?.currency
                            )}
                          </span>
                        </div>
                      )}

                    </div>

                    <p className="text-sm font-medium mb-2">
                      {itemCount} items:
                    </p>

                    <div className="max-h-32 overflow-y-auto pr-1 mb-4 rounded-xl bg-secondary/30 p-2">

                      <ul className="text-sm text-muted-foreground space-y-1">

                        {items.map((item, i) => (

                          <li key={i} className="flex justify-between">

                            <span>
                              {item.quantity}x {item.product.name}
                            </span>

                            {item.size && (
                              <span className="text-xs text-muted-foreground/70">
                                {item.size}
                              </span>
                            )}

                          </li>

                        ))}

                      </ul>

                    </div>

                  </div>

                  <div className="grid grid-cols-2 border-t border-border/50 bg-muted/20">

                    <Button
                      variant="ghost"
                      className="h-14 rounded-none hover:bg-destructive/10 hover:text-destructive font-semibold border-r border-border/50"
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
                      className="h-14 rounded-none text-primary hover:bg-primary/10 font-bold"
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