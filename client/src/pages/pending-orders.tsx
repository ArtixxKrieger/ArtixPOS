import { usePendingOrders, useDeletePendingOrder } from "@/hooks/use-pending-orders";
import { useCreateSale } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Play, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PendingOrders() {
  const { data: orders = [], isLoading } = usePendingOrders();
  const { data: settings } = useSettings();
  const deleteOrder = useDeletePendingOrder();
  const createSale = useCreateSale();
  const { toast } = useToast();

  const handleComplete = (order: any) => {
    createSale.mutate({
      items: order.items,
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentAmount: order.total,
    }, {
      onSuccess: () => {
        deleteOrder.mutate(order.id); // Clean up pending
        toast({ title: "Order Completed", description: "Parked order has been processed as a sale." });
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading parked orders...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center text-foreground shadow-sm">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Parked Orders</h2>
          <p className="text-sm text-muted-foreground">Resume or discard incomplete transactions</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card rounded-3xl p-16 text-center text-muted-foreground flex flex-col items-center border border-border/50 shadow-sm">
          <Clock className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium text-foreground">No parked orders</p>
          <p>Orders you save for later will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => {
            const items = order.items as any[];
            const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
            
            return (
              <Card key={order.id} className="rounded-3xl border border-border/50 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                <CardContent className="p-0 flex-1 flex flex-col">
                  <div className="p-5 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold tracking-wide">
                        {format(new Date(order.createdAt!), "MMM d, h:mm a")}
                      </div>
                      <span className="font-black text-xl">{formatCurrency(order.total, settings?.currency)}</span>
                    </div>
                    
                    <p className="text-sm font-medium mb-2">{itemCount} items:</p>
                    <ul className="text-sm text-muted-foreground space-y-1 mb-4 line-clamp-3">
                      {items.slice(0,3).map((item, i) => (
                        <li key={i}>• {item.quantity}x {item.product.name}</li>
                      ))}
                      {items.length > 3 && <li>...and {items.length - 3} more</li>}
                    </ul>
                  </div>
                  
                  <div className="grid grid-cols-2 border-t border-border/50 bg-muted/20">
                    <Button 
                      variant="ghost" 
                      className="h-14 rounded-none hover:bg-destructive/10 hover:text-destructive font-semibold border-r border-border/50"
                      onClick={() => {
                        if(confirm("Discard this parked order?")) deleteOrder.mutate(order.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Discard
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="h-14 rounded-none text-primary hover:bg-primary/10 font-bold"
                      onClick={() => handleComplete(order)}
                      disabled={createSale.isPending}
                    >
                      <Play className="mr-2 h-4 w-4 fill-current" /> Checkout
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
