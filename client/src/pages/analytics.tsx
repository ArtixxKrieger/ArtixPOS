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
        Tooltip,
        CartesianGrid,
        BarChart,
        Bar,
        PieChart,
        Pie,
        Cell,
} from "recharts";

import { BarChart3, TrendingUp, Clock, Sparkles } from "lucide-react";

import { useEffect, useState } from "react";

function Counter({ value }: { value: number }) {
        const [display, setDisplay] = useState(0);

        useEffect(() => {
                let start = 0;
                const step = value / 30;

                const timer = setInterval(() => {
                        start += step;
                        if (start >= value) {
                                start = value;
                                clearInterval(timer);
                        }
                        setDisplay(start);
                }, 20);

                return () => clearInterval(timer);
        }, [value]);

        return <>{Math.round(display)}</>;
}

export default function Analytics() {
        const { data: sales = [], isLoading } = useSales();
        const { data: settings } = useSettings();

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
                const date = format(new Date(sale.createdAt), "yyyy-MM-dd");

                if (!grouped[date]) grouped[date] = 0;
                grouped[date] += parseNumeric(sale.total);

                const hour = new Date(sale.createdAt).getHours();
                if (!hourly[hour]) hourly[hour] = 0;
                hourly[hour]++;

                if (!payment[sale.paymentMethod])
                        payment[sale.paymentMethod] = 0;
                payment[sale.paymentMethod]++;

                sale.items?.forEach((i: any) => {
                        const name = i.product?.name || "Unknown";
                        if (!products[name]) products[name] = 0;
                        products[name] += i.quantity || 1;
                });
        });

        const trendData = Object.entries(grouped)
                .map(([date, amount]) => ({
                        date,
                        label: format(new Date(date), "MMM d"),
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

        const totalRevenue = trendData.reduce((a, b) => a + b.amount, 0);

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

        const today = trendData[trendData.length - 1]?.amount || 0;
        const yesterday = trendData[trendData.length - 2]?.amount || 0;

        const growth =
                yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0;

        return (
                <div className="space-y-8">
                        <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
                                        <BarChart3 className="h-6 w-6" />
                                </div>

                                <div>
                                        <h2 className="text-2xl font-bold">
                                                Analytics Overview
                                        </h2>
                                        <p className="text-sm text-muted-foreground">
                                                Business performance insights
                                        </p>
                                </div>
                        </div>

                        <div className="grid gap-6 md:grid-cols-4">
                                <Card className="rounded-3xl shadow-xl backdrop-blur bg-card/70">
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">
                                                        Lifetime Revenue
                                                </p>

                                                <h3 className="text-3xl font-black">
                                                        {settings?.currency}
                                                        <Counter
                                                                value={
                                                                        totalRevenue
                                                                }
                                                        />
                                                </h3>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl shadow-xl bg-card/70">
                                        <CardContent className="p-6">
                                                <p className="text-sm text-muted-foreground">
                                                        Orders
                                                </p>

                                                <h3 className="text-3xl font-black">
                                                        <Counter
                                                                value={
                                                                        sales.length
                                                                }
                                                        />
                                                </h3>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl shadow-xl bg-card/70">
                                        <CardContent className="p-6">
                                                <p className="text-sm flex items-center gap-1 text-muted-foreground">
                                                        <TrendingUp className="h-4 w-4" />{" "}
                                                        Growth
                                                </p>

                                                <h3 className="text-3xl font-black">
                                                        {growth.toFixed(1)}%
                                                </h3>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl shadow-xl bg-card/70">
                                        <CardContent className="p-6">
                                                <p className="text-sm flex items-center gap-1 text-muted-foreground">
                                                        <Clock className="h-4 w-4" />{" "}
                                                        Peak Hour
                                                </p>

                                                <h3 className="text-3xl font-black">
                                                        {bestHour?.hour}
                                                </h3>
                                        </CardContent>
                                </Card>
                        </div>

                        <Card className="rounded-3xl shadow-xl">
                                <CardHeader>
                                        <CardTitle>Revenue Trend</CardTitle>
                                </CardHeader>

                                <CardContent>
                                        <ResponsiveContainer
                                                width="100%"
                                                height={320}
                                        >
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
                                                                                stopOpacity={
                                                                                        0.4
                                                                                }
                                                                        />
                                                                        <stop
                                                                                offset="95%"
                                                                                stopColor="#6366f1"
                                                                                stopOpacity={
                                                                                        0
                                                                                }
                                                                        />
                                                                </linearGradient>
                                                        </defs>

                                                        <CartesianGrid
                                                                strokeDasharray="3 3"
                                                                strokeOpacity={
                                                                        0.15
                                                                }
                                                        />

                                                        <XAxis
                                                                dataKey="label"
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                }}
                                                        />

                                                        <YAxis
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                }}
                                                                tickFormatter={(
                                                                        v,
                                                                ) =>
                                                                        `${settings?.currency || "₱"}${v}`
                                                                }
                                                        />

                                                        <Tooltip
                                                                contentStyle={
                                                                        tooltipStyle
                                                                }
                                                                cursor={{
                                                                        fill: "transparent",
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
                                <Card className="rounded-3xl shadow-xl">
                                        <CardHeader>
                                                <CardTitle>
                                                        Top Products
                                                </CardTitle>
                                        </CardHeader>

                                        <CardContent>
                                                <ResponsiveContainer
                                                        width="100%"
                                                        height={260}
                                                >
                                                        <BarChart
                                                                data={
                                                                        productData
                                                                }
                                                        >
                                                                <CartesianGrid
                                                                        strokeDasharray="3 3"
                                                                        strokeOpacity={
                                                                                0.15
                                                                        }
                                                                />

                                                                <XAxis
                                                                        dataKey="name"
                                                                        tick={{
                                                                                fill: "hsl(var(--muted-foreground))",
                                                                        }}
                                                                />

                                                                <YAxis
                                                                        tick={{
                                                                                fill: "hsl(var(--muted-foreground))",
                                                                        }}
                                                                />

                                                                <Tooltip
                                                                        contentStyle={
                                                                                tooltipStyle
                                                                        }
                                                                        cursor={{
                                                                                fill: "transparent",
                                                                        }}
                                                                />

                                                                <Bar
                                                                        dataKey="qty"
                                                                        fill="#6366f1"
                                                                        radius={[
                                                                                8,
                                                                                8,
                                                                                0,
                                                                                0,
                                                                        ]}
                                                                        isAnimationActive
                                                                />
                                                        </BarChart>
                                                </ResponsiveContainer>
                                        </CardContent>
                                </Card>

                                <Card className="rounded-3xl shadow-xl">
                                        <CardHeader>
                                                <CardTitle>
                                                        Payment Methods
                                                </CardTitle>
                                        </CardHeader>

                                        <CardContent>
                                                <ResponsiveContainer
                                                        width="100%"
                                                        height={260}
                                                >
                                                        <PieChart>
                                                                <Pie
                                                                        data={
                                                                                paymentData
                                                                        }
                                                                        dataKey="value"
                                                                        nameKey="name"
                                                                        outerRadius={
                                                                                90
                                                                        }
                                                                        innerRadius={
                                                                                50
                                                                        }
                                                                        paddingAngle={
                                                                                3
                                                                        }
                                                                        stroke="none"
                                                                        isAnimationActive
                                                                >
                                                                        {paymentData.map(
                                                                                (
                                                                                        entry,
                                                                                        index,
                                                                                ) => (
                                                                                        <Cell
                                                                                                key={
                                                                                                        index
                                                                                                }
                                                                                                fill={
                                                                                                        COLORS[
                                                                                                                index %
                                                                                                                        COLORS.length
                                                                                                        ]
                                                                                                }
                                                                                        />
                                                                                ),
                                                                        )}
                                                                </Pie>

                                                                <Tooltip
                                                                        contentStyle={
                                                                                tooltipStyle
                                                                        }
                                                                />
                                                        </PieChart>
                                                </ResponsiveContainer>
                                        </CardContent>
                                </Card>
                        </div>

                        <Card className="rounded-3xl shadow-xl">
                                <CardHeader>
                                        <CardTitle>
                                                Hourly Sales Activity
                                        </CardTitle>
                                </CardHeader>

                                <CardContent>
                                        <ResponsiveContainer
                                                width="100%"
                                                height={260}
                                        >
                                                <BarChart data={hourlyData}>
                                                        <CartesianGrid
                                                                strokeDasharray="3 3"
                                                                strokeOpacity={
                                                                        0.15
                                                                }
                                                        />

                                                        <XAxis
                                                                dataKey="hour"
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                }}
                                                        />

                                                        <YAxis
                                                                tick={{
                                                                        fill: "hsl(var(--muted-foreground))",
                                                                }}
                                                        />

                                                        <Tooltip
                                                                contentStyle={
                                                                        tooltipStyle
                                                                }
                                                                cursor={{
                                                                        fill: "transparent",
                                                                }}
                                                        />

                                                        <Bar
                                                                dataKey="sales"
                                                                fill="#6366f1"
                                                                radius={[
                                                                        8, 8, 0,
                                                                        0,
                                                                ]}
                                                                isAnimationActive
                                                        />
                                                </BarChart>
                                        </ResponsiveContainer>
                                </CardContent>
                        </Card>

                        <Card className="rounded-3xl shadow-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                                <CardContent className="p-6 flex gap-3">
                                        <Sparkles className="text-indigo-400" />

                                        <div>
                                                <p className="font-semibold">
                                                        AI Sales Insight
                                                </p>

                                                <p className="text-sm text-muted-foreground">
                                                        Peak sales happen around{" "}
                                                        <b>{bestHour?.hour}</b>.
                                                        Revenue growth today is{" "}
                                                        <b>
                                                                {growth.toFixed(
                                                                        1,
                                                                )}
                                                                %
                                                        </b>
                                                        . Focus promotions
                                                        during peak hours and
                                                        restock top products to
                                                        maximize profit.
                                                </p>
                                        </div>
                                </CardContent>
                        </Card>
                </div>
        );
}
