import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  useSubscription,
  PRO_FEATURES, BUSINESS_FEATURES, FREE_LIMITS,
  type BillingCycle, type TenantSubscription, type SubscriptionPlan,
} from "@/hooks/use-subscription";
import { useRevenueCat, isNative } from "@/lib/revenuecat";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check, X, Crown, Zap, Building2, CreditCard, Calendar,
  AlertTriangle, Lock, RefreshCw, Sparkles, Bot, FileText,
  Users, Package, BarChart3, Briefcase, Star,
} from "lucide-react";

interface SubscriptionPayment {
  id: number;
  plan: string;
  billingCycle: string;
  amount: number;
  status: string;
  paidAt?: string | null;
  createdAt: string;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function formatAmount(centavos: number) {
  return (centavos / 100).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

const COMPARISON_ROWS: {
  label: string;
  icon: React.ElementType;
  free: string | boolean;
  pro: string | boolean;
  business: string | boolean;
}[] = [
  { label: "Branches",               icon: Building2,  free: "1",             pro: "1",              business: "Up to 10" },
  { label: "Products",               icon: Package,    free: "Up to 100",     pro: "Unlimited",      business: "Unlimited" },
  { label: "Staff accounts",         icon: Users,      free: "2",             pro: "Up to 15",       business: "Unlimited" },
  { label: "Analytics history",      icon: BarChart3,  free: "7 days",        pro: "Unlimited",      business: "Unlimited" },
  { label: "Customer loyalty",       icon: Star,       free: false,           pro: true,             business: true },
  { label: "Appointments",           icon: Calendar,   free: false,           pro: true,             business: true },
  { label: "Suppliers & POs",        icon: Briefcase,  free: false,           pro: true,             business: true },
  { label: "Payroll",                icon: CreditCard, free: false,           pro: "Basic",          business: "Advanced (SSS/PhilHealth/Pag-IBIG)" },
  { label: "AI business assistant",  icon: Bot,        free: false,           pro: false,            business: true },
  { label: "BIR compliance",         icon: FileText,   free: false,           pro: false,            business: true },
  { label: "Multi-branch reports",   icon: BarChart3,  free: false,           pro: false,            business: true },
  { label: "Audit log",              icon: FileText,   free: false,           pro: true,             business: true },
  { label: "Priority support",       icon: Sparkles,   free: false,           pro: false,            business: true },
];

function ComparisonCell({ value, accent }: { value: string | boolean; accent: "gray" | "violet" | "amber" }) {
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
  if (value === true) {
    const color = accent === "violet" ? "text-violet-500" : accent === "amber" ? "text-amber-500" : "text-emerald-500";
    return <Check className={`w-4 h-4 ${color} mx-auto`} />;
  }
  const color = accent === "violet" ? "text-violet-600 dark:text-violet-400" : accent === "amber" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return <span className={`text-xs font-medium ${color}`}>{value}</span>;
}

export default function BillingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscription, plan: currentPlan, isPro, isBusiness, isLoading, refetch } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [verifying, setVerifying] = useState(false);

  const native = isNative();
  const rc = useRevenueCat(user?.tenantId ?? undefined);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<SubscriptionPayment[]>({
    queryKey: ["/api/subscription/payments"],
    enabled: !!user,
  });

  useEffect(() => {
    if (native) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      setVerifying(true);
      apiRequest("POST", "/api/subscription/verify", {})
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            const planName = data.plan === "business" ? "Business" : "Pro";
            toast({ title: `${planName} activated!`, description: `Welcome to ArtixPOS ${planName}. Enjoy all features!` });
            queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
            queryClient.invalidateQueries({ queryKey: ["/api/subscription/payments"] });
          } else {
            toast({ title: "Payment pending", description: "Your payment is being processed. Please check back shortly.", variant: "destructive" });
          }
        })
        .catch(() => toast({ title: "Verification failed", description: "Please contact support if you were charged.", variant: "destructive" }))
        .finally(() => {
          setVerifying(false);
          navigate("/billing", { replace: true });
        });
    } else if (status === "cancel") {
      toast({ title: "Payment cancelled", description: "Your subscription was not changed." });
      navigate("/billing", { replace: true });
    }
  }, []);

  const checkoutMutation = useMutation({
    mutationFn: ({ plan, cycle }: { plan: "pro" | "business"; cycle: BillingCycle }) =>
      apiRequest("POST", "/api/subscription/checkout", { plan, billingCycle: cycle }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Error", description: data.message ?? "Failed to create checkout", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not start checkout. Please try again.", variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/subscription/reactivate", {}).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Subscription reactivated!", description: "Your plan will continue past the current period." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => toast({ title: "Error", description: "Could not reactivate. Please try again.", variant: "destructive" }),
  });

  const handleNativePurchase = async () => {
    if (!rc.monthlyPackage) {
      toast({ title: "Store unavailable", description: "Could not load products from the App Store. Please try again.", variant: "destructive" });
      return;
    }
    try {
      await rc.purchase(rc.monthlyPackage);
      toast({ title: "Purchase successful!", description: "Welcome to ArtixPOS Pro!" });
      refetch();
    } catch (e: any) {
      if (e?.userCancelled || e?.code === "1") return;
      toast({ title: "Purchase failed", description: e?.message ?? "Something went wrong. Please try again.", variant: "destructive" });
    }
  };

  const handleNativeRestore = async () => {
    try {
      await rc.restore();
      toast({ title: "Purchases restored", description: "Your previous purchases have been restored." });
      refetch();
    } catch (e: any) {
      toast({ title: "Restore failed", description: e?.message ?? "Could not restore purchases. Please try again.", variant: "destructive" });
    }
  };

  const isOwner = user?.role === "owner";
  if (isLoading || verifying) return null;

  const showProRequiredBanner = new URLSearchParams(window.location.search).get("reason") === "pro_required" && !isPro;
  const nativePrice = rc.monthlyPackage?.product?.priceString ?? null;

  const proMonthlyPrice  = "₱499";
  const proAnnualPrice   = "₱4,999";
  const proMonthlyEq     = "₱416/mo";
  const bizMonthlyPrice  = "₱999";
  const bizAnnualPrice   = "₱9,999";
  const bizMonthlyEq     = "₱833/mo";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

      {/* Pro-required banner */}
      {showProRequiredBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 px-4 py-4">
          <Lock className="h-5 w-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-violet-900 dark:text-violet-200">Upgrade Required</p>
            <p className="text-sm text-violet-700 dark:text-violet-300 mt-0.5">
              The page you tried to access requires a paid plan. Upgrade below to unlock it.
            </p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="text-center space-y-2 pt-2">
        <h1 className="text-3xl font-black tracking-tight">Simple, transparent pricing</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Start free. Upgrade when your business grows. No hidden fees, cancel anytime.
        </p>
      </div>

      {/* Current plan status */}
      {isPro && (
        <div className={`flex items-center justify-between flex-wrap gap-3 rounded-2xl border px-5 py-4 ${
          isBusiness
            ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20"
            : "border-violet-300/60 bg-violet-50/60 dark:border-violet-700/40 dark:bg-violet-950/20"
        }`}>
          <div className="flex items-center gap-3">
            {isBusiness
              ? <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              : <Crown className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            }
            <div>
              <p className="font-semibold text-sm">
                {isBusiness ? "Business Plan" : "Pro Plan"} — {(subscription.billingCycle ?? "monthly") === "monthly" ? "Monthly" : "Annual"} billing
              </p>
              <p className="text-xs text-muted-foreground">
                {subscription.cancelAtPeriodEnd
                  ? `Cancels ${formatDate(subscription.currentPeriodEnd)}`
                  : `Renews ${formatDate(subscription.currentPeriodEnd)}`}
              </p>
            </div>
          </div>
          {subscription.cancelAtPeriodEnd && !native && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
              data-testid="button-reactivate"
            >
              {reactivateMutation.isPending ? "Reactivating…" : "Reactivate subscription"}
            </Button>
          )}
        </div>
      )}

      {/* Billing cycle toggle */}
      {isOwner && !native && (
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-2xl border border-border bg-muted/40 p-1 gap-1">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                billingCycle === "monthly"
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-billing-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                billingCycle === "annual"
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="button-billing-annual"
            >
              Annual
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                SAVE 17%
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Pricing cards */}
      {isOwner && (
        <div className="grid gap-4 md:grid-cols-3 items-stretch">

          {/* ── Free ── */}
          <div className={`relative flex flex-col rounded-2xl border bg-card overflow-hidden ${
            currentPlan === "free" ? "border-primary/40 ring-1 ring-primary/15" : "border-border/60"
          }`}>
            <div className="p-6 flex flex-col gap-4 flex-1">
              {/* Plan name */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                  </span>
                  <span className="font-bold text-lg">Free</span>
                </div>
                {currentPlan === "free" && (
                  <Badge className="bg-muted text-muted-foreground border-0 text-[11px]">Current</Badge>
                )}
              </div>

              {/* Price */}
              <div>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black">₱0</span>
                  <span className="text-muted-foreground text-sm pb-1">/ month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Free forever</p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {[
                  `${FREE_LIMITS.branches} branch`,
                  `Up to ${FREE_LIMITS.products} products`,
                  `Up to ${FREE_LIMITS.staff} staff accounts`,
                  "Core POS features",
                  "Cash payments",
                  "7-day analytics",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="pt-2">
                {currentPlan === "free" ? (
                  <div className="w-full text-center py-2.5 rounded-xl bg-muted/60 text-sm text-muted-foreground font-medium">
                    Your current plan
                  </div>
                ) : (
                  <div className="w-full text-center py-2.5 rounded-xl bg-muted/30 text-sm text-muted-foreground border border-border/40">
                    Downgrade to Free
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Pro ── */}
          <div className={`relative flex flex-col rounded-2xl overflow-hidden ${
            currentPlan === "pro"
              ? "border-violet-500/60 ring-2 ring-violet-500/20"
              : "border-violet-400/30 ring-2 ring-violet-500/10"
            } border`}
            style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card)) 100%)" }}
          >
            {/* Popular ribbon */}
            <div className="bg-violet-600 text-white text-center text-xs font-bold py-1.5 tracking-wide">
              ⭐ MOST POPULAR
            </div>

            <div className="p-6 flex flex-col gap-4 flex-1">
              {/* Plan name */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </span>
                  <span className="font-bold text-lg">Pro</span>
                </div>
                {currentPlan === "pro" && (
                  <Badge className="bg-violet-600 text-white border-0 text-[11px]">
                    <Crown className="w-3 h-3 mr-1" /> Active
                  </Badge>
                )}
              </div>

              {/* Price */}
              <div>
                {native ? (
                  rc.isLoadingOfferings ? (
                    <div className="h-10 bg-muted/40 animate-pulse rounded-lg" />
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black">{nativePrice ?? "—"}</span>
                      <span className="text-muted-foreground text-sm pb-1">/ month</span>
                    </div>
                  )
                ) : billingCycle === "monthly" ? (
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-violet-600 dark:text-violet-400">{proMonthlyPrice}</span>
                      <span className="text-muted-foreground text-sm pb-1">/ month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">billed monthly</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-violet-600 dark:text-violet-400">{proAnnualPrice}</span>
                      <span className="text-muted-foreground text-sm pb-1">/ year</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      {proMonthlyEq} · Save ₱1,000/yr
                    </p>
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="pt-2 space-y-2">
                {native ? (
                  <>
                    {currentPlan === "pro" ? (
                      <div className="w-full text-center py-2.5 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-sm font-semibold">
                        <Crown className="w-3.5 h-3.5 inline mr-1.5" />Active Plan
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 rounded-xl"
                        onClick={handleNativePurchase}
                        disabled={rc.isPurchasing || rc.isLoadingOfferings || !rc.monthlyPackage}
                        data-testid="button-native-upgrade-pro"
                      >
                        {rc.isPurchasing ? "Processing…" : rc.isLoadingOfferings ? "Loading…" : (
                          <><Crown className="w-4 h-4 mr-2" />Upgrade to Pro</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="w-full text-muted-foreground text-xs"
                      onClick={handleNativeRestore}
                      disabled={rc.isRestoring}
                      data-testid="button-native-restore"
                    >
                      {rc.isRestoring ? "Restoring…" : <><RefreshCw className="w-3 h-3 mr-1" />Restore purchase</>}
                    </Button>
                  </>
                ) : currentPlan === "pro" ? (
                  <>
                    <div className="w-full text-center py-2.5 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-sm font-semibold">
                      <Crown className="w-3.5 h-3.5 inline mr-1.5" />Current Plan
                    </div>
                    <Button
                      variant="outline" size="sm"
                      className="w-full text-xs"
                      onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-renew-pro"
                    >
                      {checkoutMutation.isPending ? "Redirecting…" : `Switch to ${billingCycle === "monthly" ? "Monthly" : "Annual"}`}
                    </Button>
                  </>
                ) : (
                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold h-11 rounded-xl"
                    onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-pro"
                  >
                    {checkoutMutation.isPending ? "Redirecting…" : (
                      <><Crown className="w-4 h-4 mr-2" />Get Pro — {billingCycle === "monthly" ? `${proMonthlyPrice}/mo` : `${proAnnualPrice}/yr`}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* ── Business ── */}
          <div className={`relative flex flex-col rounded-2xl border overflow-hidden ${
            currentPlan === "business"
              ? "border-amber-500/60 ring-2 ring-amber-500/20"
              : "border-amber-400/20 ring-1 ring-amber-500/10"
          }`}>
            {/* Scale ribbon */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-center text-xs font-bold py-1.5 tracking-wide">
              🏢 BEST FOR SCALE
            </div>

            <div className="p-6 flex flex-col gap-4 flex-1">
              {/* Plan name */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </span>
                  <span className="font-bold text-lg">Business</span>
                </div>
                {currentPlan === "business" && (
                  <Badge className="bg-amber-500 text-white border-0 text-[11px]">
                    <Building2 className="w-3 h-3 mr-1" /> Active
                  </Badge>
                )}
              </div>

              {/* Price */}
              <div>
                {billingCycle === "monthly" ? (
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-amber-600 dark:text-amber-400">{bizMonthlyPrice}</span>
                      <span className="text-muted-foreground text-sm pb-1">/ month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">billed monthly</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-amber-600 dark:text-amber-400">{bizAnnualPrice}</span>
                      <span className="text-muted-foreground text-sm pb-1">/ year</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                      {bizMonthlyEq} · Save ₱2,000/yr
                    </p>
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <div className="pt-2 space-y-2">
                {!native && currentPlan === "business" ? (
                  <>
                    <div className="w-full text-center py-2.5 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-semibold">
                      <Building2 className="w-3.5 h-3.5 inline mr-1.5" />Current Plan
                    </div>
                    <Button
                      variant="outline" size="sm"
                      className="w-full text-xs"
                      onClick={() => checkoutMutation.mutate({ plan: "business", cycle: billingCycle })}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-renew-business"
                    >
                      {checkoutMutation.isPending ? "Redirecting…" : `Switch to ${billingCycle === "monthly" ? "Monthly" : "Annual"}`}
                    </Button>
                  </>
                ) : !native ? (
                  <Button
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold h-11 rounded-xl border-0"
                    onClick={() => checkoutMutation.mutate({ plan: "business", cycle: billingCycle })}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-business"
                  >
                    {checkoutMutation.isPending ? "Redirecting…" : (
                      <><Building2 className="w-4 h-4 mr-2" />Get Business — {billingCycle === "monthly" ? `${bizMonthlyPrice}/mo` : `${bizAnnualPrice}/yr`}</>
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center pt-1">Available on web only</p>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Feature comparison table */}
      {isOwner && (
        <div className="rounded-2xl border border-border/60 overflow-hidden">
          <div className="bg-muted/30 px-6 py-4 border-b border-border/60">
            <h2 className="font-bold text-base">Feature comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground w-1/2">Feature</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground w-[16%]">
                    <div className="flex flex-col items-center gap-0.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Free</span>
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-violet-600 dark:text-violet-400 w-[17%] bg-violet-50/50 dark:bg-violet-950/20">
                    <div className="flex flex-col items-center gap-0.5">
                      <Crown className="w-3.5 h-3.5" />
                      <span>Pro</span>
                    </div>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-amber-600 dark:text-amber-400 w-[17%]">
                    <div className="flex flex-col items-center gap-0.5">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Business</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <tr
                      key={row.label}
                      className={`border-b border-border/30 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5 text-muted-foreground">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ComparisonCell value={row.free} accent="gray" />
                      </td>
                      <td className="px-4 py-3 text-center bg-violet-50/30 dark:bg-violet-950/10">
                        <ComparisonCell value={row.pro} accent="violet" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ComparisonCell value={row.business} accent="amber" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Non-owner notice */}
      {!isOwner && (
        <div className="rounded-2xl border border-border/60 bg-muted/30 px-6 py-8 text-center space-y-1.5">
          <Lock className="w-6 h-6 text-muted-foreground mx-auto" />
          <p className="font-semibold">Owner access required</p>
          <p className="text-sm text-muted-foreground">Only account owners can manage subscriptions.</p>
        </div>
      )}

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="rounded-2xl border border-border/60 overflow-hidden">
          <div className="bg-muted/30 px-6 py-4 border-b border-border/60">
            <h2 className="font-bold text-base">Payment history</h2>
          </div>
          <div className="divide-y divide-border/40">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-6 py-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                    p.plan === "business" ? "bg-amber-500/10 text-amber-600" : "bg-violet-500/10 text-violet-600"
                  }`}>
                    {p.plan === "business" ? <Building2 className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium capitalize">{p.plan} — {p.billingCycle}</p>
                    <p className="text-xs text-muted-foreground">{p.status === "paid" ? `Paid ${formatDate(p.paidAt)}` : "Pending"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatAmount(p.amount)}</p>
                  <Badge
                    className={`text-[10px] px-2 py-0 border-0 ${
                      p.status === "paid"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {p.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
