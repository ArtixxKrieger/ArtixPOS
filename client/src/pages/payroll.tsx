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
import {
  Banknote, Clock, TrendingUp, Users, Pencil, Save, Calendar,
  FileDown, Printer, Search, ChevronDown, ChevronRight, ChevronUp,
  CheckCircle2, Trash2, Plus, AlertCircle,
  Receipt, Tag, Building2, Zap,
  BarChart2, Trophy, UserPlus, TrendingDown,
  CreditCard, Wallet, type LucideIcon,
} from "lucide-react";
import { useBranches } from "@/hooks/use-admin";

type WageType = "none" | "hourly" | "monthly" | "commission";
type StaffWage = { id: string; name: string | null; email: string | null; role: string; wageType: WageType | null; wageRate: string | null; commissionPercent: string | null; staffGroup: string | null; branchId: number | null; branchName: string | null };
type ComputedEntry = { userId: string; name: string | null; email: string | null; role: string; wageType: WageType; wageRate: number; commissionPercent: number; hoursWorked: number; salesAmount: number; payout: number; notes: string };
type PayrollResponse = { from: string; to: string; entries: ComputedEntry[]; totals: { totalPayout: number; totalHours: number; totalCommissionable: number; staffCount: number } };
type PayrollPeriod = { id: number; name: string; startDate: string; endDate: string; status: "draft" | "finalized" | "paid"; totalAmount: string | null; notes: string | null; createdAt: string; finalizedAt: string | null; paidAt: string | null; paymentMethod?: string | null; paymentReference?: string | null };
type PayrollEntry = { id: number; periodId: number; employeeUserId: string; employeeName: string; wageType: string; wageRate: string; hoursWorked: string | null; baseAmount: string; commissionAmount: string | null; tipAmount: string | null; bonusAmount: string | null; deductionAmount: string | null; advanceAmount: string | null; netAmount: string; notes: string | null };
type AnalyticsPeriod = { id: number; name: string; startDate: string; endDate: string; status: string; totalAmount: number };
type AnalyticsData = { periods: AnalyticsPeriod[]; topEarners: { name: string; total: number; periods: number }[]; wageTypeBreakdown: { type: string; total: number }[] };
type HistoryEntry = { entryId: number; periodId: number; periodName: string; startDate: string; endDate: string; status: string; paidAt: string | null; netAmount: string; hoursWorked: string; wageType: string };

const todayISO = (d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const startOfWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); };
const startOfLastWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 7); return d.toISOString().slice(0, 10); };
const endOfLastWeek = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay() - 1); return d.toISOString().slice(0, 10); };
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const startOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10); };
const endOfLastMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10); };
const fmtShort = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

const fmtMed = (iso: string) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const blob = new Blob([[h.join(","), ...rows.map(r => h.map(k => JSON.stringify(r[k] ?? "")).join(","))].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

const AVATAR_COLORS = ["bg-violet-500","bg-emerald-500","bg-rose-500","bg-amber-500","bg-sky-500","bg-indigo-500","bg-pink-500","bg-teal-500"];
function avatarColor(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return AVATAR_COLORS[h % AVATAR_COLORS.length]; }

const PAY_METHODS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "cash",    label: "Cash",     icon: Banknote },
  { id: "card",    label: "Card",     icon: CreditCard },
  { id: "ewallet", label: "E-Wallet", icon: Wallet },
];
function PayMethodIcon({ method, className }: { method: string; className?: string }) {
  const m = PAY_METHODS.find(x => x.id === method);
  if (!m) return null;
  const Icon = m.icon;
  return <Icon className={className ?? "h-3 w-3 inline-block"} />;
}
function payMethodLabel(m: string) { return PAY_METHODS.find(x => x.id === m)?.label ?? m; }

function Av({ name, id, sm }: { name: string; id: string; sm?: boolean }) {
  return (
    <div className={`${sm ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"} rounded-full ${avatarColor(id)} text-white flex items-center justify-center font-bold shrink-0`}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function StatusDot({ status, t }: { status: string; t: any }) {
  const cfg = {
    draft:     { dot: "bg-slate-400",   text: "text-slate-500 dark:text-slate-400",    label: t("payroll.periods.statusDraft") },
    finalized: { dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",    label: t("payroll.periods.statusFinalized") },
    paid:      { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: t("payroll.periods.statusPaid") },
  }[status] ?? { dot: "bg-slate-400", text: "text-slate-500", label: status };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

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
  const [wageForm, setWageForm] = useState({ wageType: "none" as WageType, wageRate: "0", commissionPercent: "0", staffGroup: "" });
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPayPreset, setQuickPayPreset] = useState("thisMonth");
  const [quickPayBranchId, setQuickPayBranchId] = useState<number | null>(null);
  const [quickPayMethod, setQuickPayMethod] = useState("cash");
  const [quickPayReference, setQuickPayReference] = useState("");
  const [quickPayDuplicate, setQuickPayDuplicate] = useState<{ name: string; startDate: string; endDate: string } | null>(null);
  const [quickPayForce, setQuickPayForce] = useState(false);
  const [markPaidDialog, setMarkPaidDialog] = useState<{ periodId: number; name: string; totalAmount: string } | null>(null);
  const [markPaidMethod, setMarkPaidMethod] = useState("cash");
  const [markPaidRef, setMarkPaidRef] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [createPeriodOpen, setCreatePeriodOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [entryForm, setEntryForm] = useState<Partial<PayrollEntry>>({});
  const [confirmAction, setConfirmAction] = useState<{ type: string; periodId: number; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "finalized" | "paid">("all");
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addEntryForm, setAddEntryForm] = useState({ employeeUserId: "", baseAmount: "0", commissionAmount: "0", tipAmount: "0", bonusAmount: "0", deductionAmount: "0", advanceAmount: "0", hoursWorked: "0", notes: "" });

const { data: branches = [] } = useBranches();

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

  const { data: analytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/payroll/analytics"],
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

const staffHistoryId = paystubTarget?.staff.id ?? null;
  const { data: staffHistory = [] } = useQuery<HistoryEntry[]>({
    queryKey: ["/api/payroll/staff", staffHistoryId, "history"],
    queryFn: async () => {
      if (!staffHistoryId) return [];
      const r = await nativeFetch(`/api/payroll/staff/${staffHistoryId}/history`);
      return r.ok ? r.json() : [];
    },
    enabled: !!staffHistoryId,
    staleTime: 1000 * 60,
  });

const updateWageMutation = useMutation({
    mutationFn: async (v: { id: string; data: typeof wageForm }) => (await apiRequest("PUT", `/api/payroll/staff/${v.id}`, v.data)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/staff"] }); queryClient.invalidateQueries({ queryKey: ["/api/payroll/compute"] }); setEditingWage(null); toast({ title: t("payroll.wage.updated") }); },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const quickPayMutation = useMutation({
    mutationFn: async (v: { name: string; from: string; to: string; branchId?: number | null; paymentMethod?: string; paymentReference?: string; force?: boolean }) => {
      const res = await nativeFetch("/api/payroll/quick-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      if (!res.ok) {
        const err: any = new Error(data.message || "Quick Pay failed");
        if (res.status === 409 && data.conflict) err.conflict = data.conflict;
        throw err;
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      setQuickPayOpen(false);
      setQuickPayDuplicate(null);
      setQuickPayForce(false);
      setQuickPayReference("");
      toast({ title: `Pay Day complete! ${data.entryCount} employee${data.entryCount !== 1 ? "s" : ""} paid via ${payMethodLabel(quickPayMethod)}.` });
    },
    onError: (e: any) => {
      if ((e as any).conflict) {
        setQuickPayDuplicate((e as any).conflict);
      } else {
        toast({ title: t("common.error"), description: e?.message || "Quick Pay failed", variant: "destructive" });
      }
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (d: typeof periodForm) =>
      (await apiRequest("POST", "/api/payroll/periods", { name: d.name, from: d.startDate, to: d.endDate, notes: d.notes, entries: [] })).json(),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      setCreatePeriodOpen(false);
      setPeriodForm({ name: "", startDate: startOfMonth(), endDate: todayISO(), notes: "" });
      setExpandedPeriod(p.period?.id ?? p.id ?? null);
      toast({ title: t("payroll.periods.created_toast") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async (v: { id: number; data: Partial<PayrollEntry> }) => (await apiRequest("PUT", `/api/payroll/entries/${v.id}`, v.data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods", expandedPeriod, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      setEditingEntry(null);
      toast({ title: t("payroll.entries.updated") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const addEntryMutation = useMutation({
    mutationFn: async (v: { periodId: number; data: any }) =>
      (await apiRequest("POST", `/api/payroll/periods/${v.periodId}/entries`, v.data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods", expandedPeriod, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      setAddEntryOpen(false);
      setAddEntryForm({ employeeUserId: "", baseAmount: "0", commissionAmount: "0", tipAmount: "0", bonusAmount: "0", deductionAmount: "0", advanceAmount: "0", hoursWorked: "0", notes: "" });
      toast({ title: "Employee added to period" });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/payroll/entries/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods", expandedPeriod, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      toast({ title: "Entry removed" });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest("POST", `/api/payroll/periods/${id}/finalize`, {})).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] }); setConfirmAction(null); toast({ title: t("payroll.periods.finalized_toast") }); },
  });
  const markPaidMutation = useMutation({
    mutationFn: async (v: { id: number; paymentMethod?: string; paymentReference?: string }) =>
      (await apiRequest("POST", `/api/payroll/periods/${v.id}/pay`, { paymentMethod: v.paymentMethod, paymentReference: v.paymentReference })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] });
      setMarkPaidDialog(null);
      setMarkPaidMethod("cash");
      setMarkPaidRef("");
      toast({ title: t("payroll.periods.paid_toast") });
    },
    onError: (e: any) => toast({ title: t("common.error"), description: e?.message, variant: "destructive" }),
  });
  const deletePeriodMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/payroll/periods/${id}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payroll/periods"] }); queryClient.invalidateQueries({ queryKey: ["/api/payroll/analytics"] }); if (expandedPeriod === confirmAction?.periodId) setExpandedPeriod(null); setConfirmAction(null); toast({ title: t("payroll.periods.deleted_toast") }); },
  });

const entriesByUser = useMemo(() => { const m = new Map<string, ComputedEntry>(); payroll?.entries.forEach(e => m.set(e.userId, e)); return m; }, [payroll]);
  const filteredStaff = useMemo(() => staff.filter(s => { const q = staffSearch.toLowerCase(); return (!q || (s.name || s.email || "").toLowerCase().includes(q)) && (wageFilter === "all" || (s.wageType ?? "none") === wageFilter); }), [staff, staffSearch, wageFilter]);
  const totals = payroll?.totals ?? { totalPayout: 0, totalHours: 0, totalCommissionable: 0, staffCount: 0 };
  const filteredPeriods = useMemo(() => statusFilter === "all" ? periods : periods.filter(p => p.status === statusFilter), [periods, statusFilter]);
  const staffInPeriod = useMemo(() => new Set(periodEntries.map(e => e.employeeUserId)), [periodEntries]);
  const staffNotInPeriod = useMemo(() => staff.filter(s => !staffInPeriod.has(s.id)), [staff, staffInPeriod]);

type BranchGroup = { branchId: number | null; branchName: string; departments: [string, StaffWage[]][] };
  const staffGroups = useMemo((): BranchGroup[] => {
    const branchMap = new Map<number | -1, { branchName: string; depts: Map<string, StaffWage[]> }>();
    for (const s of filteredStaff) {
      const bKey = s.branchId ?? -1;
      if (!branchMap.has(bKey)) branchMap.set(bKey, { branchName: s.branchName || "No Branch", depts: new Map() });
      const dept = s.staffGroup?.trim() || "";
      const bg = branchMap.get(bKey)!;
      if (!bg.depts.has(dept)) bg.depts.set(dept, []);
      bg.depts.get(dept)!.push(s);
    }
    const sortDepts = (entries: [string, StaffWage[]][]) =>
      entries.sort(([a], [b]) => (!a && !b) ? 0 : !a ? 1 : !b ? -1 : a.localeCompare(b));
    return Array.from(branchMap.entries())
      .sort(([a], [b]) => (a === -1 ? 1 : b === -1 ? -1 : 0))
      .map(([bKey, { branchName, depts }]) => ({
        branchId: bKey === -1 ? null : bKey as number,
        branchName,
        departments: sortDepts(Array.from(depts.entries())),
      }));
  }, [filteredStaff]);

  const toggleCollapse = (key: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    return next;
  });

function applyPreset(p: string) {
    setPreset(p);
    const map: Record<string, [string, string]> = { thisWeek: [startOfWeek(), todayISO()], lastWeek: [startOfLastWeek(), endOfLastWeek()], thisMonth: [startOfMonth(), todayISO()], lastMonth: [startOfLastMonth(), endOfLastMonth()], last30: [todayISO(-30), todayISO()] };
    if (map[p]) { setFrom(map[p][0]); setTo(map[p][1]); }
  }

  function roleLabel(role: string) { const k = `payroll.roles.${role}`; const v = t(k); return v === k ? role : v; }

  function exportComputeCSV() {
    if (!payroll) return;
    downloadCSV(`payroll-${from}-to-${to}.csv`, payroll.entries.map(e => ({ Employee: e.name || e.email || e.userId, Role: roleLabel(e.role), WageType: e.wageType, HoursWorked: e.hoursWorked, SalesAmount: e.salesAmount, NetPay: e.payout })));
    toast({ title: t("payroll.export.csvExported") });
  }

  function exportPeriodCSV() {
    if (!periodEntries.length) return;
    downloadCSV(`payroll-period.csv`, periodEntries.map(e => ({ Employee: e.employeeName, WageType: e.wageType, Hours: e.hoursWorked || "0", Base: e.baseAmount, Commission: e.commissionAmount || "0", Tips: e.tipAmount || "0", Bonus: e.bonusAmount || "0", Deductions: e.deductionAmount || "0", Advance: e.advanceAmount || "0", Net: e.netAmount })));
    toast({ title: t("payroll.export.csvExported") });
  }

  function quickPayDates(p: string): { from: string; to: string; label: string } {
    const now = new Date();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const mon = (d: Date) => { const r = new Date(d); r.setDate(1); return r; };
    const eom = (d: Date) => { const r = new Date(d.getFullYear(), d.getMonth() + 1, 0); return r; };
    const dow = now.getDay();
    switch (p) {
      case "thisWeek": { const s = new Date(now); s.setDate(now.getDate() - dow); return { from: ymd(s), to: ymd(now), label: "This Week" }; }
      case "lastWeek": { const e = new Date(now); e.setDate(now.getDate() - dow - 1); const s = new Date(e); s.setDate(e.getDate() - 6); return { from: ymd(s), to: ymd(e), label: "Last Week" }; }
      case "thisMonth": return { from: ymd(mon(now)), to: ymd(now), label: "This Month" };
      case "lastMonth": { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: ymd(mon(lm)), to: ymd(eom(lm)), label: "Last Month" }; }
      default: return { from: ymd(mon(now)), to: ymd(now), label: "This Month" };
    }
  }

  function computeEntryNet(f: Record<string, any>) {
    const b = parseFloat(f.baseAmount || "0") || 0;
    const c = parseFloat(f.commissionAmount || "0") || 0;
    const ti = parseFloat(f.tipAmount || "0") || 0;
    const bo = parseFloat(f.bonusAmount || "0") || 0;
    const d = parseFloat(f.deductionAmount || "0") || 0;
    const a = parseFloat(f.advanceAmount || "0") || 0;
    return b + c + ti + bo - d - a;
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-center">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("payroll.ownerOnly")}</p>
      </div>
    );
  }

return (
    <div className="space-y-4 page-enter">

      {}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("payroll.title")}</h1>
          <p className="text-xs text-muted-foreground">{fmtShort(from)} {t("payroll.dateTo")} {fmtShort(to)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => setQuickPayOpen(true)} className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md" data-testid="btn-pay-day">
            <Zap className="h-3.5 w-3.5" /><span className="hidden xs:inline">Pay Day</span><span className="xs:hidden">Pay</span>
          </Button>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t("payroll.stats.totalPayout")}</p>
            <p className="text-base sm:text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.totalPayout, currency)}</p>
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t("payroll.stats.totalHours"), value: `${totals.totalHours.toFixed(1)} ${t("payroll.staff.hrs")}`, icon: Clock },
          { label: t("payroll.stats.commissionSales"), value: formatCurrency(totals.totalCommissionable, currency), icon: TrendingUp },
          { label: t("payroll.stats.staffCount"), value: `${totals.staffCount} ${t("payroll.stats.onPayroll")}`, icon: Users },
        ].map(({ label, value, icon: _Icon }) => (
          <div key={label} className="rounded-xl bg-muted/40 border border-border/40 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
            <p className="text-xs font-bold truncate">{value}</p>
          </div>
        ))}
      </div>

      {}
      <Tabs defaultValue="compute">
        <TabsList className="w-full h-9 rounded-lg p-0.5 bg-muted/50 grid grid-cols-3">
          <TabsTrigger value="compute" className="h-8 rounded-md text-xs font-semibold px-1" data-testid="tab-quick-compute">
            <TrendingUp className="h-3 w-3 shrink-0" /><span className="ml-1 hidden sm:inline truncate">{t("payroll.tabs.quickCompute")}</span><span className="ml-1 sm:hidden">Compute</span>
          </TabsTrigger>
          <TabsTrigger value="periods" className="h-8 rounded-md text-xs font-semibold px-1" data-testid="tab-pay-periods">
            <Calendar className="h-3 w-3 shrink-0" /><span className="ml-1 hidden sm:inline truncate">{t("payroll.tabs.payPeriods")}</span><span className="ml-1 sm:hidden">Periods</span>
            {periods.length > 0 && <span className="ml-1 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black px-1 flex items-center justify-center shrink-0">{periods.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="h-8 rounded-md text-xs font-semibold px-1" data-testid="tab-analytics">
            <BarChart2 className="h-3 w-3 shrink-0" /><span className="ml-1 truncate">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {}
        <TabsContent value="compute" className="space-y-3 mt-3">
          <div className="rounded-xl bg-card border border-border/40 p-3 space-y-2.5">
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

          <div className="rounded-xl bg-card border border-border/40 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border/30 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder={t("payroll.staff.searchPlaceholder")} className="h-7 pl-6 text-[11px] bg-muted/40 border-0" data-testid="input-staff-search" />
              </div>
              <Select value={wageFilter} onValueChange={setWageFilter}>
                <SelectTrigger className="h-7 text-[11px] w-28 bg-muted/40 border-0" data-testid="select-wage-filter"><SelectValue /></SelectTrigger>
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
              <div>
                {staffGroups.map(branchGroup => {
                  const bKey = `b:${branchGroup.branchId ?? "none"}`;
                  const isBranchCollapsed = collapsedGroups.has(bKey);
                  const allBranchStaff = branchGroup.departments.flatMap(([, m]) => m);
                  const branchTotal = allBranchStaff.reduce((s, m) => s + (entriesByUser.get(m.id)?.payout ?? 0), 0);
                  const showBranchHeader = staffGroups.length > 1 || branchGroup.branchId !== null;
                  return (
                    <div key={bKey} className="border-b border-border/15 last:border-0">
                      {showBranchHeader && (
                        <button onClick={() => toggleCollapse(bKey)} className="w-full flex items-center gap-2 px-3 py-2 bg-primary/5 hover:bg-primary/10 transition-colors" data-testid={`btn-branch-${bKey}`}>
                          <Building2 className="h-3 w-3 text-primary/60 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-wider flex-1 text-left text-foreground/80">{branchGroup.branchName}</span>
                          <span className="text-[10px] font-semibold text-muted-foreground">{allBranchStaff.length} staff · {formatCurrency(branchTotal, currency)}</span>
                          {isBranchCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                        </button>
                      )}
                      {!isBranchCollapsed && branchGroup.departments.map(([dept, members]) => {
                        const dKey = `d:${branchGroup.branchId ?? "none"}:${dept}`;
                        const isDeptCollapsed = collapsedGroups.has(dKey);
                        const deptTotal = members.reduce((s, m) => s + (entriesByUser.get(m.id)?.payout ?? 0), 0);
                        return (
                          <div key={dKey} className="border-b border-border/10 last:border-0">
                            {dept && (
                              <button onClick={() => toggleCollapse(dKey)} className={`w-full flex items-center gap-2 py-1.5 bg-muted/25 hover:bg-muted/45 transition-colors ${showBranchHeader ? "pl-6 pr-3" : "pl-3 pr-3"}`} data-testid={`btn-dept-${dKey}`}>
                                <Tag className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex-1 text-left">{dept}</span>
                                <span className="text-[9px] text-muted-foreground/60">{members.length} · {formatCurrency(deptTotal, currency)}</span>
                                {isDeptCollapsed ? <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" /> : <ChevronUp className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />}
                              </button>
                            )}
                            {!isDeptCollapsed && (
                              <div className="divide-y divide-border/20">
                                {members.map(s => {
                                  const entry = entriesByUser.get(s.id);
                                  const wt = s.wageType ?? "none";
                                  const wageLabel = wt === "hourly" ? `${formatCurrency(s.wageRate || "0", currency)}/hr` : wt === "monthly" ? `${formatCurrency(s.wageRate || "0", currency)}/mo` : wt === "commission" ? `${parseFloat(s.commissionPercent || "0").toFixed(1)}%` : null;
                                  const overtimeHrs = (entry && wt === "hourly" && entry.hoursWorked > 40) ? entry.hoursWorked - 40 : 0;
                                  return (
                                    <div key={s.id} className={`py-2.5 flex items-center gap-2.5 ${showBranchHeader ? (dept ? "pl-8 pr-3" : "pl-6 pr-3") : "px-3"}`} data-testid={`row-payroll-${s.id}`}>
                                      <Av name={s.name || s.email || "?"} id={s.id} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="text-xs font-semibold truncate">{s.name || s.email}</p>
                                          <span className="text-[9px] text-muted-foreground/60 font-medium shrink-0">{roleLabel(s.role)}</span>
                                          {overtimeHrs > 0 && (
                                            <span className="text-[9px] font-bold text-amber-500 shrink-0 flex items-center gap-0.5 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded" title={`${overtimeHrs.toFixed(1)} hrs overtime`}>
                                              <Clock className="h-2 w-2" />OT
                                            </span>
                                          )}
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
                                          <Button size="icon" variant="ghost" onClick={() => { setWageForm({ wageType: (s.wageType ?? "none") as WageType, wageRate: s.wageRate ?? "0", commissionPercent: s.commissionPercent ?? "0", staffGroup: s.staffGroup ?? "" }); setEditingWage(s); }} className="h-7 w-7 text-muted-foreground" data-testid={`btn-edit-wage-${s.id}`}>
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
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {}
        <TabsContent value="periods" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">{t("payroll.periods.title")}</p>
            <Button size="sm" className="h-7 text-xs gap-1 px-3" onClick={() => setCreatePeriodOpen(true)} data-testid="btn-new-period">
              <Plus className="h-3 w-3" />{t("payroll.periods.newPeriod")}
            </Button>
          </div>

          {}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "draft", "finalized", "paid"] as const).map(s => {
              const count = s === "all" ? periods.length : periods.filter(p => p.status === s).length;
              return (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`} data-testid={`btn-status-filter-${s}`}>
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  {count > 0 && <span className={`h-3.5 min-w-3.5 rounded-full text-[9px] font-black px-0.5 flex items-center justify-center ${statusFilter === s ? "bg-white/20 text-inherit" : "bg-muted text-muted-foreground"}`}>{count}</span>}
                </button>
              );
            })}
          </div>

          {filteredPeriods.length === 0 && !periodsFetching ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center space-y-2">
              <Calendar className="h-7 w-7 mx-auto text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">{statusFilter !== "all" ? `No ${statusFilter} periods` : t("payroll.periods.noPeriods")}</p>
              {statusFilter === "all" && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setCreatePeriodOpen(true)}>
                  <Plus className="h-3 w-3" />{t("payroll.periods.newPeriod")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPeriods.map(period => {
                const isExp = expandedPeriod === period.id;
                const entrySummary = isExp && periodEntries.length > 0 ? {
                  base: periodEntries.reduce((s, e) => s + (parseFloat(e.baseAmount) || 0), 0),
                  commission: periodEntries.reduce((s, e) => s + (parseFloat(e.commissionAmount || "0") || 0), 0),
                  bonus: periodEntries.reduce((s, e) => s + (parseFloat(e.bonusAmount || "0") || 0), 0),
                  tips: periodEntries.reduce((s, e) => s + (parseFloat(e.tipAmount || "0") || 0), 0),
                  deductions: periodEntries.reduce((s, e) => s + (parseFloat(e.deductionAmount || "0") || 0), 0),
                  advance: periodEntries.reduce((s, e) => s + (parseFloat(e.advanceAmount || "0") || 0), 0),
                } : null;

                return (
                  <div key={period.id} className="rounded-xl bg-card border border-border/40 overflow-hidden" data-testid={`card-period-${period.id}`}>
                    <button className="w-full text-left px-3.5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors" onClick={() => setExpandedPeriod(isExp ? null : period.id)} data-testid={`btn-expand-period-${period.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-semibold truncate">{period.name}</p>
                          <StatusDot status={period.status} t={t} />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {fmtShort(period.startDate)} → {fmtShort(period.endDate)}
                          {period.status === "paid" && period.paymentMethod && (
                            <> · <PayMethodIcon method={period.paymentMethod} className="h-2.5 w-2.5 inline-block align-middle" /> {payMethodLabel(period.paymentMethod)}{period.paymentReference ? ` · ${period.paymentReference}` : ""}</>
                          )}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(period.totalAmount || "0", currency)}</p>
                      {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>

                    {isExp && (
                      <div className="border-t border-border/20">
                        {}
                        <div className="px-3.5 py-2 flex items-center gap-1.5 flex-wrap bg-muted/20 border-b border-border/15">
                          {period.status === "draft" && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-[11px] px-2.5 gap-1" onClick={() => setConfirmAction({ type: "finalize", periodId: period.id, name: period.name })} data-testid={`btn-finalize-${period.id}`}>
                                <CheckCircle2 className="h-2.5 w-2.5" />{t("payroll.periods.finalize")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[11px] px-2.5 gap-1 text-sky-600 border-sky-200 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-950/40" onClick={() => setAddEntryOpen(true)} data-testid={`btn-add-entry-${period.id}`}>
                                <UserPlus className="h-2.5 w-2.5" />Add Employee
                              </Button>
                            </>
                          )}
                          {period.status === "finalized" && (
                            <Button size="sm" className="h-6 text-[11px] px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setMarkPaidDialog({ periodId: period.id, name: period.name, totalAmount: period.totalAmount || "0" }); setMarkPaidMethod("cash"); setMarkPaidRef(""); }} data-testid={`btn-mark-paid-${period.id}`}>
                              <Banknote className="h-2.5 w-2.5" />{t("payroll.periods.markPaid")}
                            </Button>
                          )}
                          {period.status === "paid" && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("payroll.periods.statusPaid")}
                              {period.paymentMethod && <span className="ml-1 opacity-70 flex items-center gap-0.5"><PayMethodIcon method={period.paymentMethod} className="h-2.5 w-2.5" /> {payMethodLabel(period.paymentMethod)}</span>}
                            </span>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 gap-1 text-muted-foreground" onClick={exportPeriodCSV} data-testid={`btn-export-period-${period.id}`}>
                            <FileDown className="h-2.5 w-2.5" />{t("payroll.export.exportCSV")}
                          </Button>
                          {period.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 gap-1 text-destructive ml-auto" onClick={() => setConfirmAction({ type: "delete", periodId: period.id, name: period.name })} data-testid={`btn-delete-period-${period.id}`}>
                              <Trash2 className="h-2.5 w-2.5" />{t("payroll.periods.deletePeriod")}
                            </Button>
                          )}
                        </div>

                        {}
                        {periodEntries.length === 0 ? (
                          <p className="px-3.5 py-5 text-center text-xs text-muted-foreground">{t("payroll.entries.noEntries")}</p>
                        ) : (
                          <>
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
                                        {parseFloat(entry.commissionAmount || "0") > 0 && <span className="text-violet-500">{formatCurrency(entry.commissionAmount || "0", currency)} comm</span>}
                                        {parseFloat(entry.bonusAmount || "0") > 0 && <span className="text-sky-500">+{formatCurrency(entry.bonusAmount || "0", currency)} bonus</span>}
                                        {parseFloat(entry.tipAmount || "0") > 0 && <span className="text-amber-500">+{formatCurrency(entry.tipAmount || "0", currency)} tips</span>}
                                        {parseFloat(entry.deductionAmount || "0") > 0 && <span className="text-rose-500">-{formatCurrency(entry.deductionAmount || "0", currency)} deduct</span>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(net, currency)}</p>
                                      {period.status === "draft" && (
                                        <>
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => { setEntryForm({ ...entry }); setEditingEntry(entry); }} data-testid={`btn-edit-entry-${entry.id}`}>
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteEntryMutation.mutate(entry.id)} disabled={deleteEntryMutation.isPending} data-testid={`btn-delete-entry-${entry.id}`}>
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {}
                            {entrySummary && (
                              <div className="px-3.5 py-2 bg-muted/15 border-t border-border/15 flex flex-wrap gap-x-4 gap-y-0.5">
                                <span className="text-[9px] text-muted-foreground/50 font-bold uppercase tracking-wider w-full mb-0.5">Breakdown</span>
                                {entrySummary.base > 0 && <span className="text-[10px] text-muted-foreground">Base <strong className="text-foreground">{formatCurrency(entrySummary.base, currency)}</strong></span>}
                                {entrySummary.commission > 0 && <span className="text-[10px] text-violet-500">Comm <strong>{formatCurrency(entrySummary.commission, currency)}</strong></span>}
                                {entrySummary.bonus > 0 && <span className="text-[10px] text-sky-500">Bonus <strong>{formatCurrency(entrySummary.bonus, currency)}</strong></span>}
                                {entrySummary.tips > 0 && <span className="text-[10px] text-amber-500">Tips <strong>{formatCurrency(entrySummary.tips, currency)}</strong></span>}
                                {entrySummary.deductions > 0 && <span className="text-[10px] text-rose-500">Deduct <strong>-{formatCurrency(entrySummary.deductions, currency)}</strong></span>}
                                {entrySummary.advance > 0 && <span className="text-[10px] text-rose-400">Advance <strong>-{formatCurrency(entrySummary.advance, currency)}</strong></span>}
                              </div>
                            )}
                          </>
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

        {}
        <TabsContent value="analytics" className="space-y-3 mt-3">
          {!analytics || analytics.periods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-12 text-center space-y-2">
              <BarChart2 className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No payroll history yet.</p>
              <p className="text-[10px] text-muted-foreground/60">Create and pay periods to see analytics here.</p>
            </div>
          ) : (
            <>
              {}
              <div className="rounded-xl bg-card border border-border/40 p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Payout History</p>
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    Total {formatCurrency(analytics.periods.reduce((s, p) => s + p.totalAmount, 0), currency)}
                  </p>
                </div>
                <div className="flex items-end gap-1 h-20">
                  {(() => {
                    const maxAmt = Math.max(...analytics.periods.map(p => p.totalAmount), 1);
                    return analytics.periods.map(p => {
                      const pct = Math.max((p.totalAmount / maxAmt) * 100, 3);
                      const color = p.status === "paid" ? "bg-emerald-500 dark:bg-emerald-600" : p.status === "finalized" ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600";
                      return (
                        <div key={p.id} className="flex-1 flex flex-col items-center gap-0.5 group cursor-pointer" title={`${p.name}: ${formatCurrency(p.totalAmount, currency)}`}>
                          <div className="w-full flex flex-col justify-end" style={{ height: "64px" }}>
                            <div className={`w-full rounded-t-sm ${color} transition-all duration-200 group-hover:opacity-70`} style={{ height: `${pct}%`, minHeight: "3px" }} />
                          </div>
                          <span className="text-[7px] text-muted-foreground/50 truncate w-full text-center leading-tight">{fmtShort(p.startDate)}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/20">
                  {[{ color: "bg-emerald-500", label: "Paid" }, { color: "bg-amber-400", label: "Finalized" }, { color: "bg-slate-300 dark:bg-slate-600", label: "Draft" }].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-sm ${l.color} shrink-0`} />
                      <span className="text-[9px] text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {}
              {analytics.periods.length >= 2 && (() => {
                const last = analytics.periods[analytics.periods.length - 1];
                const prev = analytics.periods[analytics.periods.length - 2];
                const delta = last.totalAmount - prev.totalAmount;
                const pct = prev.totalAmount > 0 ? ((delta / prev.totalAmount) * 100).toFixed(1) : null;
                return (
                  <div className="rounded-xl bg-card border border-border/40 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-3">Period-over-Period</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-center min-w-0">
                        <p className="text-[9px] text-muted-foreground mb-0.5 truncate">{prev.name}</p>
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(prev.totalAmount, currency)}</p>
                        <p className="text-[9px] text-muted-foreground/50">{fmtShort(prev.startDate)}</p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className={`flex items-center gap-0.5 text-[11px] font-black ${delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {pct ? `${delta >= 0 ? "+" : ""}${pct}%` : "—"}
                        </div>
                        <span className={`text-[9px] font-semibold ${delta >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                          {delta >= 0 ? "+" : ""}{formatCurrency(Math.abs(delta), currency)}
                        </span>
                      </div>
                      <div className="flex-1 text-center min-w-0">
                        <p className="text-[9px] text-muted-foreground mb-0.5 truncate">{last.name}</p>
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(last.totalAmount, currency)}</p>
                        <p className="text-[9px] text-muted-foreground/50">{fmtShort(last.startDate)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {}
              {analytics.wageTypeBreakdown.length > 0 && (
                <div className="rounded-xl bg-card border border-border/40 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-3">Wage Type Breakdown</p>
                  <div className="space-y-2.5">
                    {(() => {
                      const total = analytics.wageTypeBreakdown.reduce((s, w) => s + w.total, 0) || 1;
                      const colors: Record<string, string> = { hourly: "bg-sky-500", monthly: "bg-violet-500", commission: "bg-amber-500" };
                      return analytics.wageTypeBreakdown.map(w => {
                        const pct = (w.total / total) * 100;
                        return (
                          <div key={w.type}>
                            <div className="flex justify-between mb-1">
                              <span className="text-[10px] font-semibold capitalize">{w.type}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(w.total, currency)} · {pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${colors[w.type] || "bg-primary"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {}
              {analytics.topEarners.length > 0 && (
                <div className="rounded-xl bg-card border border-border/40 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border/20 flex items-center gap-1.5">
                    <Trophy className="h-3 w-3 text-amber-500" />
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Top Earners (All Time)</p>
                  </div>
                  <div className="divide-y divide-border/15">
                    {analytics.topEarners.map((e, i) => {
                      const maxTotal = analytics.topEarners[0]?.total || 1;
                      const medalColor = ["text-amber-500", "text-slate-400", "text-orange-400"][i] ?? "text-muted-foreground/30";
                      return (
                        <div key={`${e.name}-${i}`} className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className={`text-xs font-black w-5 text-center tabular-nums shrink-0 ${medalColor}`}>{i + 1}</span>
                            <div className={`h-7 w-7 rounded-full ${avatarColor(e.name)} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                              {(e.name || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{e.name}</p>
                              <p className="text-[9px] text-muted-foreground">{e.periods} period{e.periods !== 1 ? "s" : ""}</p>
                            </div>
                            <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(e.total, currency)}</p>
                          </div>
                          <div className="ml-[52px] h-1 bg-muted/40 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-400" : "bg-primary/50"}`} style={{ width: `${(e.total / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

      </Tabs>

      {}
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
                    {s.staffGroup && <p className="text-[9px] text-muted-foreground/60">{s.staffGroup}</p>}
                  </div>
                </div>
                <div className="space-y-0.5 text-xs mb-4">
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
                <div className="flex gap-2 mb-5">
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={() => window.print()} data-testid="btn-print-paystub">
                    <Printer className="h-3 w-3" />{t("payroll.paystub.printStub")}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1.5" onClick={exportComputeCSV} data-testid="btn-export-paystub">
                    <FileDown className="h-3 w-3" />{t("payroll.export.exportCSV")}
                  </Button>
                </div>

                {}
                {staffHistory.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-2">Pay History</p>
                    <div className="space-y-1.5">
                      {staffHistory.map(h => (
                        <div key={h.entryId} className="rounded-lg bg-muted/30 px-2.5 py-2 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold truncate">{h.periodName}</p>
                            <p className="text-[9px] text-muted-foreground">{fmtShort(h.startDate)} → {fmtShort(h.endDate)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(h.netAmount, currency)}</p>
                            <StatusDot status={h.status} t={t} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {}
      <Dialog open={!!editingWage} onOpenChange={o => !o && setEditingWage(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">{t("payroll.wage.settings")}</DialogTitle></DialogHeader>
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
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Department / Category</label>
              <Input value={wageForm.staffGroup} onChange={e => setWageForm({ ...wageForm, staffGroup: e.target.value })} placeholder="e.g. Kitchen, Floor, Management" className="h-8 text-xs" data-testid="input-staff-group" />
              <p className="text-[9px] text-muted-foreground mt-1">Groups employees together on the payroll list.</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingWage(null)} className="flex-1 h-8 text-xs" data-testid="btn-cancel-wage">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => updateWageMutation.mutate({ id: editingWage!.id, data: wageForm })} disabled={updateWageMutation.isPending} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-wage">
                <Save className="h-3 w-3" />{updateWageMutation.isPending ? t("payroll.wage.saving") : t("payroll.wage.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={!!editingEntry} onOpenChange={o => !o && setEditingEntry(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">{t("payroll.entries.editEntry")}</DialogTitle></DialogHeader>
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
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2.5 flex justify-between items-center mt-1">
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">{t("payroll.paystub.netPay")}</span>
            <span className="text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(computeEntryNet(entryForm as any), currency)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingEntry(null)} className="flex-1 h-8 text-xs" data-testid="btn-cancel-entry">{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => {
              const net = computeEntryNet(entryForm as any);
              updateEntryMutation.mutate({ id: editingEntry!.id, data: { ...entryForm, netAmount: net.toFixed(2) } });
            }} disabled={updateEntryMutation.isPending} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-entry">
              <Save className="h-3 w-3" />{updateEntryMutation.isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={addEntryOpen} onOpenChange={o => !o && setAddEntryOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-primary" />Add Employee to Period
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Employee</label>
              <Select value={addEntryForm.employeeUserId} onValueChange={v => {
                const s = staff.find(s => s.id === v);
                if (!s) { setAddEntryForm({ ...addEntryForm, employeeUserId: v }); return; }
                const wt = s.wageType ?? "none";
                const wageRate = parseFloat(s.wageRate || "0") || 0;
                setAddEntryForm({ ...addEntryForm, employeeUserId: v, baseAmount: wt === "monthly" ? String(wageRate) : "0" });
              }}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-add-entry-employee">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {staffNotInPeriod.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">All employees already in this period</div>
                  ) : (
                    staffNotInPeriod.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name || s.email || s.id}
                        {s.wageType && s.wageType !== "none" && <span className="text-muted-foreground ml-1 text-[10px]">· {s.wageType}</span>}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "hoursWorked", label: "Hours" },
                { key: "baseAmount", label: `Base (${currency})` },
                { key: "commissionAmount", label: `Commission (${currency})` },
                { key: "tipAmount", label: `Tips (${currency})` },
                { key: "bonusAmount", label: `Bonus (${currency})` },
                { key: "deductionAmount", label: `Deductions (${currency})` },
                { key: "advanceAmount", label: `Advance (${currency})` },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
                  <Input type="number" step="0.01" min="0" value={(addEntryForm as any)[key]} onChange={e => setAddEntryForm({ ...addEntryForm, [key]: e.target.value })} className="h-8 text-xs" data-testid={`input-add-entry-${key}`} />
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3 py-2 flex justify-between items-center">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Net Pay</span>
              <span className="text-sm font-black tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(computeEntryNet(addEntryForm), currency)}</span>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Notes</label>
              <Textarea value={addEntryForm.notes} onChange={e => setAddEntryForm({ ...addEntryForm, notes: e.target.value })} rows={2} className="text-xs resize-none" placeholder="Optional..." data-testid="input-add-entry-notes" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddEntryOpen(false)} className="flex-1 h-8 text-xs">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => {
                if (!addEntryForm.employeeUserId || !expandedPeriod) return;
                const s = staff.find(s => s.id === addEntryForm.employeeUserId);
                const net = computeEntryNet(addEntryForm);
                addEntryMutation.mutate({
                  periodId: expandedPeriod,
                  data: {
                    ...addEntryForm,
                    employeeName: s?.name || s?.email || addEntryForm.employeeUserId,
                    wageType: s?.wageType || "none",
                    wageRate: s?.wageRate || "0",
                    netAmount: net.toFixed(2),
                  },
                });
              }} disabled={addEntryMutation.isPending || !addEntryForm.employeeUserId} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-add-entry">
                <Save className="h-3 w-3" />{addEntryMutation.isPending ? "Adding..." : "Add Employee"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={quickPayOpen} onOpenChange={o => { if (!o) { setQuickPayOpen(false); setQuickPayDuplicate(null); setQuickPayForce(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />Pay Day
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">

            {}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Pay Period</label>
              <div className="flex flex-wrap gap-1.5">
                {(["thisWeek","lastWeek","thisMonth","lastMonth"] as const).map(p => (
                  <button key={p} onClick={() => { setQuickPayPreset(p); setQuickPayDuplicate(null); setQuickPayForce(false); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${quickPayPreset === p ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}
                    data-testid={`btn-qp-preset-${p}`}>
                    {quickPayDates(p).label}
                  </button>
                ))}
              </div>
            </div>

            {}
            {(branches as any[]).length > 1 && (
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Branch (optional)</label>
                <Select value={quickPayBranchId === null ? "all" : String(quickPayBranchId)} onValueChange={v => setQuickPayBranchId(v === "all" ? null : Number(v))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-qp-branch"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {(branches as any[]).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">How are you paying?</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PAY_METHODS.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} onClick={() => setQuickPayMethod(m.id)}
                      className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl text-[10px] font-semibold border transition-all ${quickPayMethod === m.id ? "bg-primary/10 border-primary text-primary" : "border-border/40 text-muted-foreground hover:border-border"}`}
                      data-testid={`btn-qp-method-${m.id}`}>
                      <Icon className="h-4 w-4" />
                      {m.label.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Reference / Note (optional)</label>
              <Input value={quickPayReference} onChange={e => setQuickPayReference(e.target.value)}
                placeholder={quickPayMethod === "card" ? "e.g. Last 4 digits or receipt no." : quickPayMethod === "ewallet" ? "e.g. Ref #12345" : "Optional note..."}
                className="h-8 text-xs" data-testid="input-qp-reference" />
            </div>

            {}
            {(() => {
              const { from: qFrom, to: qTo } = quickPayDates(quickPayPreset);
              const days = Math.max(1, (new Date(qTo).getTime() - new Date(qFrom).getTime()) / 86400000 + 1);
              const workDays = Math.min(days, Math.round(days * 5 / 7));
              const eligible = staff.filter(s => s.wageType && s.wageType !== "none" && (!quickPayBranchId || s.branchId === quickPayBranchId));
              const total = eligible.reduce((sum, s) => {
                const rate = parseFloat(s.wageRate || "0") || 0;
                if (s.wageType === "monthly") return sum + rate;
                if (s.wageType === "hourly") return sum + rate * workDays * 8;
                return sum;
              }, 0);
              return (
                <div className="rounded-xl bg-muted/40 border border-border/30 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-border/20 flex justify-between items-center bg-muted/20">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Payout Preview</span>
                    <span className="text-[9px] text-muted-foreground">{fmtShort(qFrom)} → {fmtShort(qTo)}</span>
                  </div>
                  {eligible.length === 0 ? (
                    <p className="px-3 py-3 text-center text-[10px] text-muted-foreground">No staff with wages configured</p>
                  ) : (
                    <div className="divide-y divide-border/15 max-h-32 overflow-y-auto">
                      {eligible.map(s => {
                        const rate = parseFloat(s.wageRate || "0") || 0;
                        let est = 0; let wageLabel = "";
                        if (s.wageType === "monthly") { est = rate; wageLabel = "Monthly"; }
                        else if (s.wageType === "hourly") { est = rate * workDays * 8; wageLabel = "Hourly ~"; }
                        else if (s.wageType === "commission") { wageLabel = `${parseFloat(s.commissionPercent || "0")}% commission`; }
                        return (
                          <div key={s.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Av name={s.name || s.email || "?"} id={s.id} sm />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold truncate">{s.name || s.email}</p>
                                <p className="text-[9px] text-muted-foreground">{wageLabel}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                              {s.wageType === "commission" ? "—" : `~${formatCurrency(est, currency)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {total > 0 && (
                    <div className="px-3 py-1.5 border-t border-border/20 flex justify-between items-center">
                      <span className="text-[10px] font-semibold">{eligible.length} employee{eligible.length !== 1 ? "s" : ""}</span>
                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">~{formatCurrency(total, currency)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {}
            {quickPayDuplicate && !quickPayForce && (
              <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-2.5 py-2">
                <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[10px] text-amber-700 dark:text-amber-400">
                  <span className="font-semibold">"{quickPayDuplicate.name}"</span> already covers {fmtShort(quickPayDuplicate.startDate)} → {fmtShort(quickPayDuplicate.endDate)}.{" "}
                  <button onClick={() => setQuickPayForce(true)} className="underline font-semibold" data-testid="btn-qp-force">Proceed anyway</button>
                </div>
              </div>
            )}

            {}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Processed by <span className="font-semibold text-foreground">{user?.name || user?.email}</span> · {new Date().toLocaleDateString()}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setQuickPayOpen(false); setQuickPayDuplicate(null); setQuickPayForce(false); }} className="flex-1 h-8 text-xs">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => {
                const { from: qFrom, to: qTo, label } = quickPayDates(quickPayPreset);
                quickPayMutation.mutate({ name: `${label} Pay Run`, from: qFrom, to: qTo, branchId: quickPayBranchId, paymentMethod: quickPayMethod, paymentReference: quickPayReference || undefined, force: quickPayForce });
              }} disabled={quickPayMutation.isPending || (!!quickPayDuplicate && !quickPayForce)}
                className="flex-1 h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="btn-confirm-quick-pay">
                <Zap className="h-3 w-3" />{quickPayMutation.isPending ? "Processing..." : "Confirm Pay Day"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={!!markPaidDialog} onOpenChange={o => !o && setMarkPaidDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-emerald-500" />Mark as Paid
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Confirming payment for <span className="font-semibold text-foreground">{markPaidDialog?.name}</span>
              {markPaidDialog?.totalAmount && parseFloat(markPaidDialog.totalAmount) > 0 && (
                <> — <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(markPaidDialog.totalAmount, currency)}</span></>
              )}.
            </p>

            {}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">How are you paying?</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PAY_METHODS.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} onClick={() => setMarkPaidMethod(m.id)}
                      className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl text-[10px] font-semibold border transition-all ${markPaidMethod === m.id ? "bg-primary/10 border-primary text-primary" : "border-border/40 text-muted-foreground hover:border-border"}`}
                      data-testid={`btn-mp-method-${m.id}`}>
                      <Icon className="h-4 w-4" />
                      {m.label.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Reference / Note (optional)</label>
              <Input value={markPaidRef} onChange={e => setMarkPaidRef(e.target.value)}
                placeholder={markPaidMethod === "card" ? "e.g. Last 4 digits or receipt no." : markPaidMethod === "ewallet" ? "e.g. Ref #12345" : "Optional note..."}
                className="h-8 text-xs" data-testid="input-mp-reference" />
            </div>

            {}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Processed by <span className="font-semibold text-foreground">{user?.name || user?.email}</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMarkPaidDialog(null)} className="flex-1 h-8 text-xs">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => {
                if (!markPaidDialog) return;
                markPaidMutation.mutate({ id: markPaidDialog.periodId, paymentMethod: markPaidMethod, paymentReference: markPaidRef || undefined });
              }} disabled={markPaidMutation.isPending}
                className="flex-1 h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="btn-confirm-mark-paid">
                <Banknote className="h-3 w-3" />{markPaidMutation.isPending ? "Saving..." : "Confirm Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <AlertDialog open={!!confirmAction} onOpenChange={o => !o && setConfirmAction(null)}>
        <AlertDialogContent className="max-w-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {confirmAction?.type === "finalize" ? t("payroll.periods.finalize") : t("payroll.periods.deletePeriod")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {confirmAction?.type === "finalize" ? t("payroll.periods.finalizeConfirm", { name: confirmAction?.name }) : t("payroll.periods.deleteConfirm", { name: confirmAction?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-8 text-xs">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className={`h-8 text-xs ${confirmAction?.type === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`} onClick={() => {
              if (!confirmAction) return;
              if (confirmAction.type === "finalize") finalizeMutation.mutate(confirmAction.periodId);
              else if (confirmAction.type === "delete") deletePeriodMutation.mutate(confirmAction.periodId);
            }}>
              {confirmAction?.type === "delete" ? t("payroll.periods.deletePeriod") : t("payroll.periods.finalize")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {}
      <Dialog open={createPeriodOpen} onOpenChange={o => !o && setCreatePeriodOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">{t("payroll.periods.newPeriod")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.periods.name")}</label>
              <Input value={periodForm.name} onChange={e => setPeriodForm({ ...periodForm, name: e.target.value })} placeholder={t("payroll.periods.namePlaceholder")} className="h-8 text-xs" data-testid="input-period-name" />
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
              <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">{t("payroll.entries.notes")}</label>
              <Textarea value={periodForm.notes} onChange={e => setPeriodForm({ ...periodForm, notes: e.target.value })} rows={2} className="text-xs resize-none" placeholder="Optional period notes..." data-testid="input-period-notes" />
            </div>
            <div className="rounded-lg bg-muted/30 border border-border/30 p-2.5">
              <p className="text-[10px] text-muted-foreground">{t("payroll.periods.draftNote")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreatePeriodOpen(false)} className="flex-1 h-8 text-xs">{t("common.cancel")}</Button>
              <Button size="sm" onClick={() => createPeriodMutation.mutate(periodForm)} disabled={createPeriodMutation.isPending || !periodForm.name} className="flex-1 h-8 text-xs gap-1" data-testid="btn-save-period">
                <Save className="h-3 w-3" />{createPeriodMutation.isPending ? t("common.loading") : t("payroll.periods.createPeriod")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
