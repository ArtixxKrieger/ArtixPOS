import { useState } from "react";
import { Bell, Package, AlertTriangle, CheckCheck, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const unreadCount = notifs.filter(n => !n.readAt).length;

  const readAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const readOneMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-bold">Stock Alerts</span>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
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

        {/* List */}
        <div className="max-h-80 overflow-y-auto scrollbar-hide">
          {notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/50 gap-2">
              <Bell className="h-8 w-8" strokeWidth={1.2} />
              <p className="text-xs font-medium">No stock alerts</p>
            </div>
          ) : (
            notifs.map(n => (
              <button
                key={n.id}
                onClick={() => { if (!n.readAt) readOneMutation.mutate(n.id); }}
                className={[
                  "w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/30 last:border-0 transition-colors",
                  n.readAt ? "opacity-50 hover:opacity-70" : "hover:bg-muted/30",
                ].join(" ")}
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
                {!n.readAt && (
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
