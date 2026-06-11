import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { nativeFetch } from "@/lib/queryClient";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldAlert, Hash, Download, RefreshCw,
  Search, CheckCircle2, XCircle, AlertTriangle, FileText,
  Trash2, Clock, User, Calendar, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";

interface VoidEntry {
  id: number;
  orNumber: string | null;
  receiptNumber: string | null;
  total: string;
  voidReason: string | null;
  deletedAt: string;
  deletedByName: string | null;
  saleHash: string | null;
  hashStatus: "ok" | "tampered" | "missing";
  createdAt: string;
}

interface VoidTrailResponse {
  entries: VoidEntry[];
  totalVoided: number;
  tampered: number;
  missingHash: number;
  verifiedAt: string;
}

function HashBadge({ status }: { status: VoidEntry["hashStatus"] }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold whitespace-nowrap">
        <CheckCircle2 className="h-3 w-3" />
        VERIFIED
      </span>
    );
  }
  if (status === "tampered") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold whitespace-nowrap">
        <XCircle className="h-3 w-3" />
        TAMPERED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold whitespace-nowrap">
      <AlertTriangle className="h-3 w-3" />
      NO HASH
    </span>
  );
}

export default function BirAuditLogPage() {
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const [search, setSearch] = useState("");
  const [hashFilter, setHashFilter] = useState<"all" | "ok" | "tampered" | "missing">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<VoidTrailResponse>({
    queryKey: ["/api/bir/void-trail"],
    staleTime: 60_000,
  });

  const entries = data?.entries ?? [];

  const filtered = useMemo(() => {
    let list = entries;

    if (hashFilter !== "all") list = list.filter(e => e.hashStatus === hashFilter);

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      list = list.filter(e => new Date(e.deletedAt) >= from);
    }
    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      list = list.filter(e => new Date(e.deletedAt) <= to);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        (e.orNumber ?? "").toLowerCase().includes(q) ||
        (e.receiptNumber ?? "").toLowerCase().includes(q) ||
        (e.voidReason ?? "").toLowerCase().includes(q) ||
        (e.deletedByName ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [entries, search, hashFilter, dateFrom, dateTo]);

  const totalVoidedAmount = useMemo(
    () => filtered.reduce((sum, e) => sum + parseFloat(e.total || "0"), 0),
    [filtered]
  );

  function clearFilters() {
    setSearch("");
    setHashFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  const hasFilters = search || hashFilter !== "all" || dateFrom || dateTo;

  function downloadCsv() {
    nativeFetch("/api/bir/void-trail/export")
      .then(r => {
        if (!r.ok) throw new Error("Export failed");
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BIR-VoidAuditLog-${format(new Date(), "yyyy-MM-dd")}.csv`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Void audit log exported" });
      })
      .catch(() => toast({ title: "Export failed", variant: "destructive" }));
  }

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash).then(() =>
      toast({ title: "Hash copied to clipboard", description: hash.slice(0, 16) + "…" })
    );
  }

  const integrityOk = (data?.tampered ?? 0) === 0;
  const verifiedAt = data?.verifiedAt ? format(new Date(data.verifiedAt), "MMM d, yyyy HH:mm:ss") : null;
  const verifiedCount = data ? data.totalVoided - (data.tampered + data.missingHash) : 0;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">BIR Void Audit Log</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Immutable void trail with SHA-256 hash verification · For BIR auditor review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-void-trail"
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={downloadCsv}
            data-testid="button-export-void-trail"
            className="gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Integrity banner */}
      <div className={cn(
        "rounded-2xl border p-4",
        integrityOk ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"
      )}>
        <div className="flex items-center gap-4 flex-wrap">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            integrityOk ? "bg-emerald-500/10" : "bg-rose-500/10"
          )}>
            {integrityOk
              ? <ShieldCheck className="h-5 w-5 text-emerald-500" />
              : <ShieldAlert className="h-5 w-5 text-rose-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm font-bold", integrityOk ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
              {integrityOk
                ? "Chain integrity verified — no tampering detected"
                : `${data?.tampered ?? 0} tampered record${(data?.tampered ?? 0) !== 1 ? "s" : ""} detected`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data
                ? `${data.totalVoided} voided sales checked · ${data.missingHash} without hash · Verified ${verifiedAt}`
                : "Loading verification results…"}
            </p>
          </div>

          {/* Summary pills */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="text-center bg-background/60 border border-border/50 rounded-xl px-3 py-1.5 min-w-[64px]">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Voided</p>
              <p className="text-sm font-bold tabular-nums">{data?.totalVoided ?? "—"}</p>
            </div>
            <div className="text-center bg-background/60 border border-border/50 rounded-xl px-3 py-1.5 min-w-[80px]">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Voided Value</p>
              <p className="text-sm font-bold tabular-nums">
                {data ? formatCurrency(entries.reduce((s, e) => s + parseFloat(e.total || "0"), 0), currency) : "—"}
              </p>
            </div>
            <div className="text-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 min-w-[64px]">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Verified</p>
              <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{data ? verifiedCount : "—"}</p>
            </div>
            {(data?.tampered ?? 0) > 0 && (
              <div className="text-center bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5 min-w-[64px]">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Tampered</p>
                <p className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{data?.tampered}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="OR number, reason, staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-void-search"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 text-xs w-[130px]"
            data-testid="input-void-date-from"
            placeholder="From"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 text-xs w-[130px]"
            data-testid="input-void-date-to"
            placeholder="To"
          />
        </div>

        {/* Hash filter pills */}
        <div className="flex items-center gap-1">
          {(["all", "ok", "tampered", "missing"] as const).map(f => (
            <button
              key={f}
              onClick={() => setHashFilter(f)}
              data-testid={`filter-hash-${f}`}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border",
                hashFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/40 hover:bg-muted/40"
              )}
            >
              {f === "all" ? "All" : f === "ok" ? "Verified" : f === "tampered" ? "Tampered" : "No Hash"}
            </button>
          ))}
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Showing count when filtered */}
      {hasFilters && !isLoading && (
        <p className="text-[11px] text-muted-foreground">
          Showing {filtered.length} of {entries.length} records
          {filtered.length > 0 && ` · Subtotal: ${formatCurrency(totalVoidedAmount, currency)}`}
        </p>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 overflow-hidden bg-card">
        {/* Table header — horizontal scroll on small screens */}
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Column headers */}
            <div className="grid grid-cols-[90px_90px_100px_1fr_140px_120px] gap-0 border-b border-border/40 bg-muted/30 px-4 py-2.5">
              {["OR Number", "Receipt", "Total", "Void Reason", "Voided At", "Hash Integrity"].map(h => (
                <p key={h} className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate">{h}</p>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40 gap-2">
                <Trash2 className="h-8 w-8" strokeWidth={1.2} />
                <p className="text-xs font-medium">
                  {entries.length === 0 ? "No voided sales found" : "No results match your filter"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filtered.map(entry => (
                  <div
                    key={entry.id}
                    className={cn(
                      "grid grid-cols-[90px_90px_100px_1fr_140px_120px] gap-0 px-4 py-3 items-center hover:bg-muted/20 transition-colors",
                      entry.hashStatus === "tampered" && "bg-rose-500/5"
                    )}
                    data-testid={`void-entry-${entry.id}`}
                  >
                    {/* OR Number */}
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold tabular-nums truncate text-foreground">
                        {entry.orNumber ?? "—"}
                      </p>
                      {entry.deletedByName && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <User className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
                          <p className="text-[9px] text-muted-foreground truncate">{entry.deletedByName}</p>
                        </div>
                      )}
                    </div>

                    {/* Receipt */}
                    <p className="text-xs text-muted-foreground tabular-nums truncate pr-2">
                      {entry.receiptNumber ?? "—"}
                    </p>

                    {/* Total */}
                    <p className="text-xs font-semibold tabular-nums">
                      {formatCurrency(parseFloat(entry.total || "0"), currency)}
                    </p>

                    {/* Void Reason */}
                    <p className="text-xs text-muted-foreground truncate pr-3" title={entry.voidReason ?? ""}>
                      {entry.voidReason || <span className="italic opacity-40">No reason given</span>}
                    </p>

                    {/* Voided At */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold tabular-nums">
                          {format(new Date(entry.deletedAt), "MMM d, yyyy")}
                        </p>
                        <p className="text-[9px] text-muted-foreground tabular-nums">
                          {format(new Date(entry.deletedAt), "HH:mm:ss")}
                        </p>
                      </div>
                    </div>

                    {/* Hash status */}
                    <div className="flex items-center gap-1.5 pl-2 shrink-0">
                      <HashBadge status={entry.hashStatus} />
                      {entry.saleHash && (
                        <button
                          title={`Copy SHA-256: ${entry.saleHash}`}
                          className="text-muted-foreground/40 hover:text-primary transition-colors"
                          data-testid={`hash-copy-${entry.id}`}
                          onClick={() => copyHash(entry.saleHash!)}
                        >
                          <Hash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer note */}
      {entries.length >= 1000 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center font-medium">
          Showing the 1,000 most recent void records. Use the date range filter to narrow results, or export CSV for the full dataset.
        </p>
      )}

      {/* Legend */}
      <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-bold text-foreground">Hash Verification Legend</p>
        </div>
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">VERIFIED</strong> — The SHA-256 hash matches the stored fiscal fields. The record has not been modified since creation.</span>
          </div>
          <div className="flex items-start gap-2">
            <XCircle className="h-3 w-3 text-rose-500 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">TAMPERED</strong> — Hash mismatch detected. OR number, totals, or VAT fields may have been modified after initial recording.</span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
            <span><strong className="text-foreground">NO HASH</strong> — Record was created before hash generation was enabled. Cannot be cryptographically verified.</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/50 pt-1 border-t border-border/30">
          Hash covers: user_id · receipt_number · or_number · invoice_number · subtotal · tax · discount · vatable_sales · vat_exempt_sales · zero_rated_sales · total · discount_type · created_at — joined with "|", SHA-256 encoded.
        </p>
      </div>
    </div>
  );
}
