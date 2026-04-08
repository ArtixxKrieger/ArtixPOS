import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

export type SubscriptionPlan = "free" | "pro";
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

export const PRO_FEATURES = [
  "Unlimited branches",
  "Unlimited products",
  "Unlimited staff accounts",
  "Full analytics & advanced reports",
  "AI business assistant",
  "Customer management & loyalty",
  "Expense tracking",
  "Shift management",
  "Appointments & scheduling",
  "Inventory (suppliers & purchase orders)",
  "Memberships",
  "Time clock",
  "Discount codes",
  "Tables & kitchen display",
];

export const FREE_LIMITS = {
  branches: 1,
  products: 30,
  staff: 3,
};

export function useSubscription() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery<TenantSubscription>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
  });

  const plan: SubscriptionPlan = data?.plan ?? "free";
  const isPro = plan === "pro" && data?.status === "active";
  const isFree = !isPro;

  return {
    subscription: data ?? { plan: "free" as SubscriptionPlan, status: "active" },
    isPro,
    isFree,
    isLoading,
    refetch,
  };
}
