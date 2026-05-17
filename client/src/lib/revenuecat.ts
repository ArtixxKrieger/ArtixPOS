import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const RC_ENTITLEMENT_ID = "pro";

const TEST_KEY = import.meta.env.VITE_REVENUECAT_TEST_API_KEY ?? "";
const IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY ?? "";
const ANDROID_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY ?? "";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function getApiKey(): string {
  const platform = Capacitor.getPlatform();
  if (platform === "ios") return IOS_KEY || TEST_KEY;
  if (platform === "android") return ANDROID_KEY || TEST_KEY;
  return TEST_KEY;
}

let _initialized = false;

export async function initRevenueCat(tenantId: string): Promise<void> {
  if (!isNative()) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[revenuecat] No API key configured — skipping init");
    return;
  }
  if (_initialized) {
    await Purchases.setAttributes({ tenantId });
    return;
  }
  await Purchases.configure({ apiKey, appUserID: tenantId });
  _initialized = true;
  console.log("[revenuecat] Configured for platform:", Capacitor.getPlatform());
}

export async function getCustomerInfo() {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

export async function getOfferings() {
  if (!isNative()) return null;
  const { offerings } = await Purchases.getOfferings();
  return offerings;
}

export async function restorePurchases() {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export function useRevenueCat(tenantId?: string) {
  const qc = useQueryClient();
  const [rcReady, setRcReady] = useState(false);

  useEffect(() => {
    if (!tenantId || !isNative()) return;
    initRevenueCat(tenantId)
      .then(() => setRcReady(true))
      .catch((e) => console.error("[revenuecat] init error:", e));
  }, [tenantId]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info", tenantId],
    queryFn: () => getCustomerInfo(),
    enabled: rcReady && isNative(),
    staleTime: 60_000,
    retry: false,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => getOfferings(),
    enabled: rcReady && isNative(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: any) => {
      const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
      return customerInfo;
    },
    onSuccess: () => {
      customerInfoQuery.refetch();
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/subscription"] });
      }, 3000);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const { customerInfo } = await Purchases.restorePurchases();
      return customerInfo;
    },
    onSuccess: () => {
      customerInfoQuery.refetch();
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["/api/subscription"] });
      }, 3000);
    },
  });

  const customerInfo = customerInfoQuery.data;
  const offerings = offeringsQuery.data;
  const rcIsPro =
    !!customerInfo?.entitlements?.active?.[RC_ENTITLEMENT_ID];

  const monthlyPackage =
    offerings?.current?.availablePackages?.find(
      (p: any) => p.packageType === "MONTHLY"
    ) ?? offerings?.current?.availablePackages?.[0] ?? null;

  return {
    rcReady,
    isNative: isNative(),
    customerInfo,
    offerings,
    rcIsPro,
    monthlyPackage,
    isLoadingCustomerInfo: customerInfoQuery.isLoading,
    isLoadingOfferings: offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    purchaseError: purchaseMutation.error,
    restore: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
    refetchCustomerInfo: customerInfoQuery.refetch,
  };
}
