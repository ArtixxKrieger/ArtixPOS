import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Package,
  Users,
  FileText,
  Wallet,
  ClipboardList,
  Settings,
  HelpCircle,
} from "lucide-react";
import {
  getFailedQueueItems,
  discardQueueItem,
  discardAllFailedItems,
  resetFailedQueueItems,
  updateQueueItemRetry,
  type QueuedMutation,
} from "@/lib/offline-db";
import { syncOfflineData } from "@/lib/sync";

// ── Human-readable labels ────────────────────────────────────────────────────

function collectionFromUrl(url: string): string {
  const m = url.match(/^\/api\/([a-z-]+)/i);
  return m ? m[1] : "data";
}

const COLLECTION_LABELS: Record<string, string> = {
  sales: "Sale",
  "pending-orders": "Pending order",
  products: "Product",
  customers: "Customer",
  expenses: "Expense",
  "purchase-orders": "Purchase order",
  inventory: "Inventory",
  suppliers: "Supplier",
  staff: "Staff member",
  appointments: "Appointment",
  shifts: "Shift",
  "discount-codes": "Discount",
  memberships: "Membership",
  "wifi-vouchers": "WiFi voucher",
  "time-logs": "Time entry",
  payroll: "Payroll record",
  settings: "Settings",
};

const COLLECTION_ICONS: Record<string, React.ElementType> = {
  sales: ShoppingCart,
  "pending-orders": ClipboardList,
  products: Package,
  customers: Users,
  expenses: Wallet,
  "purchase-orders": FileText,
  settings: Settings,
};

const METHOD_VERB: Record<string, string> = {
  POST: "Create",
  PUT: "Update",
  PATCH: "Update",
  DELETE: "Delete",
};

function describeMutation(item: QueuedMutation): { label: string; detail: string | null; Icon: React.ElementType } {
  const collection = collectionFromUrl(item.url);
  const collectionLabel = COLLECTION_LABELS[collection] ?? collection;
  const verb = METHOD_VERB[item.method] ?? item.method;
  const Icon = COLLECTION_ICONS[collection] ?? HelpCircle;

  // Try to extract a meaningful name from the body
  let detail: string | null = null;
  if (item.body && typeof item.body === "object") {
    const b = item.body as Record<string, unknown>;
    const name =
      b.name ?? b.customerName ?? b.productName ?? b.title ?? b.description;
    const amount = b.total ?? b.amount ?? b.grandTotal;
    if (typeof name === "string" && name.trim()) {
      detail = name.trim().slice(0, 60);
    } else if (typeof amount === "number") {
      detail = `₱${amount.toFixed(2)}`;
    }
  }

  // Category shortcut
  if (item.category === "sale") {
    return { label: "Offline sale", detail, Icon: ShoppingCart };
  }

  return { label: `${verb} ${collectionLabel}`, detail, Icon };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function parseErrorMessage(raw?: string): string {
  if (!raw) return "Server rejected this request.";
  // Strip "HTTP 4xx: " prefix and try to parse JSON
  const stripped = raw.replace(/^HTTP \d{3}:\s*/, "").trim();
  try {
    const parsed = JSON.parse(stripped);
    if (typeof parsed?.message === "string") return parsed.message;
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {}
  // Truncate raw to something readable
  return stripped.slice(0, 140);
}

// ── Item row ─────────────────────────────────────────────────────────────────

interface ConflictItemProps {
  item: QueuedMutation;
  onRetry: (id: number) => void;
  onDiscard: (id: number) => void;
  isRetrying: boolean;
}

function ConflictItem({ item, onRetry, onDiscard, isRetrying }: ConflictItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { label, detail, Icon } = describeMutation(item);
  const errorMsg = parseErrorMessage(item.lastError);

  return (
    <div
      data-testid={`conflict-item-${item.id}`}
      className="rounded-xl border border-border/60 bg-background overflow-hidden"
    >
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-destructive/10 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-destructive" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-foreground leading-tight">{label}</span>
            {detail && (
              <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">· {detail}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{formatTime(item.timestamp)}</p>

          {/* Error preview — always show truncated; expand for full */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive/80 hover:text-destructive transition-colors"
            data-testid={`conflict-expand-${item.id}`}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className={expanded ? "" : "line-clamp-1"}>{errorMsg}</span>
            {expanded
              ? <ChevronUp className="h-3 w-3 shrink-0 ml-0.5" />
              : <ChevronDown className="h-3 w-3 shrink-0 ml-0.5" />
            }
          </button>
        </div>

        {/* Per-item actions */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <button
            data-testid={`conflict-retry-${item.id}`}
            onClick={() => onRetry(item.id!)}
            disabled={isRetrying}
            title="Retry this item"
            className="h-7 w-7 rounded-lg flex items-center justify-center border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
          </button>
          <button
            data-testid={`conflict-discard-${item.id}`}
            onClick={() => onDiscard(item.id!)}
            disabled={isRetrying}
            title="Discard this item permanently"
            className="h-7 w-7 rounded-lg flex items-center justify-center border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded raw error */}
      {expanded && (
        <div className="px-4 pb-3 pt-0">
          <pre className="text-[10.5px] text-muted-foreground bg-muted/40 rounded-lg p-2.5 whitespace-pre-wrap break-all leading-relaxed border border-border/40 font-mono">
            {item.lastError ?? "No error details available."}
          </pre>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            URL: <span className="font-mono">{item.method} {item.url}</span>
            {item.retryCount ? ` · ${item.retryCount} attempt${item.retryCount !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main drawer ──────────────────────────────────────────────────────────────

interface SyncConflictDrawerProps {
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

export function SyncConflictDrawer({ open, onClose, onResolved }: SyncConflictDrawerProps) {
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const failed = await getFailedQueueItems();
    setItems(failed);
    if (failed.length === 0) {
      onResolved();
      onClose();
    }
  }, [onClose, onResolved]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleRetryOne = useCallback(async (id: number) => {
    setRetryingId(id);
    setIsRetrying(true);
    try {
      // Un-fail this specific item so the sync loop picks it up
      await updateQueueItemRetry(id, 0, "", false, undefined);
      await syncOfflineData();
      await load();
      onResolved();
    } finally {
      setIsRetrying(false);
      setRetryingId(null);
    }
  }, [load, onResolved]);

  const handleDiscardOne = useCallback(async (id: number) => {
    await discardQueueItem(id);
    await load();
    onResolved();
  }, [load, onResolved]);

  const handleRetryAll = useCallback(async () => {
    setIsRetrying(true);
    try {
      await resetFailedQueueItems();
      await syncOfflineData();
      await load();
      onResolved();
    } finally {
      setIsRetrying(false);
    }
  }, [load, onResolved]);

  const handleDiscardAll = useCallback(async () => {
    await discardAllFailedItems();
    await load();
    onResolved();
    onClose();
  }, [load, onResolved, onClose]);

  const saleCount = items.filter((i) => i.category === "sale").length;
  const otherCount = items.length - saleCount;

  const summaryParts: string[] = [];
  if (saleCount > 0) summaryParts.push(`${saleCount} sale${saleCount !== 1 ? "s" : ""}`);
  if (otherCount > 0) summaryParts.push(`${otherCount} other change${otherCount !== 1 ? "s" : ""}`);
  const summary = summaryParts.join(" and ");

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[460px] flex flex-col gap-0 p-0"
        data-testid="sync-conflict-drawer"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-[15px]">Sync Conflicts</SheetTitle>
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {items.length}
                </Badge>
              </div>
              <SheetDescription className="text-[12px] mt-0.5">
                {items.length === 0
                  ? "All conflicts resolved."
                  : `${summary} couldn't be saved — the server rejected ${items.length === 1 ? "it" : "them"}.`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Explanation callout */}
        {items.length > 0 && (
          <div className="mx-5 mt-4 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3.5 py-2.5 shrink-0">
            <p className="text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
              These changes were saved offline but the server found a problem when syncing.
              Review each item, then retry or discard it. Discarded items are permanently removed.
            </p>
          </div>
        )}

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 min-h-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                No pending conflicts. Your data is fully synced.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <ConflictItem
                key={item.id}
                item={item}
                onRetry={handleRetryOne}
                onDiscard={handleDiscardOne}
                isRetrying={isRetrying && (retryingId === item.id || retryingId === null)}
              />
            ))
          )}
        </div>

        {/* Footer actions */}
        {items.length > 0 && (
          <div className="px-5 pt-3 pb-5 border-t border-border/50 flex gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:border-destructive/50"
              onClick={handleDiscardAll}
              disabled={isRetrying}
              data-testid="conflict-discard-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Discard all
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleRetryAll}
              disabled={isRetrying}
              data-testid="conflict-retry-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying && retryingId === null ? "animate-spin" : ""}`} />
              {isRetrying && retryingId === null ? "Retrying…" : "Retry all"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
