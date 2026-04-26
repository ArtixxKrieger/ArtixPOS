import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Sparkles, Gift, Coins, TrendingUp, Users, Save, BookOpen, Star, Calculator } from "lucide-react";
import type { Customer } from "@shared/schema";

const loyaltySchema = z.object({
  loyaltyPointsPerUnit: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 0, { message: "Must be 0 or greater" }),
  loyaltyRedemptionRate: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 1, { message: "Must be at least 1" }),
});

type LoyaltyFormData = z.infer<typeof loyaltySchema>;

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/40 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ExampleCalc({ pointsPerUnit, redemptionRate, currency, settings }: { pointsPerUnit: number; redemptionRate: number; currency: string; settings: any }) {
  const sampleSpend = 1000;
  const earnedPoints = Math.floor(sampleSpend * pointsPerUnit);
  const discountValue = redemptionRate > 0 ? (earnedPoints / redemptionRate) : 0;
  return (
    <div className="rounded-2xl border border-violet-200/30 dark:border-violet-500/20 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">Live Example</p>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Customer spends</span>
          <span className="font-semibold tabular-nums">{currency}{sampleSpend.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">They earn</span>
          <span className="font-semibold tabular-nums text-violet-600 dark:text-violet-400">{earnedPoints.toLocaleString()} points</span>
        </div>
        <div className="flex justify-between border-t border-violet-200/40 dark:border-violet-500/20 pt-1.5 mt-1.5">
          <span className="text-muted-foreground">Worth as discount</span>
          <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{currency}{discountValue.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default function LoyaltyPage() {
  const { user } = useAuth();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const isOwner = user?.role === "owner";

  const businessSubType = (settings as any)?.businessSubType;
  const isCafeStyle = ["cafe", "bakery", "food_truck"].includes(businessSubType || "");
  const currency = (settings as any)?.currency || "₱";

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: !isCafeStyle,
  });

  const form = useForm<LoyaltyFormData>({
    resolver: zodResolver(loyaltySchema),
    defaultValues: { loyaltyPointsPerUnit: "1", loyaltyRedemptionRate: "100" },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        loyaltyPointsPerUnit: (settings as any).loyaltyPointsPerUnit?.toString() || "1",
        loyaltyRedemptionRate: (settings as any).loyaltyRedemptionRate?.toString() || "100",
      });
    }
  }, [settings, form]);

  const watched = form.watch();
  const pointsPerUnit = parseFloat(watched.loyaltyPointsPerUnit || "1") || 0;
  const redemptionRate = parseFloat(watched.loyaltyRedemptionRate || "100") || 1;

  const stats = useMemo(() => {
    const enrolled = customers.filter((c: any) => (c.loyaltyPoints ?? 0) > 0);
    const totalPoints = customers.reduce((sum: number, c: any) => sum + (c.loyaltyPoints ?? 0), 0);
    const top = [...customers].sort((a: any, b: any) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)).slice(0, 8);
    return { totalEnrolled: enrolled.length, totalPoints, top };
  }, [customers]);

  const onSubmit = (data: LoyaltyFormData) => {
    updateSettings.mutate(
      {
        loyaltyPointsPerUnit: data.loyaltyPointsPerUnit,
        loyaltyRedemptionRate: data.loyaltyRedemptionRate,
      } as any,
      { onSuccess: () => toast({ title: "Loyalty settings saved" }) },
    );
  };

  if (settingsLoading) {
    return (
      <div className="space-y-3 max-w-4xl">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5 page-enter">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 text-white p-6 md:p-8 shadow-xl">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold leading-tight">Loyalty Program</h1>
            <p className="text-white/80 text-sm mt-1">Reward repeat customers with points they can redeem at checkout.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3">
            <Coins className="h-4 w-4 mb-1.5 opacity-80" />
            <p className="text-[10px] uppercase tracking-widest font-semibold opacity-70">Step 1 — Earn</p>
            <p className="text-xs mt-1 leading-snug">Customers earn points on every purchase based on the rate you set.</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3">
            <Gift className="h-4 w-4 mb-1.5 opacity-80" />
            <p className="text-[10px] uppercase tracking-widest font-semibold opacity-70">Step 2 — Save</p>
            <p className="text-xs mt-1 leading-snug">Points accumulate on the customer profile and can be checked anytime.</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3">
            <TrendingUp className="h-4 w-4 mb-1.5 opacity-80" />
            <p className="text-[10px] uppercase tracking-widest font-semibold opacity-70">Step 3 — Redeem</p>
            <p className="text-xs mt-1 leading-snug">At checkout, apply points as a discount based on your redemption rate.</p>
          </div>
        </div>
      </div>

      {/* How it works explainer */}
      <div className="rounded-2xl bg-card border border-border/40 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">How It Works</h2>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <span className="font-semibold text-foreground">Points per 1 unit spent</span> &mdash; how many points the customer gets for every {currency}1 of spend.
            For example, set this to <span className="font-mono text-foreground">1</span> to give 1 point per {currency}1, or <span className="font-mono text-foreground">0.1</span> to give 1 point per {currency}10.
          </p>
          <p>
            <span className="font-semibold text-foreground">Points for 1 unit discount</span> &mdash; how many points are needed to redeem {currency}1 off a future purchase.
            For example, set this to <span className="font-mono text-foreground">100</span> so 100 points = {currency}1 discount.
          </p>
          {isCafeStyle ? (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 text-amber-800 dark:text-amber-200 text-[12px]">
              <p className="font-semibold mb-1">Heads-up for cafés &amp; bakeries</p>
              <p className="opacity-90 leading-relaxed">
                Loyalty points need to be tied to a customer profile, but cafés in ArtixPOS use Starbucks-style guest names instead of saved customer records.
                Configure the rates here for the future, or contact support to enable customer profiles for your store.
              </p>
            </div>
          ) : (
            <p>
              When ringing up a sale in the POS, attach the customer to the order. Points will be added automatically based on the total.
              On future orders, you can apply their accumulated points as a discount.
            </p>
          )}
        </div>
      </div>

      {/* Configure + live example */}
      {isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border/40 p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground mb-4">Configure Rates</h2>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="loyaltyPointsPerUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Points per {currency}1 spent</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} value={field.value || "1"} className="h-9 text-sm rounded-lg" data-testid="input-points-per-unit" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="loyaltyRedemptionRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Points needed for {currency}1 off</FormLabel>
                    <FormControl>
                      <Input type="number" step="1" min="1" {...field} value={field.value || "100"} className="h-9 text-sm rounded-lg" data-testid="input-redemption-rate" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )} />
                <Button type="submit" disabled={updateSettings.isPending} className="w-full" data-testid="button-save-loyalty">
                  <Save className="h-3.5 w-3.5 mr-2" />
                  {updateSettings.isPending ? "Saving..." : "Save Loyalty Settings"}
                </Button>
              </form>
            </Form>
          </div>
          <ExampleCalc pointsPerUnit={pointsPerUnit} redemptionRate={redemptionRate} currency={currency} settings={settings} />
        </div>
      )}

      {/* Stats + top customers (only for non-cafe) */}
      {!isCafeStyle && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard
              icon={Users}
              label="Enrolled"
              value={String(stats.totalEnrolled)}
              sub={`out of ${customers.length} customers`}
            />
            <StatCard
              icon={Coins}
              label="Total Points"
              value={stats.totalPoints.toLocaleString()}
              sub="across all customers"
            />
            <StatCard
              icon={Gift}
              label="Equivalent Value"
              value={`${currency}${(stats.totalPoints / Math.max(redemptionRate, 1)).toFixed(0)}`}
              sub="if all points were redeemed"
            />
          </div>

          <div className="rounded-2xl bg-card border border-border/40 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Top Loyalty Customers</h2>
            </div>
            {customersLoading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : stats.top.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No customers have earned points yet. Add customers to orders in the POS to start tracking loyalty.
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {stats.top.map((c: any, idx: number) => (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30" data-testid={`row-loyalty-${c.id}`}>
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.phone || c.email || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">{(c.loyaltyPoints ?? 0).toLocaleString()} pts</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">≈ {currency}{((c.loyaltyPoints ?? 0) / Math.max(redemptionRate, 1)).toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
