import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { ChefHat, Clock, Maximize2, Minimize2, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import type { PendingOrder } from "@shared/schema";
import { useKitchenSse } from "@/hooks/use-kitchen-sse";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const KITCHEN_STATUSES = ["pending", "preparing", "ready"] as const;
type KitchenStatus = typeof KITCHEN_STATUSES[number];

const STATUS_CONFIG: Record<KitchenStatus, {
  label: string;
  headerBg: string;
  headerText: string;
  accent: string;
  next: KitchenStatus | "done";
  nextLabel: string;
  btnClass: string;
}> = {
  pending: {
    label: "Waiting",
    headerBg: "bg-amber-500/20",
    headerText: "text-amber-300",
    accent: "border-amber-500/50",
    next: "preparing",
    nextLabel: "Start Preparing",
    btnClass: "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30",
  },
  preparing: {
    label: "Preparing",
    headerBg: "bg-blue-500/20",
    headerText: "text-blue-300",
    accent: "border-blue-500/50",
    next: "ready",
    nextLabel: "Mark Ready",
    btnClass: "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30",
  },
  ready: {
    label: "Ready ✓",
    headerBg: "bg-emerald-500/20",
    headerText: "text-emerald-300",
    accent: "border-emerald-500/50",
    next: "done",
    nextLabel: "Done / Served",
    btnClass: "bg-emerald-500 hover:bg-emerald-400 text-white",
  },
};

function playOrderBell() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t = ctx.currentTime;
    [[1047, 0], [1319, 0.18], [1047, 0.36]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const s = t + delay;
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.3, s + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, s + 0.7);
      osc.start(s);
      osc.stop(s + 0.7);
    });
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 2500);
  } catch { /* Web Audio not supported */ }
}

function elapsedMin(createdAt: string | null | undefined) {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function KitchenDisplayPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const now = useClock();

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleNewOrder = useCallback((data: { orderId: number; orderNumber: number | null; itemCount: number }) => {
    playOrderBell();
    setNewOrderIds(prev => {
      const next = new Set(prev);
      next.add(data.orderId);
      return next;
    });
    setTimeout(() => {
      setNewOrderIds(prev => {
        const next = new Set(prev);
        next.delete(data.orderId);
        return next;
      });
    }, 8000);
  }, []);

  const { connected } = useKitchenSse({ onNewOrder: handleNewOrder });

  const { data: orders = [] } = useQuery<PendingOrder[]>({
    queryKey: ["/api/pending-orders"],
    refetchInterval: connected ? false : 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: number; kitchenStatus: string }) =>
      apiRequest("PATCH", `/api/pending-orders/${id}/kitchen`, { kitchenStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] }),
    onError: (err) => console.error("Kitchen status update failed:", err),
  });

  const kitchenOrders = orders.filter(o => o.kitchenStatus !== "done");

  const grouped: Record<KitchenStatus, PendingOrder[]> = { pending: [], preparing: [], ready: [] };
  for (const o of kitchenOrders) {
    const s = (o.kitchenStatus ?? "pending") as KitchenStatus;
    if (s in grouped) grouped[s].push(o);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white flex flex-col select-none"
      data-testid="kitchen-display-page"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-[#111] shrink-0">
        <div className="flex items-center gap-2.5">
          <ChefHat className="h-4 w-4 text-amber-400" />
          <span className="font-black text-sm tracking-tight">Kitchen Display</span>
          <span
            data-testid="kd-connection-status"
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border",
              connected
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/15 border-red-500/30 text-red-400"
            )}
          >
            {connected
              ? <><Wifi className="h-2.5 w-2.5" /> LIVE</>
              : <><WifiOff className="h-2.5 w-2.5" /> OFFLINE</>}
          </span>
          <span className="text-[11px] font-semibold text-white/30">
            {kitchenOrders.length} active
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-black tabular-nums">{timeStr}</p>
            <p className="text-[10px] text-white/40">{dateStr}</p>
          </div>
          <button
            data-testid="button-kd-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-3">
        {kitchenOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-24 text-white/20">
            <CheckCircle2 className="h-14 w-14 mb-3" strokeWidth={1} />
            <p className="text-xl font-black">All clear!</p>
            <p className="text-sm mt-1">No pending orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
            {(["pending", "preparing", "ready"] as KitchenStatus[]).map(status => {
              const cfg = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex flex-col gap-2 min-h-0">
                  {/* Column header */}
                  <div className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg", cfg.headerBg)}>
                    <span className={cn("font-black text-xs uppercase tracking-widest", cfg.headerText)}>
                      {cfg.label}
                    </span>
                    <span className={cn("ml-auto text-xs font-black px-1.5 py-0.5 rounded-full", cfg.headerBg, cfg.headerText)}>
                      {grouped[status].length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                    {grouped[status].length === 0 ? (
                      <div className="border border-dashed border-white/10 rounded-lg p-4 text-center text-white/15 text-xs">
                        —
                      </div>
                    ) : (
                      grouped[status].map(order => {
                        const isNew = newOrderIds.has(order.id);
                        const elapsed = elapsedMin(order.createdAt);
                        const isUrgent = elapsed >= 15 && status === "pending";

                        return (
                          <div
                            key={order.id}
                            data-testid={`kd-card-${order.id}`}
                            className={cn(
                              "rounded-lg border-2 p-3 space-y-2 transition-all duration-500",
                              isNew
                                ? "border-amber-400 bg-amber-950/40 shadow-[0_0_20px_rgba(251,191,36,0.15)]"
                                : isUrgent
                                  ? "border-red-500/60 bg-red-950/20"
                                  : cn("bg-white/[0.04]", cfg.accent)
                            )}
                          >
                            {/* Card header */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-black text-base leading-none">
                                  {order.orderNumber ? `#${order.orderNumber}` : `#${order.id}`}
                                </span>
                                {isNew && (
                                  <span
                                    data-testid={`kd-new-badge-${order.id}`}
                                    className="px-1.5 py-0.5 text-[9px] font-black bg-amber-400 text-black rounded uppercase tracking-wider animate-bounce"
                                  >
                                    NEW
                                  </span>
                                )}
                                {isUrgent && !isNew && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-black bg-red-500 text-white rounded uppercase tracking-wider">
                                    URGENT
                                  </span>
                                )}
                                {(order as any).orderType === "dine_in" && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/25 rounded uppercase tracking-wide">
                                    Dine In
                                  </span>
                                )}
                                {(order as any).orderType === "takeout" && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/25 rounded uppercase tracking-wide">
                                    Takeout
                                  </span>
                                )}
                                {(order as any).orderType === "delivery" && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/25 rounded uppercase tracking-wide">
                                    Delivery
                                  </span>
                                )}
                              </div>

                              <div className={cn(
                                "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                                isUrgent
                                  ? "bg-red-500/20 text-red-400"
                                  : elapsed >= 10
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-white/10 text-white/40"
                              )}>
                                <Clock className="h-2.5 w-2.5" />
                                {elapsed}m
                              </div>
                            </div>

                            {order.customerName && (
                              <p className="text-[10px] text-white/35 -mt-1">{order.customerName}</p>
                            )}

                            {/* Items */}
                            <ul className="space-y-1">
                              {((order.items as any[]) ?? []).map((item, i) => {
                                const sizeName = item.size?.name ?? item.size ?? null;
                                const mods: string[] = item.modifiers?.map((m: any) => m.name ?? m) ??
                                  (item.modifier ? [item.modifier] : []);
                                return (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="font-black text-amber-400 min-w-[20px] text-xs leading-snug">{item.quantity}×</span>
                                    <span className="text-xs leading-snug">
                                      <span className="font-semibold">{item.name ?? item.product?.name}</span>
                                      {sizeName && <span className="text-white/35 ml-1">({sizeName})</span>}
                                      {mods.length > 0 && (
                                        <span className="text-white/35 ml-1">+{mods.join(", ")}</span>
                                      )}
                                      {item.note && (
                                        <span className="block text-[10px] italic text-amber-400/70 mt-0.5">"{item.note}"</span>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>

                            {order.notes && (
                              <p className="text-[10px] italic text-white/35 border-t border-white/10 pt-1.5">
                                "{order.notes}"
                              </p>
                            )}

                            {/* Action button */}
                            <button
                              data-testid={`kd-advance-${order.id}`}
                              onClick={() => updateMutation.mutate({ id: order.id, kitchenStatus: STATUS_CONFIG[status].next as string })}
                              disabled={updateMutation.isPending && updateMutation.variables?.id === order.id}
                              className={cn(
                                "w-full h-7 rounded-md text-xs font-black transition-all active:scale-95 disabled:opacity-40",
                                cfg.btnClass
                              )}
                            >
                              {cfg.nextLabel}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
