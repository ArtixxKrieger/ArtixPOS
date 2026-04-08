import { useState } from "react";
import { useAuditLogs, useTenantUsers, type AuditLogFilters } from "@/hooks/use-admin";
import {
  ScrollText, UserPlus, Pencil, Trash2, LogIn, GitBranch,
  Filter, X, Download, ShoppingCart, Package, Users,
  Settings, Tag, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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

function describeLog(action: string, entity: string, metadata: Record<string, any> | null, actorName: string | null) {
  const meta = metadata ?? {};
  const actor = actorName || "Someone";

  if (action === "create" && entity === "tenant") return `${actor} created organization "${meta.name}"`;
  if (action === "create" && entity === "branch") return `${actor} created branch "${meta.name}"`;
  if (action === "delete" && entity === "branch") return `${actor} deleted a branch`;
  if (action === "update" && entity === "branch") return `${actor} updated branch "${meta.name ?? ""}"`;
  if (action === "create" && entity === "user") return `${actor} added "${meta.name}" as ${meta.role}`;
  if (action === "delete" && entity === "user") return `${actor} removed user "${meta.name}"`;
  if (action === "update_role" && entity === "user") return `${actor} changed a role to ${meta.role}`;
  if (action === "assign_branch") return `${actor} assigned user to branch`;
  if (action === "remove_branch") return `${actor} removed user from branch`;
  if (action === "update" && entity === "tenant") return `${actor} updated organization name to "${meta.name}"`;
  if (action === "delete_sale") return `${actor} deleted sale (${meta.total ?? "?"})`;
  if (action === "create_invite") return `${actor} sent invite for role: ${meta.role}`;
  if (action === "ban") return `${actor} revoked access for a user`;
  if (action === "unban") return `${actor} restored access for a user`;
  if (action === "create" && entity === "product") return `${actor} added product "${meta.name}"`;
  if (action === "update" && entity === "product") return `${actor} updated product "${meta.name}"`;
  if (action === "delete" && entity === "product") return `${actor} deleted product "${meta.name ?? ""}"`;
  if (action === "create" && entity === "customer") return `${actor} added customer "${meta.name}"`;
  if (action === "update" && entity === "customer") return `${actor} updated customer "${meta.name}"`;
  if (action === "delete" && entity === "customer") return `${actor} deleted customer "${meta.name ?? ""}"`;
  if (action === "create" && entity === "sale") return `${actor} completed a sale (${meta.total ?? "?"})`;
  if (action === "create" && entity === "refund") return `${actor} issued refund of ${meta.amount ?? "?"} on sale #${meta.saleId ?? "?"}`;
  if (action === "create" && entity === "expense") return `${actor} logged expense "${meta.description}" (${meta.amount ?? "?"})`;
  if (action === "delete" && entity === "expense") return `${actor} deleted expense "${meta.description ?? ""}"`;
  if (action === "update" && entity === "expense") return `${actor} updated expense "${meta.description}"`;
  if (action === "create" && entity === "discount_code") return `${actor} created discount code "${meta.code}"`;
  if (action === "delete" && entity === "discount_code") return `${actor} deleted discount code "${meta.code ?? ""}"`;
  if (action === "create" && entity === "purchase_order") return `${actor} created purchase order (${meta.totalAmount ?? "?"})`;
  if (action === "receive" && entity === "purchase_order") return `${actor} marked purchase order as received`;
  if (action === "delete" && entity === "pending_order") return `${actor} deleted a pending order`;
  if (action === "update" && entity === "settings") {
    const parts: string[] = [];
    if (meta.taxRate !== undefined) parts.push(`tax rate → ${meta.taxRate}%`);
    if (meta.loyaltyPointsPerUnit !== undefined) parts.push(`loyalty points → ${meta.loyaltyPointsPerUnit}`);
    if (meta.storeName !== undefined) parts.push(`store name → "${meta.storeName}"`);
    if (meta.currency !== undefined) parts.push(`currency → ${meta.currency}`);
    return `${actor} changed settings: ${parts.join(", ") || "various fields"}`;
  }
  if (action === "update_permissions") return `${actor} updated ${meta.role} permissions`;
  return `${actor} ${action.replace(/_/g, " ")} ${entity.replace(/_/g, " ")}`;
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

function exportToCSV(logs: any[]) {
  const headers = ["Date", "Actor", "Action", "Type", "Description"];
  const rows = logs.map(log => [
    new Date(log.createdAt ?? "").toLocaleString(),
    log.actorName || log.userId,
    log.action,
    log.entity,
    describeLog(log.action, log.entity, log.metadata, log.actorName).replace(/,/g, ";"),
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

export default function AuditLogs() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const { data: users = [] } = useTenantUsers();
  const { data: logs = [], isLoading } = useAuditLogs(filters);

  const hasFilters = !!(filters.userId || filters.entity || filters.startDate || filters.endDate);

  function clearFilters() {
    setFilters({});
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
            <button
              onClick={() => exportToCSV(logs)}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-secondary/60 hover:bg-secondary text-xs font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">Filter Events</span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Staff member filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Staff Member</label>
              <Select value={filters.userId ?? ""} onValueChange={v => setFilters(f => ({ ...f, userId: v || undefined }))}>
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30">
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
                <SelectTrigger className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30">
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
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input
                type="date"
                value={filters.endDate ?? ""}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value || undefined }))}
                className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30"
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

        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 skeleton-shimmer rounded-xl" />
            ))}
          </div>
        ) : logs.length === 0 ? (
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
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/20 transition-colors"
                >
                  <div className={cn("mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", cfg.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {describeLog(log.action, log.entity, log.metadata, log.actorName)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{formatDate(log.createdAt ?? "")}</p>
                      {actor && (
                        <>
                          <span className="text-muted-foreground/30 text-xs">·</span>
                          <p className="text-xs text-muted-foreground/70 truncate max-w-[120px]">{actor}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 capitalize",
                    cfg.bg, cfg.text
                  )}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
