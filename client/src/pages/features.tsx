import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ShoppingBag, Truck, ScanLine, Receipt, UserCheck,
  LayoutGrid, ChefHat, SplitSquareHorizontal, Star,
  ChevronLeft, Lock, Zap, Check, ArrowRight,
} from "lucide-react";
import { usePosFeatures } from "@/hooks/use-pos-features";
import { useSettings } from "@/hooks/use-settings";
import type { PosFeatures } from "@shared/schema";
import { DEFAULT_POS_FEATURES } from "@shared/schema";

type FeatureDef = {
  key: keyof PosFeatures;
  icon: React.ElementType;
  title: string;
  description: string;
  isPro: boolean;
  color: string;
};

const FREE_FEATURES: FeatureDef[] = [
  {
    key: "takeout",
    icon: ShoppingBag,
    title: "Takeout / To-Go",
    description: "Customers can place orders to take away. Adds a Takeout option at checkout.",
    isPro: false,
    color: "bg-sky-500/15 text-sky-500",
  },
  {
    key: "delivery",
    icon: Truck,
    title: "Delivery Orders",
    description: "Accept delivery orders with an address field. Adds a Delivery option at checkout.",
    isPro: false,
    color: "bg-orange-500/15 text-orange-500",
  },
  {
    key: "barcodeScanning",
    icon: ScanLine,
    title: "Barcode Scanner",
    description: "Scan product barcodes to instantly add items to the cart.",
    isPro: false,
    color: "bg-violet-500/15 text-violet-500",
  },
  {
    key: "receiptName",
    icon: Receipt,
    title: "Name on Receipt",
    description: "Ask for a customer name on each order (Starbucks-style). Great for cafés.",
    isPro: false,
    color: "bg-amber-500/15 text-amber-500",
  },
  {
    key: "customerAccounts",
    icon: UserCheck,
    title: "Customer Accounts",
    description: "Link sales to customer profiles for order history and tracking.",
    isPro: false,
    color: "bg-emerald-500/15 text-emerald-500",
  },
];

const PRO_FEATURES: FeatureDef[] = [
  {
    key: "tables",
    icon: LayoutGrid,
    title: "Tables & Floor Map",
    description: "Manage seating, assign orders to tables, and see your floor at a glance.",
    isPro: true,
    color: "bg-blue-500/15 text-blue-500",
  },
  {
    key: "kitchenDisplay",
    icon: ChefHat,
    title: "Kitchen / Bar Display",
    description: "Send orders directly to a kitchen or bar screen as soon as they're placed.",
    isPro: true,
    color: "bg-red-500/15 text-red-500",
  },
  {
    key: "splitBill",
    icon: SplitSquareHorizontal,
    title: "Split Bill",
    description: "Split a bill evenly or by item between multiple guests at a table.",
    isPro: true,
    color: "bg-teal-500/15 text-teal-500",
  },
  {
    key: "loyalty",
    icon: Star,
    title: "Loyalty Points",
    description: "Customers earn points on purchases and redeem them for discounts.",
    isPro: true,
    color: "bg-yellow-500/15 text-yellow-500",
  },
];

function getDefaultsForBusinessType(
  businessType?: string | null,
  businessSubType?: string | null,
): Partial<PosFeatures> {
  if (businessType === "food_beverage") {
    switch (businessSubType) {
      case "restaurant": return { takeout: true, delivery: true, customerAccounts: true, tables: true, kitchenDisplay: true, splitBill: true };
      case "bar":        return { takeout: true, customerAccounts: true, tables: true, splitBill: true };
      case "cafe":       return { takeout: true, receiptName: true, barcodeScanning: false };
      case "bakery":     return { takeout: true, delivery: true, barcodeScanning: false };
      case "food_truck": return { takeout: true, delivery: true, receiptName: true };
      default:           return { takeout: true };
    }
  }
  if (businessType === "retail") return { barcodeScanning: true, customerAccounts: true, loyalty: true };
  if (businessType === "services") return { customerAccounts: true };
  return { takeout: true, barcodeScanning: true, customerAccounts: true };
}

function FeatureCard({
  def, enabled, onToggle, locked,
}: {
  def: FeatureDef;
  enabled: boolean;
  onToggle: (key: keyof PosFeatures, val: boolean) => void;
  locked: boolean;
}) {
  const Icon = def.icon;
  return (
    <div
      onClick={() => !locked && onToggle(def.key, !enabled)}
      className={`relative flex items-start gap-3.5 p-4 rounded-2xl border transition-all duration-150 select-none ${
        locked
          ? "opacity-60 cursor-default border-border/20 bg-card"
          : enabled
          ? "cursor-pointer border-primary/35 bg-primary/5 shadow-sm"
          : "cursor-pointer border-border/25 bg-card hover:border-border/50"
      }`}
    >
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${def.color}`}>
        <Icon className="h-4.5 w-4.5" size={18} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold leading-tight">{def.title}</p>
          {def.isPro && (
            <span className="text-[9px] font-bold bg-violet-500/15 text-violet-500 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Zap size={8} /> PRO
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{def.description}</p>
      </div>
      <div className="shrink-0 mt-0.5">
        {locked ? (
          <Lock size={15} className="text-muted-foreground/50" />
        ) : (
          <div className={`w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 ${enabled ? "bg-primary" : "bg-muted/60 border border-border/40"}`}
            style={{ height: 22, width: 40 }}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? "translate-x-[18px]" : "translate-x-0"}`} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeaturesPage() {
  const [, setLocation] = useLocation();
  const { features, isSetup, isLoading, isPro, saveFeatures, isSaving } = usePosFeatures();
  const { data: settings } = useSettings();

  const isSetupMode = new URLSearchParams(window.location.search).get("setup") === "1";

const [draft, setDraft] = useState<PosFeatures>(() => {
    if (features) return { ...features };
    const btDefaults = getDefaultsForBusinessType(
      (settings as any)?.businessType,
      (settings as any)?.businessSubType,
    );
    return { ...DEFAULT_POS_FEATURES, ...btDefaults };
  });

const draftInitialized = useRef(false);

  useEffect(() => {
    if (features) {

      setDraft({ ...features });
      draftInitialized.current = true;
    } else if (settings && !features && !draftInitialized.current) {

      const btDefaults = getDefaultsForBusinessType(
        (settings as any)?.businessType,
        (settings as any)?.businessSubType,
      );
      setDraft({ ...DEFAULT_POS_FEATURES, ...btDefaults });
      draftInitialized.current = true;
    }
  }, [features, settings]);

  function toggle(key: keyof PosFeatures, val: boolean) {
    setDraft(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    try {
      await saveFeatures({ ...draft, setupComplete: true });
    } catch {

}
    if (isSetupMode) {
      setLocation("/pos");
    }
  }

  function handleSkip() {
    const btDefaults = getDefaultsForBusinessType(
      (settings as any)?.businessType,
      (settings as any)?.businessSubType,
    );

    saveFeatures({ ...DEFAULT_POS_FEATURES, ...btDefaults, setupComplete: true }).catch(() => {});
    setLocation("/pos");
  }

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-background pb-40">
      {}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/30 px-4 py-3 flex items-center gap-3">
        {!isSetupMode ? (
          <button
            onClick={() => setLocation("/settings")}
            className="h-8 w-8 rounded-xl flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft size={18} className="text-muted-foreground" />
          </button>
        ) : (
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap size={16} className="text-primary" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-[15px] font-bold leading-tight">
            {isSetupMode ? "Set up your POS" : "POS Features"}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {isSetupMode
              ? "Choose what you need — you can change this anytime in Settings."
              : "Turn features on or off. Changes apply immediately."}
          </p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-6 max-w-xl mx-auto">

        {}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Check size={14} className="text-emerald-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Free — always included
            </span>
          </div>
          <div className="space-y-2.5">
            {FREE_FEATURES.map(def => (
              <FeatureCard
                key={def.key}
                def={def}
                enabled={draft[def.key] as boolean}
                onToggle={toggle}
                locked={false}
              />
            ))}
          </div>
        </section>

        {}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={14} className="text-violet-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Pro — unlock with subscription
            </span>
          </div>
          {!isPro && (
            <button
              onClick={() => setLocation("/billing?reason=pro_required")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 mb-3 hover:from-violet-500/15 hover:to-fuchsia-500/15 transition-colors text-left"
            >
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                <Zap size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold">Upgrade to Pro to unlock all features</p>
                <p className="text-[11px] text-muted-foreground">Tables, kitchen display, split bill, loyalty &amp; more</p>
              </div>
              <ArrowRight size={15} className="text-muted-foreground/50 shrink-0" />
            </button>
          )}
          <div className="space-y-2.5">
            {PRO_FEATURES.map(def => (
              <FeatureCard
                key={def.key}
                def={def}
                enabled={draft[def.key] as boolean}
                onToggle={toggle}
                locked={!isPro}
              />
            ))}
          </div>
        </section>
      </div>

      {}
      {

}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div
          className="bg-background/95 backdrop-blur border-t border-border/30 px-4 pt-3 flex gap-2 max-w-xl mx-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          {isSetupMode && !isSetup && (
            <button
              onClick={handleSkip}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl text-sm font-medium border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 rounded-2xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <span className="inline-block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : isSetupMode ? (
              <>Save &amp; Open POS <ArrowRight size={15} /></>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
