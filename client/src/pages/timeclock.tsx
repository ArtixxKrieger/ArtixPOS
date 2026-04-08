import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Timer, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TimeLog } from "@shared/schema";

function formatDuration(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const totalMin = Math.floor((end - start) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function groupByDate(logs: TimeLog[]): { date: string; logs: TimeLog[] }[] {
  const map = new Map<string, TimeLog[]>();
  for (const log of logs) {
    const date = formatDate(log.clockIn);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(log);
  }
  return Array.from(map.entries()).map(([date, logs]) => ({ date, logs }));
}

function totalHours(logs: TimeLog[]): string {
  const totalMin = logs
    .filter(l => l.clockOut)
    .reduce((sum, l) => {
      const start = new Date(l.clockIn).getTime();
      const end = new Date(l.clockOut!).getTime();
      return sum + Math.floor((end - start) / 60000);
    }, 0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export default function TimeClockPage() {
  const { toast } = useToast();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: timeLogs = [], isLoading: logsLoading } = useQuery<TimeLog[]>({
    queryKey: ["/api/time-logs"],
  });

  const { data: activeLog, isLoading: activeLoading } = useQuery<TimeLog | null>({
    queryKey: ["/api/time-logs/active"],
  });

  const clockInMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/time-logs/clock-in", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-logs/active"] });
      toast({ title: "Clocked in — have a great shift!" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Failed to clock in", variant: "destructive" }),
  });

  const clockOutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/time-logs/clock-out", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-logs/active"] });
      toast({ title: "Clocked out — see you next time!" });
    },
    onError: () => toast({ title: "Failed to clock out", variant: "destructive" }),
  });

  const isClockedIn = !!activeLog;
  const isLoading = logsLoading || activeLoading;

  // Stats
  const today = new Date().toDateString();
  const todayLogs = timeLogs.filter(l => new Date(l.clockIn).toDateString() === today);
  const thisWeekLogs = timeLogs.filter(l => {
    const d = new Date(l.clockIn);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    return d >= weekStart;
  });

  const groups = groupByDate(timeLogs.slice(0, 50));

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" /> Time Clock
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Track your work hours</p>
      </div>

      {/* Clock card */}
      <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center gap-5 text-center">
        {/* Live clock */}
        <div>
          <p className="text-5xl font-bold tracking-tight tabular-nums">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Status */}
        {isLoading ? (
          <div className="h-8 w-28 rounded-full bg-muted animate-pulse" />
        ) : (
          <Badge className={isClockedIn
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 border text-sm px-4 py-1.5"
            : "bg-muted text-muted-foreground border border-border text-sm px-4 py-1.5"
          }>
            {isClockedIn ? (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Clocked In · {formatDuration(activeLog!.clockIn)}
              </span>
            ) : "Clocked Out"}
          </Badge>
        )}

        {/* Action button */}
        {isClockedIn ? (
          <Button
            size="lg"
            variant="destructive"
            className="w-44 rounded-2xl gap-2"
            onClick={() => clockOutMutation.mutate()}
            disabled={clockOutMutation.isPending}
            data-testid="button-clock-out"
          >
            <LogOut className="h-5 w-5" />
            Clock Out
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-44 rounded-2xl gap-2"
            onClick={() => clockInMutation.mutate()}
            disabled={clockInMutation.isPending}
            data-testid="button-clock-in"
          >
            <LogIn className="h-5 w-5" />
            Clock In
          </Button>
        )}

        {activeLog && (
          <p className="text-xs text-muted-foreground">
            Started at {formatTime(activeLog.clockIn)}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Timer className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Today</span>
          </div>
          <p className="text-2xl font-bold">{totalHours(todayLogs)}</p>
          <p className="text-xs text-muted-foreground">{todayLogs.filter(l => l.clockOut).length} shift{todayLogs.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">This Week</span>
          </div>
          <p className="text-2xl font-bold">{totalHours(thisWeekLogs)}</p>
          <p className="text-xs text-muted-foreground">{thisWeekLogs.filter(l => l.clockOut).length} completed</p>
        </div>
      </div>

      {/* History */}
      <div className="space-y-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">History</h2>
        {logsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No time logs yet</p>
          </div>
        ) : (
          groups.map(({ date, logs }) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-muted-foreground">{date}</p>
                <div className="flex-1 h-px bg-border" />
                <p className="text-xs text-muted-foreground">{totalHours(logs)}</p>
              </div>
              {logs.map(log => (
                <div
                  key={log.id}
                  data-testid={`row-timelog-${log.id}`}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${log.clockOut ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                    <div>
                      <p className="text-sm font-medium">
                        {formatTime(log.clockIn)} → {log.clockOut ? formatTime(log.clockOut) : "Active"}
                      </p>
                      {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                    </div>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-muted-foreground">
                    {formatDuration(log.clockIn, log.clockOut)}
                  </p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
