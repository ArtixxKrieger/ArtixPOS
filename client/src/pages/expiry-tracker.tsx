import { useMemo } from "react";
import { useProducts } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { differenceInDays, parseISO, isValid, format } from "date-fns";
import { CalendarClock, AlertTriangle, CheckCircle2, Clock, Package, FlaskConical } from "lucide-react";
import { Link } from "wouter";

interface ExpiryProduct {
  id: number;
  name: string;
  category: string | null;
  stock: number | null;
  trackStock: boolean | null;
  expiryDate: string;
  batchNumber?: string | null;
  requiresPrescription?: boolean | null;
  genericName?: string | null;
  days: number;
}

type ExpiryGroup = "expired" | "critical" | "warning" | "ok";

function getGroup(days: number): ExpiryGroup {
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "ok";
}

const GROUP_META: Record<ExpiryGroup, { label: string; description: string; bg: string; border: string; text: string; icon: React.ElementType }> = {
  expired: {
    label: "Expired",
    description: "These items are past their expiry date and must be removed from sale.",
    bg: "bg-rose-500/10 dark:bg-rose-500/10",
    border: "border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
    icon: AlertTriangle,
  },
  critical: {
    label: "Expiring Within 7 Days",
    description: "Act fast — these items will expire in a week or less.",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
  warning: {
    label: "Expiring Within 30 Days",
    description: "Plan ahead — these items expire within the next month.",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-600 dark:text-yellow-500",
    icon: CalendarClock,
  },
  ok: {
    label: "Good — More Than 30 Days Left",
    description: "These items have more than 30 days before expiry.",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
};

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
      Expired {Math.abs(days)}d ago
    </span>
  );
  if (days === 0) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
      Expires today
    </span>
  );
  if (days <= 7) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
      {days}d left
    </span>
  );
  if (days <= 30) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-600 dark:text-yellow-500">
      {days}d left
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
      {days}d left
    </span>
  );
}

function ProductRow({ p }: { p: ExpiryProduct }) {
  const expiryLabel = p.expiryDate ? (() => {
    try {
      const d = parseISO(p.expiryDate);
      return isValid(d) ? format(d, "MMM d, yyyy") : p.expiryDate;
    } catch { return p.expiryDate; }
  })() : "";

  return (
    <div
      className="bg-card rounded-2xl border border-border/30 px-4 py-3 flex items-center gap-3 shadow-sm"
      data-testid={`expiry-row-${p.id}`}
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        {p.requiresPrescription
          ? <FlaskConical className="h-4.5 w-4.5 text-primary/60" strokeWidth={1.5} />
          : <Package className="h-4.5 w-4.5 text-primary/60" strokeWidth={1.5} />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-bold text-sm leading-tight truncate">{p.name}</p>
          {p.requiresPrescription && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/15 text-violet-600 dark:text-violet-400 shrink-0">Rx</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {p.category && (
            <span className="bg-secondary/80 px-2 py-0.5 rounded-full text-[10px] font-semibold text-muted-foreground">
              {p.category}
            </span>
          )}
          {p.genericName && (
            <span className="text-[10px] text-muted-foreground/60 italic truncate max-w-[100px]">{p.genericName}</span>
          )}
          {p.batchNumber && (
            <span className="text-[10px] text-muted-foreground/50 font-mono">Lot: {p.batchNumber}</span>
          )}
          {p.trackStock && typeof p.stock === "number" && (
            <span className={["text-[10px] font-semibold", p.stock === 0 ? "text-rose-500" : "text-muted-foreground/60"].join(" ")}>
              {p.stock} in stock
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 space-y-1">
        <ExpiryBadge days={p.days} />
        <p className="text-[10px] text-muted-foreground/50">{expiryLabel}</p>
      </div>
    </div>
  );
}

export default function ExpiryTracker() {
  const { data: products = [], isLoading } = useProducts();

  const grouped = useMemo(() => {
    const result: Record<ExpiryGroup, ExpiryProduct[]> = { expired: [], critical: [], warning: [], ok: [] };
    for (const p of products) {
      const raw = (p as any).expiryDate as string | null | undefined;
      if (!raw) continue;
      try {
        const parsed = parseISO(raw);
        if (!isValid(parsed)) continue;
        const days = differenceInDays(parsed, new Date());
        const group = getGroup(days);
        result[group].push({
          id: p.id,
          name: p.name,
          category: p.category ?? null,
          stock: p.stock ?? null,
          trackStock: p.trackStock ?? null,
          expiryDate: raw,
          batchNumber: (p as any).batchNumber ?? null,
          requiresPrescription: (p as any).requiresPrescription ?? null,
          genericName: (p as any).genericName ?? null,
          days,
        });
      } catch {
        continue;
      }
    }
    for (const key of Object.keys(result) as ExpiryGroup[]) {
      result[key].sort((a, b) => a.days - b.days);
    }
    return result;
  }, [products]);

  const totalTracked = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  const hasAny = totalTracked > 0;

  return (
    <div className="space-y-5 page-enter">
      <div>
        <h2 className="text-xl font-black tracking-tight">Expiry Tracker</h2>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">
          {isLoading ? "Loading…" : hasAny ? `${totalTracked} item${totalTracked !== 1 ? "s" : ""} with expiry dates tracked` : "No items with expiry dates set"}
        </p>
      </div>

      {isLoading ? (
        <phantom-ui loading count={3} count-gap={12}>
          <div className="h-16 rounded-2xl border border-border bg-card flex items-center gap-3 px-4">
            <div className="flex-1">
              <div className="font-semibold">Product Name</div>
              <div className="text-sm text-muted-foreground">Expires Jan 1, 2025 · 10 units</div>
            </div>
            <div className="text-xs font-bold text-amber-500">7 days</div>
          </div>
        </phantom-ui>
      ) : !hasAny ? (
        <div className="glass-card rounded-3xl py-16 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <CalendarClock className="h-8 w-8 opacity-25" strokeWidth={1.5} />
          </div>
          <p className="font-bold text-base">No expiry dates set</p>
          <p className="text-sm text-muted-foreground/70 max-w-[240px]">
            Add an expiry date to products in your inventory to track them here.
          </p>
          <Link href="/products">
            <button className="mt-2 px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-bold shadow-md hover:opacity-90 transition-opacity" data-testid="button-go-to-products">
              Go to Inventory
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {(["expired", "critical", "warning", "ok"] as ExpiryGroup[]).map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            const meta = GROUP_META[group];
            const Icon = meta.icon;
            return (
              <div key={group} className="space-y-2.5">
                <div className={["rounded-2xl border px-4 py-3 flex items-center gap-2.5", meta.bg, meta.border].join(" ")}>
                  <Icon className={["h-4 w-4 shrink-0", meta.text].join(" ")} />
                  <div className="flex-1 min-w-0">
                    <p className={["font-bold text-sm", meta.text].join(" ")}>{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{meta.description}</p>
                  </div>
                  <span className={["text-xs font-black tabular-nums", meta.text].join(" ")}>{items.length}</span>
                </div>
                <div className="space-y-2 pl-1">
                  {items.map(p => <ProductRow key={p.id} p={p} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
