import { useState, useRef, useEffect } from "react";
import { Bell, Package, AlertTriangle, CheckCheck, X, RefreshCcw, Check } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSseAlerts } from "@/hooks/use-sse-alerts";
import type { Notification } from "@shared/schema";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

const { connected: sseConnected } = useSseAlerts();

  const { data: notifsData } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 120_000,
  });
  const notifs = notifsData ?? [];

  const unreadCount = notifs.filter(n => !n.readAt).length;

  const readAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const readOneMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const restockMutation = useMutation({
    mutationFn: ({ productId, stock }: { productId: number; stock: number; notifId: number }) =>
      apiRequest("PATCH", `/api/products/${productId}/stock`, { stock }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      if (!notifs.find(n => n.id === vars.notifId)?.readAt) {
        readOneMutation.mutate(vars.notifId);
      }
      setRestockingId(null);
      setRestockQty("");
    },
  });

  useEffect(() => {
    if (restockingId !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [restockingId]);

  function openRestock(notifId: number) {
    setRestockingId(notifId);
    setRestockQty("");
  }

  function cancelRestock() {
    setRestockingId(null);
    setRestockQty("");
  }

  function saveRestock(n: Notification) {
    const qty = parseInt(restockQty, 10);
    if (isNaN(qty) || qty < 0 || !n.productId) return;
    restockMutation.mutate({ productId: n.productId, stock: qty, notifId: n.id });
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) cancelRestock(); }}>
      <PopoverTrigger asChild>
        <button
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent hover:border-border/40 transition-all duration-200"
          aria-label="Notifications"
          data-testid="button-notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5 shadow-sm border border-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0 rounded-2xl shadow-xl border border-border/50 overflow-hidden"
        data-testid="popover-notifications"
      >
        {}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-bold">Stock Alerts</span>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
            {}
            <span
              title={sseConnected ? "Real-time alerts active" : "Reconnecting…"}
              className="flex items-center gap-1"
            >
              <span className={[
                "inline-block h-1.5 w-1.5 rounded-full",
                sseConnected
                  ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)] animate-pulse"
                  : "bg-muted-foreground/30",
              ].join(" ")} />
              {sseConnected && (
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 leading-none">LIVE</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:opacity-70 transition-opacity px-2 py-1 rounded-lg hover:bg-primary/10"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3" />
                All read
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {}
        <div className="max-h-80 overflow-y-auto scrollbar-hide">
          {notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 gap-2">
              <Bell className="h-8 w-8" strokeWidth={1.2} />
              <p className="text-xs font-medium">No stock alerts</p>
            </div>
          ) : (
            notifs.map(n => (
              <div
                key={n.id}
                className={[
                  "border-b border-border/30 last:border-0",
                  n.readAt ? "opacity-50" : "",
                ].join(" ")}
              >
                {}
                <div
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 cursor-pointer"
                  onClick={() => {
                    if (restockingId === n.id) return;
                    if (!n.readAt) readOneMutation.mutate(n.id);
                  }}
                  data-testid={`notification-${n.id}`}
                >
                  <div className={[
                    "h-7 w-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                    n.type === "restock" ? "bg-rose-500/10" : "bg-amber-500/10",
                  ].join(" ")}>
                    {n.type === "restock"
                      ? <Package className="h-3.5 w-3.5 text-rose-500" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight">{n.title}</p>
                    {n.message && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(n.createdAt!)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {!n.readAt && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                    {n.productId && restockingId !== n.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openRestock(n.id); }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded-md transition-colors"
                        data-testid={`button-restock-${n.id}`}
                        title="Quick restock"
                      >
                        <RefreshCcw className="h-2.5 w-2.5" />
                        Restock
                      </button>
                    )}
                  </div>
                </div>

                {}
                {restockingId === n.id && n.productId && (
                  <div className="px-4 pb-3 flex items-center gap-2" data-testid={`restock-form-${n.id}`}>
                    <div className="flex-1 flex items-center gap-1.5 bg-muted/40 border border-border/60 rounded-lg px-2 py-1.5">
                      <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                      <input
                        ref={inputRef}
                        type="number"
                        min="0"
                        value={restockQty}
                        onChange={e => setRestockQty(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveRestock(n);
                          if (e.key === "Escape") cancelRestock();
                        }}
                        placeholder="New quantity"
                        className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        data-testid={`input-restock-qty-${n.id}`}
                      />
                    </div>
                    <button
                      onClick={() => saveRestock(n)}
                      disabled={restockMutation.isPending || !restockQty || parseInt(restockQty) < 0}
                      className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40"
                      data-testid={`button-restock-save-${n.id}`}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={cancelRestock}
                      className="w-7 h-7 rounded-lg bg-muted text-muted-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
                      data-testid={`button-restock-cancel-${n.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
