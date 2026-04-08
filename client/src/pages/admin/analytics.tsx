import { useBranchAnalytics } from "@/hooks/use-admin";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Building2, TrendingUp, ShoppingBag, ArrowUpRight, ArrowDownRight,
  Minus, BarChart3, CreditCard, Lightbulb, Package,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* ── Animated Counter ─────────────────────────────── */
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

/* ── Growth Badge ─────────────────────────────────── */
function GrowthBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  if (pct === 0) return <span className="text-[10px] text-muted-foreground/50 mt-1 flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" /> No change</span>;
  return (
    <span className={cn("text-[10px] font-semibold mt-1 flex items-center gap-0.5", up ? "text-emerald-500" : "text-rose-500")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% today vs avg
    </span>
  );
}

/* ── Insight Card ─────────────────────────────────── */
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

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#0ea5e9", "#ef4444", "#f43f5e", "#14b8a6", "#f97316", "#84cc16"];

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

/* ── Toggle Group ─────────────────────────────────── */
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

type BranchMetric = "revenue" | "orders";

export default function AdminAnalytics() {
  const { data: analyticsData = [], isLoading } = useBranchAnalytics();
  const { data: settings } = useSettings();
  const currency = (settings as any)?.currency || "₱";

  const [branchMetric, setBranchMetric] = useState<BranchMetric>("revenue");

  const fmt = (n: number) => formatCurrency(n, currency);

  const totalRevenue = analyticsData.reduce((s, a) => s + a.totalRevenue, 0);
  const totalOrders = analyticsData.reduce((s, a) => s + a.totalOrders, 0);
  const todayRevenue = analyticsData.reduce((s, a) => s + a.todayRevenue, 0);
  const todayOrders = analyticsData.reduce((s, a) => s + a.todayOrders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const activeBranches = analyticsData.filter(a => a.branch.isActive).length;

  const todayRevPct = totalRevenue > 0 && analyticsData.length > 0
    ? ((todayRevenue / analyticsData.length) / (totalRevenue / Math.max(analyticsData.reduce((s, a) => s + (a.totalOrders > 0 ? 1 : 0), 0), 1))) * 100 - 100
    : 0;

  /* Bar chart data */
  const barData = analyticsData.map((a, i) => ({
    name: a.branch.name.length > 12 ? a.branch.name.slice(0, 12) + "…" : a.branch.name,
    fullName: a.branch.name,
    revenue: a.totalRevenue,
    orders: a.totalOrders,
    todayRevenue: a.todayRevenue,
    todayOrders: a.todayOrders,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  /* Pie chart data */
  const pieData = analyticsData
    .filter(a => a.totalRevenue > 0)
    .map((a, i) => ({
      name: a.branch.name,
      value: branchMetric === "revenue" ? a.totalRevenue : a.totalOrders,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  /* Top branch */
  const topBranch = analyticsData.length > 0
    ? analyticsData.reduce((a, b) => b.totalRevenue > a.totalRevenue ? b : a, analyticsData[0])
    : null;
  const topToday = analyticsData.length > 0
    ? analyticsData.reduce((a, b) => b.todayRevenue > a.todayRevenue ? b : a, analyticsData[0])
    : null;

  /* Smart insights */
  const insights: { icon: any; text: string; color: string }[] = [];
  if (topBranch && topBranch.totalRevenue > 0) {
    const pct = totalRevenue > 0 ? ((topBranch.totalRevenue / totalRevenue) * 100).toFixed(1) : "0";
    insights.push({
      icon: TrendingUp,
      text: `"${topBranch.branch.name}" is your top-performing branch, generating ${fmt(topBranch.totalRevenue)} — ${pct}% of all-time revenue.`,
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    });
  }
  if (topToday && topToday.todayRevenue > 0) {
    insights.push({
      icon: BarChart3,
      text: `Today's best branch is "${topToday.branch.name}" with ${fmt(topToday.todayRevenue)} in revenue and ${topToday.todayOrders} order${topToday.todayOrders !== 1 ? "s" : ""}.`,
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    });
  }
  if (analyticsData.length > 1) {
    const inactive = analyticsData.filter(a => !a.branch.isActive).length;
    if (inactive > 0) {
      insights.push({
        icon: Building2,
        text: `${inactive} branch${inactive !== 1 ? "es are" : " is"} currently inactive. Activate them to start recording sales.`,
        color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      });
    }
  }
  if (avgOrderValue > 0) {
    insights.push({
      icon: Package,
      text: `Your average order value across all branches is ${fmt(avgOrderValue)} from ${totalOrders.toLocaleString()} total transaction${totalOrders !== 1 ? "s" : ""}.`,
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="flex justify-between items-center">
          <div className="h-10 w-48 skeleton-shimmer rounded-2xl" />
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

  const yFmt = (v: number) => branchMetric === "revenue"
    ? `${currency}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
    : String(v);

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">Analytics</h2>
          <p className="text-xs text-muted-foreground font-medium">Cross-branch performance overview</p>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 stagger-children">
        {[
          {
            label: "Total Revenue",
            value: totalRevenue,
            prefix: currency,
            icon: TrendingUp,
            color: "text-violet-600 dark:text-violet-400",
            glow: "from-violet-500/10",
            sub: `${analyticsData.length} branch${analyticsData.length !== 1 ? "es" : ""}`,
            decimals: 2,
          },
          {
            label: "Total Orders",
            value: totalOrders,
            prefix: "",
            icon: ShoppingBag,
            color: "text-pink-600 dark:text-pink-400",
            glow: "from-pink-500/10",
            sub: `avg ${fmt(avgOrderValue)} / order`,
            decimals: 0,
          },
          {
            label: "Today's Revenue",
            value: todayRevenue,
            prefix: currency,
            icon: CreditCard,
            color: "text-emerald-600 dark:text-emerald-400",
            glow: "from-emerald-500/10",
            sub: `${todayOrders} order${todayOrders !== 1 ? "s" : ""} today`,
            decimals: 2,
          },
          {
            label: "Active Branches",
            value: activeBranches,
            prefix: "",
            icon: Building2,
            color: "text-amber-600 dark:text-amber-400",
            glow: "from-amber-500/10",
            sub: `of ${analyticsData.length} total`,
            decimals: 0,
          },
        ].map((card, i) => (
          <div key={i} className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${card.glow} to-transparent relative overflow-hidden animate-fade-scale card-press`}>
            <div className="absolute top-2.5 right-2.5 opacity-[0.07]">
              <card.icon className="h-10 w-10" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-2xl font-black tabular-nums leading-none ${card.color}`}>
              <Counter value={card.value} prefix={card.prefix} decimals={card.decimals} />
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Branch Comparison Bar Chart ── */}
      {analyticsData.length > 0 && (
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="font-semibold text-sm">Branch Comparison</span>
            <div className="ml-auto">
              <ToggleGroup
                value={branchMetric}
                onChange={(v) => setBranchMetric(v as BranchMetric)}
                options={[{ value: "revenue", label: "Revenue" }, { value: "orders", label: "Orders" }]}
              />
            </div>
          </div>
          <div className="p-4 md:p-6">
            {barData.every(d => (branchMetric === "revenue" ? d.revenue : d.orders) === 0) ? (
              <div className="h-52 flex flex-col items-center justify-center text-muted-foreground/60 gap-2">
                <BarChart3 className="h-10 w-10" strokeWidth={1.2} />
                <p className="text-sm">No data available yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={yFmt} width={56} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    labelFormatter={(_, p) => p[0]?.payload?.fullName || ""}
                    formatter={(v: any) => [branchMetric === "revenue" ? fmt(Number(v)) : `${v} orders`]}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                  />
                  <Bar dataKey={branchMetric} radius={[6, 6, 0, 0]} isAnimationActive maxBarSize={60}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Pie Chart + Today Breakdown ── */}
      {analyticsData.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">

          {/* Revenue Distribution Pie */}
          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <CreditCard className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="font-semibold text-sm">
                {branchMetric === "revenue" ? "Revenue" : "Orders"} Share
              </span>
            </div>
            <div className="p-5">
              {pieData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground/60 text-sm">No data yet</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="shrink-0">
                    <PieChart width={150} height={150}>
                      <Pie data={pieData} cx={70} cy={70} innerRadius={42} outerRadius={66} paddingAngle={4} dataKey="value" isAnimationActive stroke="none">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                        cursor={false}
                        formatter={(v: any, _n: any, p: any) => [
                          branchMetric === "revenue" ? fmt(Number(v)) : `${v} orders`,
                          p.payload.name,
                        ]}
                      />
                    </PieChart>
                  </div>
                  <div className="flex flex-col gap-3 flex-1 w-full">
                    {pieData.map((p, i) => {
                      const total = pieData.reduce((a, b) => a + b.value, 0);
                      const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                              <span className="font-semibold truncate max-w-[120px]">{p.name}</span>
                            </div>
                            <span className="font-bold tabular-nums text-foreground/70 shrink-0">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: p.color }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground dark:text-white/45">
                            {branchMetric === "revenue" ? fmt(p.value) : `${p.value} orders`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Today's Branch Performance */}
          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
              <div className="h-7 w-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="font-semibold text-sm">Today's Performance</span>
            </div>
            <div className="p-5">
              {analyticsData.every(a => a.todayRevenue === 0 && a.todayOrders === 0) ? (
                <div className="h-40 flex flex-col items-center justify-center text-muted-foreground/60 gap-2">
                  <TrendingUp className="h-8 w-8" strokeWidth={1.2} />
                  <p className="text-sm">No sales recorded today</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[260px] overflow-y-auto scrollbar-hide pr-1">
                  {(() => {
                    const sorted = [...analyticsData].sort((a, b) => b.todayRevenue - a.todayRevenue);
                    const max = Math.max(...sorted.map(a => a.todayRevenue), 1);
                    return sorted.map((a, i) => {
                      const pct = (a.todayRevenue / max) * 100;
                      const color = CHART_COLORS[analyticsData.indexOf(a) % CHART_COLORS.length];
                      return (
                        <div key={a.branch.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0" style={{ background: color + "30", color }}>
                                {i + 1}
                              </span>
                              <span className="font-semibold truncate">{a.branch.name}</span>
                            </div>
                            <span className="font-bold tabular-nums shrink-0" style={{ color }}>{fmt(a.todayRevenue)}</span>
                          </div>
                          <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground dark:text-white/55 text-right">
                            {a.todayOrders} order{a.todayOrders !== 1 ? "s" : ""} today
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Branch Cards ── */}
      {analyticsData.length === 0 ? (
        <div className="glass-card rounded-3xl p-16 flex flex-col items-center justify-center text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/20 mb-4" strokeWidth={1.2} />
          <p className="font-semibold text-muted-foreground">No branch data available</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Create branches and start recording sales to see analytics</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-7 w-7 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-semibold text-sm">Branch Details</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {analyticsData.map(({ branch, totalRevenue: br, totalOrders: bo, todayRevenue: tr, todayOrders: to }, idx) => {
              const color = CHART_COLORS[idx % CHART_COLORS.length];
              const avgOrder = bo > 0 ? br / bo : 0;
              const todayShare = br > 0 ? ((tr / br) * 100).toFixed(1) : "0";
              return (
                <div key={branch.id} data-testid={`card-analytics-${branch.id}`} className="glass-card rounded-2xl overflow-hidden">
                  <div className="px-4 pt-4 pb-3 border-b border-border/20 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + "20" }}>
                      <Building2 className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{branch.name}</p>
                      {branch.address && <p className="text-[10px] text-muted-foreground truncate">{branch.address}</p>}
                    </div>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                      branch.isActive
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-secondary text-muted-foreground"
                    )}>
                      {branch.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-secondary/40 dark:bg-white/[0.03] border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">All-Time Revenue</p>
                      <p className="text-base font-black mt-1 tabular-nums" data-testid={`text-revenue-${branch.id}`} style={{ color }}>{fmt(br)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{bo} order{bo !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/40 dark:bg-white/[0.03] border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Today</p>
                      <p className="text-base font-black mt-1 tabular-nums" style={{ color }}>{fmt(tr)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{to} order{to !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/40 dark:bg-white/[0.03] border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Avg. Order</p>
                      <p className="text-base font-black mt-1 tabular-nums">{fmt(avgOrder)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">per transaction</p>
                    </div>
                    <div className="p-3 rounded-xl bg-secondary/40 dark:bg-white/[0.03] border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Today's Share</p>
                      <p className="text-base font-black mt-1 tabular-nums">{todayShare}%</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">of all-time revenue</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Smart Insights ── */}
      {insights.length > 0 && (
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Lightbulb className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <span className="font-semibold text-sm">Smart Insights</span>
          </div>
          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} text={ins.text} color={ins.color} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
