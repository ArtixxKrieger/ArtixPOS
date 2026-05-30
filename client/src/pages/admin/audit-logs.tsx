import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuditLogs, useTenantUsers, type AuditLog, type AuditLogFilters } from "@/hooks/use-admin";
import {
  ScrollText, UserPlus, Pencil, Trash2, LogIn, GitBranch,
  Filter, X, Download, ShoppingCart, Package, Users,
  Settings, Tag, DollarSign, FileText, FileSpreadsheet,
  Zap, CheckCircle2, Lock, Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// ── Types ─────────────────────────────────────────────────────────────────────

type PayrollEntry = {
  id: number;
  action: string;
  periodId: number | null;
  periodName: string;
  startDate: string | null;
  endDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  entryCount: number | null;
  totalAmount: string | null;
  performedBy: string;
  performedByName: string | null;
  performedAt: string | null;
};

type SelectedEntry =
  | { _type: "general"; log: AuditLog }
  | { _type: "payroll"; log: PayrollEntry };

type Source = "all" | "activity" | "payroll";

// ── Config ────────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  create:             { label: "Created",     bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: UserPlus },
  update:             { label: "Updated",     bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",       icon: Pencil },
  delete:             { label: "Deleted",     bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: Trash2 },
  delete_sale:        { label: "Sale Deleted",bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: Trash2 },
  login:              { label: "Login",       bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400",   icon: LogIn },
  assign_branch:      { label: "Assigned",    bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",     icon: GitBranch },
  remove_branch:      { label: "Unassigned",  bg: "bg-secondary",      text: "text-muted-foreground",                  icon: GitBranch },
  update_role:        { label: "Role Changed",bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",       icon: Pencil },
  create_invite:      { label: "Invite Sent", bg: "bg-indigo-500/10",  text: "text-indigo-600 dark:text-indigo-400",   icon: UserPlus },
  update_permissions: { label: "Permissions", bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400",   icon: Settings },
  receive:            { label: "Received",    bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: Package },
  ban:                { label: "Banned",      bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: X },
  unban:              { label: "Restored",    bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: UserPlus },
  set_main:           { label: "Set Main",    bg: "bg-secondary",      text: "text-muted-foreground",                  icon: GitBranch },
  cancel:             { label: "Cancelled",   bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: X },
  update_payment:     { label: "Payment Upd", bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",       icon: Pencil },
};

const PAYROLL_ACTION_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  quick_pay: { label: "Pay Day",   bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: Zap },
  mark_paid: { label: "Mark Paid", bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  finalize:  { label: "Finalized", bg: "bg-sky-500/10",     text: "text-sky-600 dark:text-sky-400",         icon: Lock },
  delete:    { label: "Deleted",   bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: Trash2 },
};

const PAY_METHOD_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", ewallet: "E-Wallet",
  gcash: "GCash", maya: "Maya", bank: "Bank Transfer", check: "Check",
};

const ENTITY_ICONS: Record<string, any> = {
  product: Package, customer: Users, sale: ShoppingCart,
  refund: DollarSign, expense: DollarSign, discount_code: Tag,
  settings: Settings, purchase_order: Package, pending_order: ShoppingCart,
  user: Users, branch: GitBranch, tenant: Settings, role_permissions: Settings,
};

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

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function formatDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function fmtShort(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return d; }
}

function formatCurrency(v: string | number | null) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return isNaN(n) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
}

// ── Event describers ──────────────────────────────────────────────────────────

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
  if (action === "cancel" && entity === "purchase_order") return `Cancelled a purchase order`;
  if (action === "update_payment" && entity === "purchase_order") return `Updated purchase order payment status`;
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

function describePayroll(e: PayrollEntry) {
  const periodStr = (e.startDate && e.endDate) ? ` (${fmtShort(e.startDate)} → ${fmtShort(e.endDate)})` : "";
  if (e.action === "quick_pay") {
    const parts = [`Pay Day run — ${e.periodName}${periodStr}`];
    if (e.entryCount != null) parts.push(`${e.entryCount} employee${e.entryCount !== 1 ? "s" : ""}`);
    if (e.totalAmount && parseFloat(e.totalAmount) > 0) parts.push(formatCurrency(e.totalAmount));
    return parts.join(" · ");
  }
  if (e.action === "mark_paid") {
    return `Marked paid — ${e.periodName}${periodStr}${e.paymentMethod ? ` via ${PAY_METHOD_LABEL[e.paymentMethod] ?? e.paymentMethod}` : ""}`;
  }
  if (e.action === "finalize") return `Finalized period — ${e.periodName}${periodStr}`;
  if (e.action === "delete") return `Deleted draft period — ${e.periodName}`;
  return `${e.action.replace(/_/g, " ")} — ${e.periodName}`;
}

// ── Export helpers ────────────────────────────────────────────────────────────

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
  a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function exportToPDF(logs: AuditLog[], storeLabel: string) {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const generatedAt = new Date().toLocaleString();
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Audit Log", 40, 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
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
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 110 }, 2: { cellWidth: 80 }, 3: { cellWidth: "auto" } },
    margin: { left: 40, right: 40 },
    didDrawPage: (data: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Page ${data.pageNumber} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
      doc.setTextColor(0);
    },
  });
  doc.save(`audit-log-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [source, setSource] = useState<Source>("all");
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SelectedEntry | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const { data: users = [] } = useTenantUsers();
  const { data: generalLogs = [], isLoading: generalLoading } = useAuditLogs(
    source !== "payroll" ? filters : {}
  );
  const { data: payrollLogs = [], isLoading: payrollLoading } = useQuery<PayrollEntry[]>({
    queryKey: ["/api/payroll/audit-log"],
    staleTime: 1000 * 60 * 2,
    enabled: source !== "activity",
  });

  const entries = useMemo(() => {
    type Row = { key: string; sortAt: string; entry: SelectedEntry };
    const rows: Row[] = [];

    if (source !== "payroll") {
      for (const log of generalLogs) {
        rows.push({ key: `g-${log.id}`, sortAt: log.createdAt ?? "", entry: { _type: "general", log } });
      }
    }

    if (source !== "activity") {
      let filtered = payrollLogs;
      if (filters.startDate) filtered = filtered.filter(e => e.performedAt && e.performedAt >= filters.startDate!);
      if (filters.endDate) filtered = filtered.filter(e => e.performedAt && e.performedAt <= filters.endDate! + "T23:59:59.999Z");
      for (const log of filtered) {
        rows.push({ key: `p-${log.id}`, sortAt: log.performedAt ?? "", entry: { _type: "payroll", log } });
      }
    }

    rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
    return rows;
  }, [source, generalLogs, payrollLogs, filters]);

  const isLoading = generalLoading || payrollLoading;
  const hasFilters = !!(filters.userId || filters.entity || filters.startDate || filters.endDate);

  return (
    <div className="space-y-4 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 shrink-0">
          <ScrollText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Audit Log</h2>
          <p className="text-xs text-muted-foreground font-medium">All staff & payroll activity in one place</p>
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
          {generalLogs.length > 0 && source !== "payroll" && (
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
                <DropdownMenuItem onClick={() => exportToCSV(generalLogs)} data-testid="menu-export-csv" className="gap-2 text-sm cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex flex-col">
                    <span className="font-medium">Export as CSV</span>
                    <span className="text-[11px] text-muted-foreground">For spreadsheets</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (isExportingPdf) return;
                    setIsExportingPdf(true);
                    try { await exportToPDF(generalLogs, "Audit history"); }
                    finally { setIsExportingPdf(false); }
                  }}
                  data-testid="menu-export-pdf" className="gap-2 text-sm cursor-pointer">
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

      {/* Source chips */}
      <div className="flex gap-2">
        {([
          { id: "all",      label: "All Activity",   icon: ScrollText },
          { id: "activity", label: "Staff Actions",  icon: Users },
          { id: "payroll",  label: "Payroll",        icon: Banknote },
        ] as { id: Source; label: string; icon: any }[]).map(s => {
          const Icon = s.icon;
          return (
            <button key={s.id}
              onClick={() => { setSource(s.id); setFilters({}); setShowFilters(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all",
                source === s.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground"
              )}
              data-testid={`btn-source-${s.id}`}>
              <Icon className="h-3 w-3 shrink-0" />{s.label}
            </button>
          );
        })}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Filter Events</span>
            {hasFilters && (
              <button onClick={() => setFilters({})} data-testid="button-clear-filters" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {source !== "payroll" && (
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
            )}
            {source !== "payroll" && (
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
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={filters.startDate ?? ""} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value || undefined }))} className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30" data-testid="input-filter-start-date" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input type="date" value={filters.endDate ?? ""} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value || undefined }))} className="h-9 text-xs rounded-xl border-border/40 bg-secondary/30" data-testid="input-filter-end-date" />
            </div>
          </div>
        </div>
      )}

      {/* Log list */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-center gap-2">
          <span className="font-semibold text-sm">
            {source === "payroll" ? "Payroll History" : source === "activity" ? "Staff Activity" : "All Activity"}
          </span>
          {entries.length > 0 && !isLoading && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
              {entries.length} event{entries.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="divide-y divide-border/20">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3.5 animate-pulse">
                <div className="h-7 w-7 rounded-xl bg-secondary/60 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 bg-secondary/60 rounded w-3/4" />
                  <div className="h-2.5 bg-secondary/40 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4">
              <ScrollText className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-muted-foreground">
              {hasFilters ? "No events match your filters" : source === "payroll" ? "No payroll actions yet" : "No activity recorded yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {hasFilters
                ? "Try changing the filters above"
                : source === "payroll"
                ? "Pay Day runs, mark-paid, finalize, and deletes appear here"
                : "Staff actions will appear here as your team works"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {entries.map(({ key, entry }) => {
              if (entry._type === "general") {
                const log = entry.log;
                const cfg = ACTION_CONFIG[log.action] ?? {
                  label: log.action.replace(/_/g, " "),
                  bg: "bg-secondary", text: "text-muted-foreground",
                  icon: ENTITY_ICONS[log.entity] ?? ScrollText,
                };
                const Icon = cfg.icon;
                const actor = log.actorName || log.actorEmail || log.userId;
                return (
                  <button key={key} type="button" onClick={() => setSelectedEntry(entry)}
                    data-testid={`button-log-${log.id}`}
                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/30 active:bg-secondary/50 transition-colors text-left">
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
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 capitalize", cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </button>
                );
              } else {
                const log = entry.log;
                const cfg = PAYROLL_ACTION_CONFIG[log.action] ?? {
                  label: log.action.replace(/_/g, " "),
                  bg: "bg-secondary", text: "text-muted-foreground", icon: ScrollText,
                };
                const Icon = cfg.icon;
                return (
                  <button key={key} type="button" onClick={() => setSelectedEntry(entry)}
                    data-testid={`button-payroll-log-${log.id}`}
                    className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-secondary/30 active:bg-secondary/50 transition-colors text-left">
                    <div className={cn("mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("h-3.5 w-3.5", cfg.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2 leading-snug">{describePayroll(log)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground shrink-0">{formatDate(log.performedAt ?? "")}</p>
                        <span className="text-muted-foreground/30 text-xs">·</span>
                        <p className="text-xs text-muted-foreground/70 truncate">{log.performedByName ?? log.performedBy}</p>
                        {source === "all" && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">Payroll</span>
                        )}
                      </div>
                    </div>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5", cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </button>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <Sheet open={!!selectedEntry} onOpenChange={open => !open && setSelectedEntry(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">

          {/* General event detail */}
          {selectedEntry?._type === "general" && (() => {
            const log = selectedEntry.log;
            const cfg = ACTION_CONFIG[log.action] ?? {
              label: log.action.replace(/_/g, " "), bg: "bg-secondary",
              text: "text-muted-foreground", icon: ENTITY_ICONS[log.entity] ?? ScrollText,
            };
            const Icon = cfg.icon;
            const actor = log.actorName || log.actorEmail || log.userId;
            return (
              <>
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("h-5 w-5", cfg.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="text-base font-bold truncate">{cfg.label}</SheetTitle>
                      <SheetDescription className="text-xs capitalize">{log.entity.replace(/_/g, " ")}</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl bg-secondary/40 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What happened</p>
                    <p className="text-sm font-medium leading-relaxed">{describeEvent(log.action, log.entity, log.metadata)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who</p>
                      <p className="text-sm font-semibold">{actor}</p>
                      {log.actorEmail && log.actorEmail !== actor && <p className="text-xs text-muted-foreground mt-0.5">{log.actorEmail}</p>}
                    </div>
                    <div className="col-span-2 rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">When</p>
                      <p className="text-sm font-semibold">{formatDateLong(log.createdAt ?? "")}</p>
                    </div>
                    {log.entityId && (
                      <div className="col-span-2 rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reference ID</p>
                        <p className="text-xs font-mono break-all">{log.entityId}</p>
                      </div>
                    )}
                    <div className="col-span-2 rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Details</p>
                      <MetadataView metadata={log.metadata} />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Payroll event detail */}
          {selectedEntry?._type === "payroll" && (() => {
            const log = selectedEntry.log;
            const cfg = PAYROLL_ACTION_CONFIG[log.action] ?? {
              label: log.action.replace(/_/g, " "), bg: "bg-secondary",
              text: "text-muted-foreground", icon: ScrollText,
            };
            const Icon = cfg.icon;
            return (
              <>
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center shrink-0", cfg.bg)}>
                      <Icon className={cn("h-5 w-5", cfg.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="text-base font-bold truncate">{cfg.label}</SheetTitle>
                      <SheetDescription className="text-xs">Payroll · {log.periodName}</SheetDescription>
                    </div>
                  </div>
                </SheetHeader>
                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl bg-secondary/40 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">What happened</p>
                    <p className="text-sm font-medium leading-relaxed">{describePayroll(log)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {log.startDate && log.endDate && (
                      <div className="col-span-2 rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pay Period</p>
                        <p className="text-sm font-semibold">{fmtShort(log.startDate)} → {fmtShort(log.endDate)}</p>
                      </div>
                    )}
                    {log.totalAmount && parseFloat(log.totalAmount) > 0 && (
                      <div className="rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Total Paid</p>
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(log.totalAmount)}</p>
                      </div>
                    )}
                    {log.entryCount != null && (
                      <div className="rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Employees</p>
                        <p className="text-sm font-semibold">{log.entryCount}</p>
                      </div>
                    )}
                    {log.paymentMethod && (
                      <div className="rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
                        <p className="text-sm font-semibold">{PAY_METHOD_LABEL[log.paymentMethod] ?? log.paymentMethod}</p>
                      </div>
                    )}
                    {log.paymentReference && (
                      <div className="rounded-2xl border border-border/40 p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Reference</p>
                        <p className="text-sm font-mono break-all">{log.paymentReference}</p>
                      </div>
                    )}
                    <div className="rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Processed by</p>
                      <p className="text-sm font-semibold">{log.performedByName ?? log.performedBy}</p>
                    </div>
                    <div className="rounded-2xl border border-border/40 p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">When</p>
                      <p className="text-sm font-semibold">{formatDateLong(log.performedAt ?? "")}</p>
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
