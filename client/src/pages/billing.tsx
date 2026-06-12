import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  useSubscription,
  PRO_FEATURES,
  BUSINESS_FEATURES,
  FREE_LIMITS,
  type BillingCycle,
} from "@/hooks/use-subscription";
import { useRevenueCat, isNative } from "@/lib/revenuecat";
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { getPricingByCurrency, formatPrice } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  Zap,
  Building2,
  CreditCard,
  Calendar,
  Lock,
  RefreshCw,
  Bot,
  FileText,
  Users,
  Package,
  BarChart3,
  Briefcase,
  Star,
} from "lucide-react";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const COMPARISON_ROWS: {
  label: string;
  icon: React.ElementType;
  free: string | boolean;
  pro: string | boolean;
  business: string | boolean;
}[] = [
  { label: "Branches", icon: Building2, free: "1", pro: "1", business: "Up to 10" },
  { label: "Products", icon: Package, free: "Up to 100", pro: "Unlimited", business: "Unlimited" },
  { label: "Staff accounts", icon: Users, free: "2", pro: "Up to 15", business: "Unlimited" },
  {
    label: "Analytics history",
    icon: BarChart3,
    free: "7 days",
    pro: "Unlimited",
    business: "Unlimited",
  },
  { label: "Customer loyalty", icon: Star, free: false, pro: true, business: true },
  { label: "Appointments", icon: Calendar, free: false, pro: true, business: true },
  { label: "Suppliers & POs", icon: Briefcase, free: false, pro: true, business: true },
  {
    label: "Payroll",
    icon: CreditCard,
    free: false,
    pro: "Basic",
    business: "Advanced (SSS/PhilHealth/Pag-IBIG)",
  },
  { label: "AI business assistant", icon: Bot, free: false, pro: false, business: true },
  { label: "BIR compliance", icon: FileText, free: false, pro: false, business: true },
  { label: "Multi-branch reports", icon: BarChart3, free: false, pro: false, business: true },
  { label: "Audit log", icon: FileText, free: false, pro: true, business: true },
  { label: "Priority support", icon: Users, free: false, pro: false, business: true },
];

function ComparisonCell({
  value,
  accent,
}: {
  value: string | boolean;
  accent: "gray" | "primary" | "amber";
}) {
  if (value === false) return <X className="w-3.5 h-3.5 text-muted-foreground/30 mx-auto" />;
  if (value === true) {
    if (accent === "primary") return <Check className="w-3.5 h-3.5 text-primary mx-auto" />;
    if (accent === "amber") return <Check className="w-3.5 h-3.5 text-amber-500 mx-auto" />;
    return <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" />;
  }
  if (accent === "primary")
    return <span className="text-xs font-medium text-primary">{value}</span>;
  if (accent === "amber")
    return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{value}</span>;
  return <span className="text-xs font-medium text-foreground">{value}</span>;
}

export default function BillingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    subscription,
    plan: currentPlan,
    isPro,
    isBusiness,
    isLoading,
    refetch,
  } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [verifying, setVerifying] = useState(false);

  const native = isNative();
  const rc = useRevenueCat(user?.tenantId ?? undefined);

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
            toast({
              title: `${planName} activated`,
              description: `Welcome to ArtixPOS ${planName}.`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
          } else {
            toast({
              title: "Payment pending",
              description: "Your payment is being processed. Check back shortly.",
              variant: "destructive",
            });
          }
        })
        .catch(() =>
          toast({
            title: "Verification failed",
            description: "Please contact support if you were charged.",
            variant: "destructive",
          }),
        )
        .finally(() => {
          setVerifying(false);
          navigate("/billing", { replace: true });
        });
    } else if (status === "cancel") {
      navigate("/billing", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkoutMutation = useMutation({
    mutationFn: ({ plan, cycle }: { plan: "pro" | "business"; cycle: BillingCycle }) =>
      apiRequest("POST", "/api/subscription/checkout", { plan, billingCycle: cycle }).then((r) =>
        r.json(),
      ),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          title: "Error",
          description: data.message ?? "Failed to create checkout",
          variant: "destructive",
        });
      }
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Could not start checkout. Please try again.",
        variant: "destructive",
      }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/subscription/reactivate", {}).then((r) => r.json()),
    onSuccess: () => {
      toast({
        title: "Subscription reactivated",
        description: "Your plan will continue past the current period.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Could not reactivate. Please try again.",
        variant: "destructive",
      }),
  });

  const handleNativePurchase = async () => {
    if (!rc.monthlyPackage) {
      toast({
        title: "Store unavailable",
        description: "Could not load products from the App Store. Please try again.",
        variant: "destructive",
      });
      return;
    }
    try {
      await rc.purchase(rc.monthlyPackage);
      toast({ title: "Purchase successful", description: "Welcome to ArtixPOS Pro." });
      refetch();
    } catch (e: any) {
      if (e?.userCancelled || e?.code === "1") return;
      toast({
        title: "Purchase failed",
        description: e?.message ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleNativeRestore = async () => {
    try {
      await rc.restore();
      toast({
        title: "Purchases restored",
        description: "Your previous purchases have been restored.",
      });
      refetch();
    } catch (e: any) {
      toast({
        title: "Restore failed",
        description: e?.message ?? "Could not restore purchases. Please try again.",
        variant: "destructive",
      });
    }
  };

  // ── Dynamic country-pricing from settings currency ───────────────────────
  const { data: settingsData } = useSettings();
  const settingsCurrency = (settingsData as any)?.currency;
  const pricing = getPricingByCurrency(settingsCurrency);
  const sym = pricing.symbol;
  const proMonthlyPrice = formatPrice(pricing.proMonthly, sym);
  const proAnnualPrice = formatPrice(pricing.proAnnual, sym);
  const proMonthlyEq = `${sym}${pricing.proMonthlyEq}/mo`;
  const bizMonthlyPrice = formatPrice(pricing.businessMonthly, sym);
  const bizAnnualPrice = formatPrice(pricing.businessAnnual, sym);
  const bizMonthlyEq = `${sym}${pricing.businessMonthlyEq}/mo`;
  const proSavingsText = pricing.proSavingsText;
  const bizSavingsText = pricing.businessSavingsText;

  const isOwner = user?.role === "owner";
  if (isLoading || verifying) return null;

  const urlReason = new URLSearchParams(window.location.search).get("reason");
  const showProRequiredBanner = urlReason === "pro_required" && !isPro;
  const showBusinessRequiredBanner = urlReason === "business_required" && !isBusiness;
  const nativePrice = rc.monthlyPackage?.product?.priceString ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Pro-required banner */}
      {showProRequiredBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-4">
          <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Pro plan required</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The page you tried to access requires a Pro or Business plan. Upgrade below to unlock it.
            </p>
          </div>
        </div>
      )}
      {/* Business-required banner */}
      {showBusinessRequiredBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-400/30 bg-violet-500/5 px-4 py-4">
          <Lock className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Business Suite required</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The Audit Log is a Business Suite feature. Upgrade to Business to get full activity history, staff restore, and more.
            </p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="space-y-1.5 pt-1">
        <h1 className="text-2xl font-bold tracking-tight">Plans & billing</h1>
        <p className="text-sm text-muted-foreground">
          Start free. Upgrade when your business grows. No hidden fees, cancel anytime.
        </p>
      </div>

      {/* Current plan status */}
      {isPro && (
        <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-3">
            {isBusiness ? (
              <Building2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Zap className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium text-sm">
                {isBusiness ? "Business" : "Pro"} —{" "}
                {(subscription.billingCycle ?? "monthly") === "monthly" ? "Monthly" : "Annual"}{" "}
                billing
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
              className="text-xs h-8"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
              data-testid="button-reactivate"
            >
              {reactivateMutation.isPending ? "Reactivating…" : "Reactivate"}
            </Button>
          )}
        </div>
      )}

      {/* Billing cycle toggle */}
      {isOwner && !native && (
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/30 w-fit">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              billingCycle === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-billing-monthly"
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("annual")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              billingCycle === "annual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="button-billing-annual"
          >
            Annual
            <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              –17%
            </span>
          </button>
        </div>
      )}

      {/* Pricing cards */}
      {isOwner && (
        <div className="grid gap-3 md:grid-cols-3 items-stretch">
          {/* Free */}
          <div
            className={`relative flex flex-col rounded-xl border bg-card overflow-hidden ${
              currentPlan === "free"
                ? "border-border ring-1 ring-foreground/10"
                : "border-border/60"
            }`}
          >
            <div className="p-5 flex flex-col gap-5 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Free</span>
                {currentPlan === "free" && (
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    Current
                  </Badge>
                )}
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{sym}0</span>
                  <span className="text-muted-foreground text-sm">/ month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Free forever</p>
              </div>

              <ul className="space-y-2 flex-1">
                {[
                  `${FREE_LIMITS.branches} branch`,
                  `Up to ${FREE_LIMITS.products} products`,
                  `Up to ${FREE_LIMITS.staff} staff accounts`,
                  "Core POS features",
                  "Cash payments",
                  "7-day analytics",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {currentPlan === "free" && (
                <div className="w-full text-center py-2 rounded-lg bg-muted/60 text-xs text-muted-foreground font-medium">
                  Current plan
                </div>
              )}
            </div>
          </div>

          {/* Pro */}
          <div
            className={`relative flex flex-col rounded-xl border overflow-hidden ${
              currentPlan === "pro"
                ? "border-primary/40 ring-1 ring-primary/20"
                : "border-primary/25"
            }`}
          >
            <div className="h-0.5 bg-primary w-full" />
            <div className="p-5 flex flex-col gap-5 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Pro</span>
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    Popular
                  </span>
                </div>
                {currentPlan === "pro" && (
                  <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-medium">
                    Active
                  </Badge>
                )}
              </div>

              <div>
                {native ? (
                  rc.isLoadingOfferings ? (
                    <div className="h-9 bg-muted/40 animate-pulse rounded-lg" />
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-primary">{nativePrice ?? "—"}</span>
                      <span className="text-muted-foreground text-sm">/ month</span>
                    </div>
                  )
                ) : billingCycle === "monthly" ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-primary">{proMonthlyPrice}</span>
                      <span className="text-muted-foreground text-sm">/ month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">billed monthly</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-primary">{proAnnualPrice}</span>
                      <span className="text-muted-foreground text-sm">/ year</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                      {proMonthlyEq} · {proSavingsText}
                    </p>
                  </div>
                )}
              </div>

              <ul className="space-y-2 flex-1">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                {native ? (
                  <>
                    {currentPlan === "pro" ? (
                      <div className="w-full text-center py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                        Active plan
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-9 rounded-lg text-sm"
                        onClick={handleNativePurchase}
                        disabled={rc.isPurchasing || rc.isLoadingOfferings || !rc.monthlyPackage}
                        data-testid="button-native-upgrade-pro"
                      >
                        {rc.isPurchasing
                          ? "Processing…"
                          : rc.isLoadingOfferings
                            ? "Loading…"
                            : "Upgrade to Pro"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground text-xs"
                      onClick={handleNativeRestore}
                      disabled={rc.isRestoring}
                      data-testid="button-native-restore"
                    >
                      {rc.isRestoring ? (
                        "Restoring…"
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Restore purchase
                        </>
                      )}
                    </Button>
                  </>
                ) : currentPlan === "pro" ? (
                  <>
                    <div className="w-full text-center py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                      Current plan
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8"
                      onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-renew-pro"
                    >
                      {checkoutMutation.isPending
                        ? "Redirecting…"
                        : `Switch to ${billingCycle === "monthly" ? "monthly" : "annual"}`}
                    </Button>
                  </>
                ) : (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-9 rounded-lg text-sm"
                    onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-pro"
                  >
                    {checkoutMutation.isPending
                      ? "Redirecting…"
                      : `Get Pro — ${billingCycle === "monthly" ? `${proMonthlyPrice}/mo` : `${proAnnualPrice}/yr`}`}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Business */}
          <div
            className={`relative flex flex-col rounded-xl border overflow-hidden ${
              currentPlan === "business"
                ? "border-amber-400/60 ring-1 ring-amber-500/20"
                : "border-amber-300/30"
            }`}
          >
            <div className="h-0.5 bg-amber-500 w-full" />
            <div className="p-5 flex flex-col gap-5 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Business</span>
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                    Scale
                  </span>
                </div>
                {currentPlan === "business" && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0 text-[10px] font-medium">
                    Active
                  </Badge>
                )}
              </div>

              <div>
                {billingCycle === "monthly" ? (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                        {bizMonthlyPrice}
                      </span>
                      <span className="text-muted-foreground text-sm">/ month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">billed monthly</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                        {bizAnnualPrice}
                      </span>
                      <span className="text-muted-foreground text-sm">/ year</span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                      {bizMonthlyEq} · {bizSavingsText}
                    </p>
                  </div>
                )}
              </div>

              <ul className="space-y-2 flex-1">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                {!native && currentPlan === "business" ? (
                  <>
                    <div className="w-full text-center py-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-medium">
                      Current plan
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs h-8"
                      onClick={() =>
                        checkoutMutation.mutate({ plan: "business", cycle: billingCycle })
                      }
                      disabled={checkoutMutation.isPending}
                      data-testid="button-renew-business"
                    >
                      {checkoutMutation.isPending
                        ? "Redirecting…"
                        : `Switch to ${billingCycle === "monthly" ? "monthly" : "annual"}`}
                    </Button>
                  </>
                ) : !native ? (
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold h-9 rounded-lg text-sm border-0"
                    onClick={() =>
                      checkoutMutation.mutate({ plan: "business", cycle: billingCycle })
                    }
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-business"
                  >
                    {checkoutMutation.isPending
                      ? "Redirecting…"
                      : `Get Business — ${billingCycle === "monthly" ? `${bizMonthlyPrice}/mo` : `${bizAnnualPrice}/yr`}`}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Available on web only
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature comparison table */}
      {isOwner && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/60">
            <h2 className="font-semibold text-sm">Feature comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground w-1/2">
                    Feature
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-[16%]">
                    Free
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-primary w-[17%] bg-primary/5">
                    Pro
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-amber-600 dark:text-amber-400 w-[17%]">
                    Business
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <tr
                      key={row.label}
                      className={`border-b border-border/30 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ComparisonCell value={row.free} accent="gray" />
                      </td>
                      <td className="px-4 py-3 text-center bg-primary/5">
                        <ComparisonCell value={row.pro} accent="primary" />
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
        <div className="rounded-xl border border-border/60 bg-muted/20 px-6 py-8 text-center space-y-1.5">
          <Lock className="w-5 h-5 text-muted-foreground mx-auto" />
          <p className="font-medium text-sm">Owner access required</p>
          <p className="text-xs text-muted-foreground">
            Only account owners can manage subscriptions.
          </p>
        </div>
      )}
    </div>
  );
}
