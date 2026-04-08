import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, intervalToDuration } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { type Shift } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Clock, TrendingUp, Play, Square, Receipt, AlertCircle, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

function useShifts() {
  return useQuery<Shift[]>({ queryKey: ["/api/shifts"] });
}
function useOpenShift() {
  return useQuery<Shift | null>({ queryKey: ["/api/shifts/open"] });
}

function ShiftDuration({ openedAt, closedAt }: { openedAt: string; closedAt?: string | null }) {
  const end = closedAt ? new Date(closedAt) : new Date();
  const duration = intervalToDuration({ start: new Date(openedAt), end });
  const parts: string[] = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}m`);
  if (!parts.length) parts.push("< 1m");
  return <span>{parts.join(" ")}</span>;
}

function AmountCell({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-2.5 flex flex-col items-center min-w-0">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 whitespace-nowrap">{label}</p>
      <p
        className={cn("font-bold tabular-nums text-center w-full min-w-0", color)}
        style={{ fontSize: "clamp(10px, 2.5vw, 13px)", wordBreak: "break-all" }}
      >
        {value}
      </p>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export default function Shifts() {
  const { data: shifts = [], isLoading } = useShifts();
  const { data: openShift } = useOpenShift();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const openMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/shifts/open", { openingBalance, notes: shiftNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts/open"] });
      toast({ title: "Shift opened" });
      setShowOpen(false);
      setOpeningBalance("");
      setShiftNotes("");
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().then((d: any) => d.message).catch(() => "Error opening shift");
      toast({ title: msg || "Error opening shift" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/shifts/${openShift?.id}/close`, { closingBalance, notes: shiftNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shifts/open"] });
      toast({ title: "Shift closed" });
      setShowClose(false);
      setClosingBalance("");
      setShiftNotes("");
    },
    onError: () => toast({ title: "Error closing shift" }),
  });

  const profit = openShift
    ? parseNumeric(openShift.totalSales ?? "0") - parseNumeric(openShift.totalExpenses ?? "0")
    : 0;

  const closedShifts = useMemo(() => shifts.filter(s => s.status === "closed"), [shifts]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    closedShifts.forEach(s => {
      if (s.openedAt) set.add(format(new Date(s.openedAt), "yyyy-MM"));
    });
    return Array.from(set).sort().reverse();
  }, [closedShifts]);

  const filteredShifts = useMemo(() => {
    if (selectedMonth === "all") return closedShifts;
    return closedShifts.filter(s =>
      s.openedAt && format(new Date(s.openedAt), "yyyy-MM") === selectedMonth
    );
  }, [closedShifts, selectedMonth]);

  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedShifts = filteredShifts.slice((safePage - 1) * pageSize, safePage * pageSize);

  function handleMonthChange(val: string) {
    setSelectedMonth(val);
    setPage(1);
  }

  function handlePageSizeChange(val: number) {
    setPageSize(val);
    setPage(1);
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="h-32 skeleton-shimmer rounded-2xl" />
        <div className="h-64 skeleton-shimmer rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 page-enter pb-6">

      {/* Active / idle shift card */}
      {openShift ? (
        <div className="glass-card rounded-3xl p-5 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent border-emerald-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl -z-10" />
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Shift Active</p>
            <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3.5 w-3.5" />
              <ShiftDuration openedAt={openShift.openedAt!} />
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: "Opening Cash", value: formatCurrency(openShift.openingBalance, currency), color: "text-foreground" },
              { label: "Sales", value: formatCurrency(openShift.totalSales ?? "0", currency), color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Net", value: formatCurrency(profit, currency), color: profit >= 0 ? "text-primary" : "text-rose-500" },
            ].map(item => (
              <div key={item.label} className="flex flex-col items-center min-w-0">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 whitespace-nowrap">{item.label}</p>
                <p
                  className={cn("font-bold tabular-nums text-center w-full min-w-0", item.color)}
                  style={{ fontSize: "clamp(11px, 3vw, 18px)", wordBreak: "break-all" }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          <Button
            className="w-full h-11 rounded-2xl font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/25"
            onClick={() => { setClosingBalance(""); setShiftNotes(""); setShowClose(true); }}
            data-testid="button-close-shift"
          >
            <Square className="h-4 w-4 mr-2" /> Close Shift
          </Button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
            <Clock className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="font-semibold mb-1">No active shift</p>
          <p className="text-sm text-muted-foreground/70 mb-4">Open a shift to start tracking sales and cash</p>
          <Button
            onClick={() => { setOpeningBalance(""); setShiftNotes(""); setShowOpen(true); }}
            className="rounded-xl"
            data-testid="button-open-shift"
          >
            <Play className="h-4 w-4 mr-2" /> Open Shift
          </Button>
        </div>
      )}

      {/* Shift History */}
      {closedShifts.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">

          {/* Header with filter controls */}
          <div className="px-4 py-3 border-b border-border/40 space-y-2.5">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-semibold text-sm flex-1">Shift History</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                {filteredShifts.length} shift{filteredShifts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

              {/* Month/year picker */}
              <select
                value={selectedMonth}
                onChange={e => handleMonthChange(e.target.value)}
                data-testid="select-shift-month"
                className="flex-1 min-w-0 h-8 rounded-lg bg-secondary/60 border border-border/40 text-xs font-medium px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="all">All time</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>
                    {format(new Date(m + "-01"), "MMMM yyyy")}
                  </option>
                ))}
              </select>

              {/* Rows per page */}
              <select
                value={pageSize}
                onChange={e => handlePageSizeChange(Number(e.target.value))}
                data-testid="select-shift-page-size"
                className="w-[72px] shrink-0 h-8 rounded-lg bg-secondary/60 border border-border/40 text-xs font-medium px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} / pg</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rows */}
          {pagedShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/20 mb-3" strokeWidth={1.2} />
              <p className="text-sm font-medium text-muted-foreground">No shifts for this period</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {pagedShifts.map(shift => {
                const net = parseNumeric(shift.totalSales ?? "0") - parseNumeric(shift.totalExpenses ?? "0");
                const netStr = (net >= 0 ? "+" : "") + formatCurrency(net, currency);
                return (
                  <div key={shift.id} data-testid={`shift-row-${shift.id}`} className="px-4 py-4">
                    <div className="mb-1">
                      <p className="font-semibold text-sm">{format(new Date(shift.openedAt!), "MMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {format(new Date(shift.openedAt!), "h:mm a")}
                        {" — "}
                        {shift.closedAt ? format(new Date(shift.closedAt), "h:mm a") : ""}
                        {" · "}
                        <ShiftDuration openedAt={shift.openedAt!} closedAt={shift.closedAt} />
                      </p>
                    </div>

                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-3",
                      net >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10"
                    )}>
                      <TrendingUp className={cn("h-3 w-3 shrink-0", net >= 0 ? "text-emerald-500" : "text-rose-500")} />
                      <span
                        className={cn("font-black tabular-nums", net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}
                        style={{ fontSize: "clamp(11px, 3vw, 15px)", wordBreak: "break-all" }}
                      >
                        {netStr}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <AmountCell label="Opening" value={formatCurrency(shift.openingBalance, currency)} />
                      <AmountCell label="Closing" value={formatCurrency(shift.closingBalance ?? "0", currency)} color="text-primary" />
                      <AmountCell label="Sales" value={formatCurrency(shift.totalSales ?? "0", currency)} color="text-emerald-600 dark:text-emerald-400" />
                      <AmountCell label="Expenses" value={formatCurrency(shift.totalExpenses ?? "0", currency)} color="text-rose-500" />
                    </div>

                    {shift.notes && (
                      <p className="text-xs text-muted-foreground/60 mt-2 italic">{shift.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                data-testid="button-shift-prev-page"
                className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-xs text-muted-foreground tabular-nums">
                Page <span className="font-semibold text-foreground">{safePage}</span> of <span className="font-semibold text-foreground">{totalPages}</span>
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                data-testid="button-shift-next-page"
                className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {shifts.length === 0 && !openShift && (
        <div className="glass-card rounded-2xl py-12 text-center flex flex-col items-center gap-3 text-muted-foreground/50">
          <AlertCircle className="h-10 w-10" strokeWidth={1.2} />
          <p className="text-sm font-medium">No shift history yet</p>
        </div>
      )}

      {/* Open Shift Dialog */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Open Shift</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Opening Cash Balance</label>
              <Input
                type="number"
                value={openingBalance}
                onChange={e => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="h-12 text-lg font-bold text-center rounded-xl"
                data-testid="input-opening-balance"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
              <Textarea
                value={shiftNotes}
                onChange={e => setShiftNotes(e.target.value)}
                placeholder="Any notes for this shift..."
                rows={2}
                data-testid="input-shift-notes"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending}
                data-testid="button-confirm-open-shift"
              >
                {openMutation.isPending ? "Opening..." : "Open Shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Close Shift</DialogTitle></DialogHeader>
          {openShift && (
            <div className="space-y-4">
              <div className="glass-card rounded-xl p-4 bg-secondary/40 space-y-2 text-sm">
                {[
                  { label: "Opening balance", value: formatCurrency(openShift.openingBalance, currency), color: "" },
                  { label: "Sales collected", value: formatCurrency(openShift.totalSales ?? "0", currency), color: "text-emerald-600" },
                  {
                    label: "Expected cash",
                    value: formatCurrency(parseNumeric(openShift.openingBalance) + parseNumeric(openShift.totalSales ?? "0"), currency),
                    color: "font-bold",
                  },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-4 min-w-0">
                    <span className="text-muted-foreground shrink-0">{row.label}</span>
                    <span
                      className={cn("tabular-nums font-semibold text-right min-w-0", row.color)}
                      style={{ wordBreak: "break-all", fontSize: "clamp(11px, 3vw, 14px)" }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Actual Closing Cash</label>
                <Input
                  type="number"
                  value={closingBalance}
                  onChange={e => setClosingBalance(e.target.value)}
                  placeholder="0.00"
                  className="h-12 text-lg font-bold text-center rounded-xl"
                  data-testid="input-closing-balance"
                />
              </div>
              {closingBalance && (
                <div className="flex items-center justify-between gap-4 text-sm font-semibold px-1 min-w-0">
                  <span className="text-muted-foreground shrink-0">Variance</span>
                  <span
                    className={cn(
                      "tabular-nums min-w-0 text-right",
                      parseNumeric(closingBalance) >= parseNumeric(openShift.openingBalance) + parseNumeric(openShift.totalSales ?? "0")
                        ? "text-emerald-600" : "text-rose-500"
                    )}
                    style={{ wordBreak: "break-all", fontSize: "clamp(11px, 3vw, 14px)" }}
                  >
                    {formatCurrency(
                      parseNumeric(closingBalance) - parseNumeric(openShift.openingBalance) - parseNumeric(openShift.totalSales ?? "0"),
                      currency
                    )}
                  </span>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
                <Textarea
                  value={shiftNotes}
                  onChange={e => setShiftNotes(e.target.value)}
                  placeholder="Any notes for this shift..."
                  rows={2}
                  data-testid="input-close-shift-notes"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowClose(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending || !closingBalance}
                  data-testid="button-confirm-close-shift"
                >
                  {closeMutation.isPending ? "Closing..." : "Close Shift"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
