import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChefHat, Clock, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PendingOrder } from "@shared/schema";

const KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;
type KitchenStatus = typeof KITCHEN_STATUSES[number];

const STATUS_CONFIG: Record<KitchenStatus, { label: string; class: string; next: KitchenStatus | "done"; nextLabel: string }> = {
  pending: {
    label: "Waiting",
    class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
    next: "preparing",
    nextLabel: "Start Preparing",
  },
  preparing: {
    label: "Preparing",
    class: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    next: "ready",
    nextLabel: "Mark Ready",
  },
  ready: {
    label: "Ready",
    class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    next: "done",
    nextLabel: "Done / Served",
  },
};

function elapsedMin(createdAt: string | null | undefined) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

export default function KitchenPage() {
  const { toast } = useToast();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data: orders = [], isLoading, refetch } = useQuery<PendingOrder[]>({
    queryKey: ["/api/pending-orders"],
    refetchInterval: 15000, // auto-refresh every 15s
  });

  useEffect(() => {
    const interval = setInterval(() => setLastRefresh(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const kitchenOrders = orders.filter(o =>
    o.kitchenStatus !== "done" &&
    o.status !== "paid"
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: number; kitchenStatus: string }) =>
      apiRequest("PATCH", `/api/pending-orders/${id}/kitchen`, { kitchenStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  function handleStatusChange(order: PendingOrder) {
    const current = (order.kitchenStatus ?? "pending") as KitchenStatus;
    const next = STATUS_CONFIG[current]?.next ?? "done";
    updateMutation.mutate({ id: order.id, kitchenStatus: next });
  }

  // Group by status
  const grouped: Record<KitchenStatus, PendingOrder[]> = { pending: [], preparing: [], ready: [] };
  for (const o of kitchenOrders) {
    const s = (o.kitchenStatus ?? "pending") as KitchenStatus;
    if (s in grouped) grouped[s].push(o);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" /> Kitchen Display
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {kitchenOrders.length} active order{kitchenOrders.length !== 1 ? "s" : ""} · last refreshed {Math.floor((Date.now() - lastRefresh.getTime()) / 1000)}s ago
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); setLastRefresh(new Date()); }}
          data-testid="button-refresh-kitchen"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : kitchenOrders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-lg">All clear!</p>
          <p className="text-sm mt-1">No pending orders in the kitchen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(["pending", "preparing", "ready"] as KitchenStatus[]).map(status => (
            <div key={status} className="space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2">
                <Badge className={`${STATUS_CONFIG[status].class} border text-xs px-3 py-1`}>
                  {STATUS_CONFIG[status].label}
                </Badge>
                <span className="text-xs text-muted-foreground font-medium">
                  {grouped[status].length}
                </span>
              </div>

              {/* Order cards */}
              {grouped[status].length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center text-muted-foreground text-xs">
                  None
                </div>
              ) : (
                grouped[status].map(order => {
                  const elapsed = elapsedMin(order.createdAt);
                  const isUrgent = elapsed >= 15;
                  return (
                    <div
                      key={order.id}
                      data-testid={`card-kitchen-order-${order.id}`}
                      className={[
                        "bg-card border rounded-2xl p-4 space-y-3 shadow-sm transition-all",
                        isUrgent && status === "pending" ? "border-rose-500/40" : "border-border",
                      ].join(" ")}
                    >
                      {/* Order header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-base">
                            {order.orderNumber ? `#${order.orderNumber}` : `Order #${order.id}`}
                          </p>
                          {order.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">"{order.notes}"</p>
                          )}
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isUrgent && status !== "ready" ? "bg-rose-500/10 text-rose-500" : "bg-muted text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {elapsed}m
                        </div>
                      </div>

                      {/* Items */}
                      <ul className="space-y-1">
                        {((order.items as any[]) ?? []).map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="font-bold text-primary min-w-[20px]">{item.quantity}×</span>
                            <span className="flex-1">
                              {item.name}
                              {item.size && <span className="text-muted-foreground ml-1 text-xs">({item.size})</span>}
                              {item.modifier && <span className="text-muted-foreground ml-1 text-xs">+{item.modifier}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Action button */}
                      <Button
                        size="sm"
                        className="w-full"
                        variant={status === "ready" ? "default" : "outline"}
                        onClick={() => handleStatusChange(order)}
                        disabled={updateMutation.isPending}
                        data-testid={`button-kitchen-advance-${order.id}`}
                      >
                        {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : STATUS_CONFIG[status].nextLabel}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
