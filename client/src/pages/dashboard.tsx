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

                const totalMiliseconds = 1000;
                const incrementTime = (totalMiliseconds / end) * 5;

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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-3xl w-full"></div>
          ))}
        </div>
        <div className="h-96 bg-muted rounded-3xl w-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Welcome back! Here's what's happening today.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-primary to-violet-600 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-20"><DollarSign className="h-12 w-12" /></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-white/80">Today's Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              <Counter value={totalRevenue} prefix={settings?.currency || "₱"} />
            </div>
            <p className="text-xs text-white/70 mt-2">{todaySales.length} orders today</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-pink-500/10 to-transparent overflow-hidden relative border border-border/50">
          <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="h-12 w-12" /></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              <Counter value={todaySales.length ? totalRevenue / todaySales.length : 0} prefix={settings?.currency || "₱"} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Revenue per sale</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-amber-500/10 to-transparent overflow-hidden relative border border-border/50">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Receipt className="h-12 w-12" /></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tax Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              <Counter value={totalTax} prefix={settings?.currency || "₱"} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Today's tax total</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-emerald-500/10 to-transparent overflow-hidden relative border border-border/50">
          <div className="absolute top-0 right-0 p-4 opacity-10"><CreditCard className="h-12 w-12" /></div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              <Counter value={todaySales.length} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Total completed sales</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-none shadow-xl shadow-black/5 overflow-hidden bg-card">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-6 px-8">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Recent Sales
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="p-20 text-center text-muted-foreground flex flex-col items-center">
              <Receipt className="h-16 w-16 mb-4 opacity-10" />
              <p className="text-lg font-medium">No sales recorded yet.</p>
              <p className="text-sm">Start making sales in the POS to see them here.</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto scrollbar-hide">
              <Table>
                <TableHeader className="bg-muted/30 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead className="w-[120px] px-8 py-4 font-semibold text-xs uppercase tracking-wider">ID</TableHead>
                    <TableHead className="py-4 font-semibold text-xs uppercase tracking-wider">Time</TableHead>
                    <TableHead className="py-4 font-semibold text-xs uppercase tracking-wider">Method</TableHead>
                    <TableHead className="text-right px-8 py-4 font-semibold text-xs uppercase tracking-wider">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.slice(0, 50).map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors border-border/50">
                      <TableCell className="font-bold px-8 py-4 text-sm text-primary">#{sale.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{format(new Date(sale.createdAt!), "MMM d, h:mm a")}</TableCell>
                      <TableCell className="capitalize py-4">
                        <span className="px-3 py-1 rounded-full bg-secondary text-foreground text-[10px] font-bold tracking-tight uppercase border border-border/50">
                          {sale.paymentMethod}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-black px-8 py-4 text-base">
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
