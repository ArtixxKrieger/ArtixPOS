import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, ArrowUpRight, Trophy, BarChart3 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

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
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();

  const todaySales = sales.filter(s => isToday(new Date(s.createdAt!)));
  const totalRevenue = todaySales.reduce((acc, s) => acc + parseNumeric(s.total), 0);
  const totalTax = todaySales.reduce((acc, s) => acc + parseNumeric(s.tax), 0);
  const avgOrder = todaySales.length ? totalRevenue / todaySales.length : 0;

  const allTimeRevenue = sales.reduce((acc, s) => acc + parseNumeric(s.total), 0);
  const allTimeCount = sales.length;

  const bestSeller = useMemo(() => {
    const counts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const sale of todaySales) {
      const items = (sale.items as any[]) || [];
      for (const item of items) {
        const name = item.product?.name || "Unknown";
        if (!counts[name]) counts[name] = { name, qty: 0, revenue: 0 };
        counts[name].qty += item.quantity ?? 1;
        const price = parseNumeric(item.size?.price ?? item.product?.price ?? 0);
        const mods = (item.modifiers ?? []).reduce((s: number, m: any) => s + parseNumeric(m.price), 0);
        counts[name].revenue += (price + mods) * (item.quantity ?? 1);
      }
    }
    const sorted = Object.values(counts).sort((a, b) => b.qty - a.qty);
    return sorted[0] ?? null;
  }, [todaySales]);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="h-36 skeleton-shimmer rounded-3xl" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 skeleton-shimmer rounded-2xl" />)}
        </div>
        <div className="grid gap-3 grid-cols-2">
          {[1, 2].map(i => <div key={i} className="h-20 skeleton-shimmer rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const currency = (settings as any)?.currency || "₱";

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

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Today's Revenue</p>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
            <Counter value={totalRevenue} prefix={currency} />
          </span>
          <ArrowUpRight className="h-5 w-5 text-emerald-500 flex-shrink-0" />
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {todaySales.length} {todaySales.length === 1 ? "order" : "orders"} completed today
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/40 dark:bg-white/[0.05] rounded-2xl p-3.5 border border-white/60 dark:border-white/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Avg Order</p>
            <p className="text-xl font-bold tabular-nums">
              <Counter value={avgOrder} prefix={currency} />
            </p>
          </div>
          <div className="bg-white/40 dark:bg-white/[0.05] rounded-2xl p-3.5 border border-white/60 dark:border-white/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tax Collected</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              <Counter value={totalTax} prefix={currency} />
            </p>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 stagger-children">
        {[
          { label: "Total Sales", display: todaySales.length.toString(), icon: CreditCard, color: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10", glow: "from-emerald-500/8" },
          { label: "Revenue", display: totalRevenue > 0 ? `${currency}${totalRevenue.toFixed(0)}` : `${currency}0`, icon: CurrencyIcon, color: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-500/10", glow: "from-blue-500/8" },
          { label: "Avg Order", display: avgOrder > 0 ? `${currency}${avgOrder.toFixed(0)}` : `${currency}0`, icon: TrendingUp, color: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-500/10", glow: "from-amber-500/8" },
          { label: "Tax Paid", display: totalTax > 0 ? `${currency}${totalTax.toFixed(0)}` : `${currency}0`, icon: Receipt, color: "text-purple-600 dark:text-purple-400", iconBg: "bg-purple-500/10", glow: "from-purple-500/8" },
        ].map((card, i) => (
          <div key={i} className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${card.glow} to-transparent transition-all duration-300 animate-fade-scale card-press`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`h-8 w-8 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{card.label}</p>
            <p className={`text-xl font-bold tabular-nums ${card.color}`}>{card.display}</p>
          </div>
        ))}
      </div>

      {/* Best Seller + All-Time Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Best Seller Today */}
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-violet-500/8 to-transparent animate-fade-scale">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-7 w-7 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Trophy className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Best Seller</p>
          </div>
          {bestSeller ? (
            <>
              <p className="font-bold text-sm leading-tight line-clamp-1">{bestSeller.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {bestSeller.qty} sold · <span className="text-primary font-semibold tabular-nums">{formatCurrency(bestSeller.revenue, currency)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground/40 italic">No sales yet today</p>
          )}
        </div>

        {/* All-Time Total */}
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/8 to-transparent animate-fade-scale">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">All-Time</p>
          </div>
          <p className="font-bold text-sm tabular-nums">{formatCurrency(allTimeRevenue, currency)}</p>
          <p className="text-xs text-muted-foreground mt-1">{allTimeCount} total {allTimeCount === 1 ? "sale" : "sales"}</p>
        </div>
      </div>

      {/* Transactions Table */}
      {todaySales.length > 0 ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-2.5 bg-white/30 dark:bg-black/20">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-3.5 w-3.5 text-primary" />
            </div>
            <h3 className="font-semibold text-sm">Today's Transactions</h3>
            <span className="ml-auto text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
              {todaySales.length}
            </span>
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
                {[...todaySales].reverse().map((sale) => {
                  const items = (sale.items as any[]) || [];
                  const itemsSummary = items.length === 1
                    ? items[0]?.product?.name || "1 item"
                    : `${items.length} items`;
                  return (
                    <TableRow key={sale.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border-black/4 dark:border-white/4">
                      <TableCell className="px-5 py-3.5 text-sm text-muted-foreground font-medium">
                        {format(new Date(sale.createdAt!), "h:mm a")}
                      </TableCell>
                      <TableCell className="py-3.5 text-sm text-foreground/70 max-w-[100px]">
                        <span className="truncate block">{itemsSummary}</span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={[
                          "px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize",
                          sale.paymentMethod === "online"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        ].join(" ")}>
                          {sale.paymentMethod === "online" ? "Online" : "Cash"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold px-5 py-3.5 text-primary tabular-nums">
                        {formatCurrency(sale.total, settings?.currency)}
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
          <p className="text-foreground font-semibold">No sales today yet</p>
          <p className="text-sm text-muted-foreground/70">Head to the POS tab to start taking orders</p>
        </div>
      )}
    </div>
  );
}
