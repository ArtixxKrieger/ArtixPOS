import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export type SubscriptionPlan = "free" | "pro" | "business";
export type BillingCycle = "monthly" | "annual";

export interface TenantSubscription {
  id?: number;
  tenantId?: string;
  plan: SubscriptionPlan;
  billingCycle?: BillingCycle | null;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export const FREE_LIMITS = {
  branches: 1,
  products: 100,
  staff: 2,
};


export const PRO_FEATURES = [
  "1 branch — all modules fully unlocked",
  "Unlimited products & inventory",
  "Up to 15 staff accounts",
  "Full analytics & reports (unlimited history)",
  "Customer loyalty & memberships",
  "Expense tracking",
  "Suppliers & purchase orders",
  "Appointments & scheduling",
  "Shift management & cash drawer",
  "Basic payroll",
  "WiFi voucher management",
  "Branded digital receipts",
  "Audit log",
];

export const BUSINESS_FEATURES = [
  "Everything in Pro",
  "Up to 10 branches",
  "Unlimited staff accounts",
  "AI business assistant",
  "BIR compliance — Official Receipts, Z/X-reading, VAT/Non-VAT",
  "Advanced payroll (SSS, PhilHealth, Pag-IBIG, payslips)",
  "Multi-branch consolidated reports",
  "Branch manager role hierarchy",
  "Priority support",
  "Bulk data export (CSV & PDF)",
];

export function useSubscription() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery<TenantSubscription>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
    // Subscription changes only on billing mutations — all of which already call
    // queryClient.invalidateQueries(["/api/subscription"]) explicitly.
    // staleTime: Infinity prevents pointless background refetches that would fire
    // every 5 minutes and are never acted on by any component.
    staleTime: Infinity,
  });

  const plan: SubscriptionPlan = data?.plan ?? "free";
  const isActive = data?.status === "active";
  const isPro = (plan === "pro" || plan === "business") && isActive;
  const isBusiness = plan === "business" && isActive;
  const isFree = !isPro;

  return {
    subscription: data ?? { plan: "free" as SubscriptionPlan, status: "active" },
    plan,
    isPro,
    isBusiness,
    isFree,
    isLoading,
    refetch,
  };
}
