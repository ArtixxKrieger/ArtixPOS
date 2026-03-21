import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, DollarSign } from "lucide-react";
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

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
        </div>
        <div className="h-80 bg-muted rounded-2xl" />
      </div>
    );
  }

  const stats = [
    {
      label: "Revenue",
      value: totalRevenue,
      prefix: settings?.currency || "₱",
      sub: `${todaySales.length} orders today`,
      icon: DollarSign,
      accent: "bg-blue-500",
      glow: "shadow-blue-500/20",
    },
    {
      label: "Avg. Order",
      value: todaySales.length ? totalRevenue / todaySales.length : 0,
      prefix: settings?.currency || "₱",
      sub: "Per sale",
      icon: TrendingUp,
      accent: "bg-violet-500",
      glow: "shadow-violet-500/20",
    },
    {
      label: "Tax",
      value: totalTax,
      prefix: settings?.currency || "₱",
      sub: "Collected today",
      icon: Receipt,
      accent: "bg-amber-500",
      glow: "shadow-amber-500/20",
    },
    {
      label: "Sales",
      value: todaySales.length,
      prefix: "",
      sub: "Completed",
      icon: CreditCard,
      accent: "bg-emerald-500",
      glow: "shadow-emerald-500/20",
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="glass-card rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                <div className={`h-7 w-7 rounded-lg ${stat.accent} ${stat.glow} shadow-md flex items-center justify-center`}>
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <div>
                <p className="text-xl font-bold tracking-tight">
                  <Counter value={stat.value} prefix={stat.prefix} />
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stat.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Sales Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-black/5 dark:border-white/5 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Recent Sales</h3>
        </div>

        {sales.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center gap-2 text-muted-foreground">
            <Receipt className="h-8 w-8 opacity-20" />
            <p className="text-sm">No sales yet — start selling from POS</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto scrollbar-hide">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white/50 dark:bg-black/30 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-black/5 dark:border-white/5">
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ID</TableHead>
                  <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Time</TableHead>
                  <TableHead className="py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Method</TableHead>
                  <TableHead className="text-right px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.slice(0, 50).map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-black/5 dark:border-white/5">
                    <TableCell className="font-semibold px-5 py-3.5 text-sm text-primary">#{sale.id}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(sale.createdAt!), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-[11px] font-medium capitalize">
                        {sale.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold px-5 py-3.5">
                      {formatCurrency(sale.total, settings?.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
