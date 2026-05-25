import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { insertCustomerSchema, type Customer, type LoyaltyPointsLog, type LoyaltyReward } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Search, Phone, Mail, Trash2, Edit, ShoppingBag, X, Star,
  TrendingUp, TrendingDown, Gift, History, Crown, Medal, Sparkles, Calendar,
  Award, Check, ChevronRight, UserCircle2, Stamp,
} from "lucide-react";
import { PhantomLoader } from "@/components/ui/phantom-loader";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof Star }> = {
  none:     { label: "Member",   color: "text-muted-foreground",              bg: "bg-muted/50",            icon: Star },
  bronze:   { label: "Bronze",   color: "text-amber-700 dark:text-amber-500", bg: "bg-amber-500/10",        icon: Medal },
  silver:   { label: "Silver",   color: "text-slate-500 dark:text-slate-300", bg: "bg-slate-400/10",        icon: Star },
  gold:     { label: "Gold",     color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-400/10",     icon: Crown },
  platinum: { label: "Platinum", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10",    icon: Sparkles },
};

const REASON_LABELS: Record<string, string> = {
  purchase: "Purchase earned", redeem_discount: "Discount redeemed", redeem_product: "Free item redeemed",
  birthday: "Birthday bonus", referral: "Referral bonus", manual: "Manual adjustment",
  expiry: "Points expired", stamp_bonus: "Stamp card reward",
};

function getTier(c: Customer) {
  const key = (c.tier ?? "none").toLowerCase();
  return TIER_CFG[key] ?? TIER_CFG.none;
}

// ─── Form schema ──────────────────────────────────────────────────────────────

const formSchema = insertCustomerSchema.extend({
  name: z.string().min(1, "Name is required"),
  birthday: z.string().optional().nullable(),
  referredBy: z.number().optional().nullable(),
});

type FormData = z.infer<typeof formSchema>;

// ─── Customer Form ────────────────────────────────────────────────────────────

function CustomerForm({ initial, onSuccess, onClose, customers }: {
  initial?: Partial<Customer>;
  onSuccess: (c?: Customer) => void;
  onClose: () => void;
  customers: Customer[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const form = useForm<FormData>({
    defaultValues: {
      name: initial?.name ?? "",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      birthday: (initial as any)?.birthday ?? "",
      notes: initial?.notes ?? "",
      referredBy: null,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = { ...data, birthday: data.birthday || null, referredBy: data.referredBy || null };
      const r = isEdit
        ? await apiRequest("PUT", `/api/customers/${initial!.id}`, payload)
        : await apiRequest("POST", "/api/customers", payload);
      return r.json();
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: isEdit ? "Customer updated" : "Customer added" });
      onSuccess(c);
    },
    onError: () => toast({ title: "Error saving customer", variant: "destructive" }),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem><FormLabel className="font-semibold text-sm">Full Name *</FormLabel>
            <FormControl><Input {...field} placeholder="e.g. Maria Santos" className="rounded-xl" data-testid="input-customer-name" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="phone" render={({ field }) => (
            <FormItem><FormLabel className="font-semibold text-sm">Phone</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="09XX XXX XXXX" className="rounded-xl" data-testid="input-customer-phone" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="birthday" render={({ field }) => (
            <FormItem><FormLabel className="font-semibold text-sm">Birthday</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} type="date" className="rounded-xl" data-testid="input-customer-birthday" /></FormControl>
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel className="font-semibold text-sm">Email</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ""} type="email" placeholder="email@example.com" className="rounded-xl" data-testid="input-customer-email" /></FormControl>
          </FormItem>
        )} />

        <FormField control={form.control} name="notes" render={({ field }) => (
          <FormItem><FormLabel className="font-semibold text-sm">Notes</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Preferences, allergies, VIP status…" rows={2} className="rounded-xl text-sm" data-testid="input-customer-notes" /></FormControl>
          </FormItem>
        )} />

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1 rounded-2xl" disabled={mutation.isPending} data-testid="button-save-customer">
            {mutation.isPending ? "Saving…" : isEdit ? "Update" : "Add Customer"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── Profile Dialog ───────────────────────────────────────────────────────────

function CustomerProfile({ customer: initial, onClose, onEdit, currency }: {
  customer: Customer; onClose: () => void; onEdit: () => void; currency: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [customer, setCustomer] = useState(initial);
  const [tab, setTab] = useState<"overview" | "history" | "rewards">("overview");
  const [manualDelta, setManualDelta] = useState("");
  const [manualNote, setManualNote] = useState("");

  const { data: pointsLog = [] } = useQuery<LoyaltyPointsLog[]>({
    queryKey: ["/api/customers", customer.id, "loyalty-log"],
    queryFn: async () => {
      const r = await fetch(`/api/customers/${customer.id}/loyalty-log`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const { data: rewards = [] } = useQuery<LoyaltyReward[]>({ queryKey: ["/api/loyalty/rewards"] });

  const { data: sales = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", customer.id, "sales"],
    queryFn: async () => {
      const r = await fetch(`/api/customers/${customer.id}/sales`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const adjustPts = useMutation({
    mutationFn: ({ delta, note }: { delta: number; note?: string }) =>
      apiRequest("POST", `/api/customers/${customer.id}/loyalty`, { delta, note, reason: "manual" }).then(r => r.json()),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/customers", customer.id, "loyalty-log"] });
      setCustomer(c); setManualDelta(""); setManualNote("");
      toast({ title: "Points adjusted" });
    },
    onError: (err: any) => toast({ title: "Failed to adjust points", description: err?.message ?? "Please try again", variant: "destructive" }),
  });

  const redeemReward = useMutation({
    mutationFn: (rewardId: number) =>
      apiRequest("POST", `/api/customers/${customer.id}/redeem-reward`, { rewardId }).then(r => r.json()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/customers", customer.id, "loyalty-log"] });
      setCustomer(res.customer);
      toast({ title: `✓ Redeemed: ${res.reward.name}`, description: `−${res.reward.pointsCost} pts deducted` });
    },
    onError: () => toast({ title: "Cannot redeem", description: "Insufficient points or reward unavailable", variant: "destructive" }),
  });

  const tier = getTier(customer);
  const TierIcon = tier.icon;
  const lifetimePts = (customer as any).lifetimePoints ?? 0;
  const birthday = (customer as any).birthday;
  const stampCount = (customer as any).stampCount ?? 0;
  const activeRewards = rewards.filter(r => r.isActive);

  const TYPE_LABEL: Record<string, (r: LoyaltyReward) => string> = {
    discount_fixed:   r => `${currency}${r.value} off`,
    discount_percent: r => `${r.value}% off`,
    free_product:     _r => "Free product",
    stamp_card:       _r => "Stamp reward",
    custom:           r => r.value,
  };

  return (
    <div className="flex flex-col max-h-[88dvh]">
      {/* Hero */}
      <div className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border/20 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center">
              <span className="text-xl font-black text-primary">{customer.name[0].toUpperCase()}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base">{customer.name}</h3>
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${tier.bg} ${tier.color}`}>
                  <TierIcon className="h-2.5 w-2.5" />{tier.label}
                </span>
              </div>
              {customer.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-2.5 w-2.5" />{customer.phone}</p>}
              {customer.email && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{customer.email}</p>}
              {birthday && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{birthday}</p>}
            </div>
          </div>
          <button onClick={onEdit} className="h-8 w-8 rounded-xl hover:bg-muted/60 flex items-center justify-center text-muted-foreground" data-testid="button-edit-customer"><Edit className="h-3.5 w-3.5" /></button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Points", value: (customer.loyaltyPoints ?? 0).toLocaleString(), highlight: true },
            { label: "Lifetime", value: lifetimePts.toLocaleString() },
            { label: "Visits", value: String(customer.visitCount ?? 0) },
            { label: "Spent", value: formatCurrency(customer.totalSpent ?? "0", currency) },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-2 text-center ${s.highlight ? "bg-primary/20" : "bg-background/60"}`}>
              <p className={`text-sm font-black tabular-nums ${s.highlight ? "text-primary" : ""}`}>{s.value}</p>
              <p className="text-[9px] font-semibold text-muted-foreground/60 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/30 shrink-0">
        {(["overview", "history", "rewards"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "history" ? "Points Log" : t === "rewards" ? "Redeem" : "Overview"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {tab === "overview" && (
          <>
            {customer.notes && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Notes</p>
                <p className="text-sm text-muted-foreground">{customer.notes}</p>
              </div>
            )}

            {/* Purchase history */}
            <div className="bg-card rounded-2xl border border-border/30 overflow-hidden">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-3 pt-3 pb-1.5">Recent Purchases</p>
              {sales.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-xs">No purchases yet</div>
              ) : sales.slice(0, 5).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2.5 border-t border-border/20">
                  <div>
                    <p className="text-sm font-semibold">{format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                    <p className="text-[10px] text-muted-foreground">{Array.isArray(s.items) ? s.items.length : 0} item{Array.isArray(s.items) && s.items.length !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="font-bold text-primary tabular-nums text-sm">{formatCurrency(s.total, currency)}</p>
                </div>
              ))}
            </div>

            {/* Manual adjust */}
            <div className="bg-card rounded-2xl border border-border/30 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Manual Points Adjustment</p>
              <div className="flex gap-2">
                <Input type="number" placeholder="Points amount" value={manualDelta} onChange={e => setManualDelta(e.target.value)} className="rounded-xl h-9 text-sm" data-testid="input-manual-points" />
                <Input placeholder="Reason (optional)" value={manualNote} onChange={e => setManualNote(e.target.value)} className="rounded-xl h-9 text-sm" data-testid="input-manual-note" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs"
                  disabled={!manualDelta || adjustPts.isPending}
                  onClick={() => adjustPts.mutate({ delta: Math.abs(Number(manualDelta)), note: manualNote || undefined })}
                  data-testid="button-add-points">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />Add Points
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs"
                  disabled={!manualDelta || adjustPts.isPending}
                  onClick={() => adjustPts.mutate({ delta: -Math.abs(Number(manualDelta)), note: manualNote || undefined })}
                  data-testid="button-deduct-points">
                  <TrendingDown className="h-3 w-3 text-rose-500" />Deduct Points
                </Button>
              </div>
            </div>
          </>
        )}

        {tab === "history" && (
          <>
            {pointsLog.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No points history yet</p>
                <p className="text-xs mt-1 opacity-60">Points earned or redeemed will appear here</p>
              </div>
            ) : pointsLog.map(log => (
              <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border/20 hover:bg-muted/20" data-testid={`points-log-${log.id}`}>
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${log.delta > 0 ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
                  {log.delta > 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${log.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                      {log.delta > 0 ? "+" : ""}{log.delta} pts
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-muted/50 rounded-md px-1.5 py-0.5">bal: {log.balance}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {REASON_LABELS[log.reason] ?? log.reason}{log.note ? ` · ${log.note}` : ""}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground/40 shrink-0">{log.createdAt ? format(new Date(log.createdAt), "MMM d, h:mm a") : ""}</p>
              </div>
            ))}
          </>
        )}

        {tab === "rewards" && (
          <>
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-3 flex items-center gap-3">
              <Star className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-base font-black text-primary">{(customer.loyaltyPoints ?? 0).toLocaleString()} pts available</p>
                <p className="text-[11px] text-muted-foreground">Select a reward below to redeem</p>
              </div>
            </div>

            {activeRewards.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No rewards catalog yet</p>
                <p className="text-xs mt-1 opacity-60">Set up rewards in the Loyalty page</p>
              </div>
            ) : activeRewards.map(r => {
              const canAfford = (customer.loyaltyPoints ?? 0) >= r.pointsCost;
              const label = TYPE_LABEL[r.type]?.(r) ?? r.type;
              return (
                <div key={r.id} className={`bg-card rounded-2xl p-3 flex items-center gap-3 border transition-opacity ${canAfford ? "border-primary/20" : "border-border/20 opacity-50"}`} data-testid={`reward-item-${r.id}`}>
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                    <Gift className="h-5 w-5 text-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{r.name}</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{label}</p>
                    {r.description && <p className="text-[10px] text-muted-foreground/50 truncate">{r.description}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-black text-primary">{r.pointsCost.toLocaleString()} pts</p>
                    <Button size="sm" className="mt-1 h-7 rounded-xl px-2.5 text-xs"
                      disabled={!canAfford || redeemReward.isPending}
                      onClick={() => redeemReward.mutate(r.id)}
                      data-testid={`button-redeem-${r.id}`}>
                      Redeem
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Customers() {
  const { data: customers = [], isLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const qc = useQueryClient();
  const currency = (settings as any)?.currency || "₱";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/customers/${id}`),
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ["/api/customers"] });
      const previous = qc.getQueryData<any[]>(["/api/customers"]);
      qc.setQueryData<any[]>(["/api/customers"], (old) => old ? old.filter(c => c.id !== id) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(["/api/customers"], ctx.previous); toast({ title: "Delete failed", variant: "destructive" }); },
    onSuccess: () => { setProfileCustomer(null); toast({ title: "Customer deleted" }); },
  });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (c.phone || "").includes(debouncedSearch) ||
    (c.email || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const totalPts = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const totalRevenue = customers.reduce((s, c) => s + parseNumeric(c.totalSpent), 0);

  return (
    <PhantomLoader loading={isLoading}>
    <div className="space-y-4 page-enter">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-primary/8 to-transparent">
          <div className="flex items-center gap-1.5 mb-2"><Users className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Members</p></div>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-violet-500/8 to-transparent">
          <div className="flex items-center gap-1.5 mb-2"><Star className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Points</p></div>
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">{totalPts.toLocaleString()}</p>
        </div>
        <div className="glass-card rounded-2xl p-4 bg-gradient-to-br from-emerald-500/8 to-transparent">
          <div className="flex items-center gap-1.5 mb-2"><ShoppingBag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Revenue</p></div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(totalRevenue, currency)}</p>
        </div>
      </div>

      {/* Search & Add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl border-border bg-background" data-testid="input-search-customers" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Button onClick={() => { setEditCustomer(null); setShowForm(true); }} className="h-10 rounded-xl" data-testid="button-add-customer">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl py-20 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center mb-2"><Users className="h-8 w-8 text-muted-foreground/30" /></div>
          <p className="font-semibold">{search ? "No customers found" : "No customers yet"}</p>
          <p className="text-sm text-muted-foreground/70">{search ? "Try a different search" : "Add your first customer to get started"}</p>
          {!search && <Button onClick={() => setShowForm(true)} variant="outline" className="mt-2"><Plus className="h-4 w-4 mr-1" /> Add Customer</Button>}
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-border/30">
            {filtered.map(c => {
              const tier = getTier(c);
              const TierIcon = tier.icon;
              return (
                <button key={c.id} data-testid={`customer-row-${c.id}`} onClick={() => setProfileCustomer(c)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-bold text-sm text-primary">{c.name[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{c.name}</p>
                      {(c.tier && c.tier !== "none") && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold ${tier.bg} ${tier.color}`}>
                          <TierIcon className="h-2 w-2" />{tier.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 min-w-0">
                      {c.phone && <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.email && <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span></span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-primary" />
                      <span className="text-xs font-black text-primary tabular-nums">{(c.loyaltyPoints ?? 0).toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(c.totalSpent ?? "0", currency)}</p>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30 mt-0.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm || !!editCustomer} onOpenChange={v => { if (!v) { setShowForm(false); setEditCustomer(null); } }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle className="font-black">{editCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <CustomerForm
            initial={editCustomer ?? undefined}
            customers={customers}
            onSuccess={(c) => { setShowForm(false); setEditCustomer(null); if (c) setProfileCustomer(c); }}
            onClose={() => { setShowForm(false); setEditCustomer(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog open={!!profileCustomer} onOpenChange={v => !v && setProfileCustomer(null)}>
        <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="sr-only"><DialogTitle>Customer Profile</DialogTitle></DialogHeader>
          {profileCustomer && (
            <CustomerProfile
              customer={profileCustomer}
              currency={currency}
              onClose={() => setProfileCustomer(null)}
              onEdit={() => { setEditCustomer(profileCustomer); setProfileCustomer(null); setShowForm(true); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PhantomLoader>
  );
}
