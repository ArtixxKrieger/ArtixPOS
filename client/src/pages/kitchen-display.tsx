import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { ChefHat, Clock, Maximize2, Minimize2, Volume2, VolumeX, Loader2, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import type { PendingOrder } from "@shared/schema";
import { useKitchenSse } from "@/hooks/use-kitchen-sse";

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
    btnClass: "bg-amber-500 hover:bg-amber-400 text-black",
  },
  preparing: {
    label: "Preparing",
    headerBg: "bg-blue-500/20",
    headerText: "text-blue-300",
    accent: "border-blue-500/50",
    next: "ready",
    nextLabel: "Mark Ready",
    btnClass: "bg-blue-500 hover:bg-blue-400 text-white",
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
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<Set<number>>(new Set());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const now = useClock(); // 1-second tick drives elapsed-time re-renders

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleNewOrder = useCallback((data: { orderId: number; orderNumber: number | null; itemCount: number }) => {
    if (!mutedRef.current) playOrderBell();
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

  const { data: orders = [], isLoading } = useQuery<PendingOrder[]>({
    queryKey: ["/api/pending-orders"],
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, kitchenStatus }: { id: number; kitchenStatus: string }) =>
      apiRequest("PATCH", `/api/pending-orders/${id}/kitchen`, { kitchenStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pending-orders"] }),
    onError: (err) => console.error("Kitchen status update failed:", err),
  });

  // Show all orders not yet marked done — do NOT filter by payment status.
  // Quick-pay (cash/card) F&B orders are "paid" but still need kitchen prep.
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
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-[#111] shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="h-5 w-5 text-amber-400" />
          <span className="font-black text-base tracking-tight">Kitchen Display</span>
          <span
            data-testid="kd-connection-status"
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border",
              connected
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/15 border-red-500/30 text-red-400"
            )}
          >
            {connected
              ? <><Wifi className="h-3 w-3" /> LIVE</>
              : <><WifiOff className="h-3 w-3" /> OFFLINE</>}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right mr-3 hidden sm:block">
            <p className="text-sm font-black tabular-nums">{timeStr}</p>
            <p className="text-[10px] text-white/40">{dateStr}</p>
          </div>

          <span className="text-[11px] font-semibold text-white/40 mr-1">
            {kitchenOrders.length} active
          </span>

          <button
            data-testid="button-kd-mute"
            onClick={() => setMuted(m => !m)}
            title={muted ? "Unmute order bell" : "Mute order bell"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            data-testid="button-kd-fullscreen"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full py-24">
            <Loader2 className="h-10 w-10 animate-spin text-white/30" />
          </div>
        ) : kitchenOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-24 text-white/20">
            <CheckCircle2 className="h-16 w-16 mb-4" strokeWidth={1} />
            <p className="text-2xl font-black">All clear!</p>
            <p className="text-sm mt-2">No pending orders in the kitchen</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {(["pending", "preparing", "ready"] as KitchenStatus[]).map(status => {
              const cfg = STATUS_CONFIG[status];
              return (
                <div key={status} className="flex flex-col gap-3 min-h-0">
                  {/* Column header */}
                  <div className={cn("flex items-center gap-2 px-3 py-2 rounded-xl", cfg.headerBg)}>
                    <span className={cn("font-black text-sm uppercase tracking-widest", cfg.headerText)}>
                      {cfg.label}
                    </span>
                    <span className={cn(
                      "ml-auto text-xs font-black px-2 py-0.5 rounded-full",
                      cfg.headerBg, cfg.headerText
                    )}>
                      {grouped[status].length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-3 overflow-y-auto flex-1">
                    {grouped[status].length === 0 ? (
                      <div className="border border-dashed border-white/10 rounded-xl p-6 text-center text-white/20 text-xs">
                        None
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
                              "rounded-xl border-2 p-4 space-y-3 transition-all duration-500",
                              isNew
                                ? "border-amber-400 bg-amber-950/40 shadow-[0_0_24px_rgba(251,191,36,0.2)]"
                                : isUrgent
                                  ? "border-red-500/60 bg-red-950/20"
                                  : cn("bg-white/[0.04]", cfg.accent)
                            )}
                          >
                            {/* Card header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-lg leading-none">
                                  {order.orderNumber ? `#${order.orderNumber}` : `#${order.id}`}
                                </span>
                                {isNew && (
                                  <span
                                    data-testid={`kd-new-badge-${order.id}`}
                                    className="px-1.5 py-0.5 text-[9px] font-black bg-amber-400 text-black rounded-md uppercase tracking-wider animate-bounce"
                                  >
                                    NEW
                                  </span>
                                )}
                                {isUrgent && !isNew && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-black bg-red-500 text-white rounded-md uppercase tracking-wider">
                                    URGENT
                                  </span>
                                )}
                                {(order as any).orderType === "dine_in" && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/25 rounded-md uppercase tracking-wide">
                                    Dine In
                                  </span>
                                )}
                                {(order as any).orderType === "takeout" && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/25 rounded-md uppercase tracking-wide">
                                    Takeout
                                  </span>
                                )}
                              </div>

                              <div className={cn(
                                "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg shrink-0",
                                isUrgent
                                  ? "bg-red-500/20 text-red-400"
                                  : elapsed >= 10
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-white/10 text-white/50"
                              )}>
                                <Clock className="h-3 w-3" />
                                {elapsed}m
                              </div>
                            </div>

                            {order.customerName && (
                              <p className="text-xs text-white/40 -mt-1">{order.customerName}</p>
                            )}

                            {/* Items */}
                            <ul className="space-y-1.5">
                              {((order.items as any[]) ?? []).map((item, i) => {
                                const sizeName = item.size?.name ?? item.size ?? null;
                                const mods: string[] = item.modifiers?.map((m: any) => m.name ?? m) ??
                                  (item.modifier ? [item.modifier] : []);
                                return (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="font-black text-amber-400 min-w-[22px] text-sm">{item.quantity}×</span>
                                    <span className="text-sm leading-snug">
                                      <span className="font-semibold">{item.name ?? item.product?.name}</span>
                                      {sizeName && <span className="text-white/40 ml-1 text-xs">({sizeName})</span>}
                                      {mods.length > 0 && (
                                        <span className="text-white/40 ml-1 text-xs">+{mods.join(", ")}</span>
                                      )}
                                      {item.note && (
                                        <span className="block text-xs italic text-amber-400/70 mt-0.5">"{item.note}"</span>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>

                            {order.notes && (
                              <p className="text-xs italic text-white/40 border-t border-white/10 pt-2">
                                "{order.notes}"
                              </p>
                            )}

                            {/* Action button — only this card's button shows loading */}
                            <button
                              data-testid={`kd-advance-${order.id}`}
                              onClick={() => updateMutation.mutate({ id: order.id, kitchenStatus: STATUS_CONFIG[status].next as string })}
                              disabled={updateMutation.isPending && updateMutation.variables?.id === order.id}
                              className={cn(
                                "w-full py-2 rounded-lg text-sm font-black transition-all active:scale-95 disabled:opacity-40",
                                cfg.btnClass
                              )}
                            >
                              {updateMutation.isPending && updateMutation.variables?.id === order.id
                                ? <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                                : cfg.nextLabel}
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
