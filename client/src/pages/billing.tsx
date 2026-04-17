import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSubscription, PRO_FEATURES, FREE_LIMITS, type BillingCycle, type TenantSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Crown, Zap, X, Loader2, CreditCard, Calendar, AlertTriangle, Lock } from "lucide-react";

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

export default function BillingPage() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscription, isPro, isLoading, refetch } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<SubscriptionPayment[]>({
    queryKey: ["/api/subscription/payments"],
    enabled: !!user,
  });

  // Handle return from PayMongo checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      setVerifying(true);
      apiRequest("POST", "/api/subscription/verify", {})
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            toast({ title: "Subscription activated!", description: "Welcome to ArtixPOS Pro. Enjoy all features!" });
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
    mutationFn: (cycle: BillingCycle) =>
      apiRequest("POST", "/api/subscription/checkout", { billingCycle: cycle }).then((r) => r.json()),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Error", description: data.message ?? "Failed to create checkout", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not start checkout. Please try again.", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/subscription/cancel", {}).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Subscription will cancel", description: "Your Pro access continues until the end of the billing period." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => toast({ title: "Error", description: "Could not cancel. Please try again.", variant: "destructive" }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/subscription/reactivate", {}).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Subscription reactivated!", description: "Your Pro plan will continue past the current period." });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
    },
    onError: () => toast({ title: "Error", description: "Could not reactivate. Please try again.", variant: "destructive" }),
  });

  const isOwner = user?.role === "owner";

  if (isLoading || verifying) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const showProRequiredBanner = new URLSearchParams(window.location.search).get("reason") === "pro_required" && !isPro;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Pro Required Banner */}
      {showProRequiredBanner && (
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30 px-4 py-4">
          <Lock className="h-5 w-5 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-violet-900 dark:text-violet-200">Pro Feature</p>
            <p className="text-sm text-violet-700 dark:text-violet-300 mt-0.5">
              The page you tried to access is only available on the Pro plan. Upgrade below to unlock all features.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Billing & Subscription</h1>
        <p className="text-slate-500 dark:text-white/50 mt-1">Manage your ArtixPOS plan and payment history.</p>
      </div>

      {/* Current Plan Status */}
      <Card className="border border-violet-200/70 dark:border-violet-500/20 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/60 dark:from-white/[0.08] dark:via-violet-950/30 dark:to-fuchsia-950/20 shadow-lg shadow-violet-500/5 overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="h-8 w-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/25">
                {isPro ? <Crown className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              </span>
              Current Plan
            </CardTitle>
            {isPro ? (
              <Badge className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white gap-1.5 shadow-sm">
                <Crown className="w-3.5 h-3.5" /> Pro
              </Badge>
            ) : (
              <Badge className="bg-white/80 text-violet-700 border border-violet-200 dark:bg-white/10 dark:text-violet-200 dark:border-white/10">Free</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPro ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/60">
                <Calendar className="w-4 h-4" />
                <span>
                  {subscription.cancelAtPeriodEnd
                    ? `Access until ${formatDate(subscription.currentPeriodEnd)} (cancels then)`
                    : `Renews on ${formatDate(subscription.currentPeriodEnd)}`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/60">
                <CreditCard className="w-4 h-4" />
                <span className="capitalize">{subscription.billingCycle} billing</span>
              </div>

              {subscription.cancelAtPeriodEnd ? (
                <div className="flex items-start gap-3 mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    Your plan is set to cancel. You'll lose Pro features after {formatDate(subscription.currentPeriodEnd)}.
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
                  </div>
                </div>
              ) : (
                isOwner && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                    onClick={() => setShowCancelDialog(true)}
                    data-testid="button-cancel-subscription"
                  >
                    Cancel Subscription
                  </Button>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-white/50">
              You're on the <strong>Free plan</strong> — {FREE_LIMITS.branches} branch, {FREE_LIMITS.products} products, {FREE_LIMITS.staff} staff accounts, and simple analytics are included. Upgrade when you need multiple locations, automation, and advanced reports.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Section — show for free users or pro users wanting to renew */}
      {isOwner && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isPro ? "Extend or Switch Billing Cycle" : "Upgrade to Pro"}
          </h2>

          {/* Billing cycle toggle */}
          <div className="inline-flex rounded-2xl border border-violet-200/70 dark:border-white/10 p-1 bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-white/10 dark:to-white/5 shadow-sm">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                billingCycle === "monthly"
                  ? "bg-white dark:bg-white/15 text-violet-700 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70"
              }`}
              data-testid="button-billing-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${
                billingCycle === "annual"
                  ? "bg-white dark:bg-white/15 text-violet-700 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70"
              }`}
              data-testid="button-billing-annual"
            >
              Annual
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-0 text-[10px] px-1.5 py-0">Save</Badge>
            </button>
          </div>

          {/* Plan cards */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Free Card */}
            <Card className={`border-2 overflow-hidden relative ${!isPro ? "border-violet-500 shadow-xl shadow-violet-500/10" : "border-slate-200 dark:border-white/10"} bg-gradient-to-br from-white via-slate-50 to-violet-50/60 dark:from-white/[0.07] dark:via-white/[0.04] dark:to-violet-950/20`}>
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-300 via-violet-400 to-slate-300" />
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-2xl bg-slate-100 dark:bg-white/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-slate-500 dark:text-white/70" />
                  </span>
                  Free
                </CardTitle>
                <CardDescription>
                  <span className="text-3xl font-black text-slate-900 dark:text-white">₱0</span>
                  <span className="text-slate-400 ml-1">/ month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl bg-white/70 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10 p-3 max-h-72 overflow-y-auto pr-2">
                  <ul className="space-y-2 text-sm">
                    {[
                      `${FREE_LIMITS.branches} branch`,
                      `Up to ${FREE_LIMITS.products} products`,
                      `Up to ${FREE_LIMITS.staff} staff accounts`,
                      "Basic POS & sales",
                      "Simple analytics dashboard",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-slate-600 dark:text-white/70">
                        <Check className="w-4 h-4 text-violet-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                    {[
                      "AI assistant",
                      "Analytics exports & custom ranges",
                      "Customer management",
                      "Expense tracking",
                      "Appointments",
                    ].map((f) => (
                      <li key={f} className="flex items-center gap-2 text-slate-400 line-through">
                        <X className="w-4 h-4 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                {!isPro && (
                  <div className="pt-2">
                    <Badge className="w-full justify-center py-1.5 bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70 border-0">Current Plan</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={`border-2 relative overflow-hidden ${isPro ? "border-violet-500" : "border-violet-300/80 dark:border-violet-500/30"} bg-gradient-to-br from-violet-600 via-fuchsia-600 to-indigo-700 text-white shadow-2xl shadow-violet-600/20`}>
              <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
              <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="absolute top-3 right-3 z-10">
                <Badge className="bg-white/20 text-white border border-white/30 gap-1 backdrop-blur">
                  <Crown className="w-3 h-3" /> Pro
                </Badge>
              </div>
              <CardHeader className="relative pb-4">
                <CardTitle className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center shadow-lg shadow-black/10">
                    <Crown className="w-5 h-5 text-white" />
                  </span>
                  Pro
                </CardTitle>
                <CardDescription className="text-white/80">
                  {billingCycle === "monthly" ? (
                    <>
                      <span className="text-3xl font-black text-white">₱30</span>
                      <span className="text-white/70 ml-1">/ month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-black text-white">₱4,999</span>
                      <span className="text-white/70 ml-1">/ year</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative space-y-3">
                <div className="rounded-2xl bg-white/12 border border-white/20 backdrop-blur p-3 max-h-72 overflow-y-auto pr-2">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-white">
                      <Check className="w-4 h-4 text-emerald-200 shrink-0" />
                      <span className="font-semibold">Everything in Free, plus:</span>
                    </li>
                    {PRO_FEATURES.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-white/90">
                        <Check className="w-4 h-4 text-emerald-200 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  {isPro ? (
                    <Button
                      className="w-full bg-white text-violet-700 hover:bg-white/90 shadow-lg shadow-black/10 font-bold"
                      onClick={() => checkoutMutation.mutate(billingCycle)}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-renew-pro"
                    >
                      {checkoutMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
                      ) : (
                        `Renew / Switch to ${billingCycle === "monthly" ? "Monthly" : "Annual"}`
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-white text-violet-700 hover:bg-white/90 shadow-lg shadow-black/10 font-bold"
                      onClick={() => checkoutMutation.mutate(billingCycle)}
                      disabled={checkoutMutation.isPending}
                      data-testid="button-upgrade-pro"
                    >
                      {checkoutMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
                      ) : (
                        <>
                          <Crown className="w-4 h-4 mr-2" />
                          Upgrade to Pro — {billingCycle === "monthly" ? "₱30/mo" : "₱4,999/yr"}
                        </>
                      )}
                    </Button>
                  )}
                  <p className="text-xs text-center text-white/65 mt-2">
                    Secure payment via GCash, Card, GrabPay, or Maya
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Payment History</h2>
        {paymentsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-white/30 text-sm">
            No payments yet
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-white/60">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-white/60">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-white/60">Cycle</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-white/60">Amount</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-white/60">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id} className="bg-white dark:bg-transparent" data-testid={`row-payment-${p.id}`}>
                    <td className="px-4 py-3 text-slate-700 dark:text-white/70">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="px-4 py-3 capitalize text-slate-700 dark:text-white/70">{p.plan}</td>
                    <td className="px-4 py-3 capitalize text-slate-700 dark:text-white/70">{p.billingCycle}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-white/70">{formatAmount(p.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "paid" ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Paid</Badge>
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

      {/* Cancel Confirm Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your Pro features will remain active until <strong>{formatDate(subscription.currentPeriodEnd)}</strong>. After that, your account will revert to the Free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-no">Keep Pro</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { cancelMutation.mutate(); setShowCancelDialog(false); }}
              data-testid="button-cancel-dialog-confirm"
            >
              Yes, Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
