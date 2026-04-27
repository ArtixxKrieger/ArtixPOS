import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";

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
} {
  const { user } = useAuth();
  const { data: settings } = useSettings();

  const branchType = user?.activeBranch?.businessType ?? null;
  const branchSub = user?.activeBranch?.businessSubType ?? null;

  if (branchType) {
    return { businessType: branchType, businessSubType: branchSub };
  }

  return {
    businessType: (settings as any)?.businessType ?? null,
    businessSubType: (settings as any)?.businessSubType ?? null,
  };
}
