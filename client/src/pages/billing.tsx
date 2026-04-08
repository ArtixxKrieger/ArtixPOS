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
import { Check, Crown, Zap, X, Loader2, CreditCard, Calendar, AlertTriangle } from "lucide-react";

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Billing & Subscription</h1>
        <p className="text-slate-500 dark:text-white/50 mt-1">Manage your ArtixPOS plan and payment history.</p>
      </div>

      {/* Current Plan Status */}
      <Card className="border border-slate-200 dark:border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            {isPro ? (
              <Badge className="bg-violet-600 text-white gap-1.5">
                <Crown className="w-3.5 h-3.5" /> Pro
              </Badge>
            ) : (
              <Badge variant="secondary">Free</Badge>
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
                      variant="link"
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
              You're on the <strong>Free plan</strong> — limited to {FREE_LIMITS.branches} branch, {FREE_LIMITS.products} products, and {FREE_LIMITS.staff} staff accounts. Upgrade to unlock everything.
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
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 p-1 bg-slate-50 dark:bg-white/5">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                billingCycle === "monthly"
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70"
              }`}
              data-testid="button-billing-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                billingCycle === "annual"
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/70"
              }`}
              data-testid="button-billing-annual"
            >
              Annual
            </button>
          </div>

          {/* Plan cards */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Free Card */}
            <Card className={`border-2 ${!isPro ? "border-violet-600" : "border-slate-200 dark:border-white/10"}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-slate-400" />
                  Free
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">₱0</span>
                  <span className="text-slate-400 ml-1">/ month</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  {[
                    `${FREE_LIMITS.branches} branch`,
                    `Up to ${FREE_LIMITS.products} products`,
                    `Up to ${FREE_LIMITS.staff} staff accounts`,
                    "Basic POS & sales",
                    "Today's summary report",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-slate-600 dark:text-white/70">
                      <Check className="w-4 h-4 text-slate-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                  {[
                    "AI assistant",
                    "Full analytics",
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
                {!isPro && (
                  <div className="pt-2">
                    <Badge variant="secondary" className="w-full justify-center py-1.5">Current Plan</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pro Card */}
            <Card className={`border-2 relative overflow-hidden ${isPro ? "border-violet-600" : "border-slate-200 dark:border-white/10"}`}>
              <div className="absolute top-3 right-3">
                <Badge className="bg-violet-600 text-white gap-1">
                  <Crown className="w-3 h-3" /> Pro
                </Badge>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-violet-600" />
                  Pro
                </CardTitle>
                <CardDescription>
                  {billingCycle === "monthly" ? (
                    <>
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">₱30</span>
                      <span className="text-slate-400 ml-1">/ month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">₱4,999</span>
                      <span className="text-slate-400 ml-1">/ year</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-slate-600 dark:text-white/70">
                    <Check className="w-4 h-4 text-violet-500 shrink-0" />
                    <span className="font-medium">Everything in Free, plus:</span>
                  </li>
                  {PRO_FEATURES.slice(0, 8).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-slate-600 dark:text-white/70">
                      <Check className="w-4 h-4 text-violet-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-slate-500 dark:text-white/40 text-xs">
                    <Check className="w-3 h-3 text-violet-400 shrink-0" />
                    +{PRO_FEATURES.length - 8} more features
                  </li>
                </ul>

                <div className="pt-2">
                  {isPro ? (
                    <Button
                      className="w-full bg-violet-600 hover:bg-violet-700"
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
                      className="w-full bg-violet-600 hover:bg-violet-700"
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
                  <p className="text-xs text-center text-slate-400 mt-2">
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
