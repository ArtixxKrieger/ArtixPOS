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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Banknote, Clock, TrendingUp, Users, Pencil, Save, Calendar,
  Wallet, FileDown, Printer, Search, ChevronDown, ChevronRight,
  CheckCircle2, CircleDot, Circle, Trash2, Plus, Eye, AlertCircle,
  Receipt, Star, ArrowUpRight, CreditCard
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type WageType = "none" | "hourly" | "monthly" | "commission";

type StaffWage = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  wageType: WageType | null;
  wageRate: string | null;
  commissionPercent: string | null;
};

type ComputedEntry = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  wageType: WageType;
  wageRate: number;
  commissionPercent: number;
  hoursWorked: number;
  salesAmount: number;
  payout: number;
  notes: string;
};

type PayrollResponse = {
  from: string;
  to: string;
  entries: ComputedEntry[];
  totals: { totalPayout: number; totalHours: number; totalCommissionable: number; staffCount: number };
};

type PayrollPeriod = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "draft" | "finalized" | "paid";
  totalAmount: string | null;
  notes: string | null;
  createdAt: string;
  finalizedAt: string | null;
  paidAt: string | null;
};

type PayrollEntry = {
  id: number;
  periodId: number;
  employeeUserId: string;
  employeeName: string;
  wageType: string;
  wageRate: string;
  hoursWorked: string | null;
  baseAmount: string;
  commissionAmount: string | null;
  tipAmount: string | null;
  bonusAmount: string | null;
  deductionAmount: string | null;
  advanceAmount: string | null;
  netAmount: string;
  notes: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", manager: "Manager", admin: "Admin", cashier: "Cashier",
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function startOfLastWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day - 7);
  return d.toISOString().slice(0, 10);
}

function endOfLastWeek() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day - 1);
  return d.toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function startOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
}

function endOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function exportCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${accent || ""}`} />
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-xl font-bold tabular-nums ${accent || "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; class: string; icon: any }> = {
    draft: { label: t("payroll.periods.statusDraft"), class: "bg-muted text-muted-foreground border-border/40", icon: Circle },
    finalized: { label: t("payroll.periods.statusFinalized"), class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800", icon: CircleDot },
    paid: { label: t("payroll.periods.statusPaid"), class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", icon: CheckCircle2 },
  };
  const cfg = map[status] ?? map.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.class}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function WageLabel({ s, currency, t }: { s: StaffWage; currency: string; t: any }) {
  const wt = s.wageType ?? "none";
  if (wt === "none") return <span className="text-muted-foreground">{t("payroll.staff.noWage")}</span>;
  if (wt === "hourly") return <span>{t("payroll.staff.hourly")} · {formatCurrency(s.wageRate || "0", currency)}/hr</span>;
  if (wt === "monthly") return <span>{t("payroll.staff.monthlySalary")} · {formatCurrency(s.wageRate || "0", currency)}/mo</span>;
  if (wt === "commission") return <span>{t("payroll.staff.commission")} · {parseFloat(s.commissionPercent || "0").toFixed(1)}%</span>;
  return null;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.role === "owner";
  const currency = (settings as any)?.currency || "$";

  // ── Quick Compute State ─────────────────────────────────────────────────────
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [preset, setPreset] = useState("thisMonth");
  const [staffSearch, setStaffSearch] = useState("");
  const [wageFilter, setWageFilter] = useState("all");
  const [paystubTarget, setPaystubTarget] = useState<{ staff: StaffWage; entry: ComputedEntry | null } | null>(null);
  const [editingWage, setEditingWage] = useState<StaffWage | null>(null);
  const [wageForm, setWageForm] = useState({ wageType: "none" as WageType, wageRate: "0", commissionPercent: "0" });

  // ── Pay Periods State ───────────────────────────────────────────────────────
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [entryForm, setEntryForm] = useState<Partial<PayrollEntry>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: string; periodId: number; name: string } | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffWage[]>({
    queryKey: ["/api/payroll/staff"],
  });

  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const { data: payroll, isLoading: payrollLoading } = useQuery<PayrollResponse>({
    queryKey: ["/api/payroll/compute", from, to],
    queryFn: async () => {
      const res = await nativeFetch(`/api/payroll/compute?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      if (!res.ok) throw new Error("Failed to compute payroll");
      return res.json();
    },
  });

  const { data: periods = [], isLoading: periodsLoading } = useQuery<PayrollPeriod[]>({
    queryKey: ["/api/payroll/periods"],
  });

  const { data: periodEntries = [] } = useQuery<PayrollEntry[]>({
    queryKey: ["/api/payroll/periods", expandedPeriod, "entries"],
    queryFn: async () => {
      if (!expandedPeriod) return [];
      const res = await nativeFetch(`/api/payroll/periods/${expandedPeriod}/entries`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expandedPeriod,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updateWageMutation = useMutation({
    mutationFn: async (vars: { id: string; data: typeof wageForm }) =>
      (await apiRequest("PUT", `/api/payroll/staff/${vars.id}`, vars.data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/compute"] });
      setEditingWage(null);
      toast({ title: t("payroll.wage.updated") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err?.message, variant: "destructive" }),
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (data: typeof periodForm) =>
      (await apiRequest("POST", "/api/payroll/periods", data)).json(),
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setCreatePeriodOpen(false);
      setPeriodForm({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
      setExpandedPeriod(period.id);
      toast({ title: t("payroll.periods.created_toast") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err?.message, variant: "destructive" }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (vars: { id: number; data: Partial<PayrollEntry> }) =>
      (await apiRequest("PUT", `/api/payroll/entries/${vars.id}`, vars.data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods", expandedPeriod, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setEditingEntry(null);
      toast({ title: t("payroll.entries.updated") });
    },
    onError: (err: any) => toast({ title: t("common.error"), description: err?.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/payroll/periods/${id}/finalize`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setConfirmAction(null);
      toast({ title: t("payroll.periods.finalized_toast") });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/payroll/periods/${id}/pay`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setConfirmAction(null);
      toast({ title: t("payroll.periods.paid_toast") });
    },
  });

  const deletePeriodMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/payroll/periods/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      setConfirmAction(null);
      if (expandedPeriod === confirmAction?.periodId) setExpandedPeriod(null);
      toast({ title: t("payroll.periods.deleted_toast") });
    },
  });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const entriesByUser = useMemo(() => {
    const map = new Map<string, ComputedEntry>();
    payroll?.entries.forEach((e) => map.set(e.userId, e));
    return map;
  }, [payroll]);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      const matchSearch = !staffSearch || (s.name || s.email || "").toLowerCase().includes(staffSearch.toLowerCase());
      const matchWage = wageFilter === "all" || (s.wageType ?? "none") === wageFilter;
      return matchSearch && matchWage;
    });
  }, [staff, staffSearch, wageFilter]);

  const totals = payroll?.totals ?? { totalPayout: 0, totalHours: 0, totalCommissionable: 0, staffCount: 0 };

  const expandedPeriodData = periods.find((p) => p.id === expandedPeriod);

  // ── Preset handler ────────────────────────────────────────────────────────────

  function applyPreset(p: string) {
    setPreset(p);
    if (p === "thisWeek") { setFrom(startOfWeek()); setTo(todayISO()); }
    else if (p === "lastWeek") { setFrom(startOfLastWeek()); setTo(endOfLastWeek()); }
    else if (p === "thisMonth") { setFrom(startOfMonth()); setTo(todayISO()); }
    else if (p === "lastMonth") { setFrom(startOfLastMonth()); setTo(endOfLastMonth()); }
    else if (p === "last30") { setFrom(todayISO(-30)); setTo(todayISO()); }
  }

  // ── CSV Exports ───────────────────────────────────────────────────────────────

  function exportComputeCSV() {
    if (!payroll) return;
    exportCSV(`payroll-${from}-to-${to}.csv`, payroll.entries.map((e) => ({
      Name: e.name || e.email || e.userId,
      Role: ROLE_LABELS[e.role] ?? e.role,
      "Wage Type": e.wageType,
      "Wage Rate": e.wageRate,
      "Hours Worked": e.hoursWorked,
      "Sales Amount": e.salesAmount,
      Payout: e.payout,
      Notes: e.notes,
    })));
    toast({ title: t("payroll.export.csvExported") });
  }

  function exportPeriodCSV() {
    if (!periodEntries.length) return;
    exportCSV(`payroll-period-${expandedPeriodData?.name || expandedPeriod}.csv`, periodEntries.map((e) => ({
      Employee: e.employeeName,
      "Wage Type": e.wageType,
      "Hours Worked": e.hoursWorked || "0",
      "Base Pay": e.baseAmount,
      Commission: e.commissionAmount || "0",
      Tips: e.tipAmount || "0",
      Bonus: e.bonusAmount || "0",
      Deductions: e.deductionAmount || "0",
      "Advance Deduction": e.advanceAmount || "0",
      "Net Pay": e.netAmount,
      Notes: e.notes || "",
    })));
    toast({ title: t("payroll.export.csvExported") });
  }

  // ── Pay stub print ────────────────────────────────────────────────────────────

  function printPaystub() {
    window.print();
  }

  // ── Wage edit handlers ────────────────────────────────────────────────────────

  function openWageEdit(s: StaffWage) {
    setWageForm({ wageType: (s.wageType ?? "none") as WageType, wageRate: s.wageRate ?? "0", commissionPercent: s.commissionPercent ?? "0" });
    setEditingWage(s);
  }

  function openEntryEdit(entry: PayrollEntry) {
    setEntryForm({ ...entry });
    setEditingEntry(entry);
  }

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">{t("payroll.ownerOnly")}</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-5 page-enter">

      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white p-6 md:p-8 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold leading-tight">{t("payroll.title")}</h1>
              <p className="text-white/80 text-sm mt-1">{t("payroll.subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="compute">
        <TabsList className="w-full h-10 bg-muted/50 rounded-xl p-1">
          <TabsTrigger value="compute" className="flex-1 rounded-lg text-xs font-semibold" data-testid="tab-quick-compute">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
            {t("payroll.tabs.quickCompute")}
          </TabsTrigger>
          <TabsTrigger value="periods" className="flex-1 rounded-lg text-xs font-semibold" data-testid="tab-pay-periods">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            {t("payroll.tabs.payPeriods")}
            {periods.length > 0 && (
              <span className="ml-1.5 h-4 min-w-[1rem] rounded-full bg-primary/20 text-primary text-[9px] font-bold px-1 flex items-center justify-center">
                {periods.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── QUICK COMPUTE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="compute" className="space-y-4 mt-4">

          {/* Date range + presets */}
          <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("payroll.tabs.quickCompute")}</p>
            </div>

            {/* Preset pills */}
            <div className="flex flex-wrap gap-1.5">
              {(["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    preset === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                  data-testid={`btn-preset-${p}`}
                >
                  {t(`payroll.presets.${p}`)}
                </button>
              ))}
            </div>

            {/* Date inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground">{t("payroll.periods.startDate")}</label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }}
                  className="h-9 text-sm mt-1"
                  data-testid="input-payroll-from"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground">{t("payroll.periods.endDate")}</label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setPreset("custom"); }}
                  className="h-9 text-sm mt-1"
                  data-testid="input-payroll-to"
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Banknote} label={t("payroll.stats.totalPayout")} value={formatCurrency(totals.totalPayout, currency)} sub={t("payroll.stats.dueThisPeriod")} accent="text-emerald-600 dark:text-emerald-400" />
            <StatCard icon={Clock} label={t("payroll.stats.totalHours")} value={totals.totalHours.toFixed(1)} sub={t("payroll.stats.acrossHourlyStaff")} />
            <StatCard icon={TrendingUp} label={t("payroll.stats.commissionSales")} value={formatCurrency(totals.totalCommissionable, currency)} sub={t("payroll.stats.commissionableRevenue")} />
            <StatCard icon={Users} label={t("payroll.stats.staffCount")} value={String(totals.staffCount)} sub={t("payroll.stats.onPayroll")} />
          </div>

          {/* Staff list */}
          <div className="rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">{t("payroll.staff.title")}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder={t("payroll.staff.searchPlaceholder")}
                    className="h-8 pl-8 text-xs w-36"
                    data-testid="input-staff-search"
                  />
                </div>
                {/* Wage type filter */}
                <Select value={wageFilter} onValueChange={setWageFilter}>
                  <SelectTrigger className="h-8 text-xs w-36" data-testid="select-wage-filter">
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
                {/* Export */}
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={exportComputeCSV} data-testid="btn-export-csv">
                  <FileDown className="h-3.5 w-3.5" />
                  {t("payroll.export.exportCSV")}
                </Button>
              </div>
            </div>

            {staffLoading || payrollLoading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {staffSearch || wageFilter !== "all"
                  ? t("payroll.staff.noMatch")
                  : <><p>{t("payroll.staff.noStaffYet")}</p><p className="text-xs mt-1">{t("payroll.staff.noStaffHint")}</p></>
                }
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredStaff.map((s) => {
                  const entry = entriesByUser.get(s.id);
                  const wt = s.wageType ?? "none";
                  return (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30" data-testid={`row-payroll-${s.id}`}>
                      {/* Avatar */}
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {(s.name || s.email || "?").charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">{s.name || s.email}</p>
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold">
                            {ROLE_LABELS[s.role] ?? s.role}
                          </span>
                          {wt === "none" && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 font-semibold">
                              {t("payroll.staff.noWage")}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          <WageLabel s={s} currency={currency} t={t} />
                        </p>
                        {/* Mini metrics row */}
                        {entry && (
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {entry.hoursWorked > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {entry.hoursWorked.toFixed(1)} {t("payroll.staff.hrs")}
                              </span>
                            )}
                            {entry.salesAmount > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <CreditCard className="h-2.5 w-2.5" />
                                {formatCurrency(entry.salesAmount, currency)} {t("payroll.staff.sales")}
                              </span>
                            )}
                            {entry.notes && (
                              <span className="text-[10px] text-muted-foreground/70 italic truncate max-w-[160px]">{entry.notes}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Payout */}
                      <div className="text-right shrink-0 min-w-[70px]">
                        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(entry?.payout ?? 0, currency)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {entry && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setPaystubTarget({ staff: s, entry })}
                            className="h-8 w-8"
                            data-testid={`btn-paystub-${s.id}`}
                            title={t("payroll.staff.viewPaystub")}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openWageEdit(s)}
                          className="h-8 w-8"
                          data-testid={`btn-edit-wage-${s.id}`}
                          title={t("payroll.staff.editWage")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── PAY PERIODS TAB ───────────────────────────────────────────────── */}
        <TabsContent value="periods" className="space-y-4 mt-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">{t("payroll.periods.title")}</h2>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setCreatePeriodOpen(true)}
              data-testid="btn-new-period"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("payroll.periods.newPeriod")}
            </Button>
          </div>

          {/* Period list */}
          {periodsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : periods.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border/40 p-10 text-center space-y-2">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">{t("payroll.periods.noPeriods")}</p>
              <p className="text-xs text-muted-foreground/70">{t("payroll.periods.noPeriodsHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {periods.map((period) => {
                const isExpanded = expandedPeriod === period.id;
                const entryCount = isExpanded ? periodEntries.length : 0;

                return (
                  <div key={period.id} className="rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden" data-testid={`card-period-${period.id}`}>
                    {/* Period header row */}
                    <button
                      className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-muted/30 text-left"
                      onClick={() => setExpandedPeriod(isExpanded ? null : period.id)}
                      data-testid={`btn-expand-period-${period.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{period.name}</span>
                          <StatusBadge status={period.status} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {fmtDate(period.startDate)} → {fmtDate(period.endDate)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(period.totalAmount || "0", currency)}
                        </p>
                        {period.paidAt && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{t("payroll.periods.statusPaid")} {fmtDate(period.paidAt)}</p>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-border/30">
                        {/* Action bar */}
                        <div className="px-4 py-2.5 bg-muted/30 flex items-center gap-2 flex-wrap">
                          {period.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setConfirmAction({ type: "finalize", periodId: period.id, name: period.name })}
                              data-testid={`btn-finalize-${period.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {t("payroll.periods.finalize")}
                            </Button>
                          )}
                          {period.status === "finalized" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => setConfirmAction({ type: "markPaid", periodId: period.id, name: period.name })}
                              data-testid={`btn-mark-paid-${period.id}`}
                            >
                              <Banknote className="h-3 w-3" />
                              {t("payroll.periods.markPaid")}
                            </Button>
                          )}
                          {period.status === "paid" && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t("payroll.periods.statusPaid")}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={exportPeriodCSV}
                            data-testid={`btn-export-period-${period.id}`}
                          >
                            <FileDown className="h-3 w-3" />
                            {t("payroll.export.exportCSV")}
                          </Button>
                          {period.status === "draft" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                              onClick={() => setConfirmAction({ type: "delete", periodId: period.id, name: period.name })}
                              data-testid={`btn-delete-period-${period.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                              {t("payroll.periods.deletePeriod")}
                            </Button>
                          )}
                        </div>

                        {/* Summary stat row */}
                        <div className="px-4 py-3 grid grid-cols-3 gap-3 border-b border-border/20">
                          <div className="text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("payroll.stats.totalPayout")}</p>
                            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{formatCurrency(period.totalAmount || "0", currency)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("payroll.stats.staffCount")}</p>
                            <p className="text-base font-bold mt-0.5">{isExpanded ? periodEntries.length : "—"}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("payroll.periods.statusDraft")}</p>
                            <p className="text-base font-bold mt-0.5"><StatusBadge status={period.status} /></p>
                          </div>
                        </div>

                        {/* Entries table */}
                        {periodEntries.length === 0 ? (
                          <div className="p-5 text-center text-xs text-muted-foreground">{t("payroll.entries.noEntries")}</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/50">
                                  {["employee", "wageType", "hours", "base", "commission", "tips", "bonus", "deductions", "advance", "net"].map((col) => (
                                    <th key={col} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-muted-foreground whitespace-nowrap">
                                      {t(`payroll.entries.${col}`)}
                                    </th>
                                  ))}
                                  <th className="px-3 py-2 w-8" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {periodEntries.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-muted/20" data-testid={`row-entry-${entry.id}`}>
                                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{entry.employeeName}</td>
                                    <td className="px-3 py-2.5 text-muted-foreground capitalize whitespace-nowrap">{entry.wageType}</td>
                                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{parseFloat(entry.hoursWorked || "0").toFixed(1)}</td>
                                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatCurrency(entry.baseAmount, currency)}</td>
                                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatCurrency(entry.commissionAmount || "0", currency)}</td>
                                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatCurrency(entry.tipAmount || "0", currency)}</td>
                                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{formatCurrency(entry.bonusAmount || "0", currency)}</td>
                                    <td className="px-3 py-2.5 tabular-nums text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                      {parseFloat(entry.deductionAmount || "0") > 0 ? `-${formatCurrency(entry.deductionAmount || "0", currency)}` : "—"}
                                    </td>
                                    <td className="px-3 py-2.5 tabular-nums text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                      {parseFloat(entry.advanceAmount || "0") > 0 ? `-${formatCurrency(entry.advanceAmount || "0", currency)}` : "—"}
                                    </td>
                                    <td className="px-3 py-2.5 font-bold tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      {formatCurrency(entry.netAmount, currency)}
                                    </td>
                                    <td className="px-2 py-2.5">
                                      {period.status === "draft" && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-6 w-6"
                                          onClick={() => openEntryEdit(entry)}
                                          data-testid={`btn-edit-entry-${entry.id}`}
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Footer info */}
                        {period.notes && (
                          <div className="px-4 py-2.5 border-t border-border/20 text-xs text-muted-foreground italic">
                            {period.notes}
                          </div>
                        )}
                        {period.finalizedAt && (
                          <div className="px-4 py-2 border-t border-border/20 text-[10px] text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {t("payroll.periods.statusFinalized")} {fmtDate(period.finalizedAt)}
                            {period.paidAt && <> · {t("payroll.periods.statusPaid")} {fmtDate(period.paidAt)}</>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── PAY STUB SHEET ───────────────────────────────────────────────────── */}
      <Sheet open={!!paystubTarget} onOpenChange={(o) => !o && setPaystubTarget(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {paystubTarget && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-emerald-600" />
                  {t("payroll.paystub.title")}
                </SheetTitle>
              </SheetHeader>

              {/* Employee info */}
              <div className="rounded-xl bg-muted/50 p-4 mb-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-sm font-bold">
                    {(paystubTarget.staff.name || paystubTarget.staff.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{paystubTarget.staff.name || paystubTarget.staff.email}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[paystubTarget.staff.role] ?? paystubTarget.staff.role}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <p className="text-muted-foreground">{t("payroll.paystub.period")}</p>
                    <p className="font-medium">{fmtDate(from)} → {fmtDate(to)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("payroll.paystub.wageType")}</p>
                    <p className="font-medium capitalize">{paystubTarget.entry?.wageType || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{t("payroll.paystub.breakdown")}</p>

                {[
                  { label: t("payroll.paystub.hoursWorked"), value: `${paystubTarget.entry?.hoursWorked.toFixed(2) ?? "0"} hrs`, show: true },
                  { label: t("payroll.paystub.salesAmount"), value: formatCurrency(paystubTarget.entry?.salesAmount ?? 0, currency), show: (paystubTarget.entry?.salesAmount ?? 0) > 0 },
                ].filter((r) => r.show).map((row) => (
                  <div key={row.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}

                <Separator className="my-2" />

                {[
                  { label: t("payroll.paystub.basePay"), value: formatCurrency(paystubTarget.entry?.payout ?? 0, currency), bold: false },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between text-sm ${row.bold ? "font-bold" : ""}`}>
                    <span className="text-muted-foreground">{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                ))}

                <Separator className="my-2" />

                {/* Net pay */}
                <div className="flex justify-between items-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-3 mt-2">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{t("payroll.paystub.netPay")}</span>
                  <span className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(paystubTarget.entry?.payout ?? 0, currency)}
                  </span>
                </div>

                {paystubTarget.entry?.notes && (
                  <p className="text-xs text-muted-foreground italic mt-2">{paystubTarget.entry.notes}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-6">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={printPaystub} data-testid="btn-print-paystub">
                  <Printer className="h-3.5 w-3.5" />
                  {t("payroll.paystub.printStub")}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={exportComputeCSV} data-testid="btn-export-paystub">
                  <FileDown className="h-3.5 w-3.5" />
                  {t("payroll.export.exportCSV")}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── EDIT WAGE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={!!editingWage} onOpenChange={(o) => !o && setEditingWage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payroll.wage.settings")} — {editingWage?.name || editingWage?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">{t("payroll.wage.type")}</label>
              <Select
                value={wageForm.wageType}
                onValueChange={(v) => setWageForm({ ...wageForm, wageType: v as WageType })}
              >
                <SelectTrigger data-testid="select-wage-type">
                  <SelectValue />
                </SelectTrigger>
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
                <label className="text-xs font-semibold mb-1.5 block">
                  {wageForm.wageType === "hourly"
                    ? `${t("payroll.wage.ratePerHour")} (${currency})`
                    : `${t("payroll.wage.monthlyAmount")} (${currency})`}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={wageForm.wageRate}
                  onChange={(e) => setWageForm({ ...wageForm, wageRate: e.target.value })}
                  data-testid="input-wage-rate"
                />
              </div>
            )}

            {wageForm.wageType === "commission" && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">{t("payroll.wage.commissionPercent")} (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={wageForm.commissionPercent}
                  onChange={(e) => setWageForm({ ...wageForm, commissionPercent: e.target.value })}
                  data-testid="input-commission-percent"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t("payroll.wage.commissionHint")}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingWage(null)} className="flex-1" data-testid="btn-cancel-wage">
                {t("payroll.wage.cancel")}
              </Button>
              <Button
                onClick={() => updateWageMutation.mutate({ id: editingWage!.id, data: wageForm })}
                disabled={updateWageMutation.isPending}
                className="flex-1"
                data-testid="btn-save-wage"
              >
                <Save className="h-3.5 w-3.5 mr-2" />
                {updateWageMutation.isPending ? t("payroll.wage.saving") : t("payroll.wage.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT ENTRY DIALOG ────────────────────────────────────────────────── */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payroll.entries.editEntry")} — {editingEntry?.employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { key: "hoursWorked", label: t("payroll.entries.hours"), step: "0.01" },
              { key: "baseAmount", label: `${t("payroll.entries.base")} (${currency})`, step: "0.01" },
              { key: "commissionAmount", label: `${t("payroll.entries.commission")} (${currency})`, step: "0.01" },
              { key: "tipAmount", label: `${t("payroll.entries.tips")} (${currency})`, step: "0.01" },
              { key: "bonusAmount", label: `${t("payroll.entries.bonus")} (${currency})`, step: "0.01" },
              { key: "deductionAmount", label: `${t("payroll.entries.deductions")} (${currency})`, step: "0.01" },
              { key: "advanceAmount", label: `${t("payroll.entries.advance")} (${currency})`, step: "0.01" },
            ].map(({ key, label, step }) => (
              <div key={key}>
                <label className="text-xs font-semibold mb-1 block">{label}</label>
                <Input
                  type="number"
                  step={step}
                  min="0"
                  value={(entryForm as any)[key] ?? "0"}
                  onChange={(e) => setEntryForm({ ...entryForm, [key]: e.target.value })}
                  data-testid={`input-entry-${key}`}
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold mb-1 block">{t("payroll.entries.notes")}</label>
              <Textarea
                value={entryForm.notes ?? ""}
                onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })}
                rows={2}
                className="text-sm resize-none"
                data-testid="input-entry-notes"
              />
            </div>

            {/* Live net preview */}
            {(() => {
              const base = parseFloat((entryForm as any).baseAmount || "0") || 0;
              const comm = parseFloat((entryForm as any).commissionAmount || "0") || 0;
              const tip = parseFloat((entryForm as any).tipAmount || "0") || 0;
              const bonus = parseFloat((entryForm as any).bonusAmount || "0") || 0;
              const ded = parseFloat((entryForm as any).deductionAmount || "0") || 0;
              const adv = parseFloat((entryForm as any).advanceAmount || "0") || 0;
              const net = base + comm + tip + bonus - ded - adv;
              return (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{t("payroll.paystub.netPay")}</span>
                  <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(net, currency)}</span>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditingEntry(null)} className="flex-1" data-testid="btn-cancel-entry">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => updateEntryMutation.mutate({ id: editingEntry!.id, data: entryForm })}
                disabled={updateEntryMutation.isPending}
                className="flex-1"
                data-testid="btn-save-entry"
              >
                <Save className="h-3.5 w-3.5 mr-2" />
                {updateEntryMutation.isPending ? t("common.loading") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── CREATE PERIOD DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={createPeriodOpen} onOpenChange={setCreatePeriodOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payroll.periods.createPeriod")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">{t("payroll.periods.periodName")}</label>
              <Input
                value={periodForm.name}
                onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })}
                placeholder={t("payroll.periods.periodNamePlaceholder")}
                data-testid="input-period-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block">{t("payroll.periods.startDate")}</label>
                <Input
                  type="date"
                  value={periodForm.startDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                  data-testid="input-period-start"
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block">{t("payroll.periods.endDate")}</label>
                <Input
                  type="date"
                  value={periodForm.endDate}
                  onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                  data-testid="input-period-end"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block">{t("payroll.periods.notes")}</label>
              <Textarea
                value={periodForm.notes}
                onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })}
                rows={2}
                className="text-sm resize-none"
                data-testid="input-period-notes"
              />
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {t("payroll.periods.autoGenerated")}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreatePeriodOpen(false)} className="flex-1" data-testid="btn-cancel-period">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => createPeriodMutation.mutate(periodForm)}
                disabled={createPeriodMutation.isPending || !periodForm.name || !periodForm.startDate || !periodForm.endDate}
                className="flex-1"
                data-testid="btn-create-period"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                {createPeriodMutation.isPending ? t("common.loading") : t("payroll.periods.createPeriod")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRM ACTION DIALOG ────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "finalize" && t("payroll.periods.finalizeConfirm")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaidConfirm")}
              {confirmAction?.type === "delete" && t("payroll.periods.deleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{confirmAction?.name}</span> —{" "}
              {confirmAction?.type === "finalize" && t("payroll.periods.finalizeDesc")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaidDesc")}
              {confirmAction?.type === "delete" && t("payroll.periods.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "finalize") finalizeMutation.mutate(confirmAction.periodId);
                else if (confirmAction.type === "markPaid") markPaidMutation.mutate(confirmAction.periodId);
                else if (confirmAction.type === "delete") deletePeriodMutation.mutate(confirmAction.periodId);
              }}
              className={confirmAction?.type === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}
              data-testid="btn-confirm-action"
            >
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
