import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldAlert, Hash, Download, RefreshCw,
  Search, CheckCircle2, XCircle, AlertTriangle, FileText,
  Trash2, Clock, User,
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
        <CheckCircle2 className="h-3 w-3" />
        VERIFIED
      </span>
    );
  }
  if (status === "tampered") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-bold">
        <XCircle className="h-3 w-3" />
        TAMPERED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
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

  const { data, isLoading, refetch, isFetching } = useQuery<VoidTrailResponse>({
    queryKey: ["/api/bir/void-trail"],
    staleTime: 60_000,
  });

  const entries = data?.entries ?? [];

  const filtered = useMemo(() => {
    let list = entries;
    if (hashFilter !== "all") list = list.filter(e => e.hashStatus === hashFilter);
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
  }, [entries, search, hashFilter]);

  function downloadCsv() {
    const token = localStorage.getItem("artixpos_token") ?? "";
    fetch("/api/bir/void-trail/export", {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
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

  const integrityOk = (data?.tampered ?? 0) === 0;
  const verifiedAt = data?.verifiedAt ? format(new Date(data.verifiedAt), "MMM d, yyyy HH:mm:ss") : null;

  return (
    <div className="space-y-5 max-w-5xl">
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
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
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
        "rounded-2xl border p-4 flex items-center gap-4",
        integrityOk
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-rose-500/5 border-rose-500/20"
      )}>
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
            {integrityOk ? "Chain integrity verified — no tampering detected" : `${data?.tampered ?? 0} tampered record${(data?.tampered ?? 0) !== 1 ? "s" : ""} detected`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data
              ? `${data.totalVoided} voided sales checked · ${data.missingHash} without hash · Verified ${verifiedAt}`
              : "Loading verification results…"}
          </p>
        </div>

        {/* Summary pills */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="text-center bg-background/60 border border-border/50 rounded-xl px-3 py-1.5">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Total Voided</p>
            <p className="text-sm font-bold tabular-nums">{data?.totalVoided ?? "—"}</p>
          </div>
          <div className="text-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Verified</p>
            <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {data ? data.totalVoided - (data.tampered + data.missingHash) : "—"}
            </p>
          </div>
          {(data?.tampered ?? 0) > 0 && (
            <div className="text-center bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Tampered</p>
              <p className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">{data?.tampered}</p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search OR number, reason, staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            data-testid="input-void-search"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "ok", "tampered", "missing"] as const).map(f => (
            <button
              key={f}
              onClick={() => setHashFilter(f)}
              data-testid={`filter-hash-${f}`}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-semibold transition-all border",
                hashFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border/40 hover:bg-muted/40"
              )}
            >
              {f === "all" ? "All" : f === "ok" ? "Verified" : f === "tampered" ? "Tampered" : "No Hash"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 overflow-hidden bg-card">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1.5fr_auto_auto] gap-0 border-b border-border/40 bg-muted/30 px-4 py-2.5">
          {["OR Number", "Receipt", "Total", "Void Reason", "Voided At", "Hash"].map(h => (
            <p key={h} className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider truncate">{h}</p>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground/50 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-xs font-medium">Verifying hashes…</span>
          </div>
        ) : filtered.length === 0 ? (
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
                  "grid grid-cols-[1fr_1fr_1fr_1.5fr_auto_auto] gap-0 px-4 py-3 items-center hover:bg-muted/20 transition-colors",
                  entry.hashStatus === "tampered" && "bg-rose-500/5"
                )}
                data-testid={`void-entry-${entry.id}`}
              >
                {/* OR Number */}
                <div className="min-w-0">
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
                <p className="text-xs text-muted-foreground tabular-nums truncate">
                  {entry.receiptNumber ?? "—"}
                </p>

                {/* Total */}
                <p className="text-xs font-semibold tabular-nums">
                  {formatCurrency(parseFloat(entry.total || "0"), currency)}
                </p>

                {/* Void Reason */}
                <p className="text-xs text-muted-foreground truncate pr-3" title={entry.voidReason ?? ""}>
                  {entry.voidReason || <span className="italic opacity-50">No reason given</span>}
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
                <div className="flex items-center gap-2 pl-3 shrink-0">
                  <HashBadge status={entry.hashStatus} />
                  {entry.saleHash && (
                    <button
                      title={`SHA-256: ${entry.saleHash}`}
                      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                      data-testid={`hash-copy-${entry.id}`}
                      onClick={() => {
                        navigator.clipboard.writeText(entry.saleHash!);
                      }}
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

      {/* Footer note */}
      {filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Showing {filtered.length} of {entries.length} void record{entries.length !== 1 ? "s" : ""} ·
          Hash algorithm: SHA-256 · Fields covered: OR, receipt, totals, VAT, discount type, timestamp
        </p>
      )}

      {/* Legend */}
      <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-bold text-foreground">Hash Verification Legend</p>
        </div>
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            <span><strong className="text-foreground">VERIFIED</strong> — The SHA-256 hash matches the stored fiscal fields. The record has not been modified since creation.</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle className="h-3 w-3 text-rose-500 shrink-0" />
            <span><strong className="text-foreground">TAMPERED</strong> — Hash mismatch detected. OR number, totals, or VAT fields may have been modified after initial recording.</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
            <span><strong className="text-foreground">NO HASH</strong> — Record was created before hash generation was enabled. Cannot be cryptographically verified.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
