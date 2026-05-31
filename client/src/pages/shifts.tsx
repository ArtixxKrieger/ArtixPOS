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
import {
  Clock, TrendingUp, Play, Square, Receipt, AlertCircle,
  ChevronLeft, ChevronRight, SlidersHorizontal, Printer,
  FileText, CreditCard, Banknote, Smartphone, Hash,
  ShoppingBag, Tag, Users, BarChart3, X,
  ArrowDownCircle, ArrowUpCircle, Coins, AlertTriangle,
  Plus, Minus, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Denomination config ──────────────────────────────────────────────────────
const BILLS = [1000, 500, 200, 100, 50, 20];
const COINS = [10, 5, 1];
const ALL_DENOMS = [...BILLS, ...COINS];
type DenomMap = Record<number, number>;

function emptyDenoms(): DenomMap {
  return Object.fromEntries(ALL_DENOMS.map(d => [d, 0]));
}
function denomTotal(d: DenomMap): number {
  return ALL_DENOMS.reduce((s, v) => s + (d[v] || 0) * v, 0);
}
function parseDenoms(json: string | null | undefined): DenomMap {
  try { return json ? { ...emptyDenoms(), ...JSON.parse(json) } : emptyDenoms(); } catch { return emptyDenoms(); }
}
function parseAdjs(json: string | null | undefined): CashAdj[] {
  try { return json ? JSON.parse(json) : []; } catch { return []; }
}

interface CashAdj { type: "in" | "out"; amount: string; reason: string; timestamp: string; }

// ─── Denomination Counter component ──────────────────────────────────────────
function DenomCounter({ value, onChange, currency }: { value: DenomMap; onChange: (v: DenomMap) => void; currency: string }) {
  const total = denomTotal(value);
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Bills</p>
      <div className="grid grid-cols-3 gap-2">
        {BILLS.map(bill => (
          <DenomRow key={bill} denom={bill} count={value[bill] || 0} currency={currency}
            onInc={() => onChange({ ...value, [bill]: (value[bill] || 0) + 1 })}
            onDec={() => onChange({ ...value, [bill]: Math.max(0, (value[bill] || 0) - 1) })}
          />
        ))}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Coins</p>
      <div className="grid grid-cols-3 gap-2">
        {COINS.map(coin => (
          <DenomRow key={coin} denom={coin} count={value[coin] || 0} currency={currency}
            onInc={() => onChange({ ...value, [coin]: (value[coin] || 0) + 1 })}
            onDec={() => onChange({ ...value, [coin]: Math.max(0, (value[coin] || 0) - 1) })}
          />
        ))}
      </div>
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
        <p className="text-[10px] text-muted-foreground mb-0.5">Total Cash</p>
        <p className="text-2xl font-black text-primary tabular-nums">{formatCurrency(total, currency)}</p>
      </div>
    </div>
  );
}

function DenomRow({ denom, count, currency, onInc, onDec }: { denom: number; count: number; currency: string; onInc: () => void; onDec: () => void }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-2 flex flex-col items-center gap-1">
      <p className="text-[10px] font-bold text-muted-foreground">{currency}{denom}</p>
      <div className="flex items-center gap-1">
        <button onClick={onDec} className="h-6 w-6 rounded-lg bg-background border border-border hover:bg-muted flex items-center justify-center text-sm font-bold transition-colors">
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-7 text-center text-sm font-bold tabular-nums">{count}</span>
        <button onClick={onInc} className="h-6 w-6 rounded-lg bg-background border border-border hover:bg-muted flex items-center justify-center text-sm font-bold transition-colors">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground tabular-nums">{count > 0 ? formatCurrency(count * denom, currency) : "—"}</p>
    </div>
  );
}

// ─── Denomination breakdown display (read-only) ───────────────────────────────
function DenomBreakdown({ json, currency }: { json: string | null | undefined; currency: string }) {
  const d = parseDenoms(json);
  const entries = ALL_DENOMS.filter(v => (d[v] || 0) > 0);
  if (entries.length === 0) return <p className="text-xs text-muted-foreground italic">No denomination data</p>;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {entries.map(v => (
        <div key={v} className="bg-secondary/40 rounded-lg px-2 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{currency}{v} ×{d[v]}</span>
          <span className="text-[10px] font-bold tabular-nums">{formatCurrency(d[v] * v, currency)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function useShifts() { return useQuery<Shift[]>({ queryKey: ["/api/shifts"] }); }
function useOpenShift() { return useQuery<Shift | null>({ queryKey: ["/api/shifts/open"], refetchInterval: 60000 }); }

interface ZReportData {
  shift: Shift;
  orFrom: string | null;
  orTo: string | null;
  totalTransactions: number;
  grossSales: number;
  netSales: number;
  totalDiscount: number;
  totalLoyaltyDiscount: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  discountBreakdown: Record<string, { count: number; total: number; discount: number }>;
  vatableSalesTotal: number;
  vatExemptTotal: number;
  zeroRatedTotal: number;
  vatAmountTotal: number;
  topItems: { name: string; qty: number; total: number }[];
}
function useZReport(shiftId: number | null) {
  return useQuery<ZReportData>({
    queryKey: ["/api/shifts", shiftId, "z-report"],
    enabled: !!shiftId,
  });
}

function ShiftDuration({ openedAt, closedAt }: { openedAt: string; closedAt?: string | null }) {
  const end = closedAt ? new Date(closedAt) : new Date();
  const d = intervalToDuration({ start: new Date(openedAt), end });
  const parts: string[] = [];
  if (d.hours) parts.push(`${d.hours}h`);
  if (d.minutes) parts.push(`${d.minutes}m`);
  if (!parts.length) parts.push("< 1m");
  return <span>{parts.join(" ")}</span>;
}

function AmountCell({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-2.5 flex flex-col items-center min-w-0">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 whitespace-nowrap">{label}</p>
      <p className={cn("font-bold tabular-nums text-center w-full min-w-0", color)}
        style={{ fontSize: "clamp(10px, 2.5vw, 13px)", wordBreak: "break-all" }}>
        {value}
      </p>
    </div>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

function PaymentIcon({ method }: { method: string }) {
  const m = method.toLowerCase();
  if (m === "card" || m === "credit" || m === "debit") return <CreditCard className="h-3.5 w-3.5" />;
  if (m === "ewallet" || m === "e-wallet" || m === "gcash" || m === "maya" || m === "paymaya" || m === "online") return <Smartphone className="h-3.5 w-3.5" />;
  return <Banknote className="h-3.5 w-3.5" />;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", ewallet: "E-Wallet",
  gcash: "E-Wallet", maya: "E-Wallet", paymaya: "E-Wallet",
  credit: "Credit Card", debit: "Debit Card", online: "Online",
};
const DISCOUNT_LABEL: Record<string, string> = {
  regular: "Regular", sc: "Senior Citizen (SC)", pwd: "Person w/ Disability (PWD)",
};
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

// ─── Variance badge ───────────────────────────────────────────────────────────
function VarianceBadge({ variance, currency }: { variance: number; currency: string }) {
  if (Math.abs(variance) < 0.01) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Balanced</span>
      </div>
    );
  }
  const isOver = variance > 0;
  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl border",
      isOver ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
      <AlertTriangle className={cn("h-3.5 w-3.5", isOver ? "text-emerald-500" : "text-rose-500")} />
      <span className={cn("text-xs font-bold", isOver ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
        {isOver ? "Over" : "Short"} by {formatCurrency(Math.abs(variance), currency)}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Shifts() {
  const { data: shifts = [], isLoading } = useShifts();
  const { data: openShift } = useOpenShift();
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";
  const storeName = (settings as any)?.storeName || "Store";
  const tin = (settings as any)?.tin || "";
  const ptuNumber = (settings as any)?.ptuNumber || "";
  const accreditationNumber = (settings as any)?.accreditationNumber || "";
  const accreditationDate = (settings as any)?.accreditationDate || "";
  const machineSerialNumber = (settings as any)?.machineSerialNumber || "";
  const taxRate = parseNumeric((settings as any)?.taxRate || 0);

  // ── Open shift dialog state
  const [showOpen, setShowOpen] = useState(false);
  const [openDenoms, setOpenDenoms] = useState<DenomMap>(emptyDenoms());
  const [useOpenDenoms, setUseOpenDenoms] = useState(true);
  const [openBalanceManual, setOpenBalanceManual] = useState("");
  const [openNotes, setOpenNotes] = useState("");

  // ── Close shift dialog state
  const [showClose, setShowClose] = useState(false);
  const [closeDenoms, setCloseDenoms] = useState<DenomMap>(emptyDenoms());
  const [useCloseDenoms, setUseCloseDenoms] = useState(true);
  const [closeBalanceManual, setCloseBalanceManual] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // ── Cash adjustment dialog state
  const [showAdj, setShowAdj] = useState(false);
  const [adjType, setAdjType] = useState<"in" | "out">("in");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  // ── History + Z-report state
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [zReportShiftId, setZReportShiftId] = useState<number | null>(null);

  const { data: zReport, isLoading: zReportLoading } = useZReport(zReportShiftId);

  // ── Computed values for active shift
  const openingNum = openShift ? parseNumeric(openShift.openingBalance) : 0;
  const totalSalesNum = openShift ? parseNumeric(openShift.totalSales ?? "0") : 0;
  const totalExpensesNum = openShift ? parseNumeric(openShift.totalExpenses ?? "0") : 0;
  const cashInNum = openShift ? parseNumeric((openShift as any).cashIn ?? "0") : 0;
  const cashOutNum = openShift ? parseNumeric((openShift as any).cashOut ?? "0") : 0;
  const expectedClosing = openingNum + totalSalesNum + cashInNum - cashOutNum - totalExpensesNum;
  const cashAdjs: CashAdj[] = openShift ? parseAdjs((openShift as any).cashAdjustments) : [];

  // ── Derived closing amounts
  const openingBalance = useOpenDenoms ? String(denomTotal(openDenoms)) : openBalanceManual;
  const closingBalance = useCloseDenoms ? String(denomTotal(closeDenoms)) : closeBalanceManual;
  const closingNum = parseNumeric(closingBalance || "0");
  const variance = closingNum - expectedClosing;

  function invalidateShifts() {
    queryClient.invalidateQueries({ queryKey: ["/api/shifts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/shifts/open"] });
  }

  const openMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/shifts/open", {
      openingBalance,
      notes: openNotes || undefined,
      denominationOpen: useOpenDenoms ? JSON.stringify(openDenoms) : undefined,
    }),
    onSuccess: () => {
      invalidateShifts();
      toast({ title: "Shift opened — have a great day!" });
      setShowOpen(false);
      setOpenDenoms(emptyDenoms());
      setOpenBalanceManual("");
      setOpenNotes("");
    },
    onError: async (err: any) => {
      const msg = await err?.response?.json?.().then((d: any) => d.message).catch(() => "Error opening shift");
      toast({ title: msg || "Error opening shift", variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/shifts/${openShift?.id}/close`, {
      closingBalance,
      notes: closeNotes || undefined,
      denominationClose: useCloseDenoms ? JSON.stringify(closeDenoms) : undefined,
      variance: variance.toFixed(2),
    }),
    onSuccess: () => {
      invalidateShifts();
      toast({ title: "Shift closed successfully" });
      setShowClose(false);
      setCloseDenoms(emptyDenoms());
      setCloseBalanceManual("");
      setCloseNotes("");
    },
    onError: () => toast({ title: "Error closing shift", variant: "destructive" }),
  });

  const adjMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/shifts/${openShift?.id}/cash-adjustment`, {
      type: adjType,
      amount: adjAmount,
      reason: adjReason,
    }),
    onSuccess: () => {
      invalidateShifts();
      toast({ title: adjType === "in" ? "Cash added to drawer" : "Cash removed from drawer" });
      setShowAdj(false);
      setAdjAmount("");
      setAdjReason("");
    },
    onError: () => toast({ title: "Error recording adjustment", variant: "destructive" }),
  });

  // ── Shift history
  const closedShifts = useMemo(() => shifts.filter(s => s.status === "closed"), [shifts]);
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    closedShifts.forEach(s => { if (s.openedAt) set.add(format(new Date(s.openedAt), "yyyy-MM")); });
    return Array.from(set).sort().reverse();
  }, [closedShifts]);
  const filteredShifts = useMemo(() => {
    if (selectedMonth === "all") return closedShifts;
    return closedShifts.filter(s => s.openedAt && format(new Date(s.openedAt), "yyyy-MM") === selectedMonth);
  }, [closedShifts, selectedMonth]);
  const totalPages = Math.max(1, Math.ceil(filteredShifts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedShifts = filteredShifts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const mostRecentClosed = closedShifts[0];

  function handleMonthChange(val: string) { setSelectedMonth(val); setPage(1); }
  function handlePageSizeChange(val: number) { setPageSize(val); setPage(1); }

  // ── Z-Report print
  function printZReportFromData(d: ZReportData) {
    const sh = d.shift;
    const dateStr = format(new Date(sh.openedAt!), "MMMM d, yyyy");
    const openTime = format(new Date(sh.openedAt!), "hh:mm a");
    const closeTime = sh.closedAt ? format(new Date(sh.closedAt), "hh:mm a") : "--";
    const pmRows = Object.entries(d.paymentBreakdown)
      .map(([pm, v]) => `<div class="row"><span>${PAYMENT_LABEL[pm] || pm.toUpperCase()} (${v.count})</span><span>${currency}${v.total.toFixed(2)}</span></div>`)
      .join("");
    const discountRows = Object.entries(d.discountBreakdown)
      .filter(([, v]) => v.count > 0)
      .map(([dt, v]) => `<div class="row"><span>${DISCOUNT_LABEL[dt] || dt} (${v.count})</span><span>${currency}${v.discount.toFixed(2)}</span></div>`)
      .join("");
    const topItemRows = d.topItems.slice(0, 5)
      .map((it, i) => `<div class="row"><span>${i + 1}. ${it.name}</span><span>x${it.qty}</span></div>`)
      .join("");
    const shAny = sh as any;
    const adjList: CashAdj[] = parseAdjs(shAny.cashAdjustments);
    const adjRows = adjList.map(a =>
      `<div class="row indent"><span>${a.type === "in" ? "Cash In" : "Cash Out"}: ${a.reason || "(no reason)"}</span><span>${currency}${parseFloat(a.amount).toFixed(2)}</span></div>`
    ).join("");
    const shVariance = shAny.variance ? parseFloat(shAny.variance) : null;
    const openDenomJson = shAny.denominationOpen;
    const closeDenomJson = shAny.denominationClose;
    const denomRows = (json: string | null, label: string) => {
      if (!json) return "";
      const dm = parseDenoms(json);
      const lines = ALL_DENOMS.filter(v => (dm[v] || 0) > 0)
        .map(v => `<div class="row indent"><span>${currency}${v} × ${dm[v]}</span><span>${currency}${(dm[v] * v).toFixed(2)}</span></div>`)
        .join("");
      if (!lines) return "";
      return `<div class="section">— ${label} —</div>${lines}`;
    };

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Z-Report — ${dateStr}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 11px; width: 300px; margin: 0 auto; padding: 20px 16px; color: #000; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .double { border-top: 3px double #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; padding: 0 2px; }
      .row.indent { padding-left: 10px; color: #444; }
      .title { font-size: 15px; font-weight: bold; margin: 4px 0 2px; }
      .small { font-size: 9px; }
      .section { margin: 4px 0; font-size: 9px; font-weight: bold; letter-spacing: 0.08em; text-align: center; }
      .highlight { background: #f5f5f5; padding: 3px 4px; margin: 2px 0; border-radius: 2px; }
      @media print { body { padding: 8px; } }
    </style></head><body>
    <div class="center">
      <div class="title">${storeName}</div>
      ${tin ? `<div class="small">TIN: ${tin}</div>` : ""}
      ${ptuNumber ? `<div class="small">PTU No.: ${ptuNumber}</div>` : ""}
      ${accreditationNumber ? `<div class="small">Accreditation No.: ${accreditationNumber}</div>` : ""}
      ${accreditationDate ? `<div class="small">Accreditation Date: ${accreditationDate}</div>` : ""}
      ${machineSerialNumber ? `<div class="small">Machine S/N: ${machineSerialNumber}</div>` : ""}
    </div>
    <div class="double"></div>
    <div class="center bold" style="font-size:13px">Z - R E P O R T</div>
    <div class="center small">${dateStr} &nbsp;|&nbsp; ${openTime} &mdash; ${closeTime}</div>
    <div class="line"></div>
    ${d.orFrom ? `<div class="row highlight bold"><span>OR Number Range</span><span>${d.orFrom} &mdash; ${d.orTo}</span></div>` : ""}
    <div class="row"><span>Total Transactions</span><span>${d.totalTransactions}</span></div>
    <div class="line"></div>
    <div class="section">— SALES SUMMARY —</div>
    <div class="row bold"><span>Gross Sales</span><span>${currency}${d.grossSales.toFixed(2)}</span></div>
    <div class="row"><span>Total Discount</span><span>-${currency}${d.totalDiscount.toFixed(2)}</span></div>
    <div class="row"><span>Total VAT</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row bold"><span>Net Sales</span><span>${currency}${d.netSales.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="section">— PAYMENT BREAKDOWN —</div>
    ${pmRows || '<div class="center small">No transactions</div>'}
    <div class="line"></div>
    <div class="section">— DISCOUNT BREAKDOWN —</div>
    ${discountRows || '<div class="center small">No discounts</div>'}
    <div class="line"></div>
    <div class="section">— BIR VAT BREAKDOWN —</div>
    <div class="row"><span>VATable Sales</span><span>${currency}${d.vatableSalesTotal.toFixed(2)}</span></div>
    <div class="row"><span>VAT Amount (${taxRate}%)</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row"><span>VAT-Exempt Sales</span><span>${currency}${d.vatExemptTotal.toFixed(2)}</span></div>
    <div class="row"><span>Zero-Rated Sales</span><span>${currency}${d.zeroRatedTotal.toFixed(2)}</span></div>
    ${topItemRows ? `<div class="line"></div><div class="section">— TOP ITEMS —</div>${topItemRows}` : ""}
    ${adjList.length > 0 ? `<div class="line"></div><div class="section">— CASH ADJUSTMENTS —</div>${adjRows}` : ""}
    ${shAny.cashIn && parseFloat(shAny.cashIn) > 0 ? `<div class="row"><span>Total Cash In</span><span>+${currency}${parseFloat(shAny.cashIn).toFixed(2)}</span></div>` : ""}
    ${shAny.cashOut && parseFloat(shAny.cashOut) > 0 ? `<div class="row"><span>Total Cash Out</span><span>-${currency}${parseFloat(shAny.cashOut).toFixed(2)}</span></div>` : ""}
    ${denomRows(openDenomJson, "OPENING DENOMINATION")}
    ${denomRows(closeDenomJson, "CLOSING DENOMINATION")}
    ${shVariance !== null ? `<div class="line"></div><div class="row bold"><span>Variance (Over/Short)</span><span>${shVariance >= 0 ? "+" : ""}${currency}${Math.abs(shVariance).toFixed(2)} ${shVariance >= 0 ? "(Over)" : "(Short)"}</span></div>` : ""}
    <div class="double"></div>
    <div class="center small">*** END OF Z-REPORT ***</div>
    <div class="center small">This document is system-generated.</div>
    <div class="center small">Printed: ${format(new Date(), "MMM d, yyyy h:mm a")}</div>
    </body></html>`;

    const win = window.open("", "_blank", "width=420,height=700");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 page-enter pb-6">

      {/* ── Active shift card ── */}
      {openShift ? (
        <div className="glass-card rounded-3xl p-5 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent border-emerald-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl -z-10" />

          {/* Header row */}
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Shift Active</p>
            <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3.5 w-3.5" />
              <ShiftDuration openedAt={openShift.openedAt!} />
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <AmountCell label="Opening Cash" value={formatCurrency(openShift.openingBalance, currency)} />
            <AmountCell label="Sales" value={formatCurrency(totalSalesNum, currency)} color="text-emerald-600 dark:text-emerald-400" />
            {cashInNum > 0 || cashOutNum > 0 ? (
              <>
                <AmountCell label="Cash In" value={formatCurrency(cashInNum, currency)} color="text-blue-600 dark:text-blue-400" />
                <AmountCell label="Cash Out" value={formatCurrency(cashOutNum, currency)} color="text-rose-500" />
              </>
            ) : (
              <>
                <AmountCell label="Expenses" value={formatCurrency(totalExpensesNum, currency)} color="text-rose-500" />
                <AmountCell label="Expected Closing" value={formatCurrency(expectedClosing, currency)} color="text-primary" />
              </>
            )}
          </div>

          {/* Expected closing (always show when there are adjustments) */}
          {(cashInNum > 0 || cashOutNum > 0) && (
            <div className="bg-primary/8 border border-primary/15 rounded-xl px-3 py-2 flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Expected Closing Balance</span>
              <span className="text-sm font-bold tabular-nums text-primary">{formatCurrency(expectedClosing, currency)}</span>
            </div>
          )}

          {/* Cash adjustments log */}
          {cashAdjs.length > 0 && (
            <div className="mb-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cash Adjustments</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {cashAdjs.map((adj, i) => (
                  <div key={i} className={cn("flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border",
                    adj.type === "in" ? "bg-blue-500/8 border-blue-500/20" : "bg-rose-500/8 border-rose-500/20")}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {adj.type === "in"
                        ? <ArrowDownCircle className="h-3 w-3 text-blue-500 shrink-0" />
                        : <ArrowUpCircle className="h-3 w-3 text-rose-500 shrink-0" />}
                      <span className={cn("font-medium", adj.type === "in" ? "text-blue-600 dark:text-blue-400" : "text-rose-500")}>
                        {adj.type === "in" ? "Cash In" : "Cash Out"}
                      </span>
                      {adj.reason && <span className="text-muted-foreground truncate">· {adj.reason}</span>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-bold tabular-nums">{formatCurrency(parseNumeric(adj.amount), currency)}</span>
                      <p className="text-[9px] text-muted-foreground">{format(new Date(adj.timestamp), "h:mm a")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl gap-1.5 border-blue-400/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
              onClick={() => { setAdjType("in"); setAdjAmount(""); setAdjReason(""); setShowAdj(true); }}
            >
              <ArrowDownCircle className="h-4 w-4" /> Cash In
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl gap-1.5 border-rose-400/40 text-rose-500 hover:bg-rose-500/10"
              onClick={() => { setAdjType("out"); setAdjAmount(""); setAdjReason(""); setShowAdj(true); }}
            >
              <ArrowUpCircle className="h-4 w-4" /> Cash Out
            </Button>
            <Button
              size="sm"
              className="flex-1 rounded-xl font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 gap-1.5"
              onClick={() => { setCloseDenoms(emptyDenoms()); setCloseBalanceManual(""); setCloseNotes(""); setShowClose(true); }}
              data-testid="button-close-shift"
            >
              <Square className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
            <Clock className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="font-semibold mb-1">No active shift</p>
          <p className="text-sm text-muted-foreground/70 mb-4">Open a shift to start tracking sales and cash</p>
          <Button
            onClick={() => { setOpenDenoms(emptyDenoms()); setOpenBalanceManual(""); setOpenNotes(""); setShowOpen(true); }}
            className="rounded-xl"
            data-testid="button-open-shift"
          >
            <Play className="h-4 w-4 mr-2" /> Open Shift
          </Button>
        </div>
      )}

      {/* ── Day-End Summary + History ── */}
      {closedShifts.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {mostRecentClosed && (
            <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-sm">Day-End Summary</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(new Date(mostRecentClosed.openedAt!), "MMMM d, yyyy")}
                    {" · "}
                    {format(new Date(mostRecentClosed.openedAt!), "h:mm a")}
                    {mostRecentClosed.closedAt && ` — ${format(new Date(mostRecentClosed.closedAt), "h:mm a")}`}
                  </p>
                </div>
                <button
                  onClick={() => setZReportShiftId(mostRecentClosed.id)}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors shrink-0"
                  data-testid="button-open-z-report"
                >
                  <FileText className="h-3.5 w-3.5" /> View Z-Report
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                <AmountCell label="Gross Sales"
                  value={formatCurrency(parseNumeric(mostRecentClosed.totalSales ?? "0") + parseNumeric(mostRecentClosed.totalExpenses ?? "0"), currency)} />
                <AmountCell label="Net Sales" value={formatCurrency(mostRecentClosed.totalSales ?? "0", currency)} color="text-emerald-600 dark:text-emerald-400" />
                <AmountCell label="Expenses" value={formatCurrency(mostRecentClosed.totalExpenses ?? "0", currency)} color="text-rose-500" />
                <AmountCell label="Transactions" value={String(mostRecentClosed.salesCount ?? 0)} color="text-primary" />
              </div>
              {(mostRecentClosed as any).variance !== null && (mostRecentClosed as any).variance !== undefined && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-muted-foreground">Variance:</span>
                  <VarianceBadge variance={parseFloat((mostRecentClosed as any).variance || "0")} currency={currency} />
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="px-4 py-3 border-b border-border/40 space-y-2.5">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-semibold text-sm flex-1">Shift History</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
                {filteredShifts.length} shift{filteredShifts.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <select value={selectedMonth} onChange={e => handleMonthChange(e.target.value)} data-testid="select-shift-month"
                className="flex-1 min-w-0 h-8 rounded-lg bg-secondary/60 border border-border/40 text-xs font-medium px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="all">All time</option>
                {availableMonths.map(m => (
                  <option key={m} value={m}>{format(new Date(m + "-01"), "MMMM yyyy")}</option>
                ))}
              </select>
              <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))} data-testid="select-shift-page-size"
                className="w-[72px] shrink-0 h-8 rounded-lg bg-secondary/60 border border-border/40 text-xs font-medium px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40">
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / pg</option>)}
              </select>
            </div>
          </div>

          {/* Shift rows */}
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
                const shAny = shift as any;
                const shVariance = shAny.variance != null ? parseFloat(shAny.variance) : null;
                return (
                  <div key={shift.id} data-testid={`shift-row-${shift.id}`} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-sm">{format(new Date(shift.openedAt!), "MMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(shift.openedAt!), "h:mm a")}
                          {" — "}
                          {shift.closedAt ? format(new Date(shift.closedAt), "h:mm a") : ""}
                          {" · "}
                          <ShiftDuration openedAt={shift.openedAt!} closedAt={shift.closedAt} />
                        </p>
                      </div>
                      <button
                        onClick={() => setZReportShiftId(shift.id)}
                        className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
                        data-testid={`button-z-report-${shift.id}`}
                      >
                        <FileText className="h-3 w-3" /> Z-Report
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
                        net >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10")}>
                        <TrendingUp className={cn("h-3 w-3 shrink-0", net >= 0 ? "text-emerald-500" : "text-rose-500")} />
                        <span className={cn("font-black tabular-nums", net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}
                          style={{ fontSize: "clamp(11px, 3vw, 15px)", wordBreak: "break-all" }}>
                          {netStr}
                        </span>
                      </div>
                      {shVariance !== null && (
                        <VarianceBadge variance={shVariance} currency={currency} />
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <AmountCell label="Opening" value={formatCurrency(shift.openingBalance, currency)} />
                      <AmountCell label="Closing" value={formatCurrency(shift.closingBalance ?? "0", currency)} color="text-primary" />
                      <AmountCell label="Sales" value={formatCurrency(shift.totalSales ?? "0", currency)} color="text-emerald-600 dark:text-emerald-400" />
                      <AmountCell label="Expenses" value={formatCurrency(shift.totalExpenses ?? "0", currency)} color="text-rose-500" />
                    </div>
                    {shift.notes && <p className="text-xs text-muted-foreground/60 mt-2 italic">{shift.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between gap-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} data-testid="button-shift-prev-page"
                className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page <span className="font-semibold text-foreground">{safePage}</span> of <span className="font-semibold text-foreground">{totalPages}</span>
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} data-testid="button-shift-next-page"
                className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors">
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

      {/* ── Open Shift Dialog ── */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-emerald-500" /> Open Shift
              </DialogTitle>
              <button onClick={() => setShowOpen(false)} className="h-8 w-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Input mode toggle */}
            <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl">
              <button onClick={() => setUseOpenDenoms(true)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  useOpenDenoms ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Coins className="h-3.5 w-3.5" /> Count Bills &amp; Coins
              </button>
              <button onClick={() => setUseOpenDenoms(false)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  !useOpenDenoms ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Banknote className="h-3.5 w-3.5" /> Manual Entry
              </button>
            </div>

            {useOpenDenoms ? (
              <DenomCounter value={openDenoms} onChange={setOpenDenoms} currency={currency} />
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Opening Balance</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openBalanceManual}
                  onChange={e => setOpenBalanceManual(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Notes (optional)</p>
              <Textarea
                placeholder="Shift notes..."
                value={openNotes}
                onChange={e => setOpenNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-xl text-sm"
              />
            </div>
          </div>
          <div className="px-5 pb-5 pt-3 border-t border-border/40 shrink-0">
            <Button
              className="w-full rounded-xl"
              onClick={() => openMutation.mutate()}
              disabled={openMutation.isPending || parseNumeric(openingBalance) < 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Open Shift with {formatCurrency(parseNumeric(openingBalance || "0"), currency)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Close Shift Dialog ── */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Square className="h-5 w-5 text-rose-500" /> Close Shift
              </DialogTitle>
              <button onClick={() => setShowClose(false)} className="h-8 w-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Expected closing summary */}
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening Cash</span>
                <span className="font-medium tabular-nums">{formatCurrency(openingNum, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Sales</span>
                <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">+{formatCurrency(totalSalesNum, currency)}</span>
              </div>
              {cashInNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash In (Adjustments)</span>
                  <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">+{formatCurrency(cashInNum, currency)}</span>
                </div>
              )}
              {cashOutNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash Out (Adjustments)</span>
                  <span className="font-medium tabular-nums text-rose-500">-{formatCurrency(cashOutNum, currency)}</span>
                </div>
              )}
              {totalExpensesNum > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses</span>
                  <span className="font-medium tabular-nums text-rose-500">-{formatCurrency(totalExpensesNum, currency)}</span>
                </div>
              )}
              <div className="border-t border-border/40 pt-1.5 flex justify-between font-bold">
                <span>Expected Closing</span>
                <span className="text-primary tabular-nums">{formatCurrency(expectedClosing, currency)}</span>
              </div>
            </div>

            {/* Input mode */}
            <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl">
              <button onClick={() => setUseCloseDenoms(true)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  useCloseDenoms ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Coins className="h-3.5 w-3.5" /> Count Bills &amp; Coins
              </button>
              <button onClick={() => setUseCloseDenoms(false)}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  !useCloseDenoms ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Banknote className="h-3.5 w-3.5" /> Manual Entry
              </button>
            </div>

            {useCloseDenoms ? (
              <DenomCounter value={closeDenoms} onChange={setCloseDenoms} currency={currency} />
            ) : (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Actual Closing Balance</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={closeBalanceManual}
                  onChange={e => setCloseBalanceManual(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            )}

            {/* Variance display */}
            {(closingNum > 0 || (useCloseDenoms && denomTotal(closeDenoms) > 0)) && (
              <div className="space-y-2">
                <div className="bg-secondary/40 rounded-xl p-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Actual Closing</span>
                  <span className="font-bold tabular-nums">{formatCurrency(closingNum, currency)}</span>
                </div>
                <VarianceBadge variance={variance} currency={currency} />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Notes (optional)</p>
              <Textarea
                placeholder="Closing notes..."
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-xl text-sm"
              />
            </div>
          </div>
          <div className="px-5 pb-5 pt-3 border-t border-border/40 shrink-0">
            <Button
              variant="destructive"
              className="w-full rounded-xl"
              onClick={() => closeMutation.mutate()}
              disabled={closeMutation.isPending}
            >
              <Square className="h-4 w-4 mr-2" /> Close Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cash Adjustment Dialog ── */}
      <Dialog open={showAdj} onOpenChange={setShowAdj}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjType === "in"
                ? <><ArrowDownCircle className="h-5 w-5 text-blue-500" /> Cash In</>
                : <><ArrowUpCircle className="h-5 w-5 text-rose-500" /> Cash Out</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex gap-1 p-1 bg-secondary/40 rounded-xl">
              <button onClick={() => setAdjType("in")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  adjType === "in" ? "bg-background shadow-sm text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground")}>
                <ArrowDownCircle className="h-3.5 w-3.5" /> Cash In
              </button>
              <button onClick={() => setAdjType("out")}
                className={cn("flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-all",
                  adjType === "out" ? "bg-background shadow-sm text-rose-500" : "text-muted-foreground hover:text-foreground")}>
                <ArrowUpCircle className="h-3.5 w-3.5" /> Cash Out
              </button>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Amount</p>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={adjAmount}
                onChange={e => setAdjAmount(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Reason (optional)</p>
              <Input
                placeholder={adjType === "in" ? "e.g. Petty cash replenishment" : "e.g. Expense reimbursement"}
                value={adjReason}
                onChange={e => setAdjReason(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <Button
              className={cn("w-full rounded-xl", adjType === "in" ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-500 hover:bg-rose-600")}
              onClick={() => adjMutation.mutate()}
              disabled={adjMutation.isPending || !adjAmount || parseFloat(adjAmount) <= 0}
            >
              {adjType === "in" ? <ArrowDownCircle className="h-4 w-4 mr-2" /> : <ArrowUpCircle className="h-4 w-4 mr-2" />}
              Record {adjType === "in" ? "Cash In" : "Cash Out"} — {formatCurrency(parseNumeric(adjAmount || "0"), currency)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Z-Report Dialog ── */}
      <Dialog open={!!zReportShiftId} onOpenChange={open => { if (!open) setZReportShiftId(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <DialogTitle className="text-base">Z-Report</DialogTitle>
                  {zReport && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(new Date(zReport.shift.openedAt!), "MMM d, yyyy")}
                      {" · "}
                      {format(new Date(zReport.shift.openedAt!), "h:mm a")}
                      {zReport.shift.closedAt && ` — ${format(new Date(zReport.shift.closedAt), "h:mm a")}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {zReport && (
                  <button
                    onClick={() => printZReportFromData(zReport)}
                    className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                )}
                <button onClick={() => setZReportShiftId(null)} className="h-8 w-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

            {zReport && !zReportLoading && (() => {
              const shAny = zReport.shift as any;
              const adjList: CashAdj[] = parseAdjs(shAny.cashAdjustments);
              const shVariance = shAny.variance != null ? parseFloat(shAny.variance) : null;
              return (
                <>
                  {/* Store header */}
                  <div className="bg-secondary/30 rounded-xl p-3 text-center space-y-0.5">
                    <p className="font-bold text-sm">{storeName}</p>
                    {tin && <p className="text-[10px] text-muted-foreground">TIN: {tin}</p>}
                    {ptuNumber && <p className="text-[10px] text-muted-foreground">PTU No.: {ptuNumber}</p>}
                    {accreditationNumber && <p className="text-[10px] text-muted-foreground">Accreditation No.: {accreditationNumber}</p>}
                    {machineSerialNumber && <p className="text-[10px] text-muted-foreground">Machine S/N: {machineSerialNumber}</p>}
                  </div>

                  {/* OR Range */}
                  {zReport.orFrom && (
                    <div className="bg-primary/8 border border-primary/20 rounded-xl p-3">
                      <SectionHeading icon={Hash} label="Official Receipt Range" />
                      <div className="flex items-center justify-between">
                        <div className="text-center flex-1">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">First OR</p>
                          <p className="font-bold text-sm tabular-nums text-primary">{zReport.orFrom}</p>
                        </div>
                        <div className="text-muted-foreground/40 text-xs font-bold">→</div>
                        <div className="text-center flex-1">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Last OR</p>
                          <p className="font-bold text-sm tabular-nums text-primary">{zReport.orTo}</p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Count</p>
                          <p className="font-bold text-sm tabular-nums">{zReport.totalTransactions}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sales Summary */}
                  <div>
                    <SectionHeading icon={BarChart3} label="Sales Summary" />
                    <div className="space-y-1.5">
                      {[
                        { label: "Gross Sales", value: zReport.grossSales, bold: false, color: "" },
                        { label: "Total Discount", value: -zReport.totalDiscount, bold: false, color: "text-rose-500" },
                        { label: "Loyalty Discount", value: -zReport.totalLoyaltyDiscount, bold: false, color: "text-rose-400" },
                        { label: "Total VAT", value: zReport.vatAmountTotal, bold: false, color: "" },
                        { label: "Net Sales", value: zReport.netSales, bold: true, color: "text-emerald-600 dark:text-emerald-400" },
                      ].filter(r => r.value !== 0).map(row => (
                        <div key={row.label} className={cn("flex items-center justify-between px-3 py-1.5 rounded-lg",
                          row.bold ? "bg-emerald-500/8 border border-emerald-500/15" : "bg-secondary/30")}>
                          <span className={cn("text-xs", row.bold ? "font-bold" : "text-muted-foreground")}>{row.label}</span>
                          <span className={cn("text-xs font-bold tabular-nums", row.color)}>
                            {row.value < 0 ? `-${formatCurrency(-row.value, currency)}` : formatCurrency(row.value, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  {Object.keys(zReport.paymentBreakdown).length > 0 && (
                    <div>
                      <SectionHeading icon={CreditCard} label="Payment Methods" />
                      <div className="space-y-1.5">
                        {Object.entries(zReport.paymentBreakdown)
                          .sort(([, a], [, b]) => b.total - a.total)
                          .map(([pm, v]) => {
                            const pct = zReport.grossSales > 0 ? (v.total / zReport.grossSales) * 100 : 0;
                            return (
                              <div key={pm} className="bg-secondary/30 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <PaymentIcon method={pm} />
                                    <span className="text-xs font-medium">{PAYMENT_LABEL[pm] || pm.toUpperCase()}</span>
                                    <span className="text-[10px] text-muted-foreground">({v.count} txn{v.count !== 1 ? "s" : ""})</span>
                                  </div>
                                  <span className="text-xs font-bold tabular-nums">{formatCurrency(v.total, currency)}</span>
                                </div>
                                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                                  <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct.toFixed(1)}%` }} />
                                </div>
                                <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{pct.toFixed(1)}%</p>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Discount Breakdown */}
                  {Object.keys(zReport.discountBreakdown).length > 0 && (
                    <div>
                      <SectionHeading icon={Tag} label="Discount Breakdown" />
                      <div className="space-y-1.5">
                        {Object.entries(zReport.discountBreakdown)
                          .sort(([, a], [, b]) => b.count - a.count)
                          .map(([dt, v]) => (
                            <div key={dt} className={cn("flex items-center justify-between px-3 py-2 rounded-lg",
                              dt !== "regular" ? "bg-amber-500/8 border border-amber-500/15" : "bg-secondary/30")}>
                              <div>
                                <p className="text-xs font-medium">{DISCOUNT_LABEL[dt] || dt}</p>
                                <p className="text-[10px] text-muted-foreground">{v.count} transaction{v.count !== 1 ? "s" : ""}</p>
                              </div>
                              <div className="text-right">
                                {v.discount > 0 && <p className="text-xs font-bold text-rose-500 tabular-nums">-{formatCurrency(v.discount, currency)}</p>}
                                <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(v.total, currency)} sales</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* BIR VAT Breakdown */}
                  <div>
                    <SectionHeading icon={Receipt} label="BIR VAT Breakdown" />
                    <div className="bg-secondary/30 rounded-xl overflow-hidden divide-y divide-border/30">
                      {[
                        { label: "VATable Sales", value: zReport.vatableSalesTotal, sub: "Taxable portion of sales" },
                        { label: `VAT Amount (${taxRate}%)`, value: zReport.vatAmountTotal, sub: "Output VAT collected", highlight: true },
                        { label: "VAT-Exempt Sales", value: zReport.vatExemptTotal, sub: "SC/PWD and other exemptions" },
                        { label: "Zero-Rated Sales", value: zReport.zeroRatedTotal, sub: "Applicable zero-rated sales" },
                      ].map(row => (
                        <div key={row.label} className={cn("flex items-center justify-between px-3 py-2", row.highlight ? "bg-primary/5" : "")}>
                          <div>
                            <p className={cn("text-xs font-medium", row.highlight ? "text-primary" : "")}>{row.label}</p>
                            <p className="text-[9px] text-muted-foreground">{row.sub}</p>
                          </div>
                          <p className={cn("text-xs font-bold tabular-nums", row.highlight ? "text-primary" : "")}>
                            {formatCurrency(row.value, currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cash Adjustments */}
                  {adjList.length > 0 && (
                    <div>
                      <SectionHeading icon={Coins} label="Cash Adjustments" />
                      <div className="space-y-1.5">
                        {adjList.map((adj, i) => (
                          <div key={i} className={cn("flex items-center justify-between px-3 py-2 rounded-lg border text-xs",
                            adj.type === "in" ? "bg-blue-500/8 border-blue-500/20" : "bg-rose-500/8 border-rose-500/20")}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {adj.type === "in" ? <ArrowDownCircle className="h-3 w-3 text-blue-500 shrink-0" /> : <ArrowUpCircle className="h-3 w-3 text-rose-500 shrink-0" />}
                              <div className="min-w-0">
                                <span className={cn("font-medium", adj.type === "in" ? "text-blue-600 dark:text-blue-400" : "text-rose-500")}>
                                  {adj.type === "in" ? "Cash In" : "Cash Out"}
                                </span>
                                {adj.reason && <p className="text-[10px] text-muted-foreground truncate">{adj.reason}</p>}
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <span className="font-bold tabular-nums">{formatCurrency(parseNumeric(adj.amount), currency)}</span>
                              <p className="text-[9px] text-muted-foreground">{format(new Date(adj.timestamp), "h:mm a")}</p>
                            </div>
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-1.5">
                          {parseFloat(shAny.cashIn || "0") > 0 && (
                            <div className="bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2 text-center">
                              <p className="text-[9px] text-muted-foreground">Total Cash In</p>
                              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums">+{formatCurrency(parseFloat(shAny.cashIn), currency)}</p>
                            </div>
                          )}
                          {parseFloat(shAny.cashOut || "0") > 0 && (
                            <div className="bg-rose-500/8 border border-rose-500/20 rounded-lg px-3 py-2 text-center">
                              <p className="text-[9px] text-muted-foreground">Total Cash Out</p>
                              <p className="text-xs font-bold text-rose-500 tabular-nums">-{formatCurrency(parseFloat(shAny.cashOut), currency)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Denomination Breakdown */}
                  {(shAny.denominationOpen || shAny.denominationClose) && (
                    <div>
                      <SectionHeading icon={Coins} label="Cash Denomination" />
                      <div className="space-y-3">
                        {shAny.denominationOpen && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Opening Breakdown</p>
                            <DenomBreakdown json={shAny.denominationOpen} currency={currency} />
                          </div>
                        )}
                        {shAny.denominationClose && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Closing Breakdown</p>
                            <DenomBreakdown json={shAny.denominationClose} currency={currency} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Variance */}
                  {shVariance !== null && (
                    <div>
                      <SectionHeading icon={AlertTriangle} label="Cash Variance" />
                      <VarianceBadge variance={shVariance} currency={currency} />
                    </div>
                  )}

                  {/* Top Items */}
                  {zReport.topItems.length > 0 && (
                    <div>
                      <SectionHeading icon={ShoppingBag} label="Top Items This Shift" />
                      <div className="space-y-1.5">
                        {zReport.topItems.map((item, i) => {
                          const maxQty = zReport.topItems[0]?.qty || 1;
                          const pct = (item.qty / maxQty) * 100;
                          return (
                            <div key={i} className="bg-secondary/30 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                                  <span className="text-xs font-medium truncate">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-muted-foreground">x{item.qty}</span>
                                  <span className="text-xs font-bold tabular-nums">{formatCurrency(item.total, currency)}</span>
                                </div>
                              </div>
                              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${pct.toFixed(1)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
