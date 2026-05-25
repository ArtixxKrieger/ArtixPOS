import { useSales, type SalesQueryParams } from "@/hooks/use-sales";
import { useSettings } from "@/hooks/use-settings";
import { useBusinessTerminology } from "@/hooks/use-branch-business";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Receipt, Search, SlidersHorizontal, X, Calendar, ChevronDown, Check, RotateCcw, Ban, Download,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { SaleDetailModal } from "@/components/sale-detail-modal";
import { PhantomLoader } from "@/components/ui/phantom-loader";

type DateFilter = "all" | "today" | "week" | "month" | "custom";
type PaymentFilter = "all" | "cash" | "card" | "gcash" | "maya" | "online";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  online: "Online",
  gcash: "GCash",
  maya: "Maya",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  card: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  online: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  gcash: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  maya: "bg-green-500/10 text-green-600 dark:text-green-400",
};

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

function getServerParams(dateFilter: DateFilter, customFrom: string, customTo: string, includeVoided: boolean): SalesQueryParams {
  const now = new Date();
  const base: SalesQueryParams = { includeVoided };
  if (dateFilter === "today") {
    return { ...base, startDate: startOfDay(now).toISOString(), endDate: endOfDay(now).toISOString(), limit: 500 };
  }
  if (dateFilter === "week") {
    return { ...base, startDate: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), endDate: endOfDay(now).toISOString(), limit: 500 };
  }
  if (dateFilter === "month") {
    return { ...base, startDate: startOfMonth(now).toISOString(), endDate: endOfDay(now).toISOString(), limit: 1000 };
  }
  if (dateFilter === "custom" && customFrom) {
    return {
      ...base,
      startDate: startOfDay(parseISO(customFrom)).toISOString(),
      endDate: customTo ? endOfDay(parseISO(customTo)).toISOString() : endOfDay(now).toISOString(),
      limit: 2000,
    };
  }
  return { ...base, limit: 500 };
}

export default function Transactions() {
  const { data: settings } = useSettings();
  const { transactionLabel, productPlural } = useBusinessTerminology();
  const currency = (settings as any)?.currency || "₱";

  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));
  const [includeVoided, setIncludeVoided] = useState(false);

  const serverParams = useMemo(
    () => getServerParams(dateFilter, customFrom, customTo, includeVoided),
    [dateFilter, customFrom, customTo, includeVoided]
  );
  const { data: sales = [], isLoading } = useSales(serverParams);

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
    let result = [...sales];

    if (paymentFilter !== "all") {
      result = result.filter(s => s.paymentMethod === paymentFilter);
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().replace(/^txn-?/i, "");
      result = result.filter(s => {
        const items = (s.items as any[]) || [];
        const itemNames = items.map((i: any) => i.product?.name || "").join(" ").toLowerCase();
        const id = String(s.id);
        const paddedId = id.padStart(4, "0");
        const method = (s.paymentMethod || "").toLowerCase();
        return itemNames.includes(q) || id.includes(q) || paddedId.includes(q) || method.includes(q);
      });
    }

    return result;
  }, [sales, paymentFilter, debouncedSearch]);

  const activeFiltered = filtered.filter(s => !(s as any).deletedAt);
  const totalRevenue = activeFiltered.reduce((acc, s) => acc + parseNumeric(s.total), 0);
  const voidedCount = filtered.filter(s => !!(s as any).deletedAt).length;

  const dateFilterLabels: Record<DateFilter, string> = {
    all: "All time",
    today: "Today",
    week: "This week",
    month: "This month",
    custom: "Custom range",
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (serverParams.startDate) params.set("startDate", serverParams.startDate.slice(0, 10));
    if (serverParams.endDate) params.set("endDate", serverParams.endDate.slice(0, 10));
    window.open(`/api/sales/export?${params.toString()}`, "_blank");
  };

  return (
    <PhantomLoader loading={isLoading}>
    <div className="space-y-4 page-enter">

      {/* Summary bar */}
      <div className="glass-card rounded-2xl px-4 md:px-5 py-4 flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Showing</p>
          <p className="text-lg font-bold">{filtered.length} <span className="text-sm font-normal text-muted-foreground">{filtered.length === 1 ? "transaction" : "transactions"}</span></p>
        </div>
        <div className="w-px h-8 bg-border hidden sm:block" />
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
          <p className="text-lg font-bold text-primary tabular-nums">{formatCurrency(totalRevenue, currency)}</p>
        </div>
        {includeVoided && voidedCount > 0 && (
          <>
            <div className="w-px h-8 bg-border hidden sm:block" />
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Voided</p>
              <p className="text-lg font-bold text-rose-500 tabular-nums">{voidedCount}</p>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Export CSV */}
          <button
            onClick={handleExport}
            className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-export-csv"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {/* Voided toggle */}
          <button
            onClick={() => setIncludeVoided(v => !v)}
            className={[
              "h-9 px-3 flex items-center gap-1.5 rounded-xl border text-sm font-medium transition-colors",
              includeVoided
                ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                : "bg-background border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
            data-testid="button-toggle-voided"
          >
            <Ban className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{includeVoided ? "Hide Voided" : "Show Voided"}</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[160px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={`Search ${productPlural.toLowerCase()}, TXN ID, method…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-search-transactions"
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
              <span className="hidden xs:inline">{dateFilterLabels[dateFilter]}</span>
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
          <div className="flex items-center gap-1.5 flex-wrap">
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
              <span className="hidden xs:inline">{paymentFilter === "all" ? "All methods" : (PAYMENT_LABELS[paymentFilter] ?? paymentFilter)}</span>
              <span className="xs:hidden">Pay</span>
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          }
        >
          <DropdownItem active={paymentFilter === "all"} onClick={() => setPaymentFilter("all")}>All methods</DropdownItem>
          <DropdownItem active={paymentFilter === "cash"} onClick={() => setPaymentFilter("cash")}>Cash</DropdownItem>
          <DropdownItem active={paymentFilter === "card"} onClick={() => setPaymentFilter("card")}>Card</DropdownItem>
          <DropdownItem active={paymentFilter === "gcash"} onClick={() => setPaymentFilter("gcash")}>GCash</DropdownItem>
          <DropdownItem active={paymentFilter === "maya"} onClick={() => setPaymentFilter("maya")}>Maya</DropdownItem>
          <DropdownItem active={paymentFilter === "online"} onClick={() => setPaymentFilter("online")}>Online</DropdownItem>
        </DropdownMenu>

        {/* Column picker — desktop only */}
        <DropdownMenu
          align="right"
          trigger={
            <button className="hidden md:flex h-9 px-3 items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Columns</span>
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

      {/* Mobile card list — shown on small screens */}
      {filtered.length > 0 ? (
        <>
          {/* Mobile cards (sm and below) */}
          <div className="md:hidden space-y-2">
            {filtered.map((sale) => {
              const items = (sale.items as any[]) || [];
              const itemsSummary = items.length === 1
                ? (items[0]?.product?.name || items[0]?.name || items[0]?.title || "1 item")
                : `${items.length} items`;
              const method = sale.paymentMethod || "cash";
              const isRefunded = !!(sale as any).refundedAt;
              const isVoided = !!(sale as any).deletedAt;

              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSale(sale)}
                  className={[
                    "glass-card glow-hover-card rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform",
                    isVoided ? "opacity-60 border-rose-500/10" : "",
                  ].join(" ")}
                  data-testid={`card-transaction-${sale.id}`}
                >
                  {/* Icon */}
                  <div className={[
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    isVoided ? "bg-rose-500/10" : "bg-primary/8",
                  ].join(" ")}>
                    {isVoided
                      ? <Ban className="h-4 w-4 text-rose-500" />
                      : <Receipt className="h-4 w-4 text-primary" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono text-muted-foreground">TXN-{String(sale.id).padStart(4, "0")}</span>
                      {isVoided && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-500 uppercase">
                          VOID
                        </span>
                      )}
                      {isRefunded && !isVoided && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/10 text-rose-500">
                          <RotateCcw className="h-2 w-2" /> Refunded
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate mt-0.5">{itemsSummary}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(sale.createdAt!), "MMM d · h:mm a")}
                      </span>
                      <span className={[
                        "px-2 py-0.5 rounded-md text-[10px] font-semibold",
                        PAYMENT_COLORS[method] ?? "bg-muted text-muted-foreground",
                      ].join(" ")}>
                        {PAYMENT_LABELS[method] ?? method}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <div className="shrink-0 text-right">
                    <p className={["text-sm font-bold tabular-nums", isVoided ? "text-rose-500 line-through" : "text-primary"].join(" ")}>
                      {formatCurrency(sale.total, currency)}
                    </p>
                    <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground/40 ml-auto mt-0.5" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block glass-card rounded-2xl overflow-hidden">
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
                      ? (items[0]?.product?.name || items[0]?.name || items[0]?.title || "1 item")
                      : `${items.length} items`;
                    const method = sale.paymentMethod || "cash";
                    const isRefunded = !!(sale as any).refundedAt;
                    const isVoided = !!(sale as any).deletedAt;

                    return (
                      <TableRow
                        key={sale.id}
                        className={[
                          "hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border-black/4 dark:border-white/4 cursor-pointer",
                          isVoided ? "opacity-60" : "",
                        ].join(" ")}
                        onClick={() => setSelectedSale(sale)}
                        data-testid={`row-transaction-${sale.id}`}
                      >
                        {visibleColumns.has("id") && (
                          <TableCell className="px-4 py-3 text-xs font-mono text-muted-foreground">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              #{String(sale.id).padStart(4, "0")}
                              {isVoided && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-500 uppercase">
                                  <Ban className="h-2 w-2" /> VOID
                                </span>
                              )}
                              {isRefunded && !isVoided && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/10 text-rose-500">
                                  <RotateCcw className="h-2 w-2" /> Refunded
                                </span>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.has("date") && (
                          <TableCell className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {format(new Date(sale.createdAt!), "MMM d, yyyy")}
                              {isVoided && !visibleColumns.has("id") && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-500 uppercase">
                                  VOID
                                </span>
                              )}
                              {isRefunded && !isVoided && !visibleColumns.has("id") && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/10 text-rose-500">
                                  <RotateCcw className="h-2 w-2" /> Refunded
                                </span>
                              )}
                            </div>
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
                              PAYMENT_COLORS[method] ?? "bg-muted text-muted-foreground",
                            ].join(" ")}>
                              {PAYMENT_LABELS[method] ?? method}
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
                            {formatCurrency(sale.tax ?? "0", currency)}
                          </TableCell>
                        )}
                        {visibleColumns.has("discount") && (
                          <TableCell className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
                            {formatCurrency(sale.discount ?? "0", currency)}
                          </TableCell>
                        )}
                        {visibleColumns.has("total") && (
                          <TableCell className={["px-5 py-3 text-right font-bold tabular-nums", isVoided ? "text-rose-500 line-through" : "text-primary"].join(" ")}>
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
        </>
      ) : (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <Receipt className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-semibold">No transactions found</p>
          <p className="text-sm text-muted-foreground/70">Try adjusting your filters or search query</p>
        </div>
    </PhantomLoader>
      )}

      <SaleDetailModal
        sale={selectedSale}
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
}
