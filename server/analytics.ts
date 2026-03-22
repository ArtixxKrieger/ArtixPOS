import { db } from "./db";
import { sql } from "drizzle-orm";

type Row = Record<string, any>;

function toRows(result: any): Row[] {
  if (!result) return [];
  if (Array.isArray(result.rows)) {
    if (result.rows.length === 0) return [];
    const cols: string[] = result.columns ?? Object.keys(result.rows[0] ?? {});
    if (cols.length === 0) return result.rows as Row[];
    return result.rows.map((row: any) => {
      if (!Array.isArray(row)) return row as Row;
      const obj: Row = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  }
  return [];
}

export interface DaySummary {
  orders: number;
  revenue: number;
  avgOrder: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  orders: number;
  revenue: number;
}

export interface HourPoint {
  hour: number;
  label: string;
  sales: number;
  revenue: number;
}

export interface ProductPoint {
  name: string;
  qty: number;
  revenue: number;
}

export interface PaymentPoint {
  method: string;
  count: number;
  revenue: number;
}

export interface Insight {
  type: "positive" | "warning" | "info" | "neutral";
  title: string;
  body: string;
  icon: string;
}

export interface AnalyticsData {
  summary: { today: DaySummary; yesterday: DaySummary; revenueGrowth: number };
  trend: TrendPoint[];
  hourly: HourPoint[];
  products: ProductPoint[];
  payments: PaymentPoint[];
  insights: Insight[];
  range: string;
  totalAllTime: { orders: number; revenue: number };
}

async function querySummary(date: string): Promise<DaySummary> {
  try {
    const res = await db.execute(sql`
      SELECT 
        COUNT(*) as orders,
        COALESCE(SUM(CAST(total AS REAL)), 0) as revenue,
        COALESCE(AVG(CAST(total AS REAL)), 0) as avg_order
      FROM sales
      WHERE date(created_at) = ${date}
    `);
    const row = toRows(res)[0] ?? {};
    return {
      orders: Number(row.orders ?? 0),
      revenue: Number(row.revenue ?? 0),
      avgOrder: Number(row.avg_order ?? 0),
    };
  } catch { return { orders: 0, revenue: 0, avgOrder: 0 }; }
}

async function queryTrend(days: number): Promise<TrendPoint[]> {
  try {
    const modifier = `-${days} days`;
    const res = await db.execute(sql`
      SELECT 
        date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(CAST(total AS REAL)), 0) as revenue
      FROM sales
      WHERE created_at >= datetime('now', ${modifier})
      GROUP BY date(created_at)
      ORDER BY date ASC
    `);
    return toRows(res).map(r => ({
      date: String(r.date ?? ""),
      label: formatDateLabel(String(r.date ?? "")),
      orders: Number(r.orders ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  } catch { return []; }
}

async function queryHourly(date?: string): Promise<HourPoint[]> {
  try {
    const res = date
      ? await db.execute(sql`
          SELECT
            CAST(strftime('%H', created_at) AS INTEGER) as hour,
            COUNT(*) as sales,
            COALESCE(SUM(CAST(total AS REAL)), 0) as revenue
          FROM sales
          WHERE date(created_at) = ${date}
          GROUP BY hour ORDER BY hour ASC
        `)
      : await db.execute(sql`
          SELECT
            CAST(strftime('%H', created_at) AS INTEGER) as hour,
            COUNT(*) as sales,
            COALESCE(SUM(CAST(total AS REAL)), 0) as revenue
          FROM sales
          GROUP BY hour ORDER BY hour ASC
        `);
    return toRows(res).map(r => {
      const h = Number(r.hour ?? 0);
      const period = h < 12 ? "AM" : "PM";
      const h12 = h % 12 || 12;
      return {
        hour: h,
        label: `${h12}${period}`,
        sales: Number(r.sales ?? 0),
        revenue: Number(r.revenue ?? 0),
      };
    });
  } catch { return []; }
}

async function queryTopProducts(days: number, limit = 5): Promise<ProductPoint[]> {
  try {
    const modifier = `-${days} days`;
    const res = await db.execute(sql`
      SELECT items FROM sales
      WHERE created_at >= datetime('now', ${modifier})
    `);
    const rows = toRows(res);
    const counts: Record<string, { qty: number; revenue: number }> = {};
    for (const row of rows) {
      let items: any[] = [];
      try { items = JSON.parse(String(row.items ?? "[]")); } catch { }
      for (const item of items) {
        const name: string = item.product?.name || "Unknown";
        const price = parseFloat(item.product?.price ?? "0") || 0;
        const qty = Number(item.quantity ?? 1);
        if (!counts[name]) counts[name] = { qty: 0, revenue: 0 };
        counts[name].qty += qty;
        counts[name].revenue += price * qty;
      }
    }
    return Object.entries(counts)
      .map(([name, d]) => ({ name, qty: d.qty, revenue: d.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  } catch { return []; }
}

async function queryPayments(days: number): Promise<PaymentPoint[]> {
  try {
    const modifier = `-${days} days`;
    const res = await db.execute(sql`
      SELECT
        payment_method as method,
        COUNT(*) as count,
        COALESCE(SUM(CAST(total AS REAL)), 0) as revenue
      FROM sales
      WHERE created_at >= datetime('now', ${modifier})
      GROUP BY payment_method
      ORDER BY count DESC
    `);
    return toRows(res).map(r => ({
      method: String(r.method ?? "cash"),
      count: Number(r.count ?? 0),
      revenue: Number(r.revenue ?? 0),
    }));
  } catch { return []; }
}

async function queryAllTimeTotal(): Promise<{ orders: number; revenue: number }> {
  try {
    const res = await db.execute(sql`
      SELECT COUNT(*) as orders, COALESCE(SUM(CAST(total AS REAL)), 0) as revenue FROM sales
    `);
    const row = toRows(res)[0] ?? {};
    return { orders: Number(row.orders ?? 0), revenue: Number(row.revenue ?? 0) };
  } catch { return { orders: 0, revenue: 0 }; }
}

function generateInsights(
  trend: TrendPoint[],
  hourly: HourPoint[],
  products: ProductPoint[],
  today: DaySummary,
  yesterday: DaySummary,
  currency: string,
): Insight[] {
  const insights: Insight[] = [];

  // 1. Today vs yesterday
  if (today.orders > 0) {
    if (yesterday.revenue > 0) {
      const growth = ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100;
      if (growth >= 10) {
        insights.push({
          type: "positive",
          title: "Strong Day Ahead",
          body: `Today's revenue is already ${growth.toFixed(0)}% ahead of yesterday (${currency}${today.revenue.toLocaleString()} vs ${currency}${yesterday.revenue.toLocaleString()}). You're on a great pace!`,
          icon: "trending-up",
        });
      } else if (growth <= -15) {
        insights.push({
          type: "warning",
          title: "Slower Than Yesterday",
          body: `Today is tracking ${Math.abs(growth).toFixed(0)}% below yesterday's revenue. Consider a quick promotion or upsell nudge.`,
          icon: "trending-down",
        });
      } else {
        insights.push({
          type: "info",
          title: "Today's Progress",
          body: `${today.orders} orders so far for ${currency}${today.revenue.toLocaleString()}. ${growth >= 0 ? `Up ${growth.toFixed(1)}%` : `Down ${Math.abs(growth).toFixed(1)}%`} vs yesterday.`,
          icon: "zap",
        });
      }
    } else {
      insights.push({
        type: "positive",
        title: "Sales Are Live",
        body: `${today.orders} order${today.orders !== 1 ? "s" : ""} processed today for ${currency}${today.revenue.toLocaleString()}. Keep the momentum going!`,
        icon: "zap",
      });
    }
  } else {
    insights.push({
      type: "neutral",
      title: "No Sales Yet Today",
      body: "No transactions recorded yet today. Analytics will update as sales come in.",
      icon: "info",
    });
  }

  // 2. Revenue trend over the period
  if (trend.length >= 4) {
    const revenues = trend.map(d => d.revenue);
    const half = Math.floor(revenues.length / 2);
    const firstAvg = revenues.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondAvg = revenues.slice(-half).reduce((a, b) => a + b, 0) / half;
    if (firstAvg > 0) {
      const pct = ((secondAvg - firstAvg) / firstAvg) * 100;
      if (pct > 10) {
        insights.push({
          type: "positive",
          title: "Revenue Accelerating",
          body: `Your revenue trend is up ${pct.toFixed(0)}% in the recent half of this period vs the earlier half. Business is growing!`,
          icon: "arrow-up",
        });
      } else if (pct < -10) {
        insights.push({
          type: "warning",
          title: "Revenue Decelerating",
          body: `Revenue is down ${Math.abs(pct).toFixed(0)}% in recent days compared to earlier. Review your top products or pricing.`,
          icon: "alert-triangle",
        });
      }
    }

    // Best single day
    const best = trend.reduce((a, b) => b.revenue > a.revenue ? b : a);
    if (best.revenue > 0) {
      const dayName = formatDayName(best.date);
      insights.push({
        type: "info",
        title: "Best Revenue Day",
        body: `${dayName} was your strongest day with ${currency}${best.revenue.toLocaleString()} across ${best.orders} orders. See if you can replicate those conditions.`,
        icon: "star",
      });
    }

    // Revenue forecast (7-day simple moving average)
    if (revenues.length >= 3) {
      const window = revenues.slice(-3);
      const forecast = window.reduce((a, b) => a + b, 0) / window.length;
      insights.push({
        type: "neutral",
        title: "Revenue Forecast",
        body: `Based on your recent trend, expect approximately ${currency}${Math.round(forecast).toLocaleString()} in revenue tomorrow. Actual results may vary with promotions or events.`,
        icon: "bar-chart",
      });
    }
  }

  // 3. Peak hour
  if (hourly.length > 0) {
    const peak = hourly.reduce((a, b) => b.sales > a.sales ? b : a);
    const slow = hourly.reduce((a, b) => b.sales < a.sales ? b : a);
    insights.push({
      type: "info",
      title: "Peak Sales Window",
      body: `Your busiest hour is ${peak.label} with ${peak.sales} transaction${peak.sales !== 1 ? "s" : ""}. Staff up during this time to handle the rush.`,
      icon: "clock",
    });
    if (peak.hour !== slow.hour) {
      insights.push({
        type: "neutral",
        title: "Quiet Period",
        body: `${slow.label} is your slowest hour. Use this window for inventory checks, staff breaks, or prep work.`,
        icon: "moon",
      });
    }
  }

  // 4. Star product
  if (products.length > 0) {
    const top = products[0];
    const totalQty = products.reduce((a, b) => a + b.qty, 0);
    const pct = totalQty > 0 ? (top.qty / totalQty) * 100 : 0;
    if (pct > 50) {
      insights.push({
        type: "warning",
        title: "High Product Concentration",
        body: `"${top.name}" accounts for ${pct.toFixed(0)}% of units sold. Consider diversifying your menu to reduce dependency on one item.`,
        icon: "alert-triangle",
      });
    } else {
      insights.push({
        type: "positive",
        title: "Top Seller",
        body: `"${top.name}" leads with ${top.qty} units sold (${currency}${top.revenue.toLocaleString()} revenue). Make sure it's always well-stocked.`,
        icon: "award",
      });
    }
  }

  return insights.slice(0, 6);
}

function formatDateLabel(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en", { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function formatDayName(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

export async function getFullAnalytics(range: string, currency: string): Promise<AnalyticsData> {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const [todaySummary, yesterdaySummary, trend, hourly, products, payments, allTime] = await Promise.all([
    querySummary(todayStr),
    querySummary(yesterdayStr),
    queryTrend(days),
    queryHourly(),
    queryTopProducts(days),
    queryPayments(days),
    queryAllTimeTotal(),
  ]);

  const revenueGrowth = yesterdaySummary.revenue > 0
    ? ((todaySummary.revenue - yesterdaySummary.revenue) / yesterdaySummary.revenue) * 100
    : 0;

  const insights = generateInsights(trend, hourly, products, todaySummary, yesterdaySummary, currency);

  return {
    summary: { today: todaySummary, yesterday: yesterdaySummary, revenueGrowth },
    trend,
    hourly,
    products,
    payments,
    insights,
    range,
    totalAllTime: allTime,
  };
}
