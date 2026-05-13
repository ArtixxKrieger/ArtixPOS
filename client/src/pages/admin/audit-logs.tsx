import { useState } from "react";
import { useAuditLogs, useTenantUsers, type AuditLog, type AuditLogFilters } from "@/hooks/use-admin";
import {
  ScrollText, UserPlus, Pencil, Trash2, LogIn, GitBranch,
  Filter, X, Download, ShoppingCart, Package, Users,
  Settings, Tag, DollarSign, FileText, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ACTION_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  create: { label: "Created", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: UserPlus },
  update: { label: "Updated", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: Pencil },
  delete: { label: "Deleted", bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: Trash2 },
  delete_sale: { label: "Sale Deleted", bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: Trash2 },
  login: { label: "Login", bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", icon: LogIn },
  assign_branch: { label: "Assigned", bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: GitBranch },
  remove_branch: { label: "Unassigned", bg: "bg-secondary", text: "text-muted-foreground", icon: GitBranch },
  update_role: { label: "Role Changed", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: Pencil },
  create_invite: { label: "Invite Sent", bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", icon: UserPlus },
  update_permissions: { label: "Permissions", bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", icon: Settings },
  receive: { label: "Received", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: Package },
  ban: { label: "Banned", bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: X },
  unban: { label: "Restored", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: UserPlus },
  set_main: { label: "Set Main", bg: "bg-secondary", text: "text-muted-foreground", icon: GitBranch },
};

const ENTITY_ICONS: Record<string, any> = {
  product: Package,
  customer: Users,
  sale: ShoppingCart,
  refund: DollarSign,
  expense: DollarSign,
  discount_code: Tag,
  settings: Settings,
  purchase_order: Package,
  pending_order: ShoppingCart,
  user: Users,
  branch: GitBranch,
  tenant: Settings,
  role_permissions: Settings,
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Describes the event WITHOUT the actor's name (actor shown separately).
function describeEvent(action: string, entity: string, metadata: Record<string, any> | null) {
  const meta = metadata ?? {};

  if (action === "create" && entity === "tenant") return `Created organization "${meta.name}"`;
  if (action === "create" && entity === "branch") return `Created branch "${meta.name}"`;
  if (action === "delete" && entity === "branch") return `Deleted a branch`;
  if (action === "update" && entity === "branch") return `Updated branch "${meta.name ?? ""}"`;
  if (action === "set_main" && entity === "branch") return `Set main branch`;
  if (action === "create" && entity === "user") return `Added "${meta.name}" as ${meta.role}`;
  if (action === "delete" && entity === "user") return `Removed user "${meta.name}"`;
  if (action === "update_role" && entity === "user") return `Changed a user's role to ${meta.role}`;
  if (action === "assign_branch") return `Assigned a user to a branch`;
  if (action === "remove_branch") return `Removed a user from a branch`;
  if (action === "update" && entity === "tenant") return `Updated organization name to "${meta.name}"`;
  if (action === "create_invite") return `Sent invite for role: ${meta.role}`;
  if (action === "ban") return `Revoked access for a user`;
  if (action === "unban") return `Restored access for a user`;
  if (action === "create" && entity === "product") return `Added product "${meta.name}"`;
  if (action === "update" && entity === "product") return `Updated product "${meta.name}"`;
  if (action === "delete" && entity === "product") return `Deleted product "${meta.name ?? ""}"`;
  if (action === "create" && entity === "customer") return `Added customer "${meta.name}"`;
  if (action === "update" && entity === "customer") return `Updated customer "${meta.name}"`;
  if (action === "delete" && entity === "customer") return `Deleted customer "${meta.name ?? ""}"`;
  if (action === "create" && entity === "sale") {
    const parts = [`Completed a sale (${meta.total ?? "?"})`];
    if (meta.receiptNumber) parts.push(`Receipt #${meta.receiptNumber}`);
    if (meta.orNumber) parts.push(`O.R. #${meta.orNumber}`);
    if (meta.invoiceNumber) parts.push(`Invoice #${meta.invoiceNumber}`);
    return parts.join(" · ");
  }
  if (action === "create" && entity === "refund") return `Issued refund of ${meta.amount ?? "?"} on sale #${meta.saleId ?? "?"}`;
  if (action === "delete_sale") {
    const parts = [`Deleted sale #${meta.saleId ?? "?"}`];
    if (meta.receiptNumber) parts.push(`Receipt #${meta.receiptNumber}`);
    if (meta.orNumber) parts.push(`O.R. #${meta.orNumber}`);
    if (meta.invoiceNumber) parts.push(`Invoice #${meta.invoiceNumber}`);
    return parts.join(" · ");
  }
  if (action === "create" && entity === "expense") return `Logged expense "${meta.description}" (${meta.amount ?? "?"})`;
  if (action === "delete" && entity === "expense") return `Deleted expense "${meta.description ?? ""}"`;
  if (action === "update" && entity === "expense") return `Updated expense "${meta.description}"`;
  if (action === "create" && entity === "discount_code") return `Created discount code "${meta.code}"`;
  if (action === "delete" && entity === "discount_code") return `Deleted discount code "${meta.code ?? ""}"`;
  if (action === "create" && entity === "purchase_order") return `Created purchase order (${meta.totalAmount ?? "?"})`;
  if (action === "receive" && entity === "purchase_order") return `Marked purchase order as received`;
  if (action === "delete" && entity === "pending_order") return `Deleted a pending order`;
  if (action === "update" && entity === "settings") {
    const parts: string[] = [];
    if (meta.taxRate !== undefined) parts.push(`tax rate → ${meta.taxRate}%`);
    if (meta.loyaltyPointsPerUnit !== undefined) parts.push(`loyalty points → ${meta.loyaltyPointsPerUnit}`);
    if (meta.storeName !== undefined) parts.push(`store name → "${meta.storeName}"`);
    if (meta.currency !== undefined) parts.push(`currency → ${meta.currency}`);
    return `Changed settings: ${parts.join(", ") || "various fields"}`;
  }
  if (action === "update_permissions") return `Updated ${meta.role} permissions`;
  return `${action.replace(/_/g, " ")} ${entity.replace(/_/g, " ")}`;
}

// Backwards-compatible: includes actor in the sentence for export rows.
function describeWithActor(log: AuditLog) {
  const actor = log.actorName || log.actorEmail || "Someone";
  return `${actor} — ${describeEvent(log.action, log.entity, log.metadata).toLowerCase().replace(/^./, c => c)}`;
}

const ENTITY_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "product", label: "Products" },
  { value: "customer", label: "Customers" },
  { value: "sale", label: "Sales" },
  { value: "refund", label: "Refunds" },
  { value: "expense", label: "Expenses" },
  { value: "discount_code", label: "Discount Codes" },
  { value: "settings", label: "Settings" },
  { value: "purchase_order", label: "Purchase Orders" },
  { value: "user", label: "Team / Users" },
  { value: "branch", label: "Branches" },
];

function exportToCSV(logs: AuditLog[]) {
  const headers = ["Date", "Actor", "Email", "Action", "Type", "Description"];
  const rows = logs.map(log => [
    new Date(log.createdAt ?? "").toLocaleString(),
    log.actorName || log.userId,
    log.actorEmail || "",
    log.action,
    log.entity,
    describeEvent(log.action, log.entity, log.metadata).replace(/,/g, ";"),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToPDF(logs: AuditLog[], storeLabel: string) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const generatedAt = new Date().toLocaleString();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Audit Log", 40, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(storeLabel, 40, 64);
  doc.text(`Generated ${generatedAt}  ·  ${logs.length} event${logs.length !== 1 ? "s" : ""}`, 40, 78);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 96,
    head: [["When", "Who", "Action", "Details"]],
    body: logs.map(log => [
      formatDate(log.createdAt ?? ""),
      log.actorName || log.actorEmail || log.userId,
      (ACTION_CONFIG[log.action]?.label ?? log.action).toString(),
      describeEvent(log.action, log.entity, log.metadata),
    ]),
    styles: { fontSize: 9, cellPadding: 6, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 247, 252] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 110 },
      2: { cellWidth: 80 },
      3: { cellWidth: "auto" },
    },
    margin: { left: 40, right: 40 },
    didDrawPage: (data: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const pageNum = data.pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${pageNum} of ${pageCount}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" }
      );
      doc.setTextColor(0);
    },
  });

  doc.save(`audit-log-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function MetadataView({ metadata }: { metadata: Record<string, any> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return <p className="text-xs text-muted-foreground italic">No additional details</p>;
  }
  return (
    <div className="space-y-1.5">
      {Object.entries(metadata).map(([k, v]) => (
        <div key={k} className="flex items-start gap-3 text-xs">
          <span className="font-medium text-muted-foreground capitalize w-28 shrink-0">
            {k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
          </span>
          <span className="font-mono text-foreground break-all flex-1">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogs() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { data: users = [] } = useTenantUsers();
  const { data: logs = [], isLoading } = useAuditLogs(filters);

  const hasFilters = !!(filters.userId || filters.entity || filters.startDate || filters.endDate);

  function clearFilters() {
    setFilters({});
  }

  async function handleExportPdf() {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportToPDF(logs, "Audit history");
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 shrink-0">
          <ScrollText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Audit Log</h2>
          <p className="text-xs text-muted-foreground font-medium">Full history of all staff activity</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFilters(f => !f)}
            data-testid="button-toggle-filters"
            className={cn(
              "h-9 px-3 flex items-center gap-1.5 rounded-xl text-xs font-semibold transition-colors",
              showFilters || hasFilters
                ? "bg-primary/10 text-primary"
                : "bg-secondary/60 text-foreground hover:bg-secondary"
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
          {logs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-export-menu"
                  disabled={isExportingPdf}
                  className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-secondary/60 hover:bg-secondary text-xs font-semibold transition-colors disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isExportingPdf ? "Exporting…" : "Export"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem
                  onClick={() => exportToCSV(logs)}
                  data-testid="menu-export-csv"
                  className="gap-2 text-sm cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Export as CSV</span>
                    <span className="text-[11px] text-muted-foreground">For spreadsheets</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportPdf}
                  data-testid="menu-export-pdf"
                  className="gap-2 text-sm cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Export as PDF</span>
                    <span className="text-[11px] text-muted-foreground">For printing & records</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">Filter Events</span>
            {hasFilters && (
              <button onClick={clearFilters} data-testid="button-clear-filters" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Staff member filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Staff Member</label>
              <Select value={filters.userId ?? ""} onValueChange={v => setFilters(f => ({ ...f, userId: v || undefined }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30" data-testid="select-filter-user">
                  <SelectValue placeholder="All staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All staff</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name ?? u.email ?? u.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Category filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select value={filters.entity ?? ""} onValueChange={v => setFilters(f => ({ ...f, entity: v || undefined }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30" data-testid="select-filter-entity">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Date range */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input
                type="date"
                value={filters.startDate ?? ""}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value || undefined }))}
                className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30"
                data-testid="input-filter-start-date"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input
                type="date"
                value={filters.endDate ?? ""}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value || undefined }))}
                className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30"
                data-testid="input-filter-end-date"
              />
            </div>
          </div>
        </div>
      )}

      {/* Log list */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
          <span className="font-semibold text-sm">Activity</span>
          {logs.length > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
              {logs.length} event{logs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
              <ScrollText className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-muted-foreground">
              {hasFilters ? "No events match your filters" : "No activity recorded yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {hasFilters ? "Try changing the filters above" : "Staff actions will appear here"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {logs.map(log => {
              const cfg = ACTION_CONFIG[log.action] ?? {
                label: log.action.replace(/_/g, " "),
                bg: "bg-secondary",
                text: "text-muted-foreground",
                icon: ENTITY_ICONS[log.entity] ?? ScrollText,
              };
              const Icon = cfg.icon;
              const actor = log.actorName || log.actorEmail || log.userId;
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  data-testid={`button-log-${log.id}`}
                  className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/30 active:bg-secondary/50 transition-colors text-left"
                >
                  <div className={cn("mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", cfg.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2 leading-snug">
                      {describeEvent(log.action, log.entity, log.metadata)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground shrink-0">{formatDate(log.createdAt ?? "")}</p>
                      <span className="text-muted-foreground/30 text-xs">·</span>
                      <p className="text-xs text-muted-foreground/70 truncate">{actor}</p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 capitalize",
                    cfg.bg, cfg.text
                  )}>
                    {cfg.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
          {selectedLog && (() => {
            const cfg = ACTION_CONFIG[selectedLog.action] ?? {
              label: selectedLog.action.replace(/_/g, " "),
              bg: "bg-secondary",
              text: "text-muted-foreground",
              icon: ENTITY_ICONS[selectedLog.entity] ?? ScrollText,
            };
            const Icon = cfg.icon;
            const actor = selectedLog.actorName || selectedLog.actorEmail || selectedLog.userId;
            return (
              <>
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("h-5 w-5", cfg.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="text-base font-bold truncate">{cfg.label}</SheetTitle>
                      <SheetDescription className="text-xs capitalize">
                        {selectedLog.entity.replace(/_/g, " ")}
                      </SheetDescription>
                    </div>
                  </div>
                </SheetHeader>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl bg-secondary/40 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What happened</p>
                    <p className="text-sm font-medium leading-relaxed" data-testid="text-log-description">
                      {describeEvent(selectedLog.action, selectedLog.entity, selectedLog.metadata)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who</p>
                      <p className="text-sm font-semibold" data-testid="text-log-actor">{actor}</p>
                      {selectedLog.actorEmail && selectedLog.actorEmail !== actor && (
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedLog.actorEmail}</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">When</p>
                      <p className="text-sm font-semibold" data-testid="text-log-when">{formatDateLong(selectedLog.createdAt ?? "")}</p>
                    </div>

                    {selectedLog.entityId && (
                      <div className="rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reference ID</p>
                        <p className="text-xs font-mono break-all" data-testid="text-log-entity-id">{selectedLog.entityId}</p>
                      </div>
                    )}

                    <div className="rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Details</p>
                      <MetadataView metadata={selectedLog.metadata} />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
