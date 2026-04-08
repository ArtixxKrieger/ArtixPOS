import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { getBusinessFeatures } from "@/lib/business-features";
import {
  format, startOfDay, endOfDay, subDays, isWithinInterval,
  getDay, differenceInDays, eachDayOfInterval, addDays,
} from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line, Legend,
} from "recharts";
import {
  BarChart3, TrendingUp, Clock, ShoppingBag,
  Package, ArrowUpRight, ArrowDownRight, Download, Lightbulb,
  CreditCard, Tag, ChevronDown, Minus, RotateCcw,
} from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

/* ── helpers ─────────────────────────────────────── */

function Counter({ value, prefix = "", decimals }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start = 0;
    const step = Math.max(0.01, value / 60);
    const t = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(t); }
      else setDisplay(start);
    }, 14);
    return () => clearInterval(t);
  }, [value]);
  const d = decimals ?? (value % 1 !== 0 ? 2 : 0);
  return <>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}</>;
}

function GrowthBadge({ pct, absolute }: { pct?: number; absolute?: number }) {
  const val = pct ?? absolute ?? 0;
  const up = val >= 0;
  if (val === 0) return <span className="text-[10px] text-muted-foreground/50 mt-1 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" /> No change</span>;
  return (
    <span className={cn("text-[10px] font-semibold mt-1 flex items-center gap-0.5", up ? "text-emerald-500" : "text-rose-500")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct !== undefined ? `${Math.abs(pct).toFixed(1)}% vs prev` : `${absolute! > 0 ? "+" : ""}${absolute} vs prev`}
    </span>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHART_COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#0ea5e9", "#ef4444", "#f43f5e"];

const MEDAL_COLORS = [
  "#F5C518", // #1 Gold
  "#A8B8C8", // #2 Silver
  "#CD7F32", // #3 Bronze
];

const RANK_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#0ea5e9", "#14b8a6",
  "#f97316", "#84cc16", "#a855f7", "#3b82f6", "#10b981",
  "#eab308", "#06b6d4", "#d946ef", "#2dd4bf", "#fb923c",
  "#4ade80", "#f43f5e", "#38bdf8", "#c084fc", "#34d399",
];

function getRankColor(index: number): string {
  if (index < 3) return MEDAL_COLORS[index];
  return RANK_PALETTE[(index - 3) % RANK_PALETTE.length];
}

function getCategoryColor(index: number): string {
  return RANK_PALETTE[index % RANK_PALETTE.length];
}

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";
type Metric = "revenue" | "orders";
type ChartKind = "area" | "bar" | "line";
type ProdSort = "qty" | "revenue";

function getRange(preset: Preset, custom?: DateRange) {
  const now = new Date();
  switch (preset) {
    case "today":
      return { s: startOfDay(now), e: endOfDay(now), prevS: startOfDay(subDays(now, 1)), prevE: endOfDay(subDays(now, 1)), isDay: true };
    case "yesterday": {
      const y = subDays(now, 1);
      return { s: startOfDay(y), e: endOfDay(y), prevS: startOfDay(subDays(now, 2)), prevE: endOfDay(subDays(now, 2)), isDay: true };
    }
    case "7d":
      return { s: startOfDay(subDays(now, 6)), e: endOfDay(now), prevS: startOfDay(subDays(now, 13)), prevE: endOfDay(subDays(now, 7)), isDay: false };
    case "30d":
      return { s: startOfDay(subDays(now, 29)), e: endOfDay(now), prevS: startOfDay(subDays(now, 59)), prevE: endOfDay(subDays(now, 30)), isDay: false };
    case "custom": {
      if (custom?.from && custom?.to) {
        const days = differenceInDays(custom.to, custom.from);
        return { s: startOfDay(custom.from), e: endOfDay(custom.to), prevS: startOfDay(subDays(custom.from, days + 1)), prevE: endOfDay(subDays(custom.from, 1)), isDay: days === 0 };
      }
      return { s: startOfDay(now), e: endOfDay(now), prevS: startOfDay(subDays(now, 1)), prevE: endOfDay(subDays(now, 1)), isDay: true };
    }
  }
}

const EXPORT_HEADERS = ["Date", "Time", "Items", "Payment Method", "Subtotal", "Tax", "Discount", "Total"];

function getExportRows(sales: any[]) {
  return sales.map(s => [
    format(new Date(s.createdAt), "yyyy-MM-dd"),
    format(new Date(s.createdAt), "HH:mm:ss"),
    ((s.items as any[]) || []).map((i: any) => `${i.product?.name || "?"} x${i.quantity || 1}`).join(" | "),
    s.paymentMethod,
    s.subtotal,
    s.tax,
    s.discount,
    s.total,
  ]);
}

function exportCSV(sales: any[], currency: string, label: string) {
  const rows = [EXPORT_HEADERS, ...getExportRows(sales)];
  const csv = rows.map(r => r.map(String).map(v => v.includes(",") ? `"${v}"` : v).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-${label}-${format(new Date(), "yyyyMMdd")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportExcel(sales: any[], label: string, storeName: string) {
  const XLSX = await import("xlsx");
  const rows = [EXPORT_HEADERS, ...getExportRows(sales)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Column widths
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales");
  XLSX.writeFile(wb, `${storeName.replace(/\s+/g, "-")}-sales-${label}.xlsx`);
}

function exportPDF(sales: any[], currency: string, label: string, storeName: string) {
  const rows = sales.map(s => ({
    date: format(new Date(s.createdAt), "MMM d, yyyy h:mm a"),
    items: ((s.items as any[]) || []).map((i: any) => `${i.product?.name || "?"} ×${i.quantity || 1}`).join(", "),
    method: (s.paymentMethod || "cash").charAt(0).toUpperCase() + (s.paymentMethod || "cash").slice(1),
    total: parseNumeric(s.total),
  }));
  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${storeName} — Sales Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 16px; }
    .header h1 { font-size: 22px; font-weight: 800; color: #6366f1; }
    .header .meta { text-align: right; font-size: 11px; color: #666; line-height: 1.6; }
    .summary { display: flex; gap: 16px; margin-bottom: 20px; }
    .summary-box { flex: 1; background: #f5f5ff; border-left: 3px solid #6366f1; padding: 10px 14px; border-radius: 4px; }
    .summary-box .label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-box .val { font-size: 18px; font-weight: 700; color: #6366f1; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #6366f1; color: white; }
    th { padding: 9px 10px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
    td { padding: 8px 10px; border-bottom: 1px solid #eef0f8; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9ff; }
    tr:last-child td { border-bottom: none; }
    .tfoot td { background: #f0f0ff; font-weight: 700; border-top: 2px solid #6366f1; }
    .method-cash { color: #16a34a; background: #dcfce7; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; }
    .method-online { color: #2563eb; background: #dbeafe; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 600; }
    .footer { margin-top: 24px; font-size: 10px; color: #aaa; text-align: center; }
    @media print { @page { margin: 20mm; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div><h1>${storeName}</h1><div style="font-size:13px;color:#666;margin-top:4px;">Sales Report — ${label}</div></div>
    <div class="meta">Generated: ${format(new Date(), "MMMM d, yyyy")}<br/>${format(new Date(), "h:mm a")}<br/>${rows.length} transaction${rows.length !== 1 ? "s" : ""}</div>
  </div>
  <div class="summary">
    <div class="summary-box"><div class="label">Total Revenue</div><div class="val">${currency}${grandTotal.toFixed(2)}</div></div>
    <div class="summary-box"><div class="label">Transactions</div><div class="val">${rows.length}</div></div>
    <div class="summary-box"><div class="label">Avg. Order</div><div class="val">${currency}${rows.length > 0 ? (grandTotal / rows.length).toFixed(2) : "0.00"}</div></div>
  </div>
  <table>
    <thead><tr><th>Date & Time</th><th>Items</th><th>Method</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td style="white-space:nowrap">${r.date}</td><td>${r.items}</td><td><span class="method-${r.method.toLowerCase()}">${r.method}</span></td><td style="text-align:right;font-weight:600">${currency}${r.total.toFixed(2)}</td></tr>`).join("")}
    </tbody>
    <tfoot><tr class="tfoot"><td colspan="3" style="text-align:right;padding-right:10px">Grand Total</td><td style="text-align:right">${currency}${grandTotal.toFixed(2)}</td></tr></tfoot>
  </table>
  <div class="footer">${storeName} · Powered by Quick POS</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to export PDF."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "14px",
  color: "hsl(var(--foreground))",
  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  padding: "10px 14px",
  fontSize: "12px",
  fontWeight: 500,
};

/* ── Toggle Button Group ─────────────────────────── */
function ToggleGroup<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex bg-secondary/60 dark:bg-white/5 rounded-xl p-0.5 gap-0.5 border border-border/30">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 py-1 rounded-[10px] text-[10px] font-semibold transition-all duration-200",
            value === opt.value
              ? "bg-card dark:bg-white/10 text-foreground shadow-sm"
              : "text-muted-foreground dark:text-white/45 hover:text-foreground dark:hover:text-white/80"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Insight Card ────────────────────────────────── */
function InsightCard({ icon: Icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <div className="flex items-start gap-3 p-3.5 bg-secondary/40 dark:bg-white/[0.04] border border-border/30 rounded-2xl">
      <div className={cn("h-7 w-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5", color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-xs text-foreground/90 dark:text-white/75 leading-relaxed pt-0.5">{text}</p>
    </div>
  );
}

/* ── Main Component ──────────────────────────────── */
export default function Analytics() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();
  const currency = (settings as any)?.currency || "₱";
  const { terminology } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  const CurrencyIcon = ({ className }: { className?: string }) => (
    <span className="font-black leading-none flex items-center justify-center" style={{ fontSize: "0.85em" }}>
      {currency}
    </span>
  );

  const [preset, setPreset] = useState<Preset>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [chartKind, setChartKind] = useState<ChartKind>("area");
  const [prodSort, setProdSort] = useState<ProdSort>("qty");
  const [showNet, setShowNet] = useState(false);
  const [showComparison, setShowComparison] = useState(true);

  const range = useMemo(() => getRange(preset, customRange), [preset, customRange]);

  const currSales = useMemo(
    () => sales.filter(s => isWithinInterval(new Date(s.createdAt!), { start: range.s, end: range.e })),
    [sales, range]
  );
  const prevSales = useMemo(
    () => sales.filter(s => isWithinInterval(new Date(s.createdAt!), { start: range.prevS, end: range.prevE })),
    [sales, range]
  );

  const rev = (s: typeof sales[0]) => parseNumeric(s.total) - (showNet ? parseNumeric(s.tax) : 0);

  const currRevenue = useMemo(() => currSales.reduce((a, s) => a + rev(s), 0), [currSales, showNet]);
  const prevRevenue = useMemo(() => prevSales.reduce((a, s) => a + rev(s), 0), [prevSales, showNet]);
  const currOrders = currSales.length;
  const prevOrders = prevSales.length;
  const currAvg = currOrders > 0 ? currRevenue / currOrders : 0;
  const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;
  const currTax = useMemo(() => currSales.reduce((a, s) => a + parseNumeric(s.tax), 0), [currSales]);

  const currRefundedSales = useMemo(() => currSales.filter(s => !!(s as any).refundedAt), [currSales]);
  const currRefundTotal = useMemo(() => currRefundedSales.reduce((a, s) => a + parseNumeric(s.total), 0), [currRefundedSales]);
  const currRefundCount = currRefundedSales.length;

  const prevRefundedSales = useMemo(() => prevSales.filter(s => !!(s as any).refundedAt), [prevSales]);
  const prevRefundTotal = useMemo(() => prevRefundedSales.reduce((a, s) => a + parseNumeric(s.total), 0), [prevRefundedSales]);

  const currNetRevenue = currRevenue - currRefundTotal;
  const prevNetRevenue = prevRevenue - prevRefundTotal;

  const revPct = prevNetRevenue > 0 ? ((currNetRevenue - prevNetRevenue) / prevNetRevenue) * 100 : 0;
  const ordPct = prevOrders > 0 ? ((currOrders - prevOrders) / prevOrders) * 100 : 0;
  const avgPct = prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;

  /* Trend chart data */
  const trendData = useMemo(() => {
    if (range.isDay) {
      const curr: Record<number, { revenue: number; orders: number }> = {};
      const prev: Record<number, { revenue: number; orders: number }> = {};
      for (let h = 0; h < 24; h++) { curr[h] = { revenue: 0, orders: 0 }; prev[h] = { revenue: 0, orders: 0 }; }
      currSales.forEach(s => {
        const h = new Date(s.createdAt!).getHours();
        if (!(s as any).refundedAt) curr[h].revenue += rev(s);
        curr[h].orders++;
      });
      prevSales.forEach(s => {
        const h = new Date(s.createdAt!).getHours();
        if (!(s as any).refundedAt) prev[h].revenue += rev(s);
        prev[h].orders++;
      });
      return Array.from({ length: 24 }, (_, h) => ({
        label: h % 6 === 0 ? `${h}:00` : h % 3 === 0 ? `${h}h` : "",
        fullLabel: `${String(h).padStart(2, "0")}:00`,
        revenue: curr[h].revenue,
        orders: curr[h].orders,
        prevRevenue: prev[h].revenue,
        prevOrders: prev[h].orders,
      }));
    } else {
      const days = eachDayOfInterval({ start: range.s, end: range.e });
      const diffDays = differenceInDays(range.e, range.s);
      return days.map((day, i) => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const prevDay = addDays(dayStart, -diffDays - 1);
        const prevDayEnd = endOfDay(prevDay);
        const cs = currSales.filter(s => isWithinInterval(new Date(s.createdAt!), { start: dayStart, end: dayEnd }));
        const ps = prevSales.filter(s => isWithinInterval(new Date(s.createdAt!), { start: startOfDay(prevDay), end: prevDayEnd }));
        return {
          label: format(day, diffDays > 14 ? "M/d" : "EEE M/d"),
          fullLabel: format(day, "EEEE, MMM d"),
          revenue: cs.filter(s => !(s as any).refundedAt).reduce((a, s) => a + rev(s), 0),
          orders: cs.length,
          prevRevenue: ps.filter(s => !(s as any).refundedAt).reduce((a, s) => a + rev(s), 0),
          prevOrders: ps.length,
        };
      });
    }
  }, [currSales, prevSales, range, showNet]);

  /* Hourly heatmap (all time) */
  const hourlyData = useMemo(() => {
    const h: Record<number, number> = {};
    for (let i = 0; i < 24; i++) h[i] = 0;
    currSales.forEach(s => { h[new Date(s.createdAt!).getHours()] += 1; });
    const max = Math.max(...Object.values(h), 1);
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, label: `${i}:00`, sales: h[i], intensity: h[i] / max }));
  }, [currSales]);

  const bestHour = hourlyData.reduce((a, b) => b.sales > a.sales ? b : a, hourlyData[0]);

  const nonRefundedCurrSales = useMemo(() => currSales.filter(s => !(s as any).refundedAt), [currSales]);

  /* Top products/services — exclude refunded sales. Handles both POS format {product:{name}} and appointment format {name} */
  const productData = useMemo(() => {
    const counts: Record<string, { qty: number; revenue: number }> = {};
    nonRefundedCurrSales.forEach(s => {
      ((s.items as any[]) || []).forEach(item => {
        const name = item.product?.name || item.name || item.title || "Unknown";
        if (name === "Unknown") return;
        if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
        counts[name].qty += item.quantity || 1;
        const p = parseNumeric(item.size?.price ?? item.product?.price ?? item.price ?? 0);
        const m = (item.modifiers || []).reduce((a: number, mod: any) => a + parseNumeric(mod.price), 0);
        counts[name].revenue += (p + m) * (item.quantity || 1);
      });
    });
    return Object.entries(counts)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => prodSort === "qty" ? b.qty - a.qty : b.revenue - a.revenue);
  }, [nonRefundedCurrSales, prodSort]);

  /* Category breakdown — exclude refunded sales */
  const categoryData = useMemo(() => {
    const cats: Record<string, { revenue: number; orders: number }> = {};
    nonRefundedCurrSales.forEach(s => {
      ((s.items as any[]) || []).forEach(item => {
        const cat = item.product?.category || item.category || "Uncategorized";
        if (!cats[cat]) cats[cat] = { revenue: 0, orders: 0 };
        const p = parseNumeric(item.size?.price ?? item.product?.price ?? item.price ?? 0);
        const m = (item.modifiers || []).reduce((a: number, mod: any) => a + parseNumeric(mod.price), 0);
        cats[cat].revenue += (p + m) * (item.quantity || 1);
        cats[cat].orders += item.quantity || 1;
      });
    });
    return Object.entries(cats).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [nonRefundedCurrSales]);

  /* Day of week */
  const dowData = useMemo(() => {
    const d: Record<number, { revenue: number; orders: number }> = {};
    for (let i = 0; i < 7; i++) d[i] = { revenue: 0, orders: 0 };
    currSales.forEach(s => {
      const day = getDay(new Date(s.createdAt!));
      d[day].revenue += rev(s);
      d[day].orders++;
    });
    return DOW.map((label, i) => ({ label, ...d[i] }));
  }, [currSales, showNet]);

  /* Payment methods */
  const paymentData = useMemo(() => {
    const p: Record<string, { count: number; revenue: number }> = {};
    currSales.forEach(s => {
      const method = s.paymentMethod || "cash";
      if (!p[method]) p[method] = { count: 0, revenue: 0 };
      p[method].count++;
      p[method].revenue += rev(s);
    });
    return Object.entries(p).map(([name, v]) => ({ name: name === "online" ? "Online" : "Cash", ...v }));
  }, [currSales, showNet]);

  /* Smart insights */
  const insights = useMemo(() => {
    const list: { icon: any; text: string; color: string }[] = [];
    if (prevNetRevenue > 0) {
      const dir = currNetRevenue >= prevNetRevenue ? "up" : "down";
      list.push({
        icon: TrendingUp,
        text: `Net revenue is ${dir} ${Math.abs(revPct).toFixed(1)}% vs the previous period (${formatCurrency(prevNetRevenue, currency)} → ${formatCurrency(currNetRevenue, currency)}).`,
        color: currNetRevenue >= prevNetRevenue ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600",
      });
    }
    if (currRefundCount > 0) {
      const refundRate = currOrders > 0 ? ((currRefundCount / currOrders) * 100).toFixed(1) : "0";
      list.push({
        icon: RotateCcw,
        text: `${currRefundCount} refund${currRefundCount !== 1 ? "s" : ""} were processed this period totalling ${formatCurrency(currRefundTotal, currency)} — a ${refundRate}% refund rate.`,
        color: currRefundCount > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-secondary/40 text-muted-foreground",
      });
    }
    if (productData[0]) {
      list.push({
        icon: Package,
        text: `${terminology.bestSellerLabel}: "${productData[0].name}" — ${productData[0].qty} ${terminology.itemUnit}${productData[0].qty !== 1 ? "s" : ""}, generating ${formatCurrency(productData[0].revenue, currency)}.`,
        color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      });
    }
    if (bestHour?.sales > 0) {
      list.push({
        icon: Clock,
        text: `Your peak hour is ${bestHour.label} with ${bestHour.sales} ${terminology.orderLabel}${bestHour.sales !== 1 ? "s" : ""}. Consider extra staffing during this time.`,
        color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      });
    }
    const bestDow = dowData.reduce((a, b) => b.revenue > a.revenue ? b : a, dowData[0]);
    if (bestDow?.revenue > 0) {
      list.push({
        icon: BarChart3,
        text: `${bestDow.label}day is your strongest day of the week with ${formatCurrency(bestDow.revenue, currency)} in revenue.`,
        color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      });
    }
    if (categoryData.length > 1) {
      list.push({
        icon: Tag,
        text: `"${categoryData[0].name}" is your top-grossing category at ${formatCurrency(categoryData[0].revenue, currency)}, followed by "${categoryData[1].name}" at ${formatCurrency(categoryData[1].revenue, currency)}.`,
        color: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
      });
    }
    return list;
  }, [currNetRevenue, prevNetRevenue, revPct, currRefundCount, currRefundTotal, currOrders, productData, bestHour, dowData, categoryData, currency]);

  const rangeLabel = preset === "today" ? "today" : preset === "yesterday" ? "yesterday" : preset === "7d" ? "last-7d" : preset === "30d" ? "last-30d" : "custom";

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="flex justify-between items-center">
          <div className="h-10 w-40 skeleton-shimmer rounded-2xl" />
          <div className="h-10 w-64 skeleton-shimmer rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 skeleton-shimmer rounded-2xl" />)}
        </div>
        <div className="h-64 skeleton-shimmer rounded-3xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-52 skeleton-shimmer rounded-3xl" />
          <div className="h-52 skeleton-shimmer rounded-3xl" />
        </div>
      </div>
    );
  }

  const yFmt = (v: number) => metric === "revenue" ? `${currency}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}` : String(v);
  const ttFmt = (v: number) => metric === "revenue" ? formatCurrency(v, currency) : String(v);

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Analytics</h2>
            <p className="text-xs text-muted-foreground font-medium">Deep performance insights</p>
          </div>
        </div>

        {/* Date range + export */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Preset pills */}
          <div className="flex bg-secondary/60 dark:bg-white/5 rounded-2xl p-1 gap-1 border border-border/30">
            {(["today", "yesterday", "7d", "30d"] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                data-testid={`btn-preset-${p}`}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200",
                  preset === p
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-muted-foreground dark:text-white/50 hover:text-foreground dark:hover:text-white/80"
                )}
              >
                {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}

            {/* Custom range */}
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={() => setPreset("custom")}
                  data-testid="btn-preset-custom"
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-200 flex items-center gap-1",
                    preset === "custom"
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "text-muted-foreground dark:text-white/50 hover:text-foreground dark:hover:text-white/80"
                  )}
                >
                  {preset === "custom" && customRange?.from
                    ? `${format(customRange.from, "M/d")}${customRange.to ? `–${format(customRange.to, "M/d")}` : ""}`
                    : "Custom"}
                  <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={(r) => { setCustomRange(r); if (r?.from && r?.to) { setPreset("custom"); setCustomOpen(false); } }}
                  numberOfMonths={1}
                  className="rounded-2xl"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Export buttons */}
          <div className="flex items-center bg-secondary/60 dark:bg-secondary/40 rounded-xl border border-border/30 overflow-hidden">
            {[
              { label: "CSV", fn: () => exportCSV(currSales, currency, rangeLabel), testId: "button-export-csv" },
              { label: "Excel", fn: () => exportExcel(currSales, rangeLabel, settings?.storeName || "Store"), testId: "button-export-excel" },
              { label: "PDF", fn: () => exportPDF(currSales, currency, rangeLabel, settings?.storeName || "Store"), testId: "button-export-pdf" },
            ].map((btn, i) => (
              <button
                key={btn.label}
                onClick={btn.fn}
                data-testid={btn.testId}
                className={cn(
                  "h-9 px-3 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground dark:text-white/55 hover:text-foreground dark:hover:text-white hover:bg-secondary transition-all",
                  i > 0 && "border-l border-border/30"
                )}
              >
                {i === 0 && <Download className="h-3 w-3" />}
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5 stagger-children">
        {[
          {
            label: "Net Revenue",
            value: currNetRevenue,
            prefix: currency,
            icon: CurrencyIcon,
            color: "text-violet-600 dark:text-violet-400",
            glow: "from-violet-500/10",
            growth: <GrowthBadge pct={revPct} />,
            sub: currRefundTotal > 0
              ? `gross ${formatCurrency(currRevenue, currency)} · refunds -${formatCurrency(currRefundTotal, currency)}`
              : `prev: ${formatCurrency(prevNetRevenue, currency)}`,
          },
          {
            label: "Total Orders",
            value: currOrders,
            prefix: "",
            icon: ShoppingBag,
            color: "text-pink-600 dark:text-pink-400",
            glow: "from-pink-500/10",
            growth: <GrowthBadge pct={ordPct} />,
            sub: `prev: ${prevOrders} orders`,
          },
          {
            label: "Avg. Order",
            value: currAvg,
            prefix: currency,
            icon: TrendingUp,
            color: "text-amber-600 dark:text-amber-400",
            glow: "from-amber-500/10",
            growth: <GrowthBadge pct={avgPct} />,
            sub: `prev: ${formatCurrency(prevAvg, currency)}`,
          },
          {
            label: "Refunds",
            value: currRefundTotal,
            prefix: currency,
            icon: RotateCcw,
            color: currRefundTotal > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
            glow: currRefundTotal > 0 ? "from-rose-500/10" : "from-secondary/10",
            growth: null,
            sub: currRefundCount === 0
              ? "No refunds"
              : `${currRefundCount} refund${currRefundCount !== 1 ? "s" : ""} processed`,
          },
          {
            label: "Tax Collected",
            value: currTax,
            prefix: currency,
            icon: CreditCard,
            color: "text-emerald-600 dark:text-emerald-400",
            glow: "from-emerald-500/10",
            growth: null,
            sub: currOrders > 0 ? `${((currTax / (currRevenue + currTax)) * 100).toFixed(1)}% of gross` : "No sales",
          },
        ].map((card, i) => (
          <div key={i} className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${card.glow} to-transparent relative overflow-hidden animate-fade-scale card-press`}>
            <div className="absolute top-2.5 right-2.5 opacity-[0.07]">
              <card.icon className="h-10 w-10" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-2xl font-black tabular-nums leading-none ${card.color}`}>
              <Counter value={card.value} prefix={card.prefix} decimals={card.prefix ? 0 : 0} />
            </p>
            {card.growth ?? <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>}
            {card.growth && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Toggles strip ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <ToggleGroup value={metric} onChange={(v) => setMetric(v as Metric)} options={[{ value: "revenue", label: "Revenue" }, { value: "orders", label: "Orders" }]} />
        <ToggleGroup value={chartKind} onChange={(v) => setChartKind(v as ChartKind)} options={[{ value: "area", label: "Area" }, { value: "bar", label: "Bar" }, { value: "line", label: "Line" }]} />
        <ToggleGroup value={showNet ? "net" : "gross"} onChange={(v) => setShowNet(v === "net")} options={[{ value: "gross", label: "Gross" }, { value: "net", label: "Net" }]} />
        <button
          onClick={() => setShowComparison(v => !v)}
          className={cn(
            "flex rounded-xl border border-border/30 items-center px-2.5 py-1 text-[10px] font-semibold transition-all duration-200",
            showComparison
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-secondary/60 dark:bg-white/5 text-muted-foreground dark:text-white/45 hover:text-foreground dark:hover:text-white/80"
          )}
        >
          Compare period
        </button>
      </div>

      {/* ── Revenue / Orders Trend ── */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
          <div className="h-7 w-7 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="font-semibold text-sm">
            {metric === "revenue" ? `Net Revenue${showNet ? " (excl. tax)" : ""}` : "Order Volume"} — {preset === "today" ? "Hourly" : preset === "yesterday" ? "Hourly" : "Daily"}
          </span>
        </div>
        <div className="p-4 md:p-6">
          {trendData.every(d => (metric === "revenue" ? d.revenue : d.orders) === 0) ? (
            <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/60 gap-2">
              <BarChart3 className="h-10 w-10" strokeWidth={1.2} />
              <p className="text-sm">No data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={yFmt} width={52} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  labelFormatter={(_, p) => p[0]?.payload?.fullLabel || ""}
                  formatter={(v: any) => [ttFmt(Number(v))]}
                  cursor={{ stroke: "#6366f1", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                />
                {chartKind === "area" && (
                  <Area type="monotone" dataKey={metric} name="Current" stroke="#6366f1" strokeWidth={2.5} fill="url(#mainGrad)" isAnimationActive dot={{ r: 3, fill: "#6366f1", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} />
                )}
                {chartKind === "bar" && (
                  <Bar dataKey={metric} name="Current" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive />
                )}
                {chartKind === "line" && (
                  <Line type="monotone" dataKey={metric} name="Current" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} isAnimationActive />
                )}
                {showComparison && (
                  <Line
                    type="monotone"
                    dataKey={metric === "revenue" ? "prevRevenue" : "prevOrders"}
                    name="Previous"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={{ r: 2.5, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 1 }}
                    activeDot={{ r: 4, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 1.5 }}
                    opacity={0.5}
                    isAnimationActive
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Top Products + Hourly Heatmap ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Top Items — label adapts to business type */}
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Package className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="font-semibold text-sm">{terminology.topItemsLabel}</span>
            <div className="ml-auto">
              <ToggleGroup value={prodSort} onChange={(v) => setProdSort(v as ProdSort)} options={[{ value: "qty", label: "Qty" }, { value: "revenue", label: "Revenue" }]} />
            </div>
          </div>
          <div className="p-5">
            {productData.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground/60 text-sm">No {terminology.topItemsLabel.toLowerCase()} data for this period</div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-hide pr-1">
                {(() => {
                  const max = Math.max(...productData.map(d => prodSort === "qty" ? d.qty : d.revenue), 1);
                  return productData.map((p, i) => {
                    const val = prodSort === "qty" ? p.qty : p.revenue;
                    const pct = (val / max) * 100;
                    const color = getRankColor(i);
                    return (
                      <div key={p.name} className="space-y-1 item-enter" style={{ animationDelay: `${i * 40}ms` }}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0" style={{ background: color + "30", color }}>
                              {i + 1}
                            </span>
                            <span className="font-semibold">{p.name}</span>
                          </div>
                          <span className="font-bold tabular-nums shrink-0" style={{ color }}>
                            {prodSort === "qty" ? `${p.qty} ${terminology.itemUnit}${p.qty !== 1 ? "s" : ""}` : formatCurrency(p.revenue, currency)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground dark:text-white/55 text-right">
                          {prodSort === "qty" ? formatCurrency(p.revenue, currency) : `${p.qty} ${terminology.itemUnit}${p.qty !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Hourly Heatmap */}
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="font-semibold text-sm">Hourly Activity</span>
            {bestHour?.sales > 0 && (
              <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg font-semibold">
                Peak: {bestHour.label}
              </span>
            )}
          </div>
          <div className="p-4">
            {hourlyData.every(d => d.sales === 0) ? (
              <div className="h-40 flex flex-col items-center justify-center text-muted-foreground/60 gap-2">
                <Clock className="h-8 w-8" strokeWidth={1.2} />
                <p className="text-sm">No activity data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} allowDecimals={false} width={24} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    formatter={(v: any) => [`${v} order${Number(v) !== 1 ? "s" : ""}`, "Sales"]}
                    labelFormatter={(_, p) => p[0]?.payload?.label || ""}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  />
                  <Bar dataKey="sales" radius={[4, 4, 0, 0]} isAnimationActive>
                    {hourlyData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={`hsl(${43 + entry.intensity * 30}, ${60 + entry.intensity * 30}%, ${55 - entry.intensity * 20}%)`}
                        opacity={0.3 + entry.intensity * 0.7}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Day of Week + Payment Methods ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Day of Week */}
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-semibold text-sm">Day of Week</span>
          </div>
          <div className="p-4">
            {dowData.every(d => d.revenue === 0) ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground/60 text-sm">No data for period</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dowData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={v => metric === "revenue" ? `${currency}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` : String(v)} width={42} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                    formatter={(v: any) => [metric === "revenue" ? formatCurrency(Number(v), currency) : `${v} orders`, metric === "revenue" ? "Revenue" : "Orders"]}
                  />
                  <Bar dataKey={metric} radius={[6, 6, 0, 0]} isAnimationActive>
                    {dowData.map((entry, i) => {
                      const max = Math.max(...dowData.map(d => metric === "revenue" ? d.revenue : d.orders), 1);
                      const intensity = (metric === "revenue" ? entry.revenue : entry.orders) / max;
                      return <Cell key={i} fill="#6366f1" opacity={0.2 + intensity * 0.8} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-semibold text-sm">Payment Methods</span>
          </div>
          <div className="p-5">
            {paymentData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground/60 text-sm">No payment data</div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="shrink-0">
                  <PieChart width={150} height={150} style={{ background: "transparent" }}>
                    <Pie data={paymentData} cx={70} cy={70} innerRadius={42} outerRadius={66} paddingAngle={4} dataKey="count" isAnimationActive stroke="none">
                      {paymentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 700, marginBottom: 2 }}
                      cursor={false}
                      formatter={(v: any, n: any, p: any) => [`${v} orders · ${formatCurrency(p.payload.revenue, currency)}`, p.payload.name]}
                    />
                  </PieChart>
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  {paymentData.map((p, i) => {
                    const total = paymentData.reduce((a, b) => a + b.count, 0);
                    const pct = total > 0 ? ((p.count / total) * 100).toFixed(0) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="font-semibold capitalize">{p.name}</span>
                          </div>
                          <span className="font-bold tabular-nums text-foreground/70">{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground dark:text-white/45">{p.count} transactions · {formatCurrency(p.revenue, currency)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Category Breakdown ── */}
      {categoryData.length > 0 && (
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-pink-500/10 flex items-center justify-center">
              <Tag className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />
            </div>
            <span className="font-semibold text-sm">Revenue by Category</span>
          </div>
          <div className="p-5">
            <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-hide pr-1">
            {(() => {
              const max = Math.max(...categoryData.map(c => c.revenue), 1);
              const totalRev = categoryData.reduce((a, c) => a + c.revenue, 0);
              return categoryData.map((cat, i) => {
                const pct = (cat.revenue / max) * 100;
                const sharePct = totalRev > 0 ? ((cat.revenue / totalRev) * 100).toFixed(0) : 0;
                const color = getCategoryColor(i);
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                        <span className="font-semibold">{cat.name}</span>
                        <span className="text-muted-foreground dark:text-white/55">{cat.orders} {terminology.itemUnit}{cat.orders !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground dark:text-white/50">{sharePct}%</span>
                        <span className="font-bold tabular-nums" style={{ color }}>{formatCurrency(cat.revenue, currency)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Smart Insights ── */}
      {insights.length > 0 && (
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="font-semibold text-sm">Smart Insights</span>
            <span className="ml-auto text-[10px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-lg">{insights.length}</span>
          </div>
          <div className="p-4 grid sm:grid-cols-2 gap-2.5">
            {insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} text={ins.text} color={ins.color} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
