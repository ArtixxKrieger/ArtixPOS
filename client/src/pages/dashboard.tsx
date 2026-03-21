import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, DollarSign, ArrowUpRight } from "lucide-react";
import { useState, useEffect } from "react";

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

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="h-32 bg-gradient-to-br from-muted to-muted/50 rounded-3xl animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Card — Today's Summary */}
      <div className="glass-card rounded-3xl p-6 md:p-8 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent border-blue-500/20 dark:border-blue-500/10 relative overflow-hidden group">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10 group-hover:bg-blue-500/10 transition-colors duration-500" />
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Revenue */}
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl md:text-5xl font-bold tracking-tight">
                <Counter value={totalRevenue} prefix={settings?.currency || "₱"} />
              </span>
              <ArrowUpRight className="h-5 w-5 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">{todaySales.length} {todaySales.length === 1 ? "order" : "orders"} today</p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/30 dark:bg-white/5 rounded-xl p-3 backdrop-blur-sm border border-white/50 dark:border-white/10">
              <p className="text-xs font-medium text-muted-foreground">Average</p>
              <p className="text-2xl font-bold mt-1">
                <Counter value={avgOrder} prefix={settings?.currency || "₱"} />
              </p>
            </div>
            <div className="bg-white/30 dark:bg-white/5 rounded-xl p-3 backdrop-blur-sm border border-white/50 dark:border-white/10">
              <p className="text-xs font-medium text-muted-foreground">Tax</p>
              <p className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">
                <Counter value={totalTax} prefix={settings?.currency || "₱"} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Sales", value: todaySales.length, icon: CreditCard, color: "text-emerald-600 dark:text-emerald-400", bg: "from-emerald-500/15" },
          { label: "Growth", value: todaySales.length > 0 ? "↑" : "—", icon: TrendingUp, color: "text-blue-600 dark:text-blue-400", bg: "from-blue-500/15" },
          { label: "Avg Order", value: avgOrder > 0 ? `₱${avgOrder.toFixed(0)}` : "₱0", icon: DollarSign, color: "text-amber-600 dark:text-amber-400", bg: "from-amber-500/15" },
          { label: "Tax Paid", value: totalTax > 0 ? `₱${totalTax.toFixed(0)}` : "₱0", icon: Receipt, color: "text-purple-600 dark:text-purple-400", bg: "from-purple-500/15" },
        ].map((card, i) => (
          <div key={i} className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${card.bg} to-transparent border-white/40 dark:border-white/10 hover:border-white/60 dark:hover:border-white/20 transition-all duration-300 group`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{card.label}</p>
                <p className={`text-2xl font-bold mt-2 ${card.color}`}>
                  {typeof card.value === "number" && card.label !== "Growth"
                    ? card.value
                    : card.value}
                </p>
              </div>
              <card.icon className={`h-5 w-5 ${card.color} opacity-50 group-hover:opacity-100 transition-opacity`} />
            </div>
          </div>
        ))}
      </div>

      {/* Recent Sales Table — Improved */}
      {sales.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden border-white/40 dark:border-white/10">
          <div className="px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-3 bg-white/30 dark:bg-black/30 backdrop-blur-sm">
            <Receipt className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Today's Transactions</h3>
            <span className="ml-auto text-sm text-muted-foreground">{todaySales.length} orders</span>
          </div>

          <div className="max-h-[500px] overflow-y-auto scrollbar-hide">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white/40 dark:bg-black/40 backdrop-blur-md">
                <TableRow className="hover:bg-transparent border-black/5 dark:border-white/5">
                  <TableHead className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wider">Time</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Method</TableHead>
                  <TableHead className="text-right px-6 py-3 text-[11px] font-semibold uppercase tracking-wider">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todaySales.reverse().map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-black/3 dark:hover:bg-white/3 transition-colors border-black/4 dark:border-white/4">
                    <TableCell className="px-6 py-3 text-sm text-muted-foreground">
                      {format(new Date(sale.createdAt!), "h:mm a")}
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-[10px] font-medium capitalize border border-border/50">
                        {sale.paymentMethod === "online" ? "Online" : "Cash"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold px-6 py-3 text-primary">
                      {formatCurrency(sale.total, settings?.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {sales.length === 0 && (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <Receipt className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground font-medium">No sales yet today</p>
          <p className="text-sm text-muted-foreground/70">Start creating orders from the POS page</p>
        </div>
      )}
    </div>
  );
}
