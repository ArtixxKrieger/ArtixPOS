import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { getBusinessFeatures, type BusinessTerminology } from "@/lib/business-features";

export function useBranchBusiness(): {
  businessType: string | null;
  businessSubType: string | null;
  showBarcode: boolean;
} {
  const { user } = useAuth();
  const { data: settings } = useSettings();

  const branchType = user?.activeBranch?.businessType ?? null;
  const branchSub = user?.activeBranch?.businessSubType ?? null;

  const effectiveType = branchType ?? (settings as any)?.businessType ?? null;
  const effectiveSub = branchSub ?? (settings as any)?.businessSubType ?? null;

  const features = getBusinessFeatures(effectiveType, effectiveSub);

  return {
    businessType: effectiveType,
    businessSubType: effectiveSub,
    showBarcode: features.showBarcode,
  };
}

export function useBusinessTerminology(): BusinessTerminology {
  const { businessType, businessSubType } = useBranchBusiness();
  return getBusinessFeatures(businessType, businessSubType).terminology;
}
