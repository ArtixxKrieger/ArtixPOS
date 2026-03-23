import { useSales } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, isToday, isThisWeek, isThisMonth, startOfDay, endOfDay, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Receipt, Search, SlidersHorizontal, X, Calendar, ChevronDown, Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import { SaleDetailModal } from "@/components/sale-detail-modal";

type DateFilter = "all" | "today" | "week" | "month" | "custom";
type PaymentFilter = "all" | "cash" | "online";

const ALL_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "items", label: "Items" },
  { key: "method", label: "Method" },
  { key: "subtotal", label: "Subtotal" },
  { key: "tax", label: "Tax" },
  { key: "discount", label: "Discount" },
  { key: "total", label: "Total" },
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

const DEFAULT_COLUMNS: ColumnKey[] = ["date", "time", "items", "method", "total"];

function DropdownMenu({
  trigger,
  children,
  align = "left",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={[
              "absolute z-50 mt-1.5 min-w-[160px] glass-card rounded-xl border border-border shadow-xl py-1 animate-in fade-in slide-in-from-top-2 duration-150",
              align === "right" ? "right-0" : "left-0",
            ].join(" ")}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function DropdownItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/5 transition-colors text-left"
    >
      <span className={["h-4 w-4 shrink-0", active ? "text-primary" : "text-transparent"].join(" ")}>
        <Check className="h-4 w-4" />
      </span>
      <span className={active ? "font-semibold text-primary" : ""}>{children}</span>
    </button>
  );
}

export default function Transactions() {
  const { data: sales = [], isLoading } = useSales();
  const { data: settings } = useSettings();
  const currency = (settings as any)?.currency || "₱";

  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = [...sales].reverse();

    // Date filter
    if (dateFilter === "today") {
      result = result.filter(s => isToday(new Date(s.createdAt!)));
    } else if (dateFilter === "week") {
      result = result.filter(s => isThisWeek(new Date(s.createdAt!), { weekStartsOn: 1 }));
    } else if (dateFilter === "month") {
      result = result.filter(s => isThisMonth(new Date(s.createdAt!)));
    } else if (dateFilter === "custom" && customFrom) {
      const from = startOfDay(parseISO(customFrom));
      const to = customTo ? endOfDay(parseISO(customTo)) : endOfDay(new Date());
      result = result.filter(s => {
        const d = new Date(s.createdAt!);
        return d >= from && d <= to;
      });
    }

    // Payment filter
    if (paymentFilter !== "all") {
      result = result.filter(s => s.paymentMethod === paymentFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => {
        const items = (s.items as any[]) || [];
        const itemNames = items.map((i: any) => i.product?.name || "").join(" ").toLowerCase();
        const id = String(s.id);
        const method = (s.paymentMethod || "").toLowerCase();
        return itemNames.includes(q) || id.includes(q) || method.includes(q);
      });
    }

    return result;
  }, [sales, dateFilter, paymentFilter, customFrom, customTo, search]);

  const totalRevenue = filtered.reduce((acc, s) => acc + parseNumeric(s.total), 0);

  const dateFilterLabels: Record<DateFilter, string> = {
    all: "All time",
    today: "Today",
    week: "This week",
    month: "This month",
    custom: "Custom range",
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-in fade-in">
        <div className="h-12 skeleton-shimmer rounded-2xl" />
        <div className="h-96 skeleton-shimmer rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 page-enter">

      {/* Summary bar */}
      <div className="glass-card rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Showing</p>
          <p className="text-lg font-bold">{filtered.length} <span className="text-sm font-normal text-muted-foreground">{filtered.length === 1 ? "transaction" : "transactions"}</span></p>
        </div>
        <div className="w-px h-8 bg-border hidden sm:block" />
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
          <p className="text-lg font-bold text-primary tabular-nums">{formatCurrency(totalRevenue, currency)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[180px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search items, ID, method…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Date filter */}
        <DropdownMenu
          trigger={
            <button className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Calendar className="h-3.5 w-3.5" />
              <span>{dateFilterLabels[dateFilter]}</span>
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          }
        >
          {(["all", "today", "week", "month", "custom"] as DateFilter[]).map(f => (
            <DropdownItem key={f} active={dateFilter === f} onClick={() => setDateFilter(f)}>
              {dateFilterLabels[f]}
            </DropdownItem>
          ))}
        </DropdownMenu>

        {/* Custom date inputs */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="h-9 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Payment filter */}
        <DropdownMenu
          trigger={
            <button className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <span>{paymentFilter === "all" ? "All methods" : paymentFilter === "cash" ? "Cash" : "Online"}</span>
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          }
        >
          <DropdownItem active={paymentFilter === "all"} onClick={() => setPaymentFilter("all")}>All methods</DropdownItem>
          <DropdownItem active={paymentFilter === "cash"} onClick={() => setPaymentFilter("cash")}>Cash</DropdownItem>
          <DropdownItem active={paymentFilter === "online"} onClick={() => setPaymentFilter("online")}>Online</DropdownItem>
        </DropdownMenu>

        {/* Column picker */}
        <DropdownMenu
          align="right"
          trigger={
            <button className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </button>
          }
        >
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Toggle columns</p>
          {ALL_COLUMNS.map(col => (
            <DropdownItem
              key={col.key}
              active={visibleColumns.has(col.key)}
              onClick={() => toggleColumn(col.key)}
            >
              {col.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white/60 dark:bg-black/40 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-black/5 dark:border-white/5">
                  {ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(col => (
                    <TableHead
                      key={col.key}
                      className={[
                        "py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                        col.key === "total" || col.key === "subtotal" || col.key === "tax" || col.key === "discount"
                          ? "text-right px-5"
                          : "px-4",
                      ].join(" ")}
                    >
                      {col.label}
                    </TableHead>
                  ))}
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sale) => {
                  const items = (sale.items as any[]) || [];
                  const itemsSummary = items.length === 1
                    ? items[0]?.product?.name || "1 item"
                    : `${items.length} items`;
                  const isOnline = sale.paymentMethod === "online";

                  return (
                    <TableRow
                      key={sale.id}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border-black/4 dark:border-white/4 cursor-pointer"
                      onClick={() => setSelectedSale(sale)}
                    >
                      {visibleColumns.has("id") && (
                        <TableCell className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          #{String(sale.id).padStart(4, "0")}
                        </TableCell>
                      )}
                      {visibleColumns.has("date") && (
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(sale.createdAt!), "MMM d, yyyy")}
                        </TableCell>
                      )}
                      {visibleColumns.has("time") && (
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(sale.createdAt!), "h:mm a")}
                        </TableCell>
                      )}
                      {visibleColumns.has("items") && (
                        <TableCell className="px-4 py-3 text-sm text-foreground/70 max-w-[160px]">
                          <span className="truncate block">{itemsSummary}</span>
                        </TableCell>
                      )}
                      {visibleColumns.has("method") && (
                        <TableCell className="px-4 py-3">
                          <span className={[
                            "px-2.5 py-1 rounded-lg text-[10px] font-semibold",
                            isOnline
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          ].join(" ")}>
                            {isOnline ? "Online" : "Cash"}
                          </span>
                        </TableCell>
                      )}
                      {visibleColumns.has("subtotal") && (
                        <TableCell className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(sale.subtotal, currency)}
                        </TableCell>
                      )}
                      {visibleColumns.has("tax") && (
                        <TableCell className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(sale.tax, currency)}
                        </TableCell>
                      )}
                      {visibleColumns.has("discount") && (
                        <TableCell className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(sale.discount, currency)}
                        </TableCell>
                      )}
                      {visibleColumns.has("total") && (
                        <TableCell className="px-5 py-3 text-right font-bold text-primary tabular-nums">
                          {formatCurrency(sale.total, currency)}
                        </TableCell>
                      )}
                      <TableCell className="w-8 pr-3 text-muted-foreground/30 text-right">
                        <ChevronDown className="h-3.5 w-3.5 -rotate-90 inline" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Receipt className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-semibold">No transactions found</p>
          <p className="text-sm text-muted-foreground/70">Try adjusting your filters or search query</p>
        </div>
      )}

      <SaleDetailModal
        sale={selectedSale}
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
}
