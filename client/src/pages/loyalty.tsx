import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles, Gift, TrendingUp, Users, Save, Star, Calculator, Crown,
  Medal, Plus, Edit2, Trash2, Check, X, Tag, Percent, Package, Stamp,
  Settings2, ChevronRight, Award, BarChart3, Coins,
} from "lucide-react";
import type { Customer, LoyaltyTier, LoyaltyReward, Product } from "@shared/schema";

// ─── Tier config helper ───────────────────────────────────────────────────────

const TIER_ICONS: Record<string, typeof Star> = { bronze: Medal, silver: Star, gold: Crown, platinum: Sparkles };
const PRESET_TIERS = [
  { name: "Bronze",   minLifetimePoints: 100,  multiplier: "1",   color: "#CD7F32", perks: "Early access to promotions", sortOrder: 1 },
  { name: "Silver",   minLifetimePoints: 500,  multiplier: "1.5", color: "#C0C0C0", perks: "1.5× points · Priority support", sortOrder: 2 },
  { name: "Gold",     minLifetimePoints: 2000, multiplier: "2",   color: "#FFD700", perks: "2× points · Birthday bonus · Free delivery", sortOrder: 3 },
  { name: "Platinum", minLifetimePoints: 5000, multiplier: "3",   color: "#E5E4E2", perks: "3× points · VIP perks · Exclusive rewards", sortOrder: 4 },
];

const REWARD_TYPE_OPTIONS = [
  { value: "discount_fixed",   label: "Fixed Discount (amount off)", icon: Tag },
  { value: "discount_percent", label: "Percent Discount (% off)",   icon: Percent },
  { value: "free_product",     label: "Free Product",               icon: Package },
  { value: "stamp_card",       label: "Stamp Card Reward",          icon: Stamp },
  { value: "custom",           label: "Custom Reward",              icon: Gift },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Tier Form Dialog ─────────────────────────────────────────────────────────

function TierFormDialog({ open, onClose, initial, onSave }: {
  open: boolean; onClose: () => void; initial?: LoyaltyTier | null; onSave: (data: Partial<LoyaltyTier>) => void;
}) {
  const form = useForm({ defaultValues: { name: "", minLifetimePoints: 0, multiplier: "1", color: "#CD7F32", perks: "", sortOrder: 0 } });
  useEffect(() => {
    if (initial) form.reset({ name: initial.name, minLifetimePoints: initial.minLifetimePoints, multiplier: initial.multiplier, color: initial.color, perks: initial.perks ?? "", sortOrder: initial.sortOrder });
    else form.reset({ name: "", minLifetimePoints: 0, multiplier: "1", color: "#CD7F32", perks: "", sortOrder: 0 });
  }, [initial, open]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader><DialogTitle className="font-black">{initial ? "Edit Tier" : "New Tier"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block">Tier Name</label>
            <Input {...form.register("name", { required: true })} placeholder="e.g. Gold" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Min Lifetime Points</label>
              <Input type="number" min="0" {...form.register("minLifetimePoints", { valueAsNumber: true })} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Points Multiplier</label>
              <Input type="number" step="0.1" min="1" {...form.register("multiplier")} placeholder="1.5" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Color</label>
              <div className="flex items-center gap-2">
                <input type="color" {...form.register("color")} className="h-9 w-12 rounded-lg border border-border cursor-pointer" />
                <Input {...form.register("color")} placeholder="#CD7F32" className="rounded-xl text-xs" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Sort Order</label>
              <Input type="number" min="0" {...form.register("sortOrder", { valueAsNumber: true })} className="rounded-xl" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Perks Description</label>
            <Input {...form.register("perks")} placeholder="2× points · Birthday bonus" className="rounded-xl" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 rounded-2xl">Save Tier</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reward Form Dialog ───────────────────────────────────────────────────────

function RewardFormDialog({ open, onClose, initial, onSave, products }: {
  open: boolean; onClose: () => void; initial?: LoyaltyReward | null; onSave: (data: any) => void; products: Product[];
}) {
  const form = useForm({ defaultValues: { name: "", description: "", type: "discount_fixed", pointsCost: 100, value: "0", isActive: true, maxRedemptions: "", expiresAt: "" } });
  const watchedType = form.watch("type");

  useEffect(() => {
    if (initial) form.reset({ name: initial.name, description: initial.description ?? "", type: initial.type, pointsCost: initial.pointsCost, value: initial.value, isActive: initial.isActive ?? true, maxRedemptions: initial.maxRedemptions?.toString() ?? "", expiresAt: initial.expiresAt ?? "" });
    else form.reset({ name: "", description: "", type: "discount_fixed", pointsCost: 100, value: "0", isActive: true, maxRedemptions: "", expiresAt: "" });
  }, [initial, open]);

  const valueLabel: Record<string, string> = { discount_fixed: "Discount Amount", discount_percent: "Discount Percent (%)", free_product: "Product ID", stamp_card: "Stamps required", custom: "Reward Description" };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-black">{initial ? "Edit Reward" : "New Reward"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block">Reward Name</label>
            <Input {...form.register("name", { required: true })} placeholder="e.g. Free Coffee" className="rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Type</label>
            <select {...form.register("type")} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
              {REWARD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Points Cost</label>
              <Input type="number" min="1" {...form.register("pointsCost", { valueAsNumber: true })} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">{valueLabel[watchedType] ?? "Value"}</label>
              {watchedType === "free_product" ? (
                <select {...form.register("value")} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Select product…</option>
                  {products.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              ) : (
                <Input {...form.register("value")} placeholder="0" className="rounded-xl" />
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Description (optional)</label>
            <Input {...form.register("description")} placeholder="Short description for customers" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Max Redemptions</label>
              <Input type="number" min="1" {...form.register("maxRedemptions")} placeholder="Unlimited" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Expires At</label>
              <Input type="date" {...form.register("expiresAt")} className="rounded-xl" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2.5">
            <label className="text-xs font-semibold">Active</label>
            <Switch checked={form.watch("isActive")} onCheckedChange={v => form.setValue("isActive", v)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 rounded-2xl">Save Reward</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = user?.role === "owner";
  const currency = settings?.currency || "₱";

  const [tab, setTab] = useState<"dashboard" | "tiers" | "rewards" | "settings">("dashboard");
  const [tierDialog, setTierDialog] = useState<{ open: boolean; tier?: LoyaltyTier | null }>({ open: false });
  const [rewardDialog, setRewardDialog] = useState<{ open: boolean; reward?: LoyaltyReward | null }>({ open: false });
  const [deletingTier, setDeletingTier] = useState<number | null>(null);
  const [deletingReward, setDeletingReward] = useState<number | null>(null);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: tiers = [] } = useQuery<LoyaltyTier[]>({ queryKey: ["/api/loyalty/tiers"] });
  const { data: rewards = [] } = useQuery<LoyaltyReward[]>({ queryKey: ["/api/loyalty/rewards"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // Settings form
  const settingsForm = useForm({
    defaultValues: {
      loyaltyPointsPerUnit: "1",
      loyaltyRedemptionRate: "100",
      loyaltyExpiryDays: "0",
      loyaltyBirthdayBonus: "0",
      loyaltyReferralBonus: "0",
      loyaltyStampTarget: "10",
      loyaltyStampEnabled: false,
    },
  });

  useEffect(() => {
    if (settings) {
      settingsForm.reset({
        loyaltyPointsPerUnit: settings.loyaltyPointsPerUnit?.toString() || "1",
        loyaltyRedemptionRate: settings.loyaltyRedemptionRate?.toString() || "100",
        loyaltyExpiryDays: settings.loyaltyExpiryDays?.toString() || "0",
        loyaltyBirthdayBonus: settings.loyaltyBirthdayBonus?.toString() || "0",
        loyaltyReferralBonus: settings.loyaltyReferralBonus?.toString() || "0",
        loyaltyStampTarget: settings.loyaltyStampTarget?.toString() || "10",
        loyaltyStampEnabled: !!settings.loyaltyStampEnabled,
      });
    }
  }, [settings]);

  const watchedSettings = settingsForm.watch();
  const pointsPerUnit = parseFloat(watchedSettings.loyaltyPointsPerUnit || "1") || 0;
  const redemptionRate = parseFloat(watchedSettings.loyaltyRedemptionRate || "100") || 1;

  // Stats
  const stats = useMemo(() => {
    const withPoints = customers.filter(c => (c.loyaltyPoints ?? 0) > 0);
    const totalPts = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
    const tierCounts: Record<string, number> = {};
    customers.forEach(c => {
      const t = c.tier ?? "none";
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });
    const top = [...customers].sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)).slice(0, 10);
    return { withPoints: withPoints.length, totalPts, tierCounts, top };
  }, [customers]);

  // Tier mutations
  const createTier = useMutation({
    mutationFn: (data: Partial<LoyaltyTier>) => apiRequest("POST", "/api/loyalty/tiers", data).then(r => r.json()),
    onSuccess: (result: LoyaltyTier) => {
      qc.setQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"], (old) => old ? [...old, result] : [result]);
      setTierDialog({ open: false });
      toast({ title: "Tier created" });
    },
    onError: () => toast({ title: "Failed to create tier", variant: "destructive" }),
  });
  const updateTier = useMutation({
    mutationFn: ({ id, ...data }: Partial<LoyaltyTier> & { id: number }) => apiRequest("PATCH", `/api/loyalty/tiers/${id}`, data).then(r => r.json()),
    onMutate: async ({ id, ...data }: Partial<LoyaltyTier> & { id: number }) => {
      await qc.cancelQueries({ queryKey: ["/api/loyalty/tiers"] });
      const previous = qc.getQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"]);
      qc.setQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"], (old) => old ? old.map(t => t.id === id ? { ...t, ...data } : t) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/loyalty/tiers"], ctx.previous); toast({ title: "Failed to update tier", variant: "destructive" }); },
    onSuccess: (result: LoyaltyTier) => { qc.setQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"], (old) => old ? old.map(t => t.id === result.id ? result : t) : []); setTierDialog({ open: false }); toast({ title: "Tier updated" }); },
  });
  const deleteTier = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/loyalty/tiers/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["/api/loyalty/tiers"] });
      const previous = qc.getQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"]);
      qc.setQueryData<LoyaltyTier[]>(["/api/loyalty/tiers"], (old) => old ? old.filter(t => t.id !== id) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/loyalty/tiers"], ctx.previous); toast({ title: "Failed to delete tier", variant: "destructive" }); },
    onSuccess: () => { setDeletingTier(null); toast({ title: "Tier deleted" }); },
  });

  // Reward mutations
  const createReward = useMutation({
    mutationFn: (data: Partial<LoyaltyReward>) => apiRequest("POST", "/api/loyalty/rewards", data).then(r => r.json()),
    onSuccess: (result: LoyaltyReward) => {
      qc.setQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"], (old) => old ? [...old, result] : [result]);
      setRewardDialog({ open: false });
      toast({ title: "Reward created" });
    },
    onError: () => toast({ title: "Failed to create reward", variant: "destructive" }),
  });
  const updateReward = useMutation({
    mutationFn: ({ id, ...data }: Partial<LoyaltyReward> & { id: number }) => apiRequest("PATCH", `/api/loyalty/rewards/${id}`, data).then(r => r.json()),
    onMutate: async ({ id, ...data }: Partial<LoyaltyReward> & { id: number }) => {
      await qc.cancelQueries({ queryKey: ["/api/loyalty/rewards"] });
      const previous = qc.getQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"]);
      qc.setQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"], (old) => old ? old.map(r => r.id === id ? { ...r, ...data } : r) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/loyalty/rewards"], ctx.previous); toast({ title: "Failed to update reward", variant: "destructive" }); },
    onSuccess: (result: LoyaltyReward) => { qc.setQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"], (old) => old ? old.map(r => r.id === result.id ? result : r) : []); setRewardDialog({ open: false }); toast({ title: "Reward updated" }); },
  });
  const deleteReward = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/loyalty/rewards/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["/api/loyalty/rewards"] });
      const previous = qc.getQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"]);
      qc.setQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"], (old) => old ? old.filter(r => r.id !== id) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/loyalty/rewards"], ctx.previous); toast({ title: "Failed to delete reward", variant: "destructive" }); },
    onSuccess: () => { setDeletingReward(null); toast({ title: "Reward deleted" }); },
  });
  const toggleReward = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiRequest("PATCH", `/api/loyalty/rewards/${id}`, { isActive }),
    onMutate: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await qc.cancelQueries({ queryKey: ["/api/loyalty/rewards"] });
      const previous = qc.getQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"]);
      qc.setQueryData<LoyaltyReward[]>(["/api/loyalty/rewards"], (old) => old ? old.map(r => r.id === id ? { ...r, isActive } : r) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/loyalty/rewards"], ctx.previous); },
  });

  const handleTierSave = (data: Partial<LoyaltyTier>) => {
    if (tierDialog.tier) updateTier.mutate({ id: tierDialog.tier.id, ...data });
    else createTier.mutate(data);
  };

  const handleRewardSave = (data: Partial<LoyaltyReward> & { maxRedemptions?: string; expiresAt?: string; pointsCost: string | number }) => {
    const payload = { ...data, maxRedemptions: data.maxRedemptions ? parseInt(data.maxRedemptions) : null, expiresAt: data.expiresAt || null, pointsCost: Number(data.pointsCost) };
    if (rewardDialog.reward) updateReward.mutate({ id: rewardDialog.reward.id, ...payload });
    else createReward.mutate(payload);
  };

  const onSaveSettings = (data: Record<string, unknown>) => {
    updateSettings.mutate(data as any, { onSuccess: () => toast({ title: "Settings saved" }) });
  };

  const seedPresetTiers = () => {
    PRESET_TIERS.forEach(t => createTier.mutate(t));
  };

  const TYPE_LABEL: Record<string, string> = {
    discount_fixed: `${currency} Discount`, discount_percent: "% Discount", free_product: "Free Product",
    stamp_card: "Stamp Card", custom: "Custom",
  };

  const TABS = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "tiers", label: "Tiers", icon: Crown },
    { key: "rewards", label: "Rewards", icon: Gift },
    { key: "settings", label: "Settings", icon: Settings2 },
  ] as const;

  return (
    <div className="space-y-4 page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 pb-1">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black leading-tight">Loyalty Program</h1>
          <p className="text-xs text-muted-foreground">Points · Tiers · Rewards · Stamps</p>
        </div>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { icon: Coins,  label: "Earn", desc: "Points per purchase & tier multipliers" },
          { icon: Award,  label: "Progress", desc: "Auto-climb tiers by lifetime points" },
          { icon: Gift,   label: "Redeem", desc: "Discounts, free products & custom rewards" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/40">
            <s.icon className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold">{s.label}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">— {s.desc}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-2xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-colors ${tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Dashboard ─────────────────────────────────────────────────────────── */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Members" value={String(customers.length)} sub={`${stats.withPoints} with points`} />
            <StatCard icon={Star} label="Total Points" value={stats.totalPts.toLocaleString()} sub="across all members" color="text-violet-600 dark:text-violet-400" />
            <StatCard icon={Gift} label="Redeemable" value={`${currency}${(stats.totalPts / Math.max(redemptionRate, 1)).toFixed(0)}`} sub="if all redeemed" color="text-emerald-600 dark:text-emerald-400" />
            <StatCard icon={Award} label="Active Rewards" value={String(rewards.filter(r => r.isActive).length)} sub={`${tiers.length} tiers`} color="text-amber-600 dark:text-amber-400" />
          </div>

          {/* Tier breakdown */}
          {tiers.length > 0 && (
            <div className="bg-card rounded-2xl border border-border/40 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Members by Tier</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-medium">No Tier</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{stats.tierCounts["none"] ?? customers.length}</span>
                    </div>
                  </div>
                </div>
                {tiers.map(t => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-medium">{t.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{stats.tierCounts[t.name.toLowerCase()] ?? 0}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${customers.length > 0 ? ((stats.tierCounts[t.name.toLowerCase()] ?? 0) / customers.length) * 100 : 0}%`, backgroundColor: t.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top customers */}
          <div className="bg-card rounded-2xl border border-border/40 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest">Top Loyalty Members</h2>
            </div>
            {stats.top.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No customers with points yet. Attach customers to orders in POS to start tracking.</div>
            ) : stats.top.map((c, idx) => {
              const tier = TIER_ICONS[(c.tier ?? "none").toLowerCase()];
              const TierIcon = tier ?? Star;
              return (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20 border-t border-border/20 first:border-0" data-testid={`row-loyalty-${c.id}`}>
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center text-[11px] font-black shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      {c.tier && c.tier !== "none" && <TierIcon className="h-3 w-3 text-amber-500 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{c.phone || c.email || `${c.visitCount ?? 0} visits`}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-violet-600 dark:text-violet-400 tabular-nums">{(c.loyaltyPoints ?? 0).toLocaleString()} pts</p>
                    <p className="text-[10px] text-muted-foreground">≈ {currency}{((c.loyaltyPoints ?? 0) / Math.max(redemptionRate, 1)).toFixed(0)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tiers ─────────────────────────────────────────────────────────────── */}
      {tab === "tiers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-base">Tier Levels</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Customers auto-progress based on lifetime points earned</p>
            </div>
            <div className="flex gap-2">
              {tiers.length === 0 && (
                <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5" onClick={seedPresetTiers} data-testid="button-seed-tiers">
                  <Sparkles className="h-3 w-3" />Use Presets
                </Button>
              )}
              <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setTierDialog({ open: true, tier: null })} data-testid="button-add-tier">
                <Plus className="h-3.5 w-3.5" />Add Tier
              </Button>
            </div>
          </div>

          {tiers.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border/40">
              <Crown className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
              <p className="font-semibold text-sm">No tiers configured</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add tiers to reward loyal customers with better perks as they progress</p>
              <Button variant="outline" size="sm" className="mt-4 rounded-xl" onClick={seedPresetTiers}>Use Bronze/Silver/Gold/Platinum presets</Button>
            </div>
          ) : tiers.map(t => {
            const TierIcon = TIER_ICONS[t.name.toLowerCase()] ?? Star;
            return (
              <div key={t.id} className="bg-card rounded-2xl border border-border/40 p-4 flex items-center gap-3 shadow-sm" data-testid={`tier-row-${t.id}`}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}20` }}>
                  <TierIcon className="h-5 w-5" style={{ color: t.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{t.name}</p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">{t.multiplier}× pts</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Unlocks at {t.minLifetimePoints.toLocaleString()} lifetime pts</p>
                  {t.perks && <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{t.perks}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {deletingTier === t.id ? (
                    <>
                      <button onClick={() => deleteTier.mutate(t.id)} className="h-8 w-8 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeletingTier(null)} className="h-8 w-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setTierDialog({ open: true, tier: t })} className="h-8 w-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground" data-testid={`button-edit-tier-${t.id}`}><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeletingTier(t.id)} className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/50" data-testid={`button-delete-tier-${t.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Rewards ───────────────────────────────────────────────────────────── */}
      {tab === "rewards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-base">Rewards Catalog</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Customers redeem points for these rewards at checkout or from their profile</p>
            </div>
            <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setRewardDialog({ open: true, reward: null })} data-testid="button-add-reward">
              <Plus className="h-3.5 w-3.5" />Add Reward
            </Button>
          </div>

          {rewards.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border/40">
              <Gift className="h-10 w-10 mx-auto mb-3 text-muted-foreground/20" />
              <p className="font-semibold text-sm">No rewards yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add fixed discounts, % discounts, free products, or custom rewards</p>
            </div>
          ) : rewards.map(r => {
            const TypeIcon = REWARD_TYPE_OPTIONS.find(o => o.value === r.type)?.icon ?? Gift;
            return (
              <div key={r.id} className={`bg-card rounded-2xl border p-4 flex items-center gap-3 shadow-sm ${r.isActive ? "border-border/40" : "border-border/20 opacity-60"}`} data-testid={`reward-row-${r.id}`}>
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <TypeIcon className="h-5 w-5 text-primary/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm">{r.name}</p>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${r.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[r.type]} · {r.pointsCost.toLocaleString()} pts</p>
                  {r.description && <p className="text-[10px] text-muted-foreground/50 truncate">{r.description}</p>}
                  {r.redemptionCount ? <p className="text-[10px] text-muted-foreground/40">{r.redemptionCount} redeemed{r.maxRedemptions ? ` / ${r.maxRedemptions} max` : ""}</p> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={r.isActive ?? false} onCheckedChange={v => toggleReward.mutate({ id: r.id, isActive: v })} />
                  {deletingReward === r.id ? (
                    <>
                      <button onClick={() => deleteReward.mutate(r.id)} className="h-8 w-8 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeletingReward(null)} className="h-8 w-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setRewardDialog({ open: true, reward: r })} className="h-8 w-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground" data-testid={`button-edit-reward-${r.id}`}><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeletingReward(r.id)} className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/50" data-testid={`button-delete-reward-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Settings ──────────────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="space-y-4">
          <form onSubmit={settingsForm.handleSubmit(onSaveSettings)} className="space-y-4">
            {/* Earning */}
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Point Earning</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Points per {currency}1 spent</label>
                  <Input type="number" step="0.01" min="0" {...settingsForm.register("loyaltyPointsPerUnit")} className="rounded-xl h-9" data-testid="input-points-per-unit" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">e.g. 1 = 1 pt per {currency}1, 0.1 = 1 pt per {currency}10</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Points for {currency}1 off</label>
                  <Input type="number" step="1" min="1" {...settingsForm.register("loyaltyRedemptionRate")} className="rounded-xl h-9" data-testid="input-redemption-rate" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">e.g. 100 = 100 pts = {currency}1 discount</p>
                </div>
              </div>

              {/* Live calculator */}
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200/40 dark:border-violet-500/20 p-3">
                <div className="flex items-center gap-1.5 mb-2"><Calculator className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /><p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">Live Example</p></div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div><p className="text-muted-foreground">{currency}1,000 spent</p><p className="font-bold">{Math.floor(1000 * pointsPerUnit)} pts</p></div>
                  <div><p className="text-muted-foreground">Worth</p><p className="font-bold text-emerald-600 dark:text-emerald-400">{currency}{(Math.floor(1000 * pointsPerUnit) / Math.max(redemptionRate, 1)).toFixed(2)} off</p></div>
                  <div><p className="text-muted-foreground">Effective</p><p className="font-bold">{((Math.floor(1000 * pointsPerUnit) / Math.max(redemptionRate, 1)) / 10).toFixed(1)}% back</p></div>
                </div>
              </div>
            </div>

            {/* Bonus rules */}
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bonus Points</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Birthday Bonus (pts)</label>
                  <Input type="number" min="0" {...settingsForm.register("loyaltyBirthdayBonus")} className="rounded-xl h-9" data-testid="input-birthday-bonus" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">0 = disabled</p>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Referral Bonus (pts)</label>
                  <Input type="number" min="0" {...settingsForm.register("loyaltyReferralBonus")} className="rounded-xl h-9" data-testid="input-referral-bonus" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Awarded to referrer when someone joins</p>
                </div>
              </div>
            </div>

            {/* Stamp card */}
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Stamp Card</p>
                <Switch checked={settingsForm.watch("loyaltyStampEnabled")} onCheckedChange={v => settingsForm.setValue("loyaltyStampEnabled", v)} data-testid="switch-stamp-enabled" />
              </div>
              {settingsForm.watch("loyaltyStampEnabled") && (
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Stamps needed for reward</label>
                  <Input type="number" min="2" max="50" {...settingsForm.register("loyaltyStampTarget")} className="rounded-xl h-9 w-32" data-testid="input-stamp-target" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Each purchase = 1 stamp. Configure the stamp reward in the Rewards catalog above (type: Stamp Card).</p>
                </div>
              )}
            </div>

            {/* Expiry */}
            <div className="bg-card rounded-2xl border border-border/40 p-4 space-y-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Points Expiry</p>
              <div>
                <label className="text-xs font-semibold mb-1.5 block">Expire points after (days)</label>
                <Input type="number" min="0" {...settingsForm.register("loyaltyExpiryDays")} className="rounded-xl h-9 w-32" data-testid="input-expiry-days" />
                <p className="text-[10px] text-muted-foreground/60 mt-1">0 = points never expire</p>
              </div>
            </div>

            {isOwner && (
              <Button type="submit" className="w-full rounded-2xl" disabled={updateSettings.isPending} data-testid="button-save-loyalty-settings">
                <Save className="h-3.5 w-3.5 mr-2" />{updateSettings.isPending ? "Saving…" : "Save Loyalty Settings"}
              </Button>
            )}
          </form>
        </div>
      )}

      {/* Tier Form Dialog */}
      <TierFormDialog
        open={tierDialog.open}
        onClose={() => setTierDialog({ open: false })}
        initial={tierDialog.tier}
        onSave={handleTierSave}
      />

      {/* Reward Form Dialog */}
      <RewardFormDialog
        open={rewardDialog.open}
        onClose={() => setRewardDialog({ open: false })}
        initial={rewardDialog.reward}
        onSave={handleRewardSave}
        products={products}
      />
    </div>
  );
}
