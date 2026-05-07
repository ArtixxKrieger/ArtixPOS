import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChefHat, Clock, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useKitchenSse } from "@/hooks/use-kitchen-sse";
import { cn } from "@/lib/utils";
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
    label: "Ready ✓",
    class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    next: "done",
    nextLabel: "Done / Served",
  },
};

const COLUMN_ACCENT: Record<KitchenStatus, string> = {
  pending: "border-t-amber-400",
  preparing: "border-t-blue-500",
  ready: "border-t-emerald-500",
};

function elapsedMin(createdAt: string | null | undefined) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold">
      <span className={cn(
        "inline-block h-2 w-2 rounded-full",
        connected
          ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)] animate-pulse"
          : "bg-muted-foreground/30"
      )} />
      <span className={connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}>
        {connected ? "LIVE" : "offline"}
      </span>
    </span>
  );
}

export default function KitchenPage() {
  const { toast } = useToast();
  const [tick, setTick] = useState(0); // elapsed-time ticker

  // Real-time SSE channel — pushes order-update and new-order events instantly.
  // Falls back to the refetchInterval below if SSE drops.
  const { connected } = useKitchenSse();

  const { data: orders = [], isLoading, isFetching, refetch } = useQuery<PendingOrder[]>({
    queryKey: ["/api/pending-orders"],
    // Keep a fallback poll at 30 s in case SSE drops; SSE makes it instant for all normal operations
    refetchInterval: 30_000,
  });

  // Tick every 30 s so elapsed times stay accurate without re-fetching
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const kitchenOrders = orders.filter(o =>
    o.kitchenStatus !== "done" && o.status !== "paid"
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

  const grouped: Record<KitchenStatus, PendingOrder[]> = { pending: [], preparing: [], ready: [] };
  for (const o of kitchenOrders) {
    const s = (o.kitchenStatus ?? "pending") as KitchenStatus;
    if (s in grouped) grouped[s].push(o);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            Kitchen Display
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-muted-foreground">
              {kitchenOrders.length} active order{kitchenOrders.length !== 1 ? "s" : ""}
            </p>
            <LiveDot connected={connected} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          data-testid="button-refresh-kitchen"
          aria-label="Refresh kitchen orders"
          className="gap-1.5 text-xs"
        >
          {isFetching
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
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
                {grouped[status].length > 0 && (
                  <span className="text-xs font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                    {grouped[status].length}
                  </span>
                )}
              </div>

              {/* Order cards */}
              {grouped[status].length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center text-muted-foreground text-xs">
                  None
                </div>
              ) : (
                grouped[status].map(order => {
                  const elapsed = elapsedMin(order.createdAt);
                  const isUrgent = elapsed >= 15 && status === "pending";
                  return (
                    <div
                      key={order.id}
                      data-testid={`card-kitchen-order-${order.id}`}
                      className={cn(
                        "bg-card border-t-2 border rounded-2xl p-4 space-y-3 shadow-sm transition-all",
                        COLUMN_ACCENT[status],
                        isUrgent ? "border-rose-500/40 bg-rose-500/[0.02]" : "border-border",
                      )}
                    >
                      {/* Order header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-base">
                            {order.orderNumber ? `#${order.orderNumber}` : `Order #${order.id}`}
                          </p>
                          {order.customerName && (
                            <p className="text-[10px] text-muted-foreground">{order.customerName}</p>
                          )}
                          {order.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">"{order.notes}"</p>
                          )}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
                          isUrgent ? "bg-rose-500/10 text-rose-500" : elapsed >= 10 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                        )}>
                          <Clock className="h-3 w-3" />
                          {elapsed}m
                        </div>
                      </div>

                      {/* Items */}
                      <ul className="space-y-1.5">
                        {((order.items as any[]) ?? []).map((item, i) => {
                          const sizeName = item.size?.name ?? item.size ?? null;
                          const mods: string[] = item.modifiers?.map((m: any) => m.name ?? m) ??
                            (item.modifier ? [item.modifier] : []);
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="font-bold text-primary min-w-[20px]">{item.quantity}×</span>
                              <span className="flex-1">
                                <span className="font-medium">{item.name ?? item.product?.name}</span>
                                {sizeName && <span className="text-muted-foreground ml-1 text-xs">({sizeName})</span>}
                                {mods.length > 0 && (
                                  <span className="text-muted-foreground ml-1 text-xs">+{mods.join(", ")}</span>
                                )}
                                {item.note && (
                                  <span className="block text-[10px] italic text-amber-600 dark:text-amber-400 mt-0.5">"{item.note}"</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
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
                        {updateMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : STATUS_CONFIG[status].nextLabel}
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
