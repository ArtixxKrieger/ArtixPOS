import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, CreditCard, DollarSign } from "lucide-react";

export default function Dashboard() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();
  
  const todaySales = sales.filter(s => isToday(new Date(s.createdAt!)));
  
  const totalRevenue = todaySales.reduce((acc, sale) => acc + parseNumeric(sale.total), 0);
  const totalTax = todaySales.reduce((acc, sale) => acc + parseNumeric(sale.tax), 0);
  
  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-32 bg-muted rounded-2xl w-full"></div>
      <div className="h-64 bg-muted rounded-2xl w-full"></div>
    </div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-none shadow-lg shadow-black/5 bg-gradient-to-br from-primary to-primary/80 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-white/80">Today's Revenue</CardTitle>
            <DollarSign className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(totalRevenue, settings?.currency)}</div>
            <p className="text-xs text-white/70 mt-1">{todaySales.length} orders today</p>
          </CardContent>
        </Card>
        
        <Card className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Order</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(todaySales.length ? totalRevenue / todaySales.length : 0, settings?.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tax Collected</CardTitle>
            <Receipt className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totalTax, settings?.currency)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
            <CreditCard className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{todaySales.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-none shadow-lg shadow-black/5 overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <CardTitle>Recent Sales</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <Receipt className="h-12 w-12 mb-4 opacity-20" />
              <p>No sales recorded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px] px-6">ID</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right px-6">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.slice(0, 10).map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium px-6">#{sale.id}</TableCell>
                    <TableCell>{format(new Date(sale.createdAt!), "MMM d, h:mm a")}</TableCell>
                    <TableCell className="capitalize">
                      <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {sale.paymentMethod}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold px-6">
                      {formatCurrency(sale.total, settings?.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
