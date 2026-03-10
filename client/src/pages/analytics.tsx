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

export default function Analytics() {
        const { data: sales = [], isLoading } = useSales();
        const { data: settings } = useSettings();
        const [date, setDate] = useState<Date | undefined>(new Date());

        const stats = useMemo(() => {
                const filteredSales = date
                        ? sales.filter((s) =>
                                        isWithinInterval(new Date(s.createdAt!), {
                                                start: startOfDay(date),
                                                end: endOfDay(date),
                                        }),
                          )
                        : sales;

                const totalRevenue = filteredSales.reduce(
                        (acc, s) => acc + parseNumeric(s.total),
                        0,
                );
                const totalOrders = filteredSales.length;
                const avgOrderValue =
                        totalOrders > 0 ? totalRevenue / totalOrders : 0;

                const prevDaySales = sales.filter((s) =>
                        isWithinInterval(new Date(s.createdAt!), {
                                start: startOfDay(subDays(date || new Date(), 1)),
                                end: endOfDay(subDays(date || new Date(), 1)),
                        }),
                );
                const prevRevenue = prevDaySales.reduce(
                        (acc, s) => acc + parseNumeric(s.total),
                        0,
                );
                const revenueGrowth =
                        prevRevenue > 0
                                ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
                                : 0;

                return { totalRevenue, totalOrders, avgOrderValue, revenueGrowth };
        }, [sales, date]);

        if (isLoading) {
                return (
                        <div className="p-10 text-center text-muted-foreground animate-pulse">
                                Loading analytics...
                        </div>
                );
        }

        const grouped: Record<string, number> = {};
        const hourly: Record<number, number> = {};
        const payment: Record<string, number> = {};
        const products: Record<string, number> = {};

        sales.forEach((sale: any) => {
                const dateStr = format(new Date(sale.createdAt), "yyyy-MM-dd");

                if (!grouped[dateStr]) grouped[dateStr] = 0;
                grouped[dateStr] += parseNumeric(sale.total);

                const hour = new Date(sale.createdAt).getHours();
                if (!hourly[hour]) hourly[hour] = 0;
                hourly[hour]++;

                if (!payment[sale.paymentMethod]) payment[sale.paymentMethod] = 0;
                payment[sale.paymentMethod]++;

                sale.items?.forEach((i: any) => {
                        const name = i.product?.name || "Unknown";
                        if (!products[name]) products[name] = 0;
                        products[name] += i.quantity || 1;
                });
        });

        const trendData = Object.entries(grouped)
                .map(([dateStr, amount]) => ({
                        date: dateStr,
                        label: format(new Date(dateStr), "MMM d"),
                        amount,
                }))
                .sort(
                        (a, b) =>
                                new Date(a.date).getTime() -
                                new Date(b.date).getTime(),
                );

        const hourlyData = Object.entries(hourly).map(([h, v]) => ({
                hour: `${h}:00`,
                sales: v,
        }));

        const paymentData = Object.entries(payment).map(([method, value]) => ({
                name: method,
                value,
        }));

        const productData = Object.entries(products)
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
        };

        return (
                <div className="space-y-8 animate-in fade-in duration-700 pb-10">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
                                                <BarChart3 className="h-6 w-6" />
                                        </div>
                                        <div>
                                                <h2 className="text-2xl font-bold">Analytics Overview</h2>
                                                <p className="text-sm text-muted-foreground">Business performance insights</p>
                                        </div>
                                </div>

                                <Popover>
                                        <PopoverTrigger asChild>
                                                <Button
                                                        variant="outline"
                                                        className={cn(
                                                                "w-[240px] justify-start text-left font-normal rounded-xl h-12 border-border/50 bg-card shadow-sm",
                                                                !date && "text-muted-foreground",
                                                        )}
                                                >
                                                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                                                        {date ? (
                                                                format(date, "PPP")
                                                        ) : (
                                                                <span>Pick a date</span>
                                                        )}
                                                </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                                className="w-auto p-0 rounded-2xl border-none shadow-2xl"
                                                align="end"
                                        >
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

                        <div className="grid gap-6 md:grid-cols-4">
                                <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-violet-500/10 to-transparent overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <DollarSign className="h-12 w-12" />
                                        </div>
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">Daily Revenue</p>
                                                <h3 className="text-3xl font-black mt-1">
                                                        <Counter
                                                                value={stats.totalRevenue}
                                                                prefix={settings?.currency || "₱"}
                                                        />
                                                </h3>
                                                <div
                                                        className={cn(
                                                                "flex items-center mt-2 text-xs font-medium",
                                                                stats.revenueGrowth >= 0
                                                                        ? "text-emerald-500"
                                                                        : "text-rose-500",
                                                        )}
                                                >
                                                        {stats.revenueGrowth >= 0 ? (
                                                                <ArrowUpRight className="h-3 w-3 mr-1" />
                                                        ) : (
                                                                <ArrowDownRight className="h-3 w-3 mr-1" />
                                                        )}
                                                        {Math.abs(stats.revenueGrowth).toFixed(1)}% from
                                                        yesterday
                                                </div>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-pink-500/10 to-transparent overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <ShoppingBag className="h-12 w-12" />
                                        </div>
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">Daily Orders</p>
                                                <h3 className="text-3xl font-black mt-1">
                                                        <Counter value={stats.totalOrders} />
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                        Processed transactions
                                                </p>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-amber-500/10 to-transparent overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <TrendingUp className="h-12 w-12" />
                                        </div>
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                                                <h3 className="text-3xl font-black mt-1">
                                                        <Counter
                                                                value={stats.avgOrderValue}
                                                                prefix={settings?.currency || "₱"}
                                                        />
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                        Revenue per customer
                                                </p>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-emerald-500/10 to-transparent overflow-hidden relative">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                                <Clock className="h-12 w-12" />
                                        </div>
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">Peak Activity</p>
                                                <h3 className="text-3xl font-black mt-1">
                                                        {bestHour?.hour || "N/A"}
                                                </h3>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                        Highest sales volume hour
                                                </p>
                                        </CardContent>
                                </Card>
                        </div>

                        <Card className="rounded-3xl shadow-xl overflow-hidden border-none bg-card">
                                <CardHeader className="border-b border-border/50 bg-muted/20">
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                                <TrendingUp className="h-5 w-5 text-primary" />
                                                Revenue Trend
                                        </CardTitle>
                                </CardHeader>

                                <CardContent className="p-6">
                                        <ResponsiveContainer width="100%" height={320}>
                                                <AreaChart data={trendData}>
                                                        <defs>
                                                                <linearGradient
                                                                        id="revGradient"
                                                                        x1="0"
                                                                        y1="0"
                                                                        x2="0"
                                                                        y2="1"
                                                                >
                                                                        <stop
                                                                                offset="5%"
                                                                                stopColor="#6366f1"
                                                                                stopOpacity={0.4}
                                                                        />
                                                                        <stop
                                                                                offset="95%"
                                                                                stopColor="#6366f1"
                                                                                stopOpacity={0}
                                                                        />
                                                                </linearGradient>
                                                        </defs>

                                                        <CartesianGrid
                                                                strokeDasharray="3 3"
                                                                strokeOpacity={0.1}
                                                                vertical={false}
                                                        />

                                                        <XAxis
                                                                dataKey="label"
                                                                axisLine={false}
                                                                tickLine={false}
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                        fontSize: 12,
                                                                }}
                                                        />

                                                        <YAxis
                                                                axisLine={false}
                                                                tickLine={false}
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                        fontSize: 12,
                                                                }}
                                                                tickFormatter={(v) =>
                                                                        `${settings?.currency || "₱"}${v}`
                                                                }
                                                        />

                                                        <Tooltip
                                                                contentStyle={tooltipStyle}
                                                                cursor={{
                                                                        stroke: "#6366f1",
                                                                        strokeWidth: 2,
                                                                }}
                                                        />

                                                        <Area
                                                                type="monotone"
                                                                dataKey="amount"
                                                                stroke="#6366f1"
                                                                strokeWidth={3}
                                                                fill="url(#revGradient)"
                                                                isAnimationActive
                                                        />
                                                </AreaChart>
                                        </ResponsiveContainer>
                                </CardContent>
                        </Card>

                        <div className="grid gap-6 md:grid-cols-2">
                                <Card className="rounded-3xl shadow-xl border-none bg-card overflow-hidden">
                                        <CardHeader className="border-b border-border/50 bg-muted/20">
                                                <CardTitle className="text-lg font-bold flex items-center gap-2">
                                                        <Package className="h-5 w-5 text-primary" />
                                                        Top Products
                                                </CardTitle>
                                        </CardHeader>

                                        <CardContent className="p-6">
                                                <ResponsiveContainer width="100%" height={260}>
                                                        <BarChart data={productData}>
                                                                <CartesianGrid
                                                                        strokeDasharray="3 3"
                                                                        strokeOpacity={0.1}
                                                                        vertical={false}
                                                                />

                                                                <XAxis
                                                                        dataKey="name"
                                                                        axisLine={false}
                                                                        tickLine={false}
                                                                        tick={{
                                                                                fill: "hsl(var(--muted-foreground))",
                                                                                fontSize: 12,
                                                                        }}
                                                                />

                                                                <YAxis
                                                                        axisLine={false}
                                                                        tickLine={false}
                                                                        tick={{
                                                                                fill: "hsl(var(--muted-foreground))",
                                                                                fontSize: 12,
                                                                        }}
                                                                />

                                                                <Tooltip
                                                                        contentStyle={tooltipStyle}
                                                                        cursor={{ fill: "transparent" }}
                                                                />

                                                                <Bar
                                                                        dataKey="qty"
                                                                        fill="#6366f1"
                                                                        radius={[8, 8, 0, 0]}
                                                                        isAnimationActive
                                                                />
                                                        </BarChart>
                                                </ResponsiveContainer>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl shadow-xl border-none bg-card overflow-hidden">
                                        <CardHeader className="border-b border-border/50 bg-muted/20">
                                                <CardTitle className="text-lg font-bold flex items-center gap-2">
                                                        <DollarSign className="h-5 w-5 text-primary" />
                                                        Payment Methods
                                                </CardTitle>
                                        </CardHeader>

                                        <CardContent className="p-6">
                                                <ResponsiveContainer width="100%" height={260}>
                                                        <PieChart>
                                                                <Pie
                                                                        data={paymentData}
                                                                        dataKey="value"
                                                                        nameKey="name"
                                                                        outerRadius={90}
                                                                        innerRadius={60}
                                                                        paddingAngle={5}
                                                                        stroke="none"
                                                                        isAnimationActive
                                                                >
                                                                        {paymentData.map((entry, index) => (
                                                                                <Cell
                                                                                        key={index}
                                                                                        fill={
                                                                                                COLORS[
                                                                                                        index % COLORS.length
                                                                                                ]
                                                                                        }
                                                                                />
                                                                        ))}
                                                                </Pie>

                                                                <Tooltip contentStyle={tooltipStyle} />
                                                        </PieChart>
                                                </ResponsiveContainer>
                                        </CardContent>
                                </Card>
                        </div>
                </div>
        );
}
