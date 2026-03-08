import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { BarChart3, TrendingUp, Clock, Star } from "lucide-react";

export default function Analytics() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading analytics...</div>;

  const grouped: Record<string, number> = {};
  const hourly: Record<number, number> = {};
  const payment: Record<string, number> = {};
  const products: Record<string, number> = {};

  sales.forEach((sale: any) => {
    const date = format(new Date(sale.createdAt), "yyyy-MM-dd");
    if (!grouped[date]) grouped[date] = 0;
    grouped[date] += parseNumeric(sale.total);

    const hour = new Date(sale.createdAt).getHours();
    if (!hourly[hour]) hourly[hour] = 0;
    hourly[hour]++;

    if (!payment[sale.paymentMethod]) payment[sale.paymentMethod] = 0;
    payment[sale.paymentMethod]++;

    if (sale.items) {
      sale.items.forEach((i: any) => {
        if (!products[i.product?.name]) products[i.product?.name] = 0;
        products[i.product?.name] += i.quantity || 1;
      });
    }
  });

  const trendData = Object.entries(grouped)
    .map(([date, amount]) => ({
      date,
      label: format(new Date(date), "MMM d"),
      amount
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hourlyData = Object.entries(hourly).map(([h, v]) => ({
    hour: `${h}:00`,
    sales: v
  }));

  const paymentData = Object.entries(payment).map(([method, value]) => ({
    name: method,
    value
  }));

  const productData = Object.entries(products)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const totalRevenue = trendData.reduce((a, b) => a + b.amount, 0);

  const bestHour = hourlyData.reduce(
    (a, b) => (b.sales > (a?.sales || 0) ? b : a),
    hourlyData[0]
  );

  const growth =
    trendData.length > 1
      ? ((trendData[trendData.length - 1].amount - trendData[0].amount) /
          trendData[0].amount) *
        100
      : 0;

  const COLORS = [
    "hsl(var(--primary))",
    "#8b5cf6",
    "#22c55e",
    "#f59e0b",
    "#ef4444"
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      <div className="flex items-center gap-3 mb-8">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white shadow-lg">
          <BarChart3 className="h-6 w-6"/>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Analytics Overview</h2>
          <p className="text-sm text-muted-foreground">Business performance insights</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Lifetime Revenue</p>
            <h3 className="text-3xl font-black">
              {formatCurrency(totalRevenue, settings?.currency)}
            </h3>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Orders</p>
            <h3 className="text-3xl font-black">{sales.length}</h3>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4"/>
              Growth
            </p>
            <h3 className="text-3xl font-black">{growth.toFixed(1)}%</h3>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4"/>
              Peak Hour
            </p>
            <h3 className="text-3xl font-black">{bestHour?.hour}</h3>
          </CardContent>
        </Card>

      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardHeader>
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" opacity={0.2}/>

                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={40}
                />

                <YAxis
                  tickFormatter={(v)=>`${settings?.currency || "₱"}${v}`}
                />

                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "10px"
                  }}
                  formatter={(value:number)=>[
                    formatCurrency(value, settings?.currency),
                    "Revenue"
                  ]}
                />

                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  fill="url(#rev)"
                />

              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">

        <Card className="rounded-3xl shadow-sm">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={productData}>
                <XAxis dataKey="name"/>
                <YAxis/>
                <RechartsTooltip
                  contentStyle={{
                    background:"hsl(var(--background))",
                    border:"1px solid hsl(var(--border))"
                  }}
                />
                <Bar dataKey="qty" fill="hsl(var(--primary))"/>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]}/>
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    background:"hsl(var(--background))",
                    border:"1px solid hsl(var(--border))"
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      <Card className="rounded-3xl shadow-sm">
        <CardHeader>
          <CardTitle>Hourly Sales Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourlyData}>
              <XAxis dataKey="hour"/>
              <YAxis/>
              <RechartsTooltip
                contentStyle={{
                  background:"hsl(var(--background))",
                  border:"1px solid hsl(var(--border))"
                }}
              />
              <Bar dataKey="sales" fill="hsl(var(--primary))"/>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

    </div>
  );
}