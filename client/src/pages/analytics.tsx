import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, BarChart, Bar, Cell } from "recharts";
import { BarChart3 } from "lucide-react";

export default function Analytics() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();

  if (isLoading) return <div className="p-8 animate-pulse text-center">Loading analytics...</div>;

  // Process data for charts
  const salesByDate = sales.reduce((acc: any, sale) => {
    const date = sale.createdAt ? format(new Date(sale.createdAt), 'MMM dd') : 'Unknown';
    if (!acc[date]) acc[date] = 0;
    acc[date] += parseNumeric(sale.total);
    return acc;
  }, {});

  const trendData = Object.keys(salesByDate).map(date => ({
    date,
    amount: salesByDate[date]
  })).reverse(); // Assuming API returns desc, we want asc for chart

  const totalRev = sales.reduce((acc, sale) => acc + parseNumeric(sale.total), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white shadow-lg shadow-primary/20">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Analytics Overview</h2>
          <p className="text-sm text-muted-foreground">Track your business performance</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-3xl border-none shadow-md bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Lifetime Revenue</p>
            <h3 className="text-4xl font-black text-gradient">{formatCurrency(totalRev, settings?.currency)}</h3>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-md bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Orders</p>
            <h3 className="text-4xl font-black">{sales.length}</h3>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-none shadow-md bg-card">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">Average Order Value</p>
            <h3 className="text-4xl font-black">
              {formatCurrency(sales.length ? totalRev / sales.length : 0, settings?.currency)}
            </h3>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-3xl border border-border/50 shadow-sm overflow-hidden col-span-2">
          <CardHeader className="bg-muted/20 border-b border-border/50">
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: 'hsl(var(--muted-foreground))'}} tickFormatter={(v) => `${settings?.currency || '₱'}${v}`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: number) => [formatCurrency(value, settings?.currency), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
