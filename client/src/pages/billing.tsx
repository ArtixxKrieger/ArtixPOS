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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check, Crown, Zap, Building2, CreditCard, Calendar, AlertTriangle, Lock, RefreshCw, Smartphone } from "lucide-react";

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

const PLAN_CONFIG: Record<string, { label: string; icon: React.ElementType; badge: string; badgeCls: string }> = {
  free:     { label: "Free",     icon: Zap,       badge: "Free",     badgeCls: "bg-muted text-muted-foreground" },
  pro:      { label: "Pro",      icon: Crown,     badge: "Pro",      badgeCls: "bg-violet-600 text-white" },
  business: { label: "Business", icon: Building2, badge: "Business", badgeCls: "bg-amber-500 text-white" },
};

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

  const planCfg = PLAN_CONFIG[currentPlan] ?? PLAN_CONFIG.free;
  const PlanIcon = planCfg.icon;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {showProRequiredBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 px-4 py-4">
          <Lock className="h-5 w-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-violet-900 dark:text-violet-200">Pro Feature</p>
            <p className="text-sm text-violet-700 dark:text-violet-300 mt-0.5">
              The page you tried to access requires a paid plan. Upgrade below to unlock it.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your ArtixPOS plan and payment history.</p>
      </div>

      {/* Current Plan Card */}
      <Card className="border border-border/60 bg-card shadow-sm overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <PlanIcon className="w-4 h-4" />
              </span>
              Current Plan
            </CardTitle>
            <Badge className={planCfg.badgeCls}>
              <PlanIcon className="w-3 h-3 mr-1" />
              {planCfg.badge}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPro ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {subscription.cancelAtPeriodEnd
                    ? `Access until ${formatDate(subscription.currentPeriodEnd)} (cancels then)`
                    : `Renews on ${formatDate(subscription.currentPeriodEnd)}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span className="capitalize">{subscription.billingCycle} billing</span>
              </div>

              {subscription.cancelAtPeriodEnd && (
                <div className="flex items-start gap-3 mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    Your plan is set to cancel. You'll lose access after {formatDate(subscription.currentPeriodEnd)}.
                    {!native && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-amber-700 dark:text-amber-400 p-0 h-auto ml-1 underline"
                        onClick={() => reactivateMutation.mutate()}
                        disabled={reactivateMutation.isPending}
                        data-testid="button-reactivate"
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {native && isOwner && (
                <p className="text-xs text-muted-foreground mt-1">
                  To manage your subscription, go to your device's App Store / Play Store subscription settings.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You're on the <strong>Free plan</strong> — {FREE_LIMITS.branches} branch, up to {FREE_LIMITS.products} products, and {FREE_LIMITS.staff} staff accounts. Upgrade to Pro or Business when you need more.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Section */}
      {isOwner && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Choose a Plan</h2>
              <p className="text-sm text-muted-foreground">Start free, upgrade when you need more power or compliance.</p>
            </div>

            {!native && (
              <div className="inline-flex rounded-xl border border-border p-1 bg-muted/40 w-fit">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    billingCycle === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-billing-monthly"
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    billingCycle === "annual" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-billing-annual"
                >
                  Annual
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-0 text-[10px] px-1.5 py-0">Save 17%</Badge>
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">

            {/* ── Free Card ── */}
            <Card className={`overflow-hidden bg-card ${currentPlan === "free" ? "border-primary/50 ring-1 ring-primary/20" : "border-border/60"}`}>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                  </span>
                  Free
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-black text-foreground">₱0</span>
                  <span className="text-muted-foreground ml-1 text-sm">/ month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {[
                    `${FREE_LIMITS.branches} branch`,
                    `Up to ${FREE_LIMITS.products} products`,
                    `Up to ${FREE_LIMITS.staff} staff accounts`,
                    "Cash payments only",
                    "Basic analytics (last 7 days)",
                    "Core POS features",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {currentPlan === "free" && (
                  <div className="pt-2">
                    <Badge className="w-full justify-center py-1.5 bg-muted text-muted-foreground border-0">Current Plan</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Pro Card ── */}
            <Card className={`relative overflow-hidden bg-card ${currentPlan === "pro" ? "border-violet-500/60 ring-1 ring-violet-500/20" : "border-border/60"}`}>
              <div className="absolute top-3 right-3 z-10">
                <Badge className="bg-violet-600 text-white gap-1 text-[11px]">
                  <Crown className="w-3 h-3" /> Pro
                </Badge>
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </span>
                  Pro
                </CardTitle>
                <CardDescription>
                  {native ? (
                    rc.isLoadingOfferings ? null : nativePrice ? (
                      <>
                        <span className="text-2xl font-black text-foreground">{nativePrice}</span>
                        <span className="text-muted-foreground ml-1 text-sm">/ month</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">Price unavailable</span>
                    )
                  ) : billingCycle === "monthly" ? (
                    <>
                      <span className="text-2xl font-black text-foreground">₱499</span>
                      <span className="text-muted-foreground ml-1 text-sm">/ month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-black text-foreground">₱4,999</span>
                      <span className="text-muted-foreground ml-1 text-sm">/ year</span>
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">₱416/mo</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  {native ? (
                    <>
                      {currentPlan === "pro" ? (
                        <Badge className="w-full justify-center py-2 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0">
                          <Crown className="w-3.5 h-3.5 mr-1.5" /> Active subscription
                        </Badge>
                      ) : (
                        <Button
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold"
                          onClick={handleNativePurchase}
                          disabled={rc.isPurchasing || rc.isLoadingOfferings || !rc.monthlyPackage}
                          data-testid="button-native-upgrade-pro"
                        >
                          {rc.isPurchasing ? "Processing…" : rc.isLoadingOfferings ? "Loading…" : (
                            <><Crown className="w-4 h-4 mr-2" />Subscribe{nativePrice ? ` — ${nativePrice}/mo` : " to Pro"}</>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-muted-foreground text-xs mt-1"
                        onClick={handleNativeRestore}
                        disabled={rc.isRestoring}
                        data-testid="button-native-restore"
                      >
                        {rc.isRestoring ? "Restoring…" : <><RefreshCw className="w-3 h-3 mr-1" /> Restore previous purchase</>}
                      </Button>
                    </>
                  ) : currentPlan === "pro" ? (
                    <>
                      <Badge className="w-full justify-center py-2 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0">
                        <Crown className="w-3.5 h-3.5 mr-1.5" /> Current Plan
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                        disabled={checkoutMutation.isPending}
                        data-testid="button-renew-pro"
                      >
                        {checkoutMutation.isPending ? "Redirecting…" : `Switch to ${billingCycle === "monthly" ? "Monthly" : "Annual"}`}
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold"
                      onClick={() => checkoutMutation.mutate({ plan: "pro", cycle: billingCycle })}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-upgrade-pro"
                    >
                      {checkoutMutation.isPending ? "Redirecting…" : (
                        <><Crown className="w-4 h-4 mr-2" />Get Pro — {billingCycle === "monthly" ? "₱499/mo" : "₱4,999/yr"}</>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Business Card ── */}
            <Card className={`relative overflow-hidden bg-card ${currentPlan === "business" ? "border-amber-500/60 ring-1 ring-amber-500/20" : "border-border/60"}`}>
              <div className="absolute top-3 right-3 z-10">
                <Badge className="bg-amber-500 text-white gap-1 text-[11px]">
                  <Building2 className="w-3 h-3" /> Business
                </Badge>
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </span>
                  Business
                </CardTitle>
                <CardDescription>
                  {billingCycle === "monthly" ? (
                    <>
                      <span className="text-2xl font-black text-foreground">₱999</span>
                      <span className="text-muted-foreground ml-1 text-sm">/ month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-black text-foreground">₱9,999</span>
                      <span className="text-muted-foreground ml-1 text-sm">/ year</span>
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">₱833/mo</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {BUSINESS_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  {!native && currentPlan === "business" ? (
                    <>
                      <Badge className="w-full justify-center py-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                        <Building2 className="w-3.5 h-3.5 mr-1.5" /> Current Plan
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs"
                        onClick={() => checkoutMutation.mutate({ plan: "business", cycle: billingCycle })}
                        disabled={checkoutMutation.isPending}
                        data-testid="button-renew-business"
                      >
                        {checkoutMutation.isPending ? "Redirecting…" : `Switch to ${billingCycle === "monthly" ? "Monthly" : "Annual"}`}
                      </Button>
                    </>
                  ) : !native ? (
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                      onClick={() => checkoutMutation.mutate({ plan: "business", cycle: billingCycle })}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-upgrade-business"
                    >
                      {checkoutMutation.isPending ? "Redirecting…" : (
                        <><Building2 className="w-4 h-4 mr-2" />Get Business — {billingCycle === "monthly" ? "₱999/mo" : "₱9,999/yr"}</>
                      )}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center pt-1">Available on web only</p>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          {!native && (
            <p className="text-xs text-center text-muted-foreground">
              Secure payment via card or e-wallet · Cancel anytime from your store's billing settings
            </p>
          )}

          {native && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Payments are processed securely by Apple / Google</span>
            </div>
          )}
        </div>
      )}

      {/* Payment History — web only */}
      {!native && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Payment History</h2>
          {paymentsLoading ? null : payments.length === 0 ? (
            <div
              className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground text-sm flex flex-col items-center gap-2"
              data-testid="empty-payment-history"
            >
              <CreditCard className="h-7 w-7 opacity-40" />
              <span>No payments yet — your billing history will appear here.</span>
            </div>
          ) : (
            <div className="border border-border/60 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cycle</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {payments.map((p) => (
                    <tr key={p.id} className="bg-card" data-testid={`row-payment-${p.id}`}>
                      <td className="px-4 py-3 text-foreground/70">{formatDate(p.paidAt ?? p.createdAt)}</td>
                      <td className="px-4 py-3 capitalize text-foreground/70">{p.plan}</td>
                      <td className="px-4 py-3 capitalize text-foreground/70">{p.billingCycle}</td>
                      <td className="px-4 py-3 text-right text-foreground/70">{formatAmount(p.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.status === "paid" ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">Paid</Badge>
                        ) : p.status === "pending" ? (
                          <Badge variant="secondary">Pending</Badge>
                        ) : (
                          <Badge variant="destructive">Failed</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
