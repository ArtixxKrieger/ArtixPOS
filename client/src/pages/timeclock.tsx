import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Clock, LogIn, LogOut, Timer, Calendar, Coffee, Users, Download, TrendingUp, KeyRound, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import type { TimeLog } from "@shared/schema";

const OT_THRESHOLD_MINS = 480;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function fmtMins(mins: number) {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtMs(ms: number) {
  return fmtMins(Math.floor(ms / 60000));
}
function getWeekBounds(date = new Date()) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
function getNetMins(log: TimeLog): number {
  if (!log.clockOut) return 0;
  const gross = Math.floor((new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime()) / 60000);
  return Math.max(0, gross - (log.breakMinutes ?? 0));
}

export default function TimeClockPage() {
  const { toast } = useToast();
  const { user, isManagerOrAbove, isAdminOrAbove } = useAuth();
  const isPinSession = !!(user as any)?.pinSession;
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState<"me" | "team">("me");
  const [, setLocation] = useLocation();
  const [showClockIn, setShowClockIn] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [clockInNotes, setClockInNotes] = useState("");
  const [clockOutNotes, setClockOutNotes] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: logs = [], isLoading: logsLoading } = useQuery<TimeLog[]>({
    queryKey: ["/api/time-logs"],
  });
  const { data: activeLog, isLoading: activeLoading } = useQuery<TimeLog | null>({
    queryKey: ["/api/time-logs/active"],
    refetchInterval: 30000,
  });
  const canSeeTeam = isManagerOrAbove || isAdminOrAbove;
  const { data: teamLogs = [], isLoading: teamLoading } = useQuery<any[]>({
    queryKey: ["/api/time-logs/team"],
    enabled: canSeeTeam,
  });

  function invalidateLogs() {
    queryClient.invalidateQueries({ queryKey: ["/api/time-logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/time-logs/active"] });
    queryClient.invalidateQueries({ queryKey: ["/api/time-logs/team"] });
  }

  const clockInMutation = useMutation({
    mutationFn: (notes: string) => apiRequest("POST", "/api/time-logs/clock-in", { notes }),
    onSuccess: () => { invalidateLogs(); toast({ title: "Clocked in — have a great shift!" }); setShowClockIn(false); setClockInNotes(""); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to clock in", variant: "destructive" }),
  });
  const clockOutMutation = useMutation({
    mutationFn: async (notes: string) => {
      if (isPinSession) {
        // For PIN sessions: the staff-pin clockout endpoint closes the time log
        // AND revokes the JWT in one call, then we redirect to the kiosk screen.
        return apiRequest("POST", "/api/staff-pin/clockout", { notes });
      }
      return apiRequest("POST", "/api/time-logs/clock-out", { notes });
    },
    onSuccess: () => {
      setShowClockOut(false);
      setClockOutNotes("");
      // All sessions (owner, manager, cashier, PIN) return to the kiosk after
      // clock-out so the next person can log in.  For PIN sessions the JWT was
      // already revoked server-side; for regular sessions the cache is cleared
      // here and the kiosk roster still loads from its localStorage fallback.
      toast({ title: "Clocked out — great work! See you next shift." });
      queryClient.cancelQueries();
      queryClient.clear();
      window.location.replace("/staff-clock-in");
    },
    onError: () => toast({ title: "Failed to clock out", variant: "destructive" }),
  });
  const breakStartMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/time-logs/break-start", {}),
    onSuccess: async () => {
      toast({ title: "Break started — enjoy your rest!" });
      if (isPinSession) {
        // Lock the screen: revoke the PIN session JWT without closing the time log.
        // When the employee returns and enters their PIN, the system finds the open
        // log (with breakStart set) and lets them end the break.
        try {
          await apiRequest("POST", "/api/staff-pin/lock-screen", {});
        } catch { /* best-effort */ }
        queryClient.cancelQueries();
        queryClient.clear();
        window.location.replace("/staff-clock-in");
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/time-logs/active"] });
      }
    },
    onError: () => toast({ title: "Could not start break", variant: "destructive" }),
  });

  const lockScreenMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/staff-pin/lock-screen", {}),
    onSuccess: () => {
      queryClient.cancelQueries();
      queryClient.clear();
      window.location.replace("/staff-clock-in");
    },
    onError: () => toast({ title: "Could not lock screen", variant: "destructive" }),
  });
  const breakEndMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/time-logs/break-end", {}),
    onSuccess: () => { invalidateLogs(); toast({ title: "Break ended — welcome back!" }); },
    onError: () => toast({ title: "Could not end break", variant: "destructive" }),
  });

  const isClockedIn = !!activeLog;
  const isOnBreak = !!(activeLog?.breakStart);
  const grossElapsedMs = activeLog ? now.getTime() - new Date(activeLog.clockIn).getTime() : 0;
  const breakAccumMs = (activeLog?.breakMinutes ?? 0) * 60000;
  const currentBreakMs = isOnBreak && activeLog?.breakStart ? now.getTime() - new Date(activeLog.breakStart).getTime() : 0;
  const netElapsedMs = Math.max(0, grossElapsedMs - breakAccumMs - currentBreakMs);

  const today = new Date().toDateString();
  const todayLogs = logs.filter(l => new Date(l.clockIn).toDateString() === today);
  const todayNetMins = todayLogs.filter(l => l.clockOut).reduce((s, l) => s + getNetMins(l), 0);
  const todayOTMins = Math.max(0, todayNetMins - OT_THRESHOLD_MINS);

  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const thisWeekLogs = logs.filter(l => { const d = new Date(l.clockIn); return d >= weekStart && d <= weekEnd; });
  const weekNetMins = thisWeekLogs.filter(l => l.clockOut).reduce((s, l) => s + getNetMins(l), 0);

  const weekDayMins = DAY_LABELS.map((_, i) => {
    return thisWeekLogs.filter(l => new Date(l.clockIn).getDay() === i && l.clockOut).reduce((s, l) => s + getNetMins(l), 0);
  });
  const maxDayMins = Math.max(...weekDayMins, OT_THRESHOLD_MINS);

  const groups = useMemo(() => {
    const map = new Map<string, TimeLog[]>();
    for (const log of logs.slice(0, 80)) {
      const date = fmtDate(log.clockIn);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(log);
    }
    return Array.from(map.entries()).map(([date, ls]) => ({ date, ls }));
  }, [logs]);

  const teamByUser = useMemo(() => {
    const map = new Map<string, { name: string; email: string; logs: any[] }>();
    for (const log of teamLogs) {
      if (!map.has(log.userId)) map.set(log.userId, { name: log.userName || "Unknown", email: log.userEmail || "", logs: [] });
      map.get(log.userId)!.logs.push(log);
    }
    return Array.from(map.values());
  }, [teamLogs]);

  function exportCSV() {
    const rows = [
      ["Date", "Clock In", "Clock Out", "Break (min)", "Net Hours", "Clock-In Notes", "Clock-Out Notes"],
      ...logs.filter(l => l.clockOut).map(l => [
        new Date(l.clockIn).toLocaleDateString(),
        fmtTime(l.clockIn),
        l.clockOut ? fmtTime(l.clockOut) : "",
        String(l.breakMinutes ?? 0),
        (getNetMins(l) / 60).toFixed(2),
        l.notes ?? "",
        l.clockOutNotes ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isLoading = activeLoading || logsLoading;

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" /> Time Clock
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track shifts, breaks &amp; team hours</p>
        </div>
        <div className="flex items-center gap-2">
          {isPinSession ? (
            <button
              data-testid="button-lock-screen"
              onClick={() => lockScreenMutation.mutate()}
              disabled={lockScreenMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground border border-border/40 transition-colors disabled:opacity-50"
              title="Lock screen — return to PIN login"
            >
              <Lock className="h-3.5 w-3.5" /> Lock Screen
            </button>
          ) : (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Kiosk launch banner — shown to managers when not in a PIN session */}
      {!isPinSession && isManagerOrAbove && (
        <button
          data-testid="button-launch-kiosk-banner"
          onClick={() => setLocation("/staff-clock-in")}
          className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-primary/10 hover:bg-primary/15 border border-primary/25 transition-colors text-left group"
        >
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/30 transition-colors">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm">Launch Staff Kiosk</p>
            <p className="text-xs text-muted-foreground mt-0.5">Employees tap their name and enter their PIN to clock in or out</p>
          </div>
          <div className="text-xs font-semibold text-primary shrink-0">Open →</div>
        </button>
      )}

      {/* Tab switcher */}
      {canSeeTeam && (
        <div className="flex gap-1 p-1 bg-secondary/40 rounded-2xl border border-border/30">
          {(["me", "team"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-xl transition-all",
                tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t === "team" && <Users className="h-3.5 w-3.5" />}
              {t === "me" ? "My Hours" : "Team"}
            </button>
          ))}
        </div>
      )}

      {/* ─── MY HOURS TAB ─── */}
      {tab === "me" && (
        <>
          {/* Clock card */}
          <div className="bg-card border border-border rounded-3xl p-6 flex flex-col items-center gap-5 text-center">
            <div>
              <p className="text-5xl font-bold tracking-tight tabular-nums">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>

            {/* Status badge */}
            {isOnBreak ? (
              <div className="flex flex-col items-center gap-1.5">
                <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 border text-sm px-4 py-1.5">
                  <Coffee className="h-3.5 w-3.5 mr-1.5" />
                  On Break · {fmtMs(currentBreakMs)}
                </Badge>
                <p className="text-[11px] text-muted-foreground">
                  Shift started at {activeLog && fmtTime(activeLog.clockIn)} · {fmtMs(netElapsedMs)} net
                </p>
                {(activeLog?.breakMinutes ?? 0) > 0 && (
                  <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                    {activeLog!.breakMinutes}m previously taken
                  </p>
                )}
              </div>
            ) : isClockedIn ? (
              <div className="flex flex-col items-center gap-1.5">
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 border text-sm px-4 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                  Clocked In · {fmtMs(netElapsedMs)}
                </Badge>
                {(activeLog?.breakMinutes ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {activeLog!.breakMinutes}m break taken · {fmtMs(grossElapsedMs)} gross
                  </p>
                )}
                {netElapsedMs > OT_THRESHOLD_MINS * 60000 && (
                  <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20 border text-xs px-3 py-1">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    OT +{fmtMs(netElapsedMs - OT_THRESHOLD_MINS * 60000)}
                  </Badge>
                )}
              </div>
            ) : (
              <Badge className="bg-muted text-muted-foreground border border-border text-sm px-4 py-1.5">
                Clocked Out
              </Badge>
            )}

            {/* Action buttons */}
            {!isLoading && (
              isClockedIn ? (
                <div className="flex flex-col gap-2.5 w-full max-w-xs">
                  {isOnBreak ? (
                    <Button
                      size="lg"
                      className="w-full rounded-2xl gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => breakEndMutation.mutate()}
                      disabled={breakEndMutation.isPending}
                    >
                      <Coffee className="h-5 w-5" /> End Break
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full rounded-2xl gap-2 border-amber-400/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                      onClick={() => breakStartMutation.mutate()}
                      disabled={breakStartMutation.isPending}
                    >
                      <Coffee className="h-5 w-5" /> Start Break
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="destructive"
                    className="w-full rounded-2xl gap-2"
                    onClick={() => { setClockOutNotes(""); setShowClockOut(true); }}
                    disabled={isOnBreak || clockOutMutation.isPending}
                    data-testid="button-clock-out"
                  >
                    <LogOut className="h-5 w-5" /> Clock Out
                  </Button>
                  {isOnBreak && (
                    <p className="text-[11px] text-center text-muted-foreground">End your break before clocking out</p>
                  )}
                </div>
              ) : (
                <Button
                  size="lg"
                  className="w-44 rounded-2xl gap-2"
                  onClick={() => { setClockInNotes(""); setShowClockIn(true); }}
                  data-testid="button-clock-in"
                >
                  <LogIn className="h-5 w-5" /> Clock In
                </Button>
              )
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                <Timer className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">Today</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{fmtMins(todayNetMins)}</p>
              <p className="text-[10px] text-muted-foreground">net hours</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">This Week</span>
              </div>
              <p className="text-xl font-bold tabular-nums">{fmtMins(weekNetMins)}</p>
              <p className="text-[10px] text-muted-foreground">net hours</p>
            </div>
            <div className={cn("border rounded-2xl p-4 transition-colors",
              todayOTMins > 0 ? "bg-orange-500/10 border-orange-400/30" : "bg-card border-border")}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className={cn("h-3.5 w-3.5", todayOTMins > 0 ? "text-orange-500" : "text-muted-foreground")} />
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Overtime</span>
              </div>
              <p className={cn("text-xl font-bold tabular-nums", todayOTMins > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
                {todayOTMins > 0 ? fmtMins(todayOTMins) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">today</p>
            </div>
          </div>

          {/* Weekly grid */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-3">This Week</h3>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((day, i) => {
                const mins = weekDayMins[i];
                const pct = maxDayMins > 0 ? (mins / maxDayMins) * 100 : 0;
                const isToday = new Date().getDay() === i;
                const hasOT = mins > OT_THRESHOLD_MINS;
                return (
                  <div key={day} className="flex flex-col items-center gap-1.5">
                    <div className="w-full flex flex-col justify-end" style={{ height: 72 }}>
                      <div
                        className={cn("w-full rounded-md transition-all",
                          mins === 0 ? "bg-border/40" : hasOT ? "bg-orange-500/70" : isToday ? "bg-primary" : "bg-primary/50"
                        )}
                        style={{ height: mins > 0 ? `${Math.max(6, pct)}%` : 4 }}
                      />
                    </div>
                    <span className={cn("text-[10px] font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>
                      {day}
                    </span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {mins > 0 ? (mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* History */}
          <div className="space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">History</h2>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-9 w-9 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No time logs yet</p>
              </div>
            ) : (
              groups.map(({ date, ls }) => {
                const dayNetMins = ls.filter(l => l.clockOut).reduce((s, l) => s + getNetMins(l), 0);
                const dayOT = Math.max(0, dayNetMins - OT_THRESHOLD_MINS);
                return (
                  <div key={date} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <p className="text-xs font-semibold text-muted-foreground shrink-0">{date}</p>
                      <div className="flex-1 h-px bg-border" />
                      <div className="flex items-center gap-2 shrink-0">
                        {dayOT > 0 && (
                          <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                            +{fmtMins(dayOT)} OT
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">{fmtMins(dayNetMins)} net</p>
                      </div>
                    </div>
                    {ls.map(log => {
                      const netMins = getNetMins(log);
                      const brkMins = log.breakMinutes ?? 0;
                      const grossMins = log.clockOut
                        ? Math.floor((new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime()) / 60000)
                        : 0;
                      return (
                        <div
                          key={log.id}
                          data-testid={`row-timelog-${log.id}`}
                          className="bg-card border border-border rounded-xl px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn("h-2 w-2 rounded-full shrink-0",
                                log.clockOut ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                  {fmtTime(log.clockIn)} → {log.clockOut ? fmtTime(log.clockOut) : "Active"}
                                </p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                  {log.notes && (
                                    <p className="text-xs text-muted-foreground truncate">{log.notes}</p>
                                  )}
                                  {log.clockOutNotes && (
                                    <p className="text-xs text-muted-foreground/70 truncate italic">{log.clockOutNotes}</p>
                                  )}
                                  {brkMins > 0 && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                      <Coffee className="h-2.5 w-2.5" /> {brkMins}m break
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold tabular-nums">{log.clockOut ? fmtMins(netMins) : "—"}</p>
                              {brkMins > 0 && log.clockOut && (
                                <p className="text-[10px] text-muted-foreground tabular-nums">{fmtMins(grossMins)} gross</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ─── TEAM TAB ─── */}
      {tab === "team" && canSeeTeam && (
        <div className="space-y-3">
          {teamByUser.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-9 w-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No team activity yet</p>
            </div>
          ) : (
            teamByUser.map(member => {
              const memberTodayLogs = member.logs.filter((l: any) => new Date(l.clockIn).toDateString() === today);
              const memberActive = member.logs.find((l: any) => !l.clockOut);
              const memberActiveTodayMins = memberActive && new Date(memberActive.clockIn).toDateString() === today
                ? Math.max(0, Math.floor((now.getTime() - new Date(memberActive.clockIn).getTime()) / 60000) - (memberActive.breakMinutes ?? 0))
                : 0;
              const memberTodayNet = memberTodayLogs
                .filter((l: any) => l.clockOut)
                .reduce((s: number, l: any) => {
                  const gross = Math.floor((new Date(l.clockOut).getTime() - new Date(l.clockIn).getTime()) / 60000);
                  return s + Math.max(0, gross - (l.breakMinutes ?? 0));
                }, 0) + memberActiveTodayMins;
              const memberOnBreak = !!(memberActive?.breakStart);
              return (
                <div key={member.name} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                        memberOnBreak ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                          : memberActive ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-secondary text-muted-foreground"
                      )}>
                        {(member.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </div>
                    <Badge className={cn("text-[10px] px-2.5 py-0.5 border shrink-0",
                      memberOnBreak ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-400/30"
                        : memberActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-400/30"
                        : "bg-secondary text-muted-foreground border-border"
                    )}>
                      {memberOnBreak ? "On Break" : memberActive ? "Active" : "Off Duty"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2.5 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{fmtMins(memberTodayNet)}</span> today
                    </span>
                    {memberActive && (
                      <span>
                        since <span className="font-semibold text-foreground">{fmtTime(memberActive.clockIn)}</span>
                      </span>
                    )}
                    {memberOnBreak && memberActive?.breakStart && (
                      <span className="text-amber-600 dark:text-amber-400">
                        break since <span className="font-semibold">{fmtTime(memberActive.breakStart)}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Clock In dialog */}
      <Dialog open={showClockIn} onOpenChange={setShowClockIn}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" /> Clock In
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Textarea
              placeholder="Add a note for this shift (optional)..."
              value={clockInNotes}
              onChange={e => setClockInNotes(e.target.value)}
              className="resize-none rounded-xl text-sm"
              rows={3}
            />
            <Button
              className="w-full rounded-xl"
              onClick={() => clockInMutation.mutate(clockInNotes)}
              disabled={clockInMutation.isPending}
            >
              <LogIn className="h-4 w-4 mr-2" /> Clock In Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clock Out dialog */}
      <Dialog open={showClockOut} onOpenChange={setShowClockOut}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-destructive" /> Clock Out
            </DialogTitle>
          </DialogHeader>
          {activeLog && (
            <div className="bg-secondary/40 rounded-xl p-3 text-sm space-y-1 mb-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net time</span>
                <span className="font-bold">{fmtMs(netElapsedMs)}</span>
              </div>
              {(activeLog.breakMinutes ?? 0) > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Break taken</span>
                  <span className="font-semibold">{activeLog.breakMinutes}m</span>
                </div>
              )}
              {netElapsedMs > OT_THRESHOLD_MINS * 60000 && (
                <div className="flex justify-between text-orange-500 font-bold">
                  <span>Overtime</span>
                  <span>+{fmtMs(netElapsedMs - OT_THRESHOLD_MINS * 60000)}</span>
                </div>
              )}
            </div>
          )}
          <div className="space-y-3">
            <Textarea
              placeholder="End-of-shift notes (optional)..."
              value={clockOutNotes}
              onChange={e => setClockOutNotes(e.target.value)}
              className="resize-none rounded-xl text-sm"
              rows={3}
            />
            <Button
              variant="destructive"
              className="w-full rounded-xl"
              onClick={() => clockOutMutation.mutate(clockOutNotes)}
              disabled={clockOutMutation.isPending}
            >
              <LogOut className="h-4 w-4 mr-2" /> Confirm Clock Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
