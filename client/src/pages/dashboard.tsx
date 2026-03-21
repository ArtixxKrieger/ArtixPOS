import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";

function Counter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    const timer = setInterval(() => {
      start += Math.max(1, end / 20);
      if (start >= end) {
        setDisplay(end);
        clearInterval(timer);
      } else {
        setDisplay(start);
      }
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
  const totalRevenue = todaySales.reduce((acc, sale) => acc + parseNumeric(sale.total), 0);
  const totalTax = todaySales.reduce((acc, sale) => acc + parseNumeric(sale.tax), 0);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-xl w-full"></div>
          ))}
        </div>
        <div className="h-96 bg-muted rounded-xl w-full"></div>
      </div>
    );
  }

  const stats = [
    {
      label: "Today's Revenue",
      value: totalRevenue,
      prefix: settings?.currency || "₱",
      sub: `${todaySales.length} orders today`,
      icon: DollarSign,
      highlight: true,
    },
    {
      label: "Avg. Order",
      value: todaySales.length ? totalRevenue / todaySales.length : 0,
      prefix: settings?.currency || "₱",
      sub: "Revenue per sale",
      icon: TrendingUp,
      highlight: false,
    },
    {
      label: "Tax Collected",
      value: totalTax,
      prefix: settings?.currency || "₱",
      sub: "Today's tax total",
      icon: Receipt,
      highlight: false,
    },
    {
      label: "Transactions",
      value: todaySales.length,
      prefix: "",
      sub: "Completed sales",
      icon: CreditCard,
      highlight: false,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          <span className="font-mono text-primary">~/</span> Dashboard
        </h2>
        <p className="text-muted-foreground text-sm font-mono mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className={`rounded-xl border overflow-hidden ${
                stat.highlight
                  ? "bg-primary/10 dark:bg-primary/5 border-primary/30 dark:border-primary/20"
                  : "bg-card border-border/60"
              }`}
            >
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  {stat.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.highlight ? "text-primary" : "text-muted-foreground/40"}`} />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold font-mono ${stat.highlight ? "text-primary dark:text-glow" : ""}`}>
                  <Counter value={stat.value} prefix={stat.prefix} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-xl border border-border/60 overflow-hidden bg-card">
        <CardHeader className="border-b border-border/50 py-4 px-6">
          <CardTitle className="text-sm font-mono flex items-center gap-2 text-muted-foreground">
            <Receipt className="h-4 w-4 text-primary" />
            <span className="text-primary">./</span>recent-sales.log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Receipt className="h-10 w-10 opacity-15" />
              <p className="text-sm font-mono">No sales recorded yet.</p>
              <p className="text-xs opacity-60">Make your first sale in the POS.</p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto scrollbar-hide">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="px-6 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">ID</TableHead>
                    <TableHead className="py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Time</TableHead>
                    <TableHead className="py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Method</TableHead>
                    <TableHead className="text-right px-6 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.slice(0, 50).map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors border-border/40">
                      <TableCell className="font-mono font-bold px-6 py-3 text-sm text-primary">#{sale.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-mono text-muted-foreground">
                        {format(new Date(sale.createdAt!), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="px-2 py-0.5 rounded font-mono bg-secondary text-foreground text-[10px] uppercase tracking-wide border border-border/50">
                          {sale.paymentMethod}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold px-6 py-3 text-primary">
                        {formatCurrency(sale.total, settings?.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
