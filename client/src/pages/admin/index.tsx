import { useLocation } from "wouter";
import {
  Building2, Users, BarChart3, ScrollText, ShieldCheck,
  ChevronRight, AlertTriangle, Shield, Clock,
  ShoppingCart, Package, Pencil, Trash2, LogIn, UserPlus, GitBranch, Tag, DollarSign, Settings,
} from "lucide-react";
import { useBranches, useTenantUsers, useBranchAnalytics, useTenant, useEnsureTenant, useAuditLogs } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useEffect } from "react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTION_CONFIG: Record<string, { bg: string; text: string; icon: any }> = {
  create:             { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: UserPlus },
  update:             { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",       icon: Pencil },
  delete:             { bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: Trash2 },
  delete_sale:        { bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",       icon: Trash2 },
  login:              { bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400",   icon: LogIn },
  assign_branch:      { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",     icon: GitBranch },
  remove_branch:      { bg: "bg-secondary",      text: "text-muted-foreground",                  icon: GitBranch },
  update_role:        { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",       icon: Pencil },
  create_invite:      { bg: "bg-indigo-500/10",  text: "text-indigo-600 dark:text-indigo-400",   icon: UserPlus },
  update_permissions: { bg: "bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400",   icon: Settings },
  receive:            { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: Package },
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
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function describeActivity(action: string, entity: string, actor: string | null, metadata: Record<string,any> | null) {
  const meta = metadata ?? {};
  const a = actor || "Someone";
  if (action === "create" && entity === "sale") return `${a} completed a sale`;
  if (action === "create" && entity === "product") return `${a} added "${meta.name ?? "product"}"`;
  if (action === "delete" && entity === "product") return `${a} deleted a product`;
  if (action === "update" && entity === "product") return `${a} updated "${meta.name ?? "product"}"`;
  if (action === "create" && entity === "customer") return `${a} added customer "${meta.name ?? ""}"`;
  if (action === "create" && entity === "refund") return `${a} issued a refund`;
  if (action === "create" && entity === "expense") return `${a} logged expense "${meta.description ?? ""}"`;
  if (action === "create" && entity === "purchase_order") return `${a} created a purchase order`;
  if (action === "receive" && entity === "purchase_order") return `${a} received a purchase order`;
  if (action === "delete_sale") return `${a} deleted a sale`;
  if (action === "delete" && entity === "pending_order") return `${a} deleted a pending order`;
  if (action === "update" && entity === "settings") return `${a} updated store settings`;
  if (action === "create" && entity === "discount_code") return `${a} created discount code "${meta.code ?? ""}"`;
  if (action === "update_permissions") return `${a} updated ${meta.role ?? ""} permissions`;
  if (action === "create" && entity === "user") return `${a} added "${meta.name ?? ""}" as ${meta.role ?? ""}`;
  if (action === "update_role") return `${a} changed a user's role`;
  if (action === "assign_branch") return `${a} assigned user to branch`;
  if (action === "remove_branch") return `${a} removed user from branch`;
  return `${a} ${action.replace(/_/g, " ")} ${entity.replace(/_/g, " ")}`;
}

export default function AdminIndex() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: tenant } = useTenant();
  const { data: branches = [] } = useBranches();
  const { data: tenantUsers = [] } = useTenantUsers();
  const { data: analytics = [] } = useBranchAnalytics();
  const { data: settings } = useSettings();
  const ensureTenant = useEnsureTenant();
  const { data: recentLogs = [] } = useAuditLogs();

  const currency = (settings as any)?.currency || "₱";
  const totalRevenue = analytics.reduce((s, a) => s + a.totalRevenue, 0);
  const todayRevenue = analytics.reduce((s, a) => s + a.todayRevenue, 0);
  const isOwner = user?.role === "owner";
  const activityFeed = recentLogs.slice(0, 6);

  useEffect(() => {
    if (user && !user.tenantId) {
      ensureTenant.mutate();
    }
  }, [user?.tenantId]);

  if (!user?.tenantId && ensureTenant.isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const QUICK_LINKS = [
    {
      title: "Branches",
      description: `${branches.length} location${branches.length !== 1 ? "s" : ""}`,
      icon: Building2,
      href: "/admin/branches",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-500",
    },
    {
      title: "Team",
      description: `${tenantUsers.length} member${tenantUsers.length !== 1 ? "s" : ""}`,
      icon: Users,
      href: "/admin/users",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-500",
    },
    {
      title: "Analytics",
      description: "Sales & revenue",
      icon: BarChart3,
      href: "/admin/analytics",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-500",
    },
    ...(isOwner ? [
      {
        title: "Permissions",
        description: "Role-based access",
        icon: Shield,
        href: "/admin/permissions",
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-500",
      },
      {
        title: "Audit Log",
        description: "Activity history",
        icon: ScrollText,
        href: "/admin/audit-logs",
        iconBg: "bg-amber-500/10",
        iconColor: "text-amber-500",
      },
    ] : []),
  ];

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 shrink-0">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black tracking-tight">Admin Panel</h2>
          {tenant && <p className="text-xs text-muted-foreground font-medium truncate">{tenant.name}</p>}
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary capitalize shrink-0">
          {user?.role}
        </span>
      </div>

      {/* No-branch warning */}
      {branches.length === 0 && isOwner && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Create your first branch</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">You need at least one branch to start managing your POS operations.</p>
          </div>
          <button
            onClick={() => setLocation("/admin/branches")}
            className="shrink-0 h-8 px-3 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Set up
          </button>
        </div>
      )}

      {/* Revenue KPI cards */}
      <div className="grid gap-3 grid-cols-2">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-violet-500/10 to-transparent relative overflow-hidden">
          <div className="absolute top-2.5 right-2.5 opacity-[0.07]">
            <BarChart3 className="h-10 w-10" />
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Revenue</p>
          <p className="text-2xl font-black tabular-nums text-violet-600 dark:text-violet-400 truncate" data-testid="stat-total-revenue">
            {formatCurrency(totalRevenue, currency)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">all branches</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-emerald-500/10 to-transparent relative overflow-hidden">
          <div className="absolute top-2.5 right-2.5 opacity-[0.07]">
            <BarChart3 className="h-10 w-10" />
          </div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Today's Revenue</p>
          <p className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400 truncate" data-testid="stat-today-revenue">
            {formatCurrency(todayRevenue, currency)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">across all branches</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        {QUICK_LINKS.map(link => {
          const Icon = link.icon;
          return (
            <button
              key={link.href}
              data-testid={`link-admin-${link.title.toLowerCase()}`}
              onClick={() => setLocation(link.href)}
              className="glass-card rounded-2xl flex items-center gap-4 p-4 hover:bg-secondary/60 transition-colors text-left w-full"
            >
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${link.iconBg}`}>
                <Icon className={`h-5 w-5 ${link.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{link.title}</p>
                <p className="text-xs text-muted-foreground">{link.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Recent Activity Feed */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Recent Activity</span>
          </div>
          {isOwner && (
            <button
              onClick={() => setLocation("/admin/audit-logs")}
              className="text-xs text-primary font-semibold hover:underline"
            >
              View all
            </button>
          )}
        </div>

        {activityFeed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Staff actions will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {activityFeed.map(log => {
              const cfg = ACTION_CONFIG[log.action] ?? {
                bg: "bg-secondary",
                text: "text-muted-foreground",
                icon: ENTITY_ICONS[log.entity] ?? ScrollText,
              };
              const Icon = cfg.icon;
              const actor = log.actorName || log.actorEmail || null;
              return (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                  <div className={cn("mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0", cfg.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", cfg.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {describeActivity(log.action, log.entity, actor, log.metadata)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(log.createdAt ?? "")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
