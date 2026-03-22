import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, startOfDay, endOfDay, subDays, isWithinInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3, TrendingUp, Clock, Calendar as CalendarIcon, DollarSign, ShoppingBag, Package, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function Counter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) { setDisplay(end); return; }
    const step = Math.max(0.01, end / 60);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(start);
    }, 16);
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

export default function Analytics() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const currency = settings?.currency || "₱";

  const stats = useMemo(() => {
    const filteredSales = date
      ? sales.filter((s) =>
        isWithinInterval(new Date(s.createdAt!), {
          start: startOfDay(date),
          end: endOfDay(date),
        }),
      )
      : sales;

    const totalRevenue = filteredSales.reduce((acc, s) => acc + parseNumeric(s.total), 0);
    const totalOrders = filteredSales.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const prevDaySales = sales.filter((s) =>
      isWithinInterval(new Date(s.createdAt!), {
        start: startOfDay(subDays(date || new Date(), 1)),
        end: endOfDay(subDays(date || new Date(), 1)),
      }),
    );
    const prevRevenue = prevDaySales.reduce((acc, s) => acc + parseNumeric(s.total), 0);
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    return { totalRevenue, totalOrders, avgOrderValue, revenueGrowth };
  }, [sales, date]);

  const trendData = useMemo(() => {
    const grouped: Record<string, number> = {};
    sales.forEach((sale: any) => {
      const dateStr = format(new Date(sale.createdAt), "yyyy-MM-dd");
      grouped[dateStr] = (grouped[dateStr] || 0) + parseNumeric(sale.total);
    });
    return Object.entries(grouped)
      .map(([dateStr, amount]) => ({
        date: dateStr,
        label: format(new Date(dateStr), "MMM d"),
        amount,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30);
  }, [sales]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-muted rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-muted rounded-3xl animate-pulse" />
      </div>
    );
  }

  const hourly: Record<number, number> = {};
  const payment: Record<string, number> = {};
  const productCounts: Record<string, number> = {};

  sales.forEach((sale: any) => {
    const hour = new Date(sale.createdAt).getHours();
    hourly[hour] = (hourly[hour] || 0) + 1;
    payment[sale.paymentMethod] = (payment[sale.paymentMethod] || 0) + 1;
    sale.items?.forEach((i: any) => {
      const name = i.product?.name || "Unknown";
      productCounts[name] = (productCounts[name] || 0) + (i.quantity || 1);
    });
  });

  const hourlyData = Object.entries(hourly)
    .map(([h, v]) => ({ hour: `${h}:00`, sales: v }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  const paymentData = Object.entries(payment).map(([method, value]) => ({ name: method, value }));

  const productData = Object.entries(productCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const bestHour = hourlyData.reduce(
    (a, b) => (b.sales > (a?.sales || 0) ? b : a),
    hourlyData[0],
  );

  const COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444"];

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "12px",
    color: "hsl(var(--foreground))",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: "10px 14px",
    fontSize: "13px",
  };

  const kpiCards = [
    {
      label: "Daily Revenue",
      value: stats.totalRevenue,
      isPrefix: true,
      icon: DollarSign,
      color: "text-violet-600 dark:text-violet-400",
      glow: "from-violet-500/10",
      growth: stats.revenueGrowth,
      showGrowth: true,
    },
    {
      label: "Daily Orders",
      value: stats.totalOrders,
      isPrefix: false,
      icon: ShoppingBag,
      color: "text-pink-600 dark:text-pink-400",
      glow: "from-pink-500/10",
      sub: "Processed transactions",
    },
    {
      label: "Avg. Order",
      value: stats.avgOrderValue,
      isPrefix: true,
      icon: TrendingUp,
      color: "text-amber-600 dark:text-amber-400",
      glow: "from-amber-500/10",
      sub: "Revenue per customer",
    },
    {
      label: "Peak Activity",
      valueStr: bestHour?.hour || "N/A",
      icon: Clock,
      color: "text-emerald-600 dark:text-emerald-400",
      glow: "from-emerald-500/10",
      sub: "Highest sales hour",
    },
  ];

  return (
    <div className="space-y-5 page-enter pb-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Analytics</h2>
            <p className="text-xs text-muted-foreground font-medium">Business performance insights</p>
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full sm:w-52 justify-start text-left font-medium rounded-2xl h-10 border-border/50 bg-card shadow-sm hover:bg-secondary/50 text-sm",
                !date && "text-muted-foreground",
              )}
              data-testid="button-date-picker"
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-primary" />
              {date ? format(date, "PP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 rounded-2xl border-none shadow-2xl" align="end">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              className="rounded-2xl"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {kpiCards.map((card, i) => (
          <div
            key={i}
            className={`glass-card rounded-2xl p-4 bg-gradient-to-br ${card.glow} to-transparent relative overflow-hidden`}
          >
            <div className="absolute top-3 right-3 opacity-10">
              <card.icon className="h-10 w-10" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{card.label}</p>
            <p className={`text-2xl font-black tabular-nums ${card.color}`}>
              {card.valueStr
                ? card.valueStr
                : <Counter value={card.value!} prefix={card.isPrefix ? currency : ""} />
              }
            </p>
            {card.showGrowth ? (
              <div className={cn(
                "flex items-center mt-1.5 text-xs font-semibold",
                card.growth! >= 0 ? "text-emerald-500" : "text-rose-500"
              )}>
                {card.growth! >= 0
                  ? <ArrowUpRight className="h-3 w-3 mr-0.5" />
                  : <ArrowDownRight className="h-3 w-3 mr-0.5" />
                }
                {Math.abs(card.growth!).toFixed(1)}% vs yesterday
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1.5">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      <Card className="rounded-3xl shadow-md border-border/30 bg-card overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/10 py-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Revenue Trend (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground/50 text-sm">
              No data available yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.07} vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickFormatter={(v) => `${currency}${v}`}
                  width={55}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                  cursor={{ stroke: "#6366f1", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  name="Revenue"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#revGradient)"
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom charts */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Top Products */}
        <Card className="rounded-3xl shadow-md border-border/30 bg-card overflow-hidden">
          <CardHeader className="border-b border-border/30 bg-muted/10 py-4 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" /> Top Products
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-5">
            {productData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground/50 text-sm">No sales data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={productData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.07} horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--foreground))", fontSize: 10, fontWeight: 500 }}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                  />
                  <Bar dataKey="qty" name="Sold" radius={[0, 6, 6, 0]} fill="#6366f1">
                    {productData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Hourly Activity */}
        <Card className="rounded-3xl shadow-md border-border/30 bg-card overflow-hidden">
          <CardHeader className="border-b border-border/30 bg-muted/10 py-4 px-5">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Hourly Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-5">
            {hourlyData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground/50 text-sm">No activity data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.07} vertical={false} />
                  <XAxis
                    dataKey="hour"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    interval={3}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    width={24}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "hsl(var(--foreground))", fontWeight: "bold" }}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                  />
                  <Bar dataKey="sales" name="Sales" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        {paymentData.length > 0 && (
          <Card className="rounded-3xl shadow-md border-border/30 bg-card overflow-hidden md:col-span-2">
            <CardHeader className="border-b border-border/30 bg-muted/10 py-4 px-5">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" /> Payment Methods
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0">
                <PieChart width={160} height={160}>
                  <Pie
                    data={paymentData}
                    cx={75}
                    cy={75}
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {paymentData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                  />
                </PieChart>
              </div>
              <div className="flex flex-wrap gap-3">
                {paymentData.map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-secondary/50 rounded-2xl px-4 py-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <div>
                      <p className="text-xs font-semibold capitalize">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.value} transaction{item.value !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
