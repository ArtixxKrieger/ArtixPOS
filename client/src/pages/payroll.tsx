import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, nativeFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Banknote, Clock, TrendingUp, Users, Pencil, Save, Calendar,
  Wallet, FileDown, Printer, Search, ChevronDown, ChevronRight,
  CheckCircle2, CircleDot, Circle, Trash2, Plus, AlertCircle,
  Receipt, CreditCard, ArrowRight, Sparkles, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type WageType = "none" | "hourly" | "monthly" | "commission";
type StaffWage = { id: string; name: string | null; email: string | null; role: string; wageType: WageType | null; wageRate: string | null; commissionPercent: string | null };
type ComputedEntry = { userId: string; name: string | null; email: string | null; role: string; wageType: WageType; wageRate: number; commissionPercent: number; hoursWorked: number; salesAmount: number; payout: number; notes: string };
type PayrollResponse = { from: string; to: string; entries: ComputedEntry[]; totals: { totalPayout: number; totalHours: number; totalCommissionable: number; staffCount: number } };
type PayrollPeriod = { id: number; name: string; startDate: string; endDate: string; status: "draft" | "finalized" | "paid"; totalAmount: string | null; notes: string | null; createdAt: string; finalizedAt: string | null; paidAt: string | null };
type PayrollEntry = { id: number; periodId: number; employeeUserId: string; employeeName: string; wageType: string; wageRate: string; hoursWorked: string | null; baseAmount: string; commissionAmount: string | null; tipAmount: string | null; bonusAmount: string | null; deductionAmount: string | null; advanceAmount: string | null; netAmount: string; notes: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayISO = (d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); };
const startOfLastWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 7); return d.toISOString().slice(0, 10); };
const endOfLastWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 1); return d.toISOString().slice(0, 10); };
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const startOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10); };
const endOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10); };
const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtShort = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const blob = new Blob([[h.join(","), ...rows.map(r => h.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

const AVATAR_COLORS = ["bg-violet-500","bg-emerald-500","bg-rose-500","bg-amber-500","bg-sky-500","bg-indigo-500","bg-pink-500","bg-teal-500"];
function avatarColor(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

// ── Tiny components ───────────────────────────────────────────────────────────

function Av({ name, id, sm }: { name: string; id: string; sm?: boolean }) {
  return (
    <div className={`${sm ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"} rounded-full ${avatarColor(id)} text-white flex items-center justify-center font-bold shrink-0`}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function StatusDot({ status, t }: { status: string; t: any }) {
  const cfg = {
    draft:     { dot: "bg-slate-400",   text: "text-slate-500 dark:text-slate-400",   label: t("payroll.periods.statusDraft") },
    finalized: { dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",   label: t("payroll.periods.statusFinalized") },
    paid:      { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: t("payroll.periods.statusPaid") },
  }[status] ?? { dot: "bg-slate-400", text: "text-slate-500", label: status };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════

export default function PayrollPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = (settings as any)?.currency || "$";
  const isOwner = user?.role === "owner";

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [preset, setPreset] = useState("thisMonth");
  const [staffSearch, setStaffSearch] = useState("");
  const [wageFilter, setWageFilter] = useState("all");
  const [paystubTarget, setPaystubTarget] = useState<{ staff: StaffWage; entry: ComputedEntry } | null>(null);
  const [editingWage, setEditingWage] = useState<StaffWage | null>(null);
  const [wageForm, setWageForm] = useState({ wageType: "none" as WageType, wageRate: "0", commissionPercent: "0" });
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [entryForm, setEntryForm] = useState<Partial<PayrollEntry>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: string; periodId: number; name: string } | null>(null);

  // Queries
  const { data: staff = [], isFetching: staffFetching } = useQuery<StaffWage[]>({
    queryKey: ["/api/payroll/staff"],
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const { data: payroll, isFetching: payrollFetching } = useQuery<PayrollResponse>({
    queryKey: ["/api/payroll/compute", from, to],
    queryFn: async () => {
      const r = await nativeFetch(`/api/payroll/compute?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const { data: periods = [], isFetching: periodsFetching } = useQuery<PayrollPeriod[]>({
    queryKey: ["/api/payroll/periods"],
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const { data: periodEntries = [] } = useQuery<PayrollEntry[]>({
    queryKey: ["/api/payroll/periods", expandedPeriod, "entries"],
    queryFn: async () => {
      if (!expandedPeriod) return [];
      const r = await nativeFetch(`/api/payroll/periods/${expandedPeriod}/entries`);
      return r.ok ? r.json() : [];
    },
    enabled: !!expandedPeriod,
  });

  // Mutations
  const updateWageMutation = useMutation({
    mutationFn: async (v: { id: string; data: typeof wageForm }) => (await apiRequest("PUT", `/api/payroll/staff/${v.id}`, v.data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/staff"] }); queryClient.invalidateQueries({ queryKey: ["/api/payroll/compute"] }); setEditingWage(null); toast({ title: t("payroll.wage.updated") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (d: typeof periodForm) => (await apiRequest("POST", "/api/payroll/periods", d)).json(),
    onSuccess: (p) => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); setCreatePeriodOpen(false); setPeriodForm({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" }); setExpandedPeriod(p.id); toast({ title: t("payroll.periods.created_toast") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (v: { id: number; data: Partial<PayrollEntry> }) => (await apiRequest("PUT", `/api/payroll/entries/${v.id}`, v.data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods", expandedPeriod, "entries"] }); queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); setEditingEntry(null); toast({ title: t("payroll.entries.updated") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({ mutationFn: async (id: number) => (await apiRequest("POST", `/api/payroll/periods/${id}/finalize`, {})).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); setConfirmAction(null); toast({ title: t("payroll.periods.finalized_toast") }); } });
  const markPaidMutation = useMutation({ mutationFn: async (id: number) => (await apiRequest("POST", `/api/payroll/periods/${id}/pay`, {})).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); setConfirmAction(null); toast({ title: t("payroll.periods.paid_toast") }); } });
  const deletePeriodMutation = useMutation({ mutationFn: async (id: number) => apiRequest("DELETE", `/api/payroll/periods/${id}`, {}), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); if (expandedPeriod === confirmAction?.periodId) setExpandedPeriod(null); setConfirmAction(null); toast({ title: t("payroll.periods.deleted_toast") }); } });

  // Derived
  const entriesByUser = useMemo(() => { const m = new Map<string, ComputedEntry>(); payroll?.entries.forEach(e => m.set(e.userId, e)); return m; }, [payroll]);
  const filteredStaff = useMemo(() => staff.filter(s => { const q = staffSearch.toLowerCase(); return (!q || (s.name || s.email || "").toLowerCase().includes(q)) && (wageFilter === "all" || (s.wageType ?? "none") === wageFilter); }), [staff, staffSearch, wageFilter]);
  const totals = payroll?.totals ?? { totalPayout: 0, totalHours: 0, totalCommissionable: 0, staffCount: 0 };

  function applyPreset(p: string) {
    setPreset(p);
    const map: Record<string, [string, string]> = { thisWeek: [startOfWeek(), todayISO()], lastWeek: [startOfLastWeek(), endOfLastWeek()], thisMonth: [startOfMonth(), todayISO()], lastMonth: [startOfLastMonth(), endOfLastMonth()], last30: [todayISO(-30), todayISO()] };
    if (map[p]) { setFrom(map[p][0]); setTo(map[p][1]); }
  }

  function roleLabel(role: string) { const k = `payroll.roles.${role}`; const v = t(k); return v === k ? role : v; }

  function exportComputeCSV() {
    if (!payroll) return;
    downloadCSV(`payroll-${from}-to-${to}.csv`, payroll.entries.map(e => ({ [t("payroll.entries.employee")]: e.name || e.email || e.userId, [t("payroll.paystub.role")]: roleLabel(e.role), [t("payroll.wage.type")]: e.wageType, [t("payroll.paystub.hoursWorked")]: e.hoursWorked, [t("payroll.paystub.salesAmount")]: e.salesAmount, [t("payroll.paystub.netPay")]: e.payout })));
    toast({ title: t("payroll.export.csvExported") });
  }

  function exportPeriodCSV() {
    if (!periodEntries.length) return;
    downloadCSV(`payroll-period.csv`, periodEntries.map(e => ({ [t("payroll.entries.employee")]: e.employeeName, [t("payroll.wage.type")]: e.wageType, [t("payroll.entries.hours")]: e.hoursWorked || "0", [t("payroll.entries.base")]: e.baseAmount, [t("payroll.entries.commission")]: e.commissionAmount || "0", [t("payroll.entries.tips")]: e.tipAmount || "0", [t("payroll.entries.bonus")]: e.bonusAmount || "0", [t("payroll.entries.deductions")]: e.deductionAmount || "0", [t("payroll.entries.advance")]: e.advanceAmount || "0", [t("payroll.entries.net")]: e.netAmount })));
    toast({ title: t("payroll.export.csvExported") });
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-center">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("payroll.ownerOnly")}</p>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 page-enter">

      {/* ── MINIMAL HEADER ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t("payroll.title")}</h1>
          <p className="text-xs text-muted-foreground">{fmtShort(from)} {t("payroll.dateTo")} {fmtShort(to)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t("payroll.stats.totalPayout")}</p>
          <p className="text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.totalPayout, currency)}</p>
        </div>
      </div>

      {/* ── STATS ROW ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t("payroll.stats.totalHours"), value: `${totals.totalHours.toFixed(1)} ${t("payroll.staff.hrs")}`, icon: Clock },
          { label: t("payroll.stats.commissionSales"), value: formatCurrency(totals.totalCommissionable, currency), icon: TrendingUp },
          { label: t("payroll.stats.staffCount"), value: `${totals.staffCount} ${t("payroll.stats.onPayroll")}`, icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl bg-muted/40 border border-border/40 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
            <p className="text-xs font-bold truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* ── TABS ────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="compute">
        <TabsList className="w-full h-9 rounded-lg p-0.5 bg-muted/50">
          <TabsTrigger value="compute" className="flex-1 h-8 rounded-md text-xs font-semibold" data-testid="tab-quick-compute">
            <TrendingUp className="h-3 w-3 mr-1" />{t("payroll.tabs.quickCompute")}
          </TabsTrigger>
          <TabsTrigger value="periods" className="flex-1 h-8 rounded-md text-xs font-semibold" data-testid="tab-pay-periods">
            <Calendar className="h-3 w-3 mr-1" />{t("payroll.tabs.payPeriods")}
            {periods.length > 0 && <span className="ml-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black px-1 flex items-center justify-center">{periods.length}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── QUICK COMPUTE ─────────────────────────────────────────────────── */}
        <TabsContent value="compute" className="space-y-3 mt-3">

          {/* Date range */}
          <div className="rounded-xl bg-card border border-border/40 p-3 space-y-2.5">
            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {(["thisWeek","lastWeek","thisMonth","lastMonth","last30"] as const).map(p => (
                <button key={p} onClick={() => applyPreset(p)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`} data-testid={`btn-preset-${p}`}>
                  {t(`payroll.presets.${p}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.startDate")}</label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreset("custom"); }} className="h-8 text-xs" data-testid="input-payroll-from" />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.endDate")}</label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPreset("custom"); }} className="h-8 text-xs" data-testid="input-payroll-to" />
              </div>
            </div>
          </div>

          {/* Staff list */}
          <div className="rounded-xl bg-card border border-border/40 overflow-hidden">
            {/* Toolbar */}
            <div className="px-3 py-2.5 border-b border-border/30 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder={t("payroll.staff.searchPlaceholder")} className="h-7 pl-6 text-[11px] bg-muted/40 border-0" data-testid="input-staff-search" />
              </div>
              <Select value={wageFilter} onValueChange={setWageFilter}>
                <SelectTrigger className="h-7 text-[11px] w-28 bg-muted/40 border-0" data-testid="select-wage-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("payroll.staff.allWageTypes")}</SelectItem>
                  <SelectItem value="none">{t("payroll.wage.noWage")}</SelectItem>
                  <SelectItem value="hourly">{t("payroll.staff.hourly")}</SelectItem>
                  <SelectItem value="monthly">{t("payroll.staff.monthlySalary")}</SelectItem>
                  <SelectItem value="commission">{t("payroll.staff.commission")}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={exportComputeCSV} data-testid="btn-export-csv" title={t("payroll.export.exportCSV")}>
                <FileDown className="h-3.5 w-3.5" />
              </Button>
            </div>

            {filteredStaff.length === 0 && !staffFetching && !payrollFetching ? (
              <div className="py-10 text-center text-xs text-muted-foreground space-y-1">
                <Users className="h-7 w-7 mx-auto text-muted-foreground/30 mb-2" />
                {staffSearch || wageFilter !== "all" ? t("payroll.staff.noMatch") : <><p>{t("payroll.staff.noStaffYet")}</p><p className="text-muted-foreground/50">{t("payroll.staff.noStaffHint")}</p></>}
              </div>
            ) : (
              <div className="divide-y divide-border/20">
                {filteredStaff.map(s => {
                  const entry = entriesByUser.get(s.id);
                  const wt = s.wageType ?? "none";
                  const wageLabel = wt === "hourly" ? `${formatCurrency(s.wageRate || "0", currency)}/hr` : wt === "monthly" ? `${formatCurrency(s.wageRate || "0", currency)}/mo` : wt === "commission" ? `${parseFloat(s.commissionPercent || "0").toFixed(1)}%` : null;
                  return (
                    <div key={s.id} className="px-3 py-2.5 flex items-center gap-2.5" data-testid={`row-payroll-${s.id}`}>
                      <Av name={s.name || s.email || "?"} id={s.id} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold truncate">{s.name || s.email}</p>
                          <span className="text-[9px] text-muted-foreground/60 font-medium shrink-0">{roleLabel(s.role)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {wageLabel && <span className="text-[10px] text-muted-foreground">{t(`payroll.staff.${wt === "monthly" ? "monthlySalary" : wt}`) || wt} · {wageLabel}</span>}
                          {entry && entry.hoursWorked > 0 && <span className="text-[10px] text-muted-foreground">{entry.hoursWorked.toFixed(1)}{t("payroll.staff.hrs")}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-1">
                        <p className={`text-sm font-bold tabular-nums ${(entry?.payout ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}`}>
                          {formatCurrency(entry?.payout ?? 0, currency)}
                        </p>
                        <div className="flex">
                          {entry && (entry.payout ?? 0) > 0 && (
                            <Button size="icon" variant="ghost" onClick={() => setPaystubTarget({ staff: s, entry })} className="h-7 w-7 text-muted-foreground" data-testid={`btn-paystub-${s.id}`}>
                              <Receipt className="h-3 w-3" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { setWageForm({ wageType: (s.wageType ?? "none") as WageType, wageRate: s.wageRate ?? "0", commissionPercent: s.commissionPercent ?? "0" }); setEditingWage(s); }} className="h-7 w-7 text-muted-foreground" data-testid={`btn-edit-wage-${s.id}`}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── PAY PERIODS ───────────────────────────────────────────────────── */}
        <TabsContent value="periods" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t("payroll.periods.title")}</p>
            <Button size="sm" className="h-7 text-xs gap-1 px-3" onClick={() => setCreatePeriodOpen(true)} data-testid="btn-new-period">
              <Plus className="h-3 w-3" />{t("payroll.periods.newPeriod")}
            </Button>
          </div>

          {periods.length === 0 && !periodsFetching ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center space-y-2">
              <Calendar className="h-7 w-7 mx-auto text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">{t("payroll.periods.noPeriods")}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCreatePeriodOpen(true)}>
                <Plus className="h-3 w-3" />{t("payroll.periods.newPeriod")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {periods.map(period => {
                const isExp = expandedPeriod === period.id;
                return (
                  <div key={period.id} className="rounded-xl bg-card border border-border/40 overflow-hidden" data-testid={`card-period-${period.id}`}>
                    <button className="w-full text-left px-3.5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors" onClick={() => setExpandedPeriod(isExp ? null : period.id)} data-testid={`btn-expand-period-${period.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-semibold truncate">{period.name}</p>
                          <StatusDot status={period.status} t={t} />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{fmtShort(period.startDate)} → {fmtShort(period.endDate)}</p>
                      </div>
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(period.totalAmount || "0", currency)}</p>
                      {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>

                    {isExp && (
                      <div className="border-t border-border/20">
                        {/* Actions */}
                        <div className="px-3.5 py-2 flex items-center gap-1.5 flex-wrap bg-muted/20 border-b border-border/15">
                          {period.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-6 text-[11px] px-2.5 gap-1" onClick={() => setConfirmAction({ type: "finalize", periodId: period.id, name: period.name })} data-testid={`btn-finalize-${period.id}`}>
                              <CheckCircle2 className="h-2.5 w-2.5" />{t("payroll.periods.finalize")}
                            </Button>
                          )}
                          {period.status === "finalized" && (
                            <Button size="sm" className="h-6 text-[11px] px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmAction({ type: "markPaid", periodId: period.id, name: period.name })} data-testid={`btn-mark-paid-${period.id}`}>
                              <Banknote className="h-2.5 w-2.5" />{t("payroll.periods.markPaid")}
                            </Button>
                          )}
                          {period.status === "paid" && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{t("payroll.periods.statusPaid")}</span>}
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 gap-1 text-muted-foreground" onClick={exportPeriodCSV} data-testid={`btn-export-period-${period.id}`}>
                            <FileDown className="h-2.5 w-2.5" />{t("payroll.export.exportCSV")}
                          </Button>
                          {period.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 gap-1 text-destructive ml-auto" onClick={() => setConfirmAction({ type: "delete", periodId: period.id, name: period.name })} data-testid={`btn-delete-period-${period.id}`}>
                              <Trash2 className="h-2.5 w-2.5" />{t("payroll.periods.deletePeriod")}
                            </Button>
                          )}
                        </div>

                        {/* Entries */}
                        {periodEntries.length === 0 ? (
                          <p className="px-3.5 py-5 text-center text-xs text-muted-foreground">{t("payroll.entries.noEntries")}</p>
                        ) : (
                          <div className="divide-y divide-border/15">
                            {periodEntries.map(entry => {
                              const net = parseFloat(entry.netAmount);
                              return (
                                <div key={entry.id} className="px-3.5 py-2.5 flex items-center gap-2.5" data-testid={`row-entry-${entry.id}`}>
                                  <Av name={entry.employeeName} id={entry.employeeUserId} sm />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold truncate">{entry.employeeName}</p>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                                      <span className="capitalize">{entry.wageType}</span>
                                      {parseFloat(entry.hoursWorked || "0") > 0 && <span>{parseFloat(entry.hoursWorked || "0").toFixed(1)}{t("payroll.staff.hrs")}</span>}
                                      {parseFloat(entry.commissionAmount || "0") > 0 && <span className="text-violet-500">{formatCurrency(entry.commissionAmount || "0", currency)} {t("payroll.entries.commission")}</span>}
                                      {parseFloat(entry.bonusAmount || "0") > 0 && <span className="text-sky-500">+{formatCurrency(entry.bonusAmount || "0", currency)} {t("payroll.entries.bonus")}</span>}
                                      {parseFloat(entry.deductionAmount || "0") > 0 && <span className="text-rose-500">-{formatCurrency(entry.deductionAmount || "0", currency)}</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(net, currency)}</p>
                                    {period.status === "draft" && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEntryForm({ ...entry }); setEditingEntry(entry); }} data-testid={`btn-edit-entry-${entry.id}`}>
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {period.notes && <p className="px-3.5 py-2 text-[10px] text-muted-foreground italic border-t border-border/15">"{period.notes}"</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── PAY STUB SHEET ────────────────────────────────────────────────────── */}
      <Sheet open={!!paystubTarget} onOpenChange={o => !o && setPaystubTarget(null)}>
        <SheetContent className="w-full sm:max-w-xs overflow-y-auto">
          {paystubTarget && (() => {
            const { staff: s, entry } = paystubTarget;
            return (
              <>
                <SheetHeader className="mb-4">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <Receipt className="h-3.5 w-3.5 text-primary" />{t("payroll.paystub.title")}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-border/40">
                  <Av name={s.name || s.email || "?"} id={s.id} />
                  <div>
                    <p className="text-sm font-semibold">{s.name || s.email}</p>
                    <p className="text-[10px] text-muted-foreground">{roleLabel(s.role)} · {fmtShort(from)} {t("payroll.dateTo")} {fmtShort(to)}</p>
                  </div>
                </div>
                <div className="space-y-1 text-xs mb-4">
                  {[
                    { label: t("payroll.paystub.hoursWorked"), value: entry.hoursWorked > 0 ? `${entry.hoursWorked.toFixed(2)} ${t("payroll.staff.hrs")}` : null },
                    { label: t("payroll.paystub.salesAmount"), value: entry.salesAmount > 0 ? formatCurrency(entry.salesAmount, currency) : null },
                    { label: t("payroll.paystub.basePay"), value: formatCurrency(entry.payout, currency) },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex justify-between py-1.5 border-b border-border/20">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3.5 py-3 flex justify-between items-center mb-4">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t("payroll.paystub.netPay")}</span>
                  <span className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(entry.payout, currency)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => window.print()} data-testid="btn-print-paystub">
                    <Printer className="h-3 w-3" />{t("payroll.paystub.printStub")}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={exportComputeCSV} data-testid="btn-export-paystub">
                    <FileDown className="h-3 w-3" />{t("payroll.export.exportCSV")}
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── EDIT WAGE DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={!!editingWage} onOpenChange={o => !o && setEditingWage(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("payroll.wage.settings")}</DialogTitle>
          </DialogHeader>
          {editingWage && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/40">
              <Av name={editingWage.name || editingWage.email || "?"} id={editingWage.id} sm />
              <div>
                <p className="text-xs font-semibold">{editingWage.name || editingWage.email}</p>
                <p className="text-[10px] text-muted-foreground">{roleLabel(editingWage.role)}</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.wage.type")}</label>
              <Select value={wageForm.wageType} onValueChange={v => setWageForm({ ...wageForm, wageType: v as WageType })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-wage-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("payroll.wage.noWage")}</SelectItem>
                  <SelectItem value="hourly">{t("payroll.staff.hourly")}</SelectItem>
                  <SelectItem value="monthly">{t("payroll.staff.monthlySalary")}</SelectItem>
                  <SelectItem value="commission">{t("payroll.staff.commission")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(wageForm.wageType === "hourly" || wageForm.wageType === "monthly") && (
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  {wageForm.wageType === "hourly" ? t("payroll.wage.ratePerHour") : t("payroll.wage.monthlyAmount")} ({currency})
                </label>
                <Input type="number" step="0.01" min="0" value={wageForm.wageRate} onChange={e => setWageForm({ ...wageForm, wageRate: e.target.value })} className="h-8 text-xs" data-testid="input-wage-rate" />
              </div>
            )}
            {wageForm.wageType === "commission" && (
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.wage.commissionPercent")} (%)</label>
                <Input type="number" step="0.01" min="0" max="100" value={wageForm.commissionPercent} onChange={e => setWageForm({ ...wageForm, commissionPercent: e.target.value })} className="h-8 text-xs" data-testid="input-commission-percent" />
                <p className="text-[9px] text-muted-foreground mt-1">{t("payroll.wage.commissionHint")}</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingWage(null)} className="flex-1 h-8 text-xs" data-testid="btn-cancel-wage">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => updateWageMutation.mutate({ id: editingWage!.id, data: wageForm })} disabled={updateWageMutation.isPending} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-wage">
                <Save className="h-3 w-3" />{updateWageMutation.isPending ? t("payroll.wage.saving") : t("payroll.wage.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT ENTRY DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={!!editingEntry} onOpenChange={o => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("payroll.entries.editEntry")}</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/40">
              <Av name={editingEntry.employeeName} id={editingEntry.employeeUserId} sm />
              <p className="text-xs font-semibold">{editingEntry.employeeName}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { key: "hoursWorked", label: t("payroll.entries.hours") },
              { key: "baseAmount", label: `${t("payroll.entries.base")} (${currency})` },
              { key: "commissionAmount", label: `${t("payroll.entries.commission")} (${currency})` },
              { key: "tipAmount", label: `${t("payroll.entries.tips")} (${currency})` },
              { key: "bonusAmount", label: `${t("payroll.entries.bonus")} (${currency})` },
              { key: "deductionAmount", label: `${t("payroll.entries.deductions")} (${currency})` },
              { key: "advanceAmount", label: `${t("payroll.entries.advance")} (${currency})` },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
                <Input type="number" step="0.01" min="0" value={(entryForm as any)[key] ?? "0"} onChange={e => setEntryForm({ ...entryForm, [key]: e.target.value })} className="h-8 text-xs" data-testid={`input-entry-${key}`} />
              </div>
            ))}
          </div>
          <div className="mt-1">
            <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.entries.notes")}</label>
            <Textarea value={entryForm.notes ?? ""} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} rows={2} className="text-xs resize-none" data-testid="input-entry-notes" />
          </div>
          {(() => {
            const b = parseFloat((entryForm as any).baseAmount || "0") || 0;
            const c = parseFloat((entryForm as any).commissionAmount || "0") || 0;
            const ti = parseFloat((entryForm as any).tipAmount || "0") || 0;
            const bo = parseFloat((entryForm as any).bonusAmount || "0") || 0;
            const d = parseFloat((entryForm as any).deductionAmount || "0") || 0;
            const a = parseFloat((entryForm as any).advanceAmount || "0") || 0;
            return (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2.5 flex justify-between items-center mt-1">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">{t("payroll.paystub.netPay")}</span>
                <span className="text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(b + c + ti + bo - d - a, currency)}</span>
              </div>
            );
          })()}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingEntry(null)} className="flex-1 h-8 text-xs" data-testid="btn-cancel-entry">{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => updateEntryMutation.mutate({ id: editingEntry!.id, data: entryForm })} disabled={updateEntryMutation.isPending} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-entry">
              <Save className="h-3 w-3" />{updateEntryMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CREATE PERIOD DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={createPeriodOpen} onOpenChange={setCreatePeriodOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("payroll.periods.createPeriod")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.periodName")}</label>
              <Input value={periodForm.name} onChange={e => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t("payroll.periods.periodNamePlaceholder")} className="h-8 text-xs" data-testid="input-period-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.startDate")}</label>
                <Input type="date" value={periodForm.startDate} onChange={e => setPeriodForm({ ...periodForm, startDate: e.target.value })} className="h-8 text-xs" data-testid="input-period-start" />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.endDate")}</label>
                <Input type="date" value={periodForm.endDate} onChange={e => setPeriodForm({ ...periodForm, endDate: e.target.value })} className="h-8 text-xs" data-testid="input-period-end" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.notes")}</label>
              <Textarea value={periodForm.notes} onChange={e => setPeriodForm({ ...periodForm, notes: e.target.value })} rows={2} className="text-xs resize-none" data-testid="input-period-notes" />
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-[10px] text-muted-foreground flex items-start gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
              {t("payroll.periods.autoGenerated")}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreatePeriodOpen(false)} className="flex-1 h-8 text-xs" data-testid="btn-cancel-period">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => createPeriodMutation.mutate(periodForm)} disabled={createPeriodMutation.isPending || !periodForm.name} className="flex-1 h-8 text-xs gap-1" data-testid="btn-create-period">
                <Plus className="h-3 w-3" />{createPeriodMutation.isPending ? t("common.loading") : t("common.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM ACTION ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmAction} onOpenChange={o => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {confirmAction?.type === "finalize" && t("payroll.periods.finalizeConfirm")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaidConfirm")}
              {confirmAction?.type === "delete" && t("payroll.periods.deleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              <span className="font-semibold text-foreground">{confirmAction?.name}</span> —{" "}
              {confirmAction?.type === "finalize" && t("payroll.periods.finalizeDesc")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaidDesc")}
              {confirmAction?.type === "delete" && t("payroll.periods.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className={`h-8 text-xs ${confirmAction?.type === "delete" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}`} onClick={() => { if (!confirmAction) return; if (confirmAction.type === "finalize") finalizeMutation.mutate(confirmAction.periodId); else if (confirmAction.type === "markPaid") markPaidMutation.mutate(confirmAction.periodId); else if (confirmAction.type === "delete") deletePeriodMutation.mutate(confirmAction.periodId); }} data-testid="btn-confirm-action">
              {confirmAction?.type === "finalize" && t("payroll.periods.finalize")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaid")}
              {confirmAction?.type === "delete" && t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
