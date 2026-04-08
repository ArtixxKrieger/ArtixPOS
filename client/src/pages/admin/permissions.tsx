import { useState } from "react";
import { Shield, ShieldCheck, User2, CreditCard, ChevronRight, Info } from "lucide-react";
import { useRolePermissions, useUpdateRolePermission, type RolePermission } from "@/hooks/use-admin";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLE_META: Record<string, { label: string; icon: any; color: string; bg: string; description: string }> = {
  manager: {
    label: "Manager",
    icon: User2,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10",
    description: "Manages day-to-day operations, can access most POS features",
  },
  cashier: {
    label: "Cashier",
    icon: CreditCard,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    description: "Processes sales at the point of sale",
  },
};

const DEFAULT_PERMS: Omit<RolePermission, "id" | "tenantId" | "role" | "updatedAt"> = {
  maxDiscountPercent: 100,
  canRefund: true,
  canDeleteSale: true,
  canVoidOrder: true,
};

function RoleCard({ role, perm }: { role: "manager" | "cashier"; perm: RolePermission | undefined }) {
  const meta = ROLE_META[role];
  const updatePerm = useUpdateRolePermission();
  const { toast } = useToast();

  const current = {
    maxDiscountPercent: perm?.maxDiscountPercent ?? DEFAULT_PERMS.maxDiscountPercent,
    canRefund: perm?.canRefund ?? DEFAULT_PERMS.canRefund,
    canDeleteSale: perm?.canDeleteSale ?? DEFAULT_PERMS.canDeleteSale,
    canVoidOrder: perm?.canVoidOrder ?? DEFAULT_PERMS.canVoidOrder,
  };

  const [localDiscount, setLocalDiscount] = useState(current.maxDiscountPercent);

  async function handleUpdate(field: string, value: any) {
    try {
      await updatePerm.mutateAsync({ role, [field]: value } as any);
      toast({ title: "Permissions updated" });
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to update permissions", variant: "destructive" });
    }
  }

  async function handleDiscountCommit(value: number) {
    setLocalDiscount(value);
    await handleUpdate("maxDiscountPercent", value);
  }

  const Icon = meta.icon;

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      {/* Role header */}
      <div className="px-5 py-4 border-b border-border/20 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
          <Icon className={cn("h-5 w-5", meta.color)} />
        </div>
        <div>
          <p className="font-bold text-sm">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      <div className="divide-y divide-border/20">

        {/* Max discount */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Max Discount</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cap how much discount they can apply per sale</p>
            </div>
            <span className={cn(
              "text-sm font-black tabular-nums px-3 py-1 rounded-xl",
              meta.bg, meta.color
            )}>
              {localDiscount}%
            </span>
          </div>
          <Slider
            value={[localDiscount]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => setLocalDiscount(v)}
            onValueCommit={([v]) => handleDiscountCommit(v)}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
            <span>0% (no discounts)</span>
            <span>100% (unlimited)</span>
          </div>
        </div>

        {/* Can refund */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Issue Refunds</p>
            <p className="text-xs text-muted-foreground mt-0.5">Allow this role to process refunds</p>
          </div>
          <Switch
            checked={current.canRefund}
            disabled={updatePerm.isPending}
            onCheckedChange={v => handleUpdate("canRefund", v)}
          />
        </div>

        {/* Can delete sale */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Delete Sales</p>
            <p className="text-xs text-muted-foreground mt-0.5">Allow this role to void / delete completed sales</p>
          </div>
          <Switch
            checked={current.canDeleteSale}
            disabled={updatePerm.isPending}
            onCheckedChange={v => handleUpdate("canDeleteSale", v)}
          />
        </div>

        {/* Can void order */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Void Orders</p>
            <p className="text-xs text-muted-foreground mt-0.5">Allow this role to cancel pending orders</p>
          </div>
          <Switch
            checked={current.canVoidOrder}
            disabled={updatePerm.isPending}
            onCheckedChange={v => handleUpdate("canVoidOrder", v)}
          />
        </div>
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  const { data: perms = [], isLoading } = useRolePermissions();

  function getPermForRole(role: string) {
    return perms.find(p => p.role === role);
  }

  return (
    <div className="space-y-5 page-enter pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25 shrink-0">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">Permissions</h2>
          <p className="text-xs text-muted-foreground font-medium">Control what each role can do in the POS</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          Owners always have full access. These settings only apply to <strong>Managers</strong> and <strong>Cashiers</strong>. Changes take effect immediately at the POS — discount sliders will be capped, and restricted buttons will be hidden.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-64 skeleton-shimmer rounded-3xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <RoleCard role="manager" perm={getPermForRole("manager")} />
          <RoleCard role="cashier" perm={getPermForRole("cashier")} />
        </div>
      )}
    </div>
  );
}
