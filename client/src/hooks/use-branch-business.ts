import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { getBusinessFeatures, type BusinessTerminology } from "@/lib/business-features";

/**
 * Returns the businessType / businessSubType for the user's currently active
 * branch. Each branch carries its own business type so that a single tenant
 * can run, e.g. a cafe and a salon at the same time and have the navigation,
 * terminology, and quick actions adapt as they switch between branches.
 *
 * Falls back to the tenant-wide settings when no active branch is set yet
 * (e.g. brand-new accounts that haven't completed onboarding).
 */
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

/**
 * Convenience hook that returns the full BusinessTerminology object for the
 * active branch. Use this in any component that needs business-specific labels.
 *
 * Example:
 *   const { posAction, productPlural, cartLabel } = useBusinessTerminology();
 */
export function useBusinessTerminology(): BusinessTerminology {
  const { businessType, businessSubType } = useBranchBusiness();
  return getBusinessFeatures(businessType, businessSubType).terminology;
}
