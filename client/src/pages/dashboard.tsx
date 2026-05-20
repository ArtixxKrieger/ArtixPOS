import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/use-settings";
import { useProducts } from "@/hooks/use-products";
import { getBusinessFeatures } from "@/lib/business-features";
import { useBranchBusiness } from "@/hooks/use-branch-business";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, ArrowUpRight, Trophy, BarChart3, ArrowRight, AlertTriangle, Package, PieChart, Clock3, Percent, ShoppingCart } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { SaleDetailModal } from "@/components/sale-detail-modal";
import { useQuery } from "@tanstack/react-query";
import { nativeFetch } from "@/lib/queryClient";
import { useDashboardSse } from "@/hooks/use-dashboard-sse";

type DashboardStats = {
  todaySales: any[];
  allTime: {
    orderCount: number;
    gross: number;
    net: number;
    refundTotal: number;
  };
};

function Counter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    let start = 0;
    const timer = setInterval(() => {
      start += Math.max(1, value / 20);
      if (start >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(start);
    }, 20);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <>
      {prefix}
      {display.toLocaleString(undefined, {
        minimumFractionDigits: value % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: 2,
      })}
    </>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  // Subscribe to real-time sale events — invalidates stats the instant a sale lands
  useDashboardSse();
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    queryFn: async () => {
      const res = await nativeFetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: settings } = useSettings();
  const { data: products = [] } = useProducts();
  const [, setLocation] = useLocation();
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const { businessType: branchBusinessType, businessSubType: branchBusinessSubType } = useBranchBusiness();
  const { terminology } = getBusinessFeatures(branchBusinessType, branchBusinessSubType);

  const lowStockProducts = useMemo(() => {
    return products.filter(p =>
      p.trackStock &&
      typeof p.stock === "number" &&
      typeof p.lowStockThreshold === "number" &&
      p.stock <= p.lowStockThreshold
    );
  }, [products]);

  const todaySales = stats?.todaySales ?? [];
  const allTime = stats?.allTime ?? { orderCount: 0, gross: 0, net: 0, refundTotal: 0 };

  const todayRefundedSales = todaySales.filter((s: any) => !!(s as any).refundedAt);
  const todayRefundTotal = todayRefundedSales.reduce((acc: number, s: any) => acc + parseNumeric(s.total), 0);
  const todayRefundCount = todayRefundedSales.length;

  const totalGrossRevenue = todaySales.reduce((acc: number, s: any) => acc + parseNumeric(s.total), 0);
  const totalRevenue = totalGrossRevenue - todayRefundTotal;
  const totalTax = todaySales.reduce((acc: number, s: any) => acc + parseNumeric(s.tax), 0);
  const avgOrder = todaySales.length ? totalGrossRevenue / todaySales.length : 0;

  const paymentBreakdown = useMemo(() => {
    const counts: Record<string, { count: number; revenue: number }> = {};
    for (const sale of todaySales) {
      const method = ((sale as any).paymentMethod || "cash").toLowerCase();
      if (!counts[method]) counts[method] = { count: 0, revenue: 0 };
      counts[method].count += 1;
      counts[method].revenue += parseNumeric((sale as any).total);
    }
    return Object.entries(counts)
      .map(([method, value]) => ({ method, ...value }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [todaySales]);

  const bestSeller = useMemo(() => {
    const counts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const sale of todaySales) {
      const items = ((sale as any).items as any[]) || [];
      for (const item of items) {
        const name = item.product?.name || item.name || item.title || "Unknown";
        if (name === "Unknown") continue;
        if (!counts[name]) counts[name] = { name, qty: 0, revenue: 0 };
        counts[name].qty += item.quantity ?? 1;
        const price = parseNumeric(item.size?.price ?? item.product?.price ?? item.price ?? 0);
        const mods = (item.modifiers ?? []).reduce((s: number, m: any) => s + parseNumeric(m.price), 0);
        counts[name].revenue += (price + mods) * (item.quantity ?? 1);
      }
    }
    const sorted = Object.values(counts).sort((a, b) => b.qty - a.qty);
    return sorted[0] ?? null;
  }, [todaySales]);

  const currency = (settings as any)?.currency || "₱";
  const daySummary = {
    gross: totalGrossRevenue,
    net: totalRevenue,
    tax: totalTax,
    refunds: todayRefundTotal,
    orders: todaySales.length,
  };
  const reportHighlights = [
    { label: t("dashboard.netRevenue"), value: formatCurrency(totalRevenue, currency), icon: ShoppingCart },
    { label: t("dashboard.refunds"), value: formatCurrency(todayRefundTotal, currency), icon: Percent },
    { label: t("dashboard.peakHour"), value: todaySales.length ? `${bestSeller ? bestSeller.qty : 0} ${t("dashboard.sold")}` : t("dashboard.noSalesToday"), icon: Clock3 },
    { label: t("dashboard.payments"), value: paymentBreakdown.length ? paymentBreakdown[0].method : t("dashboard.noPaymentData"), icon: PieChart },
  ];

  const CurrencyIcon = ({ className }: { className?: string }) => (
    <span className="font-black text-sm leading-none flex items-center justify-center w-4 h-4 shrink-0">
      {currency}
    </span>
  );

  return (
    <div className="space-y-4 page-enter">

      {/* Hero Card */}
      <div className="glass-card rounded-3xl p-5 md:p-8 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent border-blue-500/20 dark:border-blue-500/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -z-10" />

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">{t("dashboard.todayRevenue")}</p>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
            <Counter value={totalRevenue} prefix={currency} />
          </span>
          <ArrowUpRight className="h-5 w-5 text-emerald-500 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {todaySales.length} {todaySales.length === 1 ? terminology.orderLabel : `${terminology.orderLabel}s`} {t("dashboard.completedToday")}
          </p>
          {todayRefundCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full max-w-[220px]">
              <span className="truncate">-{formatCurrency(todayRefundTotal, currency)} refunded ({todayRefundCount})</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/[0.04] dark:bg-white/[0.06] rounded-2xl p-3.5 border border-black/[0.07] dark:border-white/[0.08]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("dashboard.avgOrder")}</p>
            <p className="text-xl font-bold tabular-nums">
              <Counter value={avgOrder} prefix={currency} />
            </p>
          </div>
          <div className="bg-black/[0.04] dark:bg-white/[0.06] rounded-2xl p-3.5 border border-black/[0.07] dark:border-white/[0.08]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("dashboard.taxCollected")}</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              <Counter value={totalTax} prefix={currency} />
            </p>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger-children">
        {[
          { label: t("dashboard.totalSales"), display: todaySales.length.toString(), icon: CreditCard, color: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10", glow: "from-emerald-500/8" },
          { label: t("dashboard.netRevenue"), display: totalRevenue > 0 ? `${currency}${totalRevenue.toFixed(0)}` : `${currency}0`, icon: CurrencyIcon, color: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-500/10", glow: "from-blue-500/8" },
          { label: t("dashboard.avgOrder"), display: avgOrder > 0 ? `${currency}${avgOrder.toFixed(0)}` : `${currency}0`, icon: TrendingUp, color: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-500/10", glow: "from-amber-500/8" },
          { label: t("dashboard.taxCollected"), display: totalTax > 0 ? `${currency}${totalTax.toFixed(0)}` : `${currency}0`, icon: Receipt, color: "text-purple-600 dark:text-purple-400", iconBg: "bg-purple-500/10", glow: "from-purple-500/8" },
        ].map((card, i) => (
          <div key={i} className={`glass-card glow-hover-card rounded-2xl p-4 bg-gradient-to-br ${card.glow} to-transparent animate-fade-scale card-press`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`h-8 w-8 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{card.label}</p>
            <p className={`text-xl font-bold tabular-nums truncate ${card.color}`} title={card.display}>{card.display}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">{t("dashboard.dayEndSummary")}</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("dashboard.grossSales")}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(daySummary.gross, currency)}</p>
          </div>
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("dashboard.netSales")}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(daySummary.net, currency)}</p>
          </div>
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("dashboard.vatCollected")}</p>
            <p className="text-sm font-bold tabular-nums">{formatCurrency(daySummary.tax, currency)}</p>
          </div>
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("dashboard.refunds")}</p>
            <p className="text-sm font-bold tabular-nums">-{formatCurrency(daySummary.refunds, currency)}</p>
          </div>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <div className="px-4 py-3 border-b border-amber-500/15 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">{t("dashboard.lowStockAlert")}</p>
            <span className="ml-auto text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
              {lowStockProducts.length} item{lowStockProducts.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setLocation("/products")}
              className="text-xs text-amber-600 dark:text-amber-400 font-medium hover:opacity-70 flex items-center gap-1"
            >
              {t("common.manage")} <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-amber-500/10">
            {lowStockProducts.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku ? `SKU: ${p.sku} · ` : ""}{t("dashboard.threshold")}: {p.lowStockThreshold}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={["text-lg font-black tabular-nums", (p.stock ?? 0) === 0 ? "text-rose-500" : "text-amber-600 dark:text-amber-400"].join(" ")}>
                    {p.stock ?? 0}
                  </p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{t("common.inStock")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Seller + All-Time Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Best Seller Today */}
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-violet-500/8 to-transparent animate-fade-scale">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-7 w-7 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Trophy className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{terminology.bestSellerLabel}</p>
          </div>
          {bestSeller ? (
            <>
              <p className="font-bold text-sm leading-tight line-clamp-1">{bestSeller.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {bestSeller.qty} {terminology.itemUnit}{bestSeller.qty !== 1 ? "s" : ""} · <span className="text-primary font-semibold tabular-nums">{formatCurrency(bestSeller.revenue, currency)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">No sales yet today</p>
          )}
        </div>

        {/* All-Time Total — server-computed, no row-count limit */}
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/8 to-transparent animate-fade-scale">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.allTimePerformance")}</p>
          </div>
          <p className="font-bold text-sm tabular-nums">{formatCurrency(allTime.net, currency)}</p>
          <p className="text-xs text-muted-foreground mt-1">{allTime.orderCount} {allTime.orderCount === 1 ? terminology.orderLabel : `${terminology.orderLabel}s`} total</p>
          {allTime.refundTotal > 0 && (
            <p className="text-[10px] text-rose-500 mt-0.5">-{formatCurrency(allTime.refundTotal, currency)} refunded</p>
          )}
        </div>
      </div>

      {/* Quick Report */}
      <div className="glass-card rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">{t("dashboard.topProducts")}</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {reportHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-border/30 bg-secondary/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{item.label}</p>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold tabular-nums">{item.value}</p>
              </div>
            );
          })}
        </div>
        {paymentBreakdown.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment mix today</p>
            <div className="grid gap-2">
              {paymentBreakdown.map((p) => (
                <div key={p.method} className="flex items-center justify-between rounded-xl border border-border/30 px-3 py-2">
                  <span className="text-sm font-medium capitalize">{p.method}</span>
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(p.revenue, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      {todaySales.length > 0 ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-2.5 bg-white/30 dark:bg-black/20">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">{t("dashboard.viewTransactions")}</h3>
            <span className="ml-auto text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
              {todaySales.length}
            </span>
            <button
              onClick={() => setLocation("/transactions")}
              className="flex items-center gap-1 text-xs text-primary font-medium hover:opacity-75 transition-opacity ml-2"
            >
              {t("common.viewAll")}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto scrollbar-hide">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white/60 dark:bg-black/50 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-black/5 dark:border-white/5">
                  <TableHead className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</TableHead>
                  <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Method</TableHead>
                  <TableHead className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...todaySales].reverse().map((sale: any) => {
                  const items = (sale.items as any[]) || [];
                  const itemsSummary = items.length === 1
                    ? (items[0]?.product?.name || items[0]?.name || items[0]?.title || "1 item")
                    : `${items.length} items`;
                  return (
                    <TableRow
                      key={sale.id}
                      className="hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors border-black/4 dark:border-white/4 cursor-pointer"
                      onClick={() => setSelectedSale(sale)}
                    >
                      <TableCell className="px-5 py-3.5 text-sm text-muted-foreground font-medium">
                        {format(new Date(sale.createdAt!), "h:mm a")}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm text-foreground/70 max-w-[100px]">
                        <span className="truncate block">{itemsSummary}</span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={[
                          "px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize",
                          sale.paymentMethod === "cash"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        ].join(" ")}>
                          {sale.paymentMethod ? sale.paymentMethod.charAt(0).toUpperCase() + sale.paymentMethod.slice(1) : "Cash"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold px-5 py-3.5 text-primary tabular-nums">
                        {formatCurrency(sale.total, settings?.currency ?? undefined)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl py-16 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Receipt className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-semibold">{t("dashboard.noSalesToday")}</p>
          <p className="text-sm text-muted-foreground/70">{t("dashboard.goToPOS")}</p>
        </div>
      )}

      <SaleDetailModal
        sale={selectedSale}
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
}
