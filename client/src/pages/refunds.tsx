import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RotateCcw, Search, X, Hash, UserCircle2, Calendar, ChevronDown, Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { RefundWithDetails } from "@shared/schema";

type DateFilter = "all" | "today" | "week" | "month";

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

export default function Refunds() {
  const { data: settings } = useSettings();
  const { isOwner } = useAuth();
  const currency = (settings as any)?.currency || "₱";

  const { data: refunds = [], isLoading } = useQuery<RefundWithDetails[]>({
    queryKey: ["/api/refunds"],
    queryFn: async () => {
      const res = await fetch("/api/refunds", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const filtered = useMemo(() => {
    let result = [...refunds];

    if (dateFilter === "today") {
      const today = new Date().toDateString();
      result = result.filter(r => new Date(r.createdAt!).toDateString() === today);
    } else if (dateFilter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      result = result.filter(r => new Date(r.createdAt!) >= weekAgo);
    } else if (dateFilter === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      result = result.filter(r => new Date(r.createdAt!) >= monthAgo);
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().replace(/^txn-?/i, "").replace(/^#/i, "").replace(/^ref-?/i, "");
      result = result.filter(r => {
        const refundId = String(r.id);
        const saleId = String(r.saleId);
        const salePadded = saleId.padStart(4, "0");
        const reason = (r.reason || "").toLowerCase();
        const processedBy = (r.processedByName || r.processedByEmail || "").toLowerCase();
        return refundId.includes(q) || saleId.includes(q) || salePadded.includes(q)
          || reason.includes(q) || processedBy.includes(q);
      });
    }

    return result;
  }, [refunds, debouncedSearch, dateFilter]);

  const totalRefunded = filtered.reduce((acc, r) => acc + parseNumeric(r.amount), 0);

  const dateFilterLabels: Record<DateFilter, string> = {
    all: "All time",
    today: "Today",
    week: "This week",
    month: "This month",
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
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Refunds</p>
          <p className="text-lg font-bold">
            {filtered.length}
            <span className="text-sm font-normal text-muted-foreground ml-1">{filtered.length === 1 ? "refund" : "refunds"}</span>
          </p>
        </div>
        <div className="w-px h-8 bg-border hidden sm:block" />
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Refunded</p>
          <p className="text-lg font-bold text-rose-500 tabular-nums">{formatCurrency(totalRefunded, currency)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by TXN ID, reason, staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-refund-search"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <DropdownMenu
          trigger={
            <button className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Calendar className="h-3.5 w-3.5" />
              <span>{dateFilterLabels[dateFilter]}</span>
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          }
        >
          {(["all", "today", "week", "month"] as DateFilter[]).map(f => (
            <DropdownItem key={f} active={dateFilter === f} onClick={() => setDateFilter(f)}>
              {dateFilterLabels[f]}
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
                  <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Refund #
                  </TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Transaction
                  </TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap text-right">
                    Amount
                  </TableHead>
                  {isOwner && (
                    <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      Processed By
                    </TableHead>
                  )}
                  <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Date & Time
                  </TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Reason
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((refund) => (
                  <TableRow
                    key={refund.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border-black/4 dark:border-white/4"
                    data-testid={`row-refund-${refund.id}`}
                  >
                    {/* Refund ID */}
                    <TableCell className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                        <RotateCcw className="h-3 w-3 text-rose-500 shrink-0" />
                        REF-{String(refund.id).padStart(4, "0")}
                      </span>
                    </TableCell>

                    {/* Sale TXN ID */}
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 text-xs font-mono font-medium">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          TXN-{String(refund.saleId).padStart(4, "0")}
                        </span>
                        {refund.saleCreatedAt && (
                          <span className="text-[10px] text-muted-foreground/70">
                            Original: {format(new Date(refund.saleCreatedAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="px-4 py-3 text-right">
                      <span className="font-bold tabular-nums text-rose-500">
                        -{formatCurrency(refund.amount, currency)}
                      </span>
                    </TableCell>

                    {/* Processed By — owner only */}
                    {isOwner && (
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <UserCircle2 className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {refund.processedByName || "Unknown"}
                            </p>
                            {refund.processedByEmail && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {refund.processedByEmail}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    )}

                    {/* Date & Time */}
                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(refund.createdAt!), "MMM d, yyyy")}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {format(new Date(refund.createdAt!), "h:mm a")}
                        </span>
                      </div>
                    </TableCell>

                    {/* Reason */}
                    <TableCell className="px-4 py-3 max-w-[200px]">
                      <span className="text-sm text-foreground/70 truncate block">
                        {refund.reason || <span className="text-muted-foreground/60 italic">No reason provided</span>}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2">
            <RotateCcw className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-semibold">No refunds found</p>
          <p className="text-sm text-muted-foreground/70">
            {search ? "Try adjusting your search or filters" : "Refunds will appear here once processed"}
          </p>
        </div>
      )}
    </div>
  );
}
