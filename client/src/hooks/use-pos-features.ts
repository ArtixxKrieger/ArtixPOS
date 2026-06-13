import { useSettings, useUpdateSettings } from "./use-settings";
import { useSubscription } from "./use-subscription";
import type { PosFeatures } from "@shared/schema";
import { PRO_POS_FEATURE_KEYS, DEFAULT_POS_FEATURES } from "@shared/schema";

export { PRO_POS_FEATURE_KEYS, DEFAULT_POS_FEATURES };
export type { PosFeatures };

export function usePosFeatures() {
  const { data: settings, isLoading } = useSettings();
  const { isPro, isLoading: subLoading } = useSubscription();
  const updateSettings = useUpdateSettings();

  const raw = (settings as any)?.posFeatures as PosFeatures | null | undefined;
  const features: PosFeatures | null = raw ?? null;
  const isSetup = features?.setupComplete === true;

  async function saveFeatures(patch: Partial<PosFeatures>) {
    const current: PosFeatures = features ?? { ...DEFAULT_POS_FEATURES };
    const updated: PosFeatures = { ...current, ...patch };

    if (!isPro) {
      for (const k of PRO_POS_FEATURE_KEYS) updated[k] = false;
    }
    await updateSettings.mutateAsync({ posFeatures: updated } as any);
  }

  return {
    features,
    isSetup,
    isLoading: isLoading || subLoading,
    isPro,
    saveFeatures,
    isSaving: updateSettings.isPending,
  };
}
