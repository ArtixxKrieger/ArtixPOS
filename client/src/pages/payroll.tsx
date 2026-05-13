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
  Receipt, CreditCard, ArrowRight, Sparkles, Star, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
function startOfLastWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() - 7);
  return d.toISOString().slice(0, 10);
}
function endOfLastWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() - 1);
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
function fmtDateShort(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── CSV helper ────────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-indigo-500 to-violet-600",
];

function avatarGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function Avatar({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" | "lg" }) {
  const sz = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br ${avatarGradient(id)} text-white flex items-center justify-center font-bold shrink-0 shadow-sm`}>
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  draft:     { bg: "bg-slate-100 dark:bg-slate-800/60",     text: "text-slate-600 dark:text-slate-400",     border: "border-slate-200 dark:border-slate-700",     dot: "bg-slate-400",     Icon: Circle },
  finalized: { bg: "bg-amber-50 dark:bg-amber-900/30",      text: "text-amber-700 dark:text-amber-400",      border: "border-amber-200 dark:border-amber-700",      dot: "bg-amber-400",     Icon: CircleDot },
  paid:      { bg: "bg-emerald-50 dark:bg-emerald-900/30",  text: "text-emerald-700 dark:text-emerald-400",  border: "border-emerald-200 dark:border-emerald-700",  dot: "bg-emerald-500",   Icon: CheckCircle2 },
};

function StatusPill({ status, t }: { status: string; t: any }) {
  const cfg = STATUS_STYLES[status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.draft;
  const { Icon } = cfg;
  const label =
    status === "draft" ? t("payroll.periods.statusDraft") :
    status === "finalized" ? t("payroll.periods.statusFinalized") :
    t("payroll.periods.statusPaid");
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {label}
    </span>
  );
}

// ── Wage display helper ───────────────────────────────────────────────────────

function WageChip({ s, currency, t }: { s: StaffWage; currency: string; t: any }) {
  const wt = s.wageType ?? "none";
  if (wt === "none") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
        {t("payroll.staff.noWage")}
      </span>
    );
  }
  const label =
    wt === "hourly" ? `${t("payroll.staff.hourly")} · ${formatCurrency(s.wageRate || "0", currency)}/hr` :
    wt === "monthly" ? `${t("payroll.staff.monthlySalary")} · ${formatCurrency(s.wageRate || "0", currency)}/mo` :
    `${t("payroll.staff.commission")} · ${parseFloat(s.commissionPercent || "0").toFixed(1)}%`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
      {label}
    </span>
  );
}

// ── Gradient stat card ────────────────────────────────────────────────────────

const STAT_THEMES = [
  { grad: "from-emerald-500 to-teal-600",  light: "bg-emerald-50 dark:bg-emerald-950/40",  text: "text-emerald-600 dark:text-emerald-400",  border: "border-emerald-100 dark:border-emerald-900/50" },
  { grad: "from-violet-500 to-indigo-600", light: "bg-violet-50 dark:bg-violet-950/40",   text: "text-violet-600 dark:text-violet-400",   border: "border-violet-100 dark:border-violet-900/50" },
  { grad: "from-amber-500 to-orange-600",  light: "bg-amber-50 dark:bg-amber-950/40",     text: "text-amber-600 dark:text-amber-400",     border: "border-amber-100 dark:border-amber-900/50" },
  { grad: "from-sky-500 to-blue-600",      light: "bg-sky-50 dark:bg-sky-950/40",         text: "text-sky-600 dark:text-sky-400",         border: "border-sky-100 dark:border-sky-900/50" },
];

function StatCard({ icon: Icon, label, value, sub, index }: {
  icon: any; label: string; value: string; sub?: string; index: number;
}) {
  const th = STAT_THEMES[index % 4];
  return (
    <div className={`rounded-2xl border ${th.border} ${th.light} p-4 relative overflow-hidden`}>
      <div className={`absolute -top-4 -right-4 h-16 w-16 rounded-full bg-gradient-to-br ${th.grad} opacity-10`} />
      <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${th.grad} flex items-center justify-center mb-3 shadow-sm`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-2xl font-black tabular-nums leading-tight ${th.text}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1 font-medium">{sub}</p>}
    </div>
  );
}

// ── Payout bar ────────────────────────────────────────────────────────────────

function PayoutBar({ base, commission, tips, total }: { base: number; commission: number; tips: number; total: number }) {
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px mt-1.5">
      {base > 0 && <div className="bg-emerald-500 rounded-full" style={{ width: `${pct(base)}%` }} />}
      {commission > 0 && <div className="bg-violet-500 rounded-full" style={{ width: `${pct(commission)}%` }} />}
      {tips > 0 && <div className="bg-amber-500 rounded-full" style={{ width: `${pct(tips)}%` }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function PayrollPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currency = (settings as any)?.currency || "$";
  const isOwner = user?.role === "owner";

  // Quick Compute state
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayISO());
  const [preset, setPreset] = useState("thisMonth");
  const [staffSearch, setStaffSearch] = useState("");
  const [wageFilter, setWageFilter] = useState("all");

  // Dialogs / sheets
  const [paystubTarget, setPaystubTarget] = useState<{ staff: StaffWage; entry: ComputedEntry } | null>(null);
  const [editingWage, setEditingWage] = useState<StaffWage | null>(null);
  const [wageForm, setWageForm] = useState({ wageType: "none" as WageType, wageRate: "0", commissionPercent: "0" });

  // Pay Periods state
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [entryForm, setEntryForm] = useState<Partial<PayrollEntry>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: string; periodId: number; name: string } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffWage[]>({
    queryKey: ["/api/payroll/staff"],
  });

  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const { data: payroll, isLoading: payrollLoading } = useQuery<PayrollResponse>({
    queryKey: ["/api/payroll/compute", from, to],
    queryFn: async () => {
      const res = await nativeFetch(`/api/payroll/compute?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      if (!res.ok) throw new Error("Failed");
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

  // ── Mutations ─────────────────────────────────────────────────────────────────

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
      if (expandedPeriod === confirmAction?.periodId) setExpandedPeriod(null);
      setConfirmAction(null);
      toast({ title: t("payroll.periods.deleted_toast") });
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  const entriesByUser = useMemo(() => {
    const map = new Map<string, ComputedEntry>();
    payroll?.entries.forEach((e) => map.set(e.userId, e));
    return map;
  }, [payroll]);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      const q = staffSearch.toLowerCase();
      const matchSearch = !q || (s.name || s.email || "").toLowerCase().includes(q);
      const matchWage = wageFilter === "all" || (s.wageType ?? "none") === wageFilter;
      return matchSearch && matchWage;
    });
  }, [staff, staffSearch, wageFilter]);

  const totals = payroll?.totals ?? { totalPayout: 0, totalHours: 0, totalCommissionable: 0, staffCount: 0 };
  const expandedPeriodData = periods.find((p) => p.id === expandedPeriod);

  // ── Preset ────────────────────────────────────────────────────────────────────

  function applyPreset(p: string) {
    setPreset(p);
    if (p === "thisWeek") { setFrom(startOfWeek()); setTo(todayISO()); }
    else if (p === "lastWeek") { setFrom(startOfLastWeek()); setTo(endOfLastWeek()); }
    else if (p === "thisMonth") { setFrom(startOfMonth()); setTo(todayISO()); }
    else if (p === "lastMonth") { setFrom(startOfLastMonth()); setTo(endOfLastMonth()); }
    else if (p === "last30") { setFrom(todayISO(-30)); setTo(todayISO()); }
  }

  // ── Role label ────────────────────────────────────────────────────────────────

  function roleLabel(role: string) {
    const key = `payroll.roles.${role}`;
    const translated = t(key);
    return translated === key ? role : translated;
  }

  // ── CSV exports ───────────────────────────────────────────────────────────────

  function exportComputeCSV() {
    if (!payroll) return;
    downloadCSV(`payroll-${from}-to-${to}.csv`, payroll.entries.map((e) => ({
      [t("payroll.entries.employee")]: e.name || e.email || e.userId,
      [t("payroll.paystub.role")]: roleLabel(e.role),
      [t("payroll.wage.type")]: e.wageType,
      [t("payroll.paystub.wageRate")]: e.wageRate,
      [t("payroll.paystub.hoursWorked")]: e.hoursWorked,
      [t("payroll.paystub.salesAmount")]: e.salesAmount,
      [t("payroll.paystub.netPay")]: e.payout,
    })));
    toast({ title: t("payroll.export.csvExported") });
  }

  function exportPeriodCSV() {
    if (!periodEntries.length) return;
    downloadCSV(`payroll-${expandedPeriodData?.name || expandedPeriod}.csv`, periodEntries.map((e) => ({
      [t("payroll.entries.employee")]: e.employeeName,
      [t("payroll.wage.type")]: e.wageType,
      [t("payroll.entries.hours")]: e.hoursWorked || "0",
      [t("payroll.entries.base")]: e.baseAmount,
      [t("payroll.entries.commission")]: e.commissionAmount || "0",
      [t("payroll.entries.tips")]: e.tipAmount || "0",
      [t("payroll.entries.bonus")]: e.bonusAmount || "0",
      [t("payroll.entries.deductions")]: e.deductionAmount || "0",
      [t("payroll.entries.advance")]: e.advanceAmount || "0",
      [t("payroll.entries.net")]: e.netAmount,
    })));
    toast({ title: t("payroll.export.csvExported") });
  }

  // ── Wage edit ─────────────────────────────────────────────────────────────────

  function openWageEdit(s: StaffWage) {
    setWageForm({ wageType: (s.wageType ?? "none") as WageType, wageRate: s.wageRate ?? "0", commissionPercent: s.commissionPercent ?? "0" });
    setEditingWage(s);
  }

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground max-w-[280px]">{t("payroll.ownerOnly")}</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-6 page-enter">

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-xl">
        {/* Decorative blobs */}
        <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
          {/* Left: title */}
          <div className="flex items-center gap-4 flex-1">
            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg shrink-0">
              <Wallet className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-0.5">{t("nav.payroll") || t("payroll.title")}</p>
              <h1 className="text-2xl md:text-3xl font-black leading-tight">{t("payroll.title")}</h1>
              <p className="text-white/75 text-sm mt-0.5">{t("payroll.subtitle")}</p>
            </div>
          </div>

          {/* Right: quick total */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-4 shrink-0 min-w-[160px]">
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">{t("payroll.stats.totalPayout")}</p>
            <p className="text-3xl font-black tabular-nums mt-0.5">
              {formatCurrency(totals.totalPayout, currency)}
            </p>
            <p className="text-white/60 text-[11px] mt-1">{fmtDateShort(from)} {t("payroll.dateTo")} {fmtDateShort(to)}</p>
          </div>
        </div>
      </div>

      {/* ── TABS ──────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="compute">
        <TabsList className="w-full h-11 bg-muted/60 rounded-xl p-1 gap-1">
          <TabsTrigger value="compute" className="flex-1 h-9 rounded-lg text-xs font-bold gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-quick-compute">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("payroll.tabs.quickCompute")}
          </TabsTrigger>
          <TabsTrigger value="periods" className="flex-1 h-9 rounded-lg text-xs font-bold gap-1.5 data-[state=active]:shadow-sm" data-testid="tab-pay-periods">
            <Calendar className="h-3.5 w-3.5" />
            {t("payroll.tabs.payPeriods")}
            {periods.length > 0 && (
              <span className="ml-0.5 h-4 min-w-[1rem] rounded-full bg-primary text-primary-foreground text-[9px] font-black px-1 flex items-center justify-center">
                {periods.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════
            QUICK COMPUTE TAB
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="compute" className="space-y-5 mt-5">

          {/* Date range card */}
          <div className="rounded-2xl bg-card border border-border/50 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">{t("payroll.tabs.quickCompute")}</span>
            </div>

            {/* Preset pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                    preset === p
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border/60 text-muted-foreground hover:border-primary/60 hover:text-foreground bg-muted/40"
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
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1.5">{t("payroll.periods.startDate")}</label>
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="h-9 text-sm" data-testid="input-payroll-from" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1.5">{t("payroll.periods.endDate")}</label>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="h-9 text-sm" data-testid="input-payroll-to" />
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard index={0} icon={Banknote} label={t("payroll.stats.totalPayout")} value={formatCurrency(totals.totalPayout, currency)} sub={t("payroll.stats.dueThisPeriod")} />
            <StatCard index={1} icon={Clock} label={t("payroll.stats.totalHours")} value={totals.totalHours.toFixed(1) + " " + t("payroll.staff.hrs")} sub={t("payroll.stats.acrossHourlyStaff")} />
            <StatCard index={2} icon={TrendingUp} label={t("payroll.stats.commissionSales")} value={formatCurrency(totals.totalCommissionable, currency)} sub={t("payroll.stats.commissionableRevenue")} />
            <StatCard index={3} icon={Users} label={t("payroll.stats.staffCount")} value={String(totals.staffCount)} sub={t("payroll.stats.onPayroll")} />
          </div>

          {/* Staff payroll section */}
          <div className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden">

            {/* Toolbar */}
            <div className="px-5 py-4 border-b border-border/40 flex items-center flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-bold">{t("payroll.staff.title")}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder={t("payroll.staff.searchPlaceholder")} className="h-8 pl-8 text-xs w-40" data-testid="input-staff-search" />
                </div>
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
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={exportComputeCSV} data-testid="btn-export-csv">
                  <FileDown className="h-3.5 w-3.5" />
                  {t("payroll.export.exportCSV")}
                </Button>
              </div>
            </div>

            {/* Staff list */}
            {staffLoading || payrollLoading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <Users className="h-9 w-9 text-muted-foreground/40 mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  {staffSearch || wageFilter !== "all" ? t("payroll.staff.noMatch") : t("payroll.staff.noStaffYet")}
                </p>
                {!staffSearch && wageFilter === "all" && (
                  <p className="text-xs text-muted-foreground/60">{t("payroll.staff.noStaffHint")}</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredStaff.map((s, idx) => {
                  const entry = entriesByUser.get(s.id);
                  const hasPayout = (entry?.payout ?? 0) > 0;
                  const maxPayout = Math.max(...filteredStaff.map(m => entriesByUser.get(m.id)?.payout ?? 0), 1);
                  const barPct = hasPayout ? Math.round(((entry?.payout ?? 0) / maxPayout) * 100) : 0;

                  return (
                    <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors" data-testid={`row-payroll-${s.id}`}>
                      <Avatar name={s.name || s.email || "?"} id={s.id} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-bold truncate">{s.name || s.email}</p>
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-bold shrink-0">
                            {roleLabel(s.role)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <WageChip s={s} currency={currency} t={t} />
                          {entry?.hoursWorked != null && entry.hoursWorked > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-medium">
                              <Clock className="h-2.5 w-2.5" />
                              {entry.hoursWorked.toFixed(1)} {t("payroll.staff.hrs")}
                            </span>
                          )}
                          {(entry?.salesAmount ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 font-medium">
                              <CreditCard className="h-2.5 w-2.5" />
                              {formatCurrency(entry!.salesAmount, currency)}
                            </span>
                          )}
                        </div>
                        {/* Relative payout bar */}
                        {hasPayout && (
                          <div className="mt-1.5 h-1 w-full max-w-[180px] rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${avatarGradient(s.id)} transition-all duration-500`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Payout */}
                      <div className="text-right shrink-0">
                        <p className={`text-base font-black tabular-nums ${hasPayout ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}`}>
                          {formatCurrency(entry?.payout ?? 0, currency)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {entry && hasPayout && (
                          <Button size="icon" variant="ghost" onClick={() => setPaystubTarget({ staff: s, entry })} className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid={`btn-paystub-${s.id}`} title={t("payroll.staff.viewPaystub")}>
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => openWageEdit(s)} className="h-8 w-8 text-muted-foreground hover:text-foreground" data-testid={`btn-edit-wage-${s.id}`} title={t("payroll.staff.editWage")}>
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

        {/* ════════════════════════════════════════════════════════════════════
            PAY PERIODS TAB
        ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="periods" className="space-y-4 mt-5">

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{t("payroll.periods.title")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("payroll.periods.noPeriodsHint")}</p>
            </div>
            <Button size="sm" className="h-9 gap-1.5 shrink-0 shadow-sm" onClick={() => setCreatePeriodOpen(true)} data-testid="btn-new-period">
              <Plus className="h-3.5 w-3.5" />
              {t("payroll.periods.newPeriod")}
            </Button>
          </div>

          {periodsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />)}
            </div>
          ) : periods.length === 0 ? (
            <div className="rounded-2xl bg-card border border-dashed border-border p-12 text-center space-y-3">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <Calendar className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("payroll.periods.noPeriods")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-[260px] mx-auto">{t("payroll.periods.noPeriodsHint")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCreatePeriodOpen(true)} className="gap-1.5 mt-1">
                <Plus className="h-3.5 w-3.5" />
                {t("payroll.periods.newPeriod")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {periods.map((period) => {
                const isExpanded = expandedPeriod === period.id;
                const cfgStatus = STATUS_STYLES[period.status] ?? STATUS_STYLES.draft;

                return (
                  <div key={period.id} className="rounded-2xl bg-card border border-border/50 shadow-sm overflow-hidden" data-testid={`card-period-${period.id}`}>

                    {/* Header */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedPeriod(isExpanded ? null : period.id)}
                      data-testid={`btn-expand-period-${period.id}`}
                    >
                      {/* Status indicator stripe */}
                      <div className={`w-1 self-stretch rounded-full ${cfgStatus.dot} shrink-0 opacity-60`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                          <span className="text-sm font-bold">{period.name}</span>
                          <StatusPill status={period.status} t={t} />
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {fmtDate(period.startDate)} <ArrowRight className="h-2.5 w-2.5 opacity-50" /> {fmtDate(period.endDate)}
                        </p>
                        {period.paidAt && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {t("payroll.periods.statusPaid")} {fmtDate(period.paidAt)}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(period.totalAmount || "0", currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t("payroll.periods.totalPayout")}</p>
                      </div>

                      <div className="shrink-0 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                    </button>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="border-t border-border/30">

                        {/* Action bar */}
                        <div className="px-5 py-3 bg-muted/30 flex items-center gap-2 flex-wrap border-b border-border/20">
                          {period.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold gap-1.5" onClick={() => setConfirmAction({ type: "finalize", periodId: period.id, name: period.name })} data-testid={`btn-finalize-${period.id}`}>
                              <CheckCircle2 className="h-3 w-3 text-amber-600" />
                              {t("payroll.periods.finalize")}
                            </Button>
                          )}
                          {period.status === "finalized" && (
                            <Button size="sm" className="h-7 text-[11px] font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConfirmAction({ type: "markPaid", periodId: period.id, name: period.name })} data-testid={`btn-mark-paid-${period.id}`}>
                              <Banknote className="h-3 w-3" />
                              {t("payroll.periods.markPaid")}
                            </Button>
                          )}
                          {period.status === "paid" && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t("payroll.periods.statusPaid")}
                            </span>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] font-bold gap-1.5 text-muted-foreground" onClick={exportPeriodCSV} data-testid={`btn-export-period-${period.id}`}>
                            <FileDown className="h-3 w-3" />
                            {t("payroll.export.exportCSV")}
                          </Button>
                          {period.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] font-bold gap-1.5 text-destructive hover:text-destructive ml-auto" onClick={() => setConfirmAction({ type: "delete", periodId: period.id, name: period.name })} data-testid={`btn-delete-period-${period.id}`}>
                              <Trash2 className="h-3 w-3" />
                              {t("payroll.periods.deletePeriod")}
                            </Button>
                          )}
                        </div>

                        {/* Entries table */}
                        {periodEntries.length === 0 ? (
                          <div className="py-10 text-center text-xs text-muted-foreground">{t("payroll.entries.noEntries")}</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/40">
                                  {[
                                    "employee", "wageType", "hours", "base",
                                    "commission", "tips", "bonus", "deductions", "advance", "net",
                                  ].map((col) => (
                                    <th key={col} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-widest font-black text-muted-foreground whitespace-nowrap">
                                      {t(`payroll.entries.${col}`)}
                                    </th>
                                  ))}
                                  <th className="px-3 w-8" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {periodEntries.map((entry) => {
                                  const net = parseFloat(entry.netAmount);
                                  const base = parseFloat(entry.baseAmount);
                                  const comm = parseFloat(entry.commissionAmount || "0");
                                  const tip = parseFloat(entry.tipAmount || "0");
                                  const ded = parseFloat(entry.deductionAmount || "0");
                                  const adv = parseFloat(entry.advanceAmount || "0");
                                  return (
                                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-entry-${entry.id}`}>
                                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <Avatar name={entry.employeeName} id={entry.employeeUserId} size="sm" />
                                          <span>{entry.employeeName}</span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 capitalize">
                                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold text-[10px]">{entry.wageType}</span>
                                      </td>
                                      <td className="px-4 py-3 tabular-nums">{parseFloat(entry.hoursWorked || "0").toFixed(1)}</td>
                                      <td className="px-4 py-3 tabular-nums">{formatCurrency(base, currency)}</td>
                                      <td className="px-4 py-3 tabular-nums text-violet-600 dark:text-violet-400">{comm > 0 ? formatCurrency(comm, currency) : "—"}</td>
                                      <td className="px-4 py-3 tabular-nums text-amber-600 dark:text-amber-400">{tip > 0 ? formatCurrency(tip, currency) : "—"}</td>
                                      <td className="px-4 py-3 tabular-nums text-sky-600 dark:text-sky-400">{parseFloat(entry.bonusAmount || "0") > 0 ? formatCurrency(entry.bonusAmount || "0", currency) : "—"}</td>
                                      <td className="px-4 py-3 tabular-nums text-rose-600 dark:text-rose-400">{ded > 0 ? `-${formatCurrency(ded, currency)}` : "—"}</td>
                                      <td className="px-4 py-3 tabular-nums text-rose-600 dark:text-rose-400">{adv > 0 ? `-${formatCurrency(adv, currency)}` : "—"}</td>
                                      <td className="px-4 py-3 font-black tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                        {formatCurrency(net, currency)}
                                      </td>
                                      <td className="px-3 py-3">
                                        {period.status === "draft" && (
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEntryForm({ ...entry }); setEditingEntry(entry); }} data-testid={`btn-edit-entry-${entry.id}`}>
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Footer */}
                        {(period.notes || period.finalizedAt) && (
                          <div className="px-5 py-3 border-t border-border/20 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                            {period.notes && <span className="italic">"{period.notes}"</span>}
                            {period.finalizedAt && (
                              <span className="flex items-center gap-1">
                                <Info className="h-2.5 w-2.5" />
                                {t("payroll.periods.statusFinalized")} {fmtDate(period.finalizedAt)}
                              </span>
                            )}
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

      {/* ════════════════════════════════════════════════════════════════════════
          PAY STUB SHEET
      ════════════════════════════════════════════════════════════════════════ */}
      <Sheet open={!!paystubTarget} onOpenChange={(o) => !o && setPaystubTarget(null)}>
        <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
          {paystubTarget && (() => {
            const { staff: s, entry } = paystubTarget;
            return (
              <>
                <SheetHeader className="mb-5">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <Receipt className="h-4 w-4 text-primary" />
                    {t("payroll.paystub.title")}
                  </SheetTitle>
                </SheetHeader>

                {/* Employee card */}
                <div className={`rounded-2xl bg-gradient-to-br ${avatarGradient(s.id)} p-4 text-white mb-5 relative overflow-hidden`}>
                  <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full bg-white/10" />
                  <div className="flex items-center gap-3 relative">
                    <div className="h-12 w-12 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center text-lg font-black">
                      {(s.name || s.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-base leading-tight">{s.name || s.email}</p>
                      <p className="text-white/75 text-xs">{roleLabel(s.role)}</p>
                      <WageChip s={s} currency={currency} t={t} />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between relative">
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider">{t("payroll.paystub.period")}</p>
                    <p className="text-white/90 text-xs font-semibold">{fmtDateShort(from)} {t("payroll.dateTo")} {fmtDateShort(to)}</p>
                  </div>
                </div>

                {/* Breakdown rows */}
                <div className="space-y-0 rounded-xl border border-border/50 overflow-hidden mb-5">
                  {[
                    { label: t("payroll.paystub.hoursWorked"), value: `${entry.hoursWorked.toFixed(2)} ${t("payroll.staff.hrs")}`, show: entry.hoursWorked > 0, color: "" },
                    { label: t("payroll.paystub.salesAmount"), value: formatCurrency(entry.salesAmount, currency), show: entry.salesAmount > 0, color: "" },
                  ].filter((r) => r.show).map((row, i, arr) => (
                    <div key={row.label} className={`px-4 py-2.5 flex justify-between items-center text-sm ${i < arr.length - 1 ? "border-b border-border/30" : ""} bg-muted/30`}>
                      <span className="text-muted-foreground text-xs">{row.label}</span>
                      <span className="font-semibold text-xs">{row.value}</span>
                    </div>
                  ))}
                  <div className="px-4 py-2.5 flex justify-between items-center text-sm bg-card">
                    <span className="text-muted-foreground text-xs">{t("payroll.paystub.basePay")}</span>
                    <span className="font-bold text-sm">{formatCurrency(entry.payout, currency)}</span>
                  </div>
                </div>

                {/* Net pay banner */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white flex items-center justify-between shadow-lg mb-5">
                  <div>
                    <p className="text-white/75 text-[10px] font-bold uppercase tracking-wider">{t("payroll.paystub.netPay")}</p>
                    <p className="text-3xl font-black tabular-nums mt-0.5">{formatCurrency(entry.payout, currency)}</p>
                  </div>
                  <Sparkles className="h-8 w-8 text-white/30" />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => window.print()} data-testid="btn-print-paystub">
                    <Printer className="h-3.5 w-3.5" />
                    {t("payroll.paystub.printStub")}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={exportComputeCSV} data-testid="btn-export-paystub">
                    <FileDown className="h-3.5 w-3.5" />
                    {t("payroll.export.exportCSV")}
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ════════════════════════════════════════════════════════════════════════
          EDIT WAGE DIALOG
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editingWage} onOpenChange={(o) => !o && setEditingWage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              {t("payroll.wage.settings")}
            </DialogTitle>
          </DialogHeader>
          {editingWage && (
            <div className="flex items-center gap-2.5 mb-1 py-2 px-3 rounded-xl bg-muted/60">
              <Avatar name={editingWage.name || editingWage.email || "?"} id={editingWage.id} size="sm" />
              <div>
                <p className="text-sm font-semibold">{editingWage.name || editingWage.email}</p>
                <p className="text-[10px] text-muted-foreground">{roleLabel(editingWage.role)}</p>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold mb-1.5 block text-muted-foreground uppercase tracking-wider">{t("payroll.wage.type")}</label>
              <Select value={wageForm.wageType} onValueChange={(v) => setWageForm({ ...wageForm, wageType: v as WageType })}>
                <SelectTrigger className="h-10 rounded-xl" data-testid="select-wage-type">
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
                <label className="text-xs font-bold mb-1.5 block text-muted-foreground uppercase tracking-wider">
                  {wageForm.wageType === "hourly" ? t("payroll.wage.ratePerHour") : t("payroll.wage.monthlyAmount")} ({currency})
                </label>
                <Input type="number" step="0.01" min="0" value={wageForm.wageRate} onChange={(e) => setWageForm({ ...wageForm, wageRate: e.target.value })} className="h-10 rounded-xl" data-testid="input-wage-rate" />
              </div>
            )}

            {wageForm.wageType === "commission" && (
              <div>
                <label className="text-xs font-bold mb-1.5 block text-muted-foreground uppercase tracking-wider">{t("payroll.wage.commissionPercent")} (%)</label>
                <Input type="number" step="0.01" min="0" max="100" value={wageForm.commissionPercent} onChange={(e) => setWageForm({ ...wageForm, commissionPercent: e.target.value })} className="h-10 rounded-xl" data-testid="input-commission-percent" />
                <p className="text-[10px] text-muted-foreground mt-1.5">{t("payroll.wage.commissionHint")}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={() => setEditingWage(null)} className="flex-1 h-10 rounded-xl" data-testid="btn-cancel-wage">{t("common.cancel")}</Button>
              <Button onClick={() => updateWageMutation.mutate({ id: editingWage!.id, data: wageForm })} disabled={updateWageMutation.isPending} className="flex-1 h-10 rounded-xl gap-1.5" data-testid="btn-save-wage">
                <Save className="h-3.5 w-3.5" />
                {updateWageMutation.isPending ? t("payroll.wage.saving") : t("payroll.wage.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          EDIT ENTRY DIALOG
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              {t("payroll.entries.editEntry")}
            </DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <div className="flex items-center gap-2.5 mb-1 py-2 px-3 rounded-xl bg-muted/60">
              <Avatar name={editingEntry.employeeName} id={editingEntry.employeeUserId} size="sm" />
              <p className="text-sm font-semibold">{editingEntry.employeeName}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
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
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{label}</label>
                <Input type="number" step="0.01" min="0" value={(entryForm as any)[key] ?? "0"} onChange={(e) => setEntryForm({ ...entryForm, [key]: e.target.value })} className="h-9 text-sm rounded-xl" data-testid={`input-entry-${key}`} />
              </div>
            ))}
          </div>
          <div className="mt-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">{t("payroll.entries.notes")}</label>
            <Textarea value={entryForm.notes ?? ""} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} rows={2} className="text-sm resize-none rounded-xl" data-testid="input-entry-notes" />
          </div>

          {/* Live net preview */}
          {(() => {
            const base = parseFloat((entryForm as any).baseAmount || "0") || 0;
            const comm = parseFloat((entryForm as any).commissionAmount || "0") || 0;
            const tip  = parseFloat((entryForm as any).tipAmount || "0") || 0;
            const bon  = parseFloat((entryForm as any).bonusAmount || "0") || 0;
            const ded  = parseFloat((entryForm as any).deductionAmount || "0") || 0;
            const adv  = parseFloat((entryForm as any).advanceAmount || "0") || 0;
            const net  = base + comm + tip + bon - ded - adv;
            return (
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-3 flex justify-between items-center text-white mt-1">
                <span className="text-xs font-bold uppercase tracking-wider text-white/80">{t("payroll.paystub.netPay")}</span>
                <span className="text-xl font-black tabular-nums">{formatCurrency(net, currency)}</span>
              </div>
            );
          })()}

          <div className="flex gap-2 mt-1">
            <Button variant="outline" onClick={() => setEditingEntry(null)} className="flex-1 h-10 rounded-xl" data-testid="btn-cancel-entry">{t("common.cancel")}</Button>
            <Button onClick={() => updateEntryMutation.mutate({ id: editingEntry!.id, data: entryForm })} disabled={updateEntryMutation.isPending} className="flex-1 h-10 rounded-xl gap-1.5" data-testid="btn-save-entry">
              <Save className="h-3.5 w-3.5" />
              {updateEntryMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          CREATE PERIOD DIALOG
      ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={createPeriodOpen} onOpenChange={setCreatePeriodOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {t("payroll.periods.createPeriod")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{t("payroll.periods.periodName")}</label>
              <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t("payroll.periods.periodNamePlaceholder")} className="h-10 rounded-xl" data-testid="input-period-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{t("payroll.periods.startDate")}</label>
                <Input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })} className="h-10 rounded-xl" data-testid="input-period-start" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{t("payroll.periods.endDate")}</label>
                <Input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })} className="h-10 rounded-xl" data-testid="input-period-end" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{t("payroll.periods.notes")}</label>
              <Textarea value={periodForm.notes} onChange={(e) => setPeriodForm({ ...periodForm, notes: e.target.value })} rows={2} className="text-sm resize-none rounded-xl" data-testid="input-period-notes" />
            </div>
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 px-3.5 py-2.5 text-[11px] text-sky-700 dark:text-sky-400 flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {t("payroll.periods.autoGenerated")}
            </div>
            <div className="flex gap-2 pt-0.5">
              <Button variant="outline" onClick={() => setCreatePeriodOpen(false)} className="flex-1 h-10 rounded-xl" data-testid="btn-cancel-period">{t("common.cancel")}</Button>
              <Button onClick={() => createPeriodMutation.mutate(periodForm)} disabled={createPeriodMutation.isPending || !periodForm.name || !periodForm.startDate || !periodForm.endDate} className="flex-1 h-10 rounded-xl gap-1.5" data-testid="btn-create-period">
                <Plus className="h-3.5 w-3.5" />
                {createPeriodMutation.isPending ? t("common.loading") : t("common.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          CONFIRM ACTION ALERT
      ════════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "finalize" && t("payroll.periods.finalizeConfirm")}
              {confirmAction?.type === "markPaid" && t("payroll.periods.markPaidConfirm")}
              {confirmAction?.type === "delete" && t("payroll.periods.deleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-foreground">{confirmAction?.name}</span> —{" "}
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
              className={confirmAction?.type === "delete" ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : ""}
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
