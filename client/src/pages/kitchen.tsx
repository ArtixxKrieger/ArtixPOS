import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChefHat, Clock, CheckCircle2, Monitor } from "lucide-react";
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
  const [_tick, setTick] = useState(0);

  const { connected } = useKitchenSse();

  const { data: orders = [], isLoading: _isLoading } = useQuery<PendingOrder[]>({
    queryKey: ["/api/pending-orders"],
    refetchInterval: connected ? false : 30_000,
  });

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const kitchenOrders = orders.filter(o => o.kitchenStatus !== "done");

  const updateMutation = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: number; kitchenStatus: string }) =>
      apiRequest("PATCH", `/api/pending-orders/${id}/kitchen`, { kitchenStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] });
    },
    onError: (err: any) => toast({ title: "Failed to update status", description: err?.message ?? "Please try again", variant: "destructive" }),
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
    <div className="space-y-4">
      {}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            Kitchen Display
          </h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-muted-foreground">
              {kitchenOrders.length} active order{kitchenOrders.length !== 1 ? "s" : ""}
            </p>
            <LiveDot connected={connected} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/kitchen-display", "_blank")}
          data-testid="button-open-display-mode"
          className="gap-1.5 text-xs"
        >
          <Monitor className="h-3.5 w-3.5" />
          Display Mode
        </Button>
      </div>

      {kitchenOrders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-semibold">All clear!</p>
          <p className="text-sm mt-0.5">No pending orders in the kitchen</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["pending", "preparing", "ready"] as KitchenStatus[]).map(status => (
            <div key={status} className="space-y-2">
              {}
              <div className="flex items-center gap-2">
                <Badge className={`${STATUS_CONFIG[status].class} border text-xs px-2.5 py-0.5`}>
                  {STATUS_CONFIG[status].label}
                </Badge>
                {grouped[status].length > 0 && (
                  <span className="text-xs font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                    {grouped[status].length}
                  </span>
                )}
              </div>

              {}
              {grouped[status].length === 0 ? (
                <div className="border border-dashed border-border/40 rounded-xl p-3 text-center text-muted-foreground/40 text-xs">
                  —
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
                        "bg-card border-t-2 border rounded-xl p-3 space-y-2 shadow-sm transition-all",
                        COLUMN_ACCENT[status],
                        isUrgent ? "border-rose-500/40 bg-rose-500/[0.02]" : "border-border",
                      )}
                    >
                      {}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <p className="font-bold text-sm leading-none">
                            {order.orderNumber ? `#${order.orderNumber}` : `#${order.id}`}
                          </p>
                          {(order as any).orderType === "dine_in" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded uppercase tracking-wide">
                              Dine In
                            </span>
                          )}
                          {(order as any).orderType === "takeout" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 rounded uppercase tracking-wide">
                              Takeout
                            </span>
                          )}
                          {(order as any).orderType === "delivery" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded uppercase tracking-wide">
                              Delivery
                            </span>
                          )}
                          {order.customerName && (
                            <span className="text-[10px] text-muted-foreground truncate">{order.customerName}</span>
                          )}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                          isUrgent ? "bg-rose-500/10 text-rose-500" : elapsed >= 10 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                        )}>
                          <Clock className="h-2.5 w-2.5" />
                          {elapsed}m
                        </div>
                      </div>

                      {}
                      <ul className="space-y-1">
                        {((order.items as any[]) ?? []).map((item, i) => {
                          const sizeName = item.size?.name ?? item.size ?? null;
                          const mods: string[] = item.modifiers?.map((m: any) => m.name ?? m) ??
                            (item.modifier ? [item.modifier] : []);
                          return (
                            <li key={i} className="flex items-start gap-1.5 text-xs">
                              <span className="font-bold text-primary min-w-[18px] leading-snug">{item.quantity}×</span>
                              <span className="flex-1 leading-snug">
                                <span className="font-medium">{item.name ?? item.product?.name}</span>
                                {sizeName && <span className="text-muted-foreground ml-1">({sizeName})</span>}
                                {mods.length > 0 && (
                                  <span className="text-muted-foreground ml-1">+{mods.join(", ")}</span>
                                )}
                                {item.note && (
                                  <span className="block text-[10px] italic text-amber-600 dark:text-amber-400 mt-0.5">"{item.note}"</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>

                      {order.notes && (
                        <p className="text-[10px] italic text-muted-foreground border-t border-border/40 pt-1.5">
                          "{order.notes}"
                        </p>
                      )}

                      {}
                      <button
                        onClick={() => handleStatusChange(order)}
                        disabled={updateMutation.isPending && updateMutation.variables?.id === order.id}
                        data-testid={`button-kitchen-advance-${order.id}`}
                        className={cn(
                          "w-full h-7 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-40",
                          status === "pending"
                            ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                            : status === "preparing"
                            ? "bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 border border-blue-500/25"
                            : "bg-emerald-500 hover:bg-emerald-400 text-white"
                        )}
                      >
                        {STATUS_CONFIG[status].nextLabel}
                      </button>
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
